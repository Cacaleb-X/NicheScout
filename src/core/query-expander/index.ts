import type { SearchInput, SearchQuery } from "../../models/types.ts";
import { unique } from "../../utils/text.ts";

const conceptMap: Record<string, string[]> = {
  哈利波特: ["魔法主题", "霍格沃茨", "Harry Potter", "9¾", "魔法酒馆", "分院帽"],
  魔法: ["哈利波特", "霍格沃茨", "魔法酒馆", "沉浸式魔法"],
  日式: ["日系", "日式精致", "Japanese style"],
  塔罗: ["占星", "神秘学", "塔罗牌"],
  宠物友好: ["萌宠", "可带宠物", "pet friendly"],
  二次元: ["动漫主题", "ACG", "谷子店"],
  沉浸式: ["主题体验", "场景体验", "打卡"],
};

export class QueryExpander {
  expand(input: SearchInput): SearchQuery[] {
    const location = [input.city, input.district].filter(Boolean).join(" ");
    const rawTerms = input.niche.flatMap((term) => term.split(/[,，/、|]+/)).map((term) => term.trim()).filter(Boolean);
    const related = rawTerms.flatMap((term) => Object.entries(conceptMap)
      .filter(([key]) => term.includes(key) || key.includes(term))
      .flatMap(([, values]) => values));
    const terms = unique([...rawTerms, ...related]).slice(0, 12);
    const generated = terms.flatMap((term) => [
      { text: `${location} ${term} ${input.category}`, reason: `细分词：${term}` },
      { text: `${location} ${term} 打卡`, reason: `UGC发现：${term}` },
    ]);
    generated.push({ text: `${location} ${input.category} 主题店`, reason: "行业主题补充" });
    return unique(generated.map((query) => JSON.stringify(query))).map((item) => JSON.parse(item) as SearchQuery).slice(0, 20);
  }
}

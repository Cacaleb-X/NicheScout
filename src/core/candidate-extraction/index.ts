import type { SearchInput, SocialPost, StoreCandidate } from "../../models/types.ts";
import { normalizeText } from "../../utils/text.ts";

const BUSINESS_TERMS = /(酒吧|酒馆|清吧|bar|pub|美甲|nail|工作室|studio|店|馆|社|屋|空间|俱乐部|club)$/i;
const AUTHOR_NOISE = /(探店|吃喝|攻略|地图|指南|日常|生活|分享|测评|推荐|小红薯|本地宝)/i;
const GENERIC_ONLY = /^(长沙|酒吧|小酒吧|美甲|日式美甲|日系|魔法主题|哈利波特主题|哈利波特|霍格沃茨|斯莱特林|血染钟楼|主题店|打卡|探店)$/i;
const NON_ENTITY_CONTEXT = /(准备开|计划开|想开|开一家|招募|招聘|避雷|转让|求推荐|求问|盘点)/i;
const DESCRIPTIVE_PHRASE = /(唯一想|想推荐|推荐的|什么体验|毕业|价格做|第一次做|在.+做美甲|开美甲工作室)/i;

function cleanName(value: string, input: SearchInput): string | undefined {
  if (NON_ENTITY_CONTEXT.test(value) || DESCRIPTIVE_PHRASE.test(value) || /\n|\d{2}-\d{2}|\d+天前|\d{4}-\d{2}-\d{2}|\s赞$/.test(value)) return undefined;
  let name = value
    .replace(/[^\p{L}\p{N}¾（()）·&+'’｜|:：—–\-\s]/gu, "")
    .replace(/^[#@\s·•｜|:：—–-]+|[#@\s·•｜|:：—–-]+$/g, "")
    .replace(/[（(](?:长沙|长沙市|推荐|探店|打卡)[）)]/g, "")
    .replace(/^(?:长沙|长沙市)?(?:宝藏|隐藏|新开|首家|超火|必去|推荐|探店|打卡|酒鬼地图|美甲分享|今日份美甲)+/g, "")
    .replace(/(?:探店|打卡|分享|推荐|测评)$/g, "")
    .trim();
  if (name.includes("——")) name = name.split("——").at(-1)!.trim();
  if (name.includes("｜")) name = name.split("｜").at(-1)!.trim();
  if (name.includes("|")) name = name.split("|").at(-1)!.trim();
  if (/^[^-]+-[^-]+$/.test(name)) name = name.split("-").at(-1)!.trim();
  name = name.replace(new RegExp(`^${input.city}(?:市)?`), "").trim();
  name = name.replace(/[，。！？!?,；;].*$/g, "").trim();
  const normalized = normalizeText(name);
  if (!normalized || normalized.length < 2 || name.length > 32 || GENERIC_ONLY.test(name)) return undefined;
  if (normalizeText(input.city) === normalized || normalizeText(input.category) === normalized) return undefined;
  if (/^(一家|这家|首家|终于|真的|谁懂|可以|值得|隐藏|小众|竟然|误入|的|我|在)/.test(name)) return undefined;
  if (/^(?:哈利波特|魔法|日式|日系).*(?:主题)?(?:酒吧|酒馆|bar|美甲|美甲店)$/i.test(name)) return undefined;
  return name;
}

function titleCandidates(text: string): string[] {
  const results: string[] = [];
  for (const match of text.matchAll(/[“「『【《]([^\n”」』】》]{2,32})[”」』】》]/g)) results.push(match[1]);
  for (const pattern of [
    /(?:叫|名为|名字叫)\s*[“「『]?([^\n”」』，。！？!?,；;]{2,24})/g,
    /(?:探店|打卡|推荐)\s*[｜|:：—–-]+\s*([^\n，。！？!?,；;]{2,28})/g,
    /——\s*([^\n，。！？!?,；;]{2,28})/g,
    /这家\s*([^\n，。！？!?,；;吗呢呀]{2,20})(?:吗|呢|呀|[！!。])/g,
  ]) for (const match of text.matchAll(pattern)) results.push(match[1]);
  for (const match of text.matchAll(/([A-Za-z0-9\p{Script=Han}·&+'’]{2,24}(?:酒吧|酒馆|清吧|美甲店|美甲工作室|nail|studio|bar|pub|club))/giu)) results.push(match[1]);
  const firstClause = text.split(/[，。！？!?,；;]/)[0]?.trim();
  if (firstClause && /[｜|—–-]/.test(firstClause)) results.push(firstClause);
  return results;
}

export class StoreCandidateExtractor {
  extract(posts: SocialPost[], input: SearchInput): StoreCandidate[] {
    const candidates: StoreCandidate[] = [];
    for (const post of posts) {
      const seen = new Set<string>();
      if (NON_ENTITY_CONTEXT.test(post.title)) continue;
      for (const raw of titleCandidates(post.title)) {
        const candidateName = cleanName(raw, input);
        if (!candidateName || seen.has(normalizeText(candidateName))) continue;
        seen.add(normalizeText(candidateName));
        candidates.push({
          candidateName, city: input.city, category: input.category, nicheQuery: input.niche.join(" / "),
          confidence: 0.72,
          evidence: [{ text: post.title, kind: "TITLE" }, ...(post.body ? [{ text: post.body, kind: "SNIPPET" as const }] : [])],
          sourceNoteId: post.externalId, sourceNoteUrl: post.sourceUrl, sourceAuthor: post.authorName,
          sourceNoteIds: [post.externalId], sourceNoteUrls: post.sourceUrl ? [post.sourceUrl] : [], sourceAuthors: [post.authorName],
          extractionMethod: "RULE_BASED",
        });
      }
      const authorName = cleanName(post.authorName, input);
      if (authorName && BUSINESS_TERMS.test(authorName) && !AUTHOR_NOISE.test(authorName) && !seen.has(normalizeText(authorName))) {
        candidates.push({
          candidateName: authorName, city: input.city, category: input.category, nicheQuery: input.niche.join(" / "), confidence: 0.55,
          evidence: [{ text: `搜索卡片作者名仅作商家账号线索：${post.authorName}`, kind: "AUTHOR_BUSINESS_HINT" }],
          sourceNoteId: post.externalId, sourceNoteUrl: post.sourceUrl, sourceAuthor: post.authorName, extractionMethod: "RULE_BASED",
          sourceNoteIds: [post.externalId], sourceNoteUrls: post.sourceUrl ? [post.sourceUrl] : [], sourceAuthors: [post.authorName],
        });
      }
    }
    const unique = new Map<string, StoreCandidate>();
    for (const candidate of candidates) {
      const key = normalizeText(candidate.candidateName);
      const existing = unique.get(key);
      if (!existing) {
        unique.set(key, candidate);
        continue;
      }
      existing.confidence = Math.max(existing.confidence, candidate.confidence);
      existing.evidence = [...existing.evidence, ...candidate.evidence].filter((item, index, all) => all.findIndex((other) => other.kind === item.kind && other.text === item.text) === index);
      existing.sourceNoteIds = [...new Set([...(existing.sourceNoteIds || [existing.sourceNoteId]), ...(candidate.sourceNoteIds || [candidate.sourceNoteId])])];
      existing.sourceNoteUrls = [...new Set([...(existing.sourceNoteUrls || []), ...(candidate.sourceNoteUrls || [])])];
      existing.sourceAuthors = [...new Set([...(existing.sourceAuthors || []), ...(candidate.sourceAuthors || [])])];
    }
    return [...unique.values()];
  }
}

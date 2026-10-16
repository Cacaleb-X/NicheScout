import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { SearchInput } from "../models/types.ts";
import { MockBusinessAdapter, MockSocialAdapter } from "../adapters/mock/index.ts";
import { ManualImportAdapter } from "../adapters/manual/index.ts";
import { ScoutPipeline } from "../core/pipeline.ts";

export function valueOf(args: string[], name: string): string | undefined {
  const equals = args.find((arg) => arg.startsWith(`${name}=`));
  if (equals) return equals.slice(name.length + 1);
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

export function split(value?: string): string[] {
  return (value ?? "").split(/[,，、|]+/).map((item) => item.trim()).filter(Boolean);
}

export function parseArgs(args: string[]): SearchInput {
  if (args.includes("--help") || args.includes("-h")) {
    console.log(`NicheScout\n\nUsage:\n  npm run scout -- --city 长沙 --category 酒吧 --niche 哈利波特主题,魔法主题 --limit 50\n\nOptions:\n  --district 区域（可选）\n  --exclude 排除词，逗号分隔（可选）\n  --manual JSON文件（可选，会与Mock结果合并）\n  --output XLSX输出路径（可选）`);
    process.exit(0);
  }
  const city = valueOf(args, "--city")?.trim();
  const category = valueOf(args, "--category")?.trim();
  const niche = split(valueOf(args, "--niche"));
  const rawLimit = Number(valueOf(args, "--limit") ?? 50);
  if (!city || !category || !niche.length) throw new Error("必须提供 --city、--category 和 --niche");
  if (!Number.isInteger(rawLimit) || rawLimit < 1 || rawLimit > 1000) throw new Error("--limit 必须是 1 到 1000 的整数");
  const district = valueOf(args, "--district")?.trim();
  const manualFile = valueOf(args, "--manual")?.trim();
  if (manualFile && !existsSync(manualFile)) throw new Error(`Manual文件不存在：${manualFile}`);
  const output = valueOf(args, "--output") || `outputs/${city}_${category}_${Date.now()}.xlsx`;
  return { city, district, category, niche, limit: rawLimit, excludeKeywords: split(valueOf(args, "--exclude")), output, manualFile };
}

async function main() {
  const input = parseArgs(process.argv.slice(2));
  const businessAdapters = [new MockBusinessAdapter()];
  if (input.manualFile) businessAdapters.push(new ManualImportAdapter(resolve(input.manualFile)));
  console.log("NicheScout 开始寻找公开商家线索…");
  const result = await new ScoutPipeline(businessAdapters, [new MockSocialAdapter()]).run(input);
  console.log(`搜索词：${result.queries.length}`);
  console.log(`发现候选记录：${result.candidatesFound}`);
  console.log(`去重后商家：${result.deduplicatedCount}`);
  console.log(`输出商家：${result.stores.length}`);
  console.log(`找到公开电话：${result.phoneCount}`);
  console.log(`找到官方/疑似官方小红书账号：${result.xhsAccountCount}`);
  console.log(`Excel：${result.outputPath}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => { console.error(`任务失败：${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1; });
}

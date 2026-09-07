import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { DianpingExperimentalAdapter } from "../adapters/dianping/experimental/index.ts";
import { XiaohongshuExperimentalAdapter } from "../adapters/xiaohongshu/experimental/index.ts";
import { closeRetainedExperimentalContexts, retainedExperimentalContextCount, spikeDebugSlug } from "../adapters/experimental/browser.ts";
import { parseSpikeOptions, validateSpikeOptions } from "./options.ts";

const outputDir = resolve("outputs/real-data-spike");
const platform = process.argv[2];
const options = parseSpikeOptions(process.argv.slice(3));
validateSpikeOptions(options);

if (options.headed) {
  process.env.SPIKE_HEADLESS = "0";
  process.env.SPIKE_KEEP_OPEN = "1";
}

async function save(name: string, value: unknown): Promise<void> {
  await mkdir(outputDir, { recursive: true });
  const path = resolve(outputDir, name);
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  console.log(path);
}

function outputName(platformName: "dianping" | "xiaohongshu", query: string): string {
  const known = new Map([
    ["dianping:长沙 酒吧", "dianping_changsha_bars.json"],
    ["dianping:长沙 哈利波特 酒吧", "dianping_changsha_harry_potter_bars.json"],
    ["xiaohongshu:长沙 哈利波特 酒吧", "xiaohongshu_harry_potter_bars.json"],
    ["xiaohongshu:长沙 日式美甲", "xiaohongshu_japanese_nails.json"],
  ]);
  return known.get(`${platformName}:${query}`) || `${spikeDebugSlug(platformName, query)}.json`;
}

export async function runDianping(query?: string): Promise<void> {
  const queries = query ? [query] : ["长沙 酒吧", "长沙 哈利波特 酒吧"];
  for (const item of queries) {
    const result = await new DianpingExperimentalAdapter(5).spike(item);
    await save(outputName("dianping", item), result);
  }
}

export async function runXiaohongshu(query?: string): Promise<void> {
  const queries = query ? [query] : ["长沙 哈利波特 酒吧", "长沙 日式美甲"];
  for (const item of queries) {
    const result = await new XiaohongshuExperimentalAdapter(5).spike(item);
    await save(outputName("xiaohongshu", item), result);
  }
}

try {
  if (platform === "dianping") await runDianping(options.query);
  else if (platform === "xhs") await runXiaohongshu(options.query);
  else if (platform === "all") { await runDianping(options.query); await runXiaohongshu(options.query); }
  else throw new Error("Usage: run.ts dianping|xhs|all [--headed] [--query \"search terms\"]");
} finally {
  if (options.headed && retainedExperimentalContextCount() > 0) {
    const prompt = createInterface({ input: process.stdin, output: process.stdout });
    await prompt.question("[HEADED_INSPECTION] Browser remains open. Press Enter to close it and finish. ");
    prompt.close();
    await closeRetainedExperimentalContexts();
  }
}

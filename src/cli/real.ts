import { AmapAdapter } from "../adapters/amap/index.ts";
import { XiaohongshuSearchCardAdapter } from "../adapters/xiaohongshu/index.ts";
import { loadLocalEnv } from "../config/env.ts";
import { RealScoutPipeline } from "../core/real-pipeline.ts";
import { parseArgs } from "./index.ts";

async function main() {
  loadLocalEnv();
  const input = parseArgs(process.argv.slice(2));
  console.log("NicheScout Real 开始：XHS 搜索卡片 → StoreCandidate → AMap POI Search 2.0…");
  const amap = new AmapAdapter({ maxResults: input.limit });
  if (!amap.isConfigured()) {
    console.log("AMap provider skipped: AMAP_WEB_SERVICE_KEY is not configured. No external request was made.");
    return;
  }
  console.log("AMap provider：已配置，仅用于 Store Candidate 验证");
  const xhs = new XiaohongshuSearchCardAdapter(Math.min(30, Math.max(input.limit, 10)));
  const result = await new RealScoutPipeline(amap, xhs).run(input);
  const { stats } = result;
  console.log(`XHS cards: ${stats.xhsCards}`);
  console.log(`Store candidates: ${stats.storeCandidates}`);
  console.log(`AMap verification attempts: ${stats.amapVerificationAttempts}`);
  console.log(`AMap verified stores: ${stats.amapMatchedStores}`);
  console.log(`Match rate: ${(stats.matchRate * 100).toFixed(1)}%`);
  console.log(`Address coverage: ${(stats.addressCoverageRate * 100).toFixed(1)}%`);
  console.log(`District coverage: ${(stats.districtCoverageRate * 100).toFixed(1)}%`);
  console.log(`Stores with public tel: ${stats.storesWithPhone}`);
  console.log(`Phone coverage rate: ${(stats.phoneCoverageRate * 100).toFixed(1)}%`);
  console.log(`Ambiguous matches: ${stats.ambiguousMatches}`);
  console.log(`Not found: ${stats.notFound}`);
  console.log(`NEEDS_REVIEW: ${stats.needsReviewCount}`);
  console.log(`Excel: ${result.outputPath}`);
}

main().catch((error) => { console.error(`真实任务失败：${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1; });

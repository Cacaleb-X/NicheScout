import { AmapAdapter } from "../adapters/amap/index.ts";
import { loadLocalEnv } from "../config/env.ts";

loadLocalEnv();
const adapter = new AmapAdapter();
if (!adapter.isConfigured()) {
  console.log("AMap provider skipped: AMAP_WEB_SERVICE_KEY is not configured. Mock demo and tests remain available.");
  process.exit(0);
}
adapter.testConnection().then((record) => {
  if (!record) throw new Error("高德 API 连接成功，但未返回测试 POI");
  console.log(`AMap API OK: ${record.storeName} | ${record.city} | ${record.externalId} | phone=${record.publicPhone ? "yes" : "no"}`);
}).catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });

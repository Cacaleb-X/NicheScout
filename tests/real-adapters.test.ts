import test from "node:test";
import assert from "node:assert/strict";
import { AmapAdapter, AmapConfigurationError, mapAmapPoi } from "../src/adapters/amap/index.ts";
import { StoreCandidateExtractor } from "../src/core/candidate-extraction/index.ts";
import { StoreMatcher } from "../src/core/store-matcher/index.ts";
import type { SearchInput, SocialPost } from "../src/models/types.ts";
import { RealScoutPipeline } from "../src/core/real-pipeline.ts";
import { XiaohongshuSearchCardAdapter } from "../src/adapters/xiaohongshu/index.ts";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import ExcelJS from "exceljs";

const input: SearchInput = { city: "长沙", category: "酒吧", niche: ["哈利波特主题", "魔法主题"], limit: 20, excludeKeywords: [], output: "unused.xlsx" };

test("Amap mapping retains POI business fields and phone provenance inputs", () => {
  const record = mapAmapPoi({
    id: "B001", name: "麻瓜的客厅(五一广场店)", alias: "麻瓜客厅", cityname: "长沙市", adname: "芙蓉区",
    address: "解放西路1号", location: "112.981,28.195", type: "餐饮服务;酒吧", typecode: "050500", adcode: "430102",
    business: { business_area: "五一广场", tel: "0731-12345678", rating: "4.6", cost: "88" },
  }, "长沙");
  assert.equal(record?.externalId, "B001");
  assert.equal(record?.source, "AMAP");
  assert.equal(record?.publicPhone, "0731-12345678");
  assert.equal(record?.businessArea, "五一广场");
  assert.equal(record?.adcode, "430102");
  assert.equal(record?.longitude, 112.981);
});

test("Amap adapter gives a clear missing-key error without making a request", async () => {
  const adapter = new AmapAdapter({ key: "", fetchImpl: (() => { throw new Error("must not fetch"); }) as typeof fetch });
  assert.equal(adapter.isConfigured(), false);
  await assert.rejects(() => adapter.search("酒吧", "长沙", 1), AmapConfigurationError);
});

test("Amap adapter reports configured status without making a request", () => {
  assert.equal(new AmapAdapter({ key: "test-placeholder" }).isConfigured(), true);
});

test("Xiaohongshu search-card adapter is explicitly experimental", () => {
  assert.match(new XiaohongshuSearchCardAdapter().name, /EXPERIMENTAL/);
});

test("Amap adapter uses v5 official endpoint and maps successful results", async () => {
  let requested = "";
  const adapter = new AmapAdapter({ key: "test-key", fetchImpl: (async (url) => {
    requested = String(url);
    return new Response(JSON.stringify({ status: "1", info: "OK", pois: [{ id: "B1", name: "测试酒吧", cityname: "长沙市", business: { tel: "0731-1" } }] }), { status: 200 });
  }) as typeof fetch });
  const records = await adapter.search("测试酒吧", "长沙", 1);
  assert.match(requested, /^https:\/\/restapi\.amap\.com\/v5\/place\/text\?/);
  assert.match(requested, /show_fields=business/);
  assert.equal(records[0]?.publicPhone, "0731-1");
});

test("Store candidate extraction finds venue names but does not equate ordinary UGC author with store", () => {
  const post: SocialPost = {
    externalId: "n1", source: "XIAOHONGSHU", authorId: "u1", authorName: "小羊今天吃什么", authorType: "UGC",
    title: "酒鬼地图——麻瓜的客厅（长沙）", body: "一家魔法主题小酒馆", hashtags: [], city: "长沙", sourceUrl: "https://www.xiaohongshu.com/explore/n1", rawData: {},
  };
  const candidates = new StoreCandidateExtractor().extract([post], input);
  assert.ok(candidates.some((item) => item.candidateName === "麻瓜的客厅"));
  assert.ok(!candidates.some((item) => item.candidateName === post.authorName));
});

test("Candidate to AMap matcher accepts an exact store name", () => {
  const candidate = new StoreCandidateExtractor().extract([{
    externalId: "n1", source: "XIAOHONGSHU", authorId: "u", authorName: "顾客", authorType: "UGC", title: "推荐｜麻瓜的客厅", body: "", hashtags: [], city: "长沙", rawData: {},
  }], input)[0];
  const matcher = new StoreMatcher();
  const exact = matcher.findForCandidate(candidate, [{ externalId: "p1", source: "AMAP", storeName: "麻瓜的客厅(解放西店)", alias: "麻瓜客厅", city: "长沙市", category: "餐饮服务;酒吧", rawData: {} }]);
  assert.equal(exact.status, "MATCHED");
  assert.equal(exact.record?.externalId, "p1");
});

test("Candidate extraction rejects descriptive nail-post phrases and keeps business-like names", () => {
  const nailInput = { ...input, category: "美甲", niche: ["日式美甲", "日系"] };
  const posts: SocialPost[] = [
    { externalId: "a", source: "XIAOHONGSHU", authorId: "u", authorName: "顾客", authorType: "UGC", title: "观沙岭我唯一想推荐的日式美甲店", body: "", hashtags: [], city: "长沙", rawData: {} },
    { externalId: "b", source: "XIAOHONGSHU", authorId: "v", authorName: "RJNail", authorType: "UGC", title: "今日新款", body: "", hashtags: [], city: "长沙", rawData: {} },
  ];
  const candidates = new StoreCandidateExtractor().extract(posts, nailInput);
  assert.ok(!candidates.some((item) => item.candidateName.includes("唯一想推荐")));
  assert.ok(candidates.some((item) => item.candidateName === "RJNail"));
});

test("Real pipeline links XHS evidence to AMap entity and preserves official phone", async () => {
  const dir = await mkdtemp(join(tmpdir(), "nichescout-real-"));
  const runInput = { ...input, limit: 10, output: join(dir, "real.xlsx") };
  const post: SocialPost = {
    externalId: "n1", source: "XIAOHONGSHU", authorId: "u1", authorName: "普通顾客", authorType: "UGC",
    title: "魔法主题酒鬼地图——麻瓜的客厅（长沙）", body: "魔法主题酒吧", hashtags: [], city: "长沙", sourceUrl: "https://www.xiaohongshu.com/explore/n1", rawData: {},
  };
  const poi = { externalId: "B1", source: "AMAP" as const, storeName: "麻瓜的客厅(解放西店)", city: "长沙", district: "芙蓉区", businessArea: "五一广场", address: "解放西路1号", category: "餐饮服务;酒吧", publicPhone: "0731-12345678", sourceUrl: "https://uri.amap.com/marker", rawData: {} };
  const fakeAmap = {
    searchCandidate: async () => [poi],
  } as unknown as AmapAdapter;
  const fakeXhs = {
    name: "fake",
    search: async () => ({ posts: [post], accounts: [], status: "OK" as const }),
  } as unknown as XiaohongshuSearchCardAdapter;
  const result = await new RealScoutPipeline(fakeAmap, fakeXhs, join(dir, "real.sqlite")).run(runInput);
  assert.equal(result.stats.xhsCards, 1);
  assert.equal(result.stats.amapMatchedStores, 1);
  assert.equal(result.stats.amapVerificationAttempts, 1);
  assert.equal(result.stats.storesWithPhone, 1);
  assert.equal(result.stats.addressCoverageRate, 1);
  assert.equal(result.stats.districtCoverageRate, 1);
  assert.equal(result.verifications[0]?.matchStatus, "MATCHED");
  assert.equal(result.stores[0]?.contacts[0]?.source, "AMAP");
  assert.equal(result.stores[0]?.posts[0]?.externalId, "n1");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(runInput.output);
  const sheet = workbook.getWorksheet("Store Verification");
  assert.ok(sheet);
  assert.equal(sheet.getCell("D4").value, "AMap Match Status");
  assert.equal(sheet.getCell("M4").value, "Phone Source");
  assert.equal(sheet.getCell("L5").value, "0731-12345678");
  assert.deepEqual(sheet.getCell("C5").value, {
    text: "https://www.xiaohongshu.com/explore/n1",
    hyperlink: "https://www.xiaohongshu.com/explore/n1",
  });
  assert.equal(sheet.getTables().length, 1);
  assert.equal(sheet.views[0]?.state, "frozen");
});

test("Real pipeline flags unresolved AMap branches as ambiguous", async () => {
  const dir = await mkdtemp(join(tmpdir(), "nichescout-ambiguous-"));
  const runInput = { ...input, limit: 5, output: join(dir, "ambiguous.xlsx") };
  const post: SocialPost = { externalId: "n1", source: "XIAOHONGSHU", authorId: "u", authorName: "顾客", authorType: "UGC", title: "推荐｜麻瓜的客厅", body: "魔法主题", hashtags: [], city: "长沙", sourceUrl: "https://www.xiaohongshu.com/explore/n1", rawData: {} };
  const records = [
    { externalId: "B1", source: "AMAP" as const, storeName: "麻瓜的客厅(解放西店)", city: "长沙", district: "芙蓉区", address: "解放西路1号", category: "酒吧", rawData: {} },
    { externalId: "B2", source: "AMAP" as const, storeName: "麻瓜的客厅(五一店)", city: "长沙", district: "芙蓉区", address: "五一路2号", category: "酒吧", rawData: {} },
  ];
  const fakeAmap = { searchCandidate: async () => records } as unknown as AmapAdapter;
  const fakeXhs = { name: "fake", search: async () => ({ posts: [post], accounts: [], status: "OK" as const }) } as unknown as XiaohongshuSearchCardAdapter;
  const result = await new RealScoutPipeline(fakeAmap, fakeXhs, join(dir, "ambiguous.sqlite")).run(runInput);
  assert.equal(result.stats.ambiguousMatches, 1);
  assert.equal(result.stats.amapMatchedStores, 0);
  assert.equal(result.stats.needsReviewCount, 1);
  assert.equal(result.verifications[0]?.matchStatus, "AMBIGUOUS");
  assert.match(result.verifications[0]?.notes || "", /多个相近分店/);
});

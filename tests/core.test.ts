import test from "node:test";
import assert from "node:assert/strict";
import { QueryExpander } from "../src/core/query-expander/index.ts";
import { StoreDeduplicator } from "../src/core/deduplication/index.ts";
import { StoreMatcher } from "../src/core/store-matcher/index.ts";
import { detectOfficialAccount } from "../src/core/official-account/index.ts";
import { scoreContact, scoreNiche, scorePriority } from "../src/core/scoring/index.ts";
import type { RawBusinessRecord, SearchInput, SocialAccount, Store } from "../src/models/types.ts";

const input: SearchInput = { city: "长沙", category: "酒吧", niche: ["哈利波特主题", "魔法主题", "沉浸式"], limit: 50, excludeKeywords: [], output: "unused.xlsx" };

function record(overrides: Partial<RawBusinessRecord> = {}): RawBusinessRecord {
  return { externalId: "1", source: "DIANPING", storeName: "9¾魔法酒馆（五一广场店）", brandName: "9¾魔法酒馆", branchName: "五一广场店", city: "长沙", district: "五一广场", address: "五一广场示范路8号", category: "酒吧", description: "哈利波特沉浸式主题", rawData: {}, ...overrides };
}

function store(overrides: Partial<Store> = {}): Store {
  const source = record();
  return { id: "s1", storeName: source.storeName, normalizedName: "9¾魔法酒馆", brandName: source.brandName, branchName: source.branchName, city: source.city, district: source.district, address: source.address, category: source.category, description: source.description, sources: [source], posts: [], accounts: [], contacts: [], evidence: [], matchScore: 0, contactScore: 0, priorityScore: 0, reviewStatus: "UNMATCHED", ...overrides };
}

test("Query Expansion produces semantic and UGC queries", () => {
  const queries = new QueryExpander().expand(input);
  assert.ok(queries.length > input.niche.length);
  assert.ok(queries.some((query) => query.text.includes("霍格沃茨")));
  assert.ok(queries.some((query) => query.text.includes("打卡")));
});

test("Store deduplication merges aliases but keeps different branches", () => {
  const records = [record(), record({ externalId: "2", source: "SEARCH_ENGINE", storeName: "九又四分之三魔法酒馆（五一广场店）" }), record({ externalId: "3", branchName: "梅溪湖店", district: "梅溪湖", address: "梅溪湖路9号", storeName: "9¾魔法酒馆（梅溪湖店）" })];
  const stores = new StoreDeduplicator().deduplicate(records);
  assert.equal(stores.length, 2);
  assert.equal(stores.find((item) => item.branchName === "五一广场店")?.sources.length, 2);
});

test("Store Entity Matching links post alias with confidence", () => {
  const result = new StoreMatcher().findForPost({ externalId: "p", source: "MOCK", authorId: "u", authorName: "顾客", authorType: "UGC", title: "探店", body: "", hashtags: [], mentionedStoreName: "九又四分之三魔法酒馆", city: "长沙", district: "五一广场", rawData: {} }, [store()]);
  assert.equal(result.store?.id, "s1");
  assert.equal(result.status, "MATCHED");
});

test("Store Entity Matching preserves separate branches", () => {
  const first = store({ id: "first", branchName: "五一广场店", storeName: "9¾魔法酒馆（五一广场店）" });
  const second = store({ id: "second", branchName: "梅溪湖店", storeName: "9¾魔法酒馆（梅溪湖店）", district: "梅溪湖" });
  const result = new StoreMatcher().findForAccount({ externalId: "a", source: "MOCK", handle: "@magic", displayName: "魔法酒馆", authorType: "POSSIBLE_OFFICIAL", claimedStoreName: "9¾魔法酒馆（梅溪湖店）", city: "长沙", confidence: 0.8, rawData: {} }, [first, second]);
  assert.equal(result.store?.id, "second");
});

test("Niche Match Score is high for corroborated evidence and handles missing data", () => {
  const target = store({ posts: [{ externalId: "p", source: "MOCK", authorId: "u", authorName: "顾客", authorType: "UGC", title: "长沙哈利波特酒吧", body: "霍格沃茨分院帽场景", hashtags: ["魔法主题"], poi: "9¾魔法酒馆", rawData: {} }] });
  const strong = scoreNiche(target, input);
  const missing = scoreNiche(store({ storeName: "普通清吧", description: undefined, posts: [] }), input);
  assert.ok(strong.score >= 90);
  assert.ok(missing.score >= 0 && missing.score < strong.score);
  assert.ok(strong.evidence.length <= 3);
});

test("Contact and Priority scores follow configured additive rules", () => {
  const target = store({ contacts: [{ type: "PHONE", value: "0731-12345678", source: "DIANPING", confidence: 0.95 }], accounts: [{ externalId: "a", source: "MOCK", handle: "@bar", displayName: "酒馆官方", authorType: "OFFICIAL", confidence: 0.95, lastActive: new Date().toISOString(), rawData: {} }] });
  assert.equal(scoreContact(target), 90);
  assert.equal(scorePriority(100, 50), 80);
});

test("Official Account Detection rejects UGC authors", () => {
  const account: SocialAccount = { externalId: "a", source: "MOCK", handle: "@consumer", displayName: "小羊今天吃什么", bio: "每天探店", authorType: "UGC", claimedStoreName: "9¾魔法酒馆", city: "长沙", confidence: 0.9, rawData: {} };
  const result = detectOfficialAccount(account, store());
  assert.notEqual(result.type, "OFFICIAL");
  assert.notEqual(result.type, "POSSIBLE_OFFICIAL");
});

test("Contact source tracking retains provenance", () => {
  const contact = { type: "PHONE" as const, value: "0731-12345678", source: "DIANPING" as const, sourceUrl: "https://example.com/store", confidence: 0.95 };
  assert.equal(contact.source, "DIANPING");
  assert.ok(contact.sourceUrl.startsWith("https://"));
});

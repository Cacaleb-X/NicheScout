import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import type { Contact, RawBusinessRecord, RealPipelineResult, SearchInput, Store, StoreCandidate, StoreVerificationResult } from "../models/types.ts";
import { AmapAdapter } from "../adapters/amap/index.ts";
import { XiaohongshuSearchCardAdapter } from "../adapters/xiaohongshu/index.ts";
import { StoreCandidateExtractor } from "./candidate-extraction/index.ts";
import { StoreDeduplicator } from "./deduplication/index.ts";
import { QueryExpander } from "./query-expander/index.ts";
import { StoreMatcher } from "./store-matcher/index.ts";
import { scoreContact, scoreNiche, scorePriority } from "./scoring/index.ts";
import { NicheScoutDatabase } from "../database/index.ts";
import { exportStoreVerificationsXlsx } from "../exporters/verification-xlsx.ts";
import { normalizeText } from "../utils/text.ts";

const ACCEPT_THRESHOLD = 0.72;
const REVIEW_THRESHOLD = 0.5;

function branchAmbiguity(candidate: StoreCandidate, ranked: Array<{ record: RawBusinessRecord; score: number }>): boolean {
  const [best, second] = ranked;
  if (!best || !second || best.score - second.score >= 0.12) return false;
  const candidateNamesBranch = /[（(].*店[）)]/.test(candidate.candidateName);
  return !candidateNamesBranch && normalizeText(best.record.storeName) === normalizeText(second.record.storeName)
    && best.record.externalId !== second.record.externalId;
}

export class RealScoutPipeline {
  constructor(
    private readonly amap: AmapAdapter,
    private readonly xhs: XiaohongshuSearchCardAdapter,
    private readonly dbPath = process.env.NICHESCOUT_DB_PATH || "data/nichescout.sqlite",
  ) {}

  async run(input: SearchInput): Promise<RealPipelineResult> {
    const taskId = randomUUID();
    const queries = new QueryExpander().expand(input);
    const context = { input, queries };
    const db = new NicheScoutDatabase(this.dbPath);
    db.startTask(taskId, input, queries);
    try {
      const social = await this.xhs.search(context);
      if (social.status !== "OK" && !social.posts.length) throw new Error(`小红书公开搜索卡片不可用：${social.status}`);
      const candidates = new StoreCandidateExtractor().extract(social.posts, input).slice(0, input.limit);
      const matcher = new StoreMatcher();
      const verifications: StoreVerificationResult[] = [];
      const allAmapRecords: RawBusinessRecord[] = [];

      for (const candidate of candidates) {
        const records = await this.amap.searchCandidate(candidate, 5);
        allAmapRecords.push(...records);
        if (!records.length) {
          verifications.push({ candidate, attempts: 1, matchStatus: "NOT_FOUND", matchConfidence: 0, reviewStatus: "NEEDS_REVIEW", notes: "AMap 未返回候选 POI" });
          continue;
        }
        const ranked = records.map((record) => {
          const result = matcher.findForCandidate(candidate, [record]);
          return { record, score: result.score };
        }).sort((a, b) => b.score - a.score);
        const best = ranked[0];
        const branchRisk = branchAmbiguity(candidate, ranked);
        if (best.score >= ACCEPT_THRESHOLD && !branchRisk) {
          verifications.push({ candidate, attempts: 1, matchStatus: "MATCHED", matchedRecord: best.record, matchConfidence: best.score, reviewStatus: "MATCHED" });
        } else if (best.score >= REVIEW_THRESHOLD || branchRisk) {
          verifications.push({
            candidate, attempts: 1, matchStatus: "AMBIGUOUS", matchedRecord: best.record, matchConfidence: best.score,
            reviewStatus: "NEEDS_REVIEW", notes: branchRisk ? "返回多个相近分店，候选证据不足以确认具体门店" : "名称/区域匹配未达到自动确认阈值",
          });
        } else {
          verifications.push({ candidate, attempts: 1, matchStatus: "NOT_FOUND", matchedRecord: best.score >= 0.35 ? best.record : undefined, matchConfidence: best.score, reviewStatus: "NEEDS_REVIEW", notes: "AMap 返回结果与候选名称相似度过低" });
        }
      }

      const rawRecords = [...new Map(allAmapRecords.map((record) => [record.externalId, record])).values()];
      db.saveRaw(taskId, rawRecords, social.posts, social.accounts);
      const selectedRecords = verifications.flatMap((verification) => verification.matchedRecord ? [verification.matchedRecord] : []);
      let stores = new StoreDeduplicator().deduplicate(selectedRecords);
      for (const verification of verifications) {
        if (!verification.matchedRecord) continue;
        const store = stores.find((item) => item.sources.some((source) => source.externalId === verification.matchedRecord!.externalId));
        if (!store) continue;
        store.entityMatchScore = Math.max(store.entityMatchScore ?? 0, verification.matchConfidence);
        store.reviewStatus = verification.reviewStatus;
        for (const post of social.posts.filter((item) => (verification.candidate.sourceNoteIds || [verification.candidate.sourceNoteId]).includes(item.externalId))) {
          if (!store.posts.some((item) => item.externalId === post.externalId)) store.posts.push(post);
        }
      }
      for (const store of stores) this.enrichStore(store, input);
      stores.sort((a, b) => (b.entityMatchScore ?? 0) - (a.entityMatchScore ?? 0));
      db.saveStores(taskId, stores);
      const outputPath = resolve(input.output);
      await exportStoreVerificationsXlsx(outputPath, verifications, input);
      db.completeTask(taskId);

      const matched = verifications.filter((item) => item.matchStatus === "MATCHED");
      const withAddress = matched.filter((item) => item.matchedRecord?.address).length;
      const withDistrict = matched.filter((item) => item.matchedRecord?.district).length;
      const withPhone = matched.filter((item) => item.matchedRecord?.publicPhone).length;
      const attempts = verifications.reduce((sum, item) => sum + item.attempts, 0);
      const stats = {
        xhsCards: social.posts.length,
        storeCandidates: candidates.length,
        amapVerificationAttempts: attempts,
        amapMatchedStores: matched.length,
        matchRate: attempts ? matched.length / attempts : 0,
        addressCoverageRate: matched.length ? withAddress / matched.length : 0,
        districtCoverageRate: matched.length ? withDistrict / matched.length : 0,
        storesWithPhone: withPhone,
        phoneCoverageRate: matched.length ? withPhone / matched.length : 0,
        ambiguousMatches: verifications.filter((item) => item.matchStatus === "AMBIGUOUS").length,
        notFound: verifications.filter((item) => item.matchStatus === "NOT_FOUND").length,
        needsReviewCount: verifications.filter((item) => item.reviewStatus === "NEEDS_REVIEW").length,
        finalLeadsCount: matched.length,
      };
      return {
        taskId, queries, candidatesFound: candidates.length, deduplicatedCount: stores.length, stores,
        phoneCount: withPhone, xhsAccountCount: 0, outputPath, stats, verifications,
      };
    } finally {
      db.close();
    }
  }

  private enrichStore(store: Store, input: SearchInput): void {
    for (const source of store.sources) {
      if (!source.publicPhone || source.source !== "AMAP") continue;
      const contact: Contact = {
        type: "PHONE", value: source.publicPhone, source: "AMAP", sourceUrl: source.sourceUrl,
        sourcePoiId: source.externalId, confidence: 0.98, discoveredAt: new Date().toISOString(),
      };
      if (!store.contacts.some((existing) => existing.type === contact.type && existing.value === contact.value)) store.contacts.push(contact);
    }
    const niche = scoreNiche(store, input);
    store.matchScore = niche.score;
    store.evidence = [...niche.evidence, ...(store.posts.length ? [`${store.posts.length} 条小红书公开搜索卡片证据`] : [])].slice(0, 4);
    store.contactScore = scoreContact(store);
    store.priorityScore = scorePriority(store.matchScore, store.contactScore);
  }
}

import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import type { BusinessDiscoveryAdapter, Contact, PipelineResult, RawBusinessRecord, SearchInput, SocialSearchAdapter, Store } from "../models/types.ts";
import { QueryExpander } from "./query-expander/index.ts";
import { StoreDeduplicator } from "./deduplication/index.ts";
import { StoreMatcher } from "./store-matcher/index.ts";
import { detectOfficialAccount } from "./official-account/index.ts";
import { scoreContact, scoreNiche, scorePriority } from "./scoring/index.ts";
import { normalizeText } from "../utils/text.ts";
import { NicheScoutDatabase } from "../database/index.ts";
import { exportLeadsXlsx } from "../exporters/xlsx.ts";

export class ScoutPipeline {
  constructor(
    private readonly businessAdapters: BusinessDiscoveryAdapter[],
    private readonly socialAdapters: SocialSearchAdapter[],
    private readonly dbPath = process.env.NICHESCOUT_DB_PATH || "data/nichescout.sqlite",
  ) {}

  async run(input: SearchInput): Promise<PipelineResult> {
    const taskId = randomUUID();
    const queries = new QueryExpander().expand(input);
    const context = { input, queries };
    const db = new NicheScoutDatabase(this.dbPath);
    db.startTask(taskId, input, queries);
    try {
      const businessBatches = await Promise.all(this.businessAdapters.map((adapter) => adapter.discover(context)));
      const socialBatches = await Promise.all(this.socialAdapters.map((adapter) => adapter.search(context)));
      const records = businessBatches.flat();
      const posts = socialBatches.flatMap((batch) => batch.posts);
      const accounts = socialBatches.flatMap((batch) => batch.accounts);
      const ugcDiscovered = posts.filter((post) => post.mentionedStoreName).map((post): RawBusinessRecord => ({
        externalId: `ugc-discovery-${post.externalId}`, source: "XIAOHONGSHU", storeName: post.mentionedStoreName!,
        branchName: post.mentionedStoreName?.match(/（([^）]+店)）/)?.[1],
        city: post.city || input.city, district: post.district, category: input.category,
        description: `由公开${post.authorType}内容发现`, sourceUrl: post.sourceUrl,
        rawData: { discoveredFromPost: post.externalId, authorType: post.authorType, rawText: `${post.title}\n${post.body}` },
      }));
      const allRecords = [...records, ...ugcDiscovered];
      db.saveRaw(taskId, allRecords, posts, accounts);

      let stores = new StoreDeduplicator().deduplicate(allRecords);
      stores = stores.filter((store) => !input.excludeKeywords.some((word) => normalizeText(`${store.storeName}${store.description ?? ""}`).includes(normalizeText(word))));
      const matcher = new StoreMatcher();
      for (const post of posts) {
        const match = matcher.findForPost(post, stores);
        if (match.store) {
          match.store.posts.push(post);
          match.store.entityMatchScore = Math.max(match.store.entityMatchScore ?? 0, match.score);
          if (match.status === "NEEDS_REVIEW") match.store.reviewStatus = "NEEDS_REVIEW";
          else if (match.store.reviewStatus !== "NEEDS_REVIEW") match.store.reviewStatus = "MATCHED";
        }
      }
      for (const account of accounts) {
        const match = matcher.findForAccount(account, stores);
        if (!match.store) continue;
        const detection = detectOfficialAccount(account, match.store);
        if (!["OFFICIAL", "POSSIBLE_OFFICIAL"].includes(detection.type)) continue;
        const classified = { ...account, authorType: detection.type, confidence: detection.confidence };
        match.store.accounts.push(classified);
        match.store.contacts.push({ type: "XHS_ACCOUNT", value: classified.handle, source: "XIAOHONGSHU", sourceUrl: classified.profileUrl, confidence: detection.confidence, officialStatus: detection.type });
        if (classified.publicWechat) match.store.contacts.push({ type: "WECHAT", value: classified.publicWechat, source: "XIAOHONGSHU", sourceUrl: classified.profileUrl, confidence: detection.confidence * 0.9, officialStatus: detection.type });
      }
      for (const store of stores) this.enrichAndScore(store, input);
      stores.sort((a, b) => b.priorityScore - a.priorityScore || b.matchScore - a.matchScore);
      const selected = stores.slice(0, input.limit);
      db.saveStores(taskId, selected);
      const outputPath = resolve(input.output);
      await exportLeadsXlsx(outputPath, selected, input, queries);
      db.completeTask(taskId);
      return {
        taskId, queries, candidatesFound: allRecords.length, deduplicatedCount: stores.length, stores: selected,
        phoneCount: selected.filter((store) => store.contacts.some((contact) => contact.type === "PHONE")).length,
        xhsAccountCount: selected.filter((store) => store.accounts.some((account) => ["OFFICIAL", "POSSIBLE_OFFICIAL"].includes(account.authorType))).length,
        outputPath,
      };
    } finally {
      db.close();
    }
  }

  private enrichAndScore(store: Store, input: SearchInput): void {
    for (const source of store.sources) {
      if (!source.publicPhone) continue;
      const contact: Contact = { type: "PHONE", value: source.publicPhone, source: source.source, sourceUrl: source.sourceUrl, sourcePoiId: source.source === "AMAP" ? source.externalId : undefined, confidence: source.source === "AMAP" ? 0.98 : source.source === "DIANPING" ? 0.95 : 0.8, discoveredAt: new Date().toISOString() };
      if (!store.contacts.some((existing) => existing.type === contact.type && existing.value === contact.value)) store.contacts.push(contact);
    }
    const niche = scoreNiche(store, input);
    store.matchScore = niche.score;
    store.evidence = niche.evidence;
    store.contactScore = scoreContact(store);
    store.priorityScore = scorePriority(store.matchScore, store.contactScore);
  }
}

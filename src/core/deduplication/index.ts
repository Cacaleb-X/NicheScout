import { randomUUID } from "node:crypto";
import type { RawBusinessRecord, Store } from "../../models/types.ts";
import { normalizeText } from "../../utils/text.ts";
import { StoreMatcher } from "../store-matcher/index.ts";

export class StoreDeduplicator {
  constructor(private readonly matcher = new StoreMatcher()) {}

  deduplicate(records: RawBusinessRecord[]): Store[] {
    const stores: Store[] = [];
    for (const record of records) {
      const exact = stores.find((store) => {
        const sameName = store.normalizedName === normalizeText(record.storeName);
        const sameCity = store.city === record.city;
        const branchesCompatible = !store.branchName || !record.branchName || normalizeText(store.branchName) === normalizeText(record.branchName);
        const addressMatch = Boolean(store.address && record.address && normalizeText(store.address) === normalizeText(record.address));
        return sameCity && branchesCompatible && (sameName || addressMatch);
      });
      const fuzzy = !exact ? stores.map((store) => ({ store, score: this.matcher.scoreRecord(store.sources[0], record) }))
        .sort((a, b) => b.score - a.score)[0] : undefined;
      const match = exact ?? (fuzzy && fuzzy.score >= 0.82 ? fuzzy.store : undefined);
      if (match) {
        match.sources.push(record);
        this.merge(match, record);
      } else {
        stores.push(this.toStore(record));
      }
    }
    return stores;
  }

  private toStore(record: RawBusinessRecord): Store {
    return {
      id: randomUUID(), storeName: record.storeName, normalizedName: normalizeText(record.storeName),
      brandName: record.brandName, branchName: record.branchName, city: record.city,
      district: record.district, address: record.address, category: record.category,
      description: record.description, rating: record.rating, reviewCount: record.reviewCount,
      avgPrice: record.avgPrice, dianpingUrl: record.source === "DIANPING" ? record.sourceUrl : undefined,
      status: record.status, longitude: record.longitude, latitude: record.latitude,
      sources: [record], posts: [], accounts: [], contacts: [], evidence: [],
      matchScore: 0, contactScore: 0, priorityScore: 0, reviewStatus: "UNMATCHED",
    };
  }

  private merge(store: Store, record: RawBusinessRecord): void {
    store.brandName ||= record.brandName;
    store.branchName ||= record.branchName;
    store.district ||= record.district;
    store.address ||= record.address;
    store.description ||= record.description;
    store.rating ??= record.rating;
    store.reviewCount ??= record.reviewCount;
    store.avgPrice ??= record.avgPrice;
    store.dianpingUrl ||= record.source === "DIANPING" ? record.sourceUrl : undefined;
  }
}

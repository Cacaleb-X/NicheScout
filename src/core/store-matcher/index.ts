import type { RawBusinessRecord, SocialAccount, SocialPost, Store, StoreCandidate } from "../../models/types.ts";
import { scoringConfig } from "../../config/scoring.ts";
import { similarity } from "../../utils/text.ts";

function locationScore(store: Store, city?: string, district?: string): number {
  if (city && store.city !== city) return 0;
  if (district && store.district && store.district === district) return 1;
  return city === store.city ? 0.75 : 0.25;
}

export class StoreMatcher {
  scoreRecord(left: RawBusinessRecord, right: RawBusinessRecord): number {
    const name = similarity(left.storeName, right.storeName);
    const brand = left.brandName && right.brandName ? similarity(left.brandName, right.brandName) : 0;
    const address = left.address && right.address ? similarity(left.address, right.address) : 0;
    const branchConflict = left.branchName && right.branchName && similarity(left.branchName, right.branchName) < 0.4;
    const geo = left.longitude != null && right.longitude != null
      ? Math.max(0, 1 - Math.hypot(left.longitude - right.longitude, (left.latitude ?? 0) - (right.latitude ?? 0)) * 100)
      : 0;
    let result = name * 0.5 + brand * 0.14 + address * 0.2 + geo * 0.08 + (left.city === right.city ? 0.08 : 0);
    if (branchConflict) result -= 0.28;
    return Math.max(0, Math.min(1, result));
  }

  findForCandidate(candidate: StoreCandidate, records: RawBusinessRecord[]): { record?: RawBusinessRecord; score: number; status: Store["reviewStatus"] } {
    const ranked = records.map((record) => {
      const name = Math.max(similarity(candidate.candidateName, record.storeName), similarity(candidate.candidateName, record.alias || ""));
      const city = !record.city || record.city === candidate.city || record.city.includes(candidate.city) ? 1 : 0;
      const category = `${record.category || ""} ${record.typecode || ""}`.includes(candidate.category) ? 1 : 0.35;
      const xhsText = candidate.evidence.map((item) => item.text).join(" ");
      const locality = [record.district, record.businessArea, record.address].filter(Boolean).some((value) => xhsText.includes(value!)) ? 1 : 0;
      return { record, score: Math.min(1, name * 0.7 + city * 0.12 + category * 0.06 + locality * 0.06 + candidate.confidence * 0.06) };
    }).sort((a, b) => b.score - a.score);
    const best = ranked[0];
    if (!best) return { score: 0, status: "UNMATCHED" };
    if (best.score < scoringConfig.matching.reviewThreshold) return { record: best.record, score: best.score, status: "UNMATCHED" };
    return { record: best.record, score: best.score, status: best.score >= scoringConfig.matching.acceptThreshold ? "MATCHED" : "NEEDS_REVIEW" };
  }

  findForPost(post: SocialPost, stores: Store[]): { store?: Store; score: number; status: Store["reviewStatus"] } {
    const target = post.mentionedStoreName || post.poi || "";
    return this.find(target, post.city, post.district, stores);
  }

  findForAccount(account: SocialAccount, stores: Store[]): { store?: Store; score: number; status: Store["reviewStatus"] } {
    return this.find(account.claimedStoreName || account.displayName, account.city, undefined, stores);
  }

  private find(name: string, city: string | undefined, district: string | undefined, stores: Store[]) {
    const ranked = stores.map((store) => {
      const branchMatch = store.branchName && name.includes(store.branchName) ? 1 : 0;
      return { store, score: similarity(name, store.storeName) * 0.62 + locationScore(store, city, district) * 0.18 + branchMatch * 0.2 };
    })
      .sort((a, b) => b.score - a.score);
    const best = ranked[0];
    if (!best || best.score < scoringConfig.matching.reviewThreshold) return { store: undefined, score: best?.score ?? 0, status: "UNMATCHED" as const };
    return {
      store: best.store,
      score: best.score,
      status: best.score >= scoringConfig.matching.acceptThreshold ? "MATCHED" as const : "NEEDS_REVIEW" as const,
    };
  }
}

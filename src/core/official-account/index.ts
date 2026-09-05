import type { AuthorType, SocialAccount, Store } from "../../models/types.ts";
import { containsAny, similarity } from "../../utils/text.ts";

export function detectOfficialAccount(account: SocialAccount, store: Store): { type: AuthorType; confidence: number } {
  const nameScore = Math.max(similarity(account.displayName, store.storeName), similarity(account.claimedStoreName ?? "", store.storeName));
  const businessSignals = containsAny(`${account.bio ?? ""} ${account.displayName}`, ["官方", "营业时间", "预约", "到店", "地址", "客服"]);
  if (account.authorType === "OFFICIAL" && nameScore >= 0.58 && businessSignals) return { type: "OFFICIAL", confidence: Math.max(0.9, account.confidence) };
  if (["OFFICIAL", "POSSIBLE_OFFICIAL"].includes(account.authorType) && nameScore >= 0.45) {
    return { type: "POSSIBLE_OFFICIAL", confidence: Math.max(0.65, Math.min(0.89, account.confidence)) };
  }
  return { type: account.authorType === "KOL_KOC" ? "KOL_KOC" : "UNKNOWN", confidence: Math.min(0.49, account.confidence) };
}

import type { SearchInput, Store } from "../../models/types.ts";
import { scoringConfig } from "../../config/scoring.ts";
import { containsAny } from "../../utils/text.ts";

const semanticGroups: Record<string, string[]> = {
  哈利波特: ["哈利波特", "霍格沃茨", "魔法", "分院帽", "9¾", "九又四分之三", "harry potter"],
  魔法: ["魔法", "哈利波特", "霍格沃茨", "分院帽", "9¾"],
  沉浸式: ["沉浸式", "场景", "主题体验", "打卡"],
  塔罗: ["塔罗", "占星", "神秘学"],
  日式: ["日式", "日系", "和风"],
  宠物友好: ["宠物友好", "萌宠", "可带宠物", "pet friendly"],
};

function termsFor(input: SearchInput): string[] {
  const direct = input.niche.flatMap((value) => value.split(/[,，/、|]+/)).map((value) => value.trim()).filter(Boolean);
  return [...new Set(direct.flatMap((term) => [term, ...(Object.entries(semanticGroups).find(([key]) => term.includes(key) || key.includes(term))?.[1] ?? [])]))];
}

export function scoreNiche(store: Store, input: SearchInput): { score: number; evidence: string[] } {
  const terms = termsFor(input);
  const hits: { points: number; evidence: string }[] = [];
  if (containsAny(store.storeName, terms)) hits.push({ points: scoringConfig.niche.storeName, evidence: `店名包含细分相关词：${store.storeName}` });
  if (containsAny(store.description ?? "", terms)) hits.push({ points: scoringConfig.niche.description, evidence: "商家简介包含细分主题词" });
  if (containsAny(store.category ?? "", [input.category])) hits.push({ points: scoringConfig.niche.category, evidence: `平台分类匹配“${input.category}”` });
  const titleCount = store.posts.filter((post) => containsAny(post.title, terms)).length;
  const bodyCount = store.posts.filter((post) => containsAny(post.body, terms)).length;
  const tagCount = store.posts.filter((post) => containsAny(`${post.hashtags.join(" ")} ${post.poi ?? ""}`, terms)).length;
  if (titleCount) hits.push({ points: Math.min(scoringConfig.niche.postTitle + titleCount * 3, 27), evidence: `${titleCount}篇公开内容标题明确提及相关主题` });
  if (bodyCount) hits.push({ points: Math.min(scoringConfig.niche.postBody + bodyCount * 2, 20), evidence: `${bodyCount}篇公开内容正文提供细分证据` });
  if (tagCount) hits.push({ points: scoringConfig.niche.hashtagOrPoi, evidence: "公开内容标签或POI匹配细分词" });
  let score = hits.reduce((sum, hit) => sum + hit.points, 0);
  if (hits.length >= 3) score += scoringConfig.niche.strongEvidenceBonus;
  if (!hits.length && store.category === input.category) score = scoringConfig.niche.weakEvidenceFloor;
  return { score: Math.min(100, score), evidence: hits.sort((a, b) => b.points - a.points).slice(0, 3).map((hit) => hit.evidence) };
}

function daysSince(isoDate: string): number {
  return Math.max(0, (Date.now() - new Date(isoDate).getTime()) / 86_400_000);
}

export function scoreContact(store: Store): number {
  let score = 0;
  if (store.contacts.some((contact) => contact.type === "PHONE")) score += scoringConfig.contact.publicPhone;
  const official = store.accounts.find((account) => account.authorType === "OFFICIAL");
  const possible = store.accounts.find((account) => account.authorType === "POSSIBLE_OFFICIAL");
  if (official) score += scoringConfig.contact.officialXhs;
  else if (possible) score += scoringConfig.contact.possibleOfficialXhs;
  const active = official ?? possible;
  if (active?.lastActive) {
    const days = daysSince(active.lastActive);
    if (days <= 30) score += scoringConfig.contact.activeWithin30Days;
    else if (days <= 90) score += scoringConfig.contact.activeWithin90Days;
  }
  if (store.contacts.some((contact) => contact.type === "WECHAT")) score += scoringConfig.contact.publicWechat;
  if (store.contacts.some((contact) => ["EMAIL", "OTHER"].includes(contact.type))) score += scoringConfig.contact.otherBusinessContact;
  return Math.min(100, score);
}

export function scorePriority(matchScore: number, contactScore: number): number {
  return Math.round((matchScore * scoringConfig.priority.matchWeight + contactScore * scoringConfig.priority.contactWeight) * 10) / 10;
}

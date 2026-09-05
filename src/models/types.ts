export type AuthorType = "OFFICIAL" | "POSSIBLE_OFFICIAL" | "KOL_KOC" | "UGC" | "LOCAL_MEDIA" | "UNKNOWN";
export type ContactType = "PHONE" | "XHS_ACCOUNT" | "WECHAT" | "EMAIL" | "OTHER";
export type SourcePlatform = "DIANPING" | "XIAOHONGSHU" | "MANUAL" | "MOCK" | "SEARCH_ENGINE";

export interface SearchInput {
  city: string;
  district?: string;
  category: string;
  niche: string[];
  limit: number;
  excludeKeywords: string[];
  output: string;
  manualFile?: string;
}

export interface SearchQuery {
  text: string;
  reason: string;
}

export interface RawBusinessRecord {
  externalId: string;
  source: SourcePlatform;
  storeName: string;
  brandName?: string;
  branchName?: string;
  city: string;
  district?: string;
  address?: string;
  category?: string;
  description?: string;
  rating?: number;
  reviewCount?: number;
  avgPrice?: number;
  publicPhone?: string;
  sourceUrl?: string;
  status?: string;
  longitude?: number;
  latitude?: number;
  rawData: unknown;
}

export interface SocialPost {
  externalId: string;
  source: "XIAOHONGSHU" | "MOCK";
  authorId: string;
  authorName: string;
  authorType: AuthorType;
  title: string;
  body: string;
  hashtags: string[];
  poi?: string;
  city?: string;
  district?: string;
  mentionedStoreName?: string;
  sourceUrl?: string;
  publishedAt?: string;
  rawData: unknown;
}

export interface SocialAccount {
  externalId: string;
  source: "XIAOHONGSHU" | "MOCK";
  handle: string;
  displayName: string;
  bio?: string;
  authorType: AuthorType;
  claimedStoreName?: string;
  city?: string;
  profileUrl?: string;
  lastActive?: string;
  publicWechat?: string;
  confidence: number;
  rawData: unknown;
}

export interface Contact {
  type: ContactType;
  value: string;
  source: SourcePlatform;
  sourceUrl?: string;
  confidence: number;
  officialStatus?: AuthorType;
}

export interface Store {
  id: string;
  storeName: string;
  normalizedName: string;
  brandName?: string;
  branchName?: string;
  city: string;
  district?: string;
  address?: string;
  category?: string;
  description?: string;
  rating?: number;
  reviewCount?: number;
  avgPrice?: number;
  dianpingUrl?: string;
  status?: string;
  longitude?: number;
  latitude?: number;
  sources: RawBusinessRecord[];
  posts: SocialPost[];
  accounts: SocialAccount[];
  contacts: Contact[];
  evidence: string[];
  matchScore: number;
  contactScore: number;
  priorityScore: number;
  entityMatchScore?: number;
  reviewStatus: "MATCHED" | "NEEDS_REVIEW" | "UNMATCHED";
}

export interface DiscoveryContext {
  input: SearchInput;
  queries: SearchQuery[];
}

export interface BusinessDiscoveryAdapter {
  name: string;
  discover(context: DiscoveryContext): Promise<RawBusinessRecord[]>;
}

export interface SocialSearchResult {
  posts: SocialPost[];
  accounts: SocialAccount[];
  status: "OK" | "MANUAL_LOGIN_REQUIRED" | "CAPTCHA_REQUIRED";
}

export interface SocialSearchAdapter {
  name: string;
  search(context: DiscoveryContext): Promise<SocialSearchResult>;
}

export interface PipelineResult {
  taskId: string;
  queries: SearchQuery[];
  candidatesFound: number;
  deduplicatedCount: number;
  stores: Store[];
  phoneCount: number;
  xhsAccountCount: number;
  outputPath: string;
}

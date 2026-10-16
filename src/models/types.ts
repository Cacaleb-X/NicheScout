export type AuthorType = "OFFICIAL" | "POSSIBLE_OFFICIAL" | "KOL_KOC" | "UGC" | "LOCAL_MEDIA" | "UNKNOWN";
export type ContactType = "PHONE" | "XHS_ACCOUNT" | "WECHAT" | "EMAIL" | "OTHER";
export type SourcePlatform = "AMAP" | "DIANPING" | "XIAOHONGSHU" | "MANUAL" | "MOCK" | "SEARCH_ENGINE";

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
  adcode?: string;
  businessArea?: string;
  address?: string;
  category?: string;
  alias?: string;
  typecode?: string;
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
  authorProfileUrl?: string;
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
  sourcePoiId?: string;
  confidence: number;
  officialStatus?: AuthorType;
  discoveredAt?: string;
}

export interface StoreCandidateEvidence {
  text: string;
  kind: "TITLE" | "SNIPPET" | "AUTHOR_BUSINESS_HINT";
}

export interface StoreCandidate {
  candidateName: string;
  city: string;
  category: string;
  nicheQuery: string;
  confidence: number;
  evidence: StoreCandidateEvidence[];
  sourceNoteId: string;
  sourceNoteUrl?: string;
  sourceAuthor?: string;
  sourceNoteIds?: string[];
  sourceNoteUrls?: string[];
  sourceAuthors?: string[];
  extractionMethod: "RULE_BASED" | "LLM" | "RULE_AND_LLM";
}

export type AmapMatchStatus = "MATCHED" | "AMBIGUOUS" | "NOT_FOUND";

export interface StoreVerificationResult {
  candidate: StoreCandidate;
  attempts: number;
  matchStatus: AmapMatchStatus;
  matchedRecord?: RawBusinessRecord;
  matchConfidence: number;
  reviewStatus: "MATCHED" | "NEEDS_REVIEW";
  notes?: string;
}

export interface Store {
  id: string;
  storeName: string;
  normalizedName: string;
  brandName?: string;
  branchName?: string;
  city: string;
  district?: string;
  adcode?: string;
  businessArea?: string;
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
  amapPoiId?: string;
  amapSourceUrl?: string;
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

export interface RealPipelineStats {
  xhsCards: number;
  storeCandidates: number;
  amapVerificationAttempts: number;
  amapMatchedStores: number;
  matchRate: number;
  addressCoverageRate: number;
  districtCoverageRate: number;
  storesWithPhone: number;
  phoneCoverageRate: number;
  ambiguousMatches: number;
  notFound: number;
  needsReviewCount: number;
  finalLeadsCount: number;
}

export interface RealPipelineResult extends PipelineResult {
  stats: RealPipelineStats;
  verifications: StoreVerificationResult[];
}

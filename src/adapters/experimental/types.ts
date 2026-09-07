export type FieldAvailability = "AVAILABLE" | "NOT_AVAILABLE" | "NOT_AVAILABLE_FROM_SEARCH_CARD" | "LOGIN_REQUIRED" | "MANUAL_ACTION_REQUIRED" | "UNCERTAIN";

export type PageAccessStatus = "PAGE_ACCESS_FAILED" | "PAGE_ACCESS_SUCCESS" | "MANUAL_ACTION_REQUIRED";
export type DataExtractionStatus = "DATA_EXTRACTION_SUCCESS" | "DATA_EXTRACTION_FAILED" | "MANUAL_ACTION_REQUIRED";
export type SearchContentStatus = "SEARCH_CONTENT_AVAILABLE" | "SEARCH_CONTENT_UNAVAILABLE" | "UNCERTAIN";
export type NavigationStatus = "NAVIGATION_SUCCESS" | "NAVIGATION_PARTIAL" | "NAVIGATION_FAILED";

export interface SelectorDiagnostic {
  selector: string;
  count: number;
}

export interface DetectionEvidence {
  selector?: string;
  text: string;
  count: number;
}

export interface RestrictionDiagnostics {
  manualActionReason: "CAPTCHA" | "LOGIN_WALL" | "OTHER_RESTRICTION" | null;
  loginDetected: boolean;
  loginDetectionEvidence: DetectionEvidence[];
  loginSurface: "NONE" | "ENTRY" | "MODAL" | "WALL";
  captchaDetected: boolean;
  captchaDetectionEvidence: DetectionEvidence[];
  rateLimitDetected: boolean;
  rateLimitDetectionEvidence: DetectionEvidence[];
  modalDetected: boolean;
  redirectDetected: boolean;
  blocksPublicContent: boolean;
}

export interface DomBlockDiagnostic {
  tagName: string;
  className: string;
  role?: string;
  href?: string;
  innerText: string;
  childCount: number;
  dataAttributeNames: string[];
}

export interface DomStructureDiagnostics {
  nodeCounts: Record<"article" | "section" | "a" | "div" | "iframe", number>;
  shadowRootCount: number;
  contentLinks: Array<{ href: string; text: string; pattern: string }>;
  largeVisibleBlocks: DomBlockDiagnostic[];
  potentialCardBlockCount: number;
}

export interface PageDebugSnapshot {
  targetUrl: string;
  navigationAttempted: boolean;
  navigationSucceeded: boolean;
  navigationStatus: NavigationStatus;
  waitUntil: "commit" | "domcontentloaded";
  navigationDurationMs: number;
  navigationError?: string;
  pageCreatedAt: string;
  diagnosticStartedAt: string | null;
  finalUrl: string;
  title?: string;
  screenshotPath?: string;
  bodySnapshotPath?: string;
  bodyTextPreview?: string;
  searchResultRegionExists?: boolean;
  candidateNodeCount?: number;
  selectors?: SelectorDiagnostic[];
  connectivityProbe?: NavigationMetadata;
  domStructurePath?: string;
  manualActionReason?: RestrictionDiagnostics["manualActionReason"];
  loginSurface?: RestrictionDiagnostics["loginSurface"];
  loginDetected?: boolean;
  loginDetectionEvidence?: DetectionEvidence[];
  captchaDetected?: boolean;
  captchaDetectionEvidence?: DetectionEvidence[];
  rateLimitDetected?: boolean;
  rateLimitDetectionEvidence?: DetectionEvidence[];
  modalDetected?: boolean;
  redirectDetected?: boolean;
  blocksPublicContent?: boolean;
}

export interface NavigationMetadata {
  targetUrl: string;
  navigationAttempted: true;
  navigationSucceeded: boolean;
  navigationStatus: NavigationStatus;
  waitUntil: "commit" | "domcontentloaded";
  navigationDurationMs: number;
  navigationError?: string;
  pageCreatedAt: string;
  finalUrl: string;
  title?: string;
  bodyOrDomPresent: boolean;
}

export interface PageObservation {
  url: string;
  title?: string;
  accessStatus: PageAccessStatus;
  loginVisible: boolean;
  captchaVisible: boolean;
  rateLimitVisible: boolean;
  notes: string[];
}

export interface SpikeRun<T> {
  platform: "DIANPING" | "XIAOHONGSHU";
  experimental: true;
  query: string;
  capturedAt: string;
  accessStatus: PageAccessStatus;
  pageAccessStatus: PageAccessStatus;
  dataExtractionStatus: DataExtractionStatus;
  searchContentStatus: SearchContentStatus;
  fieldAvailability: Record<string, FieldAvailability>;
  observations: PageObservation[];
  debug: PageDebugSnapshot;
  connectivityProbe?: NavigationMetadata;
  results: T[];
}

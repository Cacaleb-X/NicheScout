import type { DiscoveryContext, SocialAccount, SocialPost, SocialSearchAdapter, SocialSearchResult } from "../../../models/types.ts";
import type { Page } from "playwright";
import { collectDomStructureDiagnostics, collectSelectorDiagnostics, createExperimentalContext, detectRestrictionDiagnostics, logSpikeStage, navigateSearchPage, observePage, retainExperimentalContext, saveDomStructureDiagnostics, saveNavigationFailureDebug, savePageDebugSnapshot, shouldRetainExperimentalContext, spikeDebugSlug, updateDebugSnapshot, waitForNormalLoading } from "../../experimental/browser.ts";
import type { FieldAvailability, SpikeRun } from "../../experimental/types.ts";

export interface XiaohongshuSpikeRecord {
  note_id?: string;
  title?: string;
  note_url?: string;
  author_name?: string;
  author_profile_url?: string;
  text_snippet?: string;
  publish_time?: string;
  hashtags?: string[];
  poi?: string;
  mentioned_accounts?: string[];
  profile_name?: string;
  profile_url?: string;
  bio?: string;
  latest_activity?: string;
  possible_business_account?: boolean;
}

interface XiaohongshuCandidateCard {
  noteId?: string;
  href: string;
  text: string;
  authorName?: string;
  authorUrl?: string;
  structure: { tagName: string; className: string; role?: string };
}

export function sanitizeXiaohongshuPublicUrl(value: string): string {
  const url = new URL(value);
  for (const key of [...url.searchParams.keys()]) {
    if (/token|sign|auth|session/i.test(key)) url.searchParams.delete(key);
  }
  return url.href;
}

export function isXiaohongshuContentUrl(value: string): boolean {
  const path = new URL(value).pathname;
  return /\/explore\/[^/]+/i.test(path)
    || /\/discovery\/item\/[^/]+/i.test(path)
    || /\/(?:note|item)\/[A-Za-z0-9_-]+/i.test(path)
    || /\/search_result\/[A-Za-z0-9_-]+/i.test(path);
}

async function collectXiaohongshuCandidateCards(page: Page): Promise<XiaohongshuCandidateCard[]> {
  const candidates = await page.locator("a[href]").evaluateAll((anchors) => {
    const visible = (element: Element): boolean => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    };
    const contentPath = (path: string): boolean => /\/explore\/[^/]+/i.test(path)
      || /\/discovery\/item\/[^/]+/i.test(path)
      || /\/(?:note|item)\/[A-Za-z0-9_-]+/i.test(path)
      || /\/search_result\/[A-Za-z0-9_-]+/i.test(path);
    const sanitize = (value: string): string => {
      const url = new URL(value, location.href);
      for (const key of [...url.searchParams.keys()]) if (/token|sign|auth|session/i.test(key)) url.searchParams.delete(key);
      return url.href;
    };
    const seen = new Set<string>();
    return anchors.flatMap((node) => {
      const anchor = node as HTMLAnchorElement;
      if (!visible(anchor)) return [];
      const resolved = new URL(anchor.href, location.href);
      if (resolved.origin !== location.origin || !contentPath(resolved.pathname)) return [];
      const href = sanitize(resolved.href);
      if (seen.has(href)) return [];
      seen.add(href);
      let container: Element = anchor.closest("section[data-note-id], section.note-item") || anchor;
      if (container === anchor) {
        for (let level = 0; level < 5 && container.parentElement; level += 1) {
          const parent = container.parentElement;
          const rect = parent.getBoundingClientRect();
          if (rect.width >= 140 && rect.width <= 700 && rect.height >= 120 && rect.height <= 1_000 && parent.querySelector("img, video, picture")) container = parent;
          else break;
        }
      }
      const profile = container.querySelector<HTMLAnchorElement>('a[href*="/user/profile/"]');
      const profileName = profile?.querySelector(".name")?.textContent?.trim() || profile?.textContent?.trim();
      return [{
        noteId: container.getAttribute("data-note-id") || resolved.pathname.split("/").filter(Boolean).at(-1),
        href,
        text: ((container as HTMLElement).innerText || anchor.innerText || anchor.textContent || "").trim().slice(0, 1_000),
        authorName: profileName,
        authorUrl: profile ? sanitize(profile.href) : undefined,
        structure: {
          tagName: container.tagName.toLowerCase(),
          className: typeof container.className === "string" ? container.className.slice(0, 300) : "",
          role: container.getAttribute("role") || undefined,
        },
      }];
    });
  });
  return candidates.slice(0, 50);
}

export function mapXiaohongshuSnapshot(record: XiaohongshuSpikeRecord, query: string, index = 0): { post?: SocialPost; account?: SocialAccount } {
  const externalId = record.note_id || record.note_url?.match(/\/(?:explore|search_result)\/([^/?#]+)/)?.[1] || `experimental-note-${index}`;
  const post = record.title ? {
    externalId,
    source: "XIAOHONGSHU" as const,
    authorId: record.author_profile_url?.match(/\/user\/profile\/([^/?#]+)/)?.[1] || `unknown-${index}`,
    authorName: record.author_name || "UNKNOWN",
    authorType: "UGC" as const,
    title: record.title,
    body: record.text_snippet || "",
    hashtags: record.hashtags || [],
    poi: record.poi,
    city: query.includes("长沙") ? "长沙" : undefined,
    sourceUrl: record.note_url,
    publishedAt: record.publish_time,
    rawData: { experimental: true, query, ...record },
  } : undefined;
  const account = record.profile_url && record.profile_name ? {
    externalId: record.profile_url.match(/\/user\/profile\/([^/?#]+)/)?.[1] || `experimental-account-${index}`,
    source: "XIAOHONGSHU" as const,
    handle: record.profile_name,
    displayName: record.profile_name,
    bio: record.bio,
    authorType: record.possible_business_account ? "POSSIBLE_OFFICIAL" as const : "UNKNOWN" as const,
    city: query.includes("长沙") ? "长沙" : undefined,
    profileUrl: record.profile_url,
    lastActive: record.latest_activity,
    confidence: record.possible_business_account ? 0.55 : 0.2,
    rawData: { experimental: true, query, ...record },
  } : undefined;
  return { post, account };
}

function fieldAvailability(records: XiaohongshuSpikeRecord[], loginRequired: boolean): Record<string, FieldAvailability> {
  const fields: Array<keyof XiaohongshuSpikeRecord> = ["note_id", "title", "note_url", "author_name", "author_profile_url", "text_snippet", "publish_time", "hashtags", "poi", "mentioned_accounts", "profile_name", "profile_url", "bio", "latest_activity", "possible_business_account"];
  const hasValue = (value: unknown): boolean => Array.isArray(value) ? value.length > 0 : value !== undefined && value !== "";
  return Object.fromEntries(fields.map((field) => {
    if (records.some((record) => hasValue(record[field]))) return [field, "AVAILABLE"];
    if (loginRequired) return [field, "LOGIN_REQUIRED"];
    return [field, records.length ? "NOT_AVAILABLE_FROM_SEARCH_CARD" : "UNCERTAIN"];
  }));
}

export class XiaohongshuExperimentalAdapter implements SocialSearchAdapter {
  readonly name = "XiaohongshuExperimentalAdapter (EXPERIMENTAL)";

  constructor(private readonly maxResults = 5) {}

  async spike(query: string): Promise<SpikeRun<XiaohongshuSpikeRecord>> {
    const targetUrl = `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(query)}&source=web_search_result_notes`;
    const slug = spikeDebugSlug("xiaohongshu", query);
    logSpikeStage("START", query, targetUrl);
    const { context, page, pageCreatedAt } = await createExperimentalContext("xiaohongshu");
    logSpikeStage("PAGE_CREATED", query, targetUrl, `pageCreatedAt=${pageCreatedAt}`);
    const observations = [];
    const records: XiaohongshuSpikeRecord[] = [];
    try {
      const probeUrl = "https://www.xiaohongshu.com/";
      const { navigation: connectivityProbe } = await navigateSearchPage(page, `${query} [connectivity probe]`, probeUrl, pageCreatedAt, "commit");
      const { observation: initialObservation, navigation } = await navigateSearchPage(page, query, targetUrl, pageCreatedAt, "commit");
      if (navigation.navigationStatus === "NAVIGATION_FAILED") {
        const debug = await saveNavigationFailureDebug(page, slug, navigation, connectivityProbe);
        observations.push(initialObservation);
        return { platform: "XIAOHONGSHU", experimental: true, query, capturedAt: new Date().toISOString(), accessStatus: "PAGE_ACCESS_FAILED", pageAccessStatus: "PAGE_ACCESS_FAILED", dataExtractionStatus: "DATA_EXTRACTION_FAILED", searchContentStatus: "UNCERTAIN", fieldAvailability: fieldAvailability([], false), observations, debug, connectivityProbe, results: [] };
      }
      logSpikeStage("WAIT_START", query, targetUrl);
      await waitForNormalLoading(page);
      logSpikeStage("WAIT_END", query, targetUrl);
      const observation = await observePage(page, initialObservation.notes);
      observations.push(observation);
      const resultRegionSelectors = [".feeds-container", ".search-result", '[class*="feeds-container"]', ".feeds-page"];
      const candidateSelectors = ["section.note-item", ".note-item", '[class*="note-item"]', 'a[href*="/explore/"]', 'a[href*="/discovery/item/"]'];
      const diagnosticStartedAt = new Date().toISOString();
      logSpikeStage("DIAGNOSTIC_START", query, targetUrl, `diagnosticStartedAt=${diagnosticStartedAt}`);
      const selectorDiagnostics = await collectSelectorDiagnostics(page, [...resultRegionSelectors, ...candidateSelectors]);
      const domStructure = await collectDomStructureDiagnostics(page);
      const domStructurePath = await saveDomStructureDiagnostics(slug, domStructure);
      const cards = await collectXiaohongshuCandidateCards(page);
      const publicCandidateCount = Math.max(cards.length, domStructure.potentialCardBlockCount);
      const restriction = await detectRestrictionDiagnostics(page, publicCandidateCount);
      let debug = await savePageDebugSnapshot(page, slug, navigation, diagnosticStartedAt, selectorDiagnostics, resultRegionSelectors, candidateSelectors, connectivityProbe);
      debug.candidateNodeCount = cards.length;
      debug.searchResultRegionExists = Boolean(debug.searchResultRegionExists || domStructure.potentialCardBlockCount > 0);
      debug = await updateDebugSnapshot(slug, debug, restriction, domStructurePath);
      logSpikeStage("DIAGNOSTIC_END", query, targetUrl, `candidateNodeCount=${cards.length} potentialCardBlockCount=${domStructure.potentialCardBlockCount} manualActionReason=${restriction.manualActionReason ?? "NONE"}`);
      if (restriction.blocksPublicContent) {
        const manual = Boolean(restriction.manualActionReason);
        const pageAccessStatus = manual ? "MANUAL_ACTION_REQUIRED" : "PAGE_ACCESS_FAILED";
        observation.accessStatus = pageAccessStatus;
        return { platform: "XIAOHONGSHU", experimental: true, query, capturedAt: new Date().toISOString(), accessStatus: pageAccessStatus, pageAccessStatus, dataExtractionStatus: manual ? "MANUAL_ACTION_REQUIRED" : "DATA_EXTRACTION_FAILED", searchContentStatus: cards.length || domStructure.potentialCardBlockCount ? "SEARCH_CONTENT_AVAILABLE" : "SEARCH_CONTENT_UNAVAILABLE", fieldAvailability: fieldAvailability([], restriction.loginSurface === "WALL"), observations, debug, connectivityProbe, results: [] };
      }
      observation.accessStatus = "PAGE_ACCESS_SUCCESS";

      for (const card of cards.slice(0, this.maxResults)) {
        const lines = card.text.split("\n").map((line) => line.trim()).filter(Boolean);
        const hashtags = [...card.text.matchAll(/#([^#\s]+)/g)].map((match) => match[1]);
        records.push({ note_id: card.noteId, title: lines[0], note_url: sanitizeXiaohongshuPublicUrl(card.href), author_name: card.authorName || lines.at(-2), author_profile_url: card.authorUrl ? sanitizeXiaohongshuPublicUrl(card.authorUrl) : undefined, text_snippet: card.text.slice(0, 500), hashtags });
      }

      const dataExtractionStatus = records.length ? "DATA_EXTRACTION_SUCCESS" : "DATA_EXTRACTION_FAILED";
      return { platform: "XIAOHONGSHU", experimental: true, query, capturedAt: new Date().toISOString(), accessStatus: "PAGE_ACCESS_SUCCESS", pageAccessStatus: "PAGE_ACCESS_SUCCESS", dataExtractionStatus, searchContentStatus: cards.length || domStructure.potentialCardBlockCount ? "SEARCH_CONTENT_AVAILABLE" : "SEARCH_CONTENT_UNAVAILABLE", fieldAvailability: fieldAvailability(records, false), observations, debug, connectivityProbe, results: records };
    } finally {
      if (shouldRetainExperimentalContext()) retainExperimentalContext(context);
      else await context.close();
      logSpikeStage("QUERY_COMPLETE", query, targetUrl);
    }
  }

  async search(context: DiscoveryContext): Promise<SocialSearchResult> {
    const query = `${context.input.city} ${context.input.niche[0] || ""} ${context.input.category}`.trim();
    const run = await this.spike(query);
    const mapped = run.results.map((record, index) => mapXiaohongshuSnapshot(record, query, index));
    return {
      posts: mapped.flatMap((value) => value.post ? [value.post] : []),
      accounts: mapped.flatMap((value) => value.account ? [value.account] : []),
      status: run.accessStatus === "MANUAL_ACTION_REQUIRED" && run.observations.some((item) => item.captchaVisible) ? "CAPTCHA_REQUIRED" : run.accessStatus === "MANUAL_ACTION_REQUIRED" ? "MANUAL_LOGIN_REQUIRED" : "OK",
    };
  }
}

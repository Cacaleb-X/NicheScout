import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Browser, BrowserContext, Page } from "playwright";
import type { DetectionEvidence, DomStructureDiagnostics, NavigationMetadata, PageDebugSnapshot, PageObservation, PageAccessStatus, RestrictionDiagnostics, SelectorDiagnostic } from "./types.ts";

const CAPTCHA_PATTERNS = ["图形验证码", "安全验证", "访问验证", "完成验证", "滑块验证", "请依次点击下图图标", "verify captcha"];
const CAPTCHA_URL_PATTERNS = ["verify.meituan.com"];
const LOGIN_PATTERNS = ["登录后查看", "登录后查看更多", "请先登录", "扫码登录", "手机号登录"];
const RATE_LIMIT_PATTERNS = ["访问过于频繁", "操作频繁", "请求频繁", "稍后再试", "too many requests"];

const LOGIN_URL_PATTERNS = ["/login", "pclogin", "passport", "signin"];
export const NAVIGATION_TIMEOUT_MS = 25_000;

export type SpikeStage = "START" | "PAGE_CREATED" | "NAVIGATION_START" | "NAVIGATION_SUCCESS" | "NAVIGATION_PARTIAL" | "NAVIGATION_FAILED" | "WAIT_START" | "WAIT_END" | "DIAGNOSTIC_START" | "DIAGNOSTIC_END" | "QUERY_COMPLETE";

export function logSpikeStage(stage: SpikeStage, query: string, targetUrl: string, detail?: string): void {
  console.log(`[${stage}] query=${JSON.stringify(query)} targetUrl=${JSON.stringify(targetUrl)}${detail ? ` ${detail}` : ""}`);
}

export function sanitizeDiagnosticUrl(value: string): string {
  try {
    const url = new URL(value);
    for (const key of [...url.searchParams.keys()]) {
      if (/token|sign|auth|session|uuid|verifymsg|redirectpath|requestcode|succcallbackurl|failcallbackurl/i.test(key)) url.searchParams.delete(key);
    }
    return url.href;
  } catch {
    return value;
  }
}

export function classifyPageState(text: string, url = ""): Pick<PageObservation, "accessStatus" | "loginVisible" | "captchaVisible" | "rateLimitVisible"> {
  const haystack = `${url}\n${text}`.toLowerCase();
  const captchaVisible = CAPTCHA_PATTERNS.some((value) => haystack.includes(value.toLowerCase())) || CAPTCHA_URL_PATTERNS.some((value) => url.toLowerCase().includes(value));
  const loginVisible = LOGIN_PATTERNS.some((value) => haystack.includes(value.toLowerCase())) || LOGIN_URL_PATTERNS.some((value) => url.toLowerCase().includes(value));
  const rateLimitVisible = RATE_LIMIT_PATTERNS.some((value) => haystack.includes(value.toLowerCase()));
  let accessStatus: PageAccessStatus = "PAGE_ACCESS_SUCCESS";
  if (captchaVisible || loginVisible) accessStatus = "MANUAL_ACTION_REQUIRED";
  else if (rateLimitVisible) accessStatus = "PAGE_ACCESS_FAILED";
  return { accessStatus, loginVisible, captchaVisible, rateLimitVisible };
}

export async function observePage(page: Page, notes: string[] = []): Promise<PageObservation> {
  const url = sanitizeDiagnosticUrl(page.url());
  const title = await page.title().catch(() => undefined);
  const text = await page.locator("body").innerText({ timeout: 5_000 }).catch(() => "");
  return { url, title, ...classifyPageState(text, url), notes };
}

export async function openPage(page: Page, url: string): Promise<PageObservation> {
  const notes: string[] = [];
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAVIGATION_TIMEOUT_MS });
  } catch (error) {
    notes.push(`Navigation did not reach DOMContentLoaded in ${NAVIGATION_TIMEOUT_MS}ms: ${error instanceof Error ? error.message : String(error)}`);
  }
  const observation = await observePage(page, notes);
  if (notes.length) observation.accessStatus = "PAGE_ACCESS_FAILED";
  return observation;
}

const retainedContexts = new Set<BrowserContext>();
const contextBrowsers = new Map<BrowserContext, Browser>();

export async function createExperimentalContext(platform: string): Promise<{ context: BrowserContext; page: Page; pageCreatedAt: string }> {
  const { chromium } = await import("playwright");
  const headlessSetting = (process.env.SPIKE_HEADLESS || process.env.HEADLESS || "true").toLowerCase();
  const headless = !["0", "false", "no"].includes(headlessSetting);
  const browser = await chromium.launch({ executablePath: chromium.executablePath(), headless });
  const context = await browser.newContext({ locale: "zh-CN", viewport: { width: 1365, height: 900 } });
  contextBrowsers.set(context, browser);
  const page = await context.newPage();
  logSpikeStage("PAGE_CREATED", `${platform} anonymous session`, "about:blank", "ephemeralContext=true");
  return { context, page, pageCreatedAt: new Date().toISOString() };
}

export async function closeExperimentalContext(context: BrowserContext): Promise<void> {
  retainedContexts.delete(context);
  const browser = contextBrowsers.get(context);
  contextBrowsers.delete(context);
  await context.close().catch(() => undefined);
  await browser?.close().catch(() => undefined);
}

async function inspectEstablishedDocument(page: Page): Promise<{ finalUrl: string; title?: string; bodyOrDomPresent: boolean }> {
  const finalUrl = sanitizeDiagnosticUrl(page.url());
  const title = await page.title().catch(() => undefined);
  const bodyText = await page.locator("body").innerText({ timeout: 2_000 }).catch(() => "");
  const htmlPresent = await page.locator("html").count().then((count) => count > 0).catch(() => false);
  return { finalUrl, title, bodyOrDomPresent: Boolean(title || bodyText.trim() || htmlPresent) };
}

export async function navigateSearchPage(
  page: Page,
  query: string,
  targetUrl: string,
  pageCreatedAt: string,
  waitUntil: "commit" | "domcontentloaded" = "domcontentloaded",
): Promise<{ observation: PageObservation; navigation: NavigationMetadata }> {
  logSpikeStage("NAVIGATION_START", query, targetUrl, `waitUntil=${waitUntil} timeoutMs=${NAVIGATION_TIMEOUT_MS}`);
  const startedAt = Date.now();
  try {
    await page.goto(targetUrl, { waitUntil, timeout: NAVIGATION_TIMEOUT_MS });
    const navigationDurationMs = Date.now() - startedAt;
    const established = await inspectEstablishedDocument(page);
    logSpikeStage("NAVIGATION_SUCCESS", query, targetUrl, `durationMs=${navigationDurationMs} finalUrl=${JSON.stringify(established.finalUrl)}`);
    return {
      observation: await observePage(page),
      navigation: { targetUrl, navigationAttempted: true, navigationSucceeded: true, navigationStatus: "NAVIGATION_SUCCESS", waitUntil, navigationDurationMs, pageCreatedAt, ...established },
    };
  } catch (error) {
    const navigationDurationMs = Date.now() - startedAt;
    const navigationError = error instanceof Error ? error.message : String(error);
    const established = await inspectEstablishedDocument(page);
    const partial = established.finalUrl !== "about:blank" && established.bodyOrDomPresent;
    const navigationStatus = partial ? "NAVIGATION_PARTIAL" : "NAVIGATION_FAILED";
    logSpikeStage(navigationStatus, query, targetUrl, `durationMs=${navigationDurationMs} finalUrl=${JSON.stringify(established.finalUrl)} error=${JSON.stringify(navigationError)}`);
    const observation = await observePage(page, [navigationError]);
    if (!partial) observation.accessStatus = "PAGE_ACCESS_FAILED";
    return {
      observation,
      navigation: { targetUrl, navigationAttempted: true, navigationSucceeded: false, navigationStatus, waitUntil, navigationDurationMs, navigationError, pageCreatedAt, ...established },
    };
  }
}

export function retainExperimentalContext(context: BrowserContext): void {
  retainedContexts.add(context);
}

export function shouldRetainExperimentalContext(): boolean {
  return process.env.SPIKE_KEEP_OPEN === "1";
}

export async function closeRetainedExperimentalContexts(): Promise<void> {
  await Promise.all([...retainedContexts].map((context) => closeExperimentalContext(context)));
  retainedContexts.clear();
}

export function retainedExperimentalContextCount(): number {
  return retainedContexts.size;
}

export async function gentlePause(page: Page): Promise<void> {
  await page.waitForTimeout(1_200);
}

export async function waitForNormalLoading(page: Page): Promise<void> {
  const configured = Number(process.env.SPIKE_WAIT_MS || 8_000);
  const waitMs = Number.isFinite(configured) ? Math.min(Math.max(configured, 0), 30_000) : 8_000;
  await page.waitForTimeout(waitMs);
}

export async function collectSelectorDiagnostics(page: Page, selectors: string[]): Promise<SelectorDiagnostic[]> {
  const results: SelectorDiagnostic[] = [];
  for (const selector of selectors) {
    const count = await page.locator(selector).count().catch(() => 0);
    results.push({ selector, count });
  }
  return results;
}

export async function collectDomStructureDiagnostics(page: Page): Promise<DomStructureDiagnostics> {
  return page.evaluate(() => {
    const visible = (element: Element): boolean => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    };
    const patternFor = (href: string): string | undefined => {
      const path = new URL(href, location.href).pathname;
      if (path.includes("/explore/")) return "/explore/";
      if (/\/search_result\/[^/]+/i.test(path)) return "/search_result/{id}";
      if (/\/(?:note|item)\/[A-Za-z0-9_-]+/i.test(path)) return "note/item/id";
      if (new URL(href, location.href).origin === location.origin && path !== location.pathname) return "same-origin-content";
      return undefined;
    };
    const sanitizeUrl = (href: string): string => {
      const url = new URL(href, location.href);
      for (const key of [...url.searchParams.keys()]) {
        if (/token|sign|auth|session|uuid|verifymsg|redirectpath|requestcode|succcallbackurl|failcallbackurl/i.test(key)) url.searchParams.delete(key);
      }
      return url.href;
    };
    const all = [...document.querySelectorAll("article, section, a, div")].filter(visible);
    const contentLinks = [...document.querySelectorAll<HTMLAnchorElement>("a[href]")]
      .filter(visible)
      .map((anchor) => ({ href: sanitizeUrl(anchor.href), text: (anchor.innerText || anchor.textContent || "").trim().slice(0, 200) }))
      .map((link) => ({ ...link, pattern: patternFor(link.href) }))
      .filter((link): link is { href: string; text: string; pattern: string } => Boolean(link.pattern))
      .slice(0, 100);
    const candidates = all.map((element) => {
      const rect = element.getBoundingClientRect();
      const anchor = element.matches("a[href]") ? element as HTMLAnchorElement : element.querySelector<HTMLAnchorElement>("a[href]");
      const href = anchor ? sanitizeUrl(anchor.href) : undefined;
      const hasMedia = Boolean(element.querySelector("img, video, picture"));
      const area = rect.width * rect.height;
      const cardLike = rect.width >= 140 && rect.width <= 700 && rect.height >= 120 && rect.height <= 1_000 && hasMedia;
      return { element, href, area, cardLike };
    });
    const largeVisibleBlocks = candidates
      .filter((item) => item.area >= 20_000)
      .sort((a, b) => b.area - a.area)
      .slice(0, 30)
      .map(({ element, href }) => ({
        tagName: element.tagName.toLowerCase(),
        className: typeof element.className === "string" ? element.className.slice(0, 300) : "",
        role: element.getAttribute("role") || undefined,
        href,
        innerText: ((element as HTMLElement).innerText || "").trim().slice(0, 200),
        childCount: element.children.length,
        dataAttributeNames: [...element.attributes].map((attribute) => attribute.name).filter((name) => name.startsWith("data-")).slice(0, 20),
      }));
    return {
      nodeCounts: {
        article: document.querySelectorAll("article").length,
        section: document.querySelectorAll("section").length,
        a: document.querySelectorAll("a").length,
        div: document.querySelectorAll("div").length,
        iframe: document.querySelectorAll("iframe").length,
      },
      shadowRootCount: [...document.querySelectorAll("*")].filter((element) => Boolean(element.shadowRoot)).length,
      contentLinks,
      largeVisibleBlocks,
      potentialCardBlockCount: candidates.filter((item) => item.cardLike).length,
    };
  });
}

async function evidenceForText(page: Page, patterns: string[]): Promise<DetectionEvidence[]> {
  const bodyText = await page.locator("body").innerText({ timeout: 3_000 }).catch(() => "");
  return patterns.flatMap((pattern) => bodyText.includes(pattern) ? [{ selector: "body", text: pattern, count: bodyText.split(pattern).length - 1 }] : []);
}

export async function detectRestrictionDiagnostics(page: Page, publicCandidateCount: number): Promise<RestrictionDiagnostics> {
  const loginEvidence = await evidenceForText(page, ["登录后查看搜索结果", "扫码登录", "手机号登录", "登录"]);
  const captchaEvidence = await evidenceForText(page, CAPTCHA_PATTERNS);
  const rateLimitEvidence = await evidenceForText(page, RATE_LIMIT_PATTERNS);
  const modalSelectors = ['[role="dialog"]', '[aria-modal="true"]', '[class*="login-modal"]', '[class*="login-container"]'];
  const modalEvidence: DetectionEvidence[] = [];
  for (const selector of modalSelectors) {
    const locator = page.locator(selector);
    const count = await locator.count().catch(() => 0);
    if (!count) continue;
    const text = await locator.first().innerText({ timeout: 1_000 }).catch(() => "");
    modalEvidence.push({ selector, text: text.slice(0, 200), count });
  }
  const finalUrl = page.url();
  const redirectDetected = LOGIN_URL_PATTERNS.some((pattern) => finalUrl.toLowerCase().includes(pattern));
  const loginDetected = loginEvidence.length > 0 || redirectDetected;
  const captchaDetected = captchaEvidence.length > 0;
  const rateLimitDetected = rateLimitEvidence.length > 0;
  const modalDetected = modalEvidence.length > 0 || (loginEvidence.some((item) => item.text === "登录后查看搜索结果") && publicCandidateCount >= 3);
  const loginWall = loginDetected && publicCandidateCount === 0 && !modalDetected;
  const blocksPublicContent = captchaDetected || rateLimitDetected || loginWall || redirectDetected;
  const manualActionReason = captchaDetected ? "CAPTCHA" : loginWall || redirectDetected ? "LOGIN_WALL" : null;
  const loginSurface = loginWall || redirectDetected ? "WALL" : modalDetected ? "MODAL" : loginDetected ? "ENTRY" : "NONE";
  return {
    manualActionReason,
    loginDetected,
    loginDetectionEvidence: [...loginEvidence, ...modalEvidence],
    loginSurface,
    captchaDetected,
    captchaDetectionEvidence: captchaEvidence,
    rateLimitDetected,
    rateLimitDetectionEvidence: rateLimitEvidence,
    modalDetected,
    redirectDetected,
    blocksPublicContent,
  };
}

export async function saveDomStructureDiagnostics(slug: string, diagnostics: DomStructureDiagnostics): Promise<string> {
  const relativePath = `outputs/real-data-spike/debug/${slug}.dom.json`;
  await mkdir(resolve("outputs/real-data-spike/debug"), { recursive: true });
  await writeFile(resolve(relativePath), `${JSON.stringify(diagnostics, null, 2)}\n`, "utf8");
  return relativePath;
}

export async function updateDebugSnapshot(slug: string, debug: PageDebugSnapshot, restriction: RestrictionDiagnostics, domStructurePath: string): Promise<PageDebugSnapshot> {
  const updated: PageDebugSnapshot = {
    ...debug,
    domStructurePath,
    manualActionReason: restriction.manualActionReason,
    loginDetected: restriction.loginDetected,
    loginDetectionEvidence: restriction.loginDetectionEvidence,
    loginSurface: restriction.loginSurface,
    captchaDetected: restriction.captchaDetected,
    captchaDetectionEvidence: restriction.captchaDetectionEvidence,
    rateLimitDetected: restriction.rateLimitDetected,
    rateLimitDetectionEvidence: restriction.rateLimitDetectionEvidence,
    modalDetected: restriction.modalDetected,
    redirectDetected: restriction.redirectDetected,
    blocksPublicContent: restriction.blocksPublicContent,
  };
  await writeFile(resolve(`outputs/real-data-spike/debug/${slug}.json`), `${JSON.stringify(updated, null, 2)}\n`, "utf8");
  return updated;
}

export function spikeDebugSlug(platform: string, query: string): string {
  return `${platform}_${query.toLowerCase()
    .replace(/长沙/g, "changsha")
    .replace(/哈利波特/g, "harry-potter")
    .replace(/日式美甲/g, "japanese-nails")
    .replace(/酒吧/g, "bars")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}`;
}

export async function savePageDebugSnapshot(
  page: Page,
  slug: string,
  navigation: NavigationMetadata,
  diagnosticStartedAt: string,
  selectorDiagnostics: SelectorDiagnostic[],
  resultRegionSelectors: string[],
  candidateSelectors: string[],
  connectivityProbe?: NavigationMetadata,
): Promise<PageDebugSnapshot> {
  const relativeDir = "outputs/real-data-spike/debug";
  const outputDir = resolve(relativeDir);
  await mkdir(outputDir, { recursive: true });
  const screenshotRelative = `${relativeDir}/${slug}.png`;
  const bodyRelative = `${relativeDir}/${slug}.body.txt`;
  const metadataRelative = `${relativeDir}/${slug}.json`;
  const bodyText = await page.locator("body").innerText({ timeout: 5_000 }).catch(() => "");
  const bodyTextPreview = bodyText.slice(0, 5_000);
  const searchResultRegionExists = (await Promise.all(resultRegionSelectors.map((selector) => page.locator(selector).count().catch(() => 0)))).some((count) => count > 0);
  const candidateNodeCount = (await Promise.all(candidateSelectors.map((selector) => page.locator(selector).count().catch(() => 0)))).reduce((maximum, count) => Math.max(maximum, count), 0);
  const screenshotSaved = await page.screenshot({
    path: resolve(screenshotRelative),
    fullPage: true,
    mask: [page.locator("img"), page.locator("canvas"), page.locator("svg")],
  }).then(() => true).catch(() => false);
  await writeFile(resolve(bodyRelative), `${bodyTextPreview}\n`, "utf8");
  const snapshot: PageDebugSnapshot = {
    ...navigation,
    diagnosticStartedAt,
    finalUrl: sanitizeDiagnosticUrl(page.url()),
    title: await page.title().catch(() => undefined),
    screenshotPath: screenshotSaved ? screenshotRelative : undefined,
    bodySnapshotPath: bodyRelative,
    bodyTextPreview,
    searchResultRegionExists,
    candidateNodeCount,
    selectors: selectorDiagnostics,
    connectivityProbe,
  };
  await writeFile(resolve(metadataRelative), `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  return snapshot;
}

export async function saveNavigationFailureDebug(page: Page, slug: string, navigation: NavigationMetadata, connectivityProbe?: NavigationMetadata): Promise<PageDebugSnapshot> {
  const relativeDir = "outputs/real-data-spike/debug";
  await mkdir(resolve(relativeDir), { recursive: true });
  const snapshot: PageDebugSnapshot = {
    ...navigation,
    diagnosticStartedAt: null,
    finalUrl: sanitizeDiagnosticUrl(page.url()),
    title: await page.title().catch(() => undefined),
    connectivityProbe,
  };
  await writeFile(resolve(`${relativeDir}/${slug}.json`), `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  return snapshot;
}

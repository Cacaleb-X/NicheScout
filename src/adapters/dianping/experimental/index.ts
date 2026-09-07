import type { BusinessDiscoveryAdapter, DiscoveryContext, RawBusinessRecord } from "../../../models/types.ts";
import { collectSelectorDiagnostics, createExperimentalContext, gentlePause, logSpikeStage, navigateSearchPage, observePage, openPage, retainExperimentalContext, saveNavigationFailureDebug, savePageDebugSnapshot, shouldRetainExperimentalContext, spikeDebugSlug, waitForNormalLoading } from "../../experimental/browser.ts";
import type { FieldAvailability, SpikeRun } from "../../experimental/types.ts";

export interface DianpingSpikeRecord {
  store_name?: string;
  store_url?: string;
  city?: string;
  district?: string;
  address?: string;
  category?: string;
  rating?: number;
  review_count?: number;
  avg_price?: number;
  public_phone?: string;
  business_status?: string;
}

function numberFrom(text: string | undefined, expression: RegExp): number | undefined {
  const value = text?.match(expression)?.[1]?.replace(/,/g, "");
  return value ? Number(value) : undefined;
}

export function mapDianpingSnapshot(record: DianpingSpikeRecord, query: string): RawBusinessRecord | undefined {
  if (!record.store_name) return undefined;
  return {
    externalId: record.store_url?.match(/\/shop\/([^/?#]+)/)?.[1] || `experimental-${encodeURIComponent(record.store_name)}`,
    source: "DIANPING",
    storeName: record.store_name,
    city: record.city || query.split(/\s+/)[0] || "",
    district: record.district,
    address: record.address,
    category: record.category,
    rating: record.rating,
    reviewCount: record.review_count,
    avgPrice: record.avg_price,
    publicPhone: record.public_phone,
    sourceUrl: record.store_url,
    status: record.business_status,
    rawData: { experimental: true, query, ...record },
  };
}

function fieldAvailability(records: DianpingSpikeRecord[], loginRequired: boolean): Record<string, FieldAvailability> {
  const fields: Array<keyof DianpingSpikeRecord> = ["store_name", "store_url", "city", "district", "address", "category", "rating", "review_count", "avg_price", "public_phone", "business_status"];
  return Object.fromEntries(fields.map((field) => {
    if (records.some((record) => record[field] !== undefined && record[field] !== "")) return [field, "AVAILABLE"];
    return [field, loginRequired ? "LOGIN_REQUIRED" : "UNCERTAIN"];
  }));
}

export class DianpingExperimentalAdapter implements BusinessDiscoveryAdapter {
  readonly name = "DianpingExperimentalAdapter (EXPERIMENTAL)";

  constructor(private readonly maxResults = 5) {}

  async spike(query: string): Promise<SpikeRun<DianpingSpikeRecord>> {
    const targetUrl = `https://www.dianping.com/search/keyword/344/0_${encodeURIComponent(query)}`;
    const slug = spikeDebugSlug("dianping", query);
    logSpikeStage("START", query, targetUrl);
    const { context, page, pageCreatedAt } = await createExperimentalContext("dianping");
    logSpikeStage("PAGE_CREATED", query, targetUrl, `pageCreatedAt=${pageCreatedAt}`);
    const observations = [];
    const records: DianpingSpikeRecord[] = [];
    try {
      const { observation: initialObservation, navigation } = await navigateSearchPage(page, query, targetUrl, pageCreatedAt);
      if (navigation.navigationStatus === "NAVIGATION_FAILED") {
        const debug = await saveNavigationFailureDebug(page, slug, navigation);
        observations.push(initialObservation);
        return { platform: "DIANPING", experimental: true, query, capturedAt: new Date().toISOString(), accessStatus: "PAGE_ACCESS_FAILED", pageAccessStatus: "PAGE_ACCESS_FAILED", dataExtractionStatus: "DATA_EXTRACTION_FAILED", searchContentStatus: "UNCERTAIN", fieldAvailability: fieldAvailability([], false), observations, debug, results: [] };
      }
      logSpikeStage("WAIT_START", query, targetUrl);
      await waitForNormalLoading(page);
      logSpikeStage("WAIT_END", query, targetUrl);
      const searchObservation = await observePage(page, initialObservation.notes);
      observations.push(searchObservation);
      const resultRegionSelectors = ["#shop-all-list", ".shop-list", '[class*="shop-list"]'];
      const candidateSelectors = ["#shop-all-list li", ".shop-list li", ".shop-item", 'a[href*="/shop/"]'];
      const diagnosticStartedAt = new Date().toISOString();
      logSpikeStage("DIAGNOSTIC_START", query, targetUrl, `diagnosticStartedAt=${diagnosticStartedAt}`);
      const selectorDiagnostics = await collectSelectorDiagnostics(page, [...resultRegionSelectors, ...candidateSelectors]);
      const debug = await savePageDebugSnapshot(page, slug, navigation, diagnosticStartedAt, selectorDiagnostics, resultRegionSelectors, candidateSelectors);
      logSpikeStage("DIAGNOSTIC_END", query, targetUrl, `candidateNodeCount=${debug.candidateNodeCount ?? 0}`);
      if (searchObservation.accessStatus === "MANUAL_ACTION_REQUIRED" || searchObservation.accessStatus === "PAGE_ACCESS_FAILED") {
        const manual = searchObservation.accessStatus === "MANUAL_ACTION_REQUIRED";
        return { platform: "DIANPING", experimental: true, query, capturedAt: new Date().toISOString(), accessStatus: searchObservation.accessStatus, pageAccessStatus: searchObservation.accessStatus, dataExtractionStatus: manual ? "MANUAL_ACTION_REQUIRED" : "DATA_EXTRACTION_FAILED", searchContentStatus: "SEARCH_CONTENT_UNAVAILABLE", fieldAvailability: fieldAvailability([], searchObservation.loginVisible), observations, debug, results: [] };
      }

      const cards = await page.locator("#shop-all-list li, .shop-list li, .shop-item").evaluateAll((elements) => {
        const seen = new Set<string>();
        return elements.map((element) => {
          const anchor = element.querySelector<HTMLAnchorElement>('.tit a[href*="/shop/"], a[title][href*="/shop/"]');
          if (!anchor) return undefined;
          const hrefUrl = new URL(anchor.href, location.href);
          hrefUrl.hash = "";
          const href = hrefUrl.href;
          if (seen.has(href)) return undefined;
          seen.add(href);
          const text = (element as HTMLElement).innerText || "";
          const name = anchor.getAttribute("title")?.trim() || anchor.textContent?.trim() || element.querySelector<HTMLElement>(".tit")?.innerText.trim();
          const tags = [...element.querySelectorAll<HTMLElement>(".tag-addr .tag")].map((node) => node.innerText.trim()).filter(Boolean);
          const starClass = element.querySelector<HTMLElement>(".star_sml")?.className || "";
          const star = starClass.match(/(?:^|\s)star_(\d{2})(?:\s|$)/)?.[1];
          return {
            href,
            name,
            text,
            category: tags[0],
            district: tags[1],
            rating: star ? Number(star) / 10 : undefined,
            reviewCountText: element.querySelector<HTMLElement>(".review-num")?.innerText,
            avgPriceText: element.querySelector<HTMLElement>(".mean-price")?.innerText,
          };
        }).filter(Boolean);
      });

      const normalizedCards = cards.slice(0, this.maxResults) as Array<{ href: string; name?: string; text: string; category?: string; district?: string; rating?: number; reviewCountText?: string; avgPriceText?: string }>;
      for (const card of normalizedCards) {
        records.push({
          store_name: card.name,
          store_url: card.href,
          city: "长沙",
          district: card.district,
          category: card.category,
          rating: card.rating,
          review_count: numberFrom(card.reviewCountText, /(\d[\d,]*)\s*条?(?:评价|点评)/),
          avg_price: numberFrom(card.avgPriceText, /[¥￥]\s*(\d+)/),
        });
      }

      let phoneManualActionRequired = false;
      const detailLimit = Math.min(Math.max(Number(process.env.DIANPING_DETAIL_LIMIT ?? 1) || 0, 0), 1);
      for (let index = 0; index < Math.min(records.length, detailLimit); index += 1) {
        const record = records[index];
        if (!record.store_url) continue;
        const detail = await context.newPage();
        const detailObservation = await openPage(detail, record.store_url);
        observations.push(detailObservation);
        if (detailObservation.captchaVisible || detailObservation.rateLimitVisible || detailObservation.loginVisible) {
          phoneManualActionRequired = detailObservation.captchaVisible || detailObservation.loginVisible;
          await detail.close();
          break;
        }
        const detailText = await detail.locator("body").innerText({ timeout: 5_000 }).catch(() => "");
        record.address = detailText.match(/地址[:：]\s*([^\n]+)/)?.[1]?.trim();
        record.public_phone = detailText.match(/(?:电话|联系电话)[:：]\s*([0-9()\-\s]{7,})/)?.[1]?.trim();
        record.business_status = detailText.match(/暂停营业|停止营业|歇业|营业中/)?.[0];
        await detail.close();
        await gentlePause(page);
      }
      const dataExtractionStatus = records.length ? "DATA_EXTRACTION_SUCCESS" : "DATA_EXTRACTION_FAILED";
      const availability = fieldAvailability(records, false);
      if (!records.some((record) => record.public_phone) && phoneManualActionRequired) availability.public_phone = "MANUAL_ACTION_REQUIRED";
      return { platform: "DIANPING", experimental: true, query, capturedAt: new Date().toISOString(), accessStatus: "PAGE_ACCESS_SUCCESS", pageAccessStatus: "PAGE_ACCESS_SUCCESS", dataExtractionStatus, searchContentStatus: (debug.candidateNodeCount ?? 0) > 0 ? "SEARCH_CONTENT_AVAILABLE" : "SEARCH_CONTENT_UNAVAILABLE", fieldAvailability: availability, observations, debug, results: records };
    } finally {
      if (shouldRetainExperimentalContext()) retainExperimentalContext(context);
      else await context.close();
      logSpikeStage("QUERY_COMPLETE", query, targetUrl);
    }
  }

  async discover(context: DiscoveryContext): Promise<RawBusinessRecord[]> {
    const query = `${context.input.city} ${context.input.niche[0] || ""} ${context.input.category}`.trim();
    const run = await this.spike(query);
    return run.results.map((record) => mapDianpingSnapshot(record, query)).filter((record): record is RawBusinessRecord => Boolean(record));
  }
}

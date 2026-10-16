import type { BusinessDiscoveryAdapter, DiscoveryContext, RawBusinessRecord, StoreCandidate } from "../../models/types.ts";

const AMAP_TEXT_SEARCH_URL = "https://restapi.amap.com/v5/place/text";
const DEFAULT_SHOW_FIELDS = "business";

interface AmapBusiness {
  business_area?: string;
  tel?: string;
  rating?: string;
  cost?: string;
  alias?: string;
}

interface AmapPoi {
  id?: string;
  name?: string;
  alias?: string;
  location?: string;
  type?: string;
  typecode?: string;
  cityname?: string | string[];
  adname?: string | string[];
  adcode?: string;
  address?: string | string[];
  business?: AmapBusiness;
}

interface AmapResponse {
  status?: string;
  info?: string;
  infocode?: string;
  count?: string;
  pois?: AmapPoi[];
}

export interface AmapAdapterOptions {
  key?: string;
  maxResults?: number;
  requestTimeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export class AmapConfigurationError extends Error {
  constructor() {
    super("未配置高德 Web Service Key。请复制 .env.example 为 .env，并设置 AMAP_WEB_SERVICE_KEY；Mock 模式仍可正常使用。");
    this.name = "AmapConfigurationError";
  }
}

export class AmapApiError extends Error {
  constructor(message: string, readonly infoCode?: string) {
    super(message);
    this.name = "AmapApiError";
  }
}

function stringValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value.find(Boolean);
  return value || undefined;
}

function numberValue(value?: string): number | undefined {
  if (!value) return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function locationParts(value?: string): { longitude?: number; latitude?: number } {
  const [longitude, latitude] = (value || "").split(",").map(Number);
  return {
    longitude: Number.isFinite(longitude) ? longitude : undefined,
    latitude: Number.isFinite(latitude) ? latitude : undefined,
  };
}

function amapSourceUrl(poi: AmapPoi): string | undefined {
  if (!poi.location || !poi.name) return poi.id ? `https://www.amap.com/place/${encodeURIComponent(poi.id)}` : undefined;
  const params = new URLSearchParams({ position: poi.location, name: poi.name, src: "nichescout", coordinate: "gaode", callnative: "0" });
  return `https://uri.amap.com/marker?${params.toString()}`;
}

export function mapAmapPoi(poi: AmapPoi, fallbackCity: string): RawBusinessRecord | undefined {
  if (!poi.id || !poi.name) return undefined;
  const business = poi.business || {};
  return {
    externalId: poi.id,
    source: "AMAP",
    storeName: poi.name,
    alias: poi.alias || business.alias,
    city: stringValue(poi.cityname) || fallbackCity,
    district: stringValue(poi.adname),
    adcode: poi.adcode || undefined,
    businessArea: business.business_area || undefined,
    address: stringValue(poi.address),
    category: poi.type,
    typecode: poi.typecode,
    publicPhone: business.tel || undefined,
    rating: numberValue(business.rating),
    avgPrice: numberValue(business.cost),
    sourceUrl: amapSourceUrl(poi),
    ...locationParts(poi.location),
    rawData: poi,
  };
}

export class AmapAdapter implements BusinessDiscoveryAdapter {
  readonly name = "AmapAdapter";
  private readonly key?: string;
  private readonly maxResults: number;
  private readonly requestTimeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: AmapAdapterOptions = {}) {
    this.key = options.key !== undefined ? options.key : process.env.AMAP_WEB_SERVICE_KEY;
    this.maxResults = Math.min(Math.max(options.maxResults ?? 25, 1), 50);
    this.requestTimeoutMs = Math.min(Math.max(options.requestTimeoutMs ?? 15_000, 1_000), 60_000);
    this.fetchImpl = options.fetchImpl || fetch;
  }

  isConfigured(): boolean {
    return Boolean(this.key?.trim());
  }

  assertConfigured(): void {
    if (!this.isConfigured()) throw new AmapConfigurationError();
  }

  async testConnection(city = "长沙", keyword = "酒吧"): Promise<RawBusinessRecord | undefined> {
    return (await this.search(keyword, city, 1))[0];
  }

  async searchCandidate(candidate: StoreCandidate, limit = 5): Promise<RawBusinessRecord[]> {
    return this.search(candidate.candidateName, candidate.city, Math.min(Math.max(limit, 1), 10));
  }

  async search(keyword: string, city: string, limit = this.maxResults): Promise<RawBusinessRecord[]> {
    this.assertConfigured();
    const pageSize = Math.min(Math.max(limit, 1), 25);
    const params = new URLSearchParams({
      key: this.key,
      keywords: keyword,
      region: city,
      city_limit: "true",
      show_fields: DEFAULT_SHOW_FIELDS,
      page_size: String(pageSize),
      page_num: "1",
    });
    const response = await this.fetchImpl(`${AMAP_TEXT_SEARCH_URL}?${params.toString()}`, {
      signal: AbortSignal.timeout(this.requestTimeoutMs),
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new AmapApiError(`高德 POI Search 2.0 HTTP ${response.status}`);
    const data = await response.json() as AmapResponse;
    if (data.status !== "1") throw new AmapApiError(`高德 API 请求失败：${data.info || "UNKNOWN_ERROR"}`, data.infocode);
    return (data.pois || []).flatMap((poi) => {
      const mapped = mapAmapPoi(poi, city);
      return mapped ? [mapped] : [];
    });
  }

  async discover(context: DiscoveryContext): Promise<RawBusinessRecord[]> {
    const terms = [...new Set([
      ...context.input.niche.flatMap((item) => item.split(/[,，/、|]+/)).map((item) => item.trim()).filter(Boolean),
      context.input.category,
    ])].slice(0, 4);
    const perQuery = Math.min(25, Math.max(5, Math.ceil(this.maxResults / Math.max(terms.length, 1))));
    const batches: RawBusinessRecord[][] = [];
    for (const term of terms) {
      const keyword = term === context.input.category ? term : `${term} ${context.input.category}`.trim();
      batches.push(await this.search(keyword, context.input.city, perQuery));
    }
    const unique = new Map<string, RawBusinessRecord>();
    for (const record of batches.flat()) unique.set(record.externalId, record);
    return [...unique.values()].slice(0, this.maxResults);
  }
}

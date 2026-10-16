import type { BrowserContext, Page } from "playwright";
import type { DiscoveryContext, SocialPost, SocialSearchAdapter, SocialSearchResult } from "../../models/types.ts";

interface PublicSearchCard {
  noteId: string;
  title: string;
  noteUrl: string;
  authorName: string;
  authorProfileUrl?: string;
  snippet: string;
}

function sanitizePublicUrl(value: string): string {
  const url = new URL(value);
  for (const key of [...url.searchParams.keys()]) {
    if (/token|sign|auth|session|xsec/i.test(key)) url.searchParams.delete(key);
  }
  return url.href;
}

async function collectCards(page: Page): Promise<PublicSearchCard[]> {
  return page.locator("section.note-item[data-note-id], section.note-item").evaluateAll((nodes) => nodes.flatMap((node) => {
    const noteAnchor = node.querySelector<HTMLAnchorElement>('a[href*="/explore/"], a[href*="/search_result/"]');
    if (!noteAnchor) return [];
    const noteUrl = new URL(noteAnchor.href, location.href);
    const profile = node.querySelector<HTMLAnchorElement>('a[href*="/user/profile/"]');
    const titleNode = node.querySelector<HTMLElement>(".title, .footer .title, [class*='title']");
    const lines = ((node as HTMLElement).innerText || "").split("\n").map((line) => line.trim()).filter(Boolean);
    const title = titleNode?.innerText?.trim() || lines[0] || "";
    const authorName = profile?.querySelector<HTMLElement>(".name")?.innerText?.trim() || profile?.innerText?.trim() || "UNKNOWN";
    if (!title) return [];
    const clean = (url: URL): string => {
      for (const key of [...url.searchParams.keys()]) if (/token|sign|auth|session|xsec/i.test(key)) url.searchParams.delete(key);
      return url.href;
    };
    return [{
      noteId: node.getAttribute("data-note-id") || noteUrl.pathname.split("/").filter(Boolean).at(-1) || "",
      title,
      noteUrl: clean(noteUrl),
      authorName,
      authorProfileUrl: profile ? clean(new URL(profile.href, location.href)) : undefined,
      snippet: lines.filter((line) => line !== authorName).join(" ").slice(0, 500),
    }];
  }));
}

function pageRestriction(text: string, url: string): SocialSearchResult["status"] | undefined {
  const haystack = `${url}\n${text}`;
  if (/安全验证|访问验证|滑块验证|完成验证|验证码|captcha/i.test(haystack)) return "CAPTCHA_REQUIRED";
  if (/\/login|pclogin|passport|登录后查看搜索结果/i.test(haystack)) return "MANUAL_LOGIN_REQUIRED";
  return undefined;
}

function cardToPost(card: PublicSearchCard, query: string, city: string): SocialPost {
  const safeNoteUrl = sanitizePublicUrl(card.noteUrl);
  const safeProfileUrl = card.authorProfileUrl ? sanitizePublicUrl(card.authorProfileUrl) : undefined;
  return {
    externalId: card.noteId,
    source: "XIAOHONGSHU",
    authorId: safeProfileUrl?.match(/\/user\/profile\/([^/?#]+)/)?.[1] || `unknown-${card.noteId}`,
    authorName: card.authorName,
    authorProfileUrl: safeProfileUrl,
    authorType: "UGC",
    title: card.title,
    body: card.snippet,
    hashtags: [],
    city,
    sourceUrl: safeNoteUrl,
    rawData: {
      subset: "PUBLIC_SEARCH_CARD", query, note_id: card.noteId, title: card.title, note_url: safeNoteUrl,
      author_name: card.authorName, author_profile_url: safeProfileUrl, visible_snippet: card.snippet,
    },
  };
}

export class XiaohongshuSearchCardAdapter implements SocialSearchAdapter {
  readonly name = "XiaohongshuSearchCardAdapter (EXPERIMENTAL)";

  constructor(private readonly maxResults = 30) {}

  async search(context: DiscoveryContext): Promise<SocialSearchResult> {
    const { chromium } = await import("playwright");
    const headless = !["0", "false", "no"].includes((process.env.XHS_HEADLESS || process.env.HEADLESS || "true").toLowerCase());
    const browser = await chromium.launch({ executablePath: chromium.executablePath(), headless });
    const browserContext: BrowserContext = await browser.newContext({ locale: "zh-CN", viewport: { width: 1365, height: 900 } });
    const posts: SocialPost[] = [];
    let status: SocialSearchResult["status"] = "OK";
    try {
      const page = browserContext.pages()[0] || await browserContext.newPage();
      const nicheTerms = context.input.niche.flatMap((item) => item.split(/[,，/、|]+/)).map((item) => item.trim()).filter(Boolean).slice(0, 2);
      const queryTerms = nicheTerms.length ? nicheTerms : [context.input.niche[0]];
      for (const niche of queryTerms) {
        if (posts.length >= this.maxResults) break;
        const query = `${context.input.city} ${niche} ${context.input.category}`.trim();
        const target = `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(query)}&source=web_search_result_notes`;
        await page.goto(target, { waitUntil: "domcontentloaded", timeout: 25_000 }).catch(() => undefined);
        await page.waitForTimeout(Math.min(Math.max(Number(process.env.XHS_WAIT_MS || 8_000), 0), 30_000));
        const cards = await collectCards(page);
        if (!cards.length) {
          const body = await page.locator("body").innerText({ timeout: 3_000 }).catch(() => "");
          status = pageRestriction(body, page.url()) || status;
          continue;
        }
        for (const card of cards.slice(0, this.maxResults - posts.length)) {
          posts.push(cardToPost(card, query, context.input.city));
        }
      }
    } finally {
      await browserContext.close().catch(() => undefined);
      await browser.close().catch(() => undefined);
    }
    const uniquePosts = [...new Map(posts.map((post) => [post.externalId, post])).values()];
    return { posts: uniquePosts, accounts: [], status };
  }

}

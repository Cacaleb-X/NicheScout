import test from "node:test";
import assert from "node:assert/strict";
import { classifyPageState, navigateSearchPage, sanitizeDiagnosticUrl, spikeDebugSlug } from "../src/adapters/experimental/browser.ts";
import { mapDianpingSnapshot } from "../src/adapters/dianping/experimental/index.ts";
import { isXiaohongshuContentUrl, mapXiaohongshuSnapshot, sanitizeXiaohongshuPublicUrl } from "../src/adapters/xiaohongshu/experimental/index.ts";
import { parseSpikeOptions, validateSpikeOptions } from "../src/spikes/options.ts";

test("experimental page state stops for CAPTCHA and reports login", () => {
  assert.equal(classifyPageState("请完成安全验证").accessStatus, "MANUAL_ACTION_REQUIRED");
  assert.equal(classifyPageState("扫码登录后查看更多").accessStatus, "MANUAL_ACTION_REQUIRED");
  assert.equal(classifyPageState("", "https://account.dianping.com/pclogin").loginVisible, true);
  assert.equal(classifyPageState("正常搜索页面").accessStatus, "PAGE_ACCESS_SUCCESS");
  assert.equal(classifyPageState("获取验证码").captchaVisible, false);
  assert.equal(classifyPageState("请依次点击下图图标", "https://verify.meituan.com/v2/app/general_page").captchaVisible, true);
});

test("debug artifact names are deterministic and contain no query text spaces", () => {
  assert.equal(spikeDebugSlug("xiaohongshu", "长沙 日式美甲"), "xiaohongshu_changsha-japanese-nails");
});

test("diagnostic URLs remove transient identifiers and nested redirect targets", () => {
  assert.equal(
    sanitizeDiagnosticUrl("https://www.xiaohongshu.com/website-login/error?error_code=300017&uuid=temporary&redirectPath=private&requestCode=challenge"),
    "https://www.xiaohongshu.com/website-login/error?error_code=300017",
  );
});

test("single-query headed CLI options are parsed without changing the query", () => {
  const options = parseSpikeOptions(["--headed", "--query", "长沙 哈利波特 酒吧"]);
  assert.deepEqual(options, { headed: true, query: "长沙 哈利波特 酒吧" });
  assert.doesNotThrow(() => validateSpikeOptions(options));
  assert.throws(() => validateSpikeOptions({ headed: true }), /requires --query/);
  assert.throws(() => parseSpikeOptions(["--query"]), /non-empty/);
});

test("failed navigation never classifies about:blank as page access success", async () => {
  const fakePage = {
    goto: async () => { throw new Error("navigation failed"); },
    url: () => "about:blank",
    title: async () => "",
    locator: () => ({ innerText: async () => "", count: async () => 0 }),
  };
  const result = await navigateSearchPage(fakePage as never, "长沙 哈利波特 酒吧", "https://example.invalid/search", "2026-09-07T00:00:00.000Z");
  assert.equal(result.observation.accessStatus, "PAGE_ACCESS_FAILED");
  assert.equal(result.navigation.navigationAttempted, true);
  assert.equal(result.navigation.navigationSucceeded, false);
  assert.match(result.navigation.navigationError || "", /navigation failed/);
});

test("timeout with a target URL and document content is navigation partial", async () => {
  const fakePage = {
    goto: async () => { throw new Error("Timeout 25000ms exceeded"); },
    url: () => "https://www.xiaohongshu.com/search_result/?keyword=test",
    title: async () => "测试 - 小红书搜索",
    locator: (selector: string) => ({ innerText: async () => selector === "body" ? "已显示搜索内容" : "", count: async () => 1 }),
  };
  const result = await navigateSearchPage(fakePage as never, "测试", "https://www.xiaohongshu.com/search_result/?keyword=test", "2026-09-07T00:00:00.000Z", "commit");
  assert.equal(result.navigation.navigationStatus, "NAVIGATION_PARTIAL");
  assert.equal(result.observation.accessStatus, "PAGE_ACCESS_SUCCESS");
  assert.equal(result.navigation.bodyOrDomPresent, true);
});

test("Dianping experimental records map into RawBusinessRecord", () => {
  const result = mapDianpingSnapshot({ store_name: "测试酒吧", store_url: "https://www.dianping.com/shop/abc", city: "长沙", public_phone: "0731-12345678" }, "长沙 酒吧");
  assert.equal(result?.source, "DIANPING");
  assert.equal(result?.publicPhone, "0731-12345678");
});

test("Xiaohongshu authors remain UGC unless a separate profile is assessed", () => {
  const result = mapXiaohongshuSnapshot({ note_id: "n1", title: "探店笔记", note_url: "https://www.xiaohongshu.com/explore/n1", author_name: "普通用户" }, "长沙 酒吧");
  assert.equal(result.post?.externalId, "n1");
  assert.equal(result.post?.authorType, "UGC");
  assert.equal(result.account, undefined);
});

test("Xiaohongshu content URLs are recognized and sensitive URL parameters are removed", () => {
  assert.equal(isXiaohongshuContentUrl("https://www.xiaohongshu.com/explore/abc123"), true);
  assert.equal(isXiaohongshuContentUrl("https://www.xiaohongshu.com/search_result/?keyword=test"), false);
  assert.equal(sanitizeXiaohongshuPublicUrl("https://www.xiaohongshu.com/explore/abc?xsec_token=secret&source=web"), "https://www.xiaohongshu.com/explore/abc?source=web");
});

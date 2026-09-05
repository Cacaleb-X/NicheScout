import type { DiscoveryContext, RawBusinessRecord, SocialAccount, SocialPost } from "../../models/types.ts";

const districts = ["五一广场", "芙蓉区", "岳麓区", "开福区", "天心区", "雨花区", "梅溪湖"];
const themes = [
  { name: "9¾魔法酒馆", description: "沉浸式魔法主题空间，分院帽与魔法课堂场景", words: ["哈利波特", "霍格沃茨", "分院帽", "魔法"] },
  { name: "霍格沃茨秘密酒吧", description: "Harry Potter风格主题酒吧", words: ["哈利波特", "霍格沃茨", "魔法"] },
  { name: "对角巷魔法酒馆", description: "魔法主题沉浸式体验", words: ["魔法", "沉浸式", "对角巷"] },
  { name: "猫头鹰邮局酒吧", description: "英伦魔法主题鸡尾酒", words: ["魔法", "猫头鹰", "哈利波特"] },
  { name: "月影沉浸剧场酒吧", description: "剧情互动与场景式体验", words: ["沉浸式", "主题体验"] },
  { name: "英伦老巷清吧", description: "复古英伦风格精酿酒吧", words: ["英伦", "复古"] },
  { name: "星城精酿实验室", description: "本地精酿和鸡尾酒", words: ["精酿", "鸡尾酒"] },
  { name: "微醺现场", description: "现场音乐与轻饮", words: ["音乐", "清吧"] },
];

export function buildMockBusinesses(context: DiscoveryContext): RawBusinessRecord[] {
  const records: RawBusinessRecord[] = [];
  const { city, category } = context.input;
  for (let index = 0; index < 64; index += 1) {
    const theme = themes[index % themes.length];
    const district = context.input.district || districts[index % districts.length];
    const branchName = `${district}${Math.floor(index / districts.length) + 1}店`;
    const phone = index % 4 === 0 ? undefined : `0731-${String(88000000 + index * 137).slice(0, 8)}`;
    const record: RawBusinessRecord = {
      externalId: `mock-dp-${index + 1}`,
      source: "DIANPING",
      storeName: `${theme.name}（${branchName}）`,
      brandName: theme.name,
      branchName,
      city,
      district,
      address: `${district}示范路${index + 8}号`,
      category,
      description: theme.description,
      rating: Math.round((3.8 + (index % 12) / 10) * 10) / 10,
      reviewCount: 36 + index * 17,
      avgPrice: 58 + (index % 8) * 12,
      publicPhone: phone,
      sourceUrl: `https://example.com/dianping/mock-store-${index + 1}`,
      status: "OPEN",
      longitude: 112.91 + (index % 10) * 0.006,
      latitude: 28.17 + (index % 9) * 0.005,
      rawData: { mock: true, query: context.queries[index % context.queries.length]?.text },
    };
    records.push(record);
    if (index % 11 === 0) {
      records.push({ ...record, externalId: `mock-search-${index + 1}`, source: "SEARCH_ENGINE", storeName: record.storeName.replace("9¾", "九又四分之三"), rawData: { mock: true, duplicateOf: record.externalId } });
    }
  }
  return records;
}

export function buildMockSocial(context: DiscoveryContext): { posts: SocialPost[]; accounts: SocialAccount[] } {
  const posts: SocialPost[] = [];
  const accounts: SocialAccount[] = [];
  const now = new Date();
  for (let index = 0; index < 64; index += 1) {
    const theme = themes[index % themes.length];
    const district = context.input.district || districts[index % districts.length];
    const branchName = `${district}${Math.floor(index / districts.length) + 1}店`;
    const storeName = `${theme.name}（${branchName}）`;
    const postCount = index % 8 < 5 ? 2 + (index % 3) : 1;
    for (let postIndex = 0; postIndex < postCount; postIndex += 1) {
      const isMedia = postIndex === 1 && index % 5 === 0;
      posts.push({
        externalId: `mock-xhs-post-${index}-${postIndex}`,
        source: "MOCK",
        authorId: `consumer-${index}-${postIndex}`,
        authorName: isMedia ? "长沙吃喝指南" : `小羊探店${index}${postIndex}`,
        authorType: isMedia ? "LOCAL_MEDIA" : postIndex === 0 && index % 3 === 0 ? "KOL_KOC" : "UGC",
        title: index % 8 < 5 ? `${context.input.city}${theme.words[0]}主题店打卡` : `${context.input.city}周末小酒馆`,
        body: index % 8 < 5 ? `在${storeName}体验了${theme.words.join("、")}，店铺不是作者本人经营。` : `朋友聚会去了${storeName}。`,
        hashtags: index % 8 < 5 ? theme.words : ["长沙探店", context.input.category],
        poi: storeName,
        city: context.input.city,
        district,
        mentionedStoreName: storeName,
        sourceUrl: `https://example.com/xhs/post-${index}-${postIndex}`,
        publishedAt: new Date(now.getTime() - (index + postIndex) * 86_400_000).toISOString(),
        rawData: { mock: true },
      });
    }
    if (index % 3 !== 2) {
      const official = index % 3 === 0;
      accounts.push({
        externalId: `mock-xhs-account-${index}`,
        source: "MOCK",
        handle: `@${official ? "official" : "maybe"}_${index + 1}`,
        displayName: official ? `${theme.name}官方` : `${theme.name}${district}`,
        bio: official ? `官方账号｜${district}营业时间14:00-02:00｜到店预约` : `${district}主题空间，欢迎私信`,
        authorType: official ? "OFFICIAL" : "POSSIBLE_OFFICIAL",
        claimedStoreName: storeName,
        city: context.input.city,
        profileUrl: `https://example.com/xhs/user-${index}`,
        lastActive: new Date(now.getTime() - (index % 55) * 86_400_000).toISOString(),
        publicWechat: index % 9 === 0 ? `magicbar${100 + index}` : undefined,
        confidence: official ? 0.96 : 0.76,
        rawData: { mock: true },
      });
    }
  }
  // This UGC-only store proves that a store can be discovered without treating the author as its owner.
  posts.push({
    externalId: "mock-xhs-ugc-only", source: "MOCK", authorId: "ugc-only-author", authorName: "阿圆今天去哪儿",
    authorType: "UGC", title: `${context.input.city}隐藏的哈利波特酒吧`, body: "发现了一家叫魔法坩埚的沉浸式小店。",
    hashtags: ["哈利波特", "魔法主题"], poi: "魔法坩埚", city: context.input.city,
    district: context.input.district || "五一广场", mentionedStoreName: "魔法坩埚",
    sourceUrl: "https://example.com/xhs/ugc-only", publishedAt: now.toISOString(), rawData: { mock: true, discoveryOnly: true },
  });
  return { posts, accounts };
}

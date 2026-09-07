# NicheScout Real Data Feasibility

Test date: 2026-09-07

Scope: four bounded real-data cases, at most five extracted results per query. No CAPTCHA solving, login bypass, anti-bot circumvention, concurrency, or bulk collection was used. Browser profiles remain local and are ignored by Git.

## Executive Decision

- Xiaohongshu public search cards are feasible as a low-volume niche discovery and evidence source.
- Dianping is only partially feasible as an automated verification source. Anonymous search redirected to login; manual login enabled the standard category search, but a later detail probe triggered an image-click CAPTCHA and the next search remained blocked by the verification center.
- No public business phone was obtained. Dianping cannot currently be accepted as NicheScout's automated phone source.
- Recommended architecture: Xiaohongshu search cards for niche discovery, StoreMatcher for entity resolution, and a compliant structured map/business source for verification and phone. Dianping should remain an experimental/manual corroboration source until its stability is materially better.

## Tested Cases

| Platform | Query | Navigation | Extraction | Candidates | Results | Restriction |
| --- | --- | --- | --- | ---: | ---: | --- |
| Xiaohongshu | 长沙 哈利波特 酒吧 | `NAVIGATION_SUCCESS` | `DATA_EXTRACTION_SUCCESS` | 20 | 5 | None on search page |
| Xiaohongshu | 长沙 日式美甲 | `NAVIGATION_SUCCESS` | `DATA_EXTRACTION_SUCCESS` | 20 | 5 | None on search page |
| Dianping | 长沙 酒吧 | Login redirect anonymously; success after manual scan | `DATA_EXTRACTION_SUCCESS` after login | 15 merchant cards observed; old selector also counted 60 nested links | 3 structurally verified samples retained | CAPTCHA appeared during later detail probe |
| Dianping | 长沙 哈利波特 酒吧 | Browser reached Meituan verification center | `MANUAL_ACTION_REQUIRED` | 0 | 0 | Image-click CAPTCHA; no attempt to solve it |

## Xiaohongshu

### Search

`SUCCESS`

Both tested queries opened the real search page and exposed public search cards. The same parser found 20 unique note candidates for each query and retained five results per query.

### Tested Queries

- `长沙 哈利波特 酒吧`
- `长沙 日式美甲`

### Search Results

`SUCCESS`

The card structure observed in both cases was:

```text
div.feeds-container
└── section.note-item[data-note-id]
    ├── content link: /explore/{note_id} or /search_result/{note_id}
    └── author link: /user/profile/{author_id}
```

Cards were in the main document. They were not inside an iframe or Shadow DOM. Stable semantic/data attributes were sufficient; Vue `data-v-*` hashes were not used.

### Available Fields

| Field | Status | Evidence |
| --- | --- | --- |
| `note_id` | `AVAILABLE` | Present as `data-note-id` and in the content URL |
| `title` | `AVAILABLE` | Visible card title |
| `note_url` | `AVAILABLE` | Public content link on the card |
| `author_name` | `AVAILABLE` | Visible card author label |
| `author_profile_url` | `AVAILABLE` | `/user/profile/{author_id}` link on the card |
| `text_snippet` | `AVAILABLE` | Bounded visible card text; not full note body |
| `publish_time` | `NOT_AVAILABLE_FROM_SEARCH_CARD` | A date-like label is visible in some cards, but its semantics/stability were not validated |
| `hashtags` | `NOT_AVAILABLE_FROM_SEARCH_CARD` | None in the retained Japanese-nails cards |
| `poi` | `NOT_AVAILABLE_FROM_SEARCH_CARD` | No stable POI field observed |
| `mentioned_accounts` | `NOT_AVAILABLE_FROM_SEARCH_CARD` | No stable field observed |
| profile bio/activity/account classification | `NOT_AVAILABLE_FROM_SEARCH_CARD` | Requires separate profile validation |

### Relevance

The Harry Potter query returned multiple cards explicitly referring to Harry Potter, magic-bar themes, and a repeated venue nickname. This demonstrates discovery of a niche venue even when the merchant name itself may not contain the niche keyword.

For the Japanese-nails query, four of five retained titles were explicitly related to Japanese-style nail services in Changsha; the remaining card came from a nail-branded author. The second niche therefore confirmed that the parser was not specific to the Harry Potter query. Individual UGC titles and author identifiers are intentionally omitted from this repository report.

### Note Data

`PARTIAL`

Search-card title, visible snippet, author and URLs are available. Complete note text was not collected. Direct detail navigation previously produced Xiaohongshu error `300017`; no further attempt was made in this phase.

### POI

`FAILED`

No stable POI was obtained from the public search cards.

### Author Data

`PARTIAL`

Author name and profile URL were available on search cards. Profile bio and recent activity were not tested because the scoped run did not navigate into profiles.

### Official Account Detection

`PARTIAL`

Business-like author names and profile URLs can be collected as leads; two business-branded author labels appeared in the retained sample. Individual author identifiers are intentionally omitted. This is only a lead: an UGC author is never promoted directly to a Store Entity or official account. A later profile/cross-source verification step is required.

### Login

Search-card extraction completed without a blocking login wall in both successful runs. A normal login entry or dismissible login modal must not be treated as a blocker when cards are already present.

### CAPTCHA

No CAPTCHA occurred on the two successful search-card runs. The earlier generic “获取验证码” false positive was corrected and is covered by an offline test.

### Stability

`MEDIUM`

Two different niches produced the same usable DOM pattern and five results each. Stability is not `HIGH` because this was a small sample, persistent browser state may affect behavior, and detail navigation was restricted.

### Role Assessment

| Role | Decision | Reason |
| --- | --- | --- |
| Niche discovery source | `SUCCESS` | Both niche queries returned relevant public content evidence |
| Store discovery source | `PARTIAL` | Titles/snippets expose venue names such as “麻瓜的客厅”, but no stable POI or normalized merchant identity is guaranteed |
| Official account discovery source | `PARTIAL` | Author profile links and business-like names are useful leads, but require independent verification |

### Recommendation

Build a bounded experimental-to-formal adapter for search cards only. Treat every result as UGC evidence and an entity-resolution hint. Do not make note detail, POI, phone, or official-account classification dependencies of the initial integration.

## Dianping

### Search

`PARTIAL`

Anonymous access to `长沙 酒吧` redirected to `account.dianping.com/pclogin`; zero merchant cards were available. After a manual App scan using the persistent local browser profile, the same search URL loaded a real list with 15 merchant cards visible.

The later `长沙 哈利波特 酒吧` request was redirected to `verify.meituan.com` with an image-click challenge. The challenge was recorded and left unsolved, so niche-query relevance could not be measured.

### Tested Queries

- `长沙 酒吧`
- `长沙 哈利波特 酒吧`

### Available Fields

From the logged-in `长沙 酒吧` search cards:

| Field | Status | Evidence |
| --- | --- | --- |
| `store_name` | `AVAILABLE` | `.tit` merchant title |
| `store_url` | `AVAILABLE` | Canonical `/shop/{id}` link |
| `city` | `AVAILABLE` | Query/search context |
| `district` | `UNCERTAIN` | Search card exposed business area, not reliably an administrative district |
| `address` | `NOT_AVAILABLE` from tested search cards | Detail access required for confirmation |
| `category` | `AVAILABLE` | First `.tag-addr .tag` value |
| `rating` | `AVAILABLE` | `star_45` style value mapped to 4.5, etc. |
| `review_count` | `AVAILABLE` | `.review-num` text |
| `avg_price` | `AVAILABLE` | `.mean-price` text |
| `public_phone` | `MANUAL_ACTION_REQUIRED` | Not present on search card; detail probe reached verification challenge before a phone was obtained |
| `business_status` | `UNCERTAIN` | No stable status field confirmed |

Verified public examples included:

- `ZAZOO LIVE(长沙解放西店)`: Live House, 4.5, 2353 reviews, average ¥108.
- `HIB HUB公社(解放西路店)`: 特调酒吧, 4.0, 5423 reviews, average ¥106.
- `BOTTLE CLUB`: 小酒馆, 3.5, 1690 reviews, average ¥173.

### Missing Fields

Exact street address, public phone, and business status were not obtained in a stable bounded flow. The displayed business-area text must not be mislabeled as an administrative district.

### Login

`REQUIRED` in the tested anonymous environment. The first search URL redirected to the Dianping login page. Manual App scan succeeded, and the saved local profile enabled the standard search results.

### CAPTCHA

`ENCOUNTERED`

After the logged-in search and a small number of merchant/detail navigations, a one-store detail DOM probe reached the Meituan verification center with “请依次点击下图图标”. The immediately following niche search also remained at the verification center. No solve or bypass was attempted.

### Rate Limiting

No explicit HTTP 429 or “访问过于频繁” message was observed. However, the verification challenge appeared after a very small sequence of navigations, which is operationally equivalent to a strong automation stability constraint for this spike.

### Public Phone

`FAILED`

No phone number was obtained. Search cards did not show phone data, and the bounded detail probe triggered `MANUAL_ACTION_REQUIRED`. This does not prove that Dianping never displays phone numbers; it proves that the tested Playwright workflow did not reliably obtain one.

### Stability

`LOW`

The standard search became readable only after manual login, while detail access and the next search triggered a verification challenge. This is insufficient for an unattended production adapter.

### Role Assessment

| Role | Decision | Reason |
| --- | --- | --- |
| Store verification source | `PARTIAL` | Logged-in standard search confirms real merchants and canonical URLs, but access is not stable |
| Basic business data source | `PARTIAL` | Search cards provide useful basics; address/status were not confirmed |
| Public phone source | `FAILED` | No phone obtained; detail flow required manual action |

### Recommendation

Keep Dianping experimental and manual-assisted. Do not make it the primary discovery or phone source in Phase 3. If retained, constrain it to occasional corroboration of a known Store Entity and stop immediately on login/CAPTCHA states.

## Recommended Primary Discovery Source

Decision: `C`, but with a different primary verification source.

Recommended flow:

```text
Xiaohongshu public search cards
→ niche evidence + candidate store/account names
→ StoreMatcher
→ compliant map/business directory or search source
→ verified Store Entity + address + public business phone
→ optional manual Dianping corroboration
```

The originally proposed `Xiaohongshu → Dianping → StoreMatcher` path is conceptually supported for discovery and merchant corroboration, but the tested Dianping Playwright path is too unstable to own automated verification or phone acquisition.

## Playwright Assessment

| Platform/scope | Decision |
| --- | --- |
| Xiaohongshu public search cards | Worth continuing at low volume; `MEDIUM` stability |
| Xiaohongshu note detail | Do not prioritize; error `300017` observed |
| Dianping logged-in search | Useful for experiments/manual corroboration only |
| Dianping detail/phone | Not suitable as an unattended Playwright workflow in the observed state |

## Phase 3 Recommendation

1. Formalize only the Xiaohongshu search-card subset behind an explicitly bounded adapter.
2. Add a compliant structured map/business source as the primary Store Entity verification and public-phone source.
3. Feed XHS titles/snippets/author profile URLs into StoreMatcher as evidence, never as automatic proof that the author owns the store.
4. Keep Dianping behind an experimental/manual flag and do not retry automatically after verification appears.

This ordering preserves the demonstrated niche-discovery value while avoiding a production dependency on the two unstable detail-page paths.

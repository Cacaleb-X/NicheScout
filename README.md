# NicheScout

NicheScout is a local-first CLI for turning a niche business idea into a reviewable Excel lead list.

```text
city + category + niche
→ store candidates
→ entity matching and optional verification
→ XLSX
```

The stable demo is deterministic and uses mock data. Experimental public-search adapters and the optional AMap provider are isolated from the default workflow, so no account, browser session, or API key is required to explore the project.

## What it does

NicheScout expands a query such as `长沙 + 酒吧 + 哈利波特主题`, discovers candidate stores, resolves evidence to store entities, scores the results, stores a local task record, and exports an Excel workbook for human review.

The project is intentionally a CLI. It does not provide a frontend, CRM, automatic messaging, phone automation, or login/CAPTCHA bypass.

## Requirements

- Node.js 24 or newer
- npm
- Git
- Playwright browsers only when explicitly running an experimental browser spike

## Quick start

```bash
git clone <repository-url>
cd NicheScout
npm install
npm run demo
npm test
```

The demo writes `outputs/demo_changsha_harry_potter_bars.xlsx`. It uses only bundled mock data and does not call any external service.

## CLI

```bash
npm run scout -- \
  --city "长沙" \
  --district "五一广场" \
  --category "酒吧" \
  --niche "哈利波特主题,魔法主题,沉浸式" \
  --limit 30 \
  --exclude "连锁,低价" \
  --output "outputs/my_leads.xlsx"
```

Optional arguments:

- `--district`: geographic hint
- `--exclude`: comma-separated exclusion terms
- `--manual`: path to a local JSON file containing manually supplied stores
- `--output`: XLSX output path

The bundled `examples/manual-stores.json` contains fictional data.

## Optional AMap verification

`AmapAdapter` uses the official AMap Web Service POI Search 2.0 API. It verifies candidate stores and may return a normalized name, address, district, business area, POI ID, category, and public business telephone.

AMap is optional. Without a key, its commands exit normally and print `provider skipped`; the demo and tests continue to work.

```bash
cp .env.example .env
# Set AMAP_WEB_SERVICE_KEY in .env
npm run amap:check
```

The bounded verification workflow is:

```bash
npm run scout:real -- \
  --city "长沙" \
  --category "酒吧" \
  --niche "哈利波特主题,魔法主题" \
  --limit 20 \
  --output "outputs/leads/changsha_magic_bars.xlsx"
```

AMap is used only for store verification. A missing telephone is not a verification failure, and the adapter never invents or completes telephone numbers.

## Experimental Xiaohongshu adapter

`XiaohongshuExperimentalAdapter` and the bounded search-card adapter are experimental. They are not used by `npm run demo` or the stable mock CLI.

The adapters:

- read only visible public search-card fields;
- do not open note detail pages or user profiles;
- start with a fresh anonymous browser context and do not reuse a user's login session;
- stop and report login, CAPTCHA, rate-limit, or access restrictions;
- do not solve challenges, collect cookies, or attempt login automation;
- write diagnostic artifacts only under ignored local output directories.

Run an experiment explicitly:

```bash
npm run spike:xhs -- --query "长沙 哈利波特 酒吧"
```

Website behavior and terms can change. Review applicable rules before running any experiment, keep volumes low, and do not treat experimental output as production data.

## Excel output

The stable demo workbook includes ranked stores, match/contact/priority scores, public contact provenance, supporting evidence, and blank human follow-up fields.

The optional verification workbook uses one `Store Verification` sheet:

| Candidate and evidence | Verification | Structured fields | Review |
| --- | --- | --- | --- |
| Store Candidate, XHS Evidence, Source URL | Match Status, Store Match Confidence | AMap Store Name, POI ID, Address, District, Business Area, Category, Public Phone | Review Status, Notes |

Generated workbooks and inspection files are ignored by Git.

## Architecture

```text
CLI
├── stable mock/manual adapters
├── experimental public-search adapters
└── optional AMap verification provider
        ↓
query expansion → candidate extraction → StoreMatcher → deduplication/scoring
        ↓
local SQLite task store → XLSX exporter
```

| Module | Status | Default demo |
| --- | --- | --- |
| Mock and manual adapters | Stable | Enabled |
| Query expansion, matching, deduplication, scoring | Stable | Enabled |
| XLSX export (`exceljs`) | Stable | Enabled |
| `AmapAdapter` | Optional | Disabled |
| Xiaohongshu public search adapters | Experimental | Disabled |
| Dianping adapter | Experimental spike only | Disabled |

See [PROJECT.md](PROJECT.md) for phase status and architectural boundaries. Phase 2 findings are documented in [docs/REAL_DATA_FEASIBILITY.md](docs/REAL_DATA_FEASIBILITY.md).

## Current limitations

- Real-source adapters are intentionally low-volume and are not production SLAs.
- AMap verification requires a user-supplied Web Service key.
- Public-search page structure and availability can change without notice.
- Candidate extraction is conservative and rule-based; ambiguous stores require human review.
- Branch-level matching can remain ambiguous when discovery evidence lacks a branch name.
- Public phone coverage depends entirely on the provider response.
- The repository does not include real collected records, browser profiles, sessions, cookies, or generated lead files.
- Decision-maker resolution is not part of v0.3.0.

## Security and privacy

Never commit API keys, `.env`, cookies, browser sessions, authentication state, real-person contact data, or raw real-source exports. Read [SECURITY.md](SECURITY.md) before contributing.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

Apache License 2.0. See [LICENSE](LICENSE).

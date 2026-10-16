# NicheScout project status

This document records the product boundary for the v0.3.0 open-source release candidate.

## Product goal

```text
city + category + niche
→ discovery evidence
→ StoreCandidate
→ store entity matching and optional verification
→ XLSX for human review
```

NicheScout is store-first. Social posts and authors are evidence, not automatically stores or sales contacts.

## Phase status

### Phase 1 — Mock MVP: complete

- Stable CLI input and query expansion
- Mock and manual business adapters
- Store deduplication and entity matching
- Match, contact, and priority scoring
- SQLite task persistence
- XLSX export with human follow-up fields
- Deterministic offline demo and tests

### Phase 2 — Real-data feasibility: complete

- Bounded public-search experiments for Xiaohongshu and Dianping
- Xiaohongshu public search cards validated as a low-volume niche discovery source
- Dianping classified as experimental/manual only because login and verification gates were unstable
- No CAPTCHA solving, login bypass, or bulk collection
- Findings preserved in `docs/REAL_DATA_FEASIBILITY.md`

### Phase 3 — AMap store verification: release candidate

- Rule-based `StoreCandidate` extraction from public search-card evidence
- Optional official AMap Web Service POI Search 2.0 adapter
- Normalized store name, address, district/adcode, business area, category, POI ID, and API-returned telephone mapping
- Candidate-to-POI confidence scoring
- Ambiguous branch, not-found, and `NEEDS_REVIEW` handling
- Single-sheet Store Verification XLSX
- Offline adapter and end-to-end tests with synthetic provider responses

Live AMap acceptance is not an open-source release gate. Users can supply their own key for bounded local verification.

## Current architecture

```text
Input / CLI
  ├── Stable: MockBusinessAdapter, MockSocialAdapter, ManualImportAdapter
  ├── Experimental: Xiaohongshu public search adapters
  └── Optional: AmapAdapter
           ↓
QueryExpander
           ↓
StoreCandidateExtractor / StoreMatcher
           ↓
StoreDeduplicator / scoring
           ↓
SQLite task storage + XLSX export
```

## Module classification

### Stable

- Core models and adapter interfaces
- Mock and manual adapters
- Query expansion
- Store matching and deduplication
- Scoring
- SQLite persistence
- Mock demo
- XLSX export through the public `exceljs` npm package

Stable means covered by the default offline test/demo path and installable in a standard Node.js environment.

### Experimental

- `XiaohongshuExperimentalAdapter`
- Xiaohongshu public search-card extraction
- Dianping feasibility adapter and spike runner
- Browser diagnostics

Experimental modules are opt-in, low-volume, and isolated from the default demo. They use fresh anonymous browser contexts, do not depend on an existing login, and stop on access restrictions.

### Optional

- `AmapAdapter`
- AMap connection check
- XHS candidate → AMap verification CLI

The optional provider is enabled only when `AMAP_WEB_SERVICE_KEY` is configured. Otherwise it is skipped without breaking the project.

## Explicit non-goals for v0.3.0

- Frontend or dashboard
- CRM functionality
- Automatic direct messages
- Automatic telephone calls
- Automatic WeChat contact requests
- CAPTCHA solving or login bypass
- Cookie/session collection
- Large-scale collection
- New third-party data sources
- Decision-maker resolution

## Data and privacy boundary

Only code, documentation, fictional examples, and aggregate feasibility findings belong in the public repository. The following stay local and ignored:

- `.env` and credentials
- cookies, authentication state, browser profiles, and sessions
- raw real-source spike output and screenshots
- generated lead workbooks
- SQLite files containing local or real-source records
- personal or private contact information

See `SECURITY.md` for reporting and handling rules.

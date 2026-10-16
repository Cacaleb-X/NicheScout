# Contributing to NicheScout

Thanks for helping improve NicheScout. Keep contributions small, reviewable, privacy-safe, and within the project's store-verification scope.

## Development setup

- Node.js 24+
- npm
- Git

```bash
npm install
npm test
npm run demo
```

## Before opening a change

1. Read `PROJECT.md` and preserve the Stable / Experimental / Optional boundaries.
2. Do not add a frontend, CRM, automatic outreach, CAPTCHA bypass, login automation, or large-scale collection.
3. Add or update tests for behavior changes.
4. Run `npm test`, `npm run demo`, and `git diff --check`.
5. Review every changed and untracked file for credentials or real-person data.

## Adapter rules

- Keep external providers behind adapter interfaces.
- Mark browser-based providers experimental unless their stability and compliance are established.
- Keep optional providers optional; missing credentials must not break the default demo or tests.
- Use official APIs where available.
- Stop on login walls, CAPTCHA, rate limits, or other access restrictions.
- Do not collect cookies, reuse contributor login sessions, or implement challenge bypasses.
- Never infer or generate a telephone number or other contact value.

## Test data

Use fictional or clearly synthetic fixtures. Do not commit real customer or prospect lists, personal contact details, raw platform exports, browser screenshots containing user data, or SQLite files produced by a real run.

## Pull requests

Describe what changed, which module classification it affects, how it was tested, whether it makes external requests, and any privacy or data-retention impact.

Do not include secrets in issues, commits, logs, screenshots, or pull-request descriptions. Follow `SECURITY.md` for sensitive reports.

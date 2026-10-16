# Security policy

## Supported release

Security fixes target the latest tagged release and the current default branch.

## Never commit sensitive material

Do not commit, attach, or paste any of the following into this repository, an issue, or a pull request:

- API keys, access tokens, client secrets, or credentials
- `.env` files other than the placeholder-only `.env.example`
- cookies or `Cookie` request headers
- browser profiles, sessions, local storage, or Playwright authentication state
- HAR files or traces containing authenticated traffic
- private URLs containing tokens, signatures, or session parameters
- personal telephone numbers, email addresses, WeChat IDs, home addresses, or other personal data
- raw real-source exports, lead lists, screenshots, or SQLite databases

Use synthetic fixtures in tests and examples. Keep generated workbooks and real-source diagnostics local in the ignored paths documented in `.gitignore`.

## Credential handling

- Store local configuration in `.env`.
- Use a least-privilege provider key and follow the provider's rotation guidance.
- Do not log complete credentials or authenticated request URLs.
- If a credential is exposed, revoke or rotate it immediately. Removing it in a later commit does not remove it from Git history.

## Browser experiments

Browser adapters are experimental and opt-in. They must use a fresh anonymous context, must not depend on a contributor's login state, and must stop on login, CAPTCHA, rate-limit, or verification surfaces. Challenge solving and login bypass are out of scope.

## Reporting a vulnerability

Do not open a public issue containing exploit details, credentials, or personal data. Contact the repository maintainer privately through the security-reporting channel configured on the hosting platform. Include a concise impact description, reproduction steps using synthetic data, and the affected version.

If no private channel is configured yet, report only that a private security contact is needed; do not disclose the vulnerability publicly.

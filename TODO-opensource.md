# Open Source Readiness — 12/100

## Current State

- No hardcoded secrets, paths, or credentials
- ~13K lines of source code (TypeScript + Swift)
- 100+ test cases
- Evals with scoring framework
- `.gitignore` is clean

## Blockers

| Blocker | Severity | Status |
|---|---|---|
| LICENSE | Critical | Missing. Legally, no one can use it. |
| README | Critical | Missing. Nobody knows what this is. |
| CI/CD | Critical | No GitHub Actions. No way to verify code works. |
| CONTRIBUTING.md | High | No contribution guide. |
| Issue/PR templates | High | None. |
| macOS code signing | High | App won't open on other Macs without notarization. |
| Setup/install docs | High | No instructions to run locally. |
| npm package | Medium | Not published. |
| Product docs | Medium | Need the public docs to stay aligned with the narrowed speech/screenshot/cursor contract. |
| API docs | Medium | No docs on compiler interface, schemas, or CLI. |
| Example tasks | Medium | None yet. |
| Security policy | Medium | No SECURITY.md. |
| Changelog | Low | None. |
| Code of Conduct | Low | None. |

## Minimum to Open Source (8-16 hours)

1. Pick a license (MIT or AGPLv3 depending on your goals)
2. Write a 200-line README: what it is, screenshot, quickstart, architecture
3. Add GitHub Actions CI (build TS, run tests, build Swift)
4. Add `CONTRIBUTING.md`
5. Package the macOS helper clearly and keep the browser/DOM purge reflected in public docs
6. Add `.github/ISSUE_TEMPLATE` and `PULL_REQUEST_TEMPLATE.md`

The code itself is publishable. The packaging and docs are not.

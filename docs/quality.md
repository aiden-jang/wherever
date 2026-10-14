# Quality checks

## Setup

Use the pinned pnpm version and supported Node runtime from [README](../README.md).
For browser verification, install Chromium and WebKit:

```bash
pnpm --filter @wherever/web exec playwright install chromium webkit
pnpm run verify
```

Linux runners also need browser system dependencies; CI installs them with the
browser engines. `verify` builds production assets before the browser suite.

## What each layer establishes

| Check                   | Evidence                                                                                                                          |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Repository gates        | Matching CI order, module/state ceilings, declared CSS variables, comment hygiene, documentation references, unused code          |
| Types, lint, formatting | Consistent source contracts and style                                                                                             |
| Build and emitted CSS   | Production bundle and classes present in generated styles                                                                         |
| Shared tests            | Ranking, veto/super-like rules, filters, codes, wording, travel and revisit behavior                                              |
| Worker tests            | Real runtime, production D1 migrations, room lifecycle, host handover, anonymity, limits, and replay concurrency                  |
| Web tests               | Socket ownership/reconnects, delayed location results, clipboard/share failure and cancellation                                   |
| Browser journeys        | Production interface plus a real local Worker, joins, voting, replay, dialogs, keyboard focus, recovery, and accessibility audits |

## Focused commands

```bash
pnpm --filter @wherever/shared run test
pnpm --filter @wherever/worker run test
pnpm --filter @wherever/web run test
pnpm run e2e
```

The browser suite uses isolated local Wrangler data, sample restaurants, and a
separate local IP budget for each scenario/engine. Native rate limiting stays
enabled. It refuses to reuse a development server. API/browser fixtures never
require live provider keys.

Failures retain a screenshot and trace in the web package's ignored test-output
directory. Use the trace viewer with the file path printed by Playwright.

## Interface review

Review phone, tablet, and desktop widths, long names and addresses, the create/join
forms, lobby filters, active and exhausted decks, details, result/backups/history,
and failures. Include keyboard focus, enlarged text, reduced motion, and stronger
contrast. Check for page errors, overflow, and automated WCAG A/AA findings.

Build the web app and run its preview locally, then in a second terminal:

```bash
WHEREVER_UI_URL=http://127.0.0.1:4173 pnpm --filter @wherever/web run capture:ui
```

Use `WHEREVER_UI_OUTPUT` to choose the output directory and `WHEREVER_UI_CASE` to
review one fixture state. Only local preview origins are accepted. Default captures
are ignored; retain selected images alongside a dated review record.

The capture tool uses browser-only socket/API fixtures with production assets;
these captures are visual evidence rather than backend integration evidence.
Keep a small selection with an honest review record in `docs/ui-qa/`.

## Limits

Browser emulation does not prove physical iPhone behavior, native sharing,
camera/QR performance, installed-app wake lock/recovery, spoken screen-reader
output, or actual device performance. Mock/sample runs do not verify the live
provider's current response shape, key permissions, billing, or deployment.
Physical-device and live-service review must state their own evidence.

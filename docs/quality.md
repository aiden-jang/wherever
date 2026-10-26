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
pnpm run security:check
pnpm run check:migrations
```

The browser suite uses isolated local Wrangler data, sample restaurants, and a
separate local IP budget for each scenario/engine. Native rate limiting stays
enabled. It refuses to reuse a development server. API/browser fixtures never
require live provider keys.
An interrupted-upload regression checks that client cancellation leaves the Worker,
existing room, and new session creation usable.
Creation cancellation and location retry run in both browser engines. The Chromium
service-worker journey checks the real cache and reopens the public shell offline;
the WebKit project skips that test because its service-worker control is not established here.

Failures retain a screenshot and trace in the web package's ignored test-output
directory. Wrangler logs are saved in `.wrangler/e2e-logs/` at the repository root.
CI uploads both as the `browser-test-diagnostics` artifact when checks fail.
Use the trace viewer with the file path printed by Playwright.

The dependency audit runs locally and in CI, including development tools and
transitive packages. The targeted esbuild override patches Drizzle's legacy config
loader until its upstream dependency is updated. Worker tests clear binding storage
and apply production D1 migrations before each case.

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
The [October 26 review](ui-qa/october-26/README.md) includes recovery states.
Use the [visitor walkthrough](visitor-review.md) for a separate observed usability session.

## Limits

Browser emulation does not prove physical iPhone behavior, native sharing,
camera/QR performance, installed-app wake lock/recovery, spoken screen-reader
output, or actual device performance. Mock/sample runs do not verify the live
provider's current response shape, key permissions, billing, or deployment.
Physical-device and live-service review must state their own evidence.

# Repository conventions

`AGENTS.md` and `CLAUDE.md` link here so guidance has one source.
Setup and commit conventions are in [Contributing](CONTRIBUTING.md).

## Verification

Run `pnpm run verify` before reporting work complete. CI runs the same gates in the
same order. Use `pnpm run <name>` so a package-manager builtin cannot shadow a script.

- Source and script modules stay within the size and local-state ceilings.
- Comment ceilings must not be raised to retain prose. Re-read comments at moved seams.
- Custom properties must be declared, even when a reference has a fallback.
- Documentation paths, scripts, routes, names, links, and headings must resolve.
- Unused dependencies, exports, source files, and missing emitted CSS classes fail checks.
- Browser journeys use isolated local state and refuse to reuse a manual server.

Check that scans examined the intended files. An empty or implausibly clean result
can indicate a bad glob. New guards cover their own implementation: introduce a
failure, observe the check fail, restore the original, and confirm no temporary
changes remain. Do not loosen assertions or timeouts to get a pass.

## Room invariants

The room is the authority for participant identity, host rights, shared filters,
vote budgets, and the result. A hidden control does not enforce a rule.

Votes are keyed by participant and restaurant. Only dealt restaurants accept votes;
undo removes the requesting participant's vote while a round is still active.
One super-like and one veto are allowed per person per round. Vetoes remove places
from the ranking and never reveal who used them or which top choice was removed.
Identified completion is sent only when the host enabled voter disclosure.

Preserve stable identities across reconnects, even when two people share a name.
Host handover updates stored identity maps and live socket attachments together.
The one alarm schedules both host grace and the round deadline.

Provider fetches can yield to another event. Keep start/replay guards active until
the resulting status and deck are written. Failed fetches preserve a retryable
lobby or result; a successful empty search is a different outcome.

The client clears old room state and its buffered commands on a code change.
Callbacks from a disposed or superseded socket must not mutate the current room.
Keep the new deck's round state coherent and its display consistent with server data.

## Tests, comments, and docs

Worker tests apply the production migrations to isolated D1 and run the real
Durable Object runtime. Pure rules belong in shared tests; browser behavior also
needs browser coverage. Capture fixtures stay inside the review tool's browser.

Inline comments explain non-obvious constraints or decisions. Remove stale
implementation history and changelog prose; preserve migration/compatibility reasons
when old persisted data is still accepted.

Do not put live test totals, file lengths, or gate totals in docs. Let checks print
current measurements. Recorded visual reviews describe their own revision and
must state what browser emulation cannot establish.

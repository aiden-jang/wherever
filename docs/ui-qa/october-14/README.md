# Repository and interface review — October 14, 2026

This review covers the UI, architecture, repository checks, and documentation.
The selected captures use production assets with browser-only socket/API fixtures;
they do not establish live provider or backend behavior.

## Changes reviewed

- Old room state and buffered commands clear when the code changes. Disposed or
  superseded sockets cannot update the active room; reconnect joins before votes flush.
- Delayed geocodes preserve newer dinner filters and cannot overwrite a newly
  selected neighborhood. Narrow panels retain a usable location input.
- Failed creation stays inside one retryable form with the name intact. Closing a
  pending create prevents its late response from navigating away.
- Dialog focus cycles all reachable controls and returns to its opener in both
  reviewed engines. Card details are a real keyboard-accessible button.
- Share and clipboard failure/cancellation has consistent feedback. Never-again
  history retains readable text. Session codes and filter grids fit enlarged phone text.
- Round transitions retain an overlap guard through provider awaits and persistence;
  concurrent replay requests produce one new deck. The client countdown uses the
  same nudge cooldown as server enforcement.
- Focused modules separate round orchestration, provider normalization, socket state,
  gestures, forms, result presentation, invites, and history. Size exceptions are removed.
- README, architecture, quality, hosting, decision records, conventions, and comments
  describe the current single-origin setup and actual API/offline limits.
- Repository checks include script implementations, exact paths, local links and
  headings, and matching CI order. Regression mutations were rejected and restored
  byte-for-byte. Generated test artifacts are ignored.

The [landing](landing-1440.png), [phone filters](filters-320.png),
[phone result](winner-390.png), and [form recovery](create-error-390.png)
retain focused evidence. The full visual review also covered create/join dialogs,
name entry, lobby, active/empty decks, details, directions, no-match, and missing rooms
at narrow-phone, phone, tablet, and desktop widths. Reduced-motion captures had no
page errors, horizontal overflow, or automated WCAG A/AA findings.

## Verification and limits

The browser journeys use production assets served by a real local Worker with
isolated D1 and sample restaurants. They cover shared joins, voting, undo, special
votes, result/replay, recovery, focus, enlarged text, stronger contrast, and clipboard
failure. Unit/UI regressions and Worker integration preserve existing game rules,
anonymity, host handover, budgets, and migrations.

Automated verification does not establish physical iPhone behavior, real native
share/camera interactions, spoken screen-reader output, installed-app recovery,
actual device performance, or live provider responses and billing. Production
configuration and delivery were documented; no production operation was performed.

See [quality checks](../../quality.md) for reproducible commands and coverage.

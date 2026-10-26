# Visitor walkthrough

This is a guide for an observed usability session, not a completed visitor study.
Use local sample restaurants and separate browser contexts for two people. Never
ask participants to share real locations or private dinner history in recordings.

## Tasks to give a visitor

1. Start a session for dinner. Notice whether they understand that no account is
   needed, where the search is centered, and which location is active.
2. Invite another person. Let them choose the code, link, or QR. Check that the
   second person knows which name and code to enter without coaching.
3. Adjust the food and distance filters. Ask the guest what changed and whether
   they understand that the host controls the shared deck.
4. Vote on places, inspect restaurant details, and undo a vote. Ask them to explain
   the super-like and veto before using either. Check whether privacy expectations
   match the anonymous default and the optional completion disclosure.
5. Finish at different speeds. Observe whether each person understands waiting,
   connection recovery, and what happens when the group reaches a result.
6. Find directions, send the plan, and save its image. Ask them to identify the
   winning place and a backup before replaying the same places or requesting new ones.

## Recovery and access

Use development fixtures or browser request interception for service failures;
do not add production test routes or use live Google calls just to test an error.

- Refuse location search, then retry: the name and query should remain intact.
- Close creation while its request is pending: it must not navigate later.
- Refuse clipboard access: selectable text should remain available, with retry.
- Refuse camera startup: manual code entry must remain reachable.
- Reopen an installed, previously loaded shell offline: explain that room creation
  and live voting still require a connection.
- Repeat the main tasks with keyboard navigation, reduced motion, enlarged text,
  and a narrow phone viewport. Check focus return after each dialog.

## Record evidence

Record the date, revision, browser/device, task outcome, hesitation, unexpected
result, and recovery path. Keep observations separate from explanations you gave
the visitor. Prioritize a blocked task or misunderstood privacy rule ahead of
cosmetic preferences. Avoid names, room codes, coordinates, or individual votes
in public issue reports.

Automated coverage and its limits are in [Quality checks](quality.md). Native share
sheets, camera hardware, spoken screen readers, and installed-app lifecycle need
their own physical-device review.

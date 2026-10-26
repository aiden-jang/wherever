# Contributing

Follow [local setup](README.md#run-locally) and [repository conventions](CONVENTIONS.md).

## Working on a change

Keep voting rules in shared logic and their enforcement in the Worker. Client
controls and optimistic UI must not become authority for host rights, vote budgets,
participant identity, anonymity, or the final tally.

Use focused modules with one responsibility. Reset room-scoped UI when the session
code changes, and guard delayed socket, geocode, share, and clipboard results.
Keep provider credentials on the Worker and sample fixtures out of production paths.

Add regression coverage for changed behavior. Demonstrate that a new guard rejects
its target failure, restore temporary mutations, then run the complete verification.
Do not relax assertions or timeouts to obtain a pass.

```bash
pnpm run verify
```

For interface changes, also inspect desktop and narrow phone layouts, keyboard
focus, reduced motion, long names, unavailable services, and recovery actions.
[Quality checks](docs/quality.md) describes the browser setup and evidence workflow.

## Commits and pull requests

Use Conventional Commits without a scope: `type: concise description`.
For example, `fix: preserve selected location during delayed searches`.

Explain the user-visible change, relevant architecture choices, and validation.
For contributions through a pull request, use its template. Keep README and docs aligned with current behavior;
comments explain constraints rather than recounting the refactor.

The owner commits verified changes directly to main. Its ruleset keeps history
linear and blocks force pushes and deletion; it does not require a pull request.
CI verifies every main push before automatic delivery. Other contributors can
open a pull request with the same checks and relevant evidence.
Use [private security reporting](.github/SECURITY.md) for suspected vulnerabilities.

## Database changes

Generate and inspect migrations through the Worker scripts. Apply them locally and
verify the production migration setup used by Worker tests. Commit migration SQL
and generated metadata together; never edit an already-applied migration to change
its historical meaning. See [migration guidance](packages/worker/migrations/README.md).

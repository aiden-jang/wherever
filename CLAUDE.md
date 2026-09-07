# Working in wherever

How this repo expects to be worked in. Personal working style (commits, planning,
how to explain things) lives in the global `~/.claude/CLAUDE.md`.

The sections below are engineering standards that apply to any codebase. Anything specific to wherever
-- its checks, its deliberate oddities, the patterns to follow -- gets added when this repo is
next cleaned up, and only once each claim has been verified against the code.

## Do not trust your own measurements

Most false statements come from scans that measured nothing, not from misreading code. Real cases:
a glob with `{src,test}` braces matched zero files, so a coverage sweep compared against an empty
string and called every module untested; a `cd` inside a backgrounded command did not apply, so
three "stability runs" ran nothing; a coverage tool reported 0% because it could not instrument the
runtime; a script name silently resolved to an npm builtin, so a check reported green for a day
without ever executing.

So: an impossibly clean result means suspect the scan first. And **green is not proof unless you
have seen that check fail**: break the thing it guards, watch it go red, then believe it.

## Writing a new check

- It has to cover its own source, or the checks stop being checked.
- It has to cover every place the failure can appear, not just where you first saw it.
- Exclude test files from source scans: tests mount throwaway routes and declare throwaway types.
- Prove it fails before trusting it, and prove a failure leaves the tree clean.
- Always `pnpm run <name>`, and never name a script after an npm command. A script called `docs` is
  shadowed by npm's own `docs`, which exits 0 without running anything.

## Numbers in prose

Do not write live counts into docs: test totals, check totals, file lengths. Nothing verifies them
and they go stale silently. Say what a thing is and let the check print the number. Describing a
past change is different, and fine.

## Comments

- No comment block over four lines. If one seems necessary, ask.
- Never explain a refactor, or what the code used to do. A reader never saw that version.
- A comment that logs successive changes is a changelog. Git has it, and the log drifts out of step
  with the value it describes.
- After moving code, re-read every comment near the seam. A move strands them on the wrong function.
- Never raise a comment budget to fit prose. Trim instead; no script can enforce that about itself.

## How the code is commented

A comment here is a warning, not an essay. The bar is whether it records something that would cost
somebody real time to rediscover: a trap that has actually bitten, a rule the server enforces that a
reader might assume the client owns, a constraint that fails silently when broken, or why not the
obvious alternative.

What that looks like in practice:

- _Enforced here, not by hiding a control. A hidden button is not a rule._
- _`windowMs: 0` looks like the cheap way to reach the expiry path and is not._
- _Book notes slightly ahead of `currentTime`, never at it. A note booked for exactly now lands in the
  past and the hardware skips it, which eats the attack and leaves the tail - so it is easy to miss._
- _A flag and not a name, on purpose. The veto is anonymous, and naming what it killed narrows the
  vetoer down to one person in a group of four._

Everything else goes, and the reasoning behind a whole feature lives here or in `docs/adr/` rather
than in a docstring where it rots. The tree sits at about 1,600 comment lines across 13,000 of source,
which is lower than it looks: the rules of this game are genuinely subtle, and most of what survives is
a rule rather than a description.

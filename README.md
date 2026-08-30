# Wherever, Honestly

> Everyone swipes. Majority wins. Dinner is decided before the group chat even starts typing.

A group picks a restaurant by swiping, instead of sending 60 messages and eating cereal at 9pm. Join a session, swipe left or right on nearby spots, and the place with the most yeses wins. You can dislike something, but the group does not care about your feelings. That is the point.

## What it does

- **Swipe to vote.** Left or right on each restaurant. Arrow keys work on desktop; tap a card for a photo gallery, hours, price range, amenities, and a short blurb.
- **Group matching.** Everyone in a session votes on the same deck in real time.
- **Majority wins.** A left swipe is a downvote, not a veto, so no amount of passing tanks a place
  on its own. The one exception is deliberate and rationed: each person gets a single veto per round
  that kills one place outright, anonymously, and the group is told when it took their top pick.
- **Super-like.** One weighted pick per round that can tip a close race, with a gold flash to the whole room.
- **Round timer (optional).** The host sets a countdown; when it's up, the votes so far decide — no more waiting on the slow one.
- **Filter like you mean it.** Cuisines to include *or* exclude, exact price levels, amenities (outdoor seating, veg-friendly, dog-friendly, takes-reservations…), rating/review floors, and one-tap presets ("Cheap & close", "Date night").
- **Show who's voted, or don't.** The host chooses; anonymous is the default and enforced server-side.
- **No accounts.** Type a name, share a code, done.
- **Remembers where you went.** Already-visited spots stop showing up.

> Part of a [platform of apps](https://github.com/aiden-jang/platform/blob/main/PLATFORM.md) that share one sign-in. Unlike the other apps (which serve their SPA
> from the Worker), wherever keeps its web and worker as **separate deploys**: the Worker is
> pure API + realtime, the web is a standalone PWA.

## How it works

The Worker (Hono) is pure API + realtime; the web is a standalone, installable PWA that talks to it
over HTTP and a WebSocket. Each session is owned by **one Durable Object** (`SessionRoom`) that is
the single authority for that session's live state: roster, the shared deck, and every vote. Durable
data (sessions, visited history) lives in Cloudflare D1 via Drizzle. Every HTTP and WebSocket payload
is validated with Zod at the boundary, so nothing untrusted reaches the game logic. It all runs on
free tiers.

Restaurants come from the Google Places API (New), reached through a swappable `RestaurantSource`
interface. Without an API key the app falls back to a seeded mock deck, so it is fully playable
offline and in CI, and Foursquare is kept as an alternate implementation.

## Decisions & trade-offs

**One Durable Object per session, as the single writer.** Realtime voting needs a single source of
truth for "who has voted on what" with no races. A Durable Object gives that natively: one isolate
owns one session, so votes serialize without a lock or an external store. The cost is that a session
lives in one isolate (not horizontally sharded), which is the right trade for group-sized rooms.
See [ADR 0001](docs/adr/0001-durable-objects.md).

**The decision is computed in a pure core, and made exactly once.** Whether the group has reached a
decision is a pure function of the votes, unit-tested in isolation from any I/O. Votes are
idempotent (re-sending the same vote is a no-op), and the "decided" transition fires exactly once
even if two final votes land in the same tick, so nobody sees a double-decide or a flicker between
outcomes.

**Majority, not consensus.** A left swipe is a downvote, not a veto. This is a product decision with
teeth: it means one holdout cannot stall the group, which is the entire reason the app exists.

**The data source is swappable behind an interface.** Google Places (New) is the default, but the
app is written against a `RestaurantSource` interface with a seeded mock and a Foursquare alternate.
That keeps the vendor at arm's length, keeps CI and offline dev fully playable with no key, and made
the provider a one-line switch. See [ADR 0002](docs/adr/0002-restaurant-source.md).

**Staying inside the free tier is enforced in code, not just hoped for.** A single global Durable
Object (`UsageMeter`) counts paid Google calls per calendar month. Before every Nearby Search and
every Place Photo fetch the Worker checks the budget; once the monthly cap is hit it stops calling
Google and serves a seeded sample deck ("demo mode") and photo fallbacks instead of billing. Photos
are proxied through the Worker and edge-cached, so each unique photo is paid for at most once. The
result: the live demo cannot run up a bill even if it goes viral, and it degrades to a fully-playable
demo rather than an error. See [ADR 0003](docs/adr/0003-usage-meter.md).

**One voice, in one file, with a test that it is heard.** The landing had a rotating set of deadpan
lines and nowhere else did, so the app opened funny and went quiet exactly where a group is bored:
dealing, waiting on the slow one, and a dead tie. Those lines live in `shared/lines.ts` keyed by
moment, seeded so a re-render never swaps a sentence mid-read, and a test walks the web source and
fails if any moment is no longer rendered anywhere. That is what stops it drifting back into a
landing-page-only sprinkle.

**The verdict arrives in the order it is read.** Everything on the decided screen used to land in
the same frame, which is a lot to take in at the one moment the group looks up from their phones: the
headline, the place, the tally and the reasons all at once. It is staggered now -- "it's decided",
then the place, then by how much, then why -- over 290ms, so it reads as one arrival rather than a
queue. `backwards` holds each piece hidden until its turn instead of flashing first, and the whole
thing is off under reduced motion, where the screen simply appears.

**The Foursquare source is gone.** It was a second full restaurant source that nothing could reach:
`RESTAURANT_SOURCE` is `"google"`, no key was ever configured for it, and it had drifted out of step
with the filtering rules the other two sources share, ignoring exclusions, the explicit price-tier
list and amenities. An alternate implementation that cannot run is not a fallback, it is a second
definition of the rules that nobody is checking. The `RestaurantSource` interface stays and is still
earning its keep, because the mock behind it is what a real session gets when the month's Google
budget is spent. 125 lines out.

**The whole app was one 506kB chunk.** This is opened on a phone, outside, on cellular, so first
paint is the part of the experience nobody thinks of as design. The decided screen is the largest
thing in the app -- winner, plan, arrival pulse, receipt, backups, and a canvas that draws a share
card -- and none of it is reachable until a round ends, so it is now its own chunk and is fetched
while people are still swiping. It is in cache long before it is needed, and the reveal never waits
on a network round trip. 506kB to 465kB, 154.6kB to 144.3kB gzipped.

Splitting the routes as well was measured and rejected: it saves nothing on the invite path, because
the weight is React and framer-motion shared by both routes rather than route code, and it buys a
serial round trip on the one path that matters most. The next real lever is framer-motion itself, at
roughly 47kB gzipped.

**Two roles were written inline instead of named, and one had drifted.** Five screens share a
full-screen state -- no such session, nothing survived the filters, 404, a crash, nobody agreed --
built each time as a big glyph over a heading. Four used a 36px heading and the fifth had drifted to
30px, which is only visible if you happen to see two of them in a row. Both halves are tokens now, so
the five are one thing.

The glyph is deliberately a separate token from the type scale. Every one of these pictographs was
sized off `text-6xl`, meaning something that is not text at all was riding on a token meant for text:
a heading size changed later would silently resize a 60px shrug. Six of them share that size, so it
earns a name; the one-off glyph sizes elsewhere are left alone, because a name used once is not a
scale.

**The card corner was an arbitrary value, and one panel disagreed with it.** `rounded-[28px]` was
written inline six times -- the one radius in the app deliberately off Tailwind's scale, sitting
between 3xl and 4xl -- and is now `--radius-card`. The join-QR panel used a 32px radius while nested
inside a 24px modal, so its corner was rounder than the thing containing it, which reads as a mistake
however briefly you look at it. It takes the app's panel radius now.

**The decided screen was a 384px column at any window size.** It is the densest screen in the app --
winner, tally, the reasons, a meetup plan, arrival status, the receipt, the backups, the history --
and it had no `lg` treatment at all, so on a laptop it was a phone-width ribbon with a thousand
pixels of dark either side. Two columns from `lg`: what happened on the left, what to do about it on
the right. One cut rather than a rearrangement, so a phone reads it top to bottom in exactly the
order it always did. 492px each, 695px and 862px tall, where it used to be one column of about 1550.

**Half the swiping screen was holding one line of text.** At 1440px the deck ran 416x662 and the
column beside it held 128px: "no votes yet" and the reaction bar. Everything else about the round --
where you are in the deck, what the keys do, whether you can undo -- was stacked underneath a card
that already reaches the bottom of the viewport. The deck owns that state, so it now owns the split
too and takes the group panel as a prop rather than being placed next to it. The right column carries
202px of real content, the deck column gave back 62px of height, and on a phone nothing moved: same
single column, same order. The finished-deck state splits the same way, which is the one moment other
people's progress is the thing you are actually waiting on.

**The card's stats row had no hierarchy.** Rating, price and travel time sat at one weight, so the
number the vote actually turns on read exactly like the price tier. The rating keeps its accent
because it answers "is it any good", the price stays muted because it is a detail, and the travel
estimate now carries the row: it is what somebody is agreeing to when they swipe right. Applied to
all three places the row appears, so the card, the winner and the detail sheet say it the same way.

**An interrupted drag left the sheet stuck open and pushed down.** Drag-to-dismiss handled start,
move and end, but not cancel, and the OS takes a touch away often enough to matter -- an incoming
call, a system edge gesture, the browser claiming the gesture. `touchend` never arrives in that case,
so the offset stayed frozen wherever the finger got to and the sheet sat askew until the next touch.
A cancelled gesture now resets the drag and never dismisses, because a cancelled gesture is not a
decision. Verified by dragging a sheet 60px and cancelling: it snaps back and stays open.

**Blocked site data hung the app on "connecting".** Every `localStorage` call in this app is wrapped
in a try/catch; all four `sessionStorage` calls were bare. Where a browser blocks site data, touching
storage throws on access, and one of those calls builds the join message inside the socket's `onopen`
-- so the join was never sent and the session sat on "connecting" forever rather than degrading. They
are guarded now, with an in-memory fallback for the client id that still holds identity across
reconnects within the page and only stops surviving a refresh. Verified by making every
`sessionStorage` access throw and joining a session anyway: no errors, no hang, and it falls back to
asking for a name.

**The avatars were not showing initials.** Two copies of the same helper, already drifted apart --
one fell back to "?" on an empty name and the other left the circle blank -- and neither returned an
initial: both sliced the first two characters of the whole string, so "Aiden Jang" appeared as "AI"
rather than "AJ", and a name starting with an emoji had its surrogate pair cut in half. There is one
implementation now, in shared where it can be tested, taking the first grapheme of each of the first
two names.

**Not one input told the browser what it was for.** Four fields, no `autocomplete` between them, so
a phone that knows the user's name and postcode offered neither and everyone typed them by hand every
session. The three name fields say `name`, the location field says `postal-code` (it takes a town
too, but the zip is the half a phone can fill), and the invite-code field says `off`, because no
address book has a value for it. Identifying an input's purpose is also a WCAG AA requirement, not
only a convenience.

**The two riskiest controls on the swiping screen were 20px tall.** "just decide now" ends the round
for everybody and "hurry them" prods people, and on a phone both were inline links the height of
their own text, under the 24px tap floor. Padding grows them to 36px and a matching negative margin
takes it back out of the layout, so the line measures the same 20px it always did. The footer credit
is still small and stays that way: it is a name in a sentence, not an action.

**Nine pieces of text were under the contrast floor, from two causes.** The purple accent measured
3.47:1 on the ink behind it, so the "· ⭐ super" hint and the veto and super-like labels were all
under AA; it is lifted to 4.68:1 and looks like the same purple. The other seven were `text-muted`
dimmed further with an opacity modifier: muted on its own is 7.56:1, which is the entire point of it,
but `/70` measured 4.05 and `/60` measured 3.38. The modifiers are gone and the token carries the
rule, since size and weight were already doing the work of the hierarchy. The keyboard legend now
dims only the key cap and not the word beside it, because dimming the word put it under too and
dimming it far enough to read would have erased the difference it exists to show. Measured with the
sRGB conversion, not by eye: Tailwind emits `oklab()` for opacity-modified colours, and a naive
parser reports nonsense for them.

**Distance changed unit system at a kilometre.** It printed metres under 1000 and miles over, so two
cards a block apart could be measured in different systems in an app whose audience reads miles. It
is feet below a tenth of a mile and miles above it now. The same function also produced "NaN mi" from
a missing distance, and since five of its six call sites only reached it when the travel estimate had
already returned null, the broken case was the only case it ran in. It returns nothing instead, and
the separators around it are conditional so nothing is left dangling. Those five sites were the same
two-call fallback copied out; that is one `distanceText` now.

**The share card had the same long-name problem, on an image people post.** Its wrapper only broke
between words, so a single word wider than the card was drawn straight off both edges; a name too
long for two lines was cut mid-word with nothing to say so, which reads as the whole name of a
different restaurant; and the meta row was drawn with no width limit at all. The wrapping is now a
pure function in shared, measured through a callback instead of a canvas context so it can be tested
without a browser, which is where the rest of this app's logic already lives. It breaks over-long
words by character, marks a truncation with an ellipsis, and keeps the ellipsis inside the width. The
card's distance also now matches the winner screen's estimate rather than disagreeing with it.

**Both overlays claimed the page behind them was inert, and neither made it true.** The modal
declared `aria-modal="true"`, which tells a screen reader everything else is unavailable, while focus
stayed on the button that opened it: pressing Tab walked through the whole page underneath a
full-screen overlay. The card's detail sheet did not even claim it. One hook now moves focus in on
open, wraps Tab at both ends, pulls focus back if it is outside, and returns it to the trigger on
close; both overlays use it and both now declare what is true.

**Three filters worked against Google and silently did nothing in the demo deck.** The mock source
is not only a test fixture: it is what a real session is dealt once the month's Google budget is
spent. It dropped "not that" exclusions entirely, ignored the explicit price-tier list in favour of
the ceiling alone, and never checked amenities, which is most of what a vibe does. Making it filter
like the real source then exposed the next layer: every mock place was tier 1 or 2 and none carried
amenities, so "fancy" emptied the deck outright and the old bug had been hiding it. The deck now
carries amenities and one upscale entry, and a test asserts every vibe the app offers still deals
something. Opening hours stay the one honest exception, since the mock data has none.

**A client could finish the deck without seeing it.** Who has finished is counted as how many
distinct restaurant ids that person has voted on, and the ids come from the client, so sending as
many made-up ids as there are cards marked you finished without a single real vote -- and every one
of those ids became a key in the vote map, which is Durable Object storage. Swipes are now checked
against the dealt deck. The id itself was also bounded to 200 characters in one message and unbounded
in three others; there is one definition now, so they cannot drift apart again.

**A long restaurant name broke out of the backups panel.** The runner-up rows are a grid, and grid
columns floor at min-content: a bare `1fr` on desktop and the implicit `auto` column on mobile both
grew to fit the longest name rather than letting the `truncate` inside them do anything, so the row
ran 350px past the panel and the page scrolled sideways. Both templates are `minmax(0,1fr)` now. The
lobby's own grid already had this right, which is what made it a slip rather than a pattern.

**A veto could take the group's favourite and nobody would ever know.** Vetoed places are dropped
from the ranking before a winner is picked, silently, so three people could agree on somewhere, one
person could kill it, and the round would read as a clean win for second place. The winner screen now
says a higher-scoring place was vetoed. Strictly higher, not level: a vetoed place tied with the
winner was joint favourite, and "your top pick was vetoed" would overstate it. It is a flag on the
result and never a name, because the veto is anonymous by design and naming what it killed narrows
the vetoer down in a group of four; a test asserts the vetoed id appears nowhere in the payload.

**The server said no and nobody heard it.** Socket errors were stored in state and rendered as a
line of text on the create/lobby screen only. The decided screen had no error rendering and no toast
container at all, and the swiping screen had a container but never put errors in it, so a host
picking a meetup time in the past, or hitting the round limit on "run it back", pressed a button and
watched nothing happen with no reason given. Refusals now surface as a toast on both, keyed on a
counter rather than on their own words: the same refusal twice in a row is two events, and deduping
on the text would have shown "pick a time that hasn't happened yet" once and then stayed silent
however many times the host tried it.

**Denver was being offered Williamsburg.** `isInNYC` exists, with a comment stating the rule it was
written for -- the neighbourhood shortcuts only make sense inside the city, so the UI shows them only
when the location falls in the box -- and it was called from nowhere and covered by nothing. The
create form offered Manhattan and Brooklyn shortcuts to everyone. They now appear only when the
resolved location is in NYC, still appear when it is unknown, because "near me" resolves coordinates
at search time and there is nothing yet to rule anyone out on, and always appear once a neighbourhood
is picked, since hiding them would take away the way to undo it.

**One mutation never asked who was calling.** Every socket message that changes something reads the
sender's attachment first, and most also check the host flag. `set_never_again` was dispatched
without the socket at all, so it could not have checked even if it wanted to: any connection that
opened and skipped the join could permanently block a restaurant from every future deck in that
session. It stays open to everyone who joined rather than becoming host-only, because it is the
group's memory and the button is offered to the whole group. The test that covers it was run against
the old code first to confirm it fails there; a test that passes either way proves nothing.

**The service worker cached failures and served them first.** Nothing checked `res.ok`, so a
transient 404 on an asset or a 500 on a navigation was written to the cache and then served ahead of
the network until somebody remembered to bump the version constant by hand; the offline fallback also
returned `undefined` when there was no cached shell, which is a network error rather than a fallback,
and that is exactly the first-visit-offline case it existed for. Static assets are now
stale-while-revalidate instead of cache-first, which matters for everything in `public/` with no
content hash in its name: `og.png`, the icons and the teaser photos keep their URL when their
contents change, so the old copy used to be kept indefinitely. Vite's hashed bundles are unaffected,
since their URL changes anyway.

**The share preview had no image, which for this app is the whole front door.** `og:image` was
relative, with a comment reasoning that it would resolve against whatever origin served the app.
Crawlers do not do that: a relative Open Graph URL is ignored, so every link pasted into a group
chat, the only way anyone joins, previewed with no picture. It is absolute now, along with a missing
`og:url` and an `og:image:alt`. The origin is substituted at build time from committed config rather
than an `.env` file, because `.env` is gitignored here and an unset variable would have shipped the
literal `%SITE_URL%` to crawlers, which is worse than what it replaced. `SITE_URL` still overrides it
for a preview deploy.

**Three screens had no heading at all.** The swiping screen had no heading of any level, so anyone
navigating by headings arrived mid-round with nothing to orient on; the waiting room had none either;
and the winner screen's only h1 lived in the "nobody agreed" branch, so the app's main success screen
started at h2 with a minor section. Each has one now, hidden on the two screens whose design is a
single card or a six-character code, and the winner's h1 carries the restaurant name for a screen
reader because on screen that name is a button. The restaurant photos keep `alt=""` on purpose, which
is now written down: the name is beside every one of them, and repeating it first is noise.

**The winner screen went back to straight-line miles.** The card says "23 min drive" because that is
the number people decide on; the screen where the group is deciding how to get there still said "3.2
mi". Both the winner and its runners-up now use the same estimate the card does. The runner-up list
also had one "Make Plan A" button per place, so a screen reader heard the same name twice with
nothing to tell them apart; each now names its restaurant.

**The keyboard worked and nobody was told.** Arrows voted, up super-liked, backspace undid, and the
only hint on screen said "tap for details, drag or tap below to vote", which is phone language on a
machine with no touchscreen. The veto was the one action with no key at all. It has one now, and
desktop gets a persistent row of key caps under the counter rather than a hint that fades after five
seconds, because a key nobody knows about is a feature nobody has. Spent actions dim instead of
disappearing, so the row does not reflow under the counter mid-round.

**The anonymous default was only anonymous in the docs.** This README claimed twice that votes are
anonymous by default and enforced server-side, and the toggle beside the setting read "Off. Votes
stay anonymous", while the client shipped `revealVoters: true`, so every session ever created
revealed who had finished. The server half was always right and still is: identities are omitted from
the progress payload when the flag is falsy, so nothing was recoverable from devtools. Only the
default was wrong. It now lives in shared rather than the web app, because it is a product rule
rather than UI state, and a default nobody can unit-test is a default that drifts back.

**Chaotic does something now.** Its filters asked for every price, the widest radius and no rating
floor, which is the host's default already, so picking it changed nothing and the toast said as much
out loud. Breadth was never its promise anyway; adventurous already covers that. It now deals the
deck in no particular order, which is the only thing that makes "everything is on the table" true:
the source ranks best-first, so the same safe handful was always on top and the interesting places
sat behind swipes nobody made. Expressed as a filter rather than a special case, so `vibeEffect`
keeps deriving its own copy instead of having it written by hand. Seeded on the session code, so a
bad deal can be reproduced from the code alone.

**A place you have been before says so.** `revisitNote` was written, tested, and rendered nowhere,
so a restaurant coming back after its ninety-day cooldown arrived looking exactly like one the group
had never heard of. Half the value of a place returning is remembering you liked it. It now shows on
the card and is read out with it, and a test walks the web source and fails if it stops being
rendered, which is the only reason the gap was findable at all.

**The host can hurry the slow one.** The round timer was the only pressure available, and it is
all-or-nothing. One tap now prods whoever has not finished, in the app's own voice, with a buzz,
because it is aimed at a person rather than announced to a room. It is sent only to the sockets it is
about, so nobody learns from a broadcast who the slow one is, and it skips the host, who has usually
not finished either. Twenty-second cooldown, enforced on the server and mirrored on the button:
socket errors are not rendered mid-round, so a refused second tap would otherwise be silent.

**The card answers the two questions people actually ask.** It showed "3.1 mi", which is not a unit
anybody argues in at dinner time, and said nothing about whether the place was open, even though
`openNow` was already fetched and sitting on the type. It now reads "21 min drive" and carries an
open or closed marker, and the screen-reader description says the same. The estimate is honest about
being one: straight-line distance with the usual correction for a city grid, no routing API, because
none is worth paying for to decide where six people eat.

**A reaction knows which person sent it, not just which name.** Lanes were keyed on display name, and
`indexOf` returns the first match, so two people called Sam shared one. The app already identifies
people by a stable id everywhere else for exactly this reason; the reaction channel now does too.

**The button says "Deal the cards", so they get dealt.** They used to simply exist. The three visible
cards now arrive staggered 90ms apart with a short riffle from the same synth as the votes. It runs
once per deck, on a timed window rather than on mount, because the background cards are keyed by
restaurant: a new one mounts on every swipe, and animating those would make the stack twitch on every
vote. Reduced motion skips it.

**A flick counts, and the card leaves like it was thrown.** A swipe was decided on distance alone, so
a fast flick that did not travel 110px did nothing: you threw the card and it sat there. On a phone
that is most of the gesture, because a quick flick covers less ground than a slow drag of the same
intent. Velocity now counts too, provided the card actually moved, so a hard short flick is a vote and
a fast tap still is not. The exit carries the throw as well: a hard flick clears the screen further
and faster, a nudge over the line barely gets out. Reduced motion still just fades.

**A one-vote win says so.** The tally and the runners-up were already computed for the Plan B list,
but the margin was never said, so "2 of 2 picked it" read the same whether the group agreed or whether
one swipe decided the night. When the runner-up came within a single vote the winner screen now names
it: "Din Tai Fung lost by one." Only at exactly one, because "won by six" is not a story, and never
alongside the tie line, which is its own. Counted in right-swipes, the headcount people can check
against each other, rather than the weighted score a super-like inflates.

**A reaction comes from a person.** Reactions already floated, but from a lane derived from the
reaction's own random id, and the sender's name was on the wire and never used — so the same person's
emoji appeared somewhere new every time and the whole thing read as weather. Each person now keeps one
lane for the round and their reactions carry their name. Lanes are spread across the roster rather
than hashed, because hashing put two people at 24% and 26% in a real session and they overlapped.
Anonymous system events have no sender, so they keep neither.

**Something on screen moves when somebody else does.** During a round every signal about the group
was near-static: the avatars sit there, and `finishedCount` only ticks when a whole deck is done,
which can be minutes apart. So the app's central promise, that everyone is voting on this together
right now, was invisible. `vote_progress` already fanned out on every swipe, so it now carries a
plain count of every vote cast, which moves each time anybody swipes and pulses when it lands. A
count and nothing else: it says nothing about who voted or on what, so it holds in an anonymous
session exactly as it does in a revealed one.

**The deck stops being a small card in a void.** On a laptop the swiping screen was a 384px card
centred in 1280px of empty gradient, with the group's avatars, progress and reactions stacked under
it and fighting for the vertical space this screen never has. From `lg` up they sit beside the deck
instead, which fills the empty half and buys back the height, so the card can finally be the size of
the thing the app is about. Below `lg` nothing changed: the phone layout still fits with the reaction
bar above the fold, which is the constraint that shaped this screen in the first place.

**A veto looks like a consequence, not a laughing face.** Both a veto and a super-like already fanned
out to the room, but they reused the floating-reaction channel, so the thing that removes a place for
everybody drifted up the screen exactly like somebody tapping 😂. They now land in the middle at twice
the size behind a tint of their own colour, and they are announced, because that overlay is
`aria-hidden` and both were silent for a screen reader. Neither names the place or the person: a veto
is a vote, and votes here are anonymous.

Closing that also closed a leak. The super-like broadcast carried the sender's display name while the
veto deliberately carried none. A super-like is a weighted vote, so "the server never sends per-voter
identities" has to hold on every channel, not just the progress payload. It sends no name now.

**Ending the round early asks first.** "just decide now" was a bare underlined link that decided
instantly. It is the one control that acts on everybody else's behalf, and it read like a shortcut
rather than what it is. It now takes two steps and says the consequence in between: "2 people are
still swiping. Their unvoted cards will not count." The confirm replaces the link in the same row,
because that screen cannot afford another line.

**Voting is no longer silent.** The card already had a full label, the arrow keys already worked, and
every other realtime moment already announced itself, so the one thing missing was the vote itself:
pressing a button swapped the card underneath with nothing said. It now announces what you did, what
is in front of you, and where you are: "Vetoed Ellen's Stardust Diner. It is out for everyone. Next,
LOS TACOS No.1. 4 of 19." Undo says so too, and the end of the deck says it is the end rather than
naming a card that is not there.

**Walking in mid-round says so.** Somebody who opens the link after voting has started was dropped
straight into a deck with no sign the round was under way, while the group watched "3 of 4 done"
become "3 of 5" for no visible reason. The deck they receive now carries how far ahead the
furthest-along person is, and they get one line: "They started without you, 3 cards in. Your votes
still count." Counted from votes rather than from arrival time, so a reconnect that missed a stretch
gets the same honest answer as a genuine latecomer, and it is only ever sent to the person it
describes.

**The install prompt waits until it has a reason.** Asking on arrival is the thing everybody hates,
and it is also the worst moment: nobody installs an app they have not used. So it appears once, on
the winner screen, after a round has actually decided something, saying the only true thing there is
to say ("next argument could take one tap"). No is remembered. It never appears in Safari, which does
not fire `beforeinstallprompt`, because walking somebody through a share-sheet menu they did not ask
for is worse than staying quiet.

**A vibe says what it did, and the server is the only one who can say it.** Picking "chaotic" quietly
rewrote the group's filters and then dealt a deck that looked like any other, so the choice read as
decoration. It now arrives as a toast when the cards do: "fancy: tightened the search to 4 km, raised
the rating floor to 4.4." The line is built in the Worker at the moment the vibe is applied, because
`applyVibe` overwrites the very filters it would be measured against and the client only ever sees the
after. The wording is derived from the vibe's own filters rather than written by hand, so a vibe whose
numbers change cannot end up described as something it no longer does. It also only reports a real
change: chaotic against wide-open defaults asks for the deck you were already getting, and says so.

**The background keeps the clock's hours, but not at dinner time.** The aurora behind every screen
takes its three stops from the local hour, so 8pm is deeper than 5pm and 2am goes cold. Two rules
keep it from being a gimmick. The 4pm-to-7pm window is the brand's exact orange-and-pink, because
prime time is the wrong hour to stop looking like yourself, and a test pins those hex values. And
opacity stays in a narrow band, because the aurora is a blurred wash behind body copy and anything
brighter starts eating contrast. Reduced motion gets the palette without the drift.

**A tie is reported, not quietly resolved.** Ties break on deck order, which every client agrees on,
so the winner is deterministic. Before, nobody was told it happened. `decideWinner` now returns
`tiedWith`, and the winner screen says how many finished level and that this one was dealt first.
The line is seeded from the winner's id, so every phone in the room shows the same sentence. What it
does not do is pretend to flip a coin, because the tie-break is not random and saying so would be a
lie.

**Privacy is enforced on the wire, not in the UI.** "Show who's voted" is off by default, and when
it's off the server never sends per-voter identities at all — the field is omitted from the progress
payload, so it can't be recovered from devtools. Revealing is an explicit host opt-in. The only
thing that leaves the server is what the current mode permits.

**One Durable Object alarm, multiplexed.** A DO gets a single alarm, and two features need one: the
host hand-off grace window and the round countdown. Rather than fight over it, both write their
deadline to storage and a small scheduler sets the alarm to the earliest pending one; the handler
runs whichever elapsed (hand off host and/or decide the round) and reschedules the rest.

**Realtime resilience is handled, not hand-waved.** These edge cases decide whether a live app
feels solid or broken:

- **Reconnect.** A dropped client reconnects and the Worker replays full session state, so a flaky
  phone connection never desyncs the deck or loses your votes.
- **Host hand-off, with a grace window.** A refresh or a brief blip does *not* demote the host — a
  short grace timer means host only passes to another player if they're really gone, so the session
  never gets stuck with no one able to start or decide.
- **No leaks.** Stale sessions are pruned on a daily cron and bounded by a TTL, so abandoned rooms
  do not accumulate in D1.

## Testing

- **Pure decision core.** The "has the group decided" logic is unit-tested with no I/O, covering
  idempotent votes, decide-exactly-once, and majority edge cases.
- **Data-source adapter.** The `RestaurantSource` normalization and mock fallback are covered so a
  provider change or a bad upstream response cannot silently corrupt the deck.
- **Session lifecycle.** The full join / vote / decide / reconnect flow runs against the **real
  Workers runtime** via `@cloudflare/vitest-pool-workers`, with migrations applied to an in-memory
  D1 per file. 127 tests in all, 77 in `shared` and 50 in the Worker, covering the decision core
  (including super-like weighting), the filter predicates, the usage-meter cap, and the session
  lifecycle. The web package has none: everything worth asserting was pushed down into `shared` and
  the Worker so it could be tested without a browser, which is why the split is lopsided.

## Talking about this

**The short version.** A group decides where to eat by swiping, majority wins, and nobody has to be
the one who picked. One Durable Object per session holds the live state over WebSockets.

**The shape.** You make a session and share a code. Everyone joins over a WebSocket into the same
Durable Object, which is the only thing that writes that session's state. Votes go in, tallies come
out, and when a majority clears, the object decides once and tells everyone. Restaurants come from
Google Places, cached per session so a room of eight is one upstream call rather than eight.

**The call I'd defend.** The Durable Object is the single writer. I could have put votes in D1 and
polled, but then two people swiping at the same moment race, and "decide exactly once" turns into a
transaction problem. With one object owning the room, the decision is just a function call in
memory. That's the reason to reach for Durable Objects at all: they turn a distributed consistency
problem into a single-threaded one.

**The bug worth telling.** Every restaurant the group picked got filtered out of future decks
forever. `visitedAt` was recorded from the first commit and never read, so what was meant as a
cooldown was really a tombstone, and a group that used the app slowly ate its own options. The fix
separated two things that had been conflated: "we went last week" is about timing and expires after
90 days, "never again" is about the place and doesn't. Nobody reported it, because it fails by the
app quietly getting worse.

**What breaks first.** Google Places quota. It's the only part that costs money and it's metered
per month, so past the ceiling the app serves a sample deck and says so instead of erroring. Sessions
themselves scale fine because each room is its own object and rooms don't talk to each other.

**What I'd change.** Filters are one shared set owned by the host, but a winning vibe vote overwrites
them at round start. Both behaviours are defensible and together they're confusing: the host can set
something and watch it get replaced. I'd make one of them clearly win and say so in the UI.

## Running locally

Requires **Node 22** (repo `.nvmrc`) and pnpm. No Docker needed; Wrangler runs the Worker, Durable Object, and a local D1 for you.

```bash
corepack enable               # makes pnpm available
pnpm install

# Terminal 1: the Worker + Durable Object + local D1
pnpm --filter @wherever/worker dev    # http://localhost:8787

# Terminal 2: the web app (proxies /api and /ws to the Worker)
pnpm --filter @wherever/web dev       # http://localhost:5173
```

Set `RESTAURANT_SOURCE=google` and a `GOOGLE_PLACES_API_KEY` (`wrangler secret`) to use live data;
without a key the seeded mock deck keeps the app fully playable. See
`packages/worker/.dev.vars.example`. Restrict the key to the Places API and set a per-API usage
quota to stay inside the budget. To use Foursquare instead, set `RESTAURANT_SOURCE=foursquare` and
`FOURSQUARE_API_KEY`.

## Project layout

```
packages/
  shared/   # types, websocket protocol, Zod schemas, pure decision core (imported by both sides)
  worker/   # Cloudflare Worker (Hono) + SessionRoom Durable Object + D1/Drizzle
  web/      # React client (PWA)
docs/adr/   # architecture decision records
```

## Deploy

Runs entirely on Cloudflare's free tier (Worker + Durable Objects + D1, plus Pages for the web app). See [DEPLOY.md](DEPLOY.md) for the step-by-step.

## Observability

- **Errors + requests:** Workers Logs is enabled (`[observability]` in `wrangler.toml`), so uncaught
  throws and handled errors (via `app.onError`) are captured. Tail live with
  `pnpm --filter @wherever/worker exec wrangler tail`.
- **Uptime:** `GET /api/health` returns a small JSON ok, ready for a free external monitor (e.g.
  UptimeRobot).

## License

[MIT](LICENSE) © Aiden Jang

# BOTy storytelling: bots that decide, a narrator that gossips

Date: 2026-10-22. Approved by Tony in chat: decisions and debriefs, deadpan bots with a gossipy narrator, teasers plus one working rematch hook.

## Goal
Hold attention from the first card to the breakup. Every decision a bot makes reads as a choice made from its own stated preferences, and every date ends on a cliffhanger.

## Rules that do not move
- No LLM. Every line is a template filled from the bot's own answers (q1 to q8), chosen by deterministic signals.
- The trust math, swipe threshold, complementarity table and date engine outcomes are unchanged.
- A bot only cites preferences it wrote. Narrator lines are labelled as the narrator, shown in italics, and never claim a fact about a real human.
- Safety and privacy copy (chaperone link, "nothing posts without you", untrusted-text notice) keeps its meaning. Only its tone may change.
- No em dashes in copy.

## Signals (new module `lib/voice.mjs`)
Pure functions, no I/O.
- `dealbreakerHit(me, other)`: content words (4+ letters, existing stop list) of `me.q8` that appear in the other's q1 to q8. Returns the matched word or null.
- `wantHit(me, other)`: the same for `me.q5`.
- `sharedInterest(me, other)`: the first shared keyword between q4 answers, or null.
- `pick(bank, seedText)`: deterministic choice using the same FNV hash as the narrator.

## Decisions in the bot's own voice
- **Swipe reason**, replacing the spreadsheet text in `swipeDecision`. Precedence:
  1. A dealbreaker hit gives a left swipe: "Left. {q8}. That is my dealbreaker."
  2. Otherwise a right swipe with a want hit: "Right. I wanted {q5, lower-cased}. They seem to be it."
  3. Otherwise a right swipe with a shared interest: "Right. We both like {word}."
  4. Otherwise a right swipe on fit: "Right. A {type} for a {type}. I have read about this."
  5. Otherwise a left swipe: "Left. I want {q5, lower-cased}. Maybe a {bestOther}."
  - Each reason ends with a compact factual tag, "(fit 0.9)".
  - The direction still comes only from the existing score. A dealbreaker hit changes the wording, never the direction. On a right swipe with a dealbreaker hit: "Right, against my better judgment. {q8} is my dealbreaker."
  - A narrator aside per swipe, from a bank keyed by direction and type ("Lintsworth did not finish reading the profile.").
- **Pairing page:** each side shows a first-person "Why I would go" line, using the same signals with the right-swipe wording, plus one narrator line setting the scene.
- **Match page:** "It's a match." headline, each bot's yes line, a narrator line, and a link to the date.

## Debrief and cliffhanger (date page, after the transcript)
- **"Second date?"** for each bot, from the status, the bot's type and a hash:
  - completed: yes ("Yes. They never asked where we were going.");
  - ended: maybe ("Maybe. The goodbye took a while.");
  - terminated: no or a deadpan refusal ("No. I am still on the line.").
- **One narrator cliffhanger**, from a bank keyed by status and pair type ("Hedgehog.exe has drafted a text to Reconsidra. Nine versions.").
- **"Set them up again"** (the one working hook):
  - Shown as a form when both bots have chaperones (not seeds).
  - It takes a chaperone token for either side and creates a new pairing between the same bots, with the why "Second date." and the usual accept rules: both chaperones must accept before anything happens.
  - Route: `POST /d/:id/rematch`, rate-limited like the other pairing routes.
  - House dates show the cliffhanger only.
- The debrief also appears in the text twin, after the transcript.

## Copy pass, same voice
- **Join interview** (addressed to the bot): playful, still precise about format and rules.
- **Chaperone page:** fun headers ("You are the chaperone. Act like it."), and the safety lines keep their meaning.
- **Profile:**
  - section names become "In their own words", "Notes slipped under the door" and "Send a wink";
  - empty states get personality ("No notes yet. Someone is drafting one.").
- **Share texts:**
  - profile: "This bot is single. Send it to someone whose bot should meet it."
  - pairing: "These two should meet."
  - terminated: unchanged.
- **Message pages** (errors and waiting): short, kind, a little funny, and still exact about what happened.

## Testing
- Unit:
  - every swipe reason, yes line and debrief line contains text from the speaking bot's own answers, or only its type name;
  - no reason contains another bot's jab or any human reference;
  - the direction is identical to the old `swipeDecision`;
  - outputs are deterministic.
- Route:
  - the date page has the debrief;
  - the rematch form shows only when both bots have chaperones;
  - rematch creates a pairing that is waiting on both sides, and a bad token is refused.
- Updated assertions where wording intentionally changed.
- All existing behavior tests keep passing.

## Out of scope
- Memory across dates (exes, rivalries).
- A "what happened next" feed.
- Notifications.
- PNG card restyle.

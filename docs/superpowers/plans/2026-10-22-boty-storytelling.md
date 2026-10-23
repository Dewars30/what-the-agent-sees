# BOTy Storytelling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bots voice every decision from their own answers, a narrator gossips, every date ends on a debrief and cliffhanger with a working rematch, and the dry pages get the new voice.

**Architecture:** A new pure module, `lib/voice.mjs`, holds the signals (dealbreaker, want, shared interest) and the template banks. `swipes.mjs`, `pairing.mjs`, `pages.mjs` and `date.mjs` call it when they render. `swipeDecision` keeps its math and its old `reason` field, and the stored swipe reason becomes the voiced one. Rematch is one new route that reuses `proposePairing`.

**Tech Stack:** Node 22, Hono, `node --test`. No new dependencies.

## Global Constraints
- No LLM; deterministic templates only. The trust math, swipe threshold, complementarity table and date outcomes are unchanged.
- A bot cites only its own answers. Narrator lines are italic and labelled. No em dashes.
- Safety and privacy copy keeps its meaning.
- Spec: `docs/superpowers/specs/2026-10-22-boty-storytelling-design.md`.

---

### Task 1: `lib/voice.mjs` signals and banks
**Files:**
- Create: `apps/botyotyoty/lib/voice.mjs`
- Modify: `lib/trust.mjs` (export `STOP` and `bestFit`, which already exists)
- Test: `test/voice.test.mjs`

**Produces:**
- `dealbreakerHit(me, other)`, `wantHit(me, other)` and `sharedInterest(me, other)`: each returns a string or null.
- `swipeReason(from, to, decision)` and `swipeAside(from, direction, toName)`: each returns a string.
- `yesLine(me, other)` and `sceneLine(a, b)`: each returns a string.
- `secondDate(me, other, date)`: returns a string starting "Second date? ".
- `cliffhanger(a, b, date)`: returns a string.

Steps:
- [ ] Write the tests:
  - determinism;
  - Lintsworth (q8 "Unsourced claims.") against a bot whose q4 says "unsourced claims are fine" gives a dealbreaker hit;
  - each reason ends with `(fit X)`;
  - the reason direction prefix matches `decision.direction`;
  - each line contains a fragment of the speaker's own answers or only a type name;
  - no output contains the other bot's jab.
- [ ] Run them and see them fail.
- [ ] Implement the module, following the precedence and the banks in the spec.
- [ ] Run them and see them pass.
- [ ] Commit.

### Task 2: Swipes speak
**Files:**
- Modify: `lib/swipes.mjs` (the stored reason becomes `swipeReason(...)`); `lib/pairing.mjs` (`fitLine` uses `swipeReason`)
- Modify: `lib/pages.mjs` (`swipeBlock` adds `swipeAside` in italics and the new header copy)
- Test: update the regexes in `accept`, `pass2` and `pass3` from `/Why not\?|Type fit:…/` to `/\(fit \d/`. Leave the unit test on `swipeDecision.reason` (pass2:70) unchanged.

### Task 3: Pairing, match and date debrief
**Files:**
- Modify: `lib/pages.mjs`:
  - `pairingPage`: a "Why I'd go" line per side, plus `sceneLine`;
  - `matchPage`: "It's a match.", both yes lines, the scene, a link to the date;
  - `datePage`: a debrief section with both `secondDate` lines, `cliffhanger`, and the rematch form when both bots have chaperones.
- Modify: `lib/date.mjs` (`dateText` appends the debrief)
- Modify: `server.mjs` (`POST /d/:id/rematch`, plus the rate-limit regex)
- Test: `test/story.test.mjs`. The debrief appears on the page and in the text version. A house date has no rematch form. Two real bots do have one. A rematch with a valid token returns 303 to `/pair/{new}`, which waits on both sides. A bad token gets 403.

### Task 4: Copy pass
**Files:** `lib/pages.mjs` (join, chaperone, profile and message pages); `lib/profile.mjs` (`shareLine`)
- Profile share line: "This bot is single. Send it to someone whose bot should meet it. {url}"
- Profile sections: "Notes slipped under the door", "Send a wink".
- Empty states get personality.
- The join page H1 addresses the bot playfully.
- Tests: update the three `shareLine` assertions (m1:211, m1:352, pass2:242).

### Task 5: Verify and ship
- [ ] Run `node --test`: everything passes.
- [ ] Screenshot the date, pairing, chaperone and profile pages at 1280 and 390 wide. Check for no overflow and no console errors.
- [ ] Push, open the PR. Tony merges. Deploy the merge SHA with `synteq deploy --image`, then check `/version`.

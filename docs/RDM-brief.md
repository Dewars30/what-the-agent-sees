# Repo Death Match: build brief

A Synteq Hack app. Two repos enter the ring. One leaves. Or it's a draw with reasons.

## What it is

Paste two GitHub repo URLs. The app scans both statically, generates fighter cards with stats, and produces a deathmatch verdict card. GPK/WWF aesthetic. Shareable. Each scan adds fighters to a public roster. Collect them all.

No account. No login. Two URLs, a scan, a card.

## The name

Repo Death Match. RDM for short. URL: `rdm.synteq.app`.

## The landing page

One screen. Four beats:

1. **The problem.** "You saved five agent frameworks. They do the same thing. One of them is lying about it."
2. **The offer.** "Paste two repos. We scan both and tell you who wins. No running code. Just facts."
3. **The tease.** A sample deathmatch card. Two known repos, stats, a winner. "LangChain vs LlamaIndex. LlamaIndex wins on code quality. LangChain wins on adoption. It depends."
4. **The start.** Two inputs. Repo A, Repo B. One button. "Ring the bell."

## The flow

1. User pastes two repo URLs (or `owner/repo` slugs).
2. The side window lights up. Progress bar with honest status labels:
   - "Reading Repo A..."
   - "Reading Repo B..."
   - "Scanning for secrets..."
   - "Checking dependencies..."
   - "Comparing stats..."
   - "Writing the verdict..."
   - "Done."
3. The deathmatch card appears. Two fighters, stats compared, winner or draw.
4. Below the card: download as PNG, open X draft, "Put another two in the ring."

## The fighter stats

Each repo gets scanned for these signals, all static, no code execution:

| Stat | What it measures | Source |
| --- | --- | --- |
| Stars | Reach / aspiration | repo metadata |
| Forks | Actual adoption | repo metadata |
| Contributors | Bus factor | contributors API (Link header count) |
| Last commit | Liveness | commits API (latest commit date) |
| Commit frequency | Maintenance pace | commit history (if available) |
| License | Legal usability | LICENSE file or repo metadata |
| Install scripts | Supply chain risk | package.json postinstall, setup.py custom |
| Dependencies | Surface area | manifest file count |
| Secrets | Code hygiene | regex scan of source for keys/tokens |
| Eval/obfuscation | Code safety | eval(), exec(), base64 blobs in source |
| Tests | Quality signal | test directory, CI config presence |
| README claims vs code | Honesty | README feature count vs detectable entry points |

Each stat becomes a number on the fighter card. The trust score combines them: same Beta reputation model. Each clean signal adds to alpha, each red flag adds to beta, staleness is continuous decay.

## The deathmatch card

GPK/WWF style. Two fighters facing off. Stats in a column under each. Winner declared at the bottom, or "DRAW" with reasons.

Card elements:
- Two avatars (repo language color as the fighter's color, star count as a badge)
- Repo names as fighter names
- 6-8 key stats per fighter, side by side
- Trust score for each
- Winner: "[Repo A] wins" or "DRAW: [A] wins on [X], [B] wins on [Y]"
- The URL burned into the image
- Bottom strip: "Repo Death Match. rdm.synteq.app"

The honest verdict beats the fake winner. If both have strengths, say so. "A wins on adoption. B wins on code quality. It depends on whether you need breadth or focus." Both camps argue. The argument is the reply.

Meter labels:
- 0.7+ trustworthy
- 0.4 to 0.7 it's complicated
- 0.125 to 0.4 wobbly
- below 0.125 terminated

Breakup line for a terminated fighter: "Terminated after 14 months of inactivity. Trust 0.12. It's not you, it's the maintainer."

## The roster

Each repo that gets scanned is added to a public roster. The roster is the collection. "The ring now has [n] fighters. Add yours."

Roster page: `/roster`. Lists all scanned repos as mini fighter cards. Sorted by trust score. Each links to its standalone fighter card at `/f/{owner}-{repo}`.

This needs Turso (same as BOTy). Table: `fighters` (id, owner, repo, handle, stats_json, trust_score, scanned_at). Each scan upserts both fighters. The roster grows as people use it. That is the network effect.

## The share

Three shareable artifacts:

1. **The deathmatch card.** PNG, downloadable, URL burned in. This is the primary share. "I just put LangChain up against LlamaIndex. [Winner] won. Trust [score]. [url]"
2. **The fighter card.** A single repo's card. Standalone page at `/f/{handle}`. "This repo has 8,200 stars and 12 forks. People are saving, not building. [url]"
3. **The roster card.** "My roster has [n] fighters. [top 3] are still standing. [url]" (future, when scan-your-saves mode exists)

X draft is pre-filled. The app never posts. Once the entry post exists, share intents reply to it (`in_reply_to` baked in source).

Send text for the deathmatch card:
"[Repo A] vs [Repo B]. [Winner] won. Trust [score]. Put two in the ring: [url]"

No "please like." No "@grok." The need to pass it on has to be obvious without being begged. End with "Put two in the ring" — that is the instruction to the next person.

## The auth offer

Unauthenticated first (60 req/hr per IP). Enough for a deathmatch: ~6 API calls per repo, 12 total, well within the limit. Shallow scan: metadata, license, activity, stars-vs-forks, language.

Below the card:
"Want deeper stats? Paste a read-only GitHub token. We'll scan source files for secrets, install scripts, and dependency advisories. The token is used for this scan only and never stored. Close the window and it's gone."

Token rules:
- Fine-grained PAT, read-only, public repos only. Or classic PAT with `public_repo` scope.
- Reject any token with write scopes. Tell the user to make a read-only one.
- Token stays in the browser. GitHub API supports CORS. All calls go direct from the browser. The server never sees it.
- "Your token never leaves your browser" is copy. It is true.

## Copy

Locked phrases:
- "Your stars are aspiration, not reality."
- "The save is dopamine. The processing is debt."
- "People are saving, not building."
- "It's not you, it's the maintainer."
- "Your token never leaves your browser."
- "Put two in the ring."
- "Collect them all."

Voice: dry, honest, a little funny. Same register as BOTy. No hype. A friend who already looked at both.

## Tech

- Host: Synteq Apps. New app `rdm`. Free tier if a slot is open, otherwise Hobby ($5/mo, cancel after contest).
- App: Node 20 + Hono, server-rendered HTML, small client JS for progress bar and client-side GitHub calls.
- GitHub API: unauthenticated public reads for the front door. Client-side authenticated reads for the deeper scan. No server-side token handling.
- DB: Turso free tier. Table `fighters`. Each scan upserts. Roster reads from this.
- Cards: SVG to PNG via @resvg/resvg-js, in-memory LRU cache. URL burned into image. Same pattern as BOTy.
- Share: X web intent, pre-filled, never auto-posted.
- Deploy: prebuilt GHCR image, health at `/healthz`.
- Repo: `github.com/Dewars30/what-the-agent-sees`, new app directory `apps/repo-death-match`. Reuse CI image workflow.
- Plain-text twin: `/m/{id}?format=txt` for the deathmatch, `/f/{handle}?format=txt` for a fighter. Agent-readable.

## Routes

- `/` — landing page with explainer and two inputs
- `/m/{id}` — a deathmatch. Two fighters, stats, verdict. OG image, PNG download, X draft.
- `/f/{handle}` — a fighter card. Single repo, full stats. Standalone, shareable.
- `/roster` — the public collection. All scanned fighters, sorted by trust.
- `/healthz` — 200 ok.
- `/api/scan?repos=owner/a,owner/b` — POST or GET. Scans both repos, returns the deathmatch data. Renders the card.
- `/api/fighter/{owner}/{repo}` — GET. Returns a fighter's stats. Adds to roster if new.

## Build order

1. Landing page with two inputs and a sample card.
2. Scan: read two repos via GitHub API (unauthenticated). Generate stats. Compute trust scores.
3. Deathmatch card: SVG template, two fighters, stats, verdict. PNG export.
4. Roster: Turso table, upsert on scan, public roster page.
5. Fighter card: standalone page per repo.
6. Share: X web intent, PNG download, URL in image.
7. Auth offer: token paste, client-side deeper scan, reject write scopes.
8. Plain-text twins.

Build 1-3 first. That is the MVP: paste two repos, get a card. Everything else grows on top.

## Contest

Same rules as BOTy:
- Score = likes x 1 + replies x 2 + reposts x 3. Views ignored.
- Entry is Tony's public quote post of the announcement, with `rdm.synteq.app` in it. Tony posts it. The app never posts.
- Share intents reply to the entry post once the id is baked in.
- No bot rings. No self-engagement. No asking for likes.
- The deathmatch card is the artifact people pass. "Put two in the ring" is the send line.

## Out of scope

Accounts, logins, OAuth, server-side token storage, running repo code, dynamic analysis, dependency installation, scan-your-saves mode (option 2), suggest-matchups mode (option 3), a recommendation engine, posting to X, monetization, pricing.

Options 2 and 3 are growth features. Build them after the MVP ships and if time allows.

## Done when

A stranger can paste two GitHub repo URLs and get a deathmatch card with stats for both, a trust score for each, and a winner or draw. The card downloads as a PNG with the URL burned in. The X draft is pre-filled and the app did not post it. Both fighters are in the public roster. The landing page explains what happens in one screen.

# StarGrave: concept brief

A Synteq Hack app. Not a revision of anything. Build from this.

## What it is

You star repos on GitHub and never go back. The save is dopamine. The processing is debt. This app pays the debt for you.

Paste a GitHub username. The app reads their starred repos, scans each one, and hands back a triage card: what to let go, what to check now, and what to build with. Then it prints a public share card: what your saves say about you.

No account. No login. No saved settings. A username, a scan, a card.

## The name

Working name: **StarGrave.** You planted stars. Now see what grew and what died. Tony can rename.

## The landing page

The first thing a visitor sees. Not a form. An explainer that teases the dopamine.

One screen. Four beats:

1. **The problem.** "You star repos and never go back. Your stars are aspiration, not reality."
2. **The offer.** "Paste your username. We scan every repo you saved and tell you what's dead, what's worth your time, and what you could build."
3. **The tease.** A sample card. A fake user with 47 stars, 31 dead, 3 worth checking, 1 to build with. "People are saving, not building. Find out which side you're on."
4. **The start.** One input. GitHub username. One button. "Dig up my saves."

Nothing else above the fold. No feature list. No "how it works" paragraphs. The sample card is the explainer.

## The flow

1. User pastes a GitHub username.
2. The side window lights up. Progress bar with status labels: "Reading your stars... Scanning 47 repos... Writing verdicts... Done." The processing is the experience. You watch the machine do the thing you didn't want to do.
3. The triage card appears. Three piles.
4. Below the triage card, the auth offer (see below).
5. Below that, the share card. "What your saves say about you." One click to download as PNG. One click to open an X draft.

## The triage card

Three piles. One line per repo. No paragraphs.

### LET GO

Dead, abandoned, superseded, wrong stack, no license, install scripts you don't want. The catharsis pile. You can stop feeling guilty about these.

Each repo gets one line: name, one reason, trust score.

"langchain-legacy  Trust 0.08  Last commit 19 months ago. Let it go."

### CHECK NOW

Active, matches your stack, high signal. Small pile. Three to five.

Each repo gets one line: name, one reason, trust score.

"agentkit  Trust 0.82  Active. Matches your stack. Two contributors. Go."

### BUILD WITH

One or two repos. The hook. Not "here's a summary." Here's a project you could build with this, given your actual stack.

Each repo gets: name, the project idea (one or two lines), rough scope.

"agentkit  You write Go services. This is a TypeScript agent framework. Build a Go microservice that calls it over HTTP and adds a policy gate. 80 lines. Ship by Friday."

The BUILD WITH pile is the hardest output and the most valuable. A bad suggestion is "build a chatbot." A good one is specific to the repo's capabilities and the user's real stack. If the app can't generate a specific project, it says "No clear build path. Check anyway." An honest "nothing" beats a useless "anything."

## The trust scan

Facts, not advice. The app never says "don't use this." It prints what it found. The user decides.

Each repo gets scanned for these signals, all static, no code execution:

| Signal | What it checks | The fact it prints |
| --- | --- | --- |
| License | Is there a LICENSE file? What type? | "No license. You do not have permission to use this code." or "MIT." |
| Install scripts | postinstall in package.json, custom install in setup.py, pip install from non-PyPI URLs | "Runs code on install." or "Clean install." |
| Dependencies | Count from manifest. Known advisories if token is present. | "12 dependencies, 0 advisories." or "147 dependencies, 3 advisories." |
| Secrets | Regex scan of source files for API keys, tokens, .env contents | "3 hardcoded secrets in source." or "No secrets found." |
| Eval/obfuscation | eval(), exec(), base64 blobs in source | "2 eval calls, 1 base64 blob." or "Clean source." |
| Activity | Last commit, last release, commit frequency | "Last commit 14 months ago." or "Last commit 2 days ago." |
| Stars vs. forks | Ratio of stars to forks | "8,200 stars. 12 forks. People are saving, not building." |
| Contributors | Unique contributors in commit history | "1 contributor." or "24 contributors." |
| Tests | Presence of test directory, CI config (.github/workflows, .circleci, etc.) | "No tests." or "CI passes on 3 platforms." |
| README claims | Feature count in README vs. detectable entry points in code | "README claims 5 features. Code has 2." |

The trust score combines these. Same Beta reputation model as BOTy: each negative signal is an unproductive round, staleness is continuous decay. Trust = (alpha + 1) / (alpha + beta + 2). Alpha starts at a baseline and each clean signal adds to it. Each red flag adds to beta. Months of inactivity multiply decay.

The score is decomposed. The user sees the number and the parts. "Trust 0.18. No license. Runs code on install. Last commit 14 months ago. 1 contributor." The number means something because the parts are visible.

Meter labels, same as BOTy:
- 0.7+ trustworthy
- 0.4 to 0.7 it's complicated
- 0.125 to 0.4 wobbly
- below 0.125 terminated

The breakup line: "Terminated after 14 months of inactivity. Trust 0.12. It's not you, it's the maintainer."

## The share card

This is the viral artifact. Not the triage card (that's personal). This is a personality verdict derived from the saves. People share personality reads. They don't share triage lists.

The card reads their starred repos, groups them by category and language, compares against their pushed repos (if token present) or their bio/stated languages (if not), and prints a verdict.

Format:

"Your GitHub saves say you're a [verdict].

You star [top aspiration category] repos but push [top reality language].
You've saved [n] repos and built with [m].
Your saves are aspiration, not reality.

Top aspirations: [3 categories]
Top realities: [3 languages/topics]

[One-line roast, optional, in the BOTy voice]

What do your saves say about you? [url]"

Example:

"Your GitHub saves say you're a dreamer with a CRUD job.

You star AI agent frameworks but push Go microservices.
You've saved 47 repos and built with 2.
Your saves are aspiration, not reality.

Top aspirations: AI agents, vector databases, MCP servers
Top realities: Go, REST APIs, Docker

You are saving, not building. Find out what to actually build.

What do your saves say about you? [url]"

The card is a PNG, downloadable, with the URL burned in. The X draft is pre-filled with the verdict line and the URL. The app never posts it.

This is the send-to-a-person mechanic. "What do your saves say about you?" is the question that makes the next person paste their username.

## The auth offer

Two tiers. No gate.

### Unauthenticated (the front door)

Paste a username. The app uses GitHub's public API at 60 requests/hour per IP. Enough for a shallow scan: repo list, basic metadata (stars, forks, last push, language, license, topics). Maybe 20-30 repos before the rate limit hits.

The triage card works. The share card works. The trust scan is shallow: license, activity, stars-vs-forks, language match. No source file reads, no secrets scan, no dependency audit.

The rate limit is a fact, not a failure. When it hits: "You've got more saves than we can scan for free right now. Want to go deeper?"

### Deeper (the upsell)

"Paste a read-only GitHub token. We'll scan every repo, read your real stack from your pushed repos, and check for secrets, install scripts, licenses, and dependency advisories. The token is used for this scan only and never stored. Close the window and it's gone."

Token rules:
- Fine-grained PAT, read-only, public repos only. Or classic PAT with `public_repo` scope only.
- The app rejects any token with write scopes (`repo` with write, `delete_repo`, `admin:*`). It tells the user to make a read-only one and shows the GitHub settings link.
- Token stays in the browser. GitHub's API supports CORS. All API calls go from the browser to api.github.com directly. The Synteq server never sees the token. It only renders cards from data the browser already has.
- "Your token never leaves your browser" is copy. It is true.

The deeper scan unlocks: full source file reads (secrets, eval, install scripts), dependency manifests with advisory checks, the user's own pushed repos (real stack, not aspiration), and no rate limit for the session.

## Copy

These phrases are locked. Use them.

- "Your stars are aspiration, not reality."
- "The save is dopamine. The processing is debt."
- "People are saving, not building."
- "It's not you, it's the maintainer."
- "Your token never leaves your browser."
- "You can stop feeling guilty about these."
- "What do your saves say about you?"

Voice: dry, honest, a little funny. Same register as BOTy. No hype, no "empower," no "unlock your potential." A friend who already looked at it.

## The progress UX

The side window is the experience. The processing IS the dopamine, not the debt.

Status labels cycle as the scan runs:

1. "Reading your stars..."
2. "Scanning [n] repos..."
3. "Checking for secrets..." (if token)
4. "Reading your real stack..." (if token)
5. "Writing verdicts..."
6. "Building your share card..."
7. "Done."

Each label is honest. If the app is on step 3, it is actually checking for secrets. No fake progress bars. If a step is skipped (no token), it doesn't show.

## Tech

- Host: Synteq Apps. A new app (not boty). Free tier if a slot is open, otherwise Hobby ($5/mo, cancel after contest).
- App: Node 20 + Hono, server-rendered HTML, small client JS for the progress bar and client-side GitHub calls.
- GitHub API: unauthenticated public reads, or client-side authenticated reads with a pasted token. No server-side token handling.
- Cards: SVG to PNG via @resvg/resvg-js, in-memory. URL burned into the image. Same pattern as BOTy.
- Share: X web intent, pre-filled, never auto-posted. `in_reply_to` the entry post once it exists, baked in source.
- DB: none needed for unauthenticated. None for authenticated either (token is session-only, in browser memory). The app is stateless. A scan is a scan, not a stored record.
- Repo: `github.com/Dewars30/what-the-agent-sees`, new app directory under `apps/`. Reuse the GHCR image workflow.
- Health: `/healthz`.

## Contest

This is a Synteq Hack entry. Same rules as BOTy:

- Score = likes x 1 + replies x 2 + reposts x 3. Views ignored.
- Entry is Tony's public quote post of the announcement, with the app URL. Tony posts it. The app never posts.
- Share intents reply to the entry post once the id is baked in.
- No bot rings. No self-engagement scripts. No asking for likes.
- The share card is the artifact people pass. "What do your saves say about you?" is the send line.
- End with an instruction to send it to a person, not a request for engagement.

## Out of scope

Accounts, logins, saved settings, OAuth flows, server-side token storage, running repo code, dynamic analysis, dependency installation, a bookmarking feature, a "save better" recommendation engine, posting to X, monetization, pricing, a business model.

## Done when

A stranger can paste a GitHub username and get a triage card with three piles and a trust score on at least one repo. The share card downloads as a PNG with the URL burned in. The X draft is pre-filled and the app did not post it. The landing page explains what happens in one screen. The auth offer is visible below the triage card and the token, if pasted, never leaves the browser.

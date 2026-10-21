# What the agent sees

Three small apps about one question: when a software agent arrives at your website with no eyes, what can it actually do?

All three run on the same engine: one HTTP request, one HTML parse, zero models in the scoring path.

| App | What it does | Live |
| --- | --- | --- |
| **AgentScore** | Scores a page 0-100 across seven weighted dimensions, shows the exact text an agent receives, and estimates what each fix is worth. | https://agentscore.synteq.app |
| **Field Notes** | A first-person transcript of an agent visiting a page: what it understood, what it could not, and what it would have done differently. | https://fieldnotes.synteq.app |
| **Site FM** | Composes a page into music. Headings pick the melody, links set the rhythm, missing alt text becomes silence. | https://sitefm.synteq.app |

## Engine

- `core/fetch.mjs` - outbound fetch with an SSRF guard (IPv4 and IPv6 ranges, DNS rebinding checked per hop), byte and time caps
- `core/parse.mjs` - a small forgiving HTML parser, no dependencies
- `core/extract.mjs` - page facts: headings, links, labels, alt text, JSON-LD, landmarks, script weight
- `core/score.mjs` - the seven-dimension rubric, deterministic, every point traceable to a check
- `core/agentview.mjs` - renders the page as the structure an agent reads
- `core/aux.mjs` - robots.txt AI-crawler policy, sitemap, llms.txt

No runtime dependencies. Node 20+.

## Run one

```sh
node tools/sync.mjs          # copy shared core into each app
cd apps/agentscore && npm start
```

Built for Synteq Apps: each app folder has a Dockerfile and deploys as its own service.

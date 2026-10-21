# Deploying to Synteq Apps: what actually works

Written 2026-10-21 after ~12 failed deploys. Read this before touching the CLI.

## The problem

`synteq deploy` (source path: packs the folder, uploads a tarball, builds with Dockerfile or Railpack)
fails intermittently at Synteq's own registry step. The failure is not in our source:

- full Dockerfile builds fail after `FROM ... resolve ... done`
- Railpack builds (no Dockerfile at all) fail the same way
- a single static `index.html` with no build step fails the same way
- the API's `failureReason` is truncated mid-line, so the real error never surfaces

Support ticket #3708 (open). One build succeeded at 07:46Z and every attempt after that failed,
which means it is a server-side window, not a property of the bundle.

## The workaround: pre-built images

`synteq deploy --image <ref>` does not run a build. It pulls the image and rolls it out. That path works.

Image reference must include the registry host:

```sh
# fails: missing registry host
synteq deploy --app fieldnotes --image nginxdemos/hello:plain-text
# works
synteq deploy --app fieldnotes --image docker.io/nginxdemos/hello:plain-text
```

Images are built in CI, not locally: `.github/workflows/images.yml` builds all three apps for
`linux/amd64` on every push to `main` and pushes to

```
ghcr.io/dewars30/what-the-agent-sees-<app>:latest
ghcr.io/dewars30/what-the-agent-sees-<app>:<sha>
```

Packages are public, so Synteq pulls them anonymously; no registry credential is needed.

Deploy with the SHA tag, not `:latest`. Repeating `:latest` can reuse a cached digest and you
will spend twenty minutes wondering why your change did not ship.

```sh
SHA=$(git rev-parse HEAD)
synteq deploy --app agentscore --image ghcr.io/dewars30/what-the-agent-sees-agentscore:$SHA
```

## Two traps that look like code bugs

1. **Health check path.** Each app's health path is a per-app setting (`synteq app settings show`).
   `fieldnotes` was set to `/health`, which nothing serves, so every release failed the gate with
   `health gate failed for 1/1 instance(s)` and the previous release kept answering. The site looks
   up, the deploy "succeeds", and nothing changes. Correct value: `/healthz`.
2. **Environment variables need a fresh release.** `synteq app env add` marks a pending rollout;
   a deploy fired immediately after can still boot the old env snapshot. Bake defaults into the
   image instead where the value is stable (that is why `ENTRY_TWEET_ID` has a hardcoded fallback
   per app).

## App inventory

| Slug | Directory | Image | Plan |
| --- | --- | --- | --- |
| agentscore | apps/agentscore | what-the-agent-sees-agentscore | free |
| fieldnotes | apps/roast | what-the-agent-sees-roast | hobby |
| sitefm | apps/sitefm | what-the-agent-sees-sitefm | hobby |
| app-9ab057de | - | none | free (junk, from the failed drag-and-drop attempts) |
| app-df0fa5a4 | - | none | hobby (junk, same) |

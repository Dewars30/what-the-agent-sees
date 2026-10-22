# GitHub fix flow

AgentScore can open a pull request from the fix kit. The flow is off until the variables below are set on the `agentscore` app. This repo does not contain a client secret. An OAuth app was not registered from here, and nothing was deployed.

## What you set up

1. GitHub: Settings, Developer settings, OAuth Apps, New OAuth App.
2. Application name: `AgentScore`
3. Homepage URL: `https://agentscore.synteq.app`
4. Authorization callback URL: `https://agentscore.synteq.app/github/fix/callback`
5. Register the app, then generate a client secret. Copy the client id and the secret once.
6. On the Synteq app `agentscore`, set:
   - `GITHUB_FIX_ENABLED=1`
   - `GITHUB_CLIENT_ID` to the OAuth app client id
   - `GITHUB_CLIENT_SECRET` to the client secret
7. Redeploy with the SHA image tag, not `:latest`. See `docs/DEPLOY-NOTES.md`. A new environment variable needs a fresh release or the process keeps the old environment.

Leave `GITHUB_FIX_ENABLED` unset and the button stays hidden. `/github/fix/start` answers `not enabled`.

## Scope

The OAuth scope is `public_repo`.

That scope can read public repositories and open pull requests on public repositories the user can push to. Private repositories are out of scope. Do not switch the scope to `repo` unless you mean to grant access to private repositories.

The user picks one repository. The app does not choose one for them.

## What the running app does

- `Fix it for me` is rendered only when the flag and both credentials are set.
- The user signs in, picks a public repository, and gets a pull request to review.
- The app creates `agentscore/fix-<report id>` from the default branch tip and commits only on that branch.
- It does not update the default branch.
- The access token is kept in process memory for one hour (`ag_gh` cookie, HttpOnly, SameSite=Lax). It is not written to disk, not stored in the report, and not logged.
- Framework detection reads `package.json`. `next` means Next.js. `astro` means Astro. An `index.html` at the repo root, with neither dependency, means plain HTML.
- Anything else stops at the report. No pull request.
- The scanned URL path is mapped to one source file (`index.html`, `app/.../page.tsx`, `src/pages/...astro`, and the usual variants). If none of those files exist, the result is the report only.
- `robots.txt` and `llms.txt` are added only when the scan says they are missing and the repo does not already have them. Next.js and Astro get them under `public/`. Plain HTML gets them at the repo root.

## Check without credentials

```sh
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' http://127.0.0.1:8080/github/fix/start
```

With the flag unset, the status is 404 and the body is `not enabled`.

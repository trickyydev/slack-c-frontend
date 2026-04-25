# DevOps Runbook (Slack Classics)

## Must-Know Safety Rules

- Use only Cloudflare account `trickyydev@gmail.com` / `c720a46967ac565c8319ce48e3c2bcff`.
- Never create or modify project resources under `Greenlight.project9@gmail.com` / `617052ba599e50f8ba56a9b08ed34a23`.
- Keep `TURNSTILE_REQUIRED=true` for production-facing deploys.
- Do not store the production `UPLOAD_CODE_HASH_SALT` in repo-root `.dev.vars`.

## Canonical Accounts

### Cloudflare

- account email: `trickyydev@gmail.com`
- account ID: `c720a46967ac565c8319ce48e3c2bcff`

Verify:

```bash
npx wrangler whoami
```

### GitHub

- repo: `trickyydev/slack-c-frontend`
- local SSH remote pattern: `git@github-trickyydev:trickyydev/slack-c-frontend.git`

Verify:

```bash
git remote -v
ssh -T github-trickyydev
```

## Monoproject Secrets

For Slack Classics, the temporary monoproject secret source of truth is:

- `/Users/nice/cody/_slack_classics/SECRETS.txt`

Current key in use:

- `SLACK_CLASSICS_ADMIN_PASSWORD`
- `SLACK_CLASSICS_ADMIN_SESSION_SECRET`

## Production Resources

- Worker: `slack-c-frontend`
- R2 bucket: `slack-classics-care-packages`
- D1 database: `slack-classics-inbox-db`
- D1 database ID: `85eedd9c-087d-42c1-9e18-86f239c222f1`
- current public host: `https://www.slackclassics.com`
- current tunnel-backed dev host: `https://4783.slackclassics.com`

## Deployment Model

Current expected path:
1. Commit and push to `main`.
2. Cloudflare Workers Builds deploys automatically from GitHub.
3. Verify production route behavior and API health.

Manual operator fallback:

```bash
npx wrangler deploy
```

Useful checks:

```bash
npx wrangler deployments list
npx wrangler deployments status
curl -i https://www.slackclassics.com/api/health
curl -i https://4783.slackclassics.com/api/health
```

## Command Matrix

| Goal | Command |
|------|---------|
| Start local app (default: production Worker API) | `../scripts/start-frontend-dev.sh` |
| Start local frontend against local API | `../scripts/start-frontend-dev.sh --local-api` |
| Start local frontend against production Worker API | `../scripts/start-frontend-dev.sh --prod-api` |
| Start local frontend against custom API URL | `../scripts/start-frontend-dev.sh --api-url https://example.workers.dev` |
| Start local app with browser/CDP logging | `../scripts/start-frontend-dev.sh --verbose` |
| Start named dev tunnel | `../scripts/start-dev-tunnel.sh` |
| Build app | `npm run build` |
| Lint app | `npm run lint` |
| Generate worker types | `npm run cf-typegen` |
| Local D1 migration | `npx wrangler d1 migrations apply slack-classics-inbox-db --local` |
| Remote D1 migration | `npx wrangler d1 migrations apply slack-classics-inbox-db --remote` |
| Manual deploy | `npx wrangler deploy` |
| Hash upload code | `npm run hash-code -- "code"` |

## Route Model

Current production posture:
- broad host routing is being used so the SPA shell and its root-relative assets load together
- app-level route separation between `/` and `/inbox` is still a frontend task
- `/admin` should be added as an app/product surface later, not as an ad hoc routing hack

Operational rule:
- keep routing intent documented in `wrangler.jsonc`
- keep quick links in `DIRECTORY.md`
- keep route/product decisions in `WORK_IN_PROGRESS.md`

## Local Dev Logging

The preferred local launcher follows the Greenlight pattern:
- app stdout and stderr go to `/Users/nice/cody/__LOGS/slack-c-frontend-dev.log`
- `--verbose` routes the session through `process-browser.sh`
- browser console output and browser-detected errors are appended to the same log file as `[BROWSER][INFO]`, `[BROWSER][WARN]`, or `[BROWSER][ERROR]`

Typical workflow:

```bash
cd /Users/nice/cody/_slack_classics
./scripts/start-frontend-dev.sh --verbose
tail -f /Users/nice/cody/__LOGS/slack-c-frontend-dev.log
```

Important:
- the launcher now uses `--strictPort`, so if `4783` is busy it fails instead of silently moving to another port
- that keeps the browser runner, CDP logging, and your own manual testing pointed at the same URL

## Local Frontend + Production Data Workflow

Preferred low-local-state workflow:
- run the frontend locally
- proxy `/api` through the local dev server to the production host
- keep database, R2, and quota behavior on Cloudflare instead of on your machine

Command:

```bash
cd /Users/nice/cody/_slack_classics
./scripts/start-frontend-dev.sh --verbose
```

Why this is better for this repo:
- D1 and R2 can be remote during local development, but Durable Objects are still local-only during local dev
- this app uses a Durable Object for quota coordination
- proxying to the production host keeps `D1`, `R2`, and the quota Durable Object together on Cloudflare without browser CORS problems

## Dev Tunnel

Current tunnel:
- name: `slack-c-frontend-dev`
- ID: `104c44aa-eb4d-424b-b19e-13467616d137`
- current hostname: `https://4783.slackclassics.com`

Operational notes:
- tunnel config is separate from Worker config
- do not try to put tunnel settings in `wrangler.jsonc`
- Turnstile must allow the tunnel hostname before local browser uploads will behave like production
- browser logging currently has an origin-filter blind spot for the tunnel hostname

Preferred dev-hostname workflow:

```bash
cd /Users/nice/cody/_slack_classics
./scripts/start-frontend-dev.sh --verbose
./scripts/start-dev-tunnel.sh
```

## Turnstile And Secrets

Production Turnstile:
- site key lives in `wrangler.jsonc`
- secret key lives in Cloudflare Worker secrets
- admin password should also live in Cloudflare Worker secrets
- admin cookie signing secret should be separate from the admin password

Set or rotate secret:

```bash
printf '%s' 'NEW_SECRET' | npx wrangler secret put TURNSTILE_SECRET_KEY
printf '%s' 'NEW_ADMIN_PASSWORD' | npx wrangler secret put ADMIN_PASSWORD
printf '%s' 'NEW_ADMIN_SESSION_SECRET' | npx wrangler secret put ADMIN_SESSION_SECRET
```

Current note:
- `ADMIN_PASSWORD` has already been uploaded from `/Users/nice/cody/_slack_classics/SECRETS.txt`
- `ADMIN_SESSION_SECRET` should be uploaded from `/Users/nice/cody/_slack_classics/SECRETS.txt`

Upload code hashing:
- production salt is stored in Worker secrets
- local hash generation can use macOS Keychain key `slack-c-frontend/UPLOAD_CODE_HASH_SALT`

## Current Known Gaps

- frontend upload controls are wired enough for real uploads, but success/error feedback still needs refinement
- `/inbox` should become a distinct app route instead of relying on root delivery
- admin surface now exists as a first read-only private trail, but download/delete tools are still not implemented
- browser/CDP logging currently filters too narrowly to capture tunnel-host testing cleanly

## Documentation Ownership

- onboarding and repo contract: `README.md`
- quick links and routes: `DIRECTORY.md`
- deployment and account rules: `DEV_OPS.md`
- active tasks and diary: `WORK_IN_PROGRESS.md`

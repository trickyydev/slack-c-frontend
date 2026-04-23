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

## Production Resources

- Worker: `slack-c-frontend`
- R2 bucket: `slack-classics-care-packages`
- D1 database: `slack-classics-inbox-db`
- D1 database ID: `85eedd9c-087d-42c1-9e18-86f239c222f1`
- current public host: `https://www.slackclassics.com`
- workers.dev fallback: `https://slack-c-frontend.fixxer-workers.workers.dev`

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
curl -i https://slack-c-frontend.fixxer-workers.workers.dev/api/health
```

## Command Matrix

| Goal | Command |
|------|---------|
| Start local app | `../scripts/start-frontend-dev.sh` |
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

## Turnstile And Secrets

Production Turnstile:
- site key lives in `wrangler.jsonc`
- secret key lives in Cloudflare Worker secrets

Set or rotate secret:

```bash
printf '%s' 'NEW_SECRET' | npx wrangler secret put TURNSTILE_SECRET_KEY
```

Upload code hashing:
- production salt is stored in Worker secrets
- local hash generation can use macOS Keychain key `slack-c-frontend/UPLOAD_CODE_HASH_SALT`

## Current Known Gaps

- frontend upload controls are not fully wired to the backend yet
- `/inbox` should become a distinct app route instead of relying on root delivery
- admin surface is planned but not implemented
- deployed verification should grow into a repeatable smoke checklist once upload flow exists

## Documentation Ownership

- onboarding and repo contract: `README.md`
- quick links and routes: `DIRECTORY.md`
- deployment and account rules: `DEV_OPS.md`
- active tasks and diary: `WORK_IN_PROGRESS.md`

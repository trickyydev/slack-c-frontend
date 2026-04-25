# Care Package Inbox

Cloudflare-first upload app foundation for a public `/inbox` route where people can send you a "care package" of files or folders.

## Read Order

1. `README.md`
2. `WORK_IN_PROGRESS.md`
3. `DIRECTORY.md`
4. `DEV_OPS.md`
5. `wrangler.jsonc`
6. `worker/index.ts`
7. component and script docs as needed

## Cloudflare Account Safety

This project must use only the following Cloudflare account:

- allowed account email: `trickyydev@gmail.com`
- allowed account ID: `c720a46967ac565c8319ce48e3c2bcff`

Do not create, deploy, bind, or modify any resources for this project under:

- forbidden account email: `Greenlight.project9@gmail.com`
- forbidden account ID: `617052ba599e50f8ba56a9b08ed34a23`

This rule is important enough to treat as an operator safety requirement, not a suggestion.

## Stack

- React + Vite
- Cloudflare Workers with Static Assets
- Cloudflare R2 for uploaded files
- Cloudflare D1 for care package metadata
- Cloudflare Durable Objects for atomic quota reservations
- Cloudflare Turnstile for upload verification

## Live URLs

Route directory:
- [DIRECTORY.md](/Users/nice/cody/_slack_classics/slack-c-frontend/DIRECTORY.md)

Current live surfaces:
- production root: `https://www.slackclassics.com`
- tunnel-backed local dev host: `https://4783.slackclassics.com`

Important:
- production root is currently serving the app shell
- the tunnel-backed local host is now the preferred real-hostname dev surface
- `/inbox` route behavior is still being normalized at the app-routing level
- use `DIRECTORY.md` as the quick-reference route sheet instead of scattering URLs through diary notes

## Current scope

This repo is intentionally backend-first. It includes:

- a Cloudflare Worker API for upload session creation and resumable uploads
- a D1 schema for care packages, files, and upload codes
- a quota coordinator Durable Object that enforces reserved bytes
- a working first-pass uploader UI, not just a placeholder shell

The visual inbox flow and admin interface are intentionally deferred.

## Core behavior

- Public uploads do not require a code by default.
- All uploads require a valid Turnstile token.
- Anonymous uploads are capped by a rolling hourly quota.
- Total bucket usage is capped with reserved bytes.
- Upload codes are reusable until they expire and bypass the public hourly cap.
- Folder uploads preserve relative paths.
- Large files use multipart uploads with resume-friendly state stored in D1.

## Default assumptions

These are wired as environment variables today and can move into the admin panel later:

- bucket cap: `10 GB`
- public rolling hourly cap: `6 GB`
- public per-care-package cap: `2 GB`
- multipart chunk size: `8 MiB`
- direct upload max: `32 MiB`
- session TTL: `24 hours`

## Project layout

- [WORK_IN_PROGRESS.md](/Users/nice/cody/_slack_classics/slack-c-frontend/WORK_IN_PROGRESS.md)
- [DIRECTORY.md](/Users/nice/cody/_slack_classics/slack-c-frontend/DIRECTORY.md)
- [DEV_OPS.md](/Users/nice/cody/_slack_classics/slack-c-frontend/DEV_OPS.md)
- [src/App.tsx](/Users/nice/cody/_slack_classics/slack-c-frontend/src/App.tsx)
- [worker/index.ts](/Users/nice/cody/_slack_classics/slack-c-frontend/worker/index.ts)
- [wrangler.jsonc](/Users/nice/cody/_slack_classics/slack-c-frontend/wrangler.jsonc)
- [migrations/d1/0001_initial.sql](/Users/nice/cody/_slack_classics/slack-c-frontend/migrations/d1/0001_initial.sql)
- [../scripts/start-frontend-dev.sh](/Users/nice/cody/_slack_classics/scripts/start-frontend-dev.sh)
- [../scripts/start-dev-tunnel.sh](/Users/nice/cody/_slack_classics/scripts/start-dev-tunnel.sh)
- [scripts/hash-upload-code.mjs](/Users/nice/cody/_slack_classics/slack-c-frontend/scripts/hash-upload-code.mjs)

## Local Port Contract

Use a project-specific port neighborhood that stays close to your other repos without colliding with them.

- `4783`: public app and Worker runtime
- `4793`: reserved for a future admin/workbench surface
- `4803`: reserved for a future styleguide/component-lab surface
- `4813`: reserved for a future smoke/local harness if needed

Right now, only `4783` is active.

## Repository Model

This repo lives inside the local coordinator workspace:
- monoproject root: `/Users/nice/cody/_slack_classics`

Current sibling repos:
- `/Users/nice/cody/_slack_classics/slack-c-frontend`
- `/Users/nice/cody/_slack_classics/slack-classics-frontend-proto`

Commits and pushes happen inside each repo, not at the monoproject root.

## Huddle

A huddle is the standard project synchronization pass for this repo.

Huddle checklist:
1. Read `WORK_IN_PROGRESS.md` (`Brief`, then `TODO`).
2. Update active TODO status and near-term priorities.
3. Add a short diary note with what changed, decisions, and immediate next step.
4. Synchronize any docs touched by the work (`README`, `DIRECTORY`, `DEV_OPS`, component docs as needed).

Target outcome:
- Someone can open `README.md`, then `WORK_IN_PROGRESS.md`, and understand what is in progress right now without relying on chat memory.

## Required Cloudflare resources

These resources now exist under the allowed account:

1. R2 bucket: `slack-classics-care-packages`
2. D1 database: `slack-classics-inbox-db`
3. Turnstile widget: production widget configured for `slackclassics.com`

Production Turnstile wiring now expects:

- `TURNSTILE_SITE_KEY` in `wrangler.jsonc`
- `TURNSTILE_SECRET_KEY` as a Worker secret
- `ADMIN_PASSWORD` as a Worker secret for `/admin`
- `ADMIN_SESSION_SECRET` as a separate Worker secret for signing admin cookies

Important:
- `wrangler.jsonc` is pinned to the allowed Cloudflare account ID for this project.
- If Wrangler ever prompts for account selection, do not choose the Greenlight account for this repo.
- The remaining manual production dependency is Turnstile. Keep `TURNSTILE_REQUIRED=true` and do not weaken it just to get uploads live faster.

## Local setup

1. Install dependencies:

```bash
npm install
```

2. Generate Worker types after editing bindings:

```bash
npm run cf-typegen
```

3. Apply the local D1 migration only if you intentionally use the local API:

```bash
npx wrangler d1 migrations apply slack-classics-inbox-db --local
```

4. Add local secrets only when needed:

```bash
TURNSTILE_SECRET_KEY=...
TURNSTILE_SITE_KEY=...
ADMIN_PASSWORD=...
ADMIN_SESSION_SECRET=...
```

Monoproject secret source of truth for now:

- `/Users/nice/cody/_slack_classics/SECRETS.txt`
- current admin password key: `SLACK_CLASSICS_ADMIN_PASSWORD`
- current admin session signing key: `SLACK_CLASSICS_ADMIN_SESSION_SECRET`

Important:
- do not store the production `UPLOAD_CODE_HASH_SALT` in repo-root `.dev.vars`
- the upload-code hash helper can read the salt from macOS Keychain instead
- when a secret needs to be promoted to Cloudflare, use `SECRETS.txt` as the local source and upload it as a Worker secret

5. Start local development:

```bash
npm run dev
```

Preferred launcher, following the `_gl` repo pattern:

```bash
../scripts/start-frontend-dev.sh
../scripts/start-frontend-dev.sh --api-url https://example.workers.dev
../scripts/start-frontend-dev.sh --local-api
../scripts/start-frontend-dev.sh --prod-api
../scripts/start-frontend-dev.sh --verbose
```

Local development contract:

- app URL: `http://localhost:4783`
- log file: `/Users/nice/cody/__LOGS/slack-c-frontend-dev.log`
- `--verbose` uses the shared browser/CDP runner and writes browser console/errors into the same log file as `[BROWSER]` entries
- the default launcher keeps the frontend local and proxies `/api` requests upstream to the production host
- `--local-api` is available when you explicitly want local Worker + local D1

Useful log commands:

```bash
tail -f /Users/nice/cody/__LOGS/slack-c-frontend-dev.log
tail -n 200 /Users/nice/cody/__LOGS/slack-c-frontend-dev.log
```

## Dev Tunnel

Named dev tunnel created under the allowed Cloudflare account:

- tunnel name: `slack-c-frontend-dev`
- tunnel ID: `104c44aa-eb4d-424b-b19e-13467616d137`
- current dev hostname: `https://4783.slackclassics.com`

Important:
- tunnel configuration is separate from `wrangler.jsonc`
- `wrangler.jsonc` controls the Worker app, not the Cloudflare Tunnel

Preferred local-with-real-hostname workflow:

```bash
cd /Users/nice/cody/_slack_classics
./scripts/start-frontend-dev.sh --verbose
./scripts/start-dev-tunnel.sh
```

Current caveat:
- shared browser logging still watches `localhost` by default, so tunnel-host browser console/error capture is the next observability task

Tunnel log:

```bash
tail -f /Users/nice/cody/__LOGS/slack-c-frontend-tunnel.log
```

## Upload code hashing

Upload codes are stored as salted SHA-256 hashes.

Generate a hash locally with:

```bash
UPLOAD_CODE_HASH_SALT="your-salt" npm run hash-code -- "your-code"
```

Then insert the hash into `upload_codes`.

On macOS, the hash script also falls back to a Keychain item named `slack-c-frontend/UPLOAD_CODE_HASH_SALT`.

Important:
- Do not leave the real production upload-code salt in repo-root `.dev.vars`.
- The current build pipeline copies `.dev.vars` into the worker build output directory, so real secrets there are too easy to package by accident.

## Important notes

- This foundation keeps tracking data indefinitely for now because that is the current product decision.
- Header snapshots are truncated before storage to keep D1 rows small.
- The Worker implementation currently expects the future frontend to upload file manifests first, then upload file bodies through API routes.
- Download-and-delete management behavior is not implemented yet.
- Active operational state belongs in [WORK_IN_PROGRESS.md](/Users/nice/cody/_slack_classics/slack-c-frontend/WORK_IN_PROGRESS.md), not in ad hoc chat-only memory.

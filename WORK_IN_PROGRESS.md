## Important

> *This is the active project memory for day-to-day work.*
>
> *`Brief` should stay short, current, and easy to scan.*
>
> *`TODO` should hold active work and parked follow-ups.*
>
> *`Diary` should keep the implementation trail: what changed, why, and what comes next.*
>
> *When the project meaningfully changes direction or scope, update this file before moving on.*

# Brief
Updated: 2026-04-22 19:50 EDT (-0400)

- Active work is focused on backend-first architecture for the Care Package inbox app in `/Users/nice/cody/_slack_classics/slack-c-frontend`.
- Current stack is React + Vite + Cloudflare Worker assets, with R2, D1, Durable Objects, and Turnstile planned as the core platform pieces.
- Public uploads are intended to stay frictionless, with a rolling hourly cap and absolute bucket cap enforced via reserved bytes.
- Local development conventions are starting to mirror `/Users/nice/cody/_gl`, including fixed ports, a root launcher script, global logs, and a WIP-first documentation pattern.
- The main app now has a first real inbox UI: one-column, upload-first, with `Anon` versus `Invite` gating based on the focused prototype direction.
- Production Cloudflare resources now exist under the allowed account for this repo:
  - R2 bucket `slack-classics-care-packages`
  - D1 database `slack-classics-inbox-db`
- Production Turnstile keys are now wired into the Worker configuration path.

## Important Safety Rule

- This project must use Cloudflare account `trickyydev@gmail.com` / `c720a46967ac565c8319ce48e3c2bcff`.
- Never create or modify project resources under `Greenlight.project9@gmail.com` / `617052ba599e50f8ba56a9b08ed34a23`.

# TODO

### Active TODO (Top 5)

- [ ] Build the actual `/inbox` uploader UI on top of the current Worker API foundation.
- [ ] Add the next layer of `_gl`-style repo ergonomics: more launcher scripts, a stronger root command surface, and clearer operator docs.
- [ ] Decide the future local port contract for admin and design/reference surfaces, even if only the public app runs today.
- [ ] Add a first-pass local setup flow for Cloudflare resources and secrets so a fresh machine can bootstrap more easily.
- [ ] Design the authenticated management area for browsing, downloading, confirming, and deleting completed or failed care packages.

### Parked TODO (Not Active)

- [ ] Decide whether this repo should eventually have a separate styleguide or component-lab surface like `_gl`.
- [ ] Add cleanup tooling for expired multipart uploads and abandoned reservations.
- [ ] Add retention controls for tracking metadata, including optional purge rules for IP/header snapshots.
- [ ] Implement download-confirm-delete workflow in the admin side after the management UI exists.
- [ ] Add smoke/integration coverage once the uploader UI and admin routes stabilize.

# Diary

### 2026-04-22 16:05 EDT (-0400): Huddle - Focused Inbox UI Ported Into Main App

- Replaced the placeholder screen in the main app with the focused `Slack Classics Inbox` direction from the prototype repo.
- Kept the first official UI intentionally narrow:
  - one-column layout
  - centered upload flow
  - `Anon` / `Invite` mode toggle
  - invited metadata hidden behind the test access code
- The main app now reflects the current preferred direction instead of the earlier architecture placeholder.

### 2026-04-22 19:39 EDT (-0400): Huddle - Production Cloudflare Resources Created

- Created the production R2 bucket under the allowed account:
  - `slack-classics-care-packages`
- Created the production D1 database under the allowed account:
  - `slack-classics-inbox-db`
  - `85eedd9c-087d-42c1-9e18-86f239c222f1`
- Updated `wrangler.jsonc` so the repo now points to the real production resource names instead of placeholders.
- Turnstile is still the remaining production dependency before secure anonymous uploads can go live.
- Found a local secret-handling risk while verifying the build:
  - the current build output copies repo-root `.dev.vars` into `dist/slack_c_frontend/.dev.vars`
- Adjusted the upload-code hash helper so it can read the salt from macOS Keychain instead of requiring the real secret to live in the repo.

### 2026-04-22 19:50 EDT (-0400): Huddle - Production Turnstile Keys Wired

- Added the production Turnstile site key to `wrangler.jsonc`.
- Uploaded the production Turnstile secret as a Worker secret.
- The backend path for server-side Turnstile validation is now configured for production traffic.

### 2026-04-22 14:52 EDT (-0400): Huddle - Cloudflare Account Safety Rule Pinned

- Confirmed Wrangler login can see two Cloudflare accounts, which makes this repo unsafe if account choice is left implicit.
- Added an explicit account safety rule to the repo docs.
- Pinned `wrangler.jsonc` to the allowed Cloudflare account:
  - `trickyydev@gmail.com`
  - `c720a46967ac565c8319ce48e3c2bcff`
- Explicitly documented the forbidden account for this repo:
  - `Greenlight.project9@gmail.com`
  - `617052ba599e50f8ba56a9b08ed34a23`

### 2026-04-22 14:35 EDT (-0400): Huddle - WIP-First Docs And Global Logging Adopted

- Added `WORK_IN_PROGRESS.md` so this repo can carry active project memory in one place rather than scattering notes across chat and README edits.
- Switched the frontend launcher to the global log convention:
  - `/Users/nice/cody/__LOGS/slack-c-frontend-dev.log`
- Kept the frontend on fixed local port `4783`.
- Reserved the nearby project-specific port range so this repo can grow without colliding with your other projects:
  - `4783` public app + Worker runtime
  - `4793` future admin/workbench surface
  - `4803` future styleguide/component lab
  - `4813` future smoke/local harness if needed
- This keeps the repo in the same family as `_gl` while still giving it its own distinct neighborhood.

### 2026-04-22 13:05 EDT (-0400): Huddle - Cloudflare Backend Foundation Scaffolded

- Scaffolded the Care Package app foundation in `/Users/nice/cody/_slack_classics/slack-c-frontend`.
- Chose React + Vite with Cloudflare’s Vite plugin instead of Next.js.
- Added Worker routes for upload sessions, direct uploads, multipart uploads, and session completion/cancellation.
- Added D1 schema for care packages, file records, and upload codes.
- Added a Durable Object quota coordinator to enforce reserved-byte bucket and hourly-cap behavior.
- Verified local build, lint, Worker type generation, and local D1 migration flow.

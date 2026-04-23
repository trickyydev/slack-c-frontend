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
Updated: 2026-04-23 15:02 EDT (-0400)

- Active work is now split between two tracks: real upload functionality and repo organization/operability.
- Current stack is React + Vite + Cloudflare Worker assets, with R2, D1, Durable Objects, and Turnstile as the core platform pieces.
- Public site is live on `https://www.slackclassics.com`, with `workers.dev` still available as a fallback runtime.
- Local development conventions now intentionally mirror `/Users/nice/cody/_gl`: fixed ports, root launcher scripts, global logs, route directory, deployment runbook, and WIP-first memory.
- The next product breakpoint is still the real browser upload flow; the first browser-side upload pass is now wired, and the next step is live-browser verification on the real domain.

## Important Safety Rule

- This project must use Cloudflare account `trickyydev@gmail.com` / `c720a46967ac565c8319ce48e3c2bcff`.
- Never create or modify project resources under `Greenlight.project9@gmail.com` / `617052ba599e50f8ba56a9b08ed34a23`.

# TODO

### Active TODO (Top 5)

- [ ] Make the real domain upload flow testable end to end: file picking, Turnstile, session creation, and first successful upload into R2/D1.
- [ ] Build the actual `/inbox` uploader UI on top of the current Worker API foundation.
- [ ] Split frontend app routing cleanly so `/`, `/inbox`, and future `/admin` can diverge without route confusion.
- [ ] Add a first-pass local setup flow for Cloudflare resources and secrets so a fresh machine can bootstrap more easily.
- [ ] Design the authenticated management area for browsing, downloading, confirming, and deleting completed or failed care packages.

### Parked TODO (Not Active)

- [ ] Decide whether this repo should eventually have a separate styleguide or component-lab surface like `_gl`.
- [ ] Add a lightweight deployed smoke checklist once browser upload flow exists.
- [ ] Add cleanup tooling for expired multipart uploads and abandoned reservations.
- [ ] Add retention controls for tracking metadata, including optional purge rules for IP/header snapshots.
- [ ] Implement download-confirm-delete workflow in the admin side after the management UI exists.
- [ ] Add smoke/integration coverage once the uploader UI and admin routes stabilize.

# Diary

### 2026-04-23 15:02 EDT (-0400): Huddle - First Browser Upload Path Wired

- Replaced the static inbox shell with a first real browser-to-backend upload flow.
- The frontend now does the following against the live Worker API:
  - loads public config
  - initializes invisible Turnstile explicitly for the SPA
  - selects files or folders
  - creates an upload session
  - uploads direct files
  - uploads multipart files part-by-part
  - finalizes the care package
- Kept the current UI shape mostly intact while adding:
  - selected-file list
  - upload status and progress surface
  - real submit behavior
- Current caveats after this pass:
  - route separation between `/` and `/inbox` is still deferred
  - invite-only extra fields are still folded into the existing backend comment model rather than having dedicated schema
  - real browser verification is still needed on the production domain before calling this flow stable
- Verification completed in-repo:
  - `npm run build`
  - `npm run lint`

### 2026-04-23 14:19 EDT (-0400): Huddle - Organization Sync Before Upload Wiring

- Ran a real huddle pass instead of continuing ad hoc.
- Locked the immediate focus back onto product execution after the docs/ops pass:
  - first real browser upload flow on the live domain
  - route cleanup after the upload path is functioning
- Made `Huddle` explicit in `README.md` so the process is now part of the repo contract, not just a verbal habit carried over from Greenlight.
- Current working state after this sync:
  - docs are now split cleanly across `README.md`, `DIRECTORY.md`, `DEV_OPS.md`, and `WORK_IN_PROGRESS.md`
  - production app shell is live on `https://www.slackclassics.com`
  - next meaningful milestone is the first successful browser-to-R2/D1 upload from the real site
  - after that, the next routing milestone is separating `/`, `/inbox`, and future `/admin`

### 2026-04-23 14:20 EDT (-0400): Huddle - Greenlight Documentation Pattern Ported Further

- Did a second focused pass through `/Users/nice/cody/_gl` with an operations/task-tracking lens rather than a product-architecture lens.
- The most transferable Greenlight patterns for this repo were:
  - one authoritative read order
  - one active task/diary file
  - one route directory
  - one deploy/operator runbook
  - one clear split between quick links, operational commands, and active memory
- Added the missing docs to Slack Classics:
  - `DIRECTORY.md`
  - `DEV_OPS.md`
- Tightened `README.md` so it now reads more like an operator front door and less like a one-off setup note.
- Current documentation split is now:
  - `README.md` for onboarding and repo contract
  - `DIRECTORY.md` for quick links and route references
  - `DEV_OPS.md` for deploy/account/secret procedures
  - `WORK_IN_PROGRESS.md` for active tasks and implementation diary
  - the next useful organizational step after upload wiring is likely a lightweight deployed smoke checklist

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

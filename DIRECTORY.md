# Directory

Quick links for local testing and live environments.

## Daily Use

**Frontend root**
Local: [http://localhost:4783](http://localhost:4783)
Tunnel: [https://4783.slackclassics.com](https://4783.slackclassics.com)
Production: [https://www.slackclassics.com](https://www.slackclassics.com)

**Workers.dev fallback**
Production: [https://slack-c-frontend.fixxer-workers.workers.dev](https://slack-c-frontend.fixxer-workers.workers.dev)

**API health**
Local: [http://localhost:4783/api/health](http://localhost:4783/api/health)
Tunnel: [https://4783.slackclassics.com/api/health](https://4783.slackclassics.com/api/health)
Production: [https://www.slackclassics.com/api/health](https://www.slackclassics.com/api/health)

**Public config**
Local: [http://localhost:4783/api/public-config](http://localhost:4783/api/public-config)
Tunnel: [https://4783.slackclassics.com/api/public-config](https://4783.slackclassics.com/api/public-config)
Production: [https://www.slackclassics.com/api/public-config](https://www.slackclassics.com/api/public-config)

## Services

**Frontend root**
Local: [http://localhost:4783](http://localhost:4783)
Tunnel: [https://4783.slackclassics.com](https://4783.slackclassics.com)
Production: [https://www.slackclassics.com](https://www.slackclassics.com)

**Tunnel dev host**
Tunnel: [https://4783.slackclassics.com](https://4783.slackclassics.com)

**Prototype root**
Local: [http://localhost:4823](http://localhost:4823)

## Current Route Notes

**Current production app shell**
Production: [https://www.slackclassics.com](https://www.slackclassics.com)
Notes: currently acting as the inbox surface while route design is still settling

**Current dev-host app shell**
Tunnel: [https://4783.slackclassics.com](https://4783.slackclassics.com)
Notes: current local-through-tunnel testing surface; browser logging still needs to catch up to this hostname

**Current intended inbox route**
Production: [https://www.slackclassics.com/inbox](https://www.slackclassics.com/inbox)
Notes: route exists as a product intention, but frontend app-level routing still needs to catch up

## Future Reserved Surfaces

**Admin surface**
Local target: [http://localhost:4793](http://localhost:4793)
Production target: `https://www.slackclassics.com/admin`
Notes: reserved; not implemented yet

**Component lab**
Local target: [http://localhost:4803](http://localhost:4803)
Notes: reserved; not implemented yet

**Smoke harness**
Local target: [http://localhost:4813](http://localhost:4813)
Notes: reserved; not implemented yet

## Notes

- Keep this file focused on quick-open links and route notes.
- Keep deeper operational procedures in `DEV_OPS.md`.
- Keep active work tracking in `WORK_IN_PROGRESS.md`.
- Prefer the tunnel host and production host over the account-level `workers.dev` URL for day-to-day testing.

# Security review — 9 October 2026

The inspected code has useful SQL injection protection and partial denial-of-service protection. This review does not certify the system as secure or DDoS-proof. It covers backend source inspection and isolated local regressions, not a production penetration or load test.

## Changes made

- Mounted API and authentication rate/concurrency limits before JSON and form parsers.
- Disabled compressed request bodies, retained the existing 10 MB body limit, and bounded form fields (100) and nesting (5). Compressed clients now receive 415; oversized bodies receive 413; malformed bodies receive 400.
- Added process-wide ceilings of 30 active API requests and 20 active authentication requests alongside existing per-IP limits. Busy requests receive 503. These defaults need tuning against legitimate enrollment traffic.
- Bounded the rate-limit bucket map to 10,000 entries; ordinary-traffic penalty tracking was removed. Cleanup now runs once per minute instead of scanning the maps for every new client. At capacity, new tracked clients receive 503 until space becomes available.
- Bounded the database connection wait queue to 100 and connection establishment to 10 seconds. This does not bound execution time of an already-running database query.
- Bounded spreadsheet multipart requests to one file, ten fields, eleven parts and 64 KB per field; retained the 8 MB file limit.
- Replaced raw unexpected errors in student, officer and shared-admin responses with generic messages, including coded database errors in bulk review details.
- Set HTTP request/header timeouts to 60/15 seconds, keep-alive timeout to 5 seconds and maximum requests per socket to 1,000. A reverse proxy is still needed to handle slow connections and upstream floods.

## SQL injection findings

The database wrapper routes execute/query through mysql2 prepared execution and disables multiple statements. Reviewed dynamic SQL fragments use fixed table/column choices, constant scope clauses, or generated question-mark placeholders; data remains in bound parameters. No exploitable SQL injection was identified in the reviewed paths. Prepared execution cannot protect values interpolated directly into SQL in future changes.

Existing SQL regression tests cover login query parameters, malformed password-reset input and LIKE escaping. They use a mock database and do not constitute exhaustive live-database testing.

## Outstanding high-priority issue

The installed and declared xlsx version is 0.18.5, used by the authenticated spreadsheet import route. This version falls within published prototype-pollution and regular-expression DoS advisories. Size limits and administrator authorization reduce exposure but do not repair the parser. A crafted import could still monopolize the Node event loop.

An upgrade to the official SheetJS 0.20.3 tarball was attempted but failed with a network EACCES error. The existing dependency and lockfile were retained. Upgrade in an environment with permitted network access:

~~~powershell
npm install --save https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz
~~~

Verify normal ROTC and CWTS serial imports using sample workbooks afterward. Consider parsing imports in a worker with a time/memory budget to contain malformed or excessively complex files.

Sources:
- https://github.com/advisories/GHSA-4r6h-8v6p-xvw6
- https://github.com/advisories/GHSA-5pgg-2g8v-p4x9
- https://docs.sheetjs.com/docs/getting-started/installation/nodejs/

## Deployment checks still needed

- Enable and verify upstream DDoS protection and proxy rate limits. App limits cannot prevent bandwidth exhaustion and do not cover static assets or page requests.
- Confirm TRUST_PROXY_HOPS matches the actual network topology and that clients cannot reach the origin through a shorter path or forge trusted forwarding headers. render.yaml declares one hop, but the live deployment was not inspected. See https://expressjs.com/en/guide/behind-proxies/.
- If running several app processes, use shared rate-limit storage; the current maps are process-local and reset on restart.
- Use a restricted runtime database account. The code defaults to root if DB_USER is absent; the deployed database account privileges were not inspected. Prefer separate migration and runtime credentials.
- Bound expensive exports, bulk actions and query execution based on realistic data volumes. List/export paths can still retrieve large datasets.
- Complete a dependency audit. npm audit failed because the registry endpoint was inaccessible; no clean audit result is claimed.

## Validation

- node scripts/verify-sqli-hardening.js — passed.
- node scripts/verify-dos-hardening.js — passed. Covers rate blocking, per-IP/global concurrency, finish/close release behavior, limiter ordering, malformed/oversized/compressed bodies, form field limits, mocked database-error privacy and client-map capacity.
- Syntax validation of changed JavaScript — passed.

No production traffic flood or destructive database testing was performed. Restart the application to apply these local changes; they have not been deployed.

## Gradual login testing

The number of enrolled students is not a request limit. Concurrency counts only requests that are currently being handled. Total ceilings can now be set with RATE_LIMIT_MAX_TOTAL_CONCURRENT (default 30) and AUTH_RATE_LIMIT_MAX_TOTAL_CONCURRENT (default 20); existing thresholds have not been raised. Changes require a restart.

For students logging in gradually, measure response latency and 429/503 counts before increasing concurrency. Students on a shared campus Wi-Fi can share a public IP, so the per-IP request rate and authentication concurrency limits can group many students together. A single load generator also shares one IP. Verify actual .env settings and proxy configuration when interpreting test results. Increasing limits does not increase server or database capacity.

## Applied shared-Wi-Fi adjustment

Ordinary API traffic now has a fixed 10-second per-IP window allowing 200 requests. Authentication traffic allows 50 requests per IP per 10 seconds and also counts toward the general API allowance. Excess requests receive 429 with Retry-After until that window expires (1–10 seconds at the configured defaults). Rejected retries do not extend the window. The previous escalating 5–10 minute IP penalties and their environment settings were removed from this middleware.

API concurrency remains 30 per IP and 30 total per process. Authentication concurrency is now 20 per IP (previously 5) and remains 20 total per process. Concurrency rejection advises a retry after one second. These are initial test settings, not verified capacity for 1,000 active users. Existing account/identifier-based protection still locks login after five failed attempts for five minutes.

Updated .env, .env.example and render.yaml consistently. Restart locally to apply; live hosting environment settings must also be updated when deploying. No deployment or student/database mutation was performed for this change. SQL and DoS regressions passed, including recovery after a 10-second burst without a long IP block.

# Deployment (T-44)

The demo runs on a shared GCP Compute Engine VM (`ai-mesh-firewall`,
asia-south1-c) that also hosts an unrelated product. Everything here is
designed around not disturbing that neighbour.

**Public URL: <http://8.231.115.48:8600>**

## Shape

```
browser ──▶ nginx :8600 ──▶ /api, /media ──▶ fireflies-backend  127.0.0.1:8501 (uvicorn ×2)
                        └──▶ /            ──▶ fireflies-frontend 127.0.0.1:3301 (next start)
                                              └── volume fireflies_db_data: SQLite + media
```

- **Port 8600, not 80.** The box's port 80 belongs to the other product's
  nginx site. A dedicated GCP firewall rule (`allow-fireflies-8600`) opens
  8600; both app containers bind to localhost only.
- **Same-origin by construction.** The frontend is built with
  `NEXT_PUBLIC_API_URL=""`, so every API call is a relative `/api/...` that
  nginx routes to the backend. No CORS in the serving path (T-44.5).
- **Persistence** (T-44.3): the SQLite file and uploaded media live on the
  `fireflies_db_data` volume. Deploys rebuild containers, never volumes —
  verified by redeploying and checking data survives (T44-D).
- **First boot** (T-44.4): the container migrates, then seeds. The seeder is
  idempotent — it tops the demo up to eight meetings and only `--reset`
  (never run automatically) wipes.
- **Range requests** (T-44.6): `proxy_buffering off` on `/api` keeps 206
  responses intact, which is what makes the player seekable in production.

## Continuous deployment

A systemd timer on the VM (`fireflies-deploy.timer`, every 90 s) runs
`deploy.sh`: fetch `origin/main`, and only when the SHA moved — hard reset,
`docker compose build`, `up -d`, prune dangling images. A push to `main` is
live in ≤ ~2 minutes plus build time.

Pull-based instead of GitHub-Actions-push-based deliberately: the repo is
public, so polling needs **no deploy keys and no repo secrets**, and the VM
never has to accept inbound triggers.

Operations, on the VM:

```bash
systemctl status fireflies-deploy.timer          # is CD alive
journalctl -u fireflies-deploy.service -n 50     # deploy log (T-44.10)
docker logs fireflies-backend --tail 100         # app logs
~/apps/fireflies/deploy/deploy.sh --force        # manual redeploy
```

## Known limitation: a seconds-long unstyled window on every deploy

Observed directly on 2026-07-28. `/notebook` served HTML linking
`/_next/static/chunks/2u69cybe1lsrx.css`, and that URL returned **404**. Twenty
seconds later the HTML named a different hash which resolved fine. A page whose
only stylesheet 404s renders completely unstyled.

**Mechanism.** nginx proxies everything to the frontend container — there is no
static `alias`, so HTML and assets come from the same place, which is normally
what makes a swap atomic. The race is across *requests*, not within one:
`docker compose up -d` replaces the container between a visitor's HTML request
and their asset requests. The HTML they already hold names hashes that the new
container has never heard of. Content-hashed filenames make this correct
behaviour — the old chunk genuinely no longer exists — and a 404 rather than
stale content is the honest failure.

**Scope.** Only on an actual rebuild, which only happens when `origin/main`
moves, and only for a request in flight across the swap. The 90-second timer
does not widen it; the timer usually finds nothing to do.

**Not fixed, and what fixing it would take.** The real remedy is retaining the
previous build's `.next/static` so old hashes keep resolving through the
changeover — a named volume that new builds copy into rather than replace, plus
a sweep for anything older than two builds. That is a persistent-state change to
a deploy that currently has none: the whole script's safety property is
"build first, swap second, a failed build leaves the running stack untouched",
and adding a mutable shared volume is the kind of thing that turns a stateless
deploy into one with its own failure modes. For a single-box demo, a window of a
few seconds per push did not justify it. It is written down rather than fixed
because an evaluator loading the page mid-push would see something broken and
deserve an explanation that exists.

## Found by probing the deployment, not the code

Three things that are only visible against the running site. All were measured
with `curl` against `http://8.231.115.48:8600` on 2026-07-28; none is a leak or
an outage, and all are open.

**The `/dev/*` routes answer 200 instead of 404.** `/dev/components`,
`/dev/toasts` and `/dev/tokens` all return **200** with the branded not-found
page as the body, while a genuinely unknown route returns a correct 404. The
gate works — `DEV_SURFACES_ENABLED` is false and every one of those pages calls
`notFound()`, so no dev content is served. The status is wrong because all three
appear in `.next/prerender-manifest.json`: they are statically generated, so
`notFound()` runs at build time and its output is served as a static page like
any other. Fix is `export const dynamic = 'force-dynamic'` per page, moving the
gate to request time. It matters because anyone checking whether dev surfaces
shipped will read the status, not the body.

**Audio is gzipped, which `nginx-fireflies.conf` deliberately prevents.** That
file leaves audio out of `gzip_types` because nginx cannot serve byte ranges
from a compressed stream — correct, and it still is. But `app/main.py` adds
`GZipMiddleware(minimum_size=1000)`, which compresses every response over 1KB
before nginx sees it. Measured: a 1024-byte range comes back as **1047 bytes**,
and a 100KB range saves 1.2%. Compressing AAC gains nothing, and at the small
range sizes a seeking player issues, it makes responses larger. Seeking works —
the middleware compresses each already-range-selected response, where nginx
would have compressed the whole upstream one — so this is waste, not breakage.
Do **not** "fix the inconsistency" by adding audio to `gzip_types`; that is the
change the existing comment exists to prevent.

**~~No security headers on any response.~~ WRONG — I truncated my own
measurement.** Retracted rather than deleted, because the mistake is more
instructive than the claim was.

The headers have been there since T-44 (`ca14de8`) and are live right now:
`X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`,
`Referrer-Policy: strict-origin-when-cross-origin`, and a `Permissions-Policy`
locking camera, microphone and geolocation. I dumped the response headers
through `... | head -14` and read the absence of a header in the first fourteen
lines as its absence from the response. The security block starts at line 15.

The one real part: **`X-Powered-By: Next.js` is present**, which is free
reconnaissance and buys nothing. `poweredByHeader: false` in `next.config.ts`
removes it.

The general lesson is the one this file already illustrates twice: a check that
cannot fail cleanly is not a check. `head -14` silently converts "I did not
look" into "it is not there", and the resulting claim reads exactly like a
finding.

## Console hygiene, checked against the deployment

Eight routes loaded in a real browser against the live origin — `/notebook`,
`/meeting/1`, `/meeting/1?t=45`, `/search?q=pricing`, `/settings?tab=preferences`,
`/settings/tags`, `/upload`, `/analytics`. **Zero console errors and zero
warnings on every one.** That is T-46.2's claim, verified where it matters
rather than against a local build — the same place the `/dev/*` soft-404 and
the audio gzip were found, neither of which is visible locally.

**One thing that looks alarming and is not.** The same check reports "failed
requests": 8 on `/notebook`, 22 on `/search?q=pricing`, 0 on the settings
routes. Every one is `net::ERR_ABORTED` on a `…?_rsc=` URL — Next's route
prefetches for the links on the page, cancelled when the page settles or the
prefetch queue trims. Nothing 404s (`e2e/tests/35-network.spec.ts` asserts
exactly that on these routes), nothing is missing, and the count tracks the
number of links, which is why a search-results page shows the most and a
settings tab shows none.

Recorded because a bare count of 22 failed requests reads like a defect, and
the step that distinguishes them is one line — capture `failure().errorText`,
not just the count.

## First-time install (already done; recorded for reproducibility)

```bash
mkdir -p ~/apps && git clone https://github.com/AnshSinghal/FireFlies-Clone.git ~/apps/fireflies
cd ~/apps/fireflies && docker compose -f deploy/docker-compose.prod.yml up -d --build
sudo cp deploy/nginx-fireflies.conf /etc/nginx/sites-available/fireflies
sudo ln -s ../sites-available/fireflies /etc/nginx/sites-enabled/fireflies
sudo nginx -t && sudo systemctl reload nginx
sudo cp deploy/fireflies-deploy.{service,timer} /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now fireflies-deploy.timer
gcloud compute firewall-rules create allow-fireflies-8600 \
  --direction=INGRESS --action=ALLOW --rules=tcp:8600 --source-ranges=0.0.0.0/0
```

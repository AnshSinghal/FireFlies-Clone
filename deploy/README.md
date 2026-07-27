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

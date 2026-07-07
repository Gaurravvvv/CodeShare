# CodeShare — DevOps Handover

**Context:** Prepping CodeShare's DevOps pipeline for an ESDS campus placement technical interview. 8-day prep window, working solo. This doc is the single source of truth for where things stand.

**Repo:** https://github.com/Gaurravvvv/CodeShare
**Live app:** https://codesharre.vercel.app

---

## Ultimate Goal

Build a coherent, defensible DevOps story around the CodeShare project for the interview:

> "I containerized the app, automated build/push via CI, deployed it to a local Kubernetes cluster with health checks and autoscaling, wired up GitOps-driven deployment with ArgoCD, and instrumented observability with Prometheus/Grafana — with security scanning baked into the pipeline."

Every step is chosen to be something Gaurav can explain in detail if an interviewer (possibly up to CTO-level) digs in — depth over breadth, given this is only a fresher-level round.

**The 10-step flow (source of truth — order matters, dependencies flow downward):**

1. Dockerize app + Redis via docker-compose ✅ **DONE**
2. Add `/metrics` endpoint (Prometheus client) ✅ **DONE**
3. Manually push both images to GHCR once ✅ **DONE**
4. GitHub Actions CI (build + push to GHCR on push to `main`) ✅ **DONE**
5. Trivy security scan added to CI ✅ **DONE**
6. Deploy to local K8s cluster (Deployment + Service + HPA + health probes + Redis + ArgoCD GitOps) ✅ **DONE** (Applied & Running)
7. Prometheus + Grafana dashboards scraping `/metrics` 🔄 **IN PROGRESS (Configs Created)**
8. Grafana Loki for logs — optional, cuttable if short on time
9. Terraform for S3 + IAM — independent of the rest, cuttable-ish
10. README + architecture diagram + resume bullets — do last, once everything works

**If time runs short, cut in this order:** Loki → Terraform → HPA → Trivy. **Never cut Steps 1, 2, 4, 7.**

---

## Current Status & Completed Work

### Step 1 — Containerization
- `server/Dockerfile`: Node 20 Alpine, installs LibreOffice + fonts, runs as non-root user (`appuser`).
- `client/Dockerfile`: Multi-stage build: Stage 1 compiles with Vite, Stage 2 serves static output via nginx with custom `nginx.conf` (gzip + `try_files` SPA routing).
- `docker-compose.yml`: Orchestrates server, client, and password-protected Redis.
- Added `.dockerignore` to both `client/` and `server/`.

### Step 2 — Observability foundation (`/metrics`)
Added `prom-client` to the server under `src/metrics.js`. Custom metrics include:
- `cache_hits_total` / `cache_misses_total`
- `http_request_duration_seconds`
- `active_socket_connections`
- `active_rooms_total`
- Default Node process metrics.

### Step 3 — Manual GHCR push
Built and pushed both images once to confirm build -> registry path.

### Step 4 — GitHub Actions CI
`.github/workflows/ci.yml` - triggers on push to `main`, builds and pushes `server` and `client` to GHCR.

### Step 5 — Trivy security scan
Added to the CI workflow, scans post-build for CRITICAL/HIGH CVEs (currently set to non-blocking `exit-code: '0'`).

### Step 6 — Kubernetes deployment (Kind + ArgoCD)
- Installed local tools (`kind`, `kubectl`, `helm`) under `.bin/` and added to System PATH.
- Created `kind-config.yaml` to map port `8080` (host) to `30080` (container/NodePort).
- Created K8s manifests under `k8s/`:
  - `server-deployment.yaml` (2 replicas, resources, liveness/readiness, env, secrets)
  - `server-service.yaml` (ClusterIP, port 3001)
  - `client-deployment.yaml` (2 replicas, resources, liveness/readiness, secrets)
  - `client-service.yaml` (NodePort, port 80, nodePort 30080)
  - `server-hpa.yaml` / `client-hpa.yaml` (HPA, min 2/max 5, 70% CPU target)
  - `redis-deployment.yaml` / `redis-service.yaml` (1 replica, password-protected)
- Created `argocd-app.yaml` to manage GitOps deployments.
- Patched `metrics-server` with `--kubelet-insecure-tls` so the HPA can read CPU metrics.
- Fixed the issue where health checks returned `HTTP 429` by moving the `/api/health` and `/metrics` routes above the global rate-limiter in `server/src/index.js`.
- Verified all pods are running successfully in the local cluster and HPA is retrieving metrics.

### Step 7 — Prometheus + Grafana Setup
- Updated `k8s/server-service.yaml` to include `name: http` for the port definition.
- Created `k8s/servicemonitor.yaml` to instruct Prometheus operator to scrape the server `/metrics` endpoint.

---

## Issues Faced & Solutions

| Issue | Root Cause | Solution |
|---|---|---|
| Client Dockerfile ran Vite dev server in "production" | Never updated after initial local dev setup | Multi-stage build: compile with Vite, serve via nginx |
| `permission_denied: write_package` in CI | Missing permissions on GitHub Personal Access Token (PAT) / Actions settings | Set repo Workflow permissions to Read/write and set GHCR package's Actions access role to Write |
| `Move-Item`/PATH commands failing | Windows/PowerShell path and permission nuances | Standardized on PowerShell, configured system PATH |
| Server pods stuck on `ContainerCreating` | Image pull taking time due to image size | Monitored and waited for successful pull |
| GitHub token leaked in chat | Accidental exposure in a command line | Revoked immediately and re-created the secret with a new token |
| Redis connection failures | Missing Redis resources in k8s manifests | Created `redis-deployment.yaml` and `redis-service.yaml` |
| HPA showing `cpu: <unknown>/70%` | Missing metrics-server | Installed metrics-server and patched it with `--kubelet-insecure-tls` for Kind |
| Health checks failing with 429 Too Many Requests | Global rate-limiter acting on health check routes | Reordered middleware in `server/src/index.js` to define health check routes first |

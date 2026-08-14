# CodeShare — Chronological DevOps Implementation Flow

This document details the exact chronological sequence of DevOps tasks completed to build, deploy, secure, and monitor the CodeShare application. It acts as a study guide and walkthrough of the implementation story.

---

## Phase 1: Local Containerization & Health Checks
We began by ensuring the application could run in isolated container environments.

1. **Dockerized Server & Client:**
   * Configured the Node.js server (`server/Dockerfile`) using a Node 20 Alpine base image. Included native library installations (LibreOffice) for pptx-to-pdf conversion.
   * Converted the React client (`client/Dockerfile`) to a production-ready **multi-stage build** (Stage 1 compiles static assets using Vite, Stage 2 serves them via Nginx with custom gzip and React-router fallback rules).
2. **Orchestrated with Docker Compose:**
   * Created `docker-compose.yml` to stitch the server, client, and a password-protected Redis service together. 
   * Added healthy container dependency logic (`depends_on: condition: service_healthy`) and custom network isolation.

---

## Phase 2: Automated CI/CD & Security Scanning
Next, we automated the integration pipeline to ensure every commit is built, scanned for vulnerabilities, and published to a central registry.

3. **Configured GitHub Actions Workflow (`.github/workflows/ci.yml`):**
   * Configured building server and client Docker images automatically on every push to the `main` branch.
   * Configured publishing the output images securely to GitHub Container Registry (GHCR).
4. **Integrated Trivy Security Scanning:**
   * Baked `aquasecurity/trivy-action` into the GitHub Actions CI pipeline to automatically scan both client and server images for CRITICAL/HIGH vulnerabilities post-build.

---

## Phase 3: Local Kubernetes Cluster & GitOps Setup
We set up a local Kubernetes environment and established pull-based deployments.

5. **Kind Cluster Creation:**
   * Downloaded `kind`, `kubectl`, and `helm` binaries to `.bin/` for isolated command-line execution.
   * Created `kind-config.yaml` to specify port mapping from host `8080` to Kubernetes node port `30080` (Kind requires declaring port mappings on container creation).
   * Started the cluster: `.\.bin\kind create cluster --config kind-config.yaml --name codeshare`
6. **Kubernetes Manifest Generation (`k8s/` folder):**
   * Drafted `server-deployment.yaml` (including CPU/Memory bounds, GHCR credentials secret, health probes, and `REDIS_URL` pointing to the cluster's Redis service).
   * Drafted `client-deployment.yaml` (specifying NodePort `30080` to match the Kind cluster config).
   * Drafted `redis-deployment.yaml` and `redis-service.yaml` to deploy Redis in-cluster.
   * Drafted `server-hpa.yaml` and `client-hpa.yaml` targeting 70% CPU limits.
7. **Wired up ArgoCD (GitOps):**
   * Installed ArgoCD into the cluster using Helm charts.
   * Created `argocd-app.yaml` directing ArgoCD to poll the `k8s/` folder on GitHub and automatically sync changes to the cluster.

---

## Phase 4: Troubleshooting Deployments
During deployment, we solved two major bottlenecks:

8. **Fixed the Git status permission error:**
   * Solved Git's security check for "dubious ownership" inside the terminal by running:
     `git config --global --add safe.directory "C:/Users/VICTUS/OneDrive/Desktop/Internship/Personal/Code Share"`
9. **Resolved Kubelet HTTP 429 Probe Failures:**
   * **Symptom:** Kubelet health probes kept failing with `HTTP 429 (Too Many Requests)` causing the server pods to crash loop.
   * **Cause:** The server rate-limiter middleware was active globally and treated Kubelet's frequent health checks as automated abuse.
   * **Fix:** Reordered routes in `server/src/index.js` to register `/api/health` and `/metrics` *before* loading `generalLimiter`.

---

## Phase 5: Observability, Metrics & Dashboards
Finally, we set up full observability to monitor application stats.

10. **Installed the Prometheus Community Stack:**
    * Used Helm to deploy `kube-prometheus-stack` into the `monitoring` namespace.
    * Patched the cluster's `metrics-server` with `--kubelet-insecure-tls` so the Horizontal Pod Autoscaler could read CPU data.
11. **Configured Service Scrapes:**
    * Added `name: http` to `k8s/server-service.yaml`.
    * Created `k8s/servicemonitor.yaml` matching the Prometheus release label (`release: monitoring`) to scrape custom server metrics (`prom-client`).
12. **Imported Grafana Dashboard:**
    * Port-forwarded the Grafana dashboard locally to `8082` (or `8085` if in use).
    * Imported the custom `k8s/grafana-dashboard.json` layout, displaying active Socket.io connections, Redis summaries cache hits/misses, and response latencies.

---

## Phase 6: System Verification Tests
To prove the resilience of the cluster, we conducted two major validation exercises:

13. **Self-Healing (Health Restoration) Test:**
    * Terminated PID 1 (Node process) inside a server pod using `kubectl exec <pod> -- kill 1`.
    * Observed the pod fail and transition to `Error`, then watched Kubernetes automatically spin up a fresh, healthy container in 15 seconds while the second replica kept the application fully online (high availability).
14. **Autoscaling (HPA) Test:**
    * Spun up a load generator pod in the cluster:
      `kubectl run load-generator --image=busybox:1.28 -- /bin/sh -c "while true; do wget -q -O- http://codeshare-server-service:3001/api/health; done"`
    * Observed the HPA register a CPU load increase (`62%`).
    * Watched the cluster scale up from **2 replicas to 3** dynamically to balance the load.
    * Deleted the generator, watched the CPU return to normal (`5%`), and observed the cluster downscale back to `2` replicas.

---

## Phase 7: Microservices Migration (Python & FastAPI)
To prevent heavy CPU tasks from blocking Node.js's single-threaded event loop and causing WebSocket lag, we decoupled data processing into a new microservice.

15. **Extracted Heavy Operations to Python:**
    * Created `fastapi-server/` with a Python 3.11 environment.
    * Moved LibreOffice PPTX conversion, PyMuPDF text extraction, Pandas Excel parsing, and AWS S3 Boto3 cleanup scripts out of Node.js.
    * Rewrote the Node.js API endpoints (`/api/summarize`, `/api/preview/pptx`, `/api/rooms/cron/cleanup`) to act as lightweight API Gateways using `axios`.
16. **Kubernetes Integration for FastAPI:**
    * Updated `.github/workflows/ci.yml` to build and push `ghcr.io/gaurravvvv/codeshare-fastapi-server:latest`.
    * Created Kubernetes manifests (`fastapi-deployment.yaml`, `fastapi-service.yaml`, `fastapi-hpa.yaml`) to deploy the microservice.
    * Injected `FASTAPI_URL` into the Node.js deployment, allowing Node to internally route heavy tasks to the Python worker pods.

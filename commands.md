# CodeShare — DevOps Commands Reference (A-Z)

This document contains a comprehensive reference of all commands used during the containerization, CI/CD pipeline setup, Kubernetes local cluster deployment, GitOps wiring, and observability configuration of the CodeShare application.

---

## 1. Git & Workspace Setup
Commands to set up Git configurations and handle version control changes:

* **Add Workspace to Git Safe List (Resolves dubious ownership error):**
  ```powershell
  git config --global --add safe.directory "C:/Users/VICTUS/OneDrive/Desktop/Internship/Personal/Code Share"
  ```
* **Stage, Commit, and Push Changes:**
  ```powershell
  git add .
  git commit -m "commit message"
  git push origin main
  ```

---

## 2. Docker & Local Development
Commands to manage containerization, local orchestration via Compose, and registry interaction:

* **Start application locally (Server + Client + Redis):**
  ```powershell
  docker compose up --build -d
  ```
* **Stop local services:**
  ```powershell
  docker compose down
  ```
* **Inspect container logs:**
  ```powershell
  docker compose logs -f
  ```
* **Build Docker images manually:**
  ```powershell
  docker build -t ghcr.io/gaurravvvv/codeshare-server:latest ./server
  docker build -t ghcr.io/gaurravvvv/codeshare-client:latest ./client
  ```
* **Log in to GitHub Container Registry (GHCR):**
  ```powershell
  # Note: Use your classic Personal Access Token (PAT) as the password
  docker login ghcr.io -u <github-username>
  ```
* **Push images manually to GHCR:**
  ```powershell
  docker push ghcr.io/gaurravvvv/codeshare-server:latest
  docker push ghcr.io/gaurravvvv/codeshare-client:latest
  ```

---

## 3. Kind (Kubernetes in Docker) Cluster Management
Commands to manage the local Kubernetes cluster node container:

* **Create Kind Cluster with Config (Exposes port 8080/30080):**
  ```powershell
  .\.bin\kind create cluster --config kind-config.yaml --name codeshare
  ```
* **List active Kind clusters:**
  ```powershell
  .\.bin\kind get clusters
  ```
* **Load local Docker image into Kind (Bypasses pushing to GHCR for testing):**
  ```powershell
  .\.bin\kind load docker-image ghcr.io/gaurravvvv/codeshare-server:latest --name codeshare
  ```
* **Delete Kind cluster:**
  ```powershell
  .\.bin\kind delete cluster --name codeshare
  ```

---

## 4. Kubernetes (kubectl)
Commands to deploy resources, monitor health, and debug issues:

* **Apply all Kubernetes manifests:**
  ```powershell
  .\.bin\kubectl apply -f k8s/
  ```
* **Create GHCR Image Pull Secret (Required for pulling private GHCR packages):**
  ```powershell
  .\.bin\kubectl create secret docker-registry ghcr-secret --docker-server=https://ghcr.io --docker-username=<github-username> --docker-password=<github-token-or-pat> --docker-email=<email>
  ```
* **Verify all resources in default namespace:**
  ```powershell
  .\.bin\kubectl get all
  ```
* **Monitor Pods / Services / HPAs specifically:**
  ```powershell
  .\.bin\kubectl get pods
  .\.bin\kubectl get service
  .\.bin\kubectl get hpa
  ```
* **View pod logs:**
  ```powershell
  .\.bin\kubectl logs -l app=codeshare-server --tail=50
  ```
* **Inspect pod description / Events (Troubleshooting CrashLoopBackOff):**
  ```powershell
  .\.bin\kubectl describe pod <pod-name>
  ```
* **Expose Server API locally (Port Forwarding):**
  ```powershell
  .\.bin\kubectl port-forward service/codeshare-server-service 3001:3001
  ```
* **Restart Server Deployment (Pulls latest image):**
  ```powershell
  .\.bin\kubectl rollout restart deployment codeshare-server
  ```
* **Patch Metrics-Server for Kind (Permits self-signed certificates):**
  ```powershell
  .\.bin\kubectl patch deployment metrics-server -n kube-system --type="json" -p "[{\`"op\`":\`"add\`",\`"path\`":\`"/spec/template/spec/containers/0/args/-\`",\`"value\`":\`"--kubelet-insecure-tls\`"}]"
  ```

---

## 5. Helm Chart Package Management
Commands to manage third-party software packages inside K8s:

* **Add repositories and update:**
  ```powershell
  .\.bin\helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
  .\.bin\helm repo update
  ```
* **Install Prometheus + Grafana Stack:**
  ```powershell
  .\.bin\kubectl create namespace monitoring
  .\.bin\helm install monitoring prometheus-community/kube-prometheus-stack --namespace monitoring
  ```

---

## 6. ArgoCD (GitOps)
Commands to manage GitOps sync policies and authentication:

* **Expose ArgoCD Dashboard:**
  ```powershell
  .\.bin\kubectl port-forward service/argocd-server -n argocd 8081:443
  ```
* **Get default admin password (PowerShell command):**
  ```powershell
  [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String((.\.bin\kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}")))
  ```
* **Force immediate sync of Application:**
  ```powershell
  .\.bin\kubectl patch application codeshare -n argocd --type merge -p "{\`"metadata\`":{\`"annotations\`":{\`"argocd.argoproj.io/refresh\`":\`"normal\`"}}}"
  ```

---

## 7. Troubleshooting & Verification Tests

* **Kill a process using a port in Windows (e.g. 8082, 8080):**
  ```powershell
  Get-Process -Id (Get-NetTCPConnection -LocalPort 8082).OwningProcess -ErrorAction SilentlyContinue | Stop-Process
  ```
* **Simulate pod crash (Self-healing test):**
  ```powershell
  # Kill container PID 1 process
  .\.bin\kubectl exec -it <pod-name> -- kill 1
  ```
* **Simulate traffic spike (Autoscaling/HPA test):**
  ```powershell
  # Creates a pod that hits the endpoint continuously
  .\.bin\kubectl run load-generator --image=busybox:1.28 --restart=Never -- /bin/sh -c "while true; do wget -q -O- http://codeshare-server-service:3001/api/health; done"
  ```
* **Stop load generator:**
  ```powershell
  .\.bin\kubectl delete pod load-generator
  ```

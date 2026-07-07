@echo off
echo ==========================================
echo Checking Kind Kubernetes Cluster...
echo ==========================================

.\.bin\kind get clusters | findstr /R "^codeshare$" >nul 2>&1
if %errorlevel% equ 0 (
    echo Kind cluster 'codeshare' is already created.
) else (
    echo Creating Kind cluster 'codeshare'...
    .\.bin\kind create cluster --config kind-config.yaml --name codeshare
)

echo.
echo ==========================================
echo Checking namespaces...
echo ==========================================

.\.bin\kubectl get namespace monitoring >nul 2>&1
if %errorlevel% equ 0 (
    echo Namespace 'monitoring' already exists.
) else (
    echo Creating namespace 'monitoring'...
    .\.bin\kubectl create namespace monitoring
)

.\.bin\kubectl get namespace argocd >nul 2>&1
if %errorlevel% equ 0 (
    echo Namespace 'argocd' already exists.
) else (
    echo Creating namespace 'argocd'...
    .\.bin\kubectl create namespace argocd
)

echo.
echo ==========================================
echo Checking Prometheus Stack...
echo ==========================================

.\.bin\helm status monitoring --namespace monitoring >nul 2>&1
if %errorlevel% equ 0 (
    echo Prometheus Stack (monitoring) is already installed.
) else (
    echo Adding prometheus-community repo...
    .\.bin\helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
    .\.bin\helm repo update
    echo Installing Prometheus Stack...
    .\.bin\helm install monitoring prometheus-community/kube-prometheus-stack --namespace monitoring
)

echo.
echo ==========================================
echo Checking GitOps App (ArgoCD)...
echo ==========================================

.\.bin\kubectl get application codeshare -n argocd >nul 2>&1
if %errorlevel% equ 0 (
    echo ArgoCD Application 'codeshare' is already deployed.
) else (
    echo Deploying ArgoCD Application 'codeshare'...
    .\.bin\kubectl apply -f argocd-app.yaml
)

echo.
echo ==========================================
echo Setup check completed successfully!
echo ==========================================
pause

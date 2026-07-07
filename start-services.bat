@echo off
echo ==========================================
echo Starting Port-Forwards for CodeShare Services...
echo ==========================================

echo.
echo [1/3] Exposing React Frontend (via Kind hostPort mapping)...
echo Frontend is automatically accessible at http://localhost:8080.

echo [2/3] Exposing Express Server API (localhost:3001) in background...
start /min "CodeShare Server Port-Forward" .\.bin\kubectl port-forward service/codeshare-server-service 3001:3001

echo [3/3] Exposing Grafana Dashboard (localhost:8082) in background...
start /min "Grafana Port-Forward" .\.bin\kubectl port-forward -n monitoring service/monitoring-grafana 8082:80

echo [4/4] Exposing ArgoCD UI (localhost:8081) in background...
start /min "ArgoCD Port-Forward" .\.bin\kubectl port-forward service/argocd-server -n argocd 8081:443

echo.
echo ==========================================
echo All services should be accessible now:
echo ------------------------------------------
echo React Frontend App  : http://localhost:8080
echo Grafana Monitoring  : http://localhost:8082 (admin/prom-operator)
echo ArgoCD Dashboard    : https://localhost:8081 (admin)
echo ==========================================
echo Note: Keep this terminal open, or run stop-services.bat to terminate port-forwards.
pause

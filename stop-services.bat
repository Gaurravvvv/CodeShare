@echo off
echo ==========================================
echo Stopping all Port-Forwards...
echo ==========================================

echo Terminating kubectl port-forward processes...
taskkill /f /im kubectl.exe >nul 2>&1

echo.
echo ==========================================
echo All port-forwarding processes stopped.
echo ==========================================
pause

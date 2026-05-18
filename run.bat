@echo off
title CodeShare - Local Dev
color 0A

echo.
echo  ========================================
echo    CodeShare - Starting Local Dev Server
echo  ========================================
echo.

:: Check for LibreOffice (needed for PPTX preview)
where soffice >nul 2>nul
if %errorlevel% neq 0 (
    echo  [!] LibreOffice not found on PATH.
    echo      PPTX file preview will not work.
    echo      Install from: https://www.libreoffice.org
    echo      All other previews - PDF, DOCX, XLSX, images, etc. - work fine.
    echo.
) else (
    echo  [OK] LibreOffice detected - PPTX preview enabled
)

:: Start Redis container
echo  [1/3] Starting Redis (Docker)...
docker start codeshare-redis 2>nul || docker run -d --name codeshare-redis -p 6379:6379 redis:7-alpine
echo         Redis running on port 6379

:: Start Backend
echo  [2/3] Starting Backend (server)...
cd /d "%~dp0server"
start "CodeShare Backend" cmd /k "npm run dev"

:: Start Frontend
echo  [3/3] Starting Frontend (client)...
cd /d "%~dp0client"
start "CodeShare Frontend" cmd /k "npm run dev"

echo.
echo  ----------------------------------------
echo    Backend  :  http://localhost:3001
echo    Frontend :  http://localhost:5173
echo  ----------------------------------------
echo.
echo  Both servers launched in separate windows.
echo  Close this window anytime.
pause

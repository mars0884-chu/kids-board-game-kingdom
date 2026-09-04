@echo off
setlocal EnableExtensions DisableDelayedExpansion
cd /d "%~dp0"
set "VERIFY_VERSION="
set "VERIFY_PORT="
set "VERIFY_PREVIEW=jump-chess"

if /I "%~1"=="gomoku" set "VERIFY_PREVIEW=gomoku"
if /I "%~1"=="tic-tac-toe" set "VERIFY_PREVIEW=tic-tac-toe"
if /I "%~1"=="reversi-art-proposal" set "VERIFY_PREVIEW=reversi-art-proposal"
if /I "%~1"=="number-gem" set "VERIFY_PREVIEW=number-gem"
if /I "%~1"=="number-gem-tutorial" set "VERIFY_PREVIEW=number-gem-tutorial"
if /I "%~1"=="number-gem-local" set "VERIFY_PREVIEW=number-gem-local"
if /I "%~1"=="dark-chess" set "VERIFY_PREVIEW=dark-chess-verification"
if /I "%~1"=="dark-chess-verification" set "VERIFY_PREVIEW=dark-chess-verification"
if /I "%~1"=="dark-chess-art-proposal" set "VERIFY_PREVIEW=dark-chess-art-proposal"
if /I "%~1"=="dark-chess-child" set "VERIFY_PREVIEW=dark-chess-child"
if /I "%~1"=="dark-chess-adventure" set "VERIFY_PREVIEW=dark-chess-adventure"
if /I "%~1"=="dark-chess-local" set "VERIFY_PREVIEW=dark-chess-local"
if /I "%~1"=="animal-chess" set "VERIFY_PREVIEW=animal-chess"
if /I "%~1"=="animal-chess-tutorial" set "VERIFY_PREVIEW=animal-chess-tutorial"
if /I "%~1"=="animal-chess-local" set "VERIFY_PREVIEW=animal-chess-local"
if /I "%~1"=="jump-chess" set "VERIFY_PREVIEW=jump-chess"
if /I "%~1"=="jump-chess-adventure" set "VERIFY_PREVIEW=jump-chess-adventure"
if /I "%~1"=="jump-chess-local" set "VERIFY_PREVIEW=jump-chess-local"

if not exist "dist\index.html" (
  echo Missing dist\index.html. Extract the whole ZIP before starting verification.
  goto :failed
)

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js 24 or newer is required. Install Node.js, then run this file again.
  goto :failed
)

for /f "delims=" %%N in ('where node') do (
  set "NODE_EXE=%%N"
  goto :node_found
)

:node_found

for /f "usebackq delims=" %%V in (`powershell.exe -NoProfile -Command "$package=Get-Content -LiteralPath 'package.json' -Raw | ConvertFrom-Json; if ([string]::IsNullOrWhiteSpace($package.version)) { exit 1 }; [Console]::Write($package.version)"`) do (
  set "VERIFY_VERSION=%%V"
)

if not defined VERIFY_VERSION (
  echo The verification package version could not be read from package.json.
  goto :failed
)

for /l %%I in (1,1,24) do (
  call :choose_random_port
  call :port_free %%VERIFY_PORT%%
  if not errorlevel 1 (
    goto :port_found
  )
)

echo No free temporary verification port was found.
goto :failed

:port_found
set "VERIFY_URL=http://127.0.0.1:%VERIFY_PORT%/?preview=%VERIFY_PREVIEW%^&verification=1"

start "Kids Board Game Verification" /min "%NODE_EXE%" scripts\serve-verification.mjs %VERIFY_PORT%

for /l %%I in (1,1,12) do (
  timeout /t 1 /nobreak >nul
  call :probe
  if not errorlevel 1 goto :open
)

echo The local verification server could not start on port %VERIFY_PORT%.
echo No existing local server was reused. Close the window named "Kids Board Game Verification" if it is open, then run this file again.
goto :failed

:open
start "" "%VERIFY_URL%"
echo Verification v%VERIFY_VERSION% opened at %VERIFY_URL%.
echo Keep the "Kids Board Game Verification" window open while testing.
echo To stop it later, close that window.
pause
exit /b 0

:probe
powershell.exe -NoProfile -Command "try { $response=Invoke-WebRequest -UseBasicParsing -TimeoutSec 1 -Uri 'http://127.0.0.1:%VERIFY_PORT%/__verification_identity__.json'; $identity=ConvertFrom-Json -InputObject $response.Content; if ($response.StatusCode -eq 200 -and $identity.application -eq 'kids-board-game-kingdom' -and $identity.version -eq '%VERIFY_VERSION%') { exit 0 }; exit 1 } catch { exit 1 }"
exit /b %ERRORLEVEL%

:port_free
powershell.exe -NoProfile -Command "$listeners=@(Get-NetTCPConnection -State Listen -LocalPort %~1 -ErrorAction SilentlyContinue); if ($listeners.Count -eq 0) { exit 0 }; exit 1"
exit /b %ERRORLEVEL%

:choose_random_port
set /a "VERIFY_PORT=49152 + (%RANDOM% * 16384 / 32768)"
exit /b 0

:failed
pause
exit /b 1

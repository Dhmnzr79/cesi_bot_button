@echo off
cd /d "%~dp0.."
echo Root: %CD%
echo Open: http://localhost:8181/local-test/test.html
echo Stop: Ctrl+C
python -m http.server 8181
if errorlevel 1 (
  echo ERROR: Python not in PATH. Install Python 3 or run from repo root:
  echo   py -m http.server 8181
  pause
  exit /b 1
)

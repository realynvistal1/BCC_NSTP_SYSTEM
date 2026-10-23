@echo off
cd /d "%~dp0"
title FacultyEval - MySQL and Node Server
if not exist backend\.env (
 echo Please run 01_SETUP_WINDOWS.bat first.
 pause
 exit /b 1
)
call npm run doctor
if errorlevel 1 (
 echo.
 echo Setup check failed. Read the reason above.
 pause
 exit /b 1
)
echo.
echo Starting Faculty Evaluation System...
echo Open http://localhost:5000 in your browser if using PORT=5000.
echo Keep this window open while using the system.
call npm start
pause

@echo off
cd /d "%~dp0"
title FacultyEval - First-time setup
echo =======================================================
echo     FACULTY EVALUATION SYSTEM - FIRST TIME SETUP
 echo =======================================================
where node >nul 2>nul
if errorlevel 1 (
 echo ERROR: Node.js was not found. Install Node.js 20+ first.
 pause
 exit /b 1
)
call npm install
if errorlevel 1 (
 echo ERROR: npm install failed. Check the internet connection and npm errors above.
 pause
 exit /b 1
)
call npm run setup
if errorlevel 1 (
 echo ERROR: Failed to create the .env file.
 pause
 exit /b 1
)
echo.
echo NEXT STEPS:
echo 1. Start MySQL and Apache in XAMPP.
echo 2. Open http://localhost/phpmyadmin
 echo 3. Import database/schema.sql from this folder.
echo 4. Double-click 02_START_WINDOWS.bat
pause

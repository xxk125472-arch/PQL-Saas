@echo off
cd /d %~dp0..\apps\web
call npm install
call npm run dev

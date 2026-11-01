@echo off
rem Default SQLite database: <repo>\data\app.db (created automatically by the API).
cd /d %~dp0\..\apps\api
if not exist .venv (
  python -m venv .venv
  call .venv\Scripts\activate
  pip install -r requirements.txt
) else (
  call .venv\Scripts\activate
)
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

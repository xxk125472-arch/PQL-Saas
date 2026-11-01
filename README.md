# PQL Health

本地可跑的微型 PQL / 客户健康度运营 SaaS（开源演示向）。

## 目录

- `apps/api` — FastAPI + SQLite
- `apps/web` — React + TypeScript（陆逊）
- `docs/prd` — PRD
- `docs/api` — 接口约定
- `data/sample` — 样例 CSV（荀彧）
- `packages/mcp` — 预留

## 启动 API（Windows）

```bat
cd /d D:\SanguoWorkspace\pql-saas\apps\api
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

健康检查：`http://127.0.0.1:8000/health`

默认 SQLite 数据库为仓库根目录的 `data/app.db`；启动时会自动创建 `data` 目录和数据库，也可通过 `DATABASE_URL` 覆盖。

## Harness

- 前端：Cursor / Opus
- 后端：Qoder-CN / Kimi（本仓库 `apps/api`）

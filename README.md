# PQL Health

本地可跑的微型 PQL / 客户健康度运营 SaaS（开源演示向）。

## 目录

- `apps/api` — FastAPI + SQLite
- `apps/web` — React + TypeScript（陆逊）
- `docs/prd` — PRD
- `docs/api` — 接口约定
- `data/sample` — 样例 CSV（荀彧）
- `packages/mcp` — 预留

## 一键启动（Windows，推荐）

适合只想把产品跑起来看效果的电脑，只需提前装好：

- **Python 3.11+**（安装时勾选「Add python.exe to PATH」）
- **Node.js 20+**（LTS 版即可，自带 npm）

然后在仓库根目录双击 `start.cmd`（或在 CMD 中运行）。脚本会依次：

1. 检查 Python / Node.js 是否存在、版本是否够，缺了会用中文提示去哪下载；
2. 首次运行在 `apps/api` 建 `.venv` 并 `pip install -r requirements.txt`（默认源失败自动改用清华镜像）；
3. 若根目录没有 `.env`，从 `.env.example` 复制一份（飞书凭证可稍后填在 `.env` 或设置页）；
4. 在 `apps/web` 执行 `npm ci`（无 lock 文件则 `npm install`，失败自动改用 npmmirror）并 `npm run build`；
5. 执行数据库迁移（默认 `data/app.db`）；
6. 只启动后端 `http://127.0.0.1:8000`（后端同时托管 `apps/web/dist`），就绪后自动打开浏览器。

再次运行会跳过已完成的安装和构建（依赖文件有变化时会自动重装）。拉取新代码后想强制重新构建前端：

```bat
start.cmd --rebuild
```

想清空所有数据从头演示（**会永久删除数据库**，默认 `data/app.db`）：

```bat
start.cmd --reset-db
```

脚本会显示将要删除的数据库路径，并用中文二次确认（先输入 `y`，再输入大写 `RESET`），任一步取消都不会删除任何东西；删除后自动重建空库再启动。不带 `--reset-db` 的正常启动**绝不**删除数据库。需要换端口（例如测试时避开 8000）可先 `set PQL_PORT=8765` 再运行。

关闭窗口或按 `Ctrl+C` 即停止服务。8000 端口被占用时脚本会提示并停下，不会重复启动。任何一步出错都会停下并说明原因。

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

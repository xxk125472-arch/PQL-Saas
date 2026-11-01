# v1 验收报告（Claude Code / Opus，2026-11-02）

分支 `fix/claude-acceptance`（起点 `4ed94c9`）。本轮只修竣工文档第 3 节的第 3、4、5 项；第 1、2 项归郭嘉，`apps/api` 未改动。

## 环境
- 换机：在系统临时目录 `%TEMP%\pql-accept-20261102` 重新 clone 本分支，全新 venv / node_modules，`PQL_PORT=8765 start.cmd` 启动（未占用 8000，未碰开发库 `data/app.db`，未读 `.env`）。
- Python 3.12.10，Node.js 22.20.0。

## 结果
| 项 | 结果 |
|---|---|
| `start.cmd` 首次运行（建 venv、装依赖、生成 .env、npm ci + build、迁移、启动） | 通过 |
| `pytest`（apps/api，需 requirements-dev） | 27 passed |
| `npm run build`（`tsc -b && vite build`） | 通过 |
| API 冒烟 33 项 | 31 通过；2 项失败 = 第 1、2 项（后端，见下） |
| 注册 → 生成演示数据 → 漏斗 72/60/36/12、PQL 42 | 通过 |
| 客户列表默认 20 条/共 80、PQL 筛选只含 first_value/reuse/retention、详情抽屉 | 通过 |
| CSV 导入（新租户）80 客户 / 273 事件，重复导入跳过 273；坏表头返回中文 + code | 通过 |
| 租户隔离（B 读 A 的客户 → 404） | 通过 |
| 每周重点分析（无密钥 → rules_only，页顶提示规则兜底） | 通过 |
| 设置页未配置飞书：显示「未配置」，无报错弹窗 | 通过（前端兜底 `FEISHU_CREDENTIALS_MISSING`） |
| 飞书密钥框显示 `****K9P2`；仅改其他字段保存时 PUT 不带 `app_secret` | 通过 |
| 无效 token：首屏 / 会话中途 → 清 token、跳 `/login?next=…`、提示「登录已过期」 | 通过 |
| 登录页输错密码：停留在登录页，提示「账号或密码错误」 | 通过 |
| 登出后旧 token 调 `/me` | **失败：仍 200**（第 1 项，后端） |
| 密钥不出现在接口返回、服务日志、`dist`、数据库明文中 | 通过 |
| `start.cmd --reset-db`：输入 n / 空 / y+非 RESET → 取消且库不变；y+RESET → 删库重建，旧账号 401 | 通过 |
| 默认启动（含 `--rebuild`）不删库 | 通过 |

## 留给后端（只记录，未改）
1. **P1** 登出后旧 token 仍有效（第 1 项）。
2. **P2** `GET /integrations/feishu/config` 无凭证返回 400 `FEISHU_CREDENTIALS_MISSING`，未改成 200 + 空配置（第 2 项）。前端已兼容这两种返回。
3. 重复注册返回 `{"detail":"请求失败","code":"HTTP_ERROR"}`：`auth.py` 的英文 detail 被全局处理器换成了泛化文案，用户看不到「该用户名已注册」。建议 `{detail:"该用户名已注册", code:"USERNAME_TAKEN"}`。
4. 登录密码错误返回 401 `UNAUTHORIZED`「未登录或登录已过期」，语义不对。前端已按「未带 token 的 401」显示「账号或密码错误」；建议后端改成独立 code（如 `INVALID_CREDENTIALS`）。
5. 设置权重校验返回 `code: "invalid_health_weights"`，是小写，和其他大写 code 不一致。
6. 每周重点分析报告正文（后端生成）直出原始枚举：`stage=retention`，以及「new 8，installed 12，first_value 15…at_risk 10，churned 8」；风险名单健康分显示 `13.75`，不是 0–100 的整数；「风险 18 个」实际是 at_risk + churned，和总览「风险客户 10」口径不一致。

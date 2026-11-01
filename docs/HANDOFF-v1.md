# PQL Health v1 竣工文档（交 Claude Code 一轮全面验收）

基线提交：`9291618`（main，本地）。工作目录：`D:\SanguoWorkspace\pql-saas`。

## 1. 第一版目标
本地可打包演示：根目录 `start.cmd` 一键建 venv、装依赖、构建前端、迁移数据库，后端只开 8000 端口并托管 `apps/web/dist`；换一台电脑、注册新账号即可完整演示。

## 2. 已交付并验收通过
- 后端（FastAPI + SQLite + Alembic）：CSV 导入（幂等去重）、评分（联表、先筛后分页）、飞书多维表格同步（`.env` 兜底，二次同步新增 0）、AI 分析（OpenAI 兼容接口 + Skill `weekly_focus_v1`，无密钥走规则兜底）、静态托管、401/403/404/405/422 中文 `{detail, code}`、Secret 末 4 位打码。pytest 27 项通过。
- 前端（React + TS + shadcn/ui + Tailwind + Geist，全中文）：四块切真实接口、设置页飞书表单、每周重点分析页、视觉走查 6 条、枚举中文映射、`start.cmd`。`npm run build` 通过，Lighthouse 第二轮 97。
- 数据口径：漏斗 72/60/36/12（导入当天），租户 A PQL 42；`is_pql` = PQL 分 ≥ 阈值 且 阶段 ∈ {first_value, reuse, retention}，见 `data/sample/METRICS-FIELDS.md`。
- 换机验收（贾诩）：17 项中 14 项通过；CRLF 问题已由 `.gitattributes` 关闭。

## 3. 本轮必须修复（按优先级）
1. **P1 登出后旧 token 仍有效**：`/auth/logout` 后旧 token 请求 `/me` 仍 200。须让 token 失效（如服务端 token 黑名单或 token_version），并补 pytest。
2. **P2 未配飞书凭证时配置接口报错**：`GET /integrations/feishu/config` 无凭证时应返回 200 + 空配置；前端显示「未配置」，不弹错。
3. **前端按 `code` 处理错误**：`UNAUTHORIZED` 清 token 跳登录页，其余显示 `detail` 中文。
4. **前端飞书密钥框**显示 `****` + 末 4 位，未修改时不回传。
5. **`start.cmd --reset-db`**：中文二次确认后才删除 `data/app.db` 并重建；默认启动绝不删库。

## 4. 验收范围（一轮跑完）
- 在干净临时目录 clone 本仓库，非 8000 端口，全新 venv/node_modules，跑 `start.cmd`，注册新账号，走完：生成演示数据 → 总览漏斗 → 客户列表/PQL 筛选/详情 → CSV 导入 → AI 分析（规则兜底）→ 设置页 → 登出后 token 失效。
- `pytest` 全绿，`npm run build` 通过。
- 密钥不出现在接口返回、日志、前端构建产物中。

## 5. 约束（必须遵守）
- 不读、不改 `.env`；不执行任何删除类命令（除 `--reset-db` 的实现本身，且不要在开发库上运行）；不动 `data/app.db` 开发库和 8000 端口；不推送远端。
- 所有 UI 文案中文；动画 150–300ms；不加毛玻璃等重渲染效果。
- 发现问题自行修复，只跑一轮，最后输出：修了什么（文件清单）、测试结果、仍未解决的问题。
- 提交：在 `fix/claude-acceptance` 分支上提交，不要合并 main，由诸葛亮合入。

## 6. 已知、不修
- 先「生成演示数据」再导入样例 CSV，事件会翻倍成 546 条（合成数据做了时间平移），演示时不要混用两种方式。
- 测试账号 `round3probe` 保留。

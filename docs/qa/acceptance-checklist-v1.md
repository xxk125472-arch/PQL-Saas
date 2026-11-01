# PQL Health — 验收清单 v1

> **依据**：`docs/prd/PRD-v1.md`  
> **负责人**：贾诩（QA）  
> **工作区**：`D:\SanguoWorkspace\pql-saas`  
> **用法**：每条打 `[x]` 表示通过；失败写复现步骤、期望、实际、截图/接口响应；V1 Out 项不提缺陷。

---

## 0. 通用约定

| 项 | 约定 |
|----|------|
| 环境 | 仅本地 `D:\SanguoWorkspace\pql-saas`；API `http://127.0.0.1:8000`，Web `http://127.0.0.1:5173` |
| 鉴权 | Bearer Token（若 Day1 改为 Cookie，以书面约定为准，禁止混用） |
| 租户 | 一人一租户；所有业务数据必须带当前 `tenant_id` |
| 口径 | 生命周期 / 健康分 / PQL / 建议动作以 PRD 第 4 节为准 |
| 缺陷分级 | P0 阻断 Demo；P1 功能错误；P2 体验/文案；Out of scope 不提单 |

**Demo 脚本（固定回归路径）**  
注册 → 合成数据 → Overview 漏斗 + Customers → Settings 改权重 →（可选）CSV → 配置 Key / 清空 Key 各跑一次一键分析。

---

## 1. Day1 骨架（里程碑 11.1）

- [ ] `GET /health`（或等价）返回 ok
- [ ] 前端能打开，路由占位存在：`/login` `/register` `/overview` `/customers` `/data` `/analysis` `/settings`
- [ ] SQLite 迁移可跑通；`data/*.db` 在 `.gitignore`
- [ ] README 有本地启动草稿（Windows 可跟）

---

## 2. 账号与租户（PRD 6.1）

- [ ] 注册：邮箱 **或** 用户名 + 密码；成功后创建 `tenants` + `users`，会话可用
- [ ] 密码仅存哈希，不明文
- [ ] 新用户登录后业务页为空数据态（本租户）
- [ ] 错误密码无法登录，有明确错误提示
- [ ] 登出后业务 API 返回 401；未登录访问业务路由跳转 `/login`
- [ ] **租户隔离**：第二用户注册后，无法通过改 `customer_id` / `tenant_id` 读到第一用户数据（抽样测列表、详情、overview、analysis）

---

## 3. 「生成演示数据」（一键合成）数据（PRD 6.4）

- [ ] Data center「生成演示数据」后 Overview / Customers 立即有数
- [ ] 客户 `source = synthetic`；写入 events 并重算 scores
- [ ] 再次点击：仅替换/删除 synthetic，**不误删** CSV / 飞书客户
- [ ] 合成分布覆盖：`installed` → `first_value` → `reuse` → `retention`，并含 `at_risk` / `churned` / `new`（与荀彧样例断言对齐）
- [ ] `imports` 有一条 `type=synthetic` 成功记录

---

## 3.5 样例数据断言（荀彧 seed）

对照：data/sample/seed_manifest.json + METRICS-FIELDS.md §3.2

- [ ] CSV / 合成导入后客户数 80、事件数 273（或合成脚本声明的等价规模）
- [ ] 漏斗：安装 72 → 首价 60 → 复用 36 → 留存柱 12
- [ ] 阶段分布接近：new8 / installed12 / first_value15 / reuse15 / retention12 / at_risk10 / churned8
- [ ] **留存判定**按 §3.2：曾 reuse 且近 14 天 ≥2 个活跃日 → 
etention；否则曾 reuse 且未超风险静默 → 
euse（不以「窗内任意活跃」直接抬升）

---

## 4. Overview 漏斗（PRD 6.2）

- [ ] 四档展示：安装 / 首次价值 / 复用 / 留存（人数 + 相对上一档转化率；前档 0 显示 —）
- [ ] 顶部指标条仅四类：客户总数、PQL 数、`at_risk` 数、`churned` 数（不发明额外 KPI）
- [ ] **留存档口径**：当前 `stage == retention` 的客户数（与 API 注释一致）
- [ ] 安装/首次价值/复用：曾达到过对应事件的去重客户数
- [ ] 第二用户漏斗互不影响
- [ ] 合成数据后四档人数符合种子脚本预期（与荀彧字段表对照）

---

## 5. 客户列表与详情（PRD 6.3）

- [ ] 列：名称、阶段、健康分、PQL 分、PQL 标签、建议动作、最近活跃时间
- [ ] 默认分页 20；默认按最近活跃倒序
- [ ] 筛选：阶段、是否 PQL、健康等级；搜索名称 / `external_id`
- [ ] 筛选「PQL」只出：`pql_score ≥ 阈值` 且阶段 ∈ {`first_value`,`reuse`,`retention`}
- [ ] 行点击 Drawer：基本信息、阶段时间线、最近事件（时间倒序）、因子拆解、建议动作 + reason
- [ ] 无 score 时行为符合约定（惰性重算或 0 + `maintain`，带 `score_stale`）
- [ ] 建议动作代码只来自 PRD 4.4，优先级命中正确（抽检 churned / at_risk / new / installed / first_value / 高 PQL）

---

## 6. CSV 上传（PRD 6.5）

- [ ] 两个入口：`customers.csv`（`external_id,name`）、`events.csv`（`external_customer_id,event_type,occurred_at,feature_key?`）
- [ ] UTF-8；时间 ISO 8601 或 `YYYY-MM-DD HH:mm:ss`；单文件 ≤ 2MB
- [ ] 错误行返回**行号 + 原因**，不整单静默失败
- [ ] 成功后列表可见，阶段/分数已重算；`source=csv`；`imports` 有记录

---

## 7. 飞书只读同步（PRD 8）

- [ ] 无凭证时「立即同步」给出清晰错误
- [ ] 映射缺必填（客户 ID / 名称 / 事件类型 / 事件时间）不能发起同步
- [ ] 同步成功：`source=feishu`；同 `external_id` 更新名称；事件按 external_id+event_type+occurred_at 去重
- [ ] **只读**：日志/抓包仅见拉取类调用，无写回飞书
- [ ] `imports`：`type=feishu`，含状态/行数/错误摘要

---

## 8. Settings 与重算（PRD 6.7 / 4.2–4.3）

- [ ] 健康分权重和 ≠ 1.0（如 0.9）保存失败并提示（浮点误差 ≤ 1e-6 可过）
- [ ] PQL 权重同校验
- [ ] 保存后本租户 scores 重算；调 `stage_progress` 权重后健康分变化符合公式
- [ ] 可改：PQL 阈值、风险/流失静默天数、留存窗
- [ ] LLM：Base URL / API Key / Model / 超时；Key 回显掩码，不进前端明文日志
- [ ] 飞书 App Secret 掩码存储，不完整回显
- [ ] （建议）`POST /settings/llm/test` 可测连通

**公式抽检（与荀彧对齐）**

- [ ] 健康分 0–100 整数；因子：recency / frequency / depth / stage_progress
- [ ] PQL 0–100；因子：activation / engagement / health / recency_boost
- [ ] 默认权重与附录 A 一致

---

## 9. 一键分析（PRD 7）

- [ ] Skill 下拉 V1 仅可有效选择 `weekly_focus_v1`；未实现项禁用或不可调用
- [ ] 参数包：`focus_window_days` / `risk_limit` / `pql_limit` / `tone` / `language`（默认见 PRD）
- [ ] **有有效 Key**：`mode=llm`，报告含固定六章；写入 `analysis_runs`
- [ ] **清空 Key**（或失败/超时）：`mode=rules_only`，同六章结构，页顶 Banner「当前为规则回退，未调用 LLM」
- [ ] 报告客户均属本租户；建议动作代码不超出 4.4
- [ ] 非聊天式多轮：无对话气泡循环、无多轮工具调用 UI
- [ ] 历史列表默认最近 20 条；可打开单次 run 详情（元数据：mode / 耗时 / skill 版本）

---

## 10. 本地启动与开源（PRD 10）

- [ ] 按 README / `scripts/dev.ps1`（或 compose）一键起前后端，浏览器可注册使用
- [ ] 目录含：`apps/web`、`apps/api`、`packages/mcp`（占位）、`docs/prd`、`data/sample`
- [ ] `.gitignore` 含 `node_modules`、`.venv`、`*.db`、`.env`、密钥
- [ ] `.env.example` 存在；无 Key 仍可跑规则回退演示
- [ ] 许可证文件存在（MIT 或 README 声明）

---

## 11. 安全与非功能抽检

- [ ] CORS 仅本地开发源
- [ ] 业务 API 强制鉴权 + tenant 过滤（改 ID 越权必测）
- [ ] 演示量：≤2000 客户 / ≤5 万事件时，列表与重算数秒内可完成（观感即可）

---

## 12. V1 明确不做（不提缺陷）

移动端产品形态；真邮件验证/找回密码；计费；复杂 RBAC；网易官方产品 API；多成员协作；多轮对话 Agent；租户自定义 Skill；MCP 功能实现（仅允许 `packages/mcp` 占位）；定时飞书同步 UI。

---

## 13. 接口冒烟（对照 PRD 12.2）

| 方法 | 路径 | 冒烟结果 |
|------|------|----------|
| POST | `/api/v1/auth/register` | |
| POST | `/api/v1/auth/login` | |
| POST | `/api/v1/auth/logout` | |
| GET | `/api/v1/me` | |
| GET | `/api/v1/overview/funnel` | |
| GET | `/api/v1/customers` | |
| GET | `/api/v1/customers/{id}` | |
| POST | `/api/v1/data/synthetic` | |
| POST | `/api/v1/data/csv/customers` | |
| POST | `/api/v1/data/csv/events` | |
| GET/PUT | `/api/v1/settings` | |
| POST | `/api/v1/settings/llm/test` | |
| POST | `/api/v1/integrations/feishu/sync` | |
| GET | `/api/v1/analysis/skills` | |
| POST | `/api/v1/analysis/runs` | |
| GET | `/api/v1/analysis/runs` | |
| GET | `/api/v1/analysis/runs/{id}` | |

---

## 14. 签字栏

| 轮次 | 日期 | 结果 | 阻塞项 | QA |
|------|------|------|--------|-----|
| Day1 | | | | 贾诩 |
| Demo Ready | | | | 贾诩 |

*变更以诸葛亮改版 PRD 为准；口径争议先群内提，再改清单。*

---

## 15. 契约对齐（docs/api/API-CONTRACT-v1.md）

- [ ] 注册/登录 body 为 {identifier, password}，含 @ 判邮箱；返回 ccess_token
- [ ] 错误体 {detail}（PRD 写 {detail, code}，code 缺失记 P2 待对齐）
- [ ] 登出为客户端丢 token：需确认旧 token 再调业务 API 是否仍 200（若是，PRD 6.1「登出后 401」不满足，记 P1）
- [ ] 契约标「下一切片」的项（CSV 解析、飞书客户端、LLM 网关、llm/test）未完成前只测路由存在，不判失败

---

## 16. 前端视觉与交互（老板 2026-11-01 指示）

模板依据（老板 2026-11-01 拍板）：awesome-design-md 的 design-md/vercel/DESIGN.md；组件库 shadcn/ui + Tailwind + Geist

- [ ] 未使用 Ant Design 默认样式；按钮/卡片/表格/抽屉/Toast 均为 shadcn 组件并按 Vercel 规范调参
- [ ] 浅色底 #fafafa、暗色页面底 #0a0a0a、暗色卡片 #171717；1px 细线分隔；标题字重 ≤600；单一黑色主按钮
- [ ] 彩色渐变只出现在登录前页面，登录后不出现

- [ ] 视觉与选定模板一致，无明显自由发挥（配色、字体、间距、圆角、组件形态逐项对照）
- [ ] 未登录态（登录/注册页）有转场或强渲染特效；首屏不卡顿，低配机可降级
- [ ] 登录后为企业官网风格：清爽、干净
- [ ] 主题三选一：浅色 / 暗色 / 跟随系统；切换即时生效，刷新后保持；跟随系统时随 OS 切换
- [ ] 两种主题下文字对比度可读，图表/漏斗/Tag 颜色都适配
- [ ] 组件交互有动效（hover、Drawer、Toast、页面切换），不生硬、不塑料感；支持 prefers-reduced-motion 降级

---



- [ ] 原始枚举值不得直出给用户：事件类型、source、skill_id 等须映射为中文；第三方组件的 aria-label 也须中文

### 16.1 老板追加验收（2026-11-01）

- [ ] **全中文**：按钮、菜单、表头、空态、错误提示、Toast、日期格式都用中文；只有代码字段名和品牌名可以保留英文
- [ ] **禁止廉价毛玻璃**：不用大面积 backdrop-filter blur 和半透明玻璃卡片
- [ ] **性能普适**：登录页 WebGL 渐变在集显或低配机上 CPU/GPU 占用不能明显飙高，滚动要流畅（DevTools Performance 抽查帧率接近 60fps）；WebGL 不可用或开启 reduced-motion 时退化成静态渐变
- [ ] WebGL 只在登录前运行，进系统后释放掉，不在后台持续渲染
- [ ] 动效高级、克制、不晃眼：没有闪烁、大幅缩放或长时间循环动画，单次过渡不超过约 300ms（以 UI-IA 第 7 节为准）
- [ ] 抽查 Lighthouse 性能分（本地生产构建）不低于 85

---

## 17. SQL 数据层（老板定：优先做，PRD 第 9 节）

- [ ] 8 张表齐全：tenants / users / customers / events / scores / imports / analysis_runs / settings，字段与 PRD 9.1–9.8 一致
- [ ] 业务表都有 tenant_id 外键；settings.tenant_id 唯一
- [ ] users：email、username 非空时全局唯一，两者至少一个非空；只存 password_hash
- [ ] customers：(tenant_id, external_id) 唯一；source 取值限 synthetic/csv/feishu/manual
- [ ] events：飞书去重键 (tenant_id, customer_id, event_type, occurred_at)，有唯一约束或 upsert
- [ ] 时间统一按 UTC 存
- [ ] 迁移可重复执行：空库能建，已建库再跑不报错；data/*.db 不进 git
- [ ] 常用查询有索引（tenant_id、customer_id、occurred_at）
- [ ] 删除 synthetic 时只删 synthetic 客户及其 events/scores，不级联误删其他来源
- [ ] 密钥字段（feishu_app_secret_enc、llm_api_key_enc）不明文落库或不进日志

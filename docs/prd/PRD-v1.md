# PQL Health — 产品需求文档（PRD）v1

> **工作标题**：PQL Health  
> **开源仓库目录**：`D:\SanguoWorkspace\pql-saas`  
> **文档版本**：v1.0  
> **状态**：已锁定决策，可进入实现  
> **受众**：三国事业群（诸葛亮 PM、司马懿 UI、陆逊前端、郭嘉后端、荀彧数据、贾诩 QA）+ 用户蔡健明（开源 GitHub / 网易智企 AI 平台运营面试叙事）

---

## 1. 背景与目标

### 1.1 背景

B2B SaaS 运营与客户成功日常需要回答三件事：客户走到了哪一阶段、健康吗、下一步做什么。现有工具要么过重（企业 CS 平台），要么缺「可演示的 AI 分析」闭环。本产品做一个**本地可跑、GitHub 可开源**的微型 PQL / 客户健康 SaaS，用于：

- 演示完整微 SaaS 能力（注册登录 → 数据接入 → 漏斗与客户列表 → 一键 LLM 分析）
- 支撑面试叙事：本地可运行、可配置 OpenAI 兼容端点、飞书只读同步、官方 Skill 约束分析
- 作为后续 MCP / 自定义 Skill / 多成员的底座（本版不做）

### 1.2 产品目标（V1）

1. **一人一租户**的本地微 SaaS：注册/登录后即可导入或生成数据并看到漏斗与客户健康。
2. **数据闭环**：一键合成数据、CSV 上传、飞书表格/多维表格只读同步（字段映射）。
3. **口径闭环**：生命周期阶段 + 健康分 + PQL + 建议动作，权重可在设置中调整。
4. **分析闭环**：一键 LLM 分析（硬约束网关 + 官方 Skill `weekly_focus_v1` + 参数包）；无 Key 时规则回退。
5. **工程闭环**：React+TS / FastAPI+SQLite，本地一键启动，仓库布局清晰，可直接推 GitHub。

### 1.3 非目标（见第 3 节 Out）

不做移动端、真实邮件验证、计费、复杂 RBAC、网易产品 API、多成员工作区、内置多轮对话 Agent、租户自定义 Skill。MCP 同仓预留，**在一键分析稳定后再做**。

---

## 2. 用户与场景

### 2.1 角色

| 角色 | 说明 | V1 权限 |
|------|------|---------|
| 租户主用户（演示者/面试官视角） | 注册后即该租户唯一用户 | 全部功能 |
| 开发协作方（三国事业群） | 实现与验收 | 不进产品 RBAC |
| 开源读者 / 面试官 | 克隆仓库本地跑通 | 读代码与 README |

V1：**一个用户 = 一个租户**，无邀请、无成员管理。

### 2.2 核心场景

1. **冷启动演示**：注册 → 一键合成数据 → Overview 漏斗有数 → Customers 有阶段/健康/PQL/建议动作。
2. **自有数据**：CSV 上传或飞书只读同步 → 字段映射 → 客户与事件入库 → 重算分数。
3. **调权观察**：Settings 改健康分 / PQL 权重 → 列表与漏斗按新权重展示（需触发重算或保存后自动重算）。
4. **一键周焦点分析**：Analysis 页选官方 Skill + 参数包 → 生成报告；无 LLM Key 时输出规则版报告并明示回退。
5. **本地开源交付**：克隆 `D:\SanguoWorkspace\pql-saas` 等价仓库 → 一键启动前后端 → 浏览器可用。

---

## 3. 范围（In / Out）

### 3.1 In（V1 必须）

| 类别 | 内容 |
|------|------|
| 技术栈 | 前端 React + TypeScript；后端 FastAPI + SQLite；本地可完整运行的微 SaaS |
| 账号 | 注册 / 登录（邮箱 **或** 用户名 + 密码）；一人一租户 |
| 数据 | 一键合成数据；CSV 上传；飞书表格 / 多维表格（bitable）**只读**同步 + 字段映射 |
| 洞察 | 漏斗看板：安装 → 首次价值 → 复用 → 留存；客户列表（阶段 / 健康分 / PQL / 建议动作）；客户详情抽屉 |
| 设置 | 健康分与 PQL 权重；飞书连接与映射；**一个** OpenAI 兼容 LLM Endpoint（含 Base URL、API Key、Model） |
| 分析 | 一键 LLM 分析：硬约束网关 + 官方 Skill `weekly_focus_v1` + 参数包；无 Key → **仅规则回退** |
| 工程 | 本地一键启动；GitHub-ready；目录见第 10 / 12 节 |
| 页面 | Login/Register；Overview；Customers（含详情抽屉）；Data center；Analysis；Settings |

### 3.2 Out（V1 明确不做）

- 移动端 App / 响应式优先适配以外的移动产品形态
- 真实邮箱验证（发信、验证码、找回密码邮件）
- 计费 / 订阅 / 配额付费
- 复杂 RBAC、角色权限矩阵
- 网易产品官方 API 对接
- 多成员工作区 / 邀请协作
- 内置多轮对话 Agent（Agent 替代方案见第 7 节：一键分析报告）
- 租户自定义 Skill
- MCP Server 能力（**同仓预留 `packages/mcp`，一键分析稳定后再实现**）

---

## 4. 名词与口径（生命周期、健康分、PQL、建议动作）

> 前后端、数据、QA 均以本节为唯一口径。权重默认值可在 Settings 修改；未改则用下表。

### 4.1 生命周期阶段（Lifecycle Stage）

客户主阶段与漏斗四档对齐，另含风险与流失，便于列表筛选与建议动作。

| 阶段代码 | 中文 | 判定口径（事件驱动，取该客户当前最高达成） |
|----------|------|---------------------------------------------|
| `installed` | 已安装 | 存在 `event_type = install`（或映射等价） |
| `first_value` | 首次价值 | 存在 `first_value`（首次达成核心价值行为） |
| `reuse` | 复用 | 在首次价值之后，存在至少 1 次同类型或约定的回访/复用事件 |
| `retention` | 留存 | 在观察窗内（默认 14 天，可配置于参数包/设置）仍有活跃事件 |
| `at_risk` | 风险 | 曾达 `first_value` 及以上，但超过风险静默天数（默认 7 天）无事件 |
| `churned` | 流失 | 曾达 `first_value` 及以上，超过流失静默天数（默认 30 天）无事件 |
| `new` | 新客 | 有客户记录但尚无任何阶段事件（仅导入档案） |

**漏斗看板四档仅展示**：`installed` → `first_value` → `reuse` → `retention`（人数为「当前阶段 ≥ 该档」的累计口径，见 6.2）。  
`at_risk` / `churned` / `new` 只出现在客户列表与分析，不单独占漏斗柱。

### 4.2 健康分（Health Score）

- 范围：**0–100** 整数。
- 公式（V1 默认）：加权求和后裁剪到 0–100。

| 因子代码 | 含义 | 默认权重 | 单因子得分口径（0–100） |
|----------|------|----------|-------------------------|
| `recency` | 近度 | 0.30 | 距最近事件天数：0 天=100；≥14 天=0；中间线性 |
| `frequency` | 频度 | 0.25 | 近 14 天事件数：≥10 次=100；0 次=0；中间线性 |
| `depth` | 功能深度 | 0.20 | 近 14 天不同 `feature_key` 数：≥5=100；0=0；中间线性（无深度字段则该因子记 50 中性分） |
| `stage_progress` | 阶段进度 | 0.25 | `new`=10，`installed`=30，`first_value`=55，`reuse`=75，`retention`=100；`at_risk`=40；`churned`=15 |

权重之和须为 **1.0**（Settings 保存时校验）。  
健康等级展示（仅展示，不另存）：≥80 健康；50–79 一般；＜50 风险倾向（与 `at_risk` 阶段独立，列表可同时显示）。

### 4.3 PQL 分（Product Qualified Lead Score）

- 范围：**0–100** 整数。
- 含义：该客户「像已具备产品合格特征、值得运营跟进」的程度（演示口径，非外部 magicscore）。

| 因子代码 | 含义 | 默认权重 | 单因子得分口径 |
|----------|------|----------|----------------|
| `activation` | 是否达成首次价值 | 0.35 | 已 `first_value` 及以上=100；仅 `installed`=40；`new`=0 |
| `engagement` | 复用与频度 | 0.30 | 取 `reuse`/`retention` 阶段分与 frequency 分的平均 |
| `health` | 当前健康分 | 0.20 | 直接用健康分 |
| `recency_boost` | 近 7 天是否活跃 | 0.15 | 近 7 天有事件=100；否则=0 |

权重之和须为 **1.0**。  
**PQL 标记**：PQL 分 ≥ 70 且阶段 ∈ {`first_value`,`reuse`,`retention`} → 列表显示「PQL」标签（阈值可在 Settings 改，默认 70）。

### 4.4 建议动作（Suggested Action）

规则引擎输出**一条**主建议（可附 reason 文案），优先级从上到下命中即停：

| 优先级 | 条件 | 动作代码 | 展示文案（默认中文） |
|--------|------|----------|----------------------|
| 1 | `churned` | `winback` | 启动挽回：联系确认需求是否变化 |
| 2 | `at_risk` | `reengage` | 七日内触达：推送价值场景或成功案例 |
| 3 | `new` 或仅档案无事件 | `activate_install` | 推动完成安装/首次打开 |
| 4 | 阶段=`installed` 且无 first_value | `drive_first_value` | 引导完成首次价值行为 |
| 5 | 阶段=`first_value` 且未 reuse | `drive_reuse` | 引导第二次关键使用 |
| 6 | PQL 分 ≥ 阈值且健康 ≥ 80 | `expand_or_advocate` | 高价值客户：挖掘扩展或转介绍 |
| 7 | 其他 | `maintain` | 保持观察，按周复查 |

一键分析报告可引用上述动作，但**不得突破第 7 节硬约束**另造未定义动作代码（可在文案层解释）。

### 4.5 事件类型约定（Event Type）

系统内建事件类型枚举（CSV / 飞书映射到这些代码）：

| event_type | 说明 |
|------------|------|
| `install` | 安装 / 开通 / 首次进入产品 |
| `first_value` | 首次价值（Aha） |
| `reuse` | 复用 / 回访使用 |
| `retention_active` | 留存窗口内活跃（也可由时间规则从任意活跃事件推导，导入时可直接给） |
| `feature_use` | 功能使用（可带 `feature_key` 作为深度） |
| `other` | 其他（计入频度/近度，不推进阶段，除非映射时指定） |

阶段推导以 `install` / `first_value` / `reuse` 及静默规则为主；`feature_use` 主要贡献 depth/frequency。

---

## 5. 信息架构与页面需求

### 5.1 站点地图

```
/login                          登录
/register                       注册
/（需登录）
  /overview                     总览漏斗 + 关键指标条
  /customers                    客户列表
  /customers 抽屉               客户详情（同页 Drawer，无独立路由也可）
  /data                         数据中心（合成 / CSV / 飞书映射）
  /analysis                     一键分析
  /settings                     权重 / 飞书 / LLM
```

未登录访问业务路由 → 跳转 `/login`。

### 5.2 各页要点

#### Login / Register

- 字段：登录标识（邮箱 **或** 用户名，二选一字段即可，后端按含 `@` 判邮箱）、密码。
- 注册成功：创建 `tenants` 一行 + `users` 一行（`tenant_id` 绑定），写入会话（HTTP-only Cookie 或 Bearer Token，前后端约定一种，见第 12 节）。
- **不做**邮箱验证、第三方登录、找回密码邮件。

#### Overview

- 漏斗四档：安装 / 首次价值 / 复用 / 留存（人数 + 相对上一档转化率）。
- 顶部指标条（仅这四类，不发明额外业务 KPI）：客户总数、PQL 数、风险客户数（`at_risk`）、流失数（`churned`）。
- 数据范围：当前登录用户的 `tenant_id`。

#### Customers

- 表格列：名称、阶段、健康分、PQL 分、PQL 标签、建议动作、最近活跃时间。
- 筛选：阶段、是否 PQL、健康等级；搜索：名称 / 外部客户 ID。
- 行点击 → 右侧 Drawer：基本信息、阶段时间线（由 events 推导）、最近事件、当前分数拆解（各因子）、建议动作与 reason。

#### Data center

- Tab 或分区：① 一键合成数据 ② CSV 上传 ③ 飞书同步与字段映射。
- 展示最近导入任务状态（来自 `imports`）。

#### Analysis

- 选择官方 Skill（V1 仅 `weekly_focus_v1`，下拉可扩展但禁用未实现项）。
- 参数包表单（见第 7 节）。
- 「生成分析」主按钮；结果区展示报告（Markdown 渲染）+ 本次 run 元数据（是否 LLM、是否回退、耗时、skill 版本）。
- 历史：本租户最近 N 次 `analysis_runs`（默认 20）。

#### Settings

- 健康分权重、PQL 权重、PQL 阈值、风险/流失静默天数。
- 飞书：App 凭证与只读同步开关（密钥仅存本机 SQLite，不明文回显完整 Key）。
- LLM：一个 OpenAI 兼容 Endpoint（Base URL、API Key、Model、超时秒数）；「测试连接」可选但 V1 建议有。

---

## 6. 功能需求（分模块，含验收标准）

### 6.1 账号与租户

**需求**

- 注册：标识 + 密码（密码哈希存储，明文禁止）。
- 登录：校验成功后建立会话。
- 登出：清除会话。
- 注册时自动创建唯一租户，`users.tenant_id` 一对一。

**验收**

- [ ] 新用户注册后仅能看到本租户空数据态。
- [ ] 错误密码无法登录；登出后业务 API 返回 401。
- [ ] 无法通过 API 读取其他 `tenant_id` 数据（用第二个注册用户抽样测）。

### 6.2 Overview 漏斗

**需求**

- 累计口径：`installed_count` = 阶段 ∈ 漏斗序且已达安装及以上的客户数（含更高阶段与 at_risk/churned 中曾安装者，按「历史是否发生过 install」计数）。  
  **实现约定（消除歧义）**：漏斗每一档 = 该租户下「生命周期推导中曾达到过该档事件」的去重客户数：  
  - 安装：有过 `install`  
  - 首次价值：有过 `first_value`  
  - 复用：有过 `reuse`  
  - 留存：当前阶段为 `retention` **或** 观察窗内存在活跃且曾达 reuse（实现时与荀彧对齐：V1 采用「当前 stage == retention 的客户数」作为留存档，避免双口径；并在 API 字段注释写死）。
- 展示转化率：档 n → 档 n+1 = 后档人数 / 前档人数（前档为 0 则显示 —）。

**验收**

- [ ] 合成数据后四档均有非零或符合种子脚本预期的人数。
- [ ] 切换租户（第二用户）漏斗互不影响。

### 6.3 客户列表与详情

**需求**

- 分页（默认 20/页）、排序（默认最近活跃倒序）。
- 分数与建议动作来自 `scores` 最新一行；若缺失则 API 触发惰性重算或返回 0 + `maintain`（需在响应中带 `score_stale`）。

**验收**

- [ ] 筛选「PQL」只出达标客户。
- [ ] Drawer 中事件按时间倒序；因子拆解与 Settings 权重一致。

### 6.4 一键合成数据

**需求**

- Data center 按钮「生成演示数据」：为当前租户写入一批客户、事件，并重算 scores。
- 可重复执行：策略为 **清空本租户业务数据后重建**（users/tenants/settings 保留），或「追加」二选一；V1 定为 **替换本租户 customers/events/scores/imports 中合成标记的数据**。实现用 `customers.source = synthetic` 区分，替换时只删 synthetic。

**验收**

- [ ] 一键后 Overview/Customers 立即有数。
- [ ] 再次点击不会把 CSV/飞书客户误删（仅删 synthetic）。

### 6.5 CSV 上传

**需求**

- 支持两个模板（可同一文件分 sheet？V1 简化为两个上传入口或一个 zip？→ **两个 CSV**）：  
  1. `customers.csv`：`external_id,name`（必填）  
  2. `events.csv`：`external_customer_id,event_type,occurred_at,feature_key(可选)`  
- 编码 UTF-8；时间 ISO 8601 或 `YYYY-MM-DD HH:mm:ss`。
- 上传后写 `imports` 记录，异步或同步入库（V1 同步即可，文件限制 2MB）。

**验收**

- [ ] 错误行返回行号与原因，不整单静默失败。
- [ ] 成功后可在客户列表看到，并完成阶段/分数重算。

### 6.6 飞书同步

见第 8 节；本模块验收并入第 8 节。

### 6.7 设置与重算

**需求**

- 保存权重：校验和为 1.0（允许浮点误差 1e-6）。
- 保存后对当前租户全部客户重算 `scores`（V1 可同步；客户量演示级 ≤ 2k）。

**验收**

- [ ] 故意把权重和改为 0.9 保存失败并提示。
- [ ] 调整 `stage_progress` 权重后，列表健康分变化符合公式。

### 6.8 LLM 设置与一键分析

见第 7 节。

### 6.9 本地启动与开源

见第 10 节。

---

## 7. 一键分析与官方 Skill 设计

### 7.1 定位（Agent 替代方案）

V1 **不是**多轮对话 Agent。交互固定为：

1. 用户在 Analysis 页选择 Skill + 填参数包  
2. 点击「生成分析」  
3. 系统跑硬约束网关 → 组装上下文 → 调用 LLM（或规则回退）→ 写入 `analysis_runs` → 展示单次报告  

禁止做成聊天式多轮工具调用循环。

### 7.2 硬约束网关（Hard Gateway）

在调用 LLM 前/后强制执行：

| 约束 | 说明 |
|------|------|
| 租户隔离 | 只注入当前 `tenant_id` 聚合数据与抽样客户，禁止跨租户 |
| Skill 白名单 | V1 仅允许 `weekly_focus_v1` |
| 输出结构 | 必须匹配 Skill 规定的 Markdown 章节；失败则标记 `parse_error` 并回退规则模板 |
| 无 Key | 不调用外部 HTTP；走规则报告，`analysis_runs.mode = rules_only` |
| 超时 | 默认 60s；超时记失败并可展示规则回退 |
| 禁止动作 | 报告中不得要求执行转账、删库、导出全量隐私到第三方；系统侧也不提供此类工具 |

### 7.3 官方 Skill：`weekly_focus_v1`

**用途**：生成本周客户运营焦点报告。

**输入上下文（由后端组装，前端不直接拼 Prompt 秘文）**

- 漏斗四档人数与转化  
- 阶段分布、PQL 数、at_risk / churned 数  
- Top N 风险客户（默认 10）：名称、阶段、健康分、PQL、建议动作  
- Top N PQL 客户（默认 10）  
- 参数包用户选项  

**参数包（Analysis 表单）**

| 参数 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `focus_window_days` | int | 7 | 报告关注窗口 |
| `risk_limit` | int | 10 | 风险客户条数上限 |
| `pql_limit` | int | 10 | PQL 客户条数上限 |
| `tone` | enum | `pragmatic` | `pragmatic` / `executive`（文风，规则回退可忽略） |
| `language` | enum | `zh-CN` | V1 仅保证中文 |

**输出章节（固定）**

1. 本周结论（≤ 5 条子弹）  
2. 漏斗与阶段解读  
3. 优先处理名单（风险）  
4. 可放大名单（PQL）  
5. 建议动作汇总（只使用第 4.4 节动作代码）  
6. 数据缺口与下一步（如未接飞书、样本过少等）  

**规则回退**：无 Key 或 LLM 失败时，用同一章节结构填充统计与名单表格，结论用模板句（例如「风险客户 N 人，建议优先 reengage」），并在页顶 Banner 提示「当前为规则回退，未调用 LLM」。

### 7.4 `analysis_runs`（或 `agent_runs`）字段要点

见第 9 节。每次点击生成一条 run：`skill_id`、`params_json`、`mode`（`llm`|`rules_only`）、`status`、`report_md`、`error`、`created_at`。

### 7.5 验收

- [ ] 配置有效 Key 时 `mode=llm` 且报告含六章。  
- [ ] 清空 Key 后同参数生成 `mode=rules_only` 且 Banner 可见。  
- [ ] 不能选择或调用未注册 Skill。  
- [ ] 报告中的客户均属于本租户。

---

## 8. 飞书同步需求

### 8.1 原则

- **只读**：不写回飞书。  
- 使用飞书开放平台应用凭证（App ID / App Secret）拉表格或多维表记录。  
- 同步结果落入本系统 `customers` / `events`，`source = feishu`。

### 8.2 映射（必做字段）

用户在 Data center / Settings 配置列映射：

| 系统字段 | 必填 | 说明 |
|----------|------|------|
| 客户 ID | 是 | 映射到 `customers.external_id` |
| 客户名称 | 是 | `customers.name` |
| 事件类型 | 是 | 映射到第 4.5 节枚举（提供下拉：飞书列值 → 系统 event_type） |
| 事件时间 | 是 | `events.occurred_at` |
| 功能深度 | 否 | → `events.feature_key` |

### 8.3 同步行为

- 手动「立即同步」；V1 不做定时调度 UI（可留 TODO）。  
- 写 `imports`：`type=feishu`、状态、行数、错误摘要。  
- 同一 `external_id`：更新名称；事件按「external_id + event_type + occurred_at」去重插入。

### 8.4 验收

- [ ] 无凭证时同步按钮给出清晰错误。  
- [ ] 映射缺必填项不能发起同步。  
- [ ] 同步后客户/事件可见且不写回飞书（手工或日志确认仅 GET/list 类调用）。

---

## 9. 数据模型

> SQLite + SQLAlchemy/等价 ORM。所有业务表含 `tenant_id`（除元数据说明外）。时间统一 UTC 存储，API 可本地化展示。

### 9.1 `tenants`

| 字段 | 类型 | 说明 |
|------|------|------|
| id | PK | UUID/ULID |
| name | str | 默认取注册名或「{user}的租户」 |
| created_at | datetime | |

### 9.2 `users`

| 字段 | 类型 | 说明 |
|------|------|------|
| id | PK | |
| tenant_id | FK | 一对一 |
| email | str nullable | 与 username 至少一者非空 |
| username | str nullable | |
| password_hash | str | |
| created_at | datetime | |

唯一约束：email 全局唯一（非空时）；username 全局唯一（非空时）。

### 9.3 `customers`

| 字段 | 类型 | 说明 |
|------|------|------|
| id | PK | |
| tenant_id | FK | |
| external_id | str | 租户内唯一 |
| name | str | |
| stage | str | 第 4.1 节代码 |
| source | str | `synthetic` / `csv` / `feishu` / `manual` |
| last_active_at | datetime nullable | |
| created_at / updated_at | datetime | |

### 9.4 `events`

| 字段 | 类型 | 说明 |
|------|------|------|
| id | PK | |
| tenant_id | FK | |
| customer_id | FK | |
| event_type | str | 第 4.5 节 |
| feature_key | str nullable | |
| occurred_at | datetime | |
| raw_payload | json nullable | 原始行 |
| created_at | datetime | |

### 9.5 `scores`

| 字段 | 类型 | 说明 |
|------|------|------|
| id | PK | |
| tenant_id | FK | |
| customer_id | FK | |
| health_score | int | 0–100 |
| pql_score | int | 0–100 |
| is_pql | bool | |
| health_breakdown | json | 各因子分 |
| pql_breakdown | json | |
| suggested_action | str | 动作代码 |
| action_reason | str | |
| calculated_at | datetime | |

同一客户保留最新分即可（V1 可更新同行，或每次插入取最新）。

### 9.6 `imports`

| 字段 | 类型 | 说明 |
|------|------|------|
| id | PK | |
| tenant_id | FK | |
| type | str | `synthetic` / `csv_customers` / `csv_events` / `feishu` |
| status | str | `pending` / `success` / `failed` |
| stats_json | json | 行数等 |
| error | str nullable | |
| created_at | datetime | |

### 9.7 `analysis_runs`（可用名 `agent_runs`，推荐 API 路径用 analysis）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | PK | |
| tenant_id | FK | |
| skill_id | str | 如 `weekly_focus_v1` |
| params_json | json | |
| mode | str | `llm` / `rules_only` |
| status | str | `success` / `failed` |
| report_md | text nullable | |
| error | str nullable | |
| latency_ms | int nullable | |
| created_at | datetime | |

### 9.8 `settings`

| 字段 | 类型 | 说明 |
|------|------|------|
| id | PK | |
| tenant_id | FK 唯一 | 一租户一行 |
| health_weights | json | |
| pql_weights | json | |
| pql_threshold | int | 默认 70 |
| silent_risk_days | int | 默认 7 |
| silent_churn_days | int | 默认 30 |
| retention_window_days | int | 默认 14 |
| feishu_app_id | str nullable | |
| feishu_app_secret_enc | str nullable | 本地加密或至少不日志打印 |
| feishu_mapping_json | json nullable | |
| llm_base_url | str nullable | |
| llm_api_key_enc | str nullable | |
| llm_model | str nullable | |
| llm_timeout_sec | int | 默认 60 |
| updated_at | datetime | |

---

## 10. 非功能（本地启动、安全、开源）

### 10.1 本地一键启动

- 仓库根目录提供：`README.md`、（推荐）`docker-compose.yml` **或** `scripts/dev.ps1` / `scripts/dev.sh`（Windows 主环境为 `D:\SanguoWorkspace\pql-saas`，脚本需在 Windows 可跑；同时保证通用说明）。  
- 最低路径：安装 Node / Python 依赖 → 启动 API（默认 `http://127.0.0.1:8000`）→ 启动 Web（默认 `http://127.0.0.1:5173`）→ 浏览器打开即可注册。  
- SQLite 文件落在仓库可 gitignore 路径（如 `data/app.db`）。

### 10.2 安全

- 密码哈希（如 bcrypt/argon2）。  
- 所有业务 API 鉴权 + `tenant_id` 强制过滤。  
- API Key / 飞书 Secret 不进前端包体日志；Settings 回显掩码。  
- CORS 仅本地开发源。  
- V1 不宣称生产级多租户安全审计，但须防「改个 id 越权」。

### 10.3 开源 / GitHub-ready

- MIT 或 README 声明的许可证文件。  
- `.gitignore`：`node_modules`、`.venv`、`*.db`、`.env`、密钥。  
- `.env.example` 列出可选项（空 Key 可跑规则回退）。  
- `docs/prd` 可放本 PRD 副本；**本任务交付文件路径见文末**，实现仓目录：

```
pql-saas/
  apps/web/
  apps/api/
  packages/mcp/          # 占位 README，V1 不实现功能
  docs/prd/
  data/sample/           # 样例 CSV
  README.md
```

### 10.4 性能（演示级）

- 租户客户 ≤ 2000、事件 ≤ 5 万时，列表/重算可在数秒内完成。不承诺更大规模。

---

## 11. 里程碑

### 11.1 Day 1 — 骨架可跑

- 仓库目录落地；`apps/api` 健康检查；`apps/web` 空壳路由与登录页占位。  
- SQLite 建表迁移跑通。  
- README 一键启动草稿。  
- **验收**：浏览器能打开前端，API `/health` 返回 ok。

### 11.2 两周可演示（Demo Ready）

| 顺序 | 交付 | 负责提示 |
|------|------|----------|
| W1 前半 | 注册登录 + 租户隔离 + 合成数据 + 客户/事件写入 | 郭嘉为主，陆逊对接登录态 |
| W1 后半 | Overview 漏斗 + Customers 列表/抽屉 + 分数与建议动作 | 陆逊 + 郭嘉；司马懿出 UI 稿 |
| W2 前半 | CSV 上传 + Settings 权重 + 重算 | 郭嘉 / 陆逊 |
| W2 中 | 飞书只读同步 + 映射 UI | 郭嘉；陆逊映射表单 |
| W2 后半 | 一键分析 + `weekly_focus_v1` + 规则回退 + LLM 配置 | 郭嘉为核心；陆逊 Analysis 页 |
| Demo 日 | 样例数据、README、录屏路径自测；贾诩按验收清单 | 全员 |

**Demo 脚本（固定）**：注册 → 合成数据 → 看漏斗与客户 → 改权重 →（可选）CSV → 配置/不配置 Key 各跑一次分析。

---

## 12. 分工与接口约定（前后端）

### 12.1 角色分工

| 角色 | 职责 |
|------|------|
| 诸葛亮 PM | 范围与口径锁定、Demo 叙事、优先级 |
| 司马懿 UI | 页面布局、组件状态、空态/错态 |
| 陆逊 前端 | `apps/web` React+TS；对接 API；Cursor/Opus 为前端 Harness |
| 郭嘉 后端 | `apps/api` FastAPI+SQLite；分数、同步、分析网关；Qoder-CN/Kimi 为后端 Harness |
| 荀彧 数据 | 口径校验、样例 CSV、合成数据分布是否合理 |
| 贾诩 QA | 按本 PRD 验收框回归；越权与无 Key 回退必测 |
| 蔡健明 | 开源发布与面试叙事；仓库根目录工作区仅 `D:\SanguoWorkspace\pql-saas` |

**Harness 约定**：前端工作用 Cursor/Opus；后端工作用 Qoder-CN/Kimi；**只在** `D:\SanguoWorkspace\pql-saas` 落代码。

### 12.2 API 约定（摘要）

- Base：`/api/v1`  
- 鉴权：`Authorization: Bearer <token>`（若改 Cookie 会话，前后端 Day1 书面确认一种，禁止混用）。  
- 错误：`{ "detail": "...", "code": "..." }`  

**主要端点（实现不得随意改路径语义）**

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/auth/register` | 注册 |
| POST | `/auth/login` | 登录 |
| POST | `/auth/logout` | 登出 |
| GET | `/me` | 当前用户与租户 |
| GET | `/overview/funnel` | 漏斗与指标条 |
| GET | `/customers` | 列表（query: stage, is_pql, q, page） |
| GET | `/customers/{id}` | 详情（含 events 摘要与 score） |
| POST | `/data/synthetic` | 一键合成 |
| POST | `/data/csv/customers` | 上传 |
| POST | `/data/csv/events` | 上传 |
| GET/PUT | `/settings` | 读写设置 |
| POST | `/settings/llm/test` | 可选测试 |
| POST | `/integrations/feishu/sync` | 只读同步 |
| GET | `/analysis/skills` | 返回官方 Skill 列表 |
| POST | `/analysis/runs` | 一键生成 |
| GET | `/analysis/runs` | 历史 |
| GET | `/analysis/runs/{id}` | 详情 |

### 12.3 前端路由与状态

- 路由见第 5 节。  
- 全局：当前用户、toast 错态、Settings 缓存。  
- 分析页禁止做成聊天组件。

---

## 13. 风险与后续迭代

### 13.1 V1 风险

| 风险 | 缓解 |
|------|------|
| 飞书开放平台权限/环境差异 | 映射与手动同步；失败可演示 CSV/合成 |
| LLM 厂商兼容差异 | 仅承诺 OpenAI 兼容 Chat Completions；无 Key 必可演示 |
| 口径理解不一致 | 以第 4 节为准；荀彧出样例断言 |
| 分析被做成多轮 Agent | PRD 明确禁止；QA 卡交互 |
| 密钥进仓库 | gitignore + 评审 |

### 13.2 后续迭代（明确排后）

1. **多轮 Agent**：工具调用式对话、会话态 —— 非 V1。  
2. **租户自定义 Skill**：上传/编辑 Skill 与参数 schema —— 非 V1。  
3. **MCP**：`packages/mcp` 暴露只读客户/漏斗工具 —— **一键分析稳定后**同仓实现。  
4. **多成员工作区**：邀请、角色 —— 非 V1。  
5. 真实邮件验证、计费、网易产品 API、移动端 —— 非 V1。  
6. 定时飞书同步、更多官方 Skill、分数历史曲线 —— 视 Demo 后反馈。

---

## 附录 A. 默认权重速查（与第 4 节一致）

**健康分**：recency 0.30，frequency 0.25，depth 0.20，stage_progress 0.25  

**PQL**：activation 0.35，engagement 0.30，health 0.20，recency_boost 0.15  

**阈值**：PQL ≥ 70；风险静默 7 天；流失静默 30 天；留存窗 14 天  

---

## 附录 B. 文档交付位置

- 实现仓建议副本：`D:\SanguoWorkspace\pql-saas\docs\prd\PRD-v1.md`  
- 本任务明文交付：见保存路径（仅此文件，无 Page/Canvas）

---

*本 PRD 反映产品头脑风暴已锁定决策；实现以本文为准。变更须诸葛亮 PM 改版号。*

# PQL Health — 字段定义表与指标口径（对齐 PRD-v1）

> 负责人：荀彧  
> 对齐文档：`docs/prd/PRD-v1.md` 第 4 / 6.2 / 9 节  
> 样例文件：同目录 `customers.csv` / `events.csv` / `seed_manifest.json`  
> 基准时间：合成事件相对 `2026-11-01T06:00:00Z`（见 manifest）

本文是前后端实现与贾诩验收的**数据侧唯一补充口径**。与 PRD 冲突时先群里提，再由诸葛亮改 PRD。

---

## 1. CSV 模板字段

### 1.1 `customers.csv`

| 字段 | 必填 | 类型 | 说明 |
|------|------|------|------|
| `external_id` | 是 | string | 租户内唯一客户外部 ID |
| `name` | 是 | string | 展示名称 |

### 1.2 `events.csv`

| 字段 | 必填 | 类型 | 说明 |
|------|------|------|------|
| `external_customer_id` | 是 | string | 对应 `customers.external_id` |
| `event_type` | 是 | enum | 见 §2 |
| `occurred_at` | 是 | datetime | ISO 8601（推荐 `...Z`）或 `YYYY-MM-DD HH:mm:ss` |
| `feature_key` | 否 | string | 功能深度；空表示无 |

编码：UTF-8。单文件 ≤ 2MB（PRD）。

---

## 2. `event_type` 枚举

| 代码 | 推进阶段 | 计入频度/近度 | 计入 depth |
|------|----------|---------------|------------|
| `install` | → installed | 是 | 否 |
| `first_value` | → first_value | 是 | 若带 feature_key 则是 |
| `reuse` | → reuse | 是 | 若带 feature_key 则是 |
| `retention_active` | 辅助留存判定 | 是 | 否 |
| `feature_use` | 不单独升阶段 | 是 | 是（需 feature_key） |
| `other` | 否 | 是 | 否 |

---

## 3. 生命周期阶段

### 3.1 代码与漏斗

| stage | 中文 | 是否进漏斗柱 |
|-------|------|--------------|
| `new` | 新客 | 否 |
| `installed` | 已安装 | 是（累计） |
| `first_value` | 首次价值 | 是（累计） |
| `reuse` | 复用 | 是（累计） |
| `retention` | 留存 | 是（**当前 stage==retention 人数**，PRD 6.2） |
| `at_risk` | 风险 | 否（仅列表/分析） |
| `churned` | 流失 | 否（仅列表/分析） |

漏斗前三档人数 = 「历史上出现过对应事件」的去重客户数：

- 安装：有过 `install`
- 首次价值：有过 `first_value`
- 复用：有过 `reuse`
- 留存柱：当前 `stage == retention`

### 3.2 阶段判定补充（消除 `reuse` 不可达）

PRD 默认「风险静默 7 天 + 留存窗 14 天」下，若「窗内任意活跃且曾 reuse ⇒ retention」，则列表几乎不会出现当前 stage=`reuse`。

**V1 数据侧锁定算法（请郭嘉按此实现，有异议群里说）：**

1. 无事件 → `new`
2. `last_active_at` = 该客户事件最大 `occurred_at`；`silent_days` = 现在 − last_active（按天，向下取整）
3. 里程碑最高档：`install` < `first_value` < `reuse`（由是否存在对应 event_type 决定）
4. 若里程碑 ≥ `first_value`：
   - `silent_days > silent_churn_days`(30) → `churned`
   - `silent_days > silent_risk_days`(7) → `at_risk`
5. 否则：
   - 若存在 `reuse`，且近 `retention_window_days`(14) 内**至少 2 个不同日历日**有事件 → `retention`
   - 若存在 `reuse`，且未进上一条 → `reuse`
   - 若存在 `first_value` → `first_value`
   - 若存在 `install` → `installed`

样例数据按此算法标注了 `intended_stage`（见 `seed_manifest.json`）。

---

## 4. 健康分 / PQL / 建议动作

与 PRD 4.2–4.4、附录 A **完全一致**（此处不重复改权重）。

### 4.1 健康分因子字段（写入 `scores.health_breakdown`）

| key | 默认权重 | 取值 0–100 |
|-----|----------|------------|
| `recency` | 0.30 | 距最近事件 0 天=100；≥14 天=0；线性 |
| `frequency` | 0.25 | 近 14 天事件数 ≥10=100；0=0；线性 |
| `depth` | 0.20 | 近 14 天不同 `feature_key` ≥5=100；0=0；无深度字段则 **50** |
| `stage_progress` | 0.25 | new10 / installed30 / first_value55 / reuse75 / retention100 / at_risk40 / churned15 |

### 4.2 PQL 因子（`scores.pql_breakdown`）

| key | 默认权重 | 口径 |
|-----|----------|------|
| `activation` | 0.35 | ≥first_value=100；仅 installed=40；new=0；at_risk/churned 按是否曾达 first_value（曾达=100） |
| `engagement` | 0.30 | （阶段分 reuse75/retention100/其余按 stage_progress 同类）与 frequency 分的平均 |
| `health` | 0.20 | 健康分原值 |
| `recency_boost` | 0.15 | 近 7 天有事件=100；否则 0 |

`is_pql`：`pql_score ≥ pql_threshold`(70) 且 `stage ∈ {first_value, reuse, retention}`。

**`is_pql` 口径（与 `apps/api/app/services/scoring.py` 一致）：**

- 实现：`is_pql = pql_score >= pql_threshold and stage in PQL_STAGES`，其中 `PQL_STAGES = {"first_value", "reuse", "retention"}`，`pql_threshold` 取租户设置，默认 70。
- `at_risk` / `churned` / `new` / `installed` 客户**一律不是 PQL**，即使 `pql_score ≥ 阈值`。原因：销售不该去追要流失的客户。
- 注：代码中 `at_risk` / `churned` 的 `activation` 直接取 100（这两个阶段必然曾达 first_value）。

**breakdown 与总分计算（健康分 / PQL 同理）：**

- `health_breakdown` / `pql_breakdown` JSON 存的是各因子**原始子分**（0–100），未乘权重。
- 总分 = Σ(原始子分 × 权重)，再截断到 0–100，保留 2 位小数（`_clamp`：`round(max(0, min(100, v)), 2)`）。

### 4.3 建议动作代码

`winback` / `reengage` / `activate_install` / `drive_first_value` / `drive_reuse` / `expand_or_advocate` / `maintain`（优先级见 PRD 4.4）。

---

## 5. 样例分布（抽检基准）

| intended_stage | 人数 |
|----------------|------|
| new | 8 |
| installed | 12 |
| first_value | 15 |
| reuse | 15 |
| retention | 12 |
| at_risk | 10 |
| churned | 8 |
| **合计** | **80** |

期望漏斗（事件累计 / 留存柱）：

| 档 | 期望 |
|----|------|
| installed | 72 |
| first_value | 60 |
| reuse | 36 |
| retention（当前 stage） | 12 |

转化率：60/72、36/60、12/36。

外部 ID 前缀：`CUST-NEW|INS|FV|REU|RET|RSK|CHU-*`，便于人工抽检。

---

## 6. 给合成接口 / QA 的注意

- 一键合成应可生成**同等覆盖**（五段漏斗 + new/at_risk/churned），不必字节级等于本 CSV。
- CSV 上传验收可直接用本目录两个文件。
- 再次合成不得删除 `source=csv|feishu` 客户（PRD 6.4）。
- 分析抽检：无 Key 时六章结构 + Banner；名单客户均属本租户；动作代码 ⊆ §4.3。

---

## 7. 枚举中文映射（前端展示用）

仅用于前端展示，**数据库原始值不变**。

### 7.1 `event_type`

| 代码 | 中文 |
|------|------|
| `install` | 安装 |
| `first_value` | 首次价值 |
| `feature_use` | 功能使用 |
| `reuse` | 复用 |
| `retention_active` | 留存活跃 |

### 7.2 `feature_key`

| 代码 | 中文 |
|------|------|
| `dashboard` | 看板 |
| `funnel` | 漏斗 |
| `import_csv` | CSV 导入 |
| `score_view` | 查看评分 |
| `analysis` | AI 分析 |
| `settings` | 设置 |
| `feishu_sync` | 飞书同步 |

- `feature_key` 为空：不展示。
- 未知值：原样展示，用等宽（mono）标签包裹。

---

## 8. 演示话术

- PQL 分衡量的是「曾经到过价值点」（到过首次价值的客户 `activation` 一律为 100），健康分衡量的是「现在的状态」，所以要两个分一起看。
- 风险/流失客户 PQL 均分（约 46/40）可能高于已安装客户（约 41），但健康分低（约 22/14）且不计入 PQL，应走挽回动作而非销售跟进。
- 演示或回归前先删除合成数据再重新导入；漏斗应为 72/60/36/12，当前合成租户 PQL 约 41–42。

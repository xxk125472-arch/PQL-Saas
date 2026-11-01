# PQL Health — UI / 信息架构与交互说明 v1

> **对应 PRD**：`docs/prd/PRD-v1.md`  
> **作者**：司马懿（UI/UX）  
> **版本**：v1.0  
> **给谁用**：@陆逊 实现页面；@郭嘉 对齐空态/错态字段；@贾诩 对照验收交互

---

## 1. 设计原则（V1）

1. **演示优先**：冷启动 3 步内有数（注册 → 合成数据 → Overview）。
2. **单栏主内容 + 顶栏导航**：不做复杂侧边栏嵌套；桌面宽 ≥1280 为主，移动不做专项（PRD Out）。
3. **状态必可见**：Loading / Empty / Error / Success 四态齐全；密钥类字段永远掩码。
4. **分析不是聊天**：Analysis 页是表单 + 单次报告，禁止对话气泡 UI。
5. **中文优先**：界面文案默认 zh-CN；阶段/动作代码对内，展示用中文。

---

## 2. 站点地图与导航

```
未登录
  /login
  /register

已登录（顶栏）
  Overview     → /overview
  Customers    → /customers
  Data         → /data
  Analysis     → /analysis
  Settings     → /settings
  [用户菜单]   → 登出
```

- 未登录访问业务路由 → 跳转 `/login`，带 `?next=` 可选。
- 顶栏当前路由高亮；品牌名左侧固定「PQL Health」。
- Customers 详情：**同页右侧 Drawer**，无独立路由。

---

## 3. 全局组件与状态

| 组件 | 行为 |
|------|------|
| Toast | 成功/失败右上角，3–5s；导入失败可停留更久并给「查看详情」 |
| 全页 Loading | 首屏鉴权 `/me` 未返回前 |
| 空态 Empty | 插画或简洁图标 + 一句说明 + 主行动按钮（如「生成演示数据」） |
| 错误 Banner | 页顶；可关闭；规则回退分析用 **警告色 Banner**（非错误红） |
| 确认 Dialog | 仅用于破坏性操作：再次合成数据（会替换 synthetic）、登出可选不确认 |

**密钥回显**：飞书 Secret、LLM API Key 回显为 `••••••••` + 「已配置」标记；留空提交表示「不改动」；另提供「清除」。

---

## 4. 页面规格

### 4.1 Login / Register

**布局**：居中卡片，宽 400px。

| 元素 | 说明 |
|------|------|
| 标识字段 | 占位「邮箱或用户名」；含 `@` 按邮箱校验格式，否则按用户名（≥3 字符） |
| 密码 | ≥8 字符（前端提示，以后端为准） |
| 主按钮 | 登录 / 注册 |
| 切换链接 | 「没有账号？注册」/「已有账号？登录」 |

**状态**

- Loading：按钮 disabled + spinner
- Error：卡片内红色文案（账号已存在、密码错误等，用 API `detail`）
- 成功：进 `/overview`

**不做**：验证码、找回密码、第三方登录入口。

---

### 4.2 Overview

**结构（自上而下）**

1. **指标条**（4 卡）：客户总数 | PQL 数 | 风险客户（at_risk）| 流失（churned）
2. **漏斗**：四档横向或阶梯——安装 → 首次价值 → 复用 → 留存  
   - 每档：人数 + 相对上一档转化率（前档为 0 显示 —）
3. **快捷入口**（空态或有数均可）：「去客户列表」「去数据中心」

**空态**：无客户时漏斗全 0；主 CTA「生成演示数据」→ 跳转 `/data` 或直接调合成接口后刷新。

**Loading**：骨架屏（指标卡 + 漏斗条）。

---

### 4.3 Customers

**工具栏**：搜索框（名称 / external_id）| 阶段筛选（多选或单选含全部）| 是否 PQL | 健康等级（健康/一般/风险倾向）| 刷新

**表格列**（顺序固定）

| 列 | 展示 |
|----|------|
| 名称 | 主文案；副文案可显示 external_id（灰） |
| 阶段 | Tag：中文名 + 色（见 §5） |
| 健康分 | 数字 + 色点（≥80 绿 / 50–79 黄 / ＜50 红） |
| PQL 分 | 数字 |
| PQL | 达标显示紫色「PQL」Tag，否则 — |
| 建议动作 | 中文文案（§5.2） |
| 最近活跃 | 相对时间或 `YYYY-MM-DD HH:mm` |

- 默认排序：最近活跃倒序；分页 20/页。
- 行 hover 可点；点击打开 **右侧 Drawer**。

**Drawer 分区**

1. 头部：名称、阶段 Tag、健康/PQL、建议动作  
2. 分数拆解：健康因子 / PQL 因子进度条或数字表（与 Settings 权重一致）  
3. 阶段时间线：由 events 推导的关键节点  
4. 最近事件列表：时间倒序，`event_type` 中文 + feature_key  
5. 建议 reason 全文  

关闭：遮罩点击 / Esc / 右上角关闭。

**空态**：「还没有客户」+ 「生成演示数据」或「上传 CSV」。

---

### 4.4 Data center（`/data`）

**三个 Tab**

| Tab | 内容 |
|-----|------|
| 合成数据 | 说明文案（会替换 `source=synthetic` 的数据，保留 CSV/飞书）+ 「生成演示数据」按钮 + 二次确认 |
| CSV 上传 | 两个上传区：`customers.csv`、`events.csv`；模板下载链接；结果：成功行数 / 错误行号列表 |
| 飞书同步 | 映射表单摘要（详细凭证可在 Settings）；「立即同步」；缺映射/凭证时按钮 disabled + 提示 |

**底部**：最近导入任务表（`imports`）：类型、状态、时间、统计/错误摘要。

**交互注意**

- CSV 单文件 ≤2MB；上传中 disable 按钮。
- 错误行：可展开列表，不整单静默失败。

---

### 4.5 Analysis

**禁止**：聊天输入框、多轮气泡、流式对话感过强的 UI（可用进度条表示单次生成中）。

**布局**

1. 左侧/上方表单：Skill 下拉（仅 `weekly_focus_v1` 可选，其他 disabled）+ 参数包  
   - `focus_window_days`（默认 7）  
   - `risk_limit` / `pql_limit`（默认 10）  
   - `tone`：务实 / 高管摘要  
   - `language`：zh-CN（V1 固定可选）  
2. 主按钮「生成分析」  
3. 结果区：Markdown 渲染六章；元数据条：mode（llm / rules_only）、耗时、skill 版本、时间  
4. **规则回退 Banner**（mode=rules_only）：「当前为规则回退，未调用 LLM」  
5. 历史列表：最近 20 次，点击加载该次 `report_md`

**Loading**：按钮 spinner；结果区骨架或进度「分析生成中…」。

---

### 4.6 Settings

**分区卡片**

1. **健康分权重**：四个滑条/数字输入（recency / frequency / depth / stage_progress）；实时显示合计；≠1.0 时保存按钮 disabled + 红字提示  
2. **PQL 权重**：activation / engagement / health / recency_boost；同上  
3. **阈值与静默**：PQL 阈值、风险天数、流失天数、留存窗天数  
4. **飞书**：App ID、App Secret（掩码）、只读同步相关说明；映射可链到 Data 页  
5. **LLM**：Base URL、API Key（掩码）、Model、超时秒数；「测试连接」按钮  

保存成功 Toast：「已保存并触发重算」；重算中列表可显示短暂 stale 提示（若 API 带 `score_stale`）。

---

## 5. 视觉与文案字典

### 5.1 阶段 Tag

| 代码 | 中文 | 建议色 |
|------|------|--------|
| new | 新客 | 灰 |
| installed | 已安装 | 蓝 |
| first_value | 首次价值 | 青 |
| reuse | 复用 | 靛 |
| retention | 留存 | 绿 |
| at_risk | 风险 | 橙 |
| churned | 流失 | 红 |

### 5.2 建议动作展示文案（与 PRD 4.4 一致）

| 代码 | 文案 |
|------|------|
| winback | 启动挽回：联系确认需求是否变化 |
| reengage | 七日内触达：推送价值场景或成功案例 |
| activate_install | 推动完成安装/首次打开 |
| drive_first_value | 引导完成首次价值行为 |
| drive_reuse | 引导第二次关键使用 |
| expand_or_advocate | 高价值客户：挖掘扩展或转介绍 |
| maintain | 保持观察，按周复查 |

### 5.3 漏斗四档标题

安装 | 首次价值 | 复用 | 留存

---

## 6. 关键用户路径（实现优先级）

```
P0  注册 → 登录 → Overview 空态 → Data 合成 → Overview/Customers 有数
P0  Customers 列表 → Drawer 详情
P1  Settings 改权重 → 列表分数变化
P1  CSV 双文件上传成功路径
P1  Analysis：无 Key 规则回退报告 + Banner
P2  Analysis：有 Key 的 llm 模式
P2  飞书映射 + 同步成功/失败
```

---

## 7. 交给前端的交付物清单

- [x] 本文件：信息架构、页面结构、交互与状态  
- [ ] （可选后续）Figma/线框截图：若老板需要视觉稿再补；V1 陆逊可按本说明 + 简洁 Ant Design / shadcn 风格直接落地  

**建议组件库**：Ant Design 或 shadcn/ui + Tailwind（由 @陆逊 定，保持中性 SaaS 风：白底、轻阴影、主色蓝/靛）。

---

## 8. 口径异议（当前无）

与 PRD v1 无冲突。若实现中 Drawer 与路由争议：以 **同页 Drawer** 为准。

---

*变更随 PRD 改版号；UI 小改可在本文件追加修订记录。*

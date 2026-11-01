# PQL Health — UI / 信息架构与交互说明 v1

> **对应 PRD**：`docs/prd/PRD-v1.md`  
> **作者**：司马懿（UI/UX）  
> **版本**：v1.2（性能与中文要求见 §7.5；2026-11-01 老板拍板：视觉以根目录 `DESIGN.md`（Vercel）为准，组件库 shadcn/ui）  
> **给谁用**：@陆逊 实现页面；@郭嘉 对齐空态/错态字段；@贾诩 对照验收交互

---

## 1. 设计原则（V1）

1. **演示优先**：冷启动 3 步内有数（注册 → 合成数据 → Overview）。
2. **单栏主内容 + 顶栏导航**：不做复杂侧边栏嵌套；桌面宽 ≥1280 为主，移动不做专项（PRD Out）。
3. **状态必可见**：Loading / Empty / Error / Success 四态齐全（视觉见 §7）；密钥类字段永远掩码。
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

## 7. 视觉规范（v1.1 定稿）

**唯一视觉基准**：仓库根目录 `DESIGN.md`（来源 awesome-design-md `design-md/vercel/DESIGN.md`，原文不改）。本节只写落地映射，冲突时以 `DESIGN.md` 为准。

**技术栈**：shadcn/ui + Tailwind CSS + Geist / Geist Mono 字体；动效用 Framer Motion；登录背景用 WebGL（如 three.js / ogl 着色器），不可用时降级为 CSS 渐变动画。

### 7.1 主题（浅色 / 暗色 / 跟随系统）

- 顶栏用户菜单内三选一切换；选择存 `localStorage`，刷新保持；默认「跟随系统」（`prefers-color-scheme`）。
- 浅色：页面底 `#fafafa`，卡片 `#ffffff`，文字 `#171717`，细线 `#ebebeb`。
- 暗色：按 DESIGN.md 的「极性翻转」处理，页面底 `#0a0a0a`～`#171717`，卡片抬一级灰，文字 `#ededed`，细线约 `#2e2e2e`；对照 getdesign.md 的 Vercel 暗色预览取值。
- 用 CSS 变量 + Tailwind `dark:`，组件不写死色值。

### 7.2 登录前（/login、/register）：允许炫

- 全屏 Vercel 网格渐变背景（青 `#50e3c2`、蓝 `#007cf0`、品红 `#ff0080`、琥珀 `#f9cb28`），缓慢流动，鼠标视差轻微偏移。**优先用 CSS 渐变 + transform 动画实现**；如用 WebGL，只能是单个轻量全屏着色器，限 30fps、按 1x 像素比渲染，离开登录页立即销毁。
- 中间登录卡片按 `ex-auth-form-card`：白卡（暗色下深卡）+ 内嵌细线 + 叠层阴影。**禁止毛玻璃（backdrop-blur）**。
- **转场**：登录成功 → 渐变向中心收拢并淡出（约 600–800ms）→ 卡片缩放淡出 → Overview 内容由下往上 12px 渐显。
- 尊重 `prefers-reduced-motion`：开启时关掉流动和转场，只保留淡入。

### 7.3 登录后：企业级、克制

- 不再出现彩色渐变（DESIGN.md 规定渐变只在首屏大面积使用）。
- 唯一主按钮色：墨黑 `#171717`（暗色下反白）；应用内按钮圆角 6px，卡片 8–12px；不混用 100px 胶囊按钮。
- 标题 Geist 600 封顶、负字距、句首大写不全大写；表头、指标卡小标签、ID、时间用 Geist Mono。
- 阴影只用 DESIGN.md 的叠层阴影（Level 1–5），不用单层重阴影。
- 原 §5.1 阶段 Tag 颜色改为低饱和底 + 同色文字（用 DESIGN.md 的语义色及其 soft 版本），避免大块彩色。

### 7.4 动效（有动画感，不塑料）

| 场景 | 做法 |
|------|------|
| 页面切换 | 内容 150–200ms 淡入 + 上移 8px |
| Drawer | 右侧滑入 240ms，缓动 `cubic-bezier(0.32,0.72,0,1)`，遮罩淡入 |
| 指标卡 / 漏斗 | 数字从 0 滚动到目标值（约 600ms）；漏斗柱依次生长 |
| 按钮 | hover 背景轻变，按下 scale 0.98 |
| 加载 | 骨架屏微光，不用转圈大 loading |
| Toast | 右上角滑入，叠层阴影 |

禁止：弹跳过度、霓虹发光、大面积渐变按钮、拟物高光。

### 7.5 性能与普适性（老板硬要求，贾诩必验）

- **禁止毛玻璃**：全站不用 `backdrop-filter` / 半透明模糊卡片。
- **禁止重渲染**：不用 3D 场景、粒子系统、多层实时模糊、全屏视频背景；登录后页面不跑任何持续动画。
- 动画只改 `transform` 和 `opacity`，不改动 width/height/box-shadow 做帧动画。
- 普通集显笔记本上登录页保持流畅（目标 ≥50fps），CPU 占用不明显升高；`prefers-reduced-motion` 时全部降级为淡入。
- 动效要「高级但不炫目」：时长 150–300ms 为主，登录转场 ≤800ms，不闪烁、不循环抢注意力。

### 7.6 中文优先

- 所有界面文案、按钮、提示、空态、错误信息、日期格式一律中文（`YYYY-MM-DD HH:mm`，24 小时制）。
- 只有代码类标识（如 `external_id`、动作代码）可保留英文，且仅出现在次级灰字或开发者信息里。
- 后端返回的英文错误 `detail` 前端需映射为中文提示。
- 中文字体回退：Geist 后接 `"PingFang SC", "Microsoft YaHei", sans-serif`；中文标题不用负字距过紧，按 -0.5px 以内处理。

## 8. 交给前端的交付物清单

- [x] 本文件：信息架构、页面结构、交互与状态、视觉落地映射  
- [x] 根目录 `DESIGN.md`：唯一视觉基准（Vercel）

---

## 9. 口径异议（当前无）

与 PRD v1 无冲突。若实现中 Drawer 与路由争议：以 **同页 Drawer** 为准。

---

*变更随 PRD 改版号；UI 小改可在本文件追加修订记录。*

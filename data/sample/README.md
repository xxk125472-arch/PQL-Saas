# data/sample

样例与口径（荀彧）：

| 文件 | 用途 |
|------|------|
| `METRICS-FIELDS.md` | 字段定义 + 阶段判定补充 + 抽检基准 |
| `customers.csv` | CSV 上传模板数据（80 客户） |
| `events.csv` | 事件（覆盖 install→first_value→reuse→retention，及 new/at_risk/churned） |
| `seed_manifest.json` | 期望人数与漏斗数字，供后端断言 / 贾诩对照 |

生成脚本（可选）：同目录若需重跑，用仓库外备份的 `generate_sample.py` 或找荀彧要。

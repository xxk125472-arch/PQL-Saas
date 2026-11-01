# PQL Health API Contract v1（郭嘉）

- Base: `http://127.0.0.1:8000/api/v1`
- Auth: `Authorization: Bearer <access_token>`（注册/登录返回 `access_token`）
- 错误: `{ "detail": "..." }`

## 已对齐 PRD §12.2 路径

| Method | Path | 状态 |
|--------|------|------|
| POST | `/auth/register` | 可用 |
| POST | `/auth/login` | 可用 |
| POST | `/auth/logout` | 可用（客户端丢 token） |
| GET | `/me` | 可用 |
| GET | `/overview/funnel` | 可用 |
| GET | `/customers` | 可用 |
| GET | `/customers/{id}` | 可用 |
| POST | `/data/synthetic` | 可用（替换 synthetic） |
| POST | `/data/csv/customers` | 路由已挂，解析下一切片 |
| POST | `/data/csv/events` | 路由已挂，解析下一切片 |
| GET/PUT | `/settings` | 可用 |
| POST | `/settings/llm/test` | 占位 |
| POST | `/integrations/feishu/sync` | 校验凭证/映射，客户端下一切片 |
| GET | `/analysis/skills` | 可用 |
| POST | `/analysis/runs` | 规则回退可用；LLM 网关下一切片 |
| GET | `/analysis/runs` | 可用 |
| GET | `/analysis/runs/{id}` | 可用 |
| GET | `/health`（无前缀） | 可用 |

## 注册/登录 body

```json
{ "identifier": "demo@example.com", "password": "secret12" }
```

`identifier` 含 `@` 当邮箱，否则当用户名。

## 漏斗字段

`installed/first_value/reuse` = 曾发生对应事件的去重客户数；`retention` = 当前 `stage==retention` 客户数（PRD 锁定口径）。

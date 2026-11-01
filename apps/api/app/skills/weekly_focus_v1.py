from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from app.models import Customer, Score


def build_rules_report(db: Session, tenant_id: str, params: dict[str, Any]) -> str:
    risk_limit = int(params.get("risk_limit", 10))
    pql_limit = int(params.get("pql_limit", 10))
    customers = db.query(Customer).filter(Customer.tenant_id == tenant_id).all()
    scores = {
        s.customer_id: s
        for s in db.query(Score).filter(Score.tenant_id == tenant_id).all()
    }
    at_risk = [c for c in customers if c.stage == "at_risk"][:risk_limit]
    pqls = [c for c in customers if scores.get(c.id) and scores[c.id].is_pql][:pql_limit]
    churned = sum(1 for c in customers if c.stage == "churned")

    lines = [
        "# 本周运营焦点（规则回退）",
        "",
        "## 1. 本周结论",
        f"- 客户总数 {len(customers)}，风险 {len(at_risk)}，流失 {churned}，PQL {len(pqls)}",
        f"- 建议优先处理 at_risk 客户的 reengage 动作",
        f"- PQL 客户可推进 expand_or_advocate",
        "- 若尚未接入飞书，可先用合成数据或 CSV 演示",
        "- 配置 LLM Key 后可升级为模型解读（同一章节结构）",
        "",
        "## 2. 漏斗与阶段解读",
        "- 以客户当前 stage 与历史事件为准；留存档按当前 stage==retention 计数",
        "",
        "## 3. 优先处理名单（风险）",
    ]
    if not at_risk:
        lines.append("- （暂无 at_risk 客户）")
    for c in at_risk:
        s = scores.get(c.id)
        lines.append(
            f"- {c.name} | stage={c.stage} | health={getattr(s,'health_score',0)} | action={getattr(s,'suggested_action','reengage')}"
        )
    lines += ["", "## 4. 可放大名单（PQL）"]
    if not pqls:
        lines.append("- （暂无 PQL 客户）")
    for c in pqls:
        s = scores.get(c.id)
        lines.append(
            f"- {c.name} | stage={c.stage} | pql={getattr(s,'pql_score',0)} | action={getattr(s,'suggested_action','maintain')}"
        )
    lines += [
        "",
        "## 5. 建议动作汇总",
        "- winback / reengage / activate_install / drive_first_value / drive_reuse / expand_or_advocate / maintain",
        "",
        "## 6. 数据缺口与下一步",
        "- 检查 Settings 是否配置飞书只读同步与 LLM Endpoint",
        "- 用 Data center 一键合成或 CSV 补齐事件深度字段 feature_key",
    ]
    return "\n".join(lines)

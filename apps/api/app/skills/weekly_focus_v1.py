from __future__ import annotations

from decimal import Decimal, InvalidOperation
import json
import re
from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import Customer, Event, Score, TenantSettings

SECTION_TITLES = (
    "本周结论",
    "漏斗与阶段解读",
    "优先处理名单（风险）",
    "可放大名单（PQL）",
    "建议动作汇总",
    "数据缺口与下一步",
)
STAGES = ("new", "installed", "first_value", "reuse", "retention", "at_risk", "churned")
ACTION_LABELS = {
    "winback": "启动挽回",
    "reengage": "七日内触达",
    "activate_install": "推动安装",
    "drive_first_value": "引导首次价值",
    "drive_reuse": "引导复用",
    "expand_or_advocate": "扩展或转介绍",
    "maintain": "保持观察",
}
NUMBER_RE = re.compile(r"(?<![A-Za-z0-9_])[-+]?\d+(?:\.\d+)?")


def normalize_params(params: dict[str, Any]) -> dict[str, Any]:
    normalized: dict[str, Any] = {}
    for key, default, maximum in (
        ("focus_window_days", 7, 365),
        ("risk_limit", 10, 100),
        ("pql_limit", 10, 100),
    ):
        value = params.get(key, default)
        if isinstance(value, bool):
            raise ValueError(f"参数 {key} 必须是整数。")
        try:
            value = int(value)
        except (TypeError, ValueError) as exc:
            raise ValueError(f"参数 {key} 必须是整数。") from exc
        if value < 1 or value > maximum:
            raise ValueError(f"参数 {key} 必须在 1 到 {maximum} 之间。")
        normalized[key] = value
    tone = params.get("tone", "pragmatic")
    if tone not in {"pragmatic", "executive"}:
        raise ValueError("参数 tone 仅支持 pragmatic 或 executive。")
    language = params.get("language", "zh-CN")
    if language != "zh-CN":
        raise ValueError("参数 language 当前仅支持 zh-CN。")
    normalized.update({"tone": tone, "language": language})
    return normalized


def build_facts(db: Session, tenant_id: str, params: dict[str, Any]) -> dict[str, Any]:
    customers = db.query(Customer).filter(Customer.tenant_id == tenant_id).all()
    scores = db.query(Score).filter(Score.tenant_id == tenant_id).all()
    score_map = {score.customer_id: score for score in scores}

    def ever_had(event_type: str) -> int:
        return (
            db.query(func.count(func.distinct(Event.customer_id)))
            .filter(Event.tenant_id == tenant_id, Event.event_type == event_type)
            .scalar()
            or 0
        )

    installed = ever_had("install")
    first_value = ever_had("first_value")
    reuse = ever_had("reuse")
    retention = sum(customer.stage == "retention" for customer in customers)

    def conversion(previous: int, current: int) -> float | None:
        return round(current / previous * 100, 2) if previous else None

    def customer_fact(customer: Customer) -> dict[str, Any]:
        score = score_map.get(customer.id)
        default_action = "winback" if customer.stage == "churned" else "reengage"
        return {
            "name": customer.name,
            "stage": customer.stage,
            "health_score": score.health_score if score else 0,
            "pql_score": score.pql_score if score else 0,
            "suggested_action": score.suggested_action if score else default_action,
        }

    risks = [customer for customer in customers if customer.stage in {"at_risk", "churned"}]
    risks.sort(
        key=lambda customer: (
            score_map[customer.id].health_score if customer.id in score_map else 0,
            -(score_map[customer.id].pql_score if customer.id in score_map else 0),
            customer.name,
        )
    )
    pqls = [customer for customer in customers if customer.id in score_map and score_map[customer.id].is_pql]
    pqls.sort(
        key=lambda customer: (
            -score_map[customer.id].pql_score,
            -score_map[customer.id].health_score,
            customer.name,
        )
    )
    action_summary = {
        action: sum(score.suggested_action == action for score in scores)
        for action in ACTION_LABELS
        if any(score.suggested_action == action for score in scores)
    }
    settings = db.query(TenantSettings).filter(TenantSettings.tenant_id == tenant_id).first()
    missing_feature_key = (
        db.query(func.count(Event.id))
        .filter(Event.tenant_id == tenant_id, Event.feature_key.is_(None))
        .scalar()
        or 0
    )
    stage_distribution = {stage: sum(customer.stage == stage for customer in customers) for stage in STAGES}
    return {
        "skill_id": "weekly_focus_v1",
        "params": params,
        "funnel": {
            "installed": installed,
            "first_value": first_value,
            "reuse": reuse,
            "retention": retention,
            "conversion_percent": {
                "installed_to_first_value": conversion(installed, first_value),
                "first_value_to_reuse": conversion(first_value, reuse),
                "reuse_to_retention": conversion(reuse, retention),
            },
        },
        "stage_distribution": stage_distribution,
        "metrics": {
            "customer_total": len(customers),
            "pql_count": len(pqls),
            "at_risk_count": stage_distribution["at_risk"],
            "churned_count": stage_distribution["churned"],
        },
        "risk_customers": [customer_fact(customer) for customer in risks[: params["risk_limit"]]],
        "pql_customers": [customer_fact(customer) for customer in pqls[: params["pql_limit"]]],
        "action_summary": action_summary,
        "data_quality": {
            "feishu_configured": bool(
                settings and settings.feishu_app_id and settings.feishu_app_secret_enc and settings.feishu_mapping_json
            ),
            "customers_without_scores": sum(customer.id not in score_map for customer in customers),
            "events_without_feature_key": missing_feature_key,
        },
    }


def build_rules_report(facts: dict[str, Any]) -> str:
    metrics = facts["metrics"]
    funnel = facts["funnel"]
    rates = funnel["conversion_percent"]
    quality = facts["data_quality"]
    params = facts["params"]
    risk_count = metrics["at_risk_count"] + metrics["churned_count"]

    def pct(value: float | None) -> str:
        return "—" if value is None else f"{value}%"

    lines = [
        "> 提示：当前为规则回退，未调用 LLM。",
        "",
        "# 本周运营焦点",
        "",
        "## 1. 本周结论",
        (
            f"- 关注窗口 {params['focus_window_days']} 天：客户 {metrics['customer_total']} 个，"
            f"风险 {risk_count} 个，PQL {metrics['pql_count']} 个。"
        ),
        (
            f"- 安装到首次价值转化率 {pct(rates['installed_to_first_value'])}，"
            f"首次价值到复用转化率 {pct(rates['first_value_to_reuse'])}。"
        ),
        "- 优先按健康分从低到高处理风险名单，执行库内建议动作。",
        "- 对 PQL 名单按 PQL 分从高到低跟进扩展或转介绍机会。",
        "",
        "## 2. 漏斗与阶段解读",
        (
            f"- 漏斗：安装 {funnel['installed']}，首次价值 {funnel['first_value']}，"
            f"复用 {funnel['reuse']}，留存 {funnel['retention']}。"
        ),
        f"- 复用到留存转化率 {pct(rates['reuse_to_retention'])}；留存按当前 stage=retention 计数。",
        "- 阶段分布：" + "，".join(f"{stage} {count}" for stage, count in facts["stage_distribution"].items()) + "。",
        "",
        "## 3. 优先处理名单（风险）",
    ]
    if facts["risk_customers"]:
        lines += [
            "| 客户 | 阶段 | 健康分 | PQL 分 | 建议动作 |",
            "| --- | --- | ---: | ---: | --- |",
        ]
        for customer in facts["risk_customers"]:
            lines.append(
                f"| {customer['name']} | {customer['stage']} | {customer['health_score']} | "
                f"{customer['pql_score']} | {customer['suggested_action']} |"
            )
    else:
        lines.append("- 暂无风险客户。")

    lines += ["", "## 4. 可放大名单（PQL）"]
    if facts["pql_customers"]:
        lines += [
            "| 客户 | 阶段 | 健康分 | PQL 分 | 建议动作 |",
            "| --- | --- | ---: | ---: | --- |",
        ]
        for customer in facts["pql_customers"]:
            lines.append(
                f"| {customer['name']} | {customer['stage']} | {customer['health_score']} | "
                f"{customer['pql_score']} | {customer['suggested_action']} |"
            )
    else:
        lines.append("- 暂无 PQL 客户。")

    lines += ["", "## 5. 建议动作汇总"]
    if facts["action_summary"]:
        for action, count in facts["action_summary"].items():
            lines.append(f"- {action}（{ACTION_LABELS[action]}）：{count} 个客户。")
    else:
        lines.append("- 暂无可汇总建议动作。")

    lines += ["", "## 6. 数据缺口与下一步"]
    if quality["customers_without_scores"]:
        lines.append(f"- 有 {quality['customers_without_scores']} 个客户缺少评分，请触发重算。")
    else:
        lines.append("- 当前客户均已有评分，继续按周复查。")
    if quality["events_without_feature_key"]:
        lines.append(f"- 有 {quality['events_without_feature_key']} 条事件缺少 feature_key，建议补齐功能深度字段。")
    else:
        lines.append("- 事件功能深度字段完整。")
    if not quality["feishu_configured"]:
        lines.append("- 尚未完整配置飞书只读同步，可在设置中补齐凭证与字段映射。")
    else:
        lines.append("- 飞书配置已填写，可继续核对待同步字段与数据新鲜度。")
    return "\n".join(lines)


def build_llm_messages(facts: dict[str, Any]) -> list[dict[str, str]]:
    headings = "\n".join(f"## {index}. {title}" for index, title in enumerate(SECTION_TITLES, 1))
    system = (
        "你是 B2B SaaS 客户运营分析师。只能依据用户给出的 JSON 事实写作，禁止补充或推算任何新数字。"
        "报告中的每个数字都必须能在事实 JSON 或固定章节编号中找到。"
        "只使用 winback、reengage、activate_install、drive_first_value、drive_reuse、"
        "expand_or_advocate、maintain 这些动作代码。"
        "不得提出转账、删库或向第三方导出全量隐私数据。"
        "只返回一个 JSON 对象，格式为 {\"report_md\":\"中文 Markdown 报告\"}，不要返回其他字段或解释。"
        "report_md 必须按顺序包含以下六个二级标题，每节不能为空，本周结论最多 5 条子弹：\n"
        f"{headings}"
    )
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": json.dumps(facts, ensure_ascii=False, separators=(",", ":"))},
    ]


def _numbers(text: str) -> set[Decimal]:
    result: set[Decimal] = set()
    for token in NUMBER_RE.findall(text):
        try:
            result.add(Decimal(token).normalize())
        except InvalidOperation:
            continue
    return result


def parse_llm_report(content: str, facts: dict[str, Any]) -> str:
    stripped = content.strip()
    if stripped.startswith("```"):
        lines = stripped.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        stripped = "\n".join(lines).strip()
    try:
        payload = json.loads(stripped)
    except (json.JSONDecodeError, TypeError) as exc:
        raise ValueError("LLM 未返回合法 JSON。") from exc
    if not isinstance(payload, dict) or not isinstance(payload.get("report_md"), str):
        raise ValueError("LLM JSON 缺少字符串字段 report_md。")
    report = payload["report_md"].strip()
    if not report:
        raise ValueError("LLM 报告为空。")

    headings = [f"## {index}. {title}" for index, title in enumerate(SECTION_TITLES, 1)]
    positions = [report.find(heading) for heading in headings]
    if any(position < 0 for position in positions) or positions != sorted(positions):
        raise ValueError("LLM 报告缺少固定六章或章节顺序错误。")
    for index, position in enumerate(positions):
        end = positions[index + 1] if index + 1 < len(positions) else len(report)
        body = report[position + len(headings[index]) : end].strip()
        if not body:
            raise ValueError("LLM 报告存在空章节。")
        if index == 0 and sum(line.lstrip().startswith(("- ", "* ")) for line in body.splitlines()) > 5:
            raise ValueError("本周结论超过 5 条。")

    allowed_numbers = _numbers(json.dumps(facts, ensure_ascii=False))
    allowed_numbers.update(Decimal(index) for index in range(1, 7))
    unexpected_numbers = _numbers(report) - allowed_numbers
    if unexpected_numbers:
        raise ValueError("LLM 报告包含事实集之外的数字。")
    if any(forbidden in report for forbidden in ("转账", "删库", "导出全量隐私")):
        raise ValueError("LLM 报告包含禁止动作。")
    return report

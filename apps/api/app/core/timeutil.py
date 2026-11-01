"""Time helpers: everything is stored as naive UTC."""
from datetime import datetime, timezone


def utcnow() -> datetime:
    """Current time as naive UTC (tzinfo dropped)."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def parse_ts(value: str) -> datetime:
    """Parse ISO 8601 (with Z/offset) or 'YYYY-MM-DD HH:MM:SS' into naive UTC."""
    s = value.strip()
    if s.endswith(("Z", "z")):
        s = s[:-1] + "+00:00"
    dt = datetime.fromisoformat(s)
    if dt.tzinfo is not None:
        dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


def silent_days(now: datetime, last: datetime) -> int:
    """Whole days since last activity, floored."""
    return (now - last).days

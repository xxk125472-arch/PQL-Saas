DEFAULT_HEALTH_WEIGHTS = {
    "recency": 0.30,
    "frequency": 0.25,
    "depth": 0.20,
    "stage_progress": 0.25,
}

DEFAULT_PQL_WEIGHTS = {
    "activation": 0.35,
    "engagement": 0.30,
    "health": 0.20,
    "recency_boost": 0.15,
}


def weights_sum_ok(weights: dict[str, float], tol: float = 1e-6) -> bool:
    return abs(sum(weights.values()) - 1.0) <= tol

from collections.abc import Iterator
from typing import Any

import httpx

from app.core.config import Settings


FEISHU_BASE_URL = "https://open.feishu.cn"
REQUEST_TIMEOUT_SECONDS = 10.0
DEFAULT_FIELD_MAPPING = {
    "external_id": "external_id",
    "name": "name",
    "external_customer_id": "external_customer_id",
    "event_type": "event_type",
    "occurred_at": "occurred_at",
    "feature_key": "feature_key",
    "event_type_values": {},
}


def load_env_config() -> dict[str, Any] | None:
    settings = Settings()
    values = (
        settings.feishu_app_id,
        settings.feishu_app_secret,
        settings.feishu_app_token,
        settings.feishu_customers_table_id,
        settings.feishu_events_table_id,
    )
    if not all(values):
        return None
    app_id, app_secret, app_token, customers_table_id, events_table_id = values
    return {
        "app_id": app_id,
        "app_secret": app_secret,
        "stored": {
            "app_token": app_token,
            "customers_table_id": customers_table_id,
            "events_table_id": events_table_id,
            "field_mapping": DEFAULT_FIELD_MAPPING.copy(),
        },
    }

_ERROR_MESSAGES = {
    10003: ("飞书应用凭证无效，请检查 App ID 和 App Secret", "FEISHU_INVALID_CREDENTIALS"),
    99991663: ("飞书访问凭证无效或已过期，请重试", "FEISHU_INVALID_ACCESS_TOKEN"),
    1254003: ("多维表格 app_token 错误，请检查配置", "FEISHU_INVALID_APP_TOKEN"),
    1254004: ("数据表 table_id 错误，请检查配置", "FEISHU_INVALID_TABLE_ID"),
    1254041: ("数据表不存在或应用无权访问，请检查 table_id 和权限", "FEISHU_TABLE_NOT_FOUND"),
    1254290: ("飞书请求过于频繁，请稍后重试", "FEISHU_RATE_LIMITED"),
}


class FeishuError(Exception):
    def __init__(self, detail: str, code: str, status_code: int = 502):
        super().__init__(detail)
        self.detail = detail
        self.code = code
        self.status_code = status_code


class FeishuClient:
    def __init__(self, client: httpx.Client | None = None):
        self._client = client or httpx.Client(base_url=FEISHU_BASE_URL, timeout=REQUEST_TIMEOUT_SECONDS)
        self._owns_client = client is None

    def __enter__(self) -> "FeishuClient":
        return self

    def __exit__(self, *_args: object) -> None:
        self.close()

    def close(self) -> None:
        if self._owns_client:
            self._client.close()

    def _request(self, method: str, path: str, **kwargs: Any) -> dict[str, Any]:
        try:
            response = self._client.request(method, path, **kwargs)
        except httpx.TimeoutException as exc:
            raise FeishuError("连接飞书超时，请稍后重试", "FEISHU_TIMEOUT", 504) from exc
        except httpx.RequestError as exc:
            raise FeishuError("无法连接飞书，请检查网络后重试", "FEISHU_NETWORK_ERROR") from exc

        try:
            payload = response.json()
        except ValueError as exc:
            if response.status_code >= 400:
                self._raise_http_error(response.status_code)
            raise FeishuError("飞书返回数据格式异常", "FEISHU_INVALID_RESPONSE") from exc
        if not isinstance(payload, dict):
            raise FeishuError("飞书返回数据格式异常", "FEISHU_INVALID_RESPONSE")

        api_code = payload.get("code", 0)
        if response.status_code >= 400 or api_code != 0:
            if isinstance(api_code, int) and api_code in _ERROR_MESSAGES:
                detail, code = _ERROR_MESSAGES[api_code]
                raise FeishuError(detail, code)
            self._raise_http_error(response.status_code, api_code)
        return payload

    @staticmethod
    def _raise_http_error(status_code: int, api_code: object = 0) -> None:
        if status_code in {401, 403}:
            raise FeishuError("应用无权读取该多维表格，请检查飞书权限和文档授权", "FEISHU_PERMISSION_DENIED", 502)
        if status_code == 404:
            raise FeishuError("多维表格或数据表不存在，请检查配置", "FEISHU_RESOURCE_NOT_FOUND")
        if status_code == 429:
            raise FeishuError("飞书请求过于频繁，请稍后重试", "FEISHU_RATE_LIMITED")
        if status_code >= 500:
            raise FeishuError("飞书服务暂时不可用，请稍后重试", "FEISHU_SERVICE_UNAVAILABLE")
        if api_code:
            raise FeishuError("飞书接口返回错误，请检查应用凭证、表格配置和读取权限", "FEISHU_API_ERROR")
        raise FeishuError("飞书请求失败，请稍后重试", "FEISHU_HTTP_ERROR")

    def get_tenant_access_token(self, app_id: str, app_secret: str) -> str:
        payload = self._request(
            "POST",
            "/open-apis/auth/v3/tenant_access_token/internal",
            json={"app_id": app_id, "app_secret": app_secret},
            headers={"Content-Type": "application/json; charset=utf-8"},
        )
        token = payload.get("tenant_access_token")
        if not isinstance(token, str) or not token:
            raise FeishuError("飞书未返回有效访问凭证", "FEISHU_INVALID_RESPONSE")
        return token

    def list_records_page(
        self,
        *,
        app_token: str,
        table_id: str,
        access_token: str,
        page_token: str | None = None,
        page_size: int = 100,
    ) -> dict[str, Any]:
        params: dict[str, str | int] = {"page_size": page_size}
        if page_token:
            params["page_token"] = page_token
        payload = self._request(
            "POST",
            f"/open-apis/bitable/v1/apps/{app_token}/tables/{table_id}/records/search",
            params=params,
            json={},
            headers={"Authorization": f"Bearer {access_token}"},
        )
        data = payload.get("data")
        if not isinstance(data, dict) or not isinstance(data.get("items"), list):
            raise FeishuError("飞书记录返回格式异常", "FEISHU_INVALID_RESPONSE")
        return data

    def iter_records(self, *, app_token: str, table_id: str, access_token: str) -> Iterator[dict[str, Any]]:
        page_token = None
        seen_tokens = set()
        while True:
            data = self.list_records_page(
                app_token=app_token,
                table_id=table_id,
                access_token=access_token,
                page_token=page_token,
            )
            yield from data["items"]
            if not data.get("has_more"):
                return
            page_token = data.get("page_token")
            if not isinstance(page_token, str) or not page_token or page_token in seen_tokens:
                raise FeishuError("飞书分页数据异常，请稍后重试", "FEISHU_INVALID_PAGINATION")
            seen_tokens.add(page_token)

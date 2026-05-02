from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app


def _openapi() -> dict:
    client = TestClient(app)
    response = client.get("/openapi.json")
    assert response.status_code == 200
    return response.json()


def test_openapi_exposes_series_endpoints_and_metadata() -> None:
    schema = _openapi()

    assert "/api/v1/web-service/series" in schema["paths"]
    assert "/api/v1/web-service/series/{slug}" in schema["paths"]
    assert "/api/v1/web-service/series/{slug}/posts" in schema["paths"]

    list_op = schema["paths"]["/api/v1/web-service/series"]["get"]
    create_op = schema["paths"]["/api/v1/web-service/series"]["post"]
    reorder_op = schema["paths"]["/api/v1/web-service/series/{slug}/posts"]["put"]

    assert list_op["summary"] == "List series"
    assert create_op["summary"] == "Create series"
    assert "401" in create_op["responses"]
    assert "409" in create_op["responses"]
    assert reorder_op["summary"] == "Replace ordered series posts"


def test_openapi_has_series_tag_description() -> None:
    schema = _openapi()
    tags = {tag["name"]: tag for tag in schema["tags"]}
    assert "series" in tags
    assert "series" in tags["series"]["description"].lower()

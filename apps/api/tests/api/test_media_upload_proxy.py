from urllib.error import URLError

from fastapi.testclient import TestClient

from app.api.v1.endpoints import media as media_endpoint
from app.main import app


class _DummyResponse:
    def __init__(self, status_code: int = 200) -> None:
        self._status_code = status_code

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        return None

    def getcode(self) -> int:
        return self._status_code


def test_media_upload_proxy_rejects_missing_upload_url_header() -> None:
    client = TestClient(app)

    response = client.post(
        '/api/v1/media/upload-proxy',
        content=b'binary',
        headers={'content-type': 'image/jpeg'},
    )

    assert response.status_code == 400
    assert response.json() == {'detail': 'x-upload-url header is required'}


def test_media_upload_proxy_forwards_binary_upload(monkeypatch) -> None:
    captured: dict[str, str] = {}

    def fake_urlopen(request, timeout):  # type: ignore[no-untyped-def]
        captured['url'] = request.full_url
        captured['method'] = request.get_method()
        captured['content_type'] = request.headers.get('Content-Type', '')
        captured['timeout'] = str(timeout)
        return _DummyResponse(200)

    monkeypatch.setattr(media_endpoint, 'urlopen', fake_urlopen)

    client = TestClient(app)
    response = client.post(
        '/api/v1/media/upload-proxy',
        content=b'test-binary',
        headers={
            'x-upload-url': 'http://minio:9000/traceoflight-media/image/object.jpg',
            'x-upload-content-type': 'image/jpeg',
            'content-type': 'image/jpeg',
        },
    )

    assert response.status_code == 200
    assert response.json() == {'ok': True}
    assert captured == {
        'url': 'http://minio:9000/traceoflight-media/image/object.jpg',
        'method': 'PUT',
        'content_type': 'image/jpeg',
        'timeout': '30',
    }


def test_media_upload_proxy_returns_502_on_network_error(monkeypatch) -> None:
    def fake_urlopen(request, timeout):  # type: ignore[no-untyped-def]
        raise URLError('no route to host')

    monkeypatch.setattr(media_endpoint, 'urlopen', fake_urlopen)

    client = TestClient(app)
    response = client.post(
        '/api/v1/media/upload-proxy',
        content=b'test-binary',
        headers={
            'x-upload-url': 'http://minio:9000/traceoflight-media/image/object.jpg',
            'x-upload-content-type': 'image/jpeg',
            'content-type': 'image/jpeg',
        },
    )

    assert response.status_code == 502
    assert response.json() == {'detail': 'object storage upload request failed: no route to host'}


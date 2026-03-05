from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app


def _openapi() -> dict:
    client = TestClient(app)
    response = client.get('/openapi.json')
    assert response.status_code == 200
    return response.json()


def test_health_operation_has_summary_and_description() -> None:
    schema = _openapi()
    operation = schema['paths']['/api/v1/health']['get']

    assert operation['summary'] == 'Health check'
    assert 'liveness' in operation['description'].lower()
    assert operation['operationId'] == 'health_check_api_v1_health_get'


def test_posts_operations_expose_reference_metadata() -> None:
    schema = _openapi()
    list_op = schema['paths']['/api/v1/posts']['get']
    create_op = schema['paths']['/api/v1/posts']['post']
    delete_op = schema['paths']['/api/v1/posts/{slug}']['delete']

    assert list_op['summary'] == 'List posts'
    assert 'public' in list_op['description'].lower()
    assert 'x-internal-api-secret' in str(list_op)

    assert create_op['summary'] == 'Create post'
    assert '401' in create_op['responses']
    assert '409' in create_op['responses']

    assert delete_op['summary'] == 'Delete post'
    assert delete_op['responses']['204']['description'] == 'Post deleted'


def test_media_operations_document_upload_flow_and_proxy_headers() -> None:
    schema = _openapi()
    upload_url_op = schema['paths']['/api/v1/media/upload-url']['post']
    register_op = schema['paths']['/api/v1/media']['post']
    proxy_op = schema['paths']['/api/v1/media/upload-proxy']['post']

    assert upload_url_op['summary'] == 'Create upload URL'
    assert register_op['summary'] == 'Register uploaded media'
    assert proxy_op['summary'] == 'Proxy upload to object storage'
    assert 'x-upload-url' in str(proxy_op)
    assert '502' in proxy_op['responses']


def test_post_and_media_component_schemas_have_field_descriptions() -> None:
    schema = _openapi()
    post_create = schema['components']['schemas']['PostCreate']['properties']
    media_upload = schema['components']['schemas']['MediaUploadRequest']['properties']

    assert post_create['slug']['description'] == 'URL-friendly unique post identifier.'
    assert 'example' in post_create['title']
    assert media_upload['filename']['description'] == 'Original file name from client.'
    assert 'example' in media_upload['mime_type']


def test_openapi_has_tag_descriptions_for_health_posts_media() -> None:
    schema = _openapi()
    tags = {tag['name']: tag for tag in schema['tags']}

    assert 'health' in tags
    assert 'posts' in tags
    assert 'media' in tags
    assert 'liveness' in tags['health']['description'].lower()

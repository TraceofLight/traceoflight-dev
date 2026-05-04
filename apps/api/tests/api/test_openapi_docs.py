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
    operation = schema['paths']['/api/v1/web-service/health']['get']

    assert operation['summary'] == 'Health check'
    assert 'liveness' in operation['description'].lower()
    assert operation['operationId'] == 'health_check_api_v1_web_service_health_get'


def test_posts_operations_expose_reference_metadata() -> None:
    schema = _openapi()
    list_op = schema['paths']['/api/v1/web-service/posts']['get']
    summary_op = schema['paths']['/api/v1/web-service/posts/summary']['get']
    create_op = schema['paths']['/api/v1/web-service/posts']['post']
    delete_op = schema['paths']['/api/v1/web-service/posts/{slug}']['delete']

    assert list_op['summary'] == 'List posts'
    assert 'public' in list_op['description'].lower()
    assert 'x-internal-api-secret' in str(list_op)
    assert summary_op['summary'] == 'List post summaries'
    assert 'body' not in str(summary_op).lower()

    assert create_op['summary'] == 'Create post'
    assert '401' in create_op['responses']
    assert '409' in create_op['responses']
    assert 'tag' in str(list_op)
    assert 'tag_match' in str(list_op)

    assert delete_op['summary'] == 'Delete post'
    assert delete_op['responses']['204']['description'] == 'Post deleted'


def test_media_operations_document_upload_flow_and_proxy_headers() -> None:
    schema = _openapi()
    upload_url_op = schema['paths']['/api/v1/web-service/media/upload-url']['post']
    register_op = schema['paths']['/api/v1/web-service/media']['post']
    proxy_op = schema['paths']['/api/v1/web-service/media/upload-proxy']['post']

    assert upload_url_op['summary'] == 'Create upload URL'
    assert register_op['summary'] == 'Register uploaded media'
    assert proxy_op['summary'] == 'Proxy upload to object storage'
    assert 'x-upload-url' in str(proxy_op)
    assert '502' in proxy_op['responses']


def test_post_and_media_component_schemas_have_field_descriptions() -> None:
    schema = _openapi()
    post_create = schema['components']['schemas']['PostCreate']['properties']
    post_read = schema['components']['schemas']['PostRead']['properties']
    post_summary = schema['components']['schemas']['PostSummaryRead']['properties']
    media_upload = schema['components']['schemas']['MediaUploadRequest']['properties']

    assert post_create['slug']['description'] == 'URL-friendly unique post identifier.'
    assert 'example' in post_create['title']
    assert post_create['tags']['description'] == 'Tag slug list assigned to this post.'
    assert post_create['series_title']['description'] == 'Optional series title selected in writer publish settings.'
    assert post_create['locale']['description'] == 'Locale code for this stored post variant.'
    assert post_read['tags']['description'] == 'Normalized tag objects assigned to this post.'
    assert post_read['comment_count']['description'] == 'Total comments linked to this post.'
    assert post_read['locale']['description'] == 'Locale code for this stored post variant.'
    assert post_read['translation_group_id']['description'] == 'Shared translation group identifier for sibling locale variants.'
    assert 'body_markdown' not in post_summary
    assert post_summary['comment_count']['description'] == 'Total comments linked to this post.'
    assert post_summary['locale']['description'] == 'Locale code for this stored post variant.'
    assert media_upload['filename']['description'] == 'Original file name from client.'
    assert 'example' in media_upload['mime_type']


def test_openapi_has_tag_descriptions_for_health_posts_media_and_tags() -> None:
    schema = _openapi()
    tags = {tag['name']: tag for tag in schema['tags']}

    assert 'health' in tags
    assert 'posts' in tags
    assert 'media' in tags
    assert 'tags' in tags
    assert 'comments' in tags
    assert 'liveness' in tags['health']['description'].lower()


def test_openapi_includes_tags_endpoints_metadata() -> None:
    schema = _openapi()
    list_op = schema['paths']['/api/v1/web-service/tags']['get']
    create_op = schema['paths']['/api/v1/web-service/tags']['post']
    patch_op = schema['paths']['/api/v1/web-service/tags/{slug}']['patch']
    delete_op = schema['paths']['/api/v1/web-service/tags/{slug}']['delete']

    assert list_op['summary'] == 'List tags'
    assert create_op['summary'] == 'Create tag'
    assert patch_op['summary'] == 'Update tag'
    assert delete_op['summary'] == 'Delete tag'
    assert '401' in create_op['responses']
    assert '409' in create_op['responses']


def test_openapi_includes_comment_endpoints_metadata() -> None:
    schema = _openapi()
    list_op = schema['paths']['/api/v1/web-service/posts/{slug}/comments']['get']
    create_op = schema['paths']['/api/v1/web-service/posts/{slug}/comments']['post']
    patch_op = schema['paths']['/api/v1/web-service/comments/{comment_id}']['patch']
    delete_op = schema['paths']['/api/v1/web-service/comments/{comment_id}']['delete']
    admin_op = schema['paths']['/api/v1/web-service/admin/comments']['get']

    assert list_op['summary'] == 'List post comments'
    assert create_op['summary'] == 'Create post comment'
    assert patch_op['summary'] == 'Update comment'
    assert delete_op['summary'] == 'Delete comment'
    assert admin_op['summary'] == 'List admin comments'
    assert '401' in admin_op['responses']

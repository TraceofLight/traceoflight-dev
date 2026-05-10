mod common;

use sqlx::PgPool;

use common::{
    app::spawn_test_app,
    factories::PostFactory,
    http::{body_bytes, body_json},
};

use traceoflight_api::posts::PostLocale;

#[sqlx::test(migrations = false)]
async fn list_posts_returns_empty_when_db_is_empty(pool: PgPool) {
    let app = spawn_test_app(pool).await;
    let res = app.get("/posts").await;
    let (status, body) = body_json(res).await;
    assert_eq!(status, 200);
    let arr = body.as_array().expect("posts list is JSON array");
    assert!(arr.is_empty(), "expected empty array, got {arr:?}");
}

#[sqlx::test(migrations = false)]
async fn get_post_by_slug_returns_seeded_row(pool: PgPool) {
    let app = spawn_test_app(pool).await;
    let seeded = PostFactory::new()
        .title("Hello World")
        .slug("hello-world")
        .create(&app.pool)
        .await;

    let res = app.get(&format!("/posts/{}", seeded.slug)).await;
    let (status, body) = body_json(res).await;
    assert_eq!(status, 200);
    assert_eq!(body["slug"].as_str(), Some("hello-world"));
    assert_eq!(body["title"].as_str(), Some("Hello World"));
}

#[sqlx::test(migrations = false)]
async fn create_post_with_existing_slug_returns_409(pool: PgPool) {
    let app = spawn_test_app(pool).await;
    PostFactory::new()
        .title("Original")
        .slug("collision")
        .create(&app.pool)
        .await;

    // create_post is internal-secret-gated, so we use the helper that injects
    // the X-Internal-API-Secret header.
    let payload = serde_json::json!({
        "title": "Duplicate",
        "slug": "collision",
        "body_markdown": ""
    });
    let res = app.post_json_with_internal_secret("/posts", &payload).await;
    let (status, _body) = body_json(res).await;
    assert_eq!(status, 409);
}

#[sqlx::test(migrations = false)]
async fn list_posts_hides_drafts_from_public_callers(pool: PgPool) {
    let app = spawn_test_app(pool).await;
    PostFactory::new()
        .title("Public Post")
        .slug("public-post")
        .create(&app.pool)
        .await;
    PostFactory::new()
        .title("Hidden Draft")
        .slug("hidden-draft")
        .draft()
        .create(&app.pool)
        .await;

    // Public caller — no internal secret header.
    let res = app.get("/posts").await;
    let (status, body) = body_json(res).await;
    assert_eq!(status, 200);
    let slugs: Vec<&str> = body
        .as_array()
        .unwrap()
        .iter()
        .map(|v| v["slug"].as_str().unwrap())
        .collect();
    assert!(slugs.contains(&"public-post"));
    assert!(
        !slugs.contains(&"hidden-draft"),
        "draft leaked to public list: {slugs:?}"
    );
}

#[sqlx::test(migrations = false)]
async fn update_translated_post_returns_403(pool: PgPool) {
    let app = spawn_test_app(pool).await;
    let source = PostFactory::new()
        .title("Korean Source")
        .slug("ko-source")
        .create(&app.pool)
        .await;
    PostFactory::new()
        .title("English Translation")
        .slug("en-source")
        .locale(PostLocale::En)
        .translation_group_id(source.translation_group_id)
        .source_post_id(source.id)
        .create(&app.pool)
        .await;

    let payload = serde_json::json!({
        "title": "Updated Translation",
        "slug": "en-source",
        "body_markdown": "updated",
        "locale": "en",
        "status": "published",
        "visibility": "public",
        "content_kind": "blog"
    });
    let res = app
        .put_json_with_internal_secret("/posts/en-source", &payload)
        .await;
    let (status, body) = body_json(res).await;

    assert_eq!(status, 403);
    assert_eq!(
        body["detail"].as_str(),
        Some("translated posts cannot be modified directly")
    );
}

#[sqlx::test(migrations = false)]
async fn delete_translated_post_returns_403_and_keeps_translation_group(pool: PgPool) {
    let app = spawn_test_app(pool).await;
    let source = PostFactory::new()
        .title("Korean Source")
        .slug("ko-delete-source")
        .create(&app.pool)
        .await;
    PostFactory::new()
        .title("English Translation")
        .slug("en-delete-source")
        .locale(PostLocale::En)
        .translation_group_id(source.translation_group_id)
        .source_post_id(source.id)
        .create(&app.pool)
        .await;

    let res = app
        .delete_with_internal_secret("/posts/en-delete-source")
        .await;
    let (status, body_bytes) = body_bytes(res).await;

    assert_eq!(status, 403);
    let body: serde_json::Value =
        serde_json::from_slice(&body_bytes).expect("403 response body is JSON");
    assert_eq!(
        body["detail"].as_str(),
        Some("translated posts cannot be modified directly")
    );

    let source_res = app.get("/posts/ko-delete-source").await;
    let (source_status, source_body) = body_json(source_res).await;
    assert_eq!(source_status, 200);
    assert_eq!(source_body["slug"].as_str(), Some("ko-delete-source"));
}

#[sqlx::test(migrations = false)]
async fn retranslate_translated_post_clears_cached_source_hash(pool: PgPool) {
    let app = spawn_test_app(pool).await;
    let source = PostFactory::new()
        .title("Korean Source")
        .slug("ko-retranslate-source")
        .create(&app.pool)
        .await;
    PostFactory::new()
        .title("English Translation")
        .slug("en-retranslate-source")
        .locale(PostLocale::En)
        .translation_group_id(source.translation_group_id)
        .source_post_id(source.id)
        .translated_from_hash("already-current")
        .create(&app.pool)
        .await;

    let payload = serde_json::json!({ "locale": "en" });
    let res = app
        .post_json_with_internal_secret("/posts/en-retranslate-source/retranslate", &payload)
        .await;
    let (status, _body_bytes) = body_bytes(res).await;

    assert_eq!(status, 202);

    let hash: Option<String> =
        sqlx::query_scalar("SELECT translated_from_hash FROM posts WHERE slug = $1")
            .bind("en-retranslate-source")
            .fetch_one(&app.pool)
            .await
            .expect("query translated hash");
    assert_eq!(hash, None);
}

#[sqlx::test(migrations = false)]
async fn retranslate_ko_source_post_returns_403(pool: PgPool) {
    let app = spawn_test_app(pool).await;
    PostFactory::new()
        .title("Korean Source")
        .slug("ko-retranslate-blocked")
        .create(&app.pool)
        .await;

    let payload = serde_json::json!({ "locale": "ko" });
    let res = app
        .post_json_with_internal_secret("/posts/ko-retranslate-blocked/retranslate", &payload)
        .await;
    let (status, body_bytes) = body_bytes(res).await;

    assert_eq!(status, 403);
    let body: serde_json::Value =
        serde_json::from_slice(&body_bytes).expect("403 response body is JSON");
    assert_eq!(
        body["detail"].as_str(),
        Some("source posts cannot be retranslated")
    );
}

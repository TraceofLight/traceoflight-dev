mod common;

use sqlx::PgPool;

use common::{
    app::spawn_test_app,
    factories::PostFactory,
    http::body_json,
};

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

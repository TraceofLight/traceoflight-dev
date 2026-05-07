# Rust 백엔드 TDD 셋업 + CI 게이트

**Status:** draft
**Date:** 2026-05-07
**Scope:** `apps/api/` (Rust/axum 백엔드) 테스트 인프라 신설 + `Jenkinsfile.backend` / `Jenkinsfile.frontend`에 테스트 게이트 추가

## 동기

`apps/api/`는 axum 마이그레이션 직후 상태로 테스트가 0개다. 한편 `apps/web/`은 vitest + node:test 기반 테스트가 이미 존재하지만 CI에서 게이트되지 않는다. 결과적으로 두 앱 모두 "테스트 깨진 채로 배포 가능"한 상태다. 이 문서는 두 가지를 동시에 해결한다.

1. Rust 백엔드에 pytest 스타일의 TDD 사이클을 받쳐주는 인프라를 만든다 — 유닛 테스트(`#[cfg(test)] mod tests`)와 통합 테스트(`tests/` 디렉터리, 실 Postgres/Redis/MinIO 사용)를 동일 `cargo test`로 굴린다.
2. 양쪽 Jenkinsfile에 테스트 단계를 추가해 깨진 테스트가 빌드/배포로 흘러가지 못하게 막는다.

## 비범위

- 17개 모듈 일괄 테스트화. 인프라와 vertical slice(`posts`) 한 개까지가 이 spec의 종착점. 나머지 모듈은 평소 작업하면서 같은 패턴으로 점진 추가.
- mock/stub 도입. 실 Postgres/Redis/MinIO를 그대로 쓴다.
- `testcontainers-rs`. 이미 docker-compose로 인프라를 운영하므로 컨테이너를 테스트가 직접 띄우는 패턴은 중복.
- 커버리지 도구(`cargo-llvm-cov`), property-based testing(`proptest`). 별 작업.
- Jenkins agent에 Rust 툴체인 / bun을 설치하는 셋업. 사전 설치 가정이며 없으면 별 작업.

## 설계

### 1. 크레이트 구조 — lib + bin 분리

현재 `apps/api/`는 바이너리 전용 크레이트로 `main.rs`(~80KB)에 모듈 선언, 라우터 빌드, 부팅 로직이 모두 들어 있다. Rust의 `tests/` 디렉터리는 외부 크레이트 입장에서 컴파일되므로 `traceoflight_api::build_router(state)`처럼 import할 공개 API가 필요하고, 이를 위해 lib + bin 듀얼 타깃으로 분리한다.

**Cargo.toml 변경:**
```toml
[lib]
name = "traceoflight_api"
path = "src/lib.rs"

[[bin]]
name = "traceoflight-api"
path = "src/main.rs"
```

**디렉터리:**
```
apps/api/
├── Cargo.toml         # [lib] + [[bin]] 둘 다 명시
├── src/
│   ├── lib.rs         # 신규: mod 선언 + pub fn build_router + pub struct AppState
│   ├── main.rs        # 슬림화: lib import, .env 읽고 build_router 호출
│   ├── admin_auth.rs  # 기존 그대로
│   └── ...            # 나머지 16개 모듈 그대로
└── tests/             # 신규
    ├── common/        # cargo 컨벤션상 자동 빌드 안 됨 (각 테스트가 `mod common;`)
    │   ├── mod.rs
    │   ├── app.rs       # spawn_test_app(pool) -> TestApp
    │   ├── factories.rs # PostFactory 등
    │   └── http.rs      # oneshot 래퍼
    ├── smoke.rs       # 인프라 살아있음 검증용 1개 테스트
    └── posts.rs       # vertical slice
```

**핸들러 영향:** 핸들러 함수 시그니처는 변경하지 않는다. `mod` 선언이 `main.rs`에서 `lib.rs`로 이동하면서 핸들러에 `pub`만 추가한다. 빌드 동작은 동일.

**`main.rs`의 슬림화:** 부팅에 필요한 코드(`#[tokio::main]`, `Settings::from_env()`, `PgPoolOptions`, `build_router(state)`, `axum::serve(listener, router)`)만 남긴다.

### 2. Redis 키 prefix 주입 (작은 리팩토링)

`admin_auth::RefreshStore`가 `format!("admin:refresh:{jti}")`로 prefix를 하드코딩하고 있어 병렬 통합 테스트 격리에 걸림돌이 된다. `RefreshStore`에 `key_prefix: String` 필드를 추가해 키 생성을 `format!("{prefix}admin:refresh:{jti}")`로 바꾼다.

- 프로덕션에서는 `key_prefix=""`로 하위호환 유지. 기존 키 포맷이 그대로 보존됨.
- `Settings`에 `redis_key_prefix: String` (기본 `""`) 추가. 환경변수 `REDIS_KEY_PREFIX`로 노출.
- `spawn_test_app`은 `test:{uuid}:` 형태로 채워 넣음.

MinIO는 `MinioSettings.bucket`이 이미 주입식이라 변경 불필요.

향후 새로 Redis를 쓰는 코드가 추가될 때 동일 prefix 규칙을 따르도록 `lib.rs` 상단에 짧은 주석으로 명시한다.

### 3. 테스트 인프라

**`#[sqlx::test]` 매크로 동작:**
1. 환경변수 `DATABASE_URL`이 가리키는 DB(템플릿)에 붙는다.
2. 테스트 시작 시 `CREATE DATABASE _sqlx_test_<uuid> TEMPLATE <원본>`으로 fresh DB 복제.
3. `apps/api/migrations/`의 마이그레이션을 새 DB에 적용.
4. 새 DB의 `PgPool`을 테스트 인자로 주입.
5. 테스트 종료 후 자동 drop (환경변수 `SQLX_TEST_KEEP_DB=true`로 보존 가능).

**`tests/common/app.rs`:**
```rust
pub struct TestApp {
    pub router: Router,
    pub pool: PgPool,
    pub redis_prefix: String,
    pub s3_bucket: String,
}

pub async fn spawn_test_app(pool: PgPool) -> TestApp {
    let redis_prefix = format!("test:{}:", Uuid::new_v4());
    let s3_bucket = format!("test-{}", Uuid::new_v4());
    // 테스트용 MinIO 버킷 생성 (rusty-s3 CreateBucket)
    // RefreshStore::new(conn, redis_prefix.clone()) 등 state 빌드
    let state = build_test_state(pool.clone(), &redis_prefix, &s3_bucket).await;
    let router = traceoflight_api::build_router(state);
    TestApp { router, pool, redis_prefix, s3_bucket }
}
```

**HTTP 헬퍼 (pytest TestClient 대응):**
```rust
impl TestApp {
    pub async fn get(&self, path: &str) -> Response<Body> { /* tower::ServiceExt::oneshot */ }
    pub async fn post_json(&self, path: &str, body: impl Serialize) -> Response<Body> { ... }
    pub fn with_admin_auth(self, token: &str) -> Self { ... }
}
```

**팩토리 (pytest factory_boy / model_bakery 대응):**
```rust
pub struct PostFactory { /* sensible defaults */ }
impl PostFactory {
    pub fn new() -> Self { ... }
    pub fn title(mut self, v: impl Into<String>) -> Self { ... }
    pub fn draft(mut self) -> Self { ... }
    pub async fn create(self, pool: &PgPool) -> PostRead { /* INSERT ... RETURNING */ }
}
```

초기에는 `PostFactory` 하나만 만들고, 다른 모듈로 확장될 때 `SeriesFactory`, `CommentFactory` 등을 같은 패턴으로 추가한다.

**유닛 테스트:** 각 모듈 끝에 `#[cfg(test)] mod tests` 블록. 외부 의존성 0인 함수만 대상 — 슬러그 정규화, projection 알고리즘, 검증 함수 등.

### 4. 외부 서비스 격리 및 정리 정책

**병렬 안전성:** `cargo test`는 기본적으로 병렬 실행한다. 격리 수단:
- Postgres: `#[sqlx::test]`가 매 테스트마다 별 DB → 자동 격리.
- Redis: 테스트마다 `test:{uuid}:` prefix → 키 충돌 없음.
- MinIO: 테스트마다 `test-{uuid}` 버킷 → 객체 충돌 없음.

`--test-threads=1` 옵션 불필요.

**정리 정책:** 안 함.
- Postgres: sqlx::test가 자동 drop.
- Redis: 키 TTL은 짧고 prefix가 UUID라 다음 실행과 충돌 없음. 자연 expire에 맡김.
- MinIO: 버킷이 leak되지만 prefix가 UUID라 격리에는 영향 없음. 디스크 위생이 필요하면 `docker compose down -v`.

이유: panic 시 누수도 생기고 cleanup 코드가 시끄러워진다. 격리 보장은 prefix/UUID로 끝났으므로 cleanup은 디스크 위생일 뿐이고, 그건 인프라 리셋으로 일괄 처리한다.

### 5. 테스트 실행 환경

**로컬:**
- `infra/docker/infra/docker-compose.yml`을 띄움 (이미 운영 흐름).
- 환경변수: `DATABASE_URL`(테스트 템플릿 DB), `REDIS_URL`, `MINIO_ENDPOINT/ACCESS_KEY/SECRET_KEY` 지정. `apps/api/.env.test.example` 제공.
- 빈 템플릿 DB 한 번 생성 + 마이그레이션 적용: `apps/api/scripts/setup-test-db.sh`(POSIX) 또는 `setup-test-db.ps1`(Windows). idempotent.
- `cargo test`로 유닛+통합 한 번에 실행. `cargo test --test posts`는 `tests/posts.rs`만.

**CI (Jenkins):** 별도 mock 인프라 없음. `Verify Infra Running` 단계가 이미 docker 인프라 살아있음을 확인하므로 같은 컨테이너 재사용. 단 테스트는 별 DB(`traceoflight_test`)에 붙고 prod DB는 건드리지 않는다.

### 6. 도입 순서

이번 spec의 종착점은 **단계 1~5까지**. 단계 6 이후는 평소 작업으로 흡수.

1. **백엔드 크레이트 분리** (코드 동작 변경 0): `lib.rs` 신설, 모듈 선언/`build_router`/`AppState`를 옮기고 `pub` 처리. `main.rs`는 thin entrypoint로 축소. `RefreshStore`에 `key_prefix` 필드 추가. `cargo build --release`로 기존 동작 무사 확인.
2. **테스트 인프라**: `tests/common/{mod.rs, app.rs, factories.rs, http.rs}` 신설. `spawn_test_app` 구현. `PostFactory` 한 개. `apps/api/.env.test.example` 추가. `apps/api/scripts/setup-test-db.{sh,ps1}` 추가. **smoke test 1개** (`tests/smoke.rs`: `GET /api/v1/web-service/health` 200) 작성/통과.
3. **`posts` vertical slice TDD**: 통합 테스트 4개(empty list, create→get, slug collision 409, draft hidden) + 유닛 테스트 1~2개(슬러그 정규화 등). 이 슬라이스가 도는 순간 패턴 확정.
4. **`Jenkinsfile.backend`에 `Test Backend` stage 추가**: `Verify Infra Running` 다음, `Build Backend Image` 이전.
5. **`Jenkinsfile.frontend`에 `Test Frontend` stage 추가**: `Prepare Frontend Env` 다음, `Build Frontend Image` 이전. 명령은 `bun install --frozen-lockfile && bun run test`.
6. (이번 spec 범위 밖) 다른 백엔드 모듈은 평소 작업하면서 같은 패턴으로 추가. 새 기능은 TDD로(테스트 먼저 → 실패 → 구현 → 통과).

### 7. CI Jenkinsfile 변경 (구체)

**`Jenkinsfile.backend`** — 새 stage:
```groovy
stage('Test Backend') {
  steps {
    dir('apps/api') {
      sh '''
        ./scripts/setup-test-db.sh
        DATABASE_URL="$TEST_DATABASE_URL" cargo test --locked
      '''
    }
  }
}
```
배치: `Verify Infra Running` 다음, `Build Backend Image` 이전.

`TEST_DATABASE_URL`은 Jenkins credential 또는 `.env.api`에서 읽는 별 항목으로 주입. 마이그레이션 적용된 빈 템플릿 DB(`traceoflight_test`)를 가리킨다.

**`Jenkinsfile.frontend`** — 새 stage:
```groovy
stage('Test Frontend') {
  steps {
    dir('apps/web') {
      sh 'bun install --frozen-lockfile'
      sh 'bun run test'
    }
  }
}
```
배치: `Prepare Frontend Env` 다음, `Build Frontend Image` 이전.

`bun run test`는 typecheck + node:test guards + vitest UI + node:test admin-auth를 모두 포함한다(이미 정의됨).

## 트레이드오프 및 결정 사유

**왜 sqlx::test (템플릿 DB clone)이고 트랜잭션 롤백이 아닌가:**
현재 핸들러들은 모두 `PgPool`을 받는다. 트랜잭션 롤백 패턴을 쓰면 모든 핸들러를 `&mut Transaction`을 받도록 시그니처 변경해야 한다 — 큰 침습. 또한 `imports.rs`처럼 자체 BEGIN/COMMIT을 쓰는 코드가 깨지고, MinIO 쪽 부수효과는 어차피 롤백 불가. 템플릿 clone은 Postgres 내부 파일 복사라 ms 단위로 빠르고, 진짜 격리를 제공하며, 핸들러 시그니처를 건드리지 않는다.

**왜 `tests/common/`이고 lib feature-gate가 아닌가:**
`tests/common/mod.rs` 컨벤션은 cargo 공식 가이드 패턴이고, *Zero to Production in Rust*가 쓰는 방식이다. lib 안 feature-gated 모듈은 헬퍼가 lib 내부 private 타입에 접근해야 할 때 쓴다 — 우리 팩토리는 `PgPool`에 SQL을 던지는 게 거의 다라 그 필요가 없다.

**왜 mock 안 쓰는가:**
도커 인프라가 이미 운영되고 있어 실 서비스 의존성 비용이 거의 0이다. mock은 일관성 깨질 위험만 추가하고 얻는 게 거의 없다. 실 Postgres가 마이그레이션, SQL 문법, 직렬화까지 한 번에 검증해 회귀 방지에 강하다.

**왜 vertical slice가 `posts`인가:**
`posts.rs`는 가장 큰 모듈이고(58KB) 슬러그 리다이렉트, 필터, 페이지네이션, locale 등 다양한 패턴이 모여 있어 인프라 검증에 적합하다. 여기서 도는 헬퍼는 다른 모듈에 그대로 복사된다.

## 종속성 / 전제

- Jenkins agent에 Rust 툴체인(`cargo`, `rustc`)과 `bun` 사전 설치. 미설치면 별 작업으로 셋업.
- 로컬 개발자는 `infra/docker/infra/docker-compose.yml`을 띄울 수 있어야 함 (이미 기존 흐름).
- Postgres가 `CREATE DATABASE ... TEMPLATE` 권한을 가진 유저로 접속해야 함 (현재 `traceoflight` 유저는 superuser가 아니지만 자기가 만든 템플릿 DB의 `OWNER`라면 가능). 권한 부족 시 setup-test-db 스크립트가 실패하므로 1단계에서 검증.

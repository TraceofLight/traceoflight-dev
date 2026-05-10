use sea_orm::{DatabaseConnection, DbErr, RuntimeErr};

pub type Db = DatabaseConnection;

pub fn from_sqlx_pool(pool: &sqlx::PgPool) -> Db {
    sea_orm::SqlxPostgresConnector::from_sqlx_postgres_pool(pool.clone())
}

pub fn pg_error_code(err: &DbErr) -> Option<String> {
    let runtime = match err {
        DbErr::Conn(runtime) | DbErr::Exec(runtime) | DbErr::Query(runtime) => runtime,
        _ => return None,
    };
    let RuntimeErr::SqlxError(sqlx_err) = runtime else {
        return None;
    };
    sqlx_err
        .as_database_error()
        .and_then(|db_err| db_err.code())
        .map(|code| code.into_owned())
}

pub fn pg_constraint(err: &DbErr) -> Option<String> {
    let runtime = match err {
        DbErr::Conn(runtime) | DbErr::Exec(runtime) | DbErr::Query(runtime) => runtime,
        _ => return None,
    };
    let RuntimeErr::SqlxError(sqlx_err) = runtime else {
        return None;
    };
    sqlx_err
        .as_database_error()
        .and_then(|db_err| db_err.constraint())
        .map(str::to_owned)
}

pub fn unique_violation(err: &DbErr) -> bool {
    pg_error_code(err).as_deref() == Some("23505")
}

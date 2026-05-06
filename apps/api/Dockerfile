FROM rust:1-bookworm AS builder
WORKDIR /build

# Toolchain image already includes cargo + rustc + system libs (libssl, etc).
# Manifest layer first so cargo's dep cache survives source-only edits.
COPY Cargo.toml Cargo.lock ./
COPY src ./src
COPY migrations ./migrations

RUN cargo build --release

FROM debian:bookworm-slim AS runtime
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=builder /build/target/release/traceoflight-api /app/traceoflight-api

ENV RUST_LOG=info
ENV API_PORT=6101
EXPOSE 6101

CMD ["/app/traceoflight-api"]

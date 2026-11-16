# ── Stage 1: generate a dependency recipe ──────────────────────────
FROM rust:1-bookworm AS chef
RUN cargo install cargo-chef
WORKDIR /app

FROM chef AS planner
COPY Cargo.toml Cargo.lock ./
COPY src/ src/
RUN cargo chef prepare --recipe-path recipe.json

# ── Stage 2: build dependencies (cached unless Cargo.toml/lock change) ─
FROM chef AS builder
COPY --from=planner /app/recipe.json recipe.json
RUN cargo chef cook --release --recipe-path recipe.json

COPY Cargo.toml Cargo.lock ./
COPY src/ src/
COPY migrations/ migrations/
RUN cargo build --release --bin youtube-ai-blocker-backend

# ── Stage 3: minimal runtime image ────────────────────────────────
FROM debian:bookworm-slim AS runtime
# curl is used by the container health check (GET /api/health)
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=builder /app/target/release/youtube-ai-blocker-backend .
COPY migrations/ migrations/
COPY static/ static/

ENV PORT=3000
EXPOSE 3000

CMD ["./youtube-ai-blocker-backend"]

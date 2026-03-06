use axum::routing::{get, post};
use axum::Router;
use youtube_ai_blocker_backend::cache::VideoCache;
use youtube_ai_blocker_backend::config::Config;
use youtube_ai_blocker_backend::handlers;
use youtube_ai_blocker_backend::rate_limit::RateLimiter;
use youtube_ai_blocker_backend::AppState;
use sqlx::postgres::PgPoolOptions;
use tower_http::cors::{AllowHeaders, AllowMethods, AllowOrigin, CorsLayer};
use tower_http::services::ServeDir;
use tower_http::trace::TraceLayer;
use tracing::Level;
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() {
    let default_level = if cfg!(debug_assertions) { "debug" } else { "info" };
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::from_default_env()
                .add_directive(default_level.parse().unwrap())
                .add_directive("sqlx::query=warn".parse().unwrap()),
        )
        .init();

    let cfg = Config::from_env();

    let pool = PgPoolOptions::new()
        .max_connections(20)
        .min_connections(2)
        .connect(&cfg.database_url)
        .await
        .expect("Failed to connect to database");

    tracing::info!("Running migrations...");
    sqlx::migrate!("./migrations")
        .run(&pool)
        .await
        .expect("Failed to run migrations");

    let state = AppState {
        pool,
        cache: VideoCache::new(cfg.cache_ttl_secs),
        rate_limiter: RateLimiter::new(),
    };

    let cors = CorsLayer::new()
        .allow_origin(if cfg!(debug_assertions) {
            tracing::info!("Dev mode: allowing all CORS origins");
            AllowOrigin::any()
        } else {
            AllowOrigin::list([
                "https://www.youtube.com".parse().unwrap(),
                "https://youtube.com".parse().unwrap(),
            ])
        })
        .allow_methods(AllowMethods::any())
        .allow_headers(AllowHeaders::any());

    let mut app = Router::new()
        .route("/api/health", get(handlers::health))
        .route("/api/videos/batch", get(handlers::get_videos_batch))
        .route("/api/videos/{video_id}", get(handlers::get_video_single))
        .route("/api/report", post(handlers::submit_report))
        .route("/api/stats", get(handlers::get_stats))
        .route("/api/recent", get(handlers::get_recent))
        .fallback_service(ServeDir::new("static").append_index_html_on_directories(true))
        .layer(cors);

    if cfg!(debug_assertions) {
        tracing::info!("Dev mode: request/response logging enabled");
        app = app.layer(
            TraceLayer::new_for_http()
                .make_span_with(tower_http::trace::DefaultMakeSpan::new().level(Level::INFO))
                .on_response(tower_http::trace::DefaultOnResponse::new().level(Level::INFO)),
        );
    }

    let app = app.with_state(state);

    let addr = format!("0.0.0.0:{}", cfg.port);
    tracing::info!("Listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await
        .unwrap();
}

async fn shutdown_signal() {
    tokio::signal::ctrl_c()
        .await
        .expect("Failed to install Ctrl+C handler");
    tracing::info!("Shutting down...");
}

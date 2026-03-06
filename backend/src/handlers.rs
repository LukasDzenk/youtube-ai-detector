use axum::extract::{Path, Query, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::Json;
use chrono::{DateTime, Utc};
use std::collections::HashMap;
use uuid::Uuid;

use crate::db;
use crate::models::*;
use crate::AppState;

pub async fn health(
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>, (StatusCode, &'static str)> {
    sqlx::query("SELECT 1")
        .execute(&state.pool)
        .await
        .map_err(|_| (StatusCode::SERVICE_UNAVAILABLE, "Database unreachable"))?;

    Ok(Json(serde_json::json!({ "status": "ok" })))
}

fn parse_install_id(headers: &HeaderMap) -> Result<Uuid, (StatusCode, &'static str)> {
    let header_val = headers
        .get("x-install-id")
        .ok_or((StatusCode::BAD_REQUEST, "Missing X-Install-Id header"))?
        .to_str()
        .map_err(|_| (StatusCode::BAD_REQUEST, "Invalid X-Install-Id header"))?;

    tracing::debug!(raw_install_id = header_val, "Parsing install ID");

    Uuid::parse_str(header_val)
        .map_err(|_| (StatusCode::BAD_REQUEST, "X-Install-Id must be a valid UUID"))
}

pub async fn get_videos_batch(
    State(state): State<AppState>,
    Query(query): Query<BatchQuery>,
) -> Result<Json<BatchVideoResponse>, (StatusCode, &'static str)> {
    let ids: Vec<String> = query
        .ids
        .split(',')
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty() && s.len() <= 16)
        .collect();

    tracing::debug!(count = ids.len(), ids = ?ids, "Batch request");

    if ids.is_empty() {
        return Ok(Json(BatchVideoResponse {
            videos: HashMap::new(),
        }));
    }

    if ids.len() > 50 {
        tracing::debug!(count = ids.len(), "Batch request rejected: too many IDs");
        return Err((StatusCode::BAD_REQUEST, "Maximum 50 video IDs per request"));
    }

    let mut result: HashMap<String, VideoInfo> = HashMap::new();
    let mut cache_misses: Vec<String> = Vec::new();

    for id in &ids {
        if let Some(cached) = state.cache.get(id) {
            result.insert(id.clone(), cached);
        } else {
            cache_misses.push(id.clone());
        }
    }

    tracing::debug!(
        cache_hits = result.len(),
        cache_misses = cache_misses.len(),
        "Batch cache lookup"
    );

    if !cache_misses.is_empty() {
        let db_results = db::fetch_videos_batch(&state.pool, &cache_misses)
            .await
            .map_err(|e| {
                tracing::debug!(error = %e, "Batch DB query failed");
                (StatusCode::INTERNAL_SERVER_ERROR, "Database error")
            })?;

        tracing::debug!(db_rows = db_results.len(), "Batch DB results");

        for (vid, info) in db_results {
            state.cache.set(vid.clone(), info.clone());
            result.insert(vid, info);
        }
    }

    let response = BatchVideoResponse { videos: result };
    tracing::debug!(body = ?response, "Batch response");
    Ok(Json(response))
}

pub async fn get_video_single(
    State(state): State<AppState>,
    Path(video_id): Path<String>,
) -> Result<Json<SingleVideoResponse>, (StatusCode, &'static str)> {
    tracing::debug!(video_id = %video_id, "Single video request");

    if video_id.len() > 16 {
        return Err((StatusCode::BAD_REQUEST, "Invalid video ID"));
    }

    if let Some(cached) = state.cache.get(&video_id) {
        tracing::debug!(video_id = %video_id, "Cache hit");
        return Ok(Json(SingleVideoResponse {
            video_id,
            info: cached,
        }));
    }

    tracing::debug!(video_id = %video_id, "Cache miss, querying DB");

    let info = db::fetch_video_single(&state.pool, &video_id)
        .await
        .map_err(|e| {
            tracing::debug!(video_id = %video_id, error = %e, "Single video DB query failed");
            (StatusCode::INTERNAL_SERVER_ERROR, "Database error")
        })?
        .unwrap_or(VideoInfo {
            report_count: 0,
            is_ai: false,
        });

    state.cache.set(video_id.clone(), info.clone());

    let response = SingleVideoResponse { video_id, info };
    tracing::debug!(body = ?response, "Single video response");
    Ok(Json(response))
}

pub async fn submit_report(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<ReportRequest>,
) -> Result<Json<ReportResponse>, (StatusCode, &'static str)> {
    let install_id = parse_install_id(&headers)?;

    tracing::debug!(
        video_id = %payload.video_id,
        install_id = %install_id,
        "Report submission"
    );

    if payload.video_id.is_empty() || payload.video_id.len() > 16 {
        return Err((StatusCode::BAD_REQUEST, "Invalid video ID"));
    }

    if !state.rate_limiter.check(install_id) {
        tracing::debug!(install_id = %install_id, "Rate limited");
        return Err((StatusCode::TOO_MANY_REQUESTS, "Rate limit exceeded"));
    }

    let (info, reported) = db::toggle_report(&state.pool, &payload.video_id, install_id)
        .await
        .map_err(|e| {
            tracing::debug!(video_id = %payload.video_id, error = %e, "Report toggle failed");
            (StatusCode::INTERNAL_SERVER_ERROR, "Database error")
        })?;

    tracing::debug!(
        video_id = %payload.video_id,
        report_count = info.report_count,
        is_ai = info.is_ai,
        reported,
        "Report toggled"
    );

    state.cache.invalidate(&payload.video_id);
    state.cache.set(payload.video_id.clone(), info.clone());

    let response = ReportResponse {
        success: true,
        reported,
        info,
    };
    tracing::debug!(body = ?response, "Report response");
    Ok(Json(response))
}

pub async fn get_stats(
    State(state): State<AppState>,
) -> Result<Json<StatsResponse>, (StatusCode, &'static str)> {
    let row = sqlx::query_as::<_, (i64, i64, i64)>(
        "SELECT
           (SELECT COUNT(*) FROM videos) AS total_videos,
           (SELECT COUNT(*) FROM reports) AS total_reports,
           (SELECT COUNT(DISTINCT install_id) FROM reports) AS total_users",
    )
    .fetch_one(&state.pool)
    .await
    .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?;

    let response = StatsResponse {
        total_videos: row.0,
        total_reports: row.1,
        total_users: row.2,
    };
    tracing::debug!(body = ?response, "Stats response");
    Ok(Json(response))
}

pub async fn get_recent(
    State(state): State<AppState>,
) -> Result<Json<RecentResponse>, (StatusCode, &'static str)> {
    let rows = sqlx::query_as::<_, (String, i32, DateTime<Utc>)>(
        "SELECT r.video_id, v.report_count, MAX(r.created_at) AS latest
         FROM reports r
         JOIN videos v ON v.video_id = r.video_id
         WHERE r.created_at > NOW() - INTERVAL '48 hours'
         GROUP BY r.video_id, v.report_count
         HAVING v.report_count > 0
         ORDER BY latest DESC
         LIMIT 20",
    )
    .fetch_all(&state.pool)
    .await
    .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?;

    let reports = rows
        .into_iter()
        .map(|(video_id, report_count, created_at)| RecentReport {
            video_id,
            report_count,
            reported_at: created_at.to_rfc3339(),
        })
        .collect();

    let response = RecentResponse { reports };
    tracing::debug!(body = ?response, "Recent response");
    Ok(Json(response))
}

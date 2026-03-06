use crate::models::VideoInfo;
use crate::threshold::compute_is_ai;
use sqlx::PgPool;
use uuid::Uuid;

pub async fn fetch_videos_batch(
    pool: &PgPool,
    video_ids: &[String],
) -> Result<Vec<(String, VideoInfo)>, sqlx::Error> {
    tracing::debug!(count = video_ids.len(), "DB batch fetch");
    let rows = sqlx::query_as::<_, (String, i32, bool)>(
        "SELECT video_id, report_count, is_ai
         FROM videos
         WHERE video_id = ANY($1)",
    )
    .bind(video_ids)
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(|(vid, count, is_ai)| {
            (vid, VideoInfo { report_count: count, is_ai })
        })
        .collect())
}

pub async fn fetch_video_single(
    pool: &PgPool,
    video_id: &str,
) -> Result<Option<VideoInfo>, sqlx::Error> {
    tracing::debug!(video_id = %video_id, "DB single fetch");
    let row = sqlx::query_as::<_, (i32, bool)>(
        "SELECT report_count, is_ai
         FROM videos
         WHERE video_id = $1",
    )
    .bind(video_id)
    .fetch_optional(pool)
    .await?;

    Ok(row.map(|(count, is_ai)| VideoInfo { report_count: count, is_ai }))
}

/// Toggle report: add if not present, remove if already reported.
/// Returns `(VideoInfo, reported)` where `reported` is the new state.
pub async fn toggle_report(
    pool: &PgPool,
    video_id: &str,
    install_id: Uuid,
) -> Result<(VideoInfo, bool), sqlx::Error> {
    tracing::debug!(video_id = %video_id, install_id = %install_id, "DB toggle report");
    let mut tx = pool.begin().await?;

    sqlx::query(
        "INSERT INTO videos (video_id) VALUES ($1) ON CONFLICT (video_id) DO NOTHING",
    )
    .bind(video_id)
    .execute(&mut *tx)
    .await?;

    let already_reported = sqlx::query_as::<_, (i64,)>(
        "SELECT COUNT(*) FROM reports WHERE video_id = $1 AND install_id = $2",
    )
    .bind(video_id)
    .bind(install_id)
    .fetch_one(&mut *tx)
    .await?
    .0 > 0;

    let reported = if already_reported {
        tracing::debug!(video_id = %video_id, "Removing report");
        sqlx::query(
            "DELETE FROM reports WHERE video_id = $1 AND install_id = $2",
        )
        .bind(video_id)
        .bind(install_id)
        .execute(&mut *tx)
        .await?;

        sqlx::query(
            "UPDATE videos SET report_count = GREATEST(report_count - 1, 0), updated_at = NOW()
             WHERE video_id = $1",
        )
        .bind(video_id)
        .execute(&mut *tx)
        .await?;

        false
    } else {
        tracing::debug!(video_id = %video_id, "New report");
        sqlx::query(
            "INSERT INTO reports (video_id, install_id) VALUES ($1, $2)",
        )
        .bind(video_id)
        .bind(install_id)
        .execute(&mut *tx)
        .await?;

        sqlx::query(
            "UPDATE videos SET report_count = report_count + 1, updated_at = NOW()
             WHERE video_id = $1",
        )
        .bind(video_id)
        .execute(&mut *tx)
        .await?;

        true
    };

    let report_count = sqlx::query_as::<_, (i32,)>(
        "SELECT report_count FROM videos WHERE video_id = $1",
    )
    .bind(video_id)
    .fetch_one(&mut *tx)
    .await?
    .0;

    let is_ai = compute_is_ai(report_count);
    tracing::debug!(video_id = %video_id, report_count, is_ai, reported, "Threshold recomputed");

    sqlx::query("UPDATE videos SET is_ai = $1 WHERE video_id = $2")
        .bind(is_ai)
        .bind(video_id)
        .execute(&mut *tx)
        .await?;

    tx.commit().await?;

    Ok((VideoInfo { report_count, is_ai }, reported))
}

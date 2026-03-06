use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Serialize, Deserialize)]
pub struct ReportRequest {
    pub video_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VideoInfo {
    pub report_count: i32,
    pub is_ai: bool,
}

#[derive(Debug, Serialize)]
pub struct SingleVideoResponse {
    pub video_id: String,
    #[serde(flatten)]
    pub info: VideoInfo,
}

#[derive(Debug, Serialize)]
pub struct BatchVideoResponse {
    pub videos: HashMap<String, VideoInfo>,
}

#[derive(Debug, Deserialize)]
pub struct BatchQuery {
    pub ids: String,
}

#[derive(Debug, Serialize)]
pub struct ReportResponse {
    pub success: bool,
    pub reported: bool,
    #[serde(flatten)]
    pub info: VideoInfo,
}

#[derive(Debug, Serialize)]
pub struct StatsResponse {
    pub total_videos: i64,
    pub total_reports: i64,
    pub total_users: i64,
}

#[derive(Debug, Serialize)]
pub struct RecentReport {
    pub video_id: String,
    pub report_count: i32,
    pub reported_at: String,
}

#[derive(Debug, Serialize)]
pub struct RecentResponse {
    pub reports: Vec<RecentReport>,
}

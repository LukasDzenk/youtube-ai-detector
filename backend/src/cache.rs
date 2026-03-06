use crate::models::VideoInfo;
use dashmap::DashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};

struct CacheEntry {
    info: VideoInfo,
    inserted_at: Instant,
}

pub struct VideoCache {
    entries: DashMap<String, CacheEntry>,
    ttl: Duration,
}

impl VideoCache {
    pub fn new(ttl_secs: u64) -> Arc<Self> {
        Arc::new(Self {
            entries: DashMap::new(),
            ttl: Duration::from_secs(ttl_secs),
        })
    }

    pub fn get(&self, video_id: &str) -> Option<VideoInfo> {
        if self.ttl.is_zero() {
            return None;
        }
        let entry = self.entries.get(video_id)?;
        if entry.inserted_at.elapsed() > self.ttl {
            drop(entry);
            self.entries.remove(video_id);
            tracing::debug!(video_id = %video_id, "Cache expired");
            return None;
        }
        tracing::debug!(video_id = %video_id, "Cache hit");
        Some(entry.info.clone())
    }

    pub fn set(&self, video_id: String, info: VideoInfo) {
        if self.ttl.is_zero() {
            return;
        }
        tracing::debug!(video_id = %video_id, "Cache set");
        self.entries.insert(
            video_id,
            CacheEntry {
                info,
                inserted_at: Instant::now(),
            },
        );
    }

    pub fn invalidate(&self, video_id: &str) {
        if self.entries.remove(video_id).is_some() {
            tracing::debug!(video_id = %video_id, "Cache invalidated");
        }
    }
}

ALTER TABLE videos DROP COLUMN ai_yes_count;
ALTER TABLE videos DROP COLUMN ai_no_count;
ALTER TABLE videos ADD COLUMN report_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE votes DROP COLUMN vote;
ALTER TABLE votes RENAME TO reports;

ALTER INDEX idx_votes_video_id RENAME TO idx_reports_video_id;
ALTER INDEX idx_votes_install_id RENAME TO idx_reports_install_id;
ALTER INDEX votes_video_id_install_id_key RENAME TO reports_video_id_install_id_key;

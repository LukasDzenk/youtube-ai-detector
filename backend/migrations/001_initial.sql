CREATE TABLE videos (
    video_id       VARCHAR(16) PRIMARY KEY,
    ai_yes_count   INTEGER NOT NULL DEFAULT 0,
    ai_no_count    INTEGER NOT NULL DEFAULT 0,
    is_ai          BOOLEAN NOT NULL DEFAULT FALSE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE votes (
    id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    video_id       VARCHAR(16) NOT NULL REFERENCES videos(video_id),
    install_id     UUID NOT NULL,
    vote           BOOLEAN NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (video_id, install_id)
);

CREATE INDEX idx_votes_video_id ON votes(video_id);
CREATE INDEX idx_votes_install_id ON votes(install_id);

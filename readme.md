# YouTube AI Detector

Crowdsourced AI detection for YouTube. A Chrome extension that lets the community flag AI-generated videos — when 3 people independently report the same video, the button turns orange for everyone.

No account. No tracking. Fully open source.

**[Install from Chrome Web Store](https://chromewebstore.google.com/detail/is-generated-block-ai-con/chccpjfkgkgogeaaekpgoocmcekajgjk)** · **[Landing page](https://youtube-ai-detector.lukasdzenk.com)**

---

## How it works

1. **Install the extension** — one click, no sign-up. A random anonymous UUID is generated locally and never leaves your machine.
2. **Flag AI videos** — an "AI slop" button appears next to YouTube's like/dislike bar on watch pages. Click to report, click again to undo.
3. **Community consensus** — when 3 independent users flag the same video, the button turns orange for everyone. Your own reports turn it red immediately (configurable).

## What you can configure

Click the extension icon to open settings:

- **Button theme** — choose from 4 presets (Default, Neon, Stealth, Toxic) or pick custom colors
- **Custom colors** — set your own flagged/reported colors with a color picker

Developer settings (`selfFlag`, `devMode`) live in `extension/config.js` and aren't exposed in the UI.

---

## Project structure

```
extension/                Chrome extension (Manifest V3, vanilla JS)
├── manifest.json         Extension config
├── config.js             Hardcoded dev settings (selfFlag, devMode)
├── logger.js             Conditional console logging
├── content.js            Injects report button on YouTube watch pages
├── background.js         Service worker — API calls, caching, install ID
├── popup.html/js/css     Settings popup (themes, colors)
├── styles.css            Injected styles for report button + tooltip
└── icons/                Extension icons (SVG source + 16/48/128px PNGs)

backend/                  Rust API server (Axum + SQLx + PostgreSQL)
├── src/
│   ├── main.rs           Axum router, CORS, static files, tracing
│   ├── lib.rs            Library crate (shared between server + CLI)
│   ├── config.rs         Environment-based configuration
│   ├── db.rs             PostgreSQL queries (batch fetch, toggle report)
│   ├── cache.rs          In-memory video cache (DashMap + TTL)
│   ├── handlers.rs       Route handlers (videos, reports, stats)
│   ├── models.rs         Request/response types
│   ├── threshold.rs      AI classification logic (report_count >= 3)
│   ├── rate_limit.rs     Per-install-id token bucket
│   └── bin/
│       └── cli.rs        Dev CLI for adding/removing test reports
├── static/
│   └── index.html        Landing page (served at /)
└── migrations/
    ├── 001_initial.sql   Initial schema (videos + votes)
    └── 002_reports.sql   Migrated from voting to report-only model
```

---

## Setup

### Prerequisites

- **Rust** (stable, >= 1.70)
- **PostgreSQL 18** (Docker recommended)
- **Chrome** or any Chromium-based browser
- **cargo-watch** (optional, for hot reload in dev)

### 1. Database

```bash
docker run -d \
  --name yab-db \
  -e POSTGRES_USER=yab \
  -e POSTGRES_PASSWORD=yab \
  -e POSTGRES_DB=youtube_ai_blocker \
  -p 5433:5432 \
  --restart unless-stopped \
  postgres:18
```

Port 5433 is used to avoid conflicts with any local Postgres on 5432.

### 2. Backend

```bash
cd backend
cargo run
```

Migrations run automatically on startup. The server starts on `http://localhost:3000`.

The default database URL is `postgres://yab:yab@localhost:5433/youtube_ai_blocker` — override with the `DATABASE_URL` env var if needed.

#### Dev mode (hot reload)

```bash
cd backend
cargo watch -x run
```

When compiled in debug mode (`debug_assertions`), request/response tracing is logged to the console with method, path, status, and latency.

#### Environment variables

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | `postgres://yab:yab@localhost:5433/youtube_ai_blocker` | PostgreSQL connection string |
| `PORT` | `3000` | HTTP server port |
| `CACHE_TTL_SECS` | `0` | In-memory cache TTL (0 = disabled) |

#### Dev CLI

A separate binary for testing. Add/remove reports with random user IDs:

```bash
cd backend

# Add 5 reports to a video
cargo run --bin yab-cli -- add dQw4w9WgXcQ 5

# Remove 2 reports
cargo run --bin yab-cli -- remove dQw4w9WgXcQ 2

# Check current status
cargo run --bin yab-cli -- status dQw4w9WgXcQ
```

### 3. Chrome extension

1. Go to `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** and select the `extension/` folder

The extension talks to `http://localhost:3000/api` by default. Change `API_BASE` in `background.js` for production.

---

## API

All endpoints are under `/api`. Reports require an `X-Install-Id` header (UUID).

### `GET /api/videos/batch?ids=id1,id2,...`

Fetch report data for up to 50 videos at once.

```json
{
  "videos": {
    "dQw4w9WgXcQ": { "report_count": 5, "is_ai": true },
    "abc123": { "report_count": 1, "is_ai": false }
  }
}
```

### `GET /api/videos/:video_id`

Single video lookup.

```json
{
  "video_id": "dQw4w9WgXcQ",
  "report_count": 5,
  "is_ai": true
}
```

### `POST /api/report`

Toggle a report. If you already reported, your report is removed. Otherwise, it's added.

```bash
curl -X POST http://localhost:3000/api/report \
  -H "Content-Type: application/json" \
  -H "X-Install-Id: 550e8400-e29b-41d4-a716-446655440000" \
  -d '{"video_id": "dQw4w9WgXcQ"}'
```

```json
{
  "success": true,
  "reported": true,
  "info": { "report_count": 5, "is_ai": true }
}
```

Rate limit: 20 requests per minute per install ID.

### `GET /api/stats`

Aggregate counts (used by the landing page).

```json
{
  "total_videos": 42,
  "total_reports": 128
}
```

## Tech stack

- **Extension**: Vanilla JS, Chrome Manifest V3, `chrome.storage.local`
- **Backend**: Rust, Axum, Tokio, SQLx
- **Database**: PostgreSQL 18
- **Caching**: DashMap (in-memory, configurable TTL)
- **Middleware**: tower-http (CORS, tracing, static file serving)

## Tests

```bash
cd backend
cargo test
```

Threshold logic has unit tests in `backend/src/threshold.rs`.

## License

[MIT](LICENSE)

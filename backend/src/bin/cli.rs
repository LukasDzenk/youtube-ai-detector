use sqlx::postgres::PgPoolOptions;
use std::env;
use uuid::Uuid;
use youtube_ai_blocker_backend::db;

fn print_usage() {
    eprintln!("Usage: yab-cli <command> <video_id> [count]");
    eprintln!();
    eprintln!("Commands:");
    eprintln!("  add    <video_id> [count]   Add reports (default: 1) with random install IDs");
    eprintln!("  remove <video_id> [count]   Remove random reports (default: 1)");
    eprintln!("  status <video_id>           Show current report count and is_ai status");
    eprintln!();
    eprintln!("Examples:");
    eprintln!("  yab-cli add zcweinYJO8A 5   Add 5 reports to a video");
    eprintln!("  yab-cli remove zcweinYJO8A  Remove 1 report from a video");
    eprintln!("  yab-cli status zcweinYJO8A  Check video status");
    std::process::exit(1);
}

#[tokio::main]
async fn main() {
    let args: Vec<String> = env::args().collect();
    if args.len() < 3 {
        print_usage();
    }

    let command = &args[1];
    let video_id = &args[2];

    let database_url = env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgres://yab:yab@localhost:5433/youtube_ai_blocker".to_string());

    let pool = PgPoolOptions::new()
        .max_connections(2)
        .connect(&database_url)
        .await
        .expect("Failed to connect to database");

    match command.as_str() {
        "add" => {
            let count: usize = args.get(3).and_then(|s| s.parse().ok()).unwrap_or(1);
            for i in 0..count {
                let install_id = Uuid::new_v4();
                let (info, _) = db::toggle_report(&pool, video_id, install_id)
                    .await
                    .expect("Failed to add report");
                println!(
                    "[{}/{}] Added report (install: {}) → reports: {}, is_ai: {}",
                    i + 1, count, install_id, info.report_count, info.is_ai
                );
            }
        }
        "remove" => {
            let count: usize = args.get(3).and_then(|s| s.parse().ok()).unwrap_or(1);
            let rows = sqlx::query_as::<_, (Uuid,)>(
                "SELECT install_id FROM reports WHERE video_id = $1 ORDER BY created_at DESC LIMIT $2",
            )
            .bind(video_id)
            .bind(count as i64)
            .fetch_all(&pool)
            .await
            .expect("Failed to query reports");

            if rows.is_empty() {
                println!("No reports to remove for {}", video_id);
                return;
            }

            for (i, (install_id,)) in rows.iter().enumerate() {
                let (info, _) = db::toggle_report(&pool, video_id, *install_id)
                    .await
                    .expect("Failed to remove report");
                println!(
                    "[{}/{}] Removed report (install: {}) → reports: {}, is_ai: {}",
                    i + 1, rows.len(), install_id, info.report_count, info.is_ai
                );
            }
        }
        "status" => {
            let info = db::fetch_video_single(&pool, video_id)
                .await
                .expect("Failed to fetch video");
            match info {
                Some(v) => println!("{}: reports={}, is_ai={}", video_id, v.report_count, v.is_ai),
                None => println!("{}: no data", video_id),
            }
        }
        _ => print_usage(),
    }
}

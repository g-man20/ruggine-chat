mod api;
mod auth;
mod db;
mod models;
mod setup_db;
mod mqtt_notifier;
mod logger;

use crate::api::run_api;
use crate::setup_db::setup_db;

#[tokio::main]
async fn main() {
    let pid = sysinfo::get_current_pid().expect("Impossibile ottenere il PID del processo");

    logger::main(pid);
    println!("Starting fresh database setup...");
    setup_db().expect("Failed to setup database");
    
    println!("🌐 Avvio server API...");
    run_api().await;
}


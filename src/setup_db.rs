use rusqlite::{params, Connection, Result};
use serde_json::json;
use argon2::{Argon2, PasswordHasher};
use argon2::password_hash::{SaltString, rand_core::OsRng};

/// Helper function to hash a password with Argon2
fn hash_password(password: &str) -> String {
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .unwrap()
        .to_string()
}

/// Setup database: drops all existing tables and recreates them from scratch with sample data
pub fn setup_db() -> Result<()> {
    let conn = Connection::open("ruggine.db")?;

    println!("Starting fresh database setup...");
    println!("Dropping existing tables...");

    // === Drop existing tables (in reverse order due to foreign keys) ===
    conn.execute("DROP TABLE IF EXISTS requests", [])?;
    conn.execute("DROP TABLE IF EXISTS group_messages", [])?;
    conn.execute("DROP TABLE IF EXISTS messages", [])?;
    conn.execute("DROP TABLE IF EXISTS groups", [])?;
    conn.execute("DROP TABLE IF EXISTS chats", [])?;
    conn.execute("DROP TABLE IF EXISTS users", [])?;

    println!("Existing tables dropped!");
    println!("Creating fresh tables...");

    // === Tables ===
    conn.execute(
        "CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            first_name TEXT NOT NULL,
            last_name TEXT NOT NULL,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            from_user_id INTEGER NOT NULL,
            chat_id INTEGER NOT NULL,
            text TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            FOREIGN KEY (from_user_id) REFERENCES users(id)
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS chats (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user1_id INTEGER NOT NULL,
            user2_id INTEGER NOT NULL,
            FOREIGN KEY (user1_id) REFERENCES users(id),
            FOREIGN KEY (user2_id) REFERENCES users(id)
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS groups (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            user_ids TEXT NOT NULL, -- JSON array
            admin_id INTEGER NOT NULL,
            FOREIGN KEY (admin_id) REFERENCES users(id)
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS group_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            from_user_id INTEGER NOT NULL,
            group_id INTEGER NOT NULL,
            text TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            FOREIGN KEY (from_user_id) REFERENCES users(id),
            FOREIGN KEY (group_id) REFERENCES groups(id)
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            from_user_id INTEGER NOT NULL,
            to_user_id INTEGER NOT NULL,
            group_id INTEGER NOT NULL,
            status TEXT NOT NULL,
            FOREIGN KEY (from_user_id) REFERENCES users(id),
            FOREIGN KEY (to_user_id) REFERENCES users(id),
            FOREIGN KEY (group_id) REFERENCES groups(id)
        )",
        [],
    )?;

    println!("Fresh tables created!");

    // === Initial data insertion ===
    println!("Inserting sample data...");
    println!("Generating Argon2 password hashes...");

    // Generate real Argon2 hashes for demo users
    let alice_hash = hash_password("alice123");     // Password: alice123
    let bob_hash = hash_password("bob456");         // Password: bob456  
    let carla_hash = hash_password("carla789");     // Password: carla789

    println!("Password hashes generated!");

    conn.execute(
        "INSERT INTO users (first_name, last_name, username, password_hash)
         VALUES (?1, ?2, ?3, ?4)",
        params!["Alice", "Rossi", "alice@mail.com", alice_hash],
    )?;

    conn.execute(
        "INSERT INTO users (first_name, last_name, username, password_hash)
         VALUES (?1, ?2, ?3, ?4)",
        params!["Bob", "Bianchi", "bob@mail.com", bob_hash],
    )?;

    conn.execute(
        "INSERT INTO users (first_name, last_name, username, password_hash)
         VALUES (?1, ?2, ?3, ?4)",
        params!["Carla", "Verdi", "carla@mail.com", carla_hash],
    )?;

    conn.execute(
        "INSERT INTO chats (user1_id, user2_id) VALUES (?1, ?2)",
        params![1, 2],
    )?;

    conn.execute(
        "INSERT INTO chats (user1_id, user2_id) VALUES (?1, ?2)",
        params![2, 3],
    )?;

    // Users array in JSON format
    let group1_users = json!([1, 2, 3]).to_string();
    let group2_users = json!([2, 3]).to_string();

    conn.execute(
        "INSERT INTO groups (name, user_ids, admin_id)
         VALUES (?1, ?2, ?3)",
        params!["Squadra Rust", group1_users, 1],
    )?;

    conn.execute(
        "INSERT INTO groups (name, user_ids, admin_id)
         VALUES (?1, ?2, ?3)",
        params!["Progetto A", group2_users, 2],
    )?;

    // Chat privata Alice-Bob (chat 1): sequenza cronologica
    conn.execute(
        "INSERT INTO messages (from_user_id, chat_id, text, timestamp)
         VALUES (?1, ?2, ?3, datetime('now','-45 minutes'))",
        params![1, 1, "Ciao Bob!"],
    )?;

    conn.execute(
        "INSERT INTO messages (from_user_id, chat_id, text, timestamp)
         VALUES (?1, ?2, ?3, datetime('now','-40 minutes'))",
        params![2, 1, "Ciao Alice, come stai?"],
    )?;

    // Chat privata Bob-Carla (chat 2)
    conn.execute(
        "INSERT INTO messages (from_user_id, chat_id, text, timestamp)
         VALUES (?1, ?2, ?3, datetime('now','-30 minutes'))",
        params![2, 2, "Ciao Carla, sei pronta per il progetto?"],
    )?;

    conn.execute(
        "INSERT INTO messages (from_user_id, chat_id, text, timestamp)
         VALUES (?1, ?2, ?3, datetime('now','-25 minutes'))",
        params![3, 2, "Sì, quasi finito!"],
    )?;

    // Messaggi di gruppo con timeline coerente
    conn.execute(
        "INSERT INTO group_messages (from_user_id, group_id, text, timestamp)
         VALUES (?1, ?2, ?3, datetime('now','-20 minutes'))",
        params![1, 1, "Benvenuti nella squadra Rust!"],
    )?;

    conn.execute(
        "INSERT INTO group_messages (from_user_id, group_id, text, timestamp)
         VALUES (?1, ?2, ?3, datetime('now','-15 minutes'))",
        params![2, 1, "Grazie Alice! Sono entusiasta di lavorare insieme!"],
    )?;

    conn.execute(
        "INSERT INTO group_messages (from_user_id, group_id, text, timestamp)
         VALUES (?1, ?2, ?3, datetime('now','-10 minutes'))",
        params![2, 2, "Iniziamo a lavorare sul progetto A!"],
    )?;

    conn.execute(
        "INSERT INTO group_messages (from_user_id, group_id, text, timestamp)
         VALUES (?1, ?2, ?3, datetime('now','-5 minutes'))",
        params![3, 2, "Perfetto! Ho già alcune idee da condividere."],
    )?;

    // Richiesta logicamente corretta: Carla invita Alice al gruppo "Progetto A"
    // (Alice non è nel gruppo che ha solo [2,3], quindi la richiesta è valida)
    conn.execute(
        "INSERT INTO requests (from_user_id, to_user_id, group_id, status)
         VALUES (?1, ?2, ?3, ?4)",
        params![3, 1, 2, "in_attesa"], // Carla (3) invita Alice (1) al "Progetto A" (2)
    )?;

    // Richiesta già accettata: esempio di richiesta completata
    conn.execute(
        "INSERT INTO requests (from_user_id, to_user_id, group_id, status)
         VALUES (?1, ?2, ?3, ?4)",
        params![1, 2, 1, "accettata"], // Alice (1) aveva invitato Bob (2) alla "Squadra Rust" (1) - ora accettata
    )?;

    println!("Sample data inserted!");
    println!("Fresh database setup completed!");
    println!("Demo users created for testing:");
    println!("  - Username: alice@mail.com  | Password: alice123");
    println!("  - Username: bob@mail.com    | Password: bob456");
    println!("  - Username: carla@mail.com  | Password: carla789");
    println!("Use these credentials to test login functionality");

    Ok(())
}

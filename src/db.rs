use rusqlite::{params, Connection, Result};
use crate::models::{User, ChatInfo, GroupInfo, MessageInfo};
use serde_json;

pub fn init_db() -> Result<Connection> {
    let conn = Connection::open("ruggine.db")?;
    Ok(conn)
}

pub fn create_user(conn: &Connection, first_name: &str, last_name: &str, username: &str, password_hash: &str) -> Result<()> {
    conn.execute(
        "INSERT INTO users (first_name, last_name, username, password_hash) VALUES (?1, ?2, ?3, ?4)",
        params![first_name, last_name, username, password_hash],
    )?;
    Ok(())
}

pub fn get_user(conn: &Connection, username: &str) -> Result<Option<User>> {
    let mut stmt = conn.prepare("SELECT id, username, password_hash FROM users WHERE username = ?1")?;
    let mut rows = stmt.query(params![username])?;

    if let Some(row) = rows.next()? {
        Ok(Some(User {
            id: row.get(0)?,
            username: row.get(1)?,
            password_hash: row.get(2)?,
        }))
    } else {
        Ok(None)
    }
}

pub fn get_user_id_by_username(conn: &Connection, username: &str) -> Result<Option<i32>> {
    let mut stmt = conn.prepare("SELECT id FROM users WHERE username = ?1")?;
    let mut rows = stmt.query(params![username])?;

    if let Some(row) = rows.next()? {
        Ok(Some(row.get(0)?))
    } else {
        Ok(None)
    }
}

pub fn get_username_by_id(conn: &Connection, user_id: i32) -> Result<Option<String>> {
    let mut stmt = conn.prepare("SELECT username FROM users WHERE id = ?1")?;
    let mut rows = stmt.query(params![user_id])?;

    if let Some(row) = rows.next()? {
        Ok(Some(row.get(0)?))
    } else {
        Ok(None)
    }
}

pub fn get_user_chats(conn: &Connection, user_id: i32) -> Result<Vec<ChatInfo>> {
    let mut chats = Vec::new();
    
    let mut stmt = conn.prepare("
        SELECT 
            c.id,
            CASE 
                WHEN c.user1_id = ?1 THEN u2.username 
                ELSE u1.username 
            END as other_user_name,
            CASE 
                WHEN c.user1_id = ?1 THEN u2.first_name 
                ELSE u1.first_name 
            END as other_user_first_name,
            CASE 
                WHEN c.user1_id = ?1 THEN u2.last_name 
                ELSE u1.last_name 
            END as other_user_last_name,
            (SELECT text FROM messages WHERE chat_id = c.id ORDER BY timestamp DESC LIMIT 1) as last_message,
            (SELECT timestamp FROM messages WHERE chat_id = c.id ORDER BY timestamp DESC LIMIT 1) as timestamp
        FROM chats c
        JOIN users u1 ON c.user1_id = u1.id
        JOIN users u2 ON c.user2_id = u2.id
        WHERE c.user1_id = ?1 OR c.user2_id = ?1
        ORDER BY timestamp DESC
    ")?;
    
    let rows = stmt.query_map(params![user_id], |row| {
        Ok(ChatInfo {
            id: row.get(0)?,
            other_user_name: row.get(1)?,
            other_user_first_name: row.get(2)?,
            other_user_last_name: row.get(3)?,
            last_message: row.get(4)?,
            timestamp: row.get(5)?,
        })
    })?;

    for chat in rows {
        chats.push(chat?);
    }

    Ok(chats)
}

pub fn get_user_groups(conn: &Connection, user_id: i32) -> Result<Vec<GroupInfo>> {
    let mut groups = Vec::new();
    
    // Prima otteniamo tutti i gruppi e poi filtriamo in Rust per maggiore affidabilità
    let mut stmt = conn.prepare("
        SELECT 
            g.id,
            g.name,
            g.user_ids,
            json_array_length(g.user_ids) as member_count
        FROM groups g
        ORDER BY g.id
    ")?;
    
    let group_rows = stmt.query_map([], |row| {
        Ok((
            row.get::<_, i32>(0)?,       // id
            row.get::<_, String>(1)?,    // name
            row.get::<_, String>(2)?,    // user_ids JSON
            row.get::<_, i32>(3)?,       // member_count
        ))
    })?;

    for group_result in group_rows {
        let (group_id, group_name, user_ids_json, member_count) = group_result?;
        
        // Verifica se l'utente è nel gruppo parsando correttamente il JSON
        if let Ok(user_ids) = serde_json::from_str::<Vec<i32>>(&user_ids_json) {
            if user_ids.contains(&user_id) {
                // Ottieni l'ultimo messaggio per questo gruppo
                let mut msg_stmt = conn.prepare("
                    SELECT text, timestamp 
                    FROM group_messages 
                    WHERE group_id = ?1 
                    ORDER BY timestamp DESC 
                    LIMIT 1
                ")?;
                
                let last_message_result = msg_stmt.query_row(params![group_id], |row| {
                    Ok((
                        row.get::<_, Option<String>>(0)?,
                        row.get::<_, Option<String>>(1)?,
                    ))
                });
                
                let (last_message, timestamp) = match last_message_result {
                    Ok((msg, ts)) => (msg, ts),
                    Err(_) => (None, None),
                };
                
                groups.push(GroupInfo {
                    id: group_id,
                    name: group_name,
                    member_count,
                    last_message,
                    timestamp,
                });
            }
        }
    }

    // Ordina per timestamp (più recenti prima)
    groups.sort_by(|a, b| {
        match (&a.timestamp, &b.timestamp) {
            (Some(a_ts), Some(b_ts)) => b_ts.cmp(a_ts),
            (Some(_), None) => std::cmp::Ordering::Less,
            (None, Some(_)) => std::cmp::Ordering::Greater,
            (None, None) => a.id.cmp(&b.id),
        }
    });

    Ok(groups)
}

pub fn get_chat_messages(conn: &Connection, chat_id: i32, requesting_user_id: i32) -> Result<Vec<MessageInfo>> {
    // Prima verifica che l'utente abbia accesso a questa chat
    let mut chat_check = conn.prepare("
        SELECT user1_id, user2_id 
        FROM chats 
        WHERE id = ?1
    ")?;
    
    let chat_users: Result<(i32, i32)> = chat_check.query_row(params![chat_id], |row| {
        Ok((row.get(0)?, row.get(1)?))
    });
    
    match chat_users {
        Ok((user1_id, user2_id)) => {
            if requesting_user_id != user1_id && requesting_user_id != user2_id {
                return Err(rusqlite::Error::QueryReturnedNoRows); // Accesso negato
            }
        }
        Err(_) => return Err(rusqlite::Error::QueryReturnedNoRows), // Chat non trovata
    }

    let mut messages = Vec::new();
    
    let mut stmt = conn.prepare("
        SELECT 
            m.id,
            u.first_name || ' ' || u.last_name as sender_name,
            u.username as sender_email,
            m.text,
            m.timestamp
        FROM messages m
        JOIN users u ON m.from_user_id = u.id
        WHERE m.chat_id = ?1
        ORDER BY m.timestamp ASC
    ")?;
    
    let rows = stmt.query_map(params![chat_id], |row| {
        Ok(MessageInfo {
            id: row.get(0)?,
            sender_name: row.get(1)?,
            sender_email: row.get(2)?,
            text: row.get(3)?,
            timestamp: row.get(4)?,
        })
    })?;

    for message in rows {
        messages.push(message?);
    }

    Ok(messages)
}

pub fn send_message(conn: &Connection, from_user_id: i32, chat_id: i32, text: &str) -> Result<()> {
    // Prima verifica che l'utente abbia accesso a questa chat
    let mut chat_check = conn.prepare("
        SELECT user1_id, user2_id 
        FROM chats 
        WHERE id = ?1
    ")?;
    
    let chat_users: Result<(i32, i32)> = chat_check.query_row(params![chat_id], |row| {
        Ok((row.get(0)?, row.get(1)?))
    });
    
    match chat_users {
        Ok((user1_id, user2_id)) => {
            if from_user_id != user1_id && from_user_id != user2_id {
                return Err(rusqlite::Error::QueryReturnedNoRows); // Accesso negato
            }
        }
        Err(_) => return Err(rusqlite::Error::QueryReturnedNoRows), // Chat non trovata
    }

    conn.execute(
        "INSERT INTO messages (from_user_id, chat_id, text, timestamp) VALUES (?1, ?2, ?3, datetime('now'))",
        params![from_user_id, chat_id, text],
    )?;
    Ok(())
}

pub fn get_group_messages(conn: &Connection, group_id: i32, requesting_user_id: i32) -> Result<Vec<MessageInfo>> {
    // Prima verifica che l'utente sia membro del gruppo
    let mut group_check = conn.prepare("
        SELECT user_ids 
        FROM groups 
        WHERE id = ?1
    ")?;
    
    let user_ids_json: Result<String> = group_check.query_row(params![group_id], |row| {
        Ok(row.get(0)?)
    });
    
    match user_ids_json {
        Ok(user_ids_str) => {
            // Parsea il JSON per controllare se l'utente è nel gruppo
            if let Ok(user_ids) = serde_json::from_str::<Vec<i32>>(&user_ids_str) {
                if !user_ids.contains(&requesting_user_id) {
                    return Err(rusqlite::Error::QueryReturnedNoRows); // Accesso negato
                }
            } else {
                return Err(rusqlite::Error::QueryReturnedNoRows); // JSON non valido
            }
        }
        Err(_) => {
            return Err(rusqlite::Error::QueryReturnedNoRows); // Gruppo non trovato
        }
    }

    let mut messages = Vec::new();
    
    let mut stmt = conn.prepare("
        SELECT 
            m.id,
            u.first_name || ' ' || u.last_name as sender_name,
            u.username as sender_email,
            m.text,
            m.timestamp
        FROM group_messages m
        JOIN users u ON m.from_user_id = u.id
        WHERE m.group_id = ?1
        ORDER BY m.timestamp ASC
    ")?;
    
    let rows = stmt.query_map(params![group_id], |row| {
        Ok(MessageInfo {
            id: row.get(0)?,
            sender_name: row.get(1)?,
            sender_email: row.get(2)?,
            text: row.get(3)?,
            timestamp: row.get(4)?,
        })
    })?;

    for message in rows {
        messages.push(message?);
    }

    Ok(messages)
}

pub fn send_group_message(conn: &Connection, from_user_id: i32, group_id: i32, text: &str) -> Result<()> {
    // Prima verifica che l'utente sia membro del gruppo
    let mut group_check = conn.prepare("
        SELECT user_ids 
        FROM groups 
        WHERE id = ?1
    ")?;
    
    let user_ids_json: Result<String> = group_check.query_row(params![group_id], |row| {
        Ok(row.get(0)?)
    });
    
    match user_ids_json {
        Ok(user_ids_str) => {
            // Parsea il JSON per controllare se l'utente è nel gruppo
            if let Ok(user_ids) = serde_json::from_str::<Vec<i32>>(&user_ids_str) {
                if !user_ids.contains(&from_user_id) {
                    return Err(rusqlite::Error::QueryReturnedNoRows); // Accesso negato
                }
            } else {
                return Err(rusqlite::Error::QueryReturnedNoRows); // JSON non valido
            }
        }
        Err(_) => {
            return Err(rusqlite::Error::QueryReturnedNoRows); // Gruppo non trovato
        }
    }

    conn.execute(
        "INSERT INTO group_messages (from_user_id, group_id, text, timestamp) VALUES (?1, ?2, ?3, datetime('now'))",
        params![from_user_id, group_id, text],
    )?;
    Ok(())
}

/// Ottieni messaggi di una chat dopo un certo timestamp (per polling real-time)
pub fn get_chat_messages_since(conn: &Connection, chat_id: i32, requesting_user_id: i32, since_timestamp: Option<&str>) -> Result<Vec<MessageInfo>> {
    // Prima verifica che l'utente abbia accesso a questa chat
    let mut chat_check = conn.prepare("
        SELECT user1_id, user2_id 
        FROM chats 
        WHERE id = ?1
    ")?;
    
    let chat_users: Result<(i32, i32)> = chat_check.query_row(params![chat_id], |row| {
        Ok((row.get(0)?, row.get(1)?))
    });
    
    match chat_users {
        Ok((user1_id, user2_id)) => {
            if requesting_user_id != user1_id && requesting_user_id != user2_id {
                return Err(rusqlite::Error::QueryReturnedNoRows); // Accesso negato
            }
        }
        Err(_) => return Err(rusqlite::Error::QueryReturnedNoRows), // Chat non trovata
    }

    let mut messages = Vec::new();
    
    if let Some(ts) = since_timestamp {
        let mut stmt = conn.prepare("
            SELECT 
                m.id,
                u.first_name || ' ' || u.last_name as sender_name,
                u.username as sender_email,
                m.text,
                m.timestamp
            FROM messages m
            JOIN users u ON m.from_user_id = u.id
            WHERE m.chat_id = ?1 AND m.timestamp > ?2
            ORDER BY m.timestamp ASC")?;
        
        let rows = stmt.query_map(params![chat_id, ts], |row| {
            Ok(MessageInfo {
                id: row.get(0)?,
                sender_name: row.get(1)?,
                sender_email: row.get(2)?,
                text: row.get(3)?,
                timestamp: row.get(4)?,
            })
        })?;

        for message in rows {
            messages.push(message?);
        }
    } else {
        let mut stmt = conn.prepare("
            SELECT 
                m.id,
                u.first_name || ' ' || u.last_name as sender_name,
                u.username as sender_email,
                m.text,
                m.timestamp
            FROM messages m
            JOIN users u ON m.from_user_id = u.id
            WHERE m.chat_id = ?1
            ORDER BY m.timestamp ASC")?;
        
        let rows = stmt.query_map(params![chat_id], |row| {
            Ok(MessageInfo {
                id: row.get(0)?,
                sender_name: row.get(1)?,
                sender_email: row.get(2)?,
                text: row.get(3)?,
                timestamp: row.get(4)?,
            })
        })?;

        for message in rows {
            messages.push(message?);
        }
    }

    Ok(messages)
}

/// Crea una nuova chat tra due utenti (se non esiste già)
pub fn create_chat(conn: &Connection, user1_id: i32, user2_id: i32) -> Result<(i32, bool)> {
    // Verifica se esiste già una chat tra questi utenti
    let mut check_stmt = conn.prepare("
        SELECT id FROM chats 
        WHERE (user1_id = ?1 AND user2_id = ?2) 
           OR (user1_id = ?2 AND user2_id = ?1)
    ")?;
    
    let existing_chat = check_stmt.query_row(params![user1_id, user2_id], |row| {
        Ok(row.get::<_, i32>(0)?)
    });
    
    match existing_chat {
        Ok(chat_id) => {
            // Chat già esistente, restituisci l'ID e false (non creata)
            Ok((chat_id, false))
        }
        Err(rusqlite::Error::QueryReturnedNoRows) => {
            // Chat non esiste, creala
            conn.execute(
                "INSERT INTO chats (user1_id, user2_id) VALUES (?1, ?2)",
                params![user1_id, user2_id],
            )?;
            
            // Ottieni l'ID della chat appena creata e true (creata)
            Ok((conn.last_insert_rowid() as i32, true))
        }
        Err(e) => Err(e)
    }
}

/// Trova un utente per username e restituisce le sue informazioni
pub fn find_user_by_username(conn: &Connection, username: &str) -> Result<Option<(i32, String, String)>> {
    let mut stmt = conn.prepare("
        SELECT id, first_name, last_name 
        FROM users 
        WHERE username = ?1
    ")?;
    
    let mut rows = stmt.query(params![username])?;
    
    if let Some(row) = rows.next()? {
        Ok(Some((
            row.get(0)?,  // id
            row.get(1)?,  // first_name  
            row.get(2)?,  // last_name
        )))
    } else {
        Ok(None)
    }
}

/// Crea un nuovo gruppo con l'admin specificato
pub fn create_group(conn: &Connection, name: &str, admin_id: i32, initial_members: &[i32]) -> Result<i32> {
    // Crea l'array JSON dei membri (include sempre l'admin)
    let mut all_members = vec![admin_id];
    for &member_id in initial_members {
        if member_id != admin_id && !all_members.contains(&member_id) {
            all_members.push(member_id);
        }
    }
    
    let members_json = serde_json::to_string(&all_members)
        .map_err(|_| rusqlite::Error::InvalidColumnType(0, "Cannot serialize members".to_string(), rusqlite::types::Type::Text))?;
    
    conn.execute(
        "INSERT INTO groups (name, user_ids, admin_id) VALUES (?1, ?2, ?3)",
        params![name, members_json, admin_id],
    )?;
    
    Ok(conn.last_insert_rowid() as i32)
}

/// Crea una richiesta per unirsi ad un gruppo
pub fn create_group_request(conn: &Connection, from_user_id: i32, to_user_id: i32, group_id: i32) -> Result<i32> {
    // Verifica se esiste già una richiesta pending per questo gruppo
    let mut check_stmt = conn.prepare("
        SELECT id FROM requests 
        WHERE from_user_id = ?1 AND to_user_id = ?2 AND group_id = ?3 AND status = 'in_attesa'
    ")?;
    
    let existing_request = check_stmt.query_row(params![from_user_id, to_user_id, group_id], |row| {
        Ok(row.get::<_, i32>(0)?)
    });
    
    match existing_request {
        Ok(request_id) => {
            // Richiesta già esistente
            Ok(request_id)
        }
        Err(rusqlite::Error::QueryReturnedNoRows) => {
            // Crea nuova richiesta
            conn.execute(
                "INSERT INTO requests (from_user_id, to_user_id, group_id, status) VALUES (?1, ?2, ?3, 'in_attesa')",
                params![from_user_id, to_user_id, group_id],
            )?;
            
            Ok(conn.last_insert_rowid() as i32)
        }
        Err(e) => Err(e)
    }
}

/// Ottieni le richieste ricevute da un utente
pub fn get_user_requests(conn: &Connection, user_id: i32) -> Result<Vec<serde_json::Value>> {
    let mut requests = Vec::new();
    
    let mut stmt = conn.prepare("
        SELECT 
            r.id,
            u.username as from_username,
            u.first_name || ' ' || u.last_name as from_name,
            g.name as group_name,
            g.id as group_id,
            r.status,
            r.from_user_id
        FROM requests r
        JOIN users u ON r.from_user_id = u.id
        JOIN groups g ON r.group_id = g.id
        WHERE r.to_user_id = ?1
        ORDER BY r.id DESC
    ")?;
    
    let rows = stmt.query_map(params![user_id], |row| {
        Ok(serde_json::json!({
            "id": row.get::<_, i32>(0)?,
            "from_username": row.get::<_, String>(1)?,
            "from_name": row.get::<_, String>(2)?,
            "group_name": row.get::<_, String>(3)?,
            "group_id": row.get::<_, i32>(4)?,
            "status": row.get::<_, String>(5)?,
            "from_user_id": row.get::<_, i32>(6)?,
            "message": format!("Vuole invitarti nel gruppo '{}'", row.get::<_, String>(3)?)
        }))
    })?;
    
    for request in rows {
        requests.push(request?);
    }
    
    Ok(requests)
}

/// Accetta o rifiuta una richiesta di gruppo
pub fn handle_group_request(conn: &Connection, request_id: i32, user_id: i32, accept: bool) -> Result<bool> {
    // Verifica che la richiesta appartenga all'utente
    let mut request_stmt = conn.prepare("
        SELECT group_id, from_user_id, status 
        FROM requests 
        WHERE id = ?1 AND to_user_id = ?2
    ")?;
    
    let request_info = request_stmt.query_row(params![request_id, user_id], |row| {
        Ok((
            row.get::<_, i32>(0)?, // group_id
            row.get::<_, i32>(1)?, // from_user_id
            row.get::<_, String>(2)? // status
        ))
    })?;
    
    let (group_id, _from_user_id, current_status) = request_info;
    
    if current_status != "in_attesa" {
        return Ok(false); // Richiesta già gestita
    }
    
    if accept {
        // Aggiungi l'utente al gruppo
        let mut group_stmt = conn.prepare("SELECT user_ids FROM groups WHERE id = ?1")?;
        let user_ids_json = group_stmt.query_row(params![group_id], |row| {
            Ok(row.get::<_, String>(0)?)
        })?;
        
        let mut user_ids: Vec<i32> = serde_json::from_str(&user_ids_json)
            .map_err(|_| rusqlite::Error::InvalidColumnType(0, "Invalid JSON".to_string(), rusqlite::types::Type::Text))?;
        
        if !user_ids.contains(&user_id) {
            user_ids.push(user_id);
            let updated_json = serde_json::to_string(&user_ids)
                .map_err(|_| rusqlite::Error::InvalidColumnType(0, "Cannot serialize".to_string(), rusqlite::types::Type::Text))?;
            
            conn.execute(
                "UPDATE groups SET user_ids = ?1 WHERE id = ?2",
                params![updated_json, group_id],
            )?;
        }
        
        // Aggiorna lo status della richiesta
        conn.execute(
            "UPDATE requests SET status = 'accettata' WHERE id = ?1",
            params![request_id],
        )?;
    } else {
        // Rifiuta la richiesta
        conn.execute(
            "UPDATE requests SET status = 'rifiutata' WHERE id = ?1",
            params![request_id],
        )?;
    }
    
    Ok(true)
}

/// Ottieni i dettagli di un gruppo con lista membri
pub fn get_group_details(conn: &Connection, group_id: i32, requesting_user_id: i32) -> Result<Option<serde_json::Value>> {
    // Verifica che l'utente sia membro del gruppo
    let mut group_stmt = conn.prepare("SELECT name, user_ids, admin_id FROM groups WHERE id = ?1")?;
    let group_result = group_stmt.query_row(params![group_id], |row| {
        Ok((
            row.get::<_, String>(0)?, // name
            row.get::<_, String>(1)?, // user_ids JSON
            row.get::<_, i32>(2)?,    // admin_id
        ))
    });
    
    let (group_name, user_ids_json, admin_id) = match group_result {
        Ok(data) => data,
        Err(rusqlite::Error::QueryReturnedNoRows) => return Ok(None),
        Err(e) => return Err(e),
    };
    
    // Verifica che l'utente richiedente sia nel gruppo
    let user_ids: Vec<i32> = serde_json::from_str(&user_ids_json)
        .map_err(|_| rusqlite::Error::InvalidColumnType(0, "Invalid JSON".to_string(), rusqlite::types::Type::Text))?;
    
    if !user_ids.contains(&requesting_user_id) {
        return Ok(None); // L'utente non è nel gruppo
    }
    
    // Ottieni i dettagli di tutti i membri
    let mut members = Vec::new();
    for user_id in user_ids {
        let mut user_stmt = conn.prepare("
            SELECT id, first_name, last_name, username 
            FROM users 
            WHERE id = ?1
        ")?;
        
        match user_stmt.query_row(params![user_id], |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, i32>(0)?,
                "name": format!("{} {}", row.get::<_, String>(1)?, row.get::<_, String>(2)?),
                "username": row.get::<_, String>(3)?,
                "is_admin": user_id == admin_id
            }))
        }) {
            Ok(member) => members.push(member),
            Err(_) => continue, // Ignora utenti non trovati
        }
    }
    
    let group_details = serde_json::json!({
        "id": group_id,
        "name": group_name,
        "admin_id": admin_id,
        "members_count": members.len(),
        "members": members,
        "is_admin": requesting_user_id == admin_id
    });
    
    Ok(Some(group_details))
}

/// Rimuovi un membro da un gruppo (solo admin)
pub fn remove_group_member(conn: &Connection, group_id: i32, admin_id: i32, member_to_remove: i32) -> Result<bool> {
    // Verifica che chi richiede sia l'admin del gruppo
    let mut group_stmt = conn.prepare("SELECT user_ids, admin_id FROM groups WHERE id = ?1")?;
    let (user_ids_json, actual_admin_id): (String, i32) = group_stmt.query_row(params![group_id], |row| {
        Ok((row.get(0)?, row.get(1)?))
    })?;
    
    if admin_id != actual_admin_id {
        return Ok(false); // Non è l'admin
    }
    
    // Parse dei membri attuali
    let mut user_ids: Vec<i32> = serde_json::from_str(&user_ids_json)
        .map_err(|_| rusqlite::Error::InvalidColumnType(0, "Invalid JSON".to_string(), rusqlite::types::Type::Text))?;
    
    // Rimuovi il membro se presente (non può rimuovere se stesso se è admin)
    if member_to_remove == admin_id {
        return Ok(false); // L'admin non può rimuovere se stesso
    }
    
    if let Some(pos) = user_ids.iter().position(|&x| x == member_to_remove) {
        user_ids.remove(pos);
        
        // Aggiorna il gruppo nel database
        let updated_json = serde_json::to_string(&user_ids)
            .map_err(|_| rusqlite::Error::InvalidColumnType(0, "Cannot serialize".to_string(), rusqlite::types::Type::Text))?;
        
        conn.execute(
            "UPDATE groups SET user_ids = ?1 WHERE id = ?2",
            params![updated_json, group_id],
        )?;
        
        Ok(true)
    } else {
        Ok(false) // Membro non trovato
    }
}

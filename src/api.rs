use axum::{
    routing::{post, get},
    Router,
    extract::{State, Query},
    Json,
    http::{Method, header::{CONTENT_TYPE, AUTHORIZATION}, HeaderValue, StatusCode, HeaderMap},
    response::{IntoResponse, Response},
};
use serde::Deserialize;
use serde_json;
use std::sync::{Arc, Mutex};
use tower_http::cors::{CorsLayer, AllowOrigin};
use rusqlite::params;

use crate::db::{create_user, get_user, get_user_id_by_username, get_username_by_id, get_user_chats, get_user_groups, get_chat_messages, get_chat_messages_since, send_message, get_group_messages, send_group_message, create_chat, find_user_by_username, create_group, create_group_request, get_user_requests, handle_group_request, get_group_details, remove_group_member, init_db};
use crate::auth::{verify_password, generate_jwt, validate_jwt};
use crate::mqtt_notifier::MqttNotifier;
use argon2::{Argon2, PasswordHasher};
use argon2::password_hash::{SaltString, rand_core::OsRng};

#[derive(Clone)]
pub struct AppState {
    pub conn: Arc<Mutex<rusqlite::Connection>>,
    pub mqtt_notifier: Option<Arc<MqttNotifier>>,
}

#[derive(Deserialize)]
pub struct RegisterRequest {
    first_name: String,
    last_name: String,
    username: String,
    password: String,
}

#[derive(Deserialize)]
pub struct LoginRequest {
    username: String,
    password: String,
}

#[derive(Deserialize)]
pub struct ChatIdQuery {
    chat_id: i32,
}

#[derive(Deserialize)]
pub struct ChatPollingQuery {
    chat_id: i32,
    since: Option<String>, // Timestamp ISO 8601
}

#[derive(Deserialize)]
pub struct SendMessageRequest {
    chat_id: i32,
    content: String,
}

#[derive(Deserialize)]
pub struct GroupIdQuery {
    group_id: i32,
}

#[derive(Deserialize)]
pub struct SendGroupMessageRequest {
    group_id: i32,
    content: String,
}

#[derive(Deserialize)]
pub struct CreateChatRequest {
    username: String,
}

#[derive(Deserialize)]
pub struct ChatsQuery {
    username: String,
}

#[derive(Deserialize)]
pub struct CreateGroupRequest {
    name: String,
    members: Vec<String>, // usernames
}

#[derive(Deserialize)]
pub struct CreateGroupRequestItem {
    to_username: String,
    group_id: i32,
}

#[derive(Deserialize)]
pub struct HandleRequestItem {
    request_id: i32,
    accept: bool,
}

#[derive(Deserialize)]
pub struct RemoveMemberRequest {
    group_id: i32,
    member_id: i32,
}

#[derive(Deserialize)]
pub struct CheckUserQuery {
    username: String,
}

/// Simple email validation function
fn is_valid_email(email: &str) -> bool {
    email.contains('@') && email.contains('.') && email.len() > 5
}

/// Extract user_id from JWT token in Authorization header
fn extract_user_id_from_token(conn: &rusqlite::Connection, headers: &HeaderMap) -> Result<i32, String> {
    let auth_header = headers
        .get(AUTHORIZATION)
        .ok_or("Token di autorizzazione mancante")?
        .to_str()
        .map_err(|_| "Header di autorizzazione non valido")?;

    if !auth_header.starts_with("Bearer ") {
        return Err("Formato token non valido".to_string());
    }

    let token = &auth_header[7..]; // Remove "Bearer " prefix
    
    match validate_jwt(token) {
        Some(claims) => {
            // Ottieni user_id dal username (claims.sub)
            match get_user_id_by_username(conn, &claims.sub) {
                Ok(Some(user_id)) => Ok(user_id),
                Ok(None) => Err("Utente non trovato".to_string()),
                Err(_) => Err("Errore nel recupero utente".to_string()),
            }
        }
        None => Err("Token non valido o scaduto".to_string()),
    }
}

/// Get recipient username for a private chat
fn get_chat_recipient_username(conn: &rusqlite::Connection, chat_id: i32, sender_user_id: i32) -> Result<Option<String>, rusqlite::Error> {
    let mut stmt = conn.prepare("SELECT user1_id, user2_id FROM chats WHERE id = ?")?;
    let mut rows = stmt.query_map([chat_id], |row| {
        Ok((row.get::<_, i32>(0)?, row.get::<_, i32>(1)?))
    })?;

    if let Some(Ok((user1_id, user2_id))) = rows.next() {
        // Il destinatario è l'utente che non è il mittente
        let recipient_id = if user1_id == sender_user_id {
            user2_id
        } else {
            user1_id
        };
        
        // Ottieni il nome utente del destinatario
        get_username_by_id(conn, recipient_id)
    } else {
        Ok(None)
    }
}

/// API /register
async fn register(State(state): State<AppState>, Json(payload): Json<RegisterRequest>) -> String {
    let conn = state.conn.lock().unwrap();

    // Validate that username is a valid email
    if !is_valid_email(&payload.username) {
        return format!("Formato email non valido: '{}'. L'username deve essere un indirizzo email valido.", payload.username);
    }

    // Hash password
    let salt = SaltString::generate(&mut OsRng);
    let password_hash = Argon2::default()
        .hash_password(payload.password.as_bytes(), &salt)
        .unwrap()
        .to_string();

    match create_user(&conn, &payload.first_name, &payload.last_name, &payload.username, &password_hash) {
        Ok(_) => format!("Utente {} {} ({}) registrato con successo!", payload.first_name, payload.last_name, payload.username),
        Err(e) => {
            // This should rarely happen now since we check beforehand
            if e.to_string().contains("UNIQUE constraint failed") {
                format!("L'email '{}' è già stata registrata. Riprova con un'altra email.", payload.username)
            } else {
                format!("Errore durante la registrazione dell'utente: {}", e)
            }
        }
    }
}

/// API /login
async fn login(State(state): State<AppState>, Json(payload): Json<LoginRequest>) -> Response {
    let conn = state.conn.lock().unwrap();

    match get_user(&conn, &payload.username) {
        Ok(Some(user)) => {
            match verify_password(&payload.password, &user.password_hash) {
                Ok(true) => {
                    let token = generate_jwt(&user);
                    format!("JWT: {}", token).into_response()
                }
                _ => (StatusCode::UNAUTHORIZED, "Credenziali non valide").into_response(),
            }
        }
        _ => (StatusCode::UNAUTHORIZED, "Credenziali non valide").into_response(),
    }
}

/// API /chats - Get user's chats
async fn get_chats(State(state): State<AppState>, Query(params): Query<ChatsQuery>) -> Response {
    let conn = state.conn.lock().unwrap();

    match get_user_id_by_username(&conn, &params.username) {
        Ok(Some(user_id)) => {
            match get_user_chats(&conn, user_id) {
                Ok(chats) => Json(chats).into_response(),
                Err(_) => (StatusCode::INTERNAL_SERVER_ERROR, "Errore nel recupero delle chat").into_response(),
            }
        }
        _ => (StatusCode::NOT_FOUND, "Utente non trovato").into_response(),
    }
}

/// API /groups - Get user's groups
async fn get_groups(State(state): State<AppState>, Query(params): Query<ChatsQuery>) -> Response {
    let conn = state.conn.lock().unwrap();

    match get_user_id_by_username(&conn, &params.username) {
        Ok(Some(user_id)) => {
            match get_user_groups(&conn, user_id) {
                Ok(groups) => Json(groups).into_response(),
                Err(_) => (StatusCode::INTERNAL_SERVER_ERROR, "Errore nel recupero dei gruppi").into_response(),
            }
        }
        _ => (StatusCode::NOT_FOUND, "Utente non trovato").into_response(),
    }
}

/// API /validate-token - Verifica se il token JWT è valido
async fn validate_token_api(
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let auth_header = headers
        .get("authorization")
        .and_then(|h| h.to_str().ok())
        .ok_or(StatusCode::UNAUTHORIZED)?;

    if !auth_header.starts_with("Bearer ") {
        return Err(StatusCode::UNAUTHORIZED);
    }

    let token = &auth_header[7..];

    // Correggi il pattern matching per Option
    match validate_jwt(token) {
        Some(_claims) => Ok(Json(serde_json::json!({ "valid": true }))),
        None => Ok(Json(serde_json::json!({ "valid": false })))
    }
}

/// API /messages - Get messages for a specific chat
async fn get_messages(State(state): State<AppState>, headers: HeaderMap, Query(params): Query<ChatIdQuery>) -> Response {
    let conn = state.conn.lock().unwrap();
    
    // Verifica autenticazione
    let user_id = match extract_user_id_from_token(&conn, &headers) {
        Ok(id) => id,
        Err(err) => return (StatusCode::UNAUTHORIZED, err).into_response(),
    };
    
    match get_chat_messages(&conn, params.chat_id, user_id) {
        Ok(messages) => Json(messages).into_response(),
        Err(_) => (StatusCode::INTERNAL_SERVER_ERROR, "Errore nel recupero dei messaggi").into_response(),
    }
}

/// API /messages-since - Get messages since a specific timestamp (for real-time updates)
async fn get_messages_since(State(state): State<AppState>, headers: HeaderMap, Query(params): Query<ChatPollingQuery>) -> Response {
    let conn = state.conn.lock().unwrap();
    
    // Verifica autenticazione
    let user_id = match extract_user_id_from_token(&conn, &headers) {
        Ok(id) => id,
        Err(err) => return (StatusCode::UNAUTHORIZED, err).into_response(),
    };
    
    match get_chat_messages_since(&conn, params.chat_id, user_id, params.since.as_deref()) {
        Ok(messages) => Json(messages).into_response(),
        Err(_) => (StatusCode::INTERNAL_SERVER_ERROR, "Errore nel recupero dei messaggi recenti").into_response(),
    }
}

/// API /send-message - Send a new message
async fn send_message_api(State(state): State<AppState>, headers: HeaderMap, Json(payload): Json<SendMessageRequest>) -> Response {
    let conn = state.conn.lock().unwrap();
    
    // Estrai user_id dal token JWT
    let from_user_id = match extract_user_id_from_token(&conn, &headers) {
        Ok(id) => id,
        Err(err) => return (StatusCode::UNAUTHORIZED, err).into_response(),
    };
    
    // Ottieni il nome utente per la notifica MQTT
    let from_username = match get_username_by_id(&conn, from_user_id) {
        Ok(Some(username)) => username,
        Ok(None) => return (StatusCode::BAD_REQUEST, "Utente non trovato").into_response(),
        Err(_) => return (StatusCode::INTERNAL_SERVER_ERROR, "Errore nel recupero dati utente").into_response(),
    };
    
    match send_message(&conn, from_user_id, payload.chat_id, &payload.content) {
        Ok(_) => {
            // Invia notificazione MQTT in background se disponibile
            if let Some(mqtt_notifier) = &state.mqtt_notifier {
                let mqtt_notifier = mqtt_notifier.clone();
                let from_username_clone = from_username.clone();
                let content_clone = payload.content.clone();
                let chat_id = payload.chat_id;
                
                // Recupera il nome utente del destinatario
                let recipient_username = match get_chat_recipient_username(&conn, chat_id, from_user_id) {
                    Ok(Some(username)) => username,
                    Ok(None) => {
                        eprintln!("Chat {} non trovata o destinatario non identificato", chat_id);
                        "unknown_recipient".to_string()
                    },
                    Err(e) => {
                        eprintln!("Errore recupero destinatario chat {}: {:?}", chat_id, e);
                        "unknown_recipient".to_string()
                    }
                };
                
                tokio::spawn(async move {
                    if let Err(e) = mqtt_notifier.notify_private_message(
                        &recipient_username,
                        &from_username_clone,
                        &content_clone,
                        Some(chat_id)  // Passa il chat_id per l'aggiornamento
                    ).await {
                        eprintln!("Errore notifica MQTT: {:?}", e);
                    }
                });
            }
            
            (StatusCode::OK, "Messaggio inviato con successo").into_response()
        },
        Err(_e) => {
            (StatusCode::INTERNAL_SERVER_ERROR, "Errore nel invio del messaggio").into_response()
        },
    }
}

/// API /group-messages - Get messages for a specific group
async fn get_group_messages_api(State(state): State<AppState>, headers: HeaderMap, Query(params): Query<GroupIdQuery>) -> Response {
    let conn = state.conn.lock().unwrap();
    
    // Verifica autenticazione
    let user_id = match extract_user_id_from_token(&conn, &headers) {
        Ok(id) => id,
        Err(err) => {
            return (StatusCode::UNAUTHORIZED, err).into_response();
        },
    };
    
    match get_group_messages(&conn, params.group_id, user_id) {
        Ok(messages) => {
            Json(messages).into_response()
        },
        Err(_e) => {
            (StatusCode::INTERNAL_SERVER_ERROR, "Errore nel recupero dei messaggi del gruppo").into_response()
        },
    }
}

/// API /send-group-message - Send a new message to a group
async fn send_group_message_api(State(state): State<AppState>, headers: HeaderMap, Json(payload): Json<SendGroupMessageRequest>) -> Response {
    let conn = state.conn.lock().unwrap();
    
    // Estrai user_id dal token JWT
    let from_user_id = match extract_user_id_from_token(&conn, &headers) {
        Ok(id) => id,
        Err(err) => return (StatusCode::UNAUTHORIZED, err).into_response(),
    };
    
    // Ottieni il nome utente per la notifica MQTT
    let from_username = match get_username_by_id(&conn, from_user_id) {
        Ok(Some(username)) => username,
        Ok(None) => return (StatusCode::BAD_REQUEST, "Utente non trovato").into_response(),
        Err(_) => return (StatusCode::INTERNAL_SERVER_ERROR, "Errore nel recupero dati utente").into_response(),
    };
    
    match send_group_message(&conn, from_user_id, payload.group_id, &payload.content) {
        Ok(_) => {
            // Invia notificazione MQTT in background se disponibile
            if let Some(mqtt_notifier) = &state.mqtt_notifier {
                let mqtt_notifier = mqtt_notifier.clone();
                let from_username_clone = from_username.clone();
                let content_clone = payload.content.clone();
                let group_id = payload.group_id;
                
                // Recupera i membri del gruppo per inviare notifiche individuali
                let mut recipients_vec: Vec<String> = Vec::new();
                let mut group_name_for_notify: String = group_id.to_string();
                if let Ok(Some(details)) = get_group_details(&conn, group_id, from_user_id) {
                    if let Ok(value) = serde_json::to_value(&details) {
                        if let Some(name_val) = value.get("name").and_then(|n| n.as_str()) {
                            group_name_for_notify = name_val.to_string();
                        }
                        if let Some(members_val) = value.get("members").and_then(|m| m.as_array()) {
                            recipients_vec = members_val.iter().filter_map(|m| {
                                if m.is_string() {
                                    m.as_str().map(|s| s.to_string())
                                } else if m.is_object() {
                                    m.get("username").and_then(|u| u.as_str()).map(|s| s.to_string())
                                        .or_else(|| m.get("user").and_then(|u| u.as_str()).map(|s| s.to_string()))
                                } else {
                                    None
                                }
                            }).filter(|u| u != &from_username_clone).collect();
                        }
                    }
                }
                
                tokio::spawn(async move {
                    if let Err(e) = mqtt_notifier.notify_group_message(
                        group_id.into(),
                        &group_name_for_notify,
                        &from_username_clone,
                        &content_clone,
                        &recipients_vec
                    ).await {
                        eprintln!("Errore notifica MQTT gruppo: {:?}", e);
                    }
                });
            }
            
            (StatusCode::OK, "Messaggio di gruppo inviato con successo").into_response()
        },
        Err(_e) => {
            (StatusCode::INTERNAL_SERVER_ERROR, "Errore nell'invio del messaggio di gruppo").into_response()
        },
    }
}

/// API /create-chat - Crea una nuova chat con un utente
async fn create_chat_api(State(state): State<AppState>, headers: HeaderMap, Json(payload): Json<CreateChatRequest>) -> Response {
    let conn = state.conn.lock().unwrap();
    
    // Estrai user_id dal token JWT
    let requester_user_id = match extract_user_id_from_token(&conn, &headers) {
        Ok(id) => id,
        Err(err) => return (StatusCode::UNAUTHORIZED, err).into_response(),
    };
    
    // Trova l'utente target per username
    let target_user_info = match find_user_by_username(&conn, &payload.username) {
        Ok(Some(info)) => info,
        Ok(None) => return (StatusCode::NOT_FOUND, "Utente non trovato").into_response(),
        Err(_) => return (StatusCode::INTERNAL_SERVER_ERROR, "Errore nella ricerca dell'utente").into_response(),
    };
    
    let (target_user_id, target_first_name, target_last_name) = target_user_info;
    
    // Non permettere di creare una chat con se stesso
    if requester_user_id == target_user_id {
        return (StatusCode::BAD_REQUEST, "Non puoi creare una chat con te stesso").into_response();
    }
    
    // Crea la chat (o ottieni quella esistente)
    match create_chat(&conn, requester_user_id, target_user_id) {
        Ok((chat_id, is_new)) => {
            let message = if is_new {
                "Chat creata con successo"
            } else {
                "Chat già esistente"
            };
            
            let response = serde_json::json!({
                "chat_id": chat_id,
                "target_user": {
                    "id": target_user_id,
                    "username": payload.username,
                    "first_name": target_first_name,
                    "last_name": target_last_name,
                    "name": format!("{} {}", target_first_name, target_last_name)
                },
                "message": message,
                "is_new": is_new
            });
            
            (StatusCode::OK, Json(response)).into_response()
        },
        Err(_e) => {
            (StatusCode::INTERNAL_SERVER_ERROR, "Errore nella creazione della chat").into_response()
        },
    }
}

/// API /create-group - Crea un nuovo gruppo
async fn create_group_api(State(state): State<AppState>, headers: HeaderMap, Json(payload): Json<CreateGroupRequest>) -> Response {
    let conn = state.conn.lock().unwrap();
    
    // Verifica autenticazione
    let admin_user_id = match extract_user_id_from_token(&conn, &headers) {
        Ok(user_id) => user_id,
        Err(error) => return (StatusCode::UNAUTHORIZED, error).into_response(),
    };
    
    // Converti usernames in user_ids
    let mut member_ids = Vec::new();
    for username in &payload.members {
        match find_user_by_username(&conn, username) {
            Ok(Some(user)) => {
                let user_id: i32 = user.0; // user is (i32, String, String)
                if user_id != admin_user_id && !member_ids.contains(&user_id) {
                    member_ids.push(user_id);
                }
            },
            Ok(None) => {
                return (StatusCode::BAD_REQUEST, format!("Utente '{}' non trovato", username)).into_response();
            },
            Err(_) => {
                return (StatusCode::INTERNAL_SERVER_ERROR, "Errore nella ricerca utente").into_response();
            }
        }
    }
    
    // Crea il gruppo
    match create_group(&conn, &payload.name, admin_user_id, &member_ids) {
        Ok(group_id) => {
            let response = serde_json::json!({
                "group_id": group_id,
                "name": payload.name,
                "admin_id": admin_user_id,
                "members": member_ids,
                "message": "Gruppo creato con successo"
            });
            
            Json(response).into_response()
        },
        Err(e) => {
            eprintln!("Errore nella creazione del gruppo: {:?}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, "Errore nella creazione del gruppo").into_response()
        }
    }
}

/// API /create-group-request - Crea una richiesta per invitare qualcuno in un gruppo
async fn create_group_request_api(State(state): State<AppState>, headers: HeaderMap, Json(payload): Json<CreateGroupRequestItem>) -> Response {
    let conn = state.conn.lock().unwrap();
    
    // Verifica autenticazione
    let from_user_id = match extract_user_id_from_token(&conn, &headers) {
        Ok(user_id) => user_id,
        Err(error) => return (StatusCode::UNAUTHORIZED, error).into_response(),
    };
    
    // Trova l'utente destinatario
    let to_user_id = match find_user_by_username(&conn, &payload.to_username) {
        Ok(Some(user)) => user.0, // user is (i32, String, String)
        Ok(None) => {
            return (StatusCode::BAD_REQUEST, format!("Utente '{}' non trovato", payload.to_username)).into_response();
        },
        Err(_) => {
            return (StatusCode::INTERNAL_SERVER_ERROR, "Errore nella ricerca utente").into_response();
        }
    };
    
    // Crea la richiesta
    match create_group_request(&conn, from_user_id, to_user_id, payload.group_id) {
        Ok(request_id) => {
            let response = serde_json::json!({
                "request_id": request_id,
                "message": "Richiesta inviata con successo"
            });
            
            Json(response).into_response()
        },
        Err(e) => {
            eprintln!("Errore nella creazione della richiesta: {:?}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, "Errore nella creazione della richiesta").into_response()
        }
    }
}

/// API /user-requests - Ottieni le richieste ricevute dall'utente
async fn get_user_requests_api(
    State(state): State<AppState>,
    headers: HeaderMap
) -> Response {
    let conn = state.conn.lock().unwrap();
    
    // Verifica autenticazione
    let user_id = match extract_user_id_from_token(&conn, &headers) {
        Ok(user_id) => user_id,
        Err(error) => return (StatusCode::UNAUTHORIZED, error).into_response(),
    };
    
    // Ottieni le richieste
    match get_user_requests(&conn, user_id) {
        Ok(requests) => {
            (StatusCode::OK, Json(requests)).into_response()
        },
        Err(e) => {
            eprintln!("Errore nel recupero richieste: {:?}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, "Errore nel recupero richieste").into_response()
        }
    }
}

/// API /handle-request - Accetta o rifiuta una richiesta
async fn handle_request_api(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<HandleRequestItem>
) -> Response {
    let conn = state.conn.lock().unwrap();
    
    // Verifica autenticazione
    let user_id = match extract_user_id_from_token(&conn, &headers) {
        Ok(user_id) => user_id,
        Err(error) => return (StatusCode::UNAUTHORIZED, error).into_response(),
    };
    
    // Gestisci la richiesta
    match handle_group_request(&conn, payload.request_id, user_id, payload.accept) {
        Ok(true) => {
            let action = if payload.accept { "accettata" } else { "rifiutata" };
            let response = serde_json::json!({
                "message": format!("Richiesta {} con successo", action)
            });
            
            (StatusCode::OK, Json(response)).into_response()
        },
        Ok(false) => {
            (StatusCode::BAD_REQUEST, "Richiesta già gestita o non valida").into_response()
        },
        Err(e) => {
            eprintln!("Errore nella gestione della richiesta: {:?}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, "Errore nella gestione della richiesta").into_response()
        }
    }
}

/// API /group-details - Ottieni dettagli e membri di un gruppo
async fn get_group_details_api(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(params): Query<GroupIdQuery>
) -> Response {
    let conn = state.conn.lock().unwrap();
    
    // Verifica autenticazione
    let user_id = match extract_user_id_from_token(&conn, &headers) {
        Ok(user_id) => user_id,
        Err(error) => return (StatusCode::UNAUTHORIZED, error).into_response(),
    };
    
    // Ottieni i dettagli del gruppo
    match get_group_details(&conn, params.group_id, user_id) {
        Ok(Some(group_details)) => {
            (StatusCode::OK, Json(group_details)).into_response()
        },
        Ok(None) => {
            (StatusCode::NOT_FOUND, "Gruppo non trovato o accesso negato").into_response()
        },
        Err(e) => {
            eprintln!("Errore nel recupero dettagli gruppo: {:?}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, "Errore nel recupero dettagli gruppo").into_response()
        }
    }
}

/// API /remove-member - Rimuovi un membro dal gruppo (solo admin)
async fn remove_member_api(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<RemoveMemberRequest>
) -> Response {
    let conn = state.conn.lock().unwrap();
    
    // Verifica autenticazione
    let admin_user_id = match extract_user_id_from_token(&conn, &headers) {
        Ok(user_id) => user_id,
        Err(error) => return (StatusCode::UNAUTHORIZED, error).into_response(),
    };
    
    // Ottieni le informazioni del gruppo e del membro prima di rimuoverlo
    let group_info = match conn.query_row(
        "SELECT name FROM groups WHERE id = ?1",
        params![payload.group_id],
        |row| row.get::<_, String>(0)
    ) {
        Ok(name) => name,
        Err(e) => {
            eprintln!("Errore nel recupero del gruppo: {:?}", e);
            return (StatusCode::INTERNAL_SERVER_ERROR, "Errore nel recupero del gruppo").into_response();
        }
    };
    
    let removed_user_username = match conn.query_row(
        "SELECT username FROM users WHERE id = ?1",
        params![payload.member_id],
        |row| row.get::<_, String>(0)
    ) {
        Ok(username) => username,
        Err(e) => {
            eprintln!("Errore nel recupero dell'utente: {:?}", e);
            return (StatusCode::INTERNAL_SERVER_ERROR, "Errore nel recupero dell'utente").into_response();
        }
    };
    
    // Rimuovi il membro
    match remove_group_member(&conn, payload.group_id, admin_user_id, payload.member_id) {
        Ok(true) => {
            // Invia notifica MQTT all'utente rimosso
            if let Some(notifier) = state.mqtt_notifier.clone() {
                tokio::spawn(async move {
                    if let Err(e) = notifier.notify_member_removed(
                        &removed_user_username,
                        payload.group_id as i64,
                        &group_info
                    ).await {
                        eprintln!("Errore nell'invio della notifica di rimozione: {:?}", e);
                    }
                });
            }
            
            let response = serde_json::json!({
                "message": "Membro rimosso con successo"
            });
            (StatusCode::OK, Json(response)).into_response()
        },
        Ok(false) => {
            (StatusCode::FORBIDDEN, "Non hai i permessi per rimuovere questo membro").into_response()
        },
        Err(e) => {
            eprintln!("Errore nella rimozione del membro: {:?}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, "Errore nella rimozione del membro").into_response()
        }
    }
}

/// API /check-user - Verifica se un utente esiste (per la validazione prima della creazione gruppo)
async fn check_user_api(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(params): Query<CheckUserQuery>
) -> Response {
    let conn = state.conn.lock().unwrap();
    
    // Verifica autenticazione
    let _user_id = match extract_user_id_from_token(&conn, &headers) {
        Ok(user_id) => user_id,
        Err(error) => return (StatusCode::UNAUTHORIZED, error).into_response(),
    };
    
    // Verifica se l'utente esiste
    match find_user_by_username(&conn, &params.username) {
        Ok(Some(_user)) => {
            (StatusCode::OK, "Utente trovato").into_response()
        },
        Ok(None) => {
            (StatusCode::NOT_FOUND, "Utente non trovato").into_response()
        },
        Err(e) => {
            eprintln!("Errore nella ricerca utente: {:?}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, "Errore nella ricerca utente").into_response()
        }
    }
}

/// Avvia server Axum
pub async fn run_api() {
    let conn = init_db().unwrap();
    
    // Prova a inizializzare MQTT con gestione migliorata
    let mqtt_notifier = MqttNotifier::new().await;
    
    let mqtt_notifier = match mqtt_notifier {
        Ok(notifier) => {
            println!("MQTT notifier inizializzato con successo");
            Some(Arc::new(notifier))
        },
        Err(e) => {
            eprintln!("Avviso: impossibile inizializzare MQTT: {:?}", e);
            eprintln!("   Server continua senza notifiche real-time");
            None
        }
    };
    
    let state = AppState {
        conn: Arc::new(Mutex::new(conn)),
        mqtt_notifier,
    };

    // Configure CORS to allow React frontend
    let cors = CorsLayer::new()
        .allow_origin(AllowOrigin::exact("http://localhost:5173".parse::<HeaderValue>().unwrap()))
        .allow_methods([Method::GET, Method::POST])
        .allow_headers([CONTENT_TYPE, AUTHORIZATION]);

    let app = Router::new()
        .route("/register", post(register))
        .route("/login", post(login))
        .route("/chats", get(get_chats))
        .route("/groups", get(get_groups))
        .route("/messages", get(get_messages))
        .route("/messages-since", get(get_messages_since))  // Nuovo endpoint per polling
        .route("/send-message", post(send_message_api))
        .route("/group-messages", get(get_group_messages_api))
        .route("/send-group-message", post(send_group_message_api))
        .route("/create-chat", post(create_chat_api))  // Nuovo endpoint per creare chat
        .route("/create-group", post(create_group_api))  // Nuovo endpoint per creare gruppo
        .route("/create-group-request", post(create_group_request_api))  // Nuovo endpoint per richieste gruppo
        .route("/user-requests", get(get_user_requests_api))  // Nuovo endpoint per ottenere richieste
        .route("/handle-request", post(handle_request_api))  // Nuovo endpoint per gestire richieste
        .route("/group-details", get(get_group_details_api))  // Nuovo endpoint per dettagli gruppo
        .route("/remove-member", post(remove_member_api))  // Nuovo endpoint per rimuovere membri
        .route("/check-user", get(check_user_api))  // Nuovo endpoint per verificare utenti
        .route("/validate-token", get(validate_token_api))
        .layer(cors)
        .with_state(state.clone());

    let listener = tokio::net::TcpListener::bind("127.0.0.1:3000").await.unwrap();

    println!("Server avviato su http://127.0.0.1:3000");
    println!("MQTT notifier: {}", if state.mqtt_notifier.is_some() { "ATTIVO" } else { "DISABILITATO" });
    
    axum::serve(listener, app).await.unwrap();
}

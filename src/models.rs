use serde::{Serialize, Deserialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct User {
    pub id: i32,
    pub username: String,
    pub password_hash: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Message {
    pub id: i32,
    pub from_user: i32,
    pub group_id: i32,
    pub text: String,
    pub timestamp: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Group {
    pub id: i32,
    pub name: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ChatInfo {
    pub id: i32,
    pub other_user_name: String,
    pub other_user_first_name: String,
    pub other_user_last_name: String,
    pub last_message: Option<String>,
    pub timestamp: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GroupInfo {
    pub id: i32,
    pub name: String,
    pub member_count: i32,
    pub last_message: Option<String>,
    pub timestamp: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MessageInfo {
    pub id: i32,
    pub sender_name: String,
    pub sender_email: String,
    pub text: String,
    pub timestamp: String,
}

#[derive(Serialize)]
pub struct Richiesta {
    pub id: i32,
    pub id_from_user: i32,
    pub id_to_user: i32,
    pub id_group: Option<i32>,
    pub status: String, 
}

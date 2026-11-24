use argon2::{Argon2, PasswordHash, PasswordVerifier};
use argon2::password_hash::Error as PasswordError;
use jsonwebtoken::{encode, decode, Header, Validation, EncodingKey, DecodingKey, Algorithm};
use serde::{Serialize, Deserialize};
use std::time::{SystemTime, Duration, UNIX_EPOCH};

use crate::models::User;

const SECRET_KEY: &[u8] = b"super-secret-key";

#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
    pub sub: String,   // username
    pub exp: usize,    // scadenza token
}

/// Verifica password hashata
pub fn verify_password(password: &str, password_hash: &str) -> Result<bool, PasswordError> {
    let parsed_hash = PasswordHash::new(password_hash)?;
    Ok(Argon2::default().verify_password(password.as_bytes(), &parsed_hash).is_ok())
}

/// Genera un JWT valido 1 ora
pub fn generate_jwt(user: &User) -> String {
    let expiration = SystemTime::now()
        .checked_add(Duration::from_secs(3600)) // 1h
        .unwrap()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs() as usize;

    let claims = Claims {
        sub: user.username.clone(),
        exp: expiration,
    };

    encode(&Header::new(Algorithm::HS256), &claims, &EncodingKey::from_secret(SECRET_KEY))
        .expect("Failed to generate JWT")
}

/// Valida JWT e restituisce i claims
pub fn validate_jwt(token: &str) -> Option<Claims> {
    let validation = Validation::new(Algorithm::HS256);

    match decode::<Claims>(
        token,
        &DecodingKey::from_secret(SECRET_KEY),
        &validation,
    ) {
        Ok(token_data) => Some(token_data.claims),
        Err(_) => None,
    }
}

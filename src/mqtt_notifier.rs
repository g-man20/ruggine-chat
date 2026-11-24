use rumqttc::{MqttOptions, Client, QoS};
use std::time::Duration;
use tokio::sync::Mutex;
use std::sync::Arc;

pub struct MqttNotifier {
    client: Arc<Mutex<Client>>,
}

impl MqttNotifier {
    pub async fn new() -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
        let mut mqttoptions = MqttOptions::new("chat_server", "localhost", 1883);
        mqttoptions.set_keep_alive(Duration::from_secs(5));
        
        let (client, mut connection) = Client::new(mqttoptions, 10);
        
        // Avvia la gestione della connessione in un task separato bloccante
        std::thread::spawn(move || {
            println!("Connessione MQTT broker su localhost:1883...");
            
            for notification in connection.iter() {
                match notification {
                    Ok(_) => {
                        // Connessione attiva, continua
                    }
                    Err(e) => {
                        eprintln!("Errore connessione MQTT: {:?}", e);
                        std::thread::sleep(Duration::from_secs(1));
                        break;
                    }
                }
            }
        });
        
        // Dai tempo alla connessione di stabilirsi
        tokio::time::sleep(Duration::from_millis(100)).await;
        
        println!("MQTT notifier inizializzato");
        
        Ok(Self {
            client: Arc::new(Mutex::new(client)),
        })
    }
    
    /// Notifica un nuovo messaggio in una chat privata
    pub async fn notify_private_message(
        &self,
        recipient_username: &str,
        sender_username: &str,
        content: &str,
        chat_id: Option<i32>,
    ) -> Result<(), Box<dyn std::error::Error>> {
        // Sanitizza il nome utente rimuovendo caratteri problematici
        let safe_username = recipient_username.replace("@", "_").replace(".", "_");
        let topic = format!("chat/user/{}", safe_username);
        
        let mut payload_obj = serde_json::json!({
            "type": "private_message",
            "from": sender_username,
            "to": recipient_username,
            "content": content,
            "message": content,  // Aggiunto per compatibilità
            "timestamp": chrono::Utc::now().to_rfc3339(),
            "action": "refresh_chat"  // Indica al client di aggiornare la chat
        });
        
        // Aggiungi chat_id se disponibile
        if let Some(id) = chat_id {
            payload_obj["chat_id"] = serde_json::json!(id);
        }
        
        let payload = payload_obj;

        match self.client.lock().await.publish(&topic, QoS::AtLeastOnce, false, payload.to_string()) {
            Ok(_) => {
                println!("Messaggio MQTT pubblicato su topic: {}", topic);
                Ok(())
            }
            Err(e) => {
                eprintln!("Errore pubblicazione MQTT su {}: {:?}", topic, e);
                eprintln!("   Verifica che il broker MQTT sia in esecuzione su localhost:1883");
                Err(Box::new(e))
            }
        }
    }

    /// Notifica un nuovo messaggio in un gruppo (pubblica a ciascun membro come per le chat private)
    pub async fn notify_group_message(
        &self,
        group_id: i64,
        group_name: &str,
        sender_username: &str,
        content: &str,
        recipients: &[String],
    ) -> Result<(), Box<dyn std::error::Error>> {
        let group_topic = format!("chat/group/{}", group_id);

        let timestamp = chrono::Utc::now().to_rfc3339();

        for recipient in recipients {
            // Sanitizza il nome utente rimuovendo caratteri problematici
            let safe_username = recipient.replace("@", "_").replace(".", "_");
            let topic = format!("chat/user/{}", safe_username);

            let payload = serde_json::json!({
                "type": "group_message",
                "group_id": group_id,
                "group_name": group_name,
                "group_topic": group_topic,
                "from": sender_username,
                "to": recipient,
                "content": content,
                "message": content,  // Compatibilità
                "timestamp": timestamp,
                "action": "refresh_group"  // Indica al client di aggiornare la chat di gruppo
            });

            match self.client.lock().await.publish(&topic, QoS::AtLeastOnce, false, payload.to_string()) {
                Ok(_) => {
                    println!("Messaggio MQTT gruppo pubblicato per {} su topic: {}", recipient, topic);
                }
                Err(e) => {
                    eprintln!("Errore pubblicazione MQTT per {} su {}: {:?}", recipient, topic, e);
                    eprintln!("   Verifica che il broker MQTT sia in esecuzione su localhost:1883");
                    return Err(Box::new(e));
                }
            }
        }

        Ok(())
    }

    /// Notifica la rimozione di un membro da un gruppo
    pub async fn notify_member_removed(
        &self,
        removed_user_username: &str,
        group_id: i64,
        group_name: &str,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let safe_username = removed_user_username.replace("@", "_").replace(".", "_");
        let topic = format!("chat/user/{}", safe_username);
        
        let timestamp = chrono::Utc::now().to_rfc3339();
        
        let payload = serde_json::json!({
            "type": "member_removed",
            "group_id": group_id,
            "group_name": group_name,
            "removed_user": removed_user_username,
            "timestamp": timestamp,
            "action": "remove_from_group"
        });
        
        match self.client.lock().await.publish(&topic, QoS::AtLeastOnce, false, payload.to_string()) {
            Ok(_) => {
                println!("Notifica rimozione membro pubblicata per {} su topic: {}", removed_user_username, topic);
                Ok(())
            }
            Err(e) => {
                eprintln!("Errore pubblicazione MQTT rimozione membro per {} su {}: {:?}", removed_user_username, topic, e);
                eprintln!("   Verifica che il broker MQTT sia in esecuzione su localhost:1883");
                Err(Box::new(e))
            }
        }
    }


}
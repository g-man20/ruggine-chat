# Ruggine gruppo 24 Chat
## Studenti:
 - s348514 ALESSANDRO VACCARO 
 - s348487 GIUSEPPE MANOCCHIO
 - s348758 GIACOMO CIRIACO PISANO
 - s348646 FRANCESCO IANNARONE

 ## Applicazione Client React

 L’app è sviluppata in React e utilizza una logica di navigazione basata su stato interno (useState) per mostrare viste diverse all’interno della stessa applicazione. Non è impostata come una Single Page Application, ma il passaggio tra le sezioni avviene impostando manualmente lo stato e renderizzando i componenti corrispondenti.
 La logica di “routing” è gestita dalle variabili di stato `currentPage` e `isAuthenticated`.
- currentPage = 'welcome' → mostra la pagina di benvenuto (con i pulsanti “Accedi” e “Registrati”)
- currentPage = 'login' → mostra la pagina di login 
- currentPage = 'registration' → mostra la pagina di registrazione 
- currentPage = 'home' → mostra la pagina principale dell’app, accessibile solo se l’utente è autenticato (isAuthenticated = true)

All’interno della Home, la navigazione tra le varie sezioni è gestita allo stesso modo e, al cambio di stato, viene renderizzato il componente relativo:
- currentPage = selectedChat → apre una chat privata (ChatView)
- currentPage = selectedGroup → apre un gruppo (GroupView)
- currentPage = showRequests → apre la pagina richieste (RequestPage)
- currentPage = se nessuno di questi è attivo → mostra la dashboard principale (Home)


 ## Server API

### Server Rust (Axum + SQLite + MQTT)
- Stack: Axum (HTTP), Tokio (async runtime), rusqlite (SQLite), jsonwebtoken (JWT), Argon2 (password hashing), rumqttc (MQTT client), tower-http (CORS).
- Avvio: `main.rs` inizializza logger, ricrea il DB di sviluppo (`setup_db.rs`), poi avvia l'API con `run_api()` su `127.0.0.1:3000`.
- Stato condiviso (`AppState`): connessione SQLite e opzionale `MqttNotifier` per notifiche real-time.
- CORS: abilita richieste solo da `http://localhost:5173` (frontend Vite).
- Autenticazione: JWT obbligatorio per le route protette. Invia il token in `Authorization: Bearer <JWT>`.
- Real-time: gli eventi (nuovi messaggi, rimozioni membri) sono pubblicati su MQTT e il frontend aggiorna l’UI alla ricezione.

Comandi utili
```
# avvio completo (Mosquitto + frontend + backend)
./start.sh

# solo backend
cargo run

# solo frontend
cd client-react/client && npm run dev
```

Log
- Backend: `/tmp/rust_server.log`
- Frontend: `/tmp/vite_server.log`
- Mosquitto: `/tmp/mosquitto.log`

Note di sicurezza
- Password: hash Argon2, mai in chiaro.
- JWT: algoritmo HS256, scadenza di 1 ora.
- Autorizzazioni: solo admin gruppo può invitare/rimuovere; solo membri vedono messaggi di gruppo.

### Registra Utente
- URL: /register  
- HTTP Method: POST  
- Description: Registra un nuovo utente con nome, cognome, email e password.
Request body:
```json
{
  "first_name": "Carla",
  "last_name": "Verdi",
  "username": "carla@mail.com",
  "password": "carla789"
}
```

### Login Utente
- URL: /login  
- HTTP Method: POST  
- Description: Effettua il login dell’utente e restituisce un token JWT.

Request body:
```json
{
  "username": "alice@mail.com",
  "password": "alice123"
}
```

### Recupera Chat Utente

- URL: /chats
- HTTP Method: GET
- Description: Restituisce tutte le chat dell'utente specificato.

Request body:
```json
{
  "username": "alice@mail.com"
}
```

Response body:
```json
[
  {
    "chat_id": 1,
    "users": ["alice@mail.com", "bob@mail.com"]
  }
]
```
### Recupera Gruppi Utente
- URL: /groups
- HTTP Method: GET
- Description: Restituisce tutti i gruppi di cui l'utente fa parte.

Request body:
```json
{
  "username": "alice@mail.com"
}
```

Response body:
```json
[
  {
    "group_id": 1,
    "name": "Gruppo Amici",
    "admin_id": 2,
    "members": [1, 2, 3]
  }
]
```
### Recupera Messaggi Chat
- URL: /messages
- HTTP Method: GET
- Description: Restituisce i messaggi di una chat specifica.

Request body:
```json
{
  "chat_id": 1
}
```

Response body:
```json
[
  {
    "message_id": 1,
    "from_user": "alice@mail.com",
    "content": "Ciao!",
    "timestamp": "2025-11-11T15:00:00Z"
  }
]
```
### Recupera Messaggi Chat da Timestamp
- URL: /messages-since
- HTTP Method: GET
- Description: Restituisce i messaggi da una chat da un certo timestamp (polling real-time).

Request body:
```json
{
  "chat_id": 1,
  "since": "2025-11-11T14:30:00Z"
}
```

Response body:
```json
[
  {
    "message_id": 2,
    "from_user": "alice@mail.com",
    "content": "Ciao Alice!",
    "timestamp": "2025-11-11T14:45:00Z"
  }
]
```
### Invia Messaggio Privato
- URL: /send-message
- HTTP Method: POST
- Description: Invia un messaggio privato a un utente.

Request body:
```json
{
  "chat_id": 1,
  "content": "Ciao, come stai?"
}
```

Response body:
```json
{
  "message": "Messaggio inviato con successo"
}
```
### Recupera Messaggi di Gruppo
- URL: /group-messages
- HTTP Method: GET
- Description: Restituisce i messaggi di un gruppo.

Request body:
```json
{
  "group_id": 1
}
```

Response body:
```json
[
  {
    "message_id": 1,
    "from_user": "alice@mail.com",
    "content": "Benvenuti nel gruppo!",
    "timestamp": "2025-11-11T15:00:00Z"
  }
]
```
### Invia Messaggio di Gruppo
- URL: /send-group-message
- HTTP Method: POST
- Description: Invia un messaggio a un gruppo.

Request body:
```json
{
  "group_id": 1,
  "content": "Messaggio di gruppo"
}
```

Response body:
```json
{
  "message": "Messaggio inviato con successo"
}
```
### Crea Chat
- URL: /create-chat
- HTTP Method: POST
- Description: Crea una chat privata con un altro utente. Se esiste già, restituisce l'id della chat esistente.

Request body:
```json
{
  "username": "alice@mail.com"
}
```

Response body:
```json
{
  "chat_id": 1,
  "target_user": {
    "id": 2,
    "username": "alice@mail.com",
    "first_name": "Alice",
    "last_name": "Rossi",
    "name": "Alice Rossi"
  },
  "message": "Chat creata con successo",
  "is_new": true
}
```
- URL:: /create-chat
- HTTP Method:: POST
- Description:: Crea una chat privata con un altro utente. Se esiste già, restituisce l’id della chat esistente.
Request body:
```
{
  "username": "alice@mail.com"
}
```
Response body:
```
{
  "chat_id": 1,
  "target_user": {
    "id": 2,
    "username": "alice@mail.com",
    "first_name": "Alice",
    "last_name": "Rossi",
    "name": "Alice Rossi"
  },
  "message": "Chat creata con successo",
  "is_new": true
}
```
### Crea Gruppo
- URL: /create-group
- HTTP Method: POST
- Description: Crea un nuovo gruppo con utenti specificati.

Request body:
```json
{
  "name": "Gruppo Amici",
  "members": ["bob@mail.com", "alice@mail.com"]
}
```

Response body:
```json
{
  "group_id": 1,
  "name": "Gruppo Amici",
  "admin_id": 1,
  "members": [2, 3],
  "message": "Gruppo creato con successo"
}
```
### Crea Richiesta di Gruppo
- URL: /create-group-request
- HTTP Method: POST
- Description: Invia una richiesta di invito ad un gruppo.

Request body:
```json
{
  "to_username": "bob@mail.com",
  "group_id": 1
}
```

Response body:
```json
{
  "request_id": 1,
  "message": "Richiesta inviata con successo"
}
```
### Recupera Richieste Utente
- URL: /user-requests
- HTTP Method: GET
- Description: Ottiene le richieste di gruppo ricevute dall'utente.

Response body:
```json
[
  {
    "request_id": 1,
    "from_user": "bob@mail.com",
    "group_id": 1,
    "group_name": "Gruppo Amici"
  }
]
```
### Gestisci Richiesta di Gruppo
- URL: /handle-request
- HTTP Method: POST
- Description: Accetta o rifiuta una richiesta di gruppo.

Request body:
```json
{
  "request_id": 1,
  "accept": true
}
```

Response body:
```json
{
  "message": "Richiesta gestita con successo"
}
```
### Recupera Dettagli Gruppo
- URL: /group-details
- HTTP Method: GET
- Description: Restituisce dettagli e membri di un gruppo.

Request body:
```json
{
  "group_id": 1
}
```

Response body:
```json
{
  "group_id": 1,
  "name": "Gruppo Amici",
  "admin_id": 1,
  "members": [
    {"id": 1, "username": "alice@mail.com"},
    {"id": 2, "username": "bob@mail.com"}
  ]
}
```
### Rimuovi Membro dal Gruppo
- URL: /remove-member
- HTTP Method: POST
- Description: Rimuove un membro dal gruppo (solo admin).

Request body:
```json
{
  "group_id": 1,
  "member_id": 2
}
```

Response body:
```json
{
  "message": "Membro rimosso con successo"
}
```
### Verifica Esistenza Utente
- URL: /check-user
- HTTP Method: GET
- Description: Verifica se un utente esiste nel sistema (prima della creazione di un gruppo).

Request body:
```json
{
  "username": "alice@mail.com"
}
```
## Tabelle del Database
### Tabella users
Contiene le informazioni degli utenti registrati.

| Column   | Type    | Description                        |
|----------|---------|------------------------------------|
| id        | INTEGER | Identificativo univoco dell'utente (PRIMARY KEY) |
| firstname | TEXT    | Nome utente             |
| lastname  | TEXT    | Cognome utente          |
| username  | TEXT    | Username utente univoco |
| password  | TEXT    | Password hashata        |


### Tabella requests
Contiene le richieste di partecipazione al gruppo inviate e ricevute dagli utenti

| Column | Type    | Description                                  |
|--------|---------|----------------------------------------------|
| id     | INTEGER | Identificativo univoco della richiesta (PRIMARY KEY) |
| from_user_id| INTEGER |  Identificativo univoco dell'utente che ha inviato la richiesta  |
| to_user_id| INTEGER | Identificativo univoco dell'utente che ha ricevuto la richiesta  |
| group_id| INTEGER | Identificativo univoco del gruppo |
| status  | TEXT | Stato della richiesta |


### Tabella messages
Contiene i messaggi scambiati tra gli utenti
| Column | Type    | Description                                  |
|--------|---------|----------------------------------------------|
| id     | INTEGER | Identificativo univoco del messaggio (PRIMARY KEY) |
| from_user_id| INTEGER |  Identificativo univoco dell'utente che ha inviato la richiesta  |
| chat_id| INTEGER | Identificativo univoco della chat |
| text  | TEXT | Testo del messaggio |
| timestamp  | TEXT | Timestamp del messaggio |

### Tabella groups
Contiene le informazioni di ogni gruppo

| Column | Type    | Description                                  |
|--------|---------|----------------------------------------------|
| id     | INTEGER | Identificativo univoco del gruppo (PRIMARY KEY) |
| name   | text | Nome del gruppo  |
| user_ids | TEXT | Id degli utenti presenti nel gruppo  |
| admin_id | INTEGER | Identificativo dell'amministratore del gruppo |

### Tabella group_message
Contiene i messaggi scambiati nei vari gruppi

| Column | Type    | Description                                  |
|--------|---------|----------------------------------------------|
| id     | INTEGER | Identificativo univoco del messaggio nel gruppo (PRIMARY KEY) |
| from_user_id| INTEGER |  Identificativo univoco dell'utente che ha inviato il messaggio  |
| group_id| INTEGER | Identificativo univoco del gruppo che contiene il messaggio    |
| text | TEXT | Testo del messaggio |
| timestamp | TEXT | Timestamp del  messaggio |

### Tabella chats
Contiene le richieste di partecipare al gruppo inviate e ricevute dagli utenti

| Column  | Type    | Description                                      |
|-------- |---------|--------------------------------------------------|
| id      | INTEGER | Identificativo univoco della chat (PRIMARY KEY)  |
| user1_id| INTEGER |  Identificativo univoco dell'utente 1 della chat |
| user2_id| INTEGER | Identificativo univoco dell'utente  2 della chat |


 ## Componenti Principali React
 - App (in App.jsx):
Gestisce il routing principale con React Router.  
Controlla lo stato di autenticazione.  
Inizializza MQTT quando l’utente è autenticato.

- Home (in components/Home.jsx):
Schermata principale mostrata dopo il login.  
Visualizza la lista di chat private e gruppi dell’utente.  
Permette la creazione di nuove chat o gruppi e la gestione delle richieste di partecipazione.

- ChatView (in components/ChatView.jsx):
Mostra la conversazione privata con un utente.
Permette di inviare nuovi messaggi.

- GroupView (in components/GroupView.jsx):
Mostra i messaggi di un gruppo.
Permette di inviare messaggi al gruppo.

- RequestPage (in components/RequestPage.jsx):
Visualizza le richieste ricevute (es. inviti a chat o gruppi).

- Login (in components/Login.jsx):
Form di autenticazione utente.

- Registration (in components/Registration.jsx):
Form di registrazione per nuovi utenti.

- GroupInfo (in components/GroupInfo.jsx)
Mostra le informazioni dettagliate di un gruppo selezionato.  
Consente diverse azioni:  
Visualizzazione membri del gruppo, con evidenziazione degli amministratori.  
Rimozione membri (solo per l’amministratore).  
Invito di nuovi utenti tramite un modal dedicato.  

- MqttNotifications  (in components/MqttNotifications.jsx)
Gestisce le notifiche in tempo reale provenienti da eventi MQTT.

 ## Credenziali Utenti
| Username | Password | Nome |
|----------|----------|------|
| alice@mail.com | alice123 | Alice Rossi |
| bob@mail.com | bob456 | Bob Bianchi |
| carla@mail.com | carla789 | Carla Verdi |

## Dimensione file eseguibile
La dimensione del file eseguibile del Server Rust (generato con il comando cargo build --release) è di 4736 KB.

## Guida per l'installazione dell'applicazione

Come prima cosa deve essere importato l'intero progetto con il comando:
git clone https://github.com/PdS2425-C2/G24.git

Successivamente per installare Node e npm che ci consentono di avviare e gestire il frontend, possiamo seguire la guida su https://nodejs.org/ nella sezione download.

Per quanto riguarda il server dovranno essere installati cargo e rustc, che ci permetteranno di buildare e poi eseguire il server rust.

Infine per gestire le notifiche possiamo installare mosquitto, seguendo la guida su https://mosquitto.org/download/

Dopo aver installato tutti i tool di cui abbiamo bisogno, dobbiamo entrare nella cartella del client e da terminale installare prima tutte le librerie di cui abbiamo bisogno con il comando "npm install". Per avviare poi il server possiamo usare il comando "npm run dev".

Per quanto riguarda il server all'interno della cartella ruggine dobbiamo prima fare la build con il comando "cargo build" e successivamente avviare il server con "cargo run"

Infine dobbiamo avviare mosquitto che è il nostro gestore di notifiche real time.

Dopo aver fatto tutto ciò avremo tutti i servizi di cui abbiamo bisogno attivi e potremo utilizzare la nostra applicazione accedendo al frontend esposto sull'indirizzo localhost:5173.
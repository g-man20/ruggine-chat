import React, { useState, useEffect, useCallback } from 'react';
import '../css/ChatView.css';
import { useNotification } from '../hooks/useNotification';

function ChatView({ chatId, chatName, onBack }) {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const notify = useNotification();

  // Funzione per caricare i messaggi (ora riutilizzabile)
  const loadMessages = useCallback(async () => {
    console.log('ChatView - Caricamento messaggi per chat_id:', chatId);
    try {
      const token = localStorage.getItem('authToken');
      
      if (!token) {
        console.error('ChatView - Nessun token di autenticazione trovato');
        return;
      }
      
      const response = await fetch(`http://127.0.0.1:3000/messages?chat_id=${chatId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      console.log('ChatView - Response status:', response.status);
      
      if (response.ok) {
        const messagesData = await response.json();
        console.log('ChatView - Messaggi ricevuti:', messagesData.length, messagesData);
        setMessages(messagesData);
      } else {
        const errorText = await response.text();
        console.error('ChatView - Errore API:', response.status, errorText);
      }
    } catch (error) {
      console.error('ChatView - Errore di rete:', error);
    } finally {
      setLoading(false);
    }
  }, [chatId]);

  // Carica i messaggi iniziali
  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  // Ascolta gli eventi MQTT per aggiornamenti real-time
  useEffect(() => {
    const handleMqttMessage = (event) => {
      const { data } = event.detail;
      console.log('ChatView - Messaggio MQTT ricevuto:', data);
      
      // Se il messaggio è per questa chat, ricarica i messaggi
      if (data.type === 'private_message' && data.chat_id === chatId) {
        console.log('ChatView - Aggiornamento real-time per chat', chatId);
        loadMessages(); // Ricarica i messaggi automaticamente
      }
    };

    const handleRefreshMessages = (event) => {
      const data = event.detail;
      console.log('ChatView - Evento refresh ricevuto:', data);
      
      // Se il refresh è per questa chat, ricarica
      if (data && data.chat_id === chatId) {
        loadMessages();
      }
    };

    // Ascolta eventi MQTT
    window.addEventListener('mqttMessage', handleMqttMessage);
    // Ascolta eventi di refresh generici
    window.addEventListener('refreshMessages', handleRefreshMessages);
    
    return () => {
      window.removeEventListener('mqttMessage', handleMqttMessage);
      window.removeEventListener('refreshMessages', handleRefreshMessages);
    };
  }, [chatId, loadMessages]);

  // Invia un nuovo messaggio
  const handleSendMessage = async (e) => {
    e.preventDefault();
    
    if (!newMessage.trim()) return;

    setSending(true);
    const token = localStorage.getItem('authToken');
    const messageContent = newMessage.trim();

    try {
      const response = await fetch('http://127.0.0.1:3000/send-message', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          chat_id: chatId,
          content: messageContent
        })
      });

      if (response.ok) {
        console.log('Messaggio inviato con successo');
        
        // Pulisci il form immediatamente
        setNewMessage('');
        
        // Ricarica i messaggi dopo l'invio
        await loadMessages();
        
      } else {
        const errorText = await response.text();
        console.error('Errore nell\'invio del messaggio:', errorText);
        notify.error('Errore nell\'invio del messaggio');
      }
    } catch (error) {
      console.error('Errore di rete:', error);
      notify.error('Errore di connessione');
    } finally {
      setSending(false);
    }
  };

  const formatMessageTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('it-IT', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getCurrentUserEmail = () => {
    return localStorage.getItem('userEmail');
  };

  if (loading) {
    return (
      <div className="chat-view-loading">
        <div className="loading-spinner">...</div>
        <p>Caricamento messaggi...</p>
      </div>
    );
  }

  return (
    <div className="chat-view-container">
      {/* Header della chat */}
      <header className="chat-header">
        <button onClick={onBack} className="back-button">
          ← Indietro
        </button>
        <h2 className="chat-title">{chatName}</h2>
      </header>

      {/* Area messaggi */}
      <main className="messages-container">
        {messages.length > 0 ? (
          <div className="messages-list">
            {messages.map(message => (
              <div 
                key={message.id} 
                className={`message ${message.sender_email === getCurrentUserEmail() ? 'own-message' : 'other-message'}`}
              >
                <div className="message-content">
                  <div className="message-header">
                    <span className="sender-name">{message.sender_name}</span>
                    <span className="message-time">{formatMessageTime(message.timestamp)}</span>
                  </div>
                  <p className="message-text">{message.text}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-messages">
            <p>Nessun messaggio ancora. Inizia la conversazione!</p>
          </div>
        )}
      </main>

      {/* Form per inviare messaggi */}
      <footer className="message-input-container">
        <form onSubmit={handleSendMessage} className="message-form">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Scrivi un messaggio..."
            className="message-input"
            disabled={sending}
          />
          <button 
            type="submit" 
            className="send-button"
            disabled={sending || !newMessage.trim()}
          >
            {sending ? 'Invio...' : 'Invia'}
          </button>
        </form>
      </footer>
    </div>
  );
}

export default ChatView;
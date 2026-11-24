import React, { useState, useEffect } from 'react';
import '../css/GroupView.css';
import GroupInfo from './GroupInfo';
import { useNotification } from '../hooks/useNotification';

function GroupView({ groupId, groupName, onBack }) {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [showGroupInfo, setShowGroupInfo] = useState(false);
  const [isRemoved, setIsRemoved] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [currentUserId, setCurrentUserId] = useState(null);
  const notify = useNotification();

  // Carica i dettagli del gruppo per verificare se l'utente è admin
  const loadGroupDetails = async () => {
    try {
      const token = localStorage.getItem('authToken');
      
      // Ottieni i dettagli del gruppo
      const groupResponse = await fetch(`http://127.0.0.1:3000/group-details?group_id=${groupId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (groupResponse.ok) {
        const groupData = await groupResponse.json();
        
        // Ottieni user_id corrente
        const userResponse = await fetch(`http://127.0.0.1:3000/validate-token`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (userResponse.ok) {
          const userData = await userResponse.json();
          setCurrentUserId(userData.user_id);
          
          // Controlla se l'utente corrente è l'admin del gruppo
          setIsAdmin(userData.user_id === groupData.admin_id);
        }
      }
    } catch (error) {
      console.error('Errore nel caricamento dei dettagli del gruppo:', error);
    }
  };

  // Carica i messaggi del gruppo
  const loadMessages = async () => {
    console.log('GroupView - Caricamento messaggi per group_id:', groupId);
    try {
      const token = localStorage.getItem('authToken');
      console.log('GroupView - Token presente:', !!token);
      
      if (!token) {
        console.error('GroupView - Nessun token di autenticazione trovato');
        setLoading(false);
        return;
      }
      
      const response = await fetch(`http://127.0.0.1:3000/group-messages?group_id=${groupId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      console.log('GroupView - Response status:', response.status);
      
      if (response.ok) {
        const messagesData = await response.json();
        console.log('GroupView - Messaggi ricevuti:', messagesData.length, messagesData);
        setMessages(messagesData);
      } else {
        const errorText = await response.text();
        console.error('GroupView - Errore API:', response.status, errorText);
      }
    } catch (error) {
      console.error('GroupView - Errore di rete:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMessages();
    loadGroupDetails();
  }, [groupId]);

  // Ascolta gli eventi MQTT per aggiornamenti real-time di gruppo
  useEffect(() => {
    const handleMqttMessage = (event) => {
      const { data } = event.detail;
      console.log('GroupView - Messaggio MQTT ricevuto:', data);
      
      // Se l'utente è stato rimosso da questo gruppo
      if (data.type === 'member_removed' && data.group_id === groupId) {
        console.log('GroupView - Utente rimosso dal gruppo', groupId);
        setIsRemoved(true); // Marca l'utente come rimosso
        notify.warning(`Sei stato rimosso dal gruppo "${data.group_name}"`);
        
        // Ricarica i gruppi nella home per rimuoverlo dalla lista
        window.dispatchEvent(new CustomEvent('refreshGroups'));
        
        // Torna alla home dopo un breve delay
        setTimeout(() => {
          onBack();
        }, 1500);
        return;
      }
      
      // Se il messaggio è per questo gruppo, mostra notifica con nome gruppo e ricarica
      if (data.type === 'group_message' && data.group_id === groupId) {
        const groupLabel = data.group_name ? data.group_name : `Gruppo ${data.group_id}`;
        console.log('GroupView - Aggiornamento real-time per gruppo', groupLabel);
        loadMessages(); // Ricarica i messaggi automaticamente
      }
    };

    // Ascolta eventi MQTT
    window.addEventListener('mqttMessage', handleMqttMessage);
    
    return () => {
      window.removeEventListener('mqttMessage', handleMqttMessage);
    };
  }, [groupId, onBack, notify]);

  // Invia un nuovo messaggio
  const handleSendMessage = async (e) => {
    e.preventDefault();
    
    // Se l'utente è stato rimosso, blocca l'invio
    if (isRemoved) {
      notify.error('Non puoi più inviare messaggi, sei stato rimosso dal gruppo');
      return;
    }
    
    if (!newMessage.trim()) return;

    setSending(true);
    const token = localStorage.getItem('authToken');
    const messageContent = newMessage.trim();

    try {
      const response = await fetch('http://127.0.0.1:3000/send-group-message', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          group_id: groupId,
          content: messageContent
        })
      });

      if (response.ok) {
        console.log('Messaggio di gruppo inviato con successo');
        
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
      <div className="group-view-loading">
        <div className="loading-spinner">...</div>
        <p>Caricamento messaggi del gruppo...</p>
      </div>
    );
  }

  // Se è selezionata la vista Info, mostra GroupInfo
  if (showGroupInfo) {
    return (
      <GroupInfo 
        group={{ id: groupId, name: groupName }}
        onBack={() => setShowGroupInfo(false)}
      />
    );
  }

  return (
    <div className="group-view-container">
      {/* Header del gruppo */}
      <header className="group-header">
        <button onClick={onBack} className="back-button">
          ← Indietro
        </button>
        <div className="group-info">
          <h2 className="group-title">{groupName}</h2>
          <span className="group-subtitle">Gruppo</span>
        </div>
        <button 
          onClick={() => setShowGroupInfo(true)} 
          className="info-button"
          style={{
            padding: '8px 16px',
            backgroundColor: '#17a2b8',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '0.9em'
          }}
          title="Informazioni gruppo"
        >
          Info
        </button>
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
            <p>Nessun messaggio nel gruppo ancora. Inizia la conversazione!</p>
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
            placeholder={isRemoved ? "Sei stato rimosso dal gruppo" : "Scrivi un messaggio al gruppo..."}
            className="message-input"
            disabled={sending || isRemoved}
          />
          <button 
            type="submit" 
            className="send-button"
            disabled={sending || !newMessage.trim() || isRemoved}
          >
            {sending ? 'Invio...' : 'Invia'}
          </button>
        </form>
      </footer>
    </div>
  );
}

export default GroupView;
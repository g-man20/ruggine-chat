import React, { useState, useEffect } from 'react';
import { useNotification } from '../hooks/useNotification';

function RequestPage({ onBack, onRefreshGroups }) {
  const [richieste, setRichieste] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const notify = useNotification();

  // Carica le richieste dal backend
  useEffect(() => {
    loadRequests();
  }, []);

  const loadRequests = async () => {
    const token = localStorage.getItem('authToken');
    
    try {
      setLoading(true);
      const response = await fetch('http://127.0.0.1:3000/user-requests', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const requestsData = await response.json();
        setRichieste(requestsData);
        setError(null);
      } else {
        const errorText = await response.text();
        setError(`Errore nel caricamento: ${errorText}`);
      }
    } catch (err) {
      setError(`Errore di connessione: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleRequest = async (requestId, accept) => {
    const token = localStorage.getItem('authToken');
    
    try {
      const response = await fetch('http://127.0.0.1:3000/handle-request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          request_id: requestId,
          accept: accept
        })
      });

      if (response.ok) {
        const result = await response.json();
        notify.success(result.message);
        // Ricarica le richieste per aggiornare la lista
        await loadRequests();
        // Aggiorna i gruppi nella home se disponibile
        if (accept && onRefreshGroups) {
          await onRefreshGroups();
        }
      } else {
        const errorText = await response.text();
        notify.error(`Errore: ${errorText}`);
      }
    } catch (err) {
      notify.error(`Errore di connessione: ${err.message}`);
    }
  };

  if (loading) {
    return (
      <div className="chats-section">
        <h3>Richieste</h3>
        <button onClick={onBack} className="action-button create-group" style={{ marginBottom: '1rem' }}>
          ← Torna indietro
        </button>
        <div className="loading">Caricamento richieste...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="chats-section">
        <h3>Richieste</h3>
        <button onClick={onBack} className="action-button create-group" style={{ marginBottom: '1rem' }}>
          ← Torna indietro
        </button>
        <div className="error-state">
          <p>{error}</p>
          <button onClick={loadRequests} className="action-button create-chat">
            Riprova
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="chats-section">
      <h3>Richieste Ricevute</h3>
      <button onClick={onBack} className="action-button create-group" style={{ marginBottom: '1rem' }}>
        ← Torna indietro
      </button>
      
      {richieste.length > 0 ? (
        <div className="chat-list">
          {richieste.map(req => (
            <div key={req.id} className="chat-item request-item" style={{ 
              border: '1px solid #e0e0e0', 
              borderRadius: '8px', 
              marginBottom: '12px',
              padding: '16px',
              backgroundColor: req.status === 'in_attesa' ? '#f9f9f9' : '#f0f0f0'
            }}>
              <div className="chat-content">
                <div className="chat-header">
                  <h4 className="chat-name">{req.from_name}</h4>
                  <span className="request-status" style={{
                    padding: '4px 8px',
                    borderRadius: '12px',
                    fontSize: '0.8em',
                    backgroundColor: req.status === 'in_attesa' ? '#fff3cd' : 
                                    req.status === 'accettata' ? '#d4edda' : '#f8d7da',
                    color: req.status === 'in_attesa' ? '#856404' : 
                           req.status === 'accettata' ? '#155724' : '#721c24'
                  }}>
                    {req.status === 'in_attesa' ? 'In attesa' :
                     req.status === 'accettata' ? 'Accettata' : 'Rifiutata'}
                  </span>
                </div>
                <p className="chat-last-message">
                  <strong>Gruppo:</strong> {req.group_name}
                </p>
                <p style={{ fontSize: '0.9em', color: '#666', margin: '8px 0' }}>
                  {req.message}
                </p>
                <p style={{ fontSize: '0.8em', color: '#888' }}>
                  <strong>Da:</strong> @{req.from_username}
                </p>

                {req.status === 'in_attesa' && (
                  <div style={{ 
                    display: 'flex', 
                    gap: '10px', 
                    marginTop: '12px',
                    justifyContent: 'flex-end' 
                  }}>
                    <button 
                      onClick={() => handleRequest(req.id, false)}
                      className="action-button create-group"
                      style={{ 
                        backgroundColor: '#dc3545',
                        color: 'white',
                        border: 'none',
                        padding: '8px 16px',
                        fontSize: '0.9em'
                      }}
                    >
                      Rifiuta
                    </button>
                    <button 
                      onClick={() => handleRequest(req.id, true)}
                      className="action-button create-chat"
                      style={{ 
                        backgroundColor: '#28a745',
                        color: 'white',
                        border: 'none',
                        padding: '8px 16px',
                        fontSize: '0.9em'
                      }}
                    >
                      Accetta
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <p>Nessuna richiesta al momento.</p>
          <p style={{ fontSize: '0.9em', color: '#666' }}>
            Le richieste per unirti ai gruppi appariranno qui.
          </p>
        </div>
      )}
    </div>
  );
}

export default RequestPage;

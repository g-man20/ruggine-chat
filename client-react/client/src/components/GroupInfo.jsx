import React, { useState, useEffect } from 'react';
import { useNotification } from '../hooks/useNotification';

function GroupInfo({ group, onBack, onInviteUser }) {
  const [groupDetails, setGroupDetails] = useState(null);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showInviteModal, setShowInviteModal] = useState(false);
    const [showRemoveModal, setShowRemoveModal] = useState(false);
    const [memberToRemove, setMemberToRemove] = useState(null);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const notify = useNotification();

  // Carica i dettagli del gruppo e i membri
  useEffect(() => {
    loadGroupInfo();
  }, [group.id]);

  const loadGroupInfo = async () => {
    const token = localStorage.getItem('authToken');
    
    try {
      setLoading(true);
      
      // Ottieni i dettagli del gruppo dal backend
      const groupResponse = await fetch(`http://127.0.0.1:3000/group-details?group_id=${group.id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (groupResponse.ok) {
        const groupData = await groupResponse.json();
        console.log('Dettagli gruppo ricevuti:', groupData);
        
        // Ottieni user_id corrente
        const userResponse = await fetch(`http://127.0.0.1:3000/validate-token`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (userResponse.ok) {
          const userData = await userResponse.json();
          setCurrentUserId(userData.user_id);
          
          // Imposta i dettagli del gruppo
          setGroupDetails({
            id: groupData.id,
            name: groupData.name,
            admin_id: groupData.admin_id,
            created_at: new Date().toISOString(),
            members_count: groupData.members_count
          });
          
          // Imposta i membri
          setMembers(groupData.members || []);
          
          // Determina se l'utente corrente è admin
          setIsAdmin(groupData.is_admin);
        }
      } else {
        const errorText = await groupResponse.text();
        setError(`Errore nel caricamento gruppo: ${errorText}`);
      }
    } catch (err) {
      setError(`Errore nel caricamento: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveMember = async (memberId, memberName) => {
    if (!isAdmin) {
      notify.warning('Solo gli amministratori possono rimuovere membri');
      return;
    }

    // Mostra il modal di conferma invece di usare confirm()
    setMemberToRemove({ id: memberId, name: memberName });
    setShowRemoveModal(true);
  };

  const confirmRemoveMember = async () => {
    if (!memberToRemove) return;

    const token = localStorage.getItem('authToken');
    
    try {
      const response = await fetch('http://127.0.0.1:3000/remove-member', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          group_id: group.id,
          member_id: memberToRemove.id
        })
      });

      if (response.ok) {
        // Ricarica i dettagli del gruppo per aggiornare la lista
        await loadGroupInfo();
        notify.success(`${memberToRemove.name} è stato rimosso dal gruppo`);
      } else {
        const errorText = await response.text();
        notify.error(`Errore nella rimozione: ${errorText}`);
      }
    } catch (err) {
      notify.error(`Errore nella rimozione: ${err.message}`);
    } finally {
      setShowRemoveModal(false);
      setMemberToRemove(null);
    }
  };

  const handleInviteUser = async (username) => {
    if (!isAdmin) {
      notify.warning('Solo gli amministratori possono invitare utenti');
      return;
    }

    const token = localStorage.getItem('authToken');
    
    try {
      const response = await fetch('http://127.0.0.1:3000/create-group-request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          to_username: username,
          group_id: group.id
        })
      });

      if (response.ok) {
        notify.success(`Invito inviato a ${username}!`);
        setShowInviteModal(false);
      } else {
        const errorText = await response.text();
        if (errorText.includes('non trovato')) {
          notify.error(`Username "${username}" non trovato`);
        } else {
          notify.error(`Errore: ${errorText}`);
        }
      }
    } catch (err) {
      notify.error(`Errore di connessione: ${err.message}`);
    }
  };

  if (loading) {
    return (
      <div className="group-info-container">
        <div className="group-info-header">
          <button onClick={onBack} className="back-button">← Indietro</button>
          <h2>Caricamento...</h2>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="group-info-container">
        <div className="group-info-header">
          <button onClick={onBack} className="back-button">← Indietro</button>
          <h2>Errore</h2>
        </div>
        <div className="error-state">
          <p>{error}</p>
          <button onClick={loadGroupInfo} className="action-button create-chat">
            Riprova
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="group-info-container" style={{ padding: '20px', maxWidth: '600px', margin: '0 auto' }}>
      {/* Header */}
      <div className="group-info-header" style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        marginBottom: '20px',
        borderBottom: '1px solid #e0e0e0',
        paddingBottom: '16px'
      }}>
        <button onClick={onBack} className="back-button" style={{
          padding: '8px 16px',
          backgroundColor: '#6c757d',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer'
        }}>
          ← Indietro
        </button>
        <h2 style={{ margin: 0, flex: 1, textAlign: 'center' }}>Info Gruppo</h2>
        {isAdmin && (
          <button 
            onClick={() => setShowInviteModal(true)}
            className="action-button create-chat"
            style={{
              padding: '8px 16px',
              backgroundColor: '#28a745',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Invita
          </button>
        )}
      </div>

      {/* Dettagli Gruppo */}
      {groupDetails && (
        <div className="group-details" style={{ 
          backgroundColor: '#f8f9fa', 
          padding: '16px', 
          borderRadius: '8px',
          marginBottom: '20px'
        }}>
          <h3 style={{ margin: '0 0 12px 0', color: '#333' }}>
            {groupDetails.name}
          </h3>
          <div style={{ fontSize: '0.9em', color: '#666' }}>
            <p style={{ margin: '4px 0' }}>
              <strong>Membri:</strong> {members.length}
            </p>
            <p style={{ margin: '4px 0' }}>
              <strong>Creato:</strong> {new Date(groupDetails.created_at).toLocaleDateString('it-IT')}
            </p>
            {isAdmin && (
              <p style={{ margin: '4px 0', color: '#28a745', fontWeight: 'bold' }}>
                Sei l'amministratore
              </p>
            )}
          </div>
        </div>
      )}

      {/* Lista Membri */}
      <div className="members-section">
        <h3 style={{ marginBottom: '16px', color: '#333' }}>
          Membri del Gruppo ({members.length})
        </h3>
        
        {members.length > 0 ? (
          <div className="members-list">
            {members.map(m => (
              <div key={m.id} className="member-item" style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '12px',
                border: '1px solid #e0e0e0',
                borderRadius: '8px',
                marginBottom: '8px',
                backgroundColor: m.is_admin ? '#e8f5e8' : 'white'
              }}>
                <div className="member-info">
                  <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
                    {m.name}
                    {m.is_admin && (
                      <span style={{ 
                        marginLeft: '8px', 
                        fontSize: '0.8em', 
                        backgroundColor: '#28a745',
                        color: 'white',
                        padding: '2px 6px',
                        borderRadius: '12px'
                      }}>
                        Admin
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '0.8em', color: '#666' }}>
                    @{m.username}
                  </div>
                </div>
                
                {/* Pulsante rimozione solo per admin e non per se stesso */}
                {isAdmin && !m.is_admin && m.id !== currentUserId && (
                  <button
                    onClick={() => handleRemoveMember(m.id, m.name)}
                    style={{
                      backgroundColor: '#dc3545',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      padding: '6px 12px',
                      fontSize: '0.8em',
                      cursor: 'pointer'
                    }}
                  >
                    Rimuovi
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-members">
            <p>Nessun membro trovato.</p>
          </div>
        )}
      </div>

      {/* Modal Invito Utente */}
      {showInviteModal && (
        <div className="modal-overlay" 
             onClick={() => setShowInviteModal(false)}
             style={{
               position: 'fixed',
               top: 0,
               left: 0,
               right: 0,
               bottom: 0,
               backgroundColor: 'rgba(0,0,0,0.5)',
               display: 'flex',
               justifyContent: 'center',
               alignItems: 'center',
               zIndex: 1000
             }}>
          <div className="modal-content" 
               onClick={(e) => e.stopPropagation()}
               style={{
                 backgroundColor: 'white',
                 padding: '24px',
                 borderRadius: '8px',
                 maxWidth: '400px',
                 width: '90%'
               }}>
            <h3 style={{ marginBottom: '16px' }}>Invita Utente</h3>
            <p style={{ marginBottom: '16px', color: '#666' }}>
              Invita un nuovo membro nel gruppo <strong>"{group.name}"</strong>
            </p>

            <form onSubmit={async (e) => {
              e.preventDefault();
              const username = e.target.username.value.trim();
              if (username) {
                await handleInviteUser(username);
              }
            }}>
              <input
                type="text"
                name="username"
                placeholder="Inserisci username (es. mario@mail.com)"
                required
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #ccc',
                  borderRadius: '4px',
                  marginBottom: '16px',
                  fontSize: '14px'
                }}
              />

              <div style={{ display: 'flex', gap: '10px' }}>
                <button 
                  type="submit" 
                  style={{
                    flex: 1,
                    padding: '10px',
                    backgroundColor: '#28a745',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                >
                  Invia Invito
                </button>
                <button 
                  type="button" 
                  onClick={() => setShowInviteModal(false)}
                  style={{
                    flex: 1,
                    padding: '10px',
                    backgroundColor: '#6c757d',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                >
                  Annulla
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Conferma Rimozione */}
      {showRemoveModal && memberToRemove && (
        <div className="modal-overlay" 
             onClick={() => setShowRemoveModal(false)}
             style={{
               position: 'fixed',
               top: 0,
               left: 0,
               right: 0,
               bottom: 0,
               backgroundColor: 'rgba(0,0,0,0.5)',
               display: 'flex',
               justifyContent: 'center',
               alignItems: 'center',
               zIndex: 1000
             }}>
          <div className="modal-content" 
               onClick={(e) => e.stopPropagation()}
               style={{
                 backgroundColor: 'white',
                 padding: '24px',
                 borderRadius: '8px',
                 maxWidth: '400px',
                 width: '90%'
               }}>
            <h3 style={{ marginBottom: '16px', color: '#dc3545' }}>Conferma Rimozione</h3>
            <p style={{ marginBottom: '20px', color: '#666', lineHeight: '1.5' }}>
              Sei sicuro di voler rimuovere <strong>{memberToRemove.name}</strong> dal gruppo?
            </p>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button 
                onClick={confirmRemoveMember}
                style={{
                  flex: 1,
                  padding: '10px',
                  backgroundColor: '#dc3545',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: 'bold'
                }}
              >
                Conferma
              </button>
              <button 
                onClick={() => {
                  setShowRemoveModal(false);
                  setMemberToRemove(null);
                }}
                style={{
                  flex: 1,
                  padding: '10px',
                  backgroundColor: '#6c757d',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                Annulla
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default GroupInfo;
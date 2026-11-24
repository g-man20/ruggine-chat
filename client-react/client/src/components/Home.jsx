import React, { useState, useEffect } from 'react';
import '../css/Home.css';
import ChatView from './ChatView';
import GroupView from './GroupView';
import RequestPage from './RequestPage';
import { useNotification } from '../hooks/useNotification';


function Home({ onLogout }) {
  const [chats, setChats] = useState([])
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreateChatModal, setShowCreateChatModal] = useState(false)
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false)
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [selectedGroupForInvite, setSelectedGroupForInvite] = useState(null)
  const [selectedChat, setSelectedChat] = useState(null)
  const [selectedGroup, setSelectedGroup] = useState(null)
  const [showRequests, setShowRequests] = useState(false)
  const [groupMembers, setGroupMembers] = useState(['']) // Array di stringhe per i membri del gruppo
  const [memberErrors, setMemberErrors] = useState([]) // Array di errori per ciascun membro
  const [groupMessage, setGroupMessage] = useState('') // Messaggio di successo/errore per creazione gruppo
  const [chatMessage, setChatMessage] = useState('') // Messaggio di successo/errore per creazione chat
  const notify = useNotification();

  // Normalizza e ordina i gruppi per ultimo messaggio (timestamp DESC)
  const mapGroups = (groupsData) => {
    const mapped = groupsData.map(group => {
      const rawTimestamp = group.timestamp ? new Date(group.timestamp) : null;
      return {
        id: group.id,
        name: group.name,
        lastMessage: group.last_message || 'Nessun messaggio',
        timestamp: rawTimestamp ? formatTimestamp(rawTimestamp) : '',
        rawTimestamp,
        members: group.member_count || 1,
        avatar: group.name.split(' ').map(word => word[0]).join('').substring(0, 2).toUpperCase()
      };
    });

    mapped.sort((a, b) => {
      const ta = a.rawTimestamp ? a.rawTimestamp.getTime() : 0;
      const tb = b.rawTimestamp ? b.rawTimestamp.getTime() : 0;
      return tb - ta;
    });

    return mapped;
  };

  // Normalizza e ordina le chat per ultimo messaggio (timestamp DESC)
  const mapChats = (chatsData) => {
    const mapped = chatsData.map(chat => {
      const rawTimestamp = chat.timestamp ? new Date(chat.timestamp) : null;
      return {
        id: chat.id,
        name: `${chat.other_user_first_name} ${chat.other_user_last_name}`,
        lastMessage: chat.last_message || 'Nessun messaggio',
        timestamp: rawTimestamp ? formatTimestamp(rawTimestamp) : '',
        rawTimestamp,
        avatar: `${chat.other_user_first_name[0]}${chat.other_user_last_name[0]}`
      };
    });

    mapped.sort((a, b) => {
      const ta = a.rawTimestamp ? a.rawTimestamp.getTime() : 0;
      const tb = b.rawTimestamp ? b.rawTimestamp.getTime() : 0;
      return tb - ta;
    });

    return mapped;
  };


  // Ascolta eventi per aggiornamento chat list
  useEffect(() => {
    const handleRefreshChats = () => {
      console.log('Home - Aggiornamento lista chat richiesto');
      reloadChats();
    };

    const handleRefreshGroups = () => {
      console.log('Home - Aggiornamento lista gruppi richiesto');
      reloadGroups();
    };

    // Ascolta eventi globali per aggiornare le chat e i gruppi
    window.addEventListener('refreshChats', handleRefreshChats);
    window.addEventListener('refreshMessages', handleRefreshChats);
    window.addEventListener('refreshGroups', handleRefreshGroups);
    
    return () => {
      window.removeEventListener('refreshChats', handleRefreshChats);
      window.removeEventListener('refreshMessages', handleRefreshChats);
      window.removeEventListener('refreshGroups', handleRefreshGroups);
    };
  }, []);

  // Carica i dati reali dal server
  useEffect(() => {
    const loadUserData = async () => {
      const userEmail = localStorage.getItem('userEmail');
      const authToken = localStorage.getItem('authToken');
      console.log('Home - User Email:', userEmail);
      console.log('Home - Auth Token:', authToken);
      
      if (!userEmail) {
        setLoading(false);
        return;
      }

      try {
        // Carica le chat dell'utente
        const chatsResponse = await fetch(`http://127.0.0.1:3000/chats?username=${encodeURIComponent(userEmail)}`);
        if (chatsResponse.ok) {
          const chatsData = await chatsResponse.json();
          setChats(mapChats(chatsData));
        }

        // Carica i gruppi dell'utente
        const groupsResponse = await fetch(`http://127.0.0.1:3000/groups?username=${encodeURIComponent(userEmail)}`);
        if (groupsResponse.ok) {
          const groupsData = await groupsResponse.json();
          setGroups(mapGroups(groupsData));
        }
      } catch (error) {
        console.error('Errore nel caricamento dei dati:', error);
      } finally {
        setLoading(false);
      }
    };

    loadUserData();
  }, []);

  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffTime = Math.abs(now - date);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 1) {
      return 'Oggi';
    } else if (diffDays === 2) {
      return 'Ieri';
    } else if (diffDays <= 7) {
      return `${diffDays} giorni fa`;
    } else {
      return date.toLocaleDateString('it-IT');
    }
  };

  const handleCreateChat = () => {
    setShowCreateChatModal(true)
  }

  const handleCreateGroup = () => {
    setShowCreateGroupModal(true)
  }

  const handleChatClick = (chat) => {
    console.log('Home - Chat clicked:', chat);
    setSelectedChat(chat)
  }

  const handleGroupClick = (group) => {
    console.log('Home - Group clicked:', group);
    setSelectedGroup(group)
  }

  const handleBackToHome = () => {
    setSelectedChat(null)
    setSelectedGroup(null)
  }

  const closeModals = () => {
    setShowCreateChatModal(false)
    setShowCreateGroupModal(false)
    setShowInviteModal(false)
    setSelectedGroupForInvite(null)
    resetGroupForm()
    resetChatForm()
  }

  const handleRequestsClick = () => {
    setShowRequests(true);
    setSelectedChat(null);
    setSelectedGroup(null);
  }

  const handleInviteToGroup = (group) => {
    setSelectedGroupForInvite(group);
    setShowInviteModal(true);
  }

  // Funzioni per gestire i membri del gruppo dinamicamente
  const addMemberField = () => {
    setGroupMembers([...groupMembers, '']);
    setMemberErrors([...memberErrors, '']);
  };

  const removeMemberField = (index) => {
    if (groupMembers.length > 1) {
      const newMembers = groupMembers.filter((_, i) => i !== index);
      const newErrors = memberErrors.filter((_, i) => i !== index);
      setGroupMembers(newMembers);
      setMemberErrors(newErrors);
    }
  };

  const updateMemberValue = (index, value) => {
    const newMembers = [...groupMembers];
    newMembers[index] = value;
    setGroupMembers(newMembers);
    
    // Pulisci l'errore quando l'utente modifica il campo
    const newErrors = [...memberErrors];
    newErrors[index] = '';
    setMemberErrors(newErrors);
  };

  const resetGroupForm = () => {
    setGroupMembers(['']);
    setMemberErrors([]);
    setGroupMessage('');
  };

  const resetChatForm = () => {
    setChatMessage('');
  };

  // Funzione per ricaricare le chat
  const reloadChats = async () => {
    const userEmail = localStorage.getItem('userEmail');
    if (!userEmail) return;

    try {
      const response = await fetch(`http://127.0.0.1:3000/chats?username=${encodeURIComponent(userEmail)}`);
      if (response.ok) {
        const chatsData = await response.json();
        setChats(mapChats(chatsData));
      }
    } catch (error) {
      console.error('Errore nel ricaricamento delle chat:', error);
    }
  }

  // Funzione per ricaricare i gruppi
  const reloadGroups = async () => {
    const userEmail = localStorage.getItem('userEmail');
    if (!userEmail) return;

    try {
      const groupsResponse = await fetch(`http://127.0.0.1:3000/groups?username=${encodeURIComponent(userEmail)}`);
      if (groupsResponse.ok) {
        const groupsData = await groupsResponse.json();
        setGroups(mapGroups(groupsData));
      }
    } catch (error) {
      console.error('Errore nel ricaricamento dei gruppi:', error);
    }
  }

  // Gestisce la creazione di una nuova chat
  const handleCreateChatSubmit = async (username) => {
    const token = localStorage.getItem('authToken');
    
    try {
      const response = await fetch('http://127.0.0.1:3000/create-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ username: username })
      });

      if (response.ok) {
        const result = await response.json();
        console.log('Chat gestita:', result);
        
        // Ricarica le chat per mostrare quella esistente o nuova
        await reloadChats();
        
        // Mostra messaggio nell'interfaccia
        const message = result.is_new 
          ? `Chat creata con ${result.target_user.name}!`
          : `Chat con ${result.target_user.name} già esistente. Apertura...`;
        
        setChatMessage(message);
        
        if (result.is_new) {
          // Chat nuova: apri immediatamente e chiudi modal dopo 2 secondi
          setSelectedChat({
            id: result.chat_id,
            name: result.target_user.name
          });
          
          setTimeout(() => {
            closeModals();
          }, 2000);
        } else {
          // Chat esistente: aspetta 2 secondi, poi apri e chiudi modal
          setTimeout(() => {
            setSelectedChat({
              id: result.chat_id,
              name: result.target_user.name
            });
            closeModals();
          }, 2000);
        }
      } else {
        const errorText = await response.text();
        console.error('Errore creazione chat:', errorText);
        setChatMessage(`Errore: ${errorText}`);
      }
    } catch (error) {
      console.error('Errore di rete:', error);
      setChatMessage('Errore di connessione');
    }
  }

  // Gestisce la creazione di un nuovo gruppo
  const handleCreateGroupSubmit = async (groupName) => {
    const token = localStorage.getItem('authToken');
    
    try {
      // Prima verifica tutti gli username prima di creare il gruppo
      const validMembers = [];
      const newErrors = [...memberErrors];
      
      // Se non ci sono membri da invitare, crea il gruppo vuoto
      if (groupMembers.every(member => !member.trim())) {
        // Crea gruppo vuoto (solo admin)
        const response = await fetch('http://127.0.0.1:3000/create-group', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ 
            name: groupName, 
            members: []
          })
        });

        if (response.ok) {
          await reloadGroupsAndClose(groupName, []);
        } else {
          const errorText = await response.text();
          console.error('Errore creazione gruppo:', errorText);
          notify.error(`Errore: ${errorText}`);
        }
        return;
      }
      
      // Verifica tutti gli username
      for (let i = 0; i < groupMembers.length; i++) {
        const username = groupMembers[i].trim();
        if (!username) continue;
        
        try {
          // Verifica se l'utente esiste (usando l'endpoint per verificare username)
          const checkResponse = await fetch(`http://127.0.0.1:3000/check-user?username=${encodeURIComponent(username)}`, {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });

          if (checkResponse.ok) {
            validMembers.push(username);
            newErrors[i] = '';
          } else {
            const errorText = await checkResponse.text();
            if (errorText.includes('non trovato')) {
              newErrors[i] = `Username "${username}" non trovato`;
            } else {
              newErrors[i] = `Errore per "${username}": ${errorText}`;
            }
          }
        } catch (error) {
          newErrors[i] = `Errore di connessione per "${username}"`;
        }
      }
      
      setMemberErrors(newErrors);
      
      // Se non ci sono utenti validi, non creare il gruppo
      if (validMembers.length === 0) {
        console.log('Nessun utente valido trovato, gruppo non creato');
        return; // Mantieni il modal aperto con gli errori
      }
      
      // Se ci sono utenti validi, crea il gruppo
      const response = await fetch('http://127.0.0.1:3000/create-group', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ 
          name: groupName, 
          members: [] // Nessun membro iniziale, solo l'admin
        })
      });

      if (response.ok) {
        const result = await response.json();
        console.log('Gruppo creato:', result);
        
        // Invia richieste solo agli utenti validi
        for (let i = 0; i < groupMembers.length; i++) {
          const username = groupMembers[i].trim();
          if (!username || !validMembers.includes(username)) continue;
          
          try {
            const inviteResponse = await fetch('http://127.0.0.1:3000/create-group-request', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
              },
              body: JSON.stringify({
                to_username: username,
                group_id: result.group_id
              })
            });

            if (!inviteResponse.ok) {
              const errorText = await inviteResponse.text();
              if (errorText.includes('già esistente') || errorText.includes('già gestita')) {
                newErrors[i] = `Richiesta già inviata a "${username}"`;
              } else {
                newErrors[i] = `Errore invito per "${username}": ${errorText}`;
              }
            }
          } catch (error) {
            newErrors[i] = `Errore di connessione per "${username}"`;
          }
        }
        
        setMemberErrors(newErrors);
        await reloadGroupsAndClose(groupName, validMembers);
      } else {
        const errorText = await response.text();
        console.error('Errore creazione gruppo:', errorText);
        notify.error(`Errore: ${errorText}`);
      }
    } catch (error) {
      console.error('Errore di rete:', error);
      notify.error('Errore di connessione');
    }
  }

  // Funzione helper per ricaricare i gruppi e chiudere il modal
  const reloadGroupsAndClose = async (groupName, validMembers) => {
    // Ricarica i gruppi per mostrare il nuovo
    await reloadGroups();
    
    // Mostra messaggio di successo nell'interfaccia
    let message = `Gruppo "${groupName}" creato con successo!`;
    if (validMembers.length > 0) {
      message += ` Richieste inviate a: ${validMembers.join(', ')}`;
    }
    setGroupMessage(message);
    
    // Chiudi modal dopo un breve delay per mostrare il messaggio
    setTimeout(() => {
      closeModals();
    }, 2000);
  }

  // Gestisce l'invio di inviti al gruppo
  const handleSendGroupInvite = async (username) => {
    const token = localStorage.getItem('authToken');
    
    if (!selectedGroupForInvite) {
      notify.warning('Nessun gruppo selezionato');
      return;
    }
    
    try {
      const response = await fetch('http://127.0.0.1:3000/create-group-request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          to_username: username,
          group_id: selectedGroupForInvite.id
        })
      });

      if (response.ok) {
        const result = await response.json();
        notify.success(`Invito inviato a ${username} per il gruppo "${selectedGroupForInvite.name}"!`);
        console.log('Invito inviato:', result);
      } else {
        const errorText = await response.text();
        console.error('Errore invio invito:', errorText);
        notify.error(`Errore: ${errorText}`);
      }
    } catch (error) {
      console.error('Errore di rete:', error);
      notify.error('Errore di connessione');
    }
  }
  

  if (loading) {
    return (
      <div className="home-loading">
        <div className="loading-spinner">...</div>
        <p>Caricamento...</p>
      </div>
    )
  }

  // Se una chat è selezionata, mostra ChatView
  if (selectedChat) {
    return (
      <ChatView 
        chatId={selectedChat.id}
        chatName={selectedChat.name}
        onBack={handleBackToHome}
      />
    )
  }

  // Se un gruppo è selezionato, mostra GroupView
  if (selectedGroup) {
    return (
      <GroupView 
        groupId={selectedGroup.id}
        groupName={selectedGroup.name}
        onBack={handleBackToHome}
      />
    )
  }


  if (showRequests) {
    return <RequestPage onBack={() => { setShowRequests(false); reloadGroups(); }} onRefreshGroups={reloadGroups} />;
  }


  return (
    <div className="home-container">
      <nav className="navbar">
        <div className="navbar-brand">
          <h2>Ruggine Chat</h2>
        </div>
        <div className="navbar-user">
          <span className="user-info">{localStorage.getItem('userEmail') || 'user@example.com'}</span>
          <button onClick={onLogout} className="logout-button">
            Logout
          </button>
        </div>
      </nav>

      <main className="home-main">
        {/* Sezione Azioni */}
        <section className="actions-section">
          <h3>Azioni Rapide</h3>
          <div className="action-buttons" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
            <button onClick={handleCreateChat} className="action-button create-chat" style={{ width: '100%', backgroundColor: '#28a745', color: '#fff' }}>
              Crea Chat
            </button>
            <button onClick={handleCreateGroup} className="action-button create-chat" style={{ width: '100%', backgroundColor: '#28a745', color: '#fff' }}>
              Crea Gruppo
            </button>
            <button 
              onClick={handleRequestsClick} 
              className="action-button request-button" 
              style={{ width: '100%' }}
            >
              Richieste
            </button>
          </div>
        </section>

        {/* Sezione Chat */}
        <section className="chats-section">
          <h3>Le tue Chat</h3>
          {chats.length > 0 ? (
            <div className="chat-list">
              {chats.map(chat => (
                <div 
                  key={chat.id} 
                  className="chat-item"
                  onClick={() => handleChatClick(chat)}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="chat-avatar">{chat.avatar}</div>
                  <div className="chat-content">
                    <div className="chat-header">
                      <h4 className="chat-name">{chat.name}</h4>
                      <span className="chat-time">{chat.timestamp}</span>
                    </div>
                    <p className="chat-last-message">{chat.lastMessage}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <p>Nessuna chat ancora. Crea la tua prima chat!</p>
            </div>
          )}
        </section>

        {/* Sezione Gruppi */}
        <section className="groups-section">
          <h3>I tuoi Gruppi</h3>
          {groups.length > 0 ? (
            <div className="group-list">
              {groups.map(group => (
                <div 
                  key={group.id} 
                  className="group-item"
                  style={{ cursor: 'pointer', position: 'relative' }}
                >
                  <div 
                    onClick={() => handleGroupClick(group)}
                    style={{ display: 'flex', flex: 1 }}
                  >
                    <div className="group-avatar">{group.avatar}</div>
                    <div className="group-content">
                      <div className="group-header">
                        <h4 className="group-name">{group.name}</h4>
                        <span className="group-time">{group.timestamp}</span>
                      </div>
                      <p className="group-last-message">{group.lastMessage}</p>
                      <span className="group-members">{group.members} membri</span>
                    </div>
                  </div>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      handleInviteToGroup(group);
                    }}
                    className="action-button create-chat"
                    style={{ 
                      position: 'absolute', 
                      right: '8px', 
                      top: '50%', 
                      transform: 'translateY(-50%)',
                      padding: '6px 12px',
                      fontSize: '0.8em',
                      minWidth: 'auto'
                    }}
                    title="Invita utente al gruppo"
                  >
                    Invita
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <p>Nessun gruppo ancora. Crea il tuo primo gruppo!</p>
            </div>
          )}
        </section>
      </main>

      {/* Modali */}
      {showCreateChatModal && (
  <div className="modal-overlay" onClick={closeModals}>
    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
      <h3>Crea Nuova Chat</h3>

      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const username = e.target.username.value.trim();
          if (!username) return;
          
          await handleCreateChatSubmit(username);
          
          // La logica per chiudere il modal è ora gestita dentro handleCreateChatSubmit
        }}
      >
        <label htmlFor="username">Con chi vuoi chattare?</label>
        <input
          type="text"
          id="username"
          name="username"
          placeholder="Inserisci username"
          required
          className="modal-input"
        />

        {chatMessage && (
          <div className={`message ${chatMessage.includes('creata') || chatMessage.includes('esistente') ? 'success' : 'error'}`} style={{ marginTop: '16px' }}>
            {chatMessage}
          </div>
        )}

       <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
          <button type="submit" className="action-button create-chat" style={{ flex: 1 }}>
            Crea
          </button>
          <button type="button" onClick={closeModals} className="action-button create-group" style={{ flex: 1 }}>
            Annulla
          </button>
        </div>
      </form>
    </div>
  </div>
)}


{showCreateGroupModal && (
  <div className="modal-overlay" onClick={closeModals}>
    <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxHeight: '80vh', overflowY: 'auto' }}>
      <h3>Crea Nuovo Gruppo</h3>

      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const groupName = e.target.groupName.value.trim();
          
          if (!groupName) return;
          
          await handleCreateGroupSubmit(groupName);
          
          // La logica per chiudere il modal è ora gestita dentro handleCreateGroupSubmit
        }}
      >
        <label htmlFor="groupName">Nome del gruppo</label>
        <input
          type="text"
          id="groupName"
          name="groupName"
          placeholder="Inserisci nome gruppo"
          required
          className="modal-input"
          style={{ marginBottom: '16px' }}
        />

        <div style={{ marginBottom: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <label>Membri da invitare (opzionale)</label>
            <button 
              type="button" 
              onClick={addMemberField}
              className="action-button create-chat"
              style={{ 
                padding: '4px 8px', 
                fontSize: '0.8em', 
                minWidth: 'auto',
                backgroundColor: '#28a745',
                border: 'none'
              }}
            >
              Aggiungi
            </button>
          </div>
          
          {groupMembers.map((member, index) => (
            <div key={index} style={{ display: 'flex', gap: '8px', marginBottom: '8px', alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <input
                  type="text"
                  value={member}
                  onChange={(e) => updateMemberValue(index, e.target.value)}
                  placeholder={`Username membro ${index + 1}`}
                  className="modal-input"
                  style={{ 
                    marginBottom: memberErrors[index] ? '4px' : '0',
                    borderColor: memberErrors[index] ? '#dc3545' : undefined
                  }}
                />
                {memberErrors[index] && (
                    <div style={{ 
                    fontSize: '0.8em', 
                    color: '#dc3545', 
                    marginBottom: '4px',
                    padding: '2px 4px'
                  }}>
                    {memberErrors[index]}
                  </div>
                )}
              </div>
              
              {groupMembers.length > 1 && (
                <button 
                  type="button" 
                  onClick={() => removeMemberField(index)}
                  style={{ 
                    backgroundColor: '#dc3545',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '6px 10px',
                    cursor: 'pointer',
                    fontSize: '0.8em'
                  }}
                >
                  Rimuovi
                </button>
              )}
            </div>
          ))}
          
          <div style={{ fontSize: '0.8em', color: '#666', marginTop: '8px' }}>
            Suggerimento: Il gruppo verrà creato solo con te come admin. Gli inviti verranno inviati agli utenti inseriti.
          </div>
        </div>

        {groupMessage && (
          <div className="message success" style={{ marginTop: '16px' }}>
            {groupMessage}
          </div>
        )}

        <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
          <button type="submit" className="action-button create-chat" style={{ flex: 1 }}>
            Crea Gruppo
          </button>
          <button type="button" onClick={closeModals} className="action-button create-group" style={{ flex: 1 }}>
            Annulla
          </button>
        </div>
      </form>
    </div>
  </div>
)}

{showInviteModal && selectedGroupForInvite && (
  <div className="modal-overlay" onClick={closeModals}>
    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
      <h3>Invita al Gruppo</h3>
      <p style={{ marginBottom: '16px', color: '#666' }}>
        Invita un utente nel gruppo <strong>"{selectedGroupForInvite.name}"</strong>
      </p>

      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const username = e.target.username.value.trim();
          if (!username) return;
          
          await handleSendGroupInvite(username);
          closeModals();
        }}
      >
        <label htmlFor="invite-username">Username dell'utente da invitare</label>
        <input
          type="text"
          id="invite-username"
          name="username"
          placeholder="Inserisci username (es. mario@mail.com)"
          required
          className="modal-input"
          style={{ marginBottom: '16px' }}
        />

        <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
          <button type="submit" className="action-button create-chat" style={{ flex: 1 }}>
            Invia Invito
          </button>
          <button type="button" onClick={closeModals} className="action-button create-group" style={{ flex: 1 }}>
            Annulla
          </button>
        </div>
      </form>
    </div>
  </div>
)}

    </div>
  )
}

export default Home

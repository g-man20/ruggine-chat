import React, { useEffect, useState } from 'react';

const MqttNotifications = ({ onNewMessage, onUserStatusChange }) => {
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    const handleMqttMessage = (event) => {
      const { topic, data } = event.detail;
      
      // Gestisci diversi tipi di notifiche
      switch (data.type) {
        case 'private_message':
          console.log('Nuovo messaggio privato MQTT:', data);
          setNotifications(prev => [...prev, {
            id: Date.now(),
            type: 'message',
            content: `Nuovo messaggio da ${data.from}: ${data.content || data.message}`,
            timestamp: new Date()
          }]);
          
          // Callback per ricaricare i messaggi
          if (onNewMessage) {
            onNewMessage(data);
          }
          break;
          
        case 'group_message':
          console.log('Nuovo messaggio di gruppo:', data);
          {
            const label = data.group_name ? data.group_name : `Gruppo ${data.group_id}`;
            setNotifications(prev => [...prev, {
              id: Date.now(),
              type: 'message',
              content: `Messaggio dal gruppo ${label}`,
              timestamp: new Date()
            }]);
          }
          
          if (onNewMessage) {
            onNewMessage(data);
          }
          break;
          
        case 'user_status':
          console.log('Cambio stato utente:', data);
          if (onUserStatusChange) {
            onUserStatusChange(data);
          }
          break;
          
        default:
          console.log('Messaggio MQTT sconosciuto:', data);
      }
    };

    window.addEventListener('mqttMessage', handleMqttMessage);
    
    return () => {
      window.removeEventListener('mqttMessage', handleMqttMessage);
    };
  }, [onNewMessage, onUserStatusChange]);

  // Auto-rimuovi notifiche dopo 5 secondi
  useEffect(() => {
    notifications.forEach(notification => {
      const timer = setTimeout(() => {
        setNotifications(prev => prev.filter(n => n.id !== notification.id));
      }, 5000);
      
      return () => clearTimeout(timer);
    });
  }, [notifications]);

  return (
    <div className="mqtt-notifications">
      {notifications.map(notification => (
        <div 
          key={notification.id}
          className={`notification notification-${notification.type}`}
          style={{
            position: 'fixed',
            top: '20px',
            right: '20px',
            background: '#007bff',
            color: 'white',
            padding: '10px 15px',
            borderRadius: '5px',
            marginBottom: '10px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
            zIndex: 1000,
            maxWidth: '300px',
            fontSize: '14px'
          }}
        >
          <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>
            {notification.type === 'message' ? 'Nuovo Messaggio' : 
             notification.type === 'group' ? 'Messaggio Gruppo' : 'Notifica'}
          </div>
          <div>{notification.content}</div>
          <div style={{ fontSize: '12px', opacity: 0.8, marginTop: '5px' }}>
            {notification.timestamp.toLocaleTimeString()}
          </div>
        </div>
      ))}
    </div>
  );
};

export default MqttNotifications;
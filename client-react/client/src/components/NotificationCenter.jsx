import React, { useEffect, useState } from 'react';
import '../css/NotificationCenter.css';

function NotificationCenter() {
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    const handleShowNotification = (event) => {
      const { id, message, type, duration } = event.detail;
      
      const notification = {
        id: id || Date.now(),
        message,
        type: type || 'info', // 'info', 'success', 'error', 'warning'
        duration: duration || 3000
      };

      setNotifications(prev => [...prev, notification]);

      // Auto-remove notification after duration
      if (notification.duration) {
        setTimeout(() => {
          removeNotification(notification.id);
        }, notification.duration);
      }
    };

    window.addEventListener('showNotification', handleShowNotification);
    return () => window.removeEventListener('showNotification', handleShowNotification);
  }, []);

  const removeNotification = (id) => {
    setNotifications(prev => prev.filter(notif => notif.id !== id));
  };

  return (
    <div className="notification-container">
      {notifications.map(notif => (
        <div key={notif.id} className={`notification notification-${notif.type}`}>
          <div className="notification-content">
            {notif.type === 'success' && <span className="notification-icon">OK</span>}
            {notif.type === 'error' && <span className="notification-icon">ERR</span>}
            {notif.type === 'warning' && <span className="notification-icon">WARN</span>}
            {notif.type === 'info' && <span className="notification-icon">INFO</span>}
            <p className="notification-message">{notif.message}</p>
          </div>
          <button 
            className="notification-close"
            onClick={() => removeNotification(notif.id)}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}

export default NotificationCenter;

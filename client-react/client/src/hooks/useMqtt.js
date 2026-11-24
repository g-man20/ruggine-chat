import { useEffect, useRef, useState } from 'react';
import mqtt from 'mqtt';

export const useMqtt = (username) => {
  const clientRef = useRef(null);
  const [isConnected, setIsConnected] = useState(false);
  const [messages, setMessages] = useState([]);
  const [connectionAttempts, setConnectionAttempts] = useState(0);
  const maxConnectionAttempts = 3;

  useEffect(() => {
    if (!username) return;

    // Se abbiamo già provato troppe volte, non riconnettere automaticamente
    if (connectionAttempts >= maxConnectionAttempts) {
      console.log('Troppi tentativi di connessione MQTT falliti. Modalità offline.');
      return;
    }

    const brokerUrl = 'ws://localhost:8080';
    
    console.log(`Tentativo connessione MQTT ${connectionAttempts + 1}/${maxConnectionAttempts} a ${brokerUrl}...`);
    
    const client = mqtt.connect(brokerUrl, {
      clientId: `chat_client_${username}_${Date.now()}`,
      clean: true,
      connectTimeout: 5000,
      reconnectPeriod: 0,
    });

    const connectionTimeout = setTimeout(() => {
      if (!isConnected) {
        console.log('Timeout connessione MQTT');
        client.end(true);
        setConnectionAttempts(prev => prev + 1);
      }
    }, 5000);

    client.on('connect', () => {
      console.log('Connesso a MQTT broker (Mosquitto)');
      setIsConnected(true);
      setConnectionAttempts(0);
      clearTimeout(connectionTimeout);
      
      // Sanitizza il nome utente per il topic (stesso modo del backend)
      const safeUsername = username.replace(/@/g, "_").replace(/\./g, "_");
      const privateChannel = `chat/user/${safeUsername}`;
      const statusChannel = 'chat/status';
      
      client.subscribe([privateChannel, statusChannel], (err) => {
        if (err) {
          console.error('Errore sottoscrizione MQTT:', err);
        } else {
          console.log(`Sottoscritto a: ${privateChannel}, ${statusChannel}`);
        }
      });
    });

    client.on('message', (topic, message) => {
      try {
        const data = JSON.parse(message.toString());
        console.log('Messaggio MQTT ricevuto:', { topic, data });
        
        setMessages(prev => [...prev, { topic, data, timestamp: Date.now() }]);
        
        window.dispatchEvent(new CustomEvent('mqttMessage', {
          detail: { topic, data }
        }));
        
      } catch (error) {
        console.error('Errore parsing messaggio MQTT:', error);
      }
    });

    client.on('error', (error) => {
      console.error('Errore MQTT:', error);
      setIsConnected(false);
      clearTimeout(connectionTimeout);
      
      if (error.message?.includes('WebSocket') || error.code === 'ECONNREFUSED') {
        setConnectionAttempts(prev => prev + 1);
      }
    });

    client.on('close', () => {
      console.log('Connessione MQTT chiusa');
      setIsConnected(false);
      clearTimeout(connectionTimeout);
    });

    client.on('offline', () => {
      console.log('MQTT offline');
      setIsConnected(false);
      setConnectionAttempts(prev => prev + 1);
    });

    clientRef.current = client;

    return () => {
      clearTimeout(connectionTimeout);
      if (clientRef.current) {
        clientRef.current.end();
        clientRef.current = null;
      }
    };
  }, [username, connectionAttempts]);

  return {
    isConnected,
    messages,
    connectionAttempts,
    maxAttempts: maxConnectionAttempts,
    client: clientRef.current
  };
};
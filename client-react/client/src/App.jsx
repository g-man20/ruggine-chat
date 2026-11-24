import { useState, useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import './App.css'
import Login from './components/Login'
import Registration from './components/Registration'
import Home from './components/Home'
import NotFound from './components/NotFound'
import NotificationCenter from './components/NotificationCenter'
import MqttNotifications from './components/MqttNotifications'
import { useMqtt } from './hooks/useMqtt'

// Componente Welcome Page
function WelcomePage({ onLogin, onRegister }) {
  return (
    <div className="app">
      <header className="app-header">
        <h1>Ruggine Chat</h1>
        <p>Benvenuto nell'applicazione di chat Ruggine</p>
      </header>
      
      <main className="app-main">
        <div className="navigation">
          <button onClick={onLogin} className="login-link">
            Accedi
          </button>
          <button onClick={onRegister} className="register-link">
            Registrati
          </button>
        </div>
        
        <div className="info">
          <p>Effettua il login per iniziare a chattare con i tuoi amici!</p>
          <p>Non hai ancora un account? Registrati per iniziare!</p>
        </div>
      </main>
    </div>
  )
}

// Componente principale con logica di autenticazione
function AppContent() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [currentUser, setCurrentUser] = useState(null)
  const navigate = useNavigate()
  
  // Inizializza MQTT solo se l'utente è autenticato
  const { isConnected: mqttConnected } = useMqtt(
    isAuthenticated ? currentUser : null
  )

  // Check if user is already logged in on app start
  useEffect(() => {
    const validateExistingToken = async () => {
      const token = localStorage.getItem('authToken')
      const userEmail = localStorage.getItem('userEmail')
      
      if (!token) {
        return // Nessun token, rimani sulla welcome page
      }

      try {
        const response = await fetch('http://127.0.0.1:3000/validate-token', {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        })

        if (response.ok) {
          const result = await response.json()
          if (result.valid) {
            // Token valido, vai alla home
            setIsAuthenticated(true)
            setCurrentUser(userEmail)
            navigate('/home')
          } else {
            // Token non valido, pulisci localStorage
            localStorage.removeItem('authToken')
            localStorage.removeItem('userEmail')
          }
        } else {
          // Errore nella validazione, pulisci localStorage
          localStorage.removeItem('authToken')
          localStorage.removeItem('userEmail')
        }
      } catch (error) {
        console.error('Errore nella validazione del token:', error)
        // Errore di rete, pulisci localStorage
        localStorage.removeItem('authToken')
        localStorage.removeItem('userEmail')
      }
    }

    validateExistingToken()
  }, [])

  const handleLogin = () => {
    const userEmail = localStorage.getItem('userEmail')
    setIsAuthenticated(true)
    setCurrentUser(userEmail)
    navigate('/home')
  }

  const handleLogout = () => {
    localStorage.removeItem('authToken')
    localStorage.removeItem('userEmail')
    setIsAuthenticated(false)
    setCurrentUser(null)
    navigate('/')
  }

  // Gestisci notifiche MQTT per ricaricare i messaggi
  const handleNewMessage = (data) => {
    console.log('Ricaricamento messaggi per nuova notifica:', data)
    // Qui puoi implementare la logica per ricaricare i messaggi
    // Ad esempio, trigger un refresh dei componenti Chat/Group
    window.dispatchEvent(new CustomEvent('refreshMessages', { detail: data }))
  }

  const handleUserStatusChange = (data) => {
    console.log('Cambio stato utente:', data)
    // Aggiorna lo stato degli utenti online/offline
  }

  return (
    <>
      <Routes>
        {/* Route principale / welcome */}
        <Route 
          path="/" 
          element={
            <WelcomePage 
              onLogin={() => navigate('/login')} 
              onRegister={() => navigate('/registration')} 
            />
          } 
        />
        
        {/* Route login */}
        <Route 
          path="/login" 
          element={<Login onBack={() => navigate('/')} onLogin={handleLogin} />} 
        />
        
        {/* Route registrazione */}
        <Route 
          path="/registration" 
          element={<Registration onBack={() => navigate('/')} />} 
        />
        
        {/* Route home (protetta) */}
        <Route 
          path="/home" 
          element={
            isAuthenticated ? (
              <Home onLogout={handleLogout} />
            ) : (
              <Navigate to="/login" replace />
            )
          } 
        />
        
        {/* Route per path non esistenti - mostra NotFound */}
        <Route path="*" element={<NotFound />} />
      </Routes>

      {/* Componenti MQTT sempre attivi se autenticato */}
      {isAuthenticated && (
        <>
          <MqttNotifications 
            onNewMessage={handleNewMessage}
            onUserStatusChange={handleUserStatusChange}
          />
          {/* Indicatore stato MQTT */}
          <div style={{
            position: 'fixed',
            bottom: '20px',
            left: '20px',
            padding: '8px 12px',
            background: mqttConnected ? '#28a745' : '#dc3545',
            color: 'white',
            borderRadius: '20px',
            fontSize: '12px',
            zIndex: 1000
          }}>
            MQTT: {mqttConnected ? 'Connesso' : 'Disconnesso'}
          </div>
        </>
      )}
    </>
  )
}

// Componente App principale con Router wrapper
function App() {
  return (
    <Router>
      <NotificationCenter />
      <AppContent />
    </Router>
  )
}

export default App

// Commentiamo temporaneamente il broker MQTT per far partire il server
// Il file mqtt_broker.rs ha errori nell'API di rumqttd

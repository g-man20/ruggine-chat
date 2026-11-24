import React from 'react';
import { useNavigate } from 'react-router-dom';

function NotFound() {
  const navigate = useNavigate();

  return (
    <div className="app" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
      <header style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '4rem', color: '#646cff', margin: '0' }}>404</h1>
        <h2 style={{ color: '#374151', margin: '1rem 0' }}>Pagina Non Trovata</h2>
      </header>
      
      <main style={{ maxWidth: '500px', padding: '2rem' }}>
        <p className="lead" style={{ fontSize: '1.2rem', color: '#6b7280', marginBottom: '2rem' }}>
          Ops! Non c'è nulla da vedere qui... Questa non è la pagina che stai cercando!
        </p>
        
        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <button 
            onClick={() => navigate('/')} 
            className="login-link"
            style={{
              background: '#646cff',
              color: 'white',
              padding: '1rem 2rem',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '1rem',
              textDecoration: 'none'
            }}
          >
            Torna alla Home
          </button>
          
          <button 
            onClick={() => navigate('/login')} 
            className="register-link"
            style={{
              background: '#10b981',
              color: 'white',
              padding: '1rem 2rem',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '1rem',
              textDecoration: 'none'
            }}
          >
            Accedi
          </button>
        </div>
        
        <div style={{ marginTop: '2rem', padding: '1rem', background: '#f8f9fa', borderRadius: '8px', fontSize: '0.9rem', color: '#6b7280' }}>
          <strong>Suggerimento:</strong> Verifica l'URL o torna alla pagina principale per continuare la navigazione.
        </div>
      </main>
    </div>
  );
}

export default NotFound;
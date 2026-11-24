import { useState } from 'react'
import '../css/Login.css'
import '../css/Home.css' // Import per stili .message

function Login({ onBack, onLogin }) {
  const [formData, setFormData] = useState({
    username: '',
    password: ''
  })
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setMessage('')

    // Validazione email
    if (!formData.username.includes('@') || !formData.username.includes('.')) {
      setMessage('Inserisci un indirizzo email valido')
      setLoading(false)
      return
    }

    try {
      const response = await fetch('http://127.0.0.1:3000/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: formData.username,
          password: formData.password
        })
      })

      const result = await response.text()
      
      if (response.ok) {
        if (result.startsWith('JWT:')) {
          const token = result.replace('JWT: ', '')
          // Salva il token e user info
          localStorage.setItem('authToken', token)
          localStorage.setItem('userEmail', formData.username)
          
          setMessage(`Login effettuato con successo!`)
          console.log('Token JWT:', token)
          
          // Naviga alla Home dopo 1 secondo
          setTimeout(() => {
            onLogin()
          }, 1000)
        } else {
          setMessage(result)
        }
      } else {
        setMessage(result)
      }
    } catch (error) {
      setMessage(`Errore di connessione: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-container">
      <header className="login-header">
        <h1>Accedi</h1>
        <p>Accedi al tuo account Ruggine Chat</p>
      </header>

      <form className="login-form" onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="username">Email</label>
          <input
            type="email"
            id="username"
            name="username"
            value={formData.username}
            onChange={handleChange}
            required
            placeholder="esempio@email.com"
          />
        </div>

        <div className="form-group">
          <label htmlFor="password">Password</label>
          <input
            type="password"
            id="password"
            name="password"
            value={formData.password}
            onChange={handleChange}
            required
            placeholder="Inserisci la tua password"
          />
        </div>

        <button 
          type="submit" 
          className="submit-button"
          disabled={loading}
        >
          {loading ? 'Accesso...' : 'Accedi'}
        </button>

        {message && (
          <div className={`message ${message.includes('Login effettuato con successo') ? 'success' : 'error'}`}>
            {message}
          </div>
        )}
      </form>

      <div className="navigation-links">
        <button onClick={onBack} className="back-link">← Torna alla Home</button>
        <span className="register-prompt">
          Non hai ancora un account? Usa il pulsante Registrati dalla home
        </span>
      </div>
    </div>
  )
}

export default Login
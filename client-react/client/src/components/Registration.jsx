import { useState } from 'react'
import '../css/Registration.css'
import '../css/Home.css' // Import per stili .message

function Registration({ onBack }) {
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    username: '',
    password: '',
    confirmPassword: ''
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

    // Validazione password
    if (formData.password !== formData.confirmPassword) {
      setMessage('Le password non corrispondono')
      setLoading(false)
      return
    }

    // Validazione email
    if (!formData.username.includes('@') || !formData.username.includes('.')) {
      setMessage('Inserisci un indirizzo email valido')
      setLoading(false)
      return
    }

    try {
      const response = await fetch('http://127.0.0.1:3000/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          first_name: formData.first_name,
          last_name: formData.last_name,
          username: formData.username,
          password: formData.password
        })
      })

      const result = await response.text()
      
      if (response.ok) {
        // Check if it's a success message or a warning (like email already exists)
        if (result.includes("è già stata registrata")) {
          setMessage(result) // Warning message without tick
        } else {
          setMessage(result) // Success message without tick
        }
        // Reset form only on actual success
        if (!result.includes("è già stata registrata")) {
          setFormData({
            first_name: '',
            last_name: '',
            username: '',
            password: '',
            confirmPassword: ''
          })
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
    <div className="registration-container">
      <header className="registration-header">
        <h1>Registrazione</h1>
        <p>Crea il tuo account per Ruggine Chat</p>
      </header>

      <form className="registration-form" onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="first_name">Nome</label>
          <input
            type="text"
            id="first_name"
            name="first_name"
            value={formData.first_name}
            onChange={handleChange}
            required
            placeholder="Inserisci il tuo nome"
          />
        </div>

        <div className="form-group">
          <label htmlFor="last_name">Cognome</label>
          <input
            type="text"
            id="last_name"
            name="last_name"
            value={formData.last_name}
            onChange={handleChange}
            required
            placeholder="Inserisci il tuo cognome"
          />
        </div>

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
            minLength="6"
            placeholder="Inserisci la password (min. 6 caratteri)"
          />
        </div>

        <div className="form-group">
          <label htmlFor="confirmPassword">Conferma Password</label>
          <input
            type="password"
            id="confirmPassword"
            name="confirmPassword"
            value={formData.confirmPassword}
            onChange={handleChange}
            required
            minLength="6"
            placeholder="Ripeti la password"
          />
        </div>

        <button 
          type="submit" 
          className="submit-button"
          disabled={loading}
        >
          {loading ? 'Registrazione...' : 'Registrati'}
        </button>

        {message && (
          <div className={`message ${
            message.includes('registrato con successo') ? 'success' : 
            message.includes('è già stata registrata') ? 'warning' :
            'error'
          }`}>
            {message}
          </div>
        )}
      </form>

      <div className="navigation-links">
        <button onClick={onBack} className="back-link">← Torna alla Home</button>
        <span className="login-prompt">Hai già un account? Usa il pulsante Accedi dalla home</span>
      </div>
    </div>
  )
}

export default Registration

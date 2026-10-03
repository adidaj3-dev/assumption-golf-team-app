import { useState } from 'react'
import { supabase } from '../supabaseClient.js'
import { colors, fonts, SEAL_URL, HERO_TEE_URL } from '../theme.js'

export default function Login() {
  const [mode, setMode] = useState('signin') // 'signin' or 'signup'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [team, setTeam] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [checkEmail, setCheckEmail] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      if (mode === 'signup') {
        const { data, error: signUpError } = await supabase.auth.signUp({ email, password })
        if (signUpError) throw signUpError

        // Create the matching row in the players table.
        // Note: with email confirmation enabled (Supabase default), data.user
        // exists but the session is null until the player clicks the
        // confirmation link in their email — this insert still works because
        // it runs under the newly-created user's own id.
        if (data.user) {
          const { error: insertError } = await supabase
            .from('players')
            .insert({ id: data.user.id, full_name: fullName, role: 'player', team })
          if (insertError) throw insertError
        }

        if (!data.session) {
          setCheckEmail(true)
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
        if (signInError) throw signInError
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (checkEmail) {
    return (
      <div style={styles.backdrop}>
        <div style={styles.page}>
          <h2>Check your email</h2>
          <p>We sent a confirmation link to {email}. Click it, then come back here and sign in.</p>
          <button style={styles.linkBtn} onClick={() => { setCheckEmail(false); setMode('signin') }}>
            Back to sign in
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={styles.backdrop}>
      <div style={styles.page}>
        <div style={styles.brandRow}>
          <img src={SEAL_URL} alt="Assumption University" style={styles.seal} />
          <div>
            <div style={styles.eyebrow}>ASSUMPTION GREYHOUNDS</div>
            <h2 style={styles.heading}>{mode === 'signin' ? 'Sign in' : 'Create account'}</h2>
          </div>
        </div>

      <form onSubmit={handleSubmit}>
        {mode === 'signup' && (
          <>
            <label style={styles.label}>Full name</label>
            <input
              style={styles.input}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />

            <label style={styles.label}>Team</label>
            <select
              style={styles.input}
              value={team}
              onChange={(e) => setTeam(e.target.value)}
              required
            >
              <option value="" disabled>Select your team…</option>
              <option value="men">Men's Team</option>
              <option value="women">Women's Team</option>
            </select>
          </>
        )}

        <label style={styles.label}>Email</label>
        <input
          type="email"
          style={styles.input}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <label style={styles.label}>Password</label>
        <input
          type="password"
          style={styles.input}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={6}
          required
        />

        {error && <p style={styles.error}>{error}</p>}

        <button style={styles.button} disabled={loading}>
          {loading ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Sign up'}
        </button>
      </form>

      <button
        style={styles.linkBtn}
        onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
      >
        {mode === 'signin' ? "Need an account? Sign up" : 'Already have an account? Sign in'}
      </button>
      </div>
    </div>
  )
}

const styles = {
  backdrop: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '1.5rem 1rem',
    backgroundImage: `linear-gradient(160deg, rgba(0,75,135,0.88), rgba(0,50,92,0.93)), url(${HERO_TEE_URL})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
  },
  page: {
    fontFamily: fonts.body,
    padding: '2rem 1.75rem',
    maxWidth: 380,
    width: '100%',
    background: colors.white,
    borderRadius: '1rem',
    boxShadow: '0 12px 40px rgba(0,0,0,0.35)',
  },
  brandRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.9rem',
    marginBottom: '1.25rem',
  },
  seal: { width: 48, height: 48, objectFit: 'contain', flexShrink: 0 },
  eyebrow: {
    color: colors.textMuted,
    fontSize: '0.65rem',
    fontWeight: 700,
    letterSpacing: '0.09em',
  },
  heading: { margin: '0.15rem 0 0', fontSize: '1.25rem' },
  label: { display: 'block', marginTop: '1rem', fontWeight: 600, color: colors.black },
  input: {
    width: '100%',
    padding: '0.75rem',
    fontSize: '1.1rem',
    marginTop: '0.25rem',
    boxSizing: 'border-box',
    border: `1px solid ${colors.gray}`,
    borderRadius: '0.4rem',
  },
  button: {
    width: '100%',
    padding: '1rem',
    marginTop: '1.5rem',
    background: colors.primary,
    color: colors.white,
    border: 'none',
    borderRadius: '0.5rem',
    fontSize: '1.1rem',
    fontWeight: 600,
  },
  linkBtn: {
    width: '100%',
    marginTop: '1rem',
    background: 'none',
    border: 'none',
    color: colors.primary,
    textDecoration: 'underline',
    fontSize: '0.95rem',
  },
  error: { color: colors.error, marginTop: '0.75rem' },
}

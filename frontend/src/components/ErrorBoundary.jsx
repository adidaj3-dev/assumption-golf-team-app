import { Component } from 'react'
import { colors } from '../theme.js'

// Without this, any uncaught error anywhere in a page component (a bad
// field, an unexpected null, etc.) unmounts the ENTIRE app and leaves a
// blank white screen with no clue why — that's the "clicking this does
// nothing / goes blank" symptom. This catches that crash and shows the
// actual error message plus a way back, instead of nothing at all.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('App crashed:', error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div style={styles.page}>
          <h2>Something went wrong</h2>
          <p style={styles.message}>{String(this.state.error?.message || this.state.error)}</p>
          <p style={styles.hint}>
            Screenshot this and send it over — it'll say exactly what broke.
          </p>
          <button style={styles.button} onClick={() => this.setState({ error: null })}>
            Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

const styles = {
  page: {
    fontFamily: 'system-ui, sans-serif',
    padding: '1.5rem',
    maxWidth: 480,
    margin: '1.5rem auto',
    background: 'white',
    borderRadius: '0.75rem',
    boxShadow: '0 2px 10px rgba(0,0,0,0.06)',
  },
  message: {
    background: '#fdecea',
    color: colors.error,
    padding: '0.9rem',
    borderRadius: '0.5rem',
    fontFamily: 'monospace',
    fontSize: '0.85rem',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  hint: { color: colors.textMuted, fontSize: '0.85rem' },
  button: {
    padding: '0.8rem 1.4rem',
    background: colors.primary,
    color: 'white',
    border: 'none',
    borderRadius: '0.5rem',
    fontSize: '1rem',
    cursor: 'pointer',
  },
}

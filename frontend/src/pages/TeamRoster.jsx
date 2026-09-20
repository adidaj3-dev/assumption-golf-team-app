import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient.js'
import Scorecard from './Scorecard.jsx'
import { colors } from '../theme.js'

const API_BASE = import.meta.env.VITE_API_BASE

async function authedFetch(path) {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export default function TeamRoster({ onBack }) {
  const [view, setView] = useState('roster') // 'roster', 'rounds', 'scorecard'
  const [roster, setRoster] = useState(null)
  const [selectedPlayer, setSelectedPlayer] = useState(null)
  const [rounds, setRounds] = useState(null)
  const [selectedRoundId, setSelectedRoundId] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    authedFetch('/team/players').then(setRoster).catch((err) => setError(err.message))
  }, [])

  function openPlayer(p) {
    setSelectedPlayer(p)
    setRounds(null)
    setError(null)
    setView('rounds')
    authedFetch(`/players/${p.id}/rounds`).then(setRounds).catch((err) => setError(err.message))
  }

  if (error) {
    return (
      <div style={styles.page}>
        <p style={styles.error}>{error}</p>
        <button style={styles.linkBtn} onClick={() => setView('roster')}>← Back</button>
      </div>
    )
  }

  if (view === 'scorecard') {
    return <Scorecard roundId={selectedRoundId} onBack={() => setView('rounds')} />
  }

  if (view === 'rounds') {
    return (
      <div style={styles.page}>
        <button style={styles.linkBtn} onClick={() => setView('roster')}>← Back to roster</button>
        <h2>{selectedPlayer.full_name}'s Rounds</h2>

        {!rounds ? (
          <p>Loading…</p>
        ) : rounds.length === 0 ? (
          <p>No rounds yet.</p>
        ) : (
          rounds.map((r) => (
            <button key={r.id} style={styles.roundRow} onClick={() => { setSelectedRoundId(r.id); setView('scorecard') }}>
              <div>
                <div style={styles.roundCourse}>{r.course_name}</div>
                <div style={styles.roundDate}>
                  {new Date(r.started_at).toLocaleDateString()} · {r.holes_played} holes {r.completed ? '' : '(in progress)'}
                </div>
              </div>
              <div style={styles.roundScore}>{formatToPar(r.score_to_par)}</div>
            </button>
          ))
        )}
      </div>
    )
  }

  // view === 'roster'
  return (
    <div style={styles.page}>
      <button style={styles.linkBtn} onClick={onBack}>← Back to stats</button>
      <h2>Team Roster</h2>
      {!roster ? (
        <p>Loading…</p>
      ) : (
        roster.map((p) => (
          <button key={p.id} style={styles.playerCard} onClick={() => openPlayer(p)}>
            {p.full_name}
          </button>
        ))
      )}
    </div>
  )
}

function formatToPar(n) {
  if (n == null) return '—'
  if (n === 0) return 'E'
  return n > 0 ? `+${n}` : `${n}`
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
  playerCard: {
    display: 'block',
    width: '100%',
    textAlign: 'left',
    background: colors.grayLight,
    border: 'none',
    borderRadius: '0.6rem',
    padding: '1rem',
    marginBottom: '0.6rem',
    cursor: 'pointer',
    fontWeight: 600,
    color: colors.primary,
  },
  roundRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    textAlign: 'left',
    background: colors.grayLight,
    border: 'none',
    borderRadius: '0.6rem',
    padding: '1rem',
    marginBottom: '0.6rem',
    cursor: 'pointer',
  },
  roundCourse: { fontWeight: 600 },
  roundDate: { fontSize: '0.8rem', color: '#666', marginTop: '0.15rem' },
  roundScore: { fontSize: '1.3rem', fontWeight: 'bold', color: colors.primary },
  linkBtn: {
    display: 'block',
    marginBottom: '1rem',
    background: 'none',
    border: 'none',
    color: colors.primary,
    textDecoration: 'underline',
    fontSize: '0.95rem',
    cursor: 'pointer',
    padding: 0,
  },
  error: { color: colors.error },
}

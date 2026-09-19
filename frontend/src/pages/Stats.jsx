import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient.js'
import Scorecard from './Scorecard.jsx'

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

export default function Stats({ player }) {
  const [stats, setStats] = useState(null)
  const [rounds, setRounds] = useState(null)
  const [selectedRoundId, setSelectedRoundId] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    authedFetch(`/players/${player.id}/stats`).then(setStats).catch((err) => setError(err.message))
    authedFetch(`/players/${player.id}/rounds`).then(setRounds).catch((err) => setError(err.message))
  }, [player.id])

  if (selectedRoundId) {
    return <Scorecard roundId={selectedRoundId} onBack={() => setSelectedRoundId(null)} />
  }

  if (error) return <div style={styles.page}><p style={styles.error}>{error}</p></div>
  if (!stats) return <div style={styles.page}><p>Loading…</p></div>

  return (
    <div style={styles.page}>
      <h2>My Stats</h2>

      {!stats.rounds_played ? (
        <p>No completed rounds yet — finish a round to see your stats here.</p>
      ) : (
        <>
          <p style={styles.subtitle}>Based on {stats.rounds_played} completed round{stats.rounds_played === 1 ? '' : 's'}</p>

          <div style={styles.grid}>
            <StatCard label="Scoring Avg" value={formatToPar(stats.scoring_avg_to_par)} />
            <StatCard label="GIR %" value={stats.gir_pct != null ? `${stats.gir_pct}%` : '—'} />
            <StatCard label="Fairways %" value={stats.fairway_pct != null ? `${stats.fairway_pct}%` : '—'} />
            <StatCard label="Putts / Round (avg)" value={stats.putts_per_round} />
          </div>

          {stats.last_round && (
            <>
              <h3 style={styles.sectionTitle}>Most Recent Round</h3>
              <div style={styles.lastRoundRow}>
                <LastRoundCard label="Front 9" value={formatToPar(stats.last_round.front9_to_par)} />
                <LastRoundCard label="Back 9" value={formatToPar(stats.last_round.back9_to_par)} />
                <LastRoundCard label="Total" value={formatToPar(stats.last_round.total_to_par)} highlight />
              </div>
            </>
          )}
        </>
      )}

      <h3 style={styles.sectionTitle}>My Rounds</h3>
      {!rounds ? (
        <p>Loading…</p>
      ) : rounds.length === 0 ? (
        <p style={styles.muted}>No rounds yet.</p>
      ) : (
        rounds.map((r) => (
          <button key={r.id} style={styles.roundRow} onClick={() => setSelectedRoundId(r.id)}>
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

function LastRoundCard({ label, value, highlight }) {
  return (
    <div style={{ ...styles.card, ...(highlight ? styles.cardHighlight : {}) }}>
      <div style={{ ...styles.cardValue, ...(highlight ? { color: 'white' } : {}) }}>{value}</div>
      <div style={{ ...styles.cardLabel, ...(highlight ? { color: '#e0e0e0' } : {}) }}>{label}</div>
    </div>
  )
}

function StatCard({ label, value }) {
  return (
    <div style={styles.card}>
      <div style={styles.cardValue}>{value}</div>
      <div style={styles.cardLabel}>{label}</div>
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
  subtitle: { color: '#666', marginTop: '-0.5rem' },
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1.5rem' },
  sectionTitle: { marginTop: '2rem', marginBottom: '0.5rem' },
  lastRoundRow: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' },
  card: { background: '#eef1f5', borderRadius: '0.75rem', padding: '1.25rem', textAlign: 'center' },
  cardHighlight: { background: '#004b87' },
  cardValue: { fontSize: '1.8rem', fontWeight: 'bold', color: '#004b87' },
  cardLabel: { fontSize: '0.85rem', color: '#666', marginTop: '0.25rem' },
  muted: { color: '#888', fontSize: '0.9rem' },
  roundRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    textAlign: 'left',
    background: '#eef1f5',
    border: 'none',
    borderRadius: '0.6rem',
    padding: '1rem',
    marginBottom: '0.6rem',
    cursor: 'pointer',
  },
  roundCourse: { fontWeight: 600 },
  roundDate: { fontSize: '0.8rem', color: '#666', marginTop: '0.15rem' },
  roundScore: { fontSize: '1.3rem', fontWeight: 'bold', color: '#004b87' },
  error: { color: '#b00020' },
}

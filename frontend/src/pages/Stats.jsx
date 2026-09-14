import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient.js'

const API_BASE = import.meta.env.VITE_API_BASE

export default function Stats({ player }) {
  const [stats, setStats] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function load() {
      try {
        const { data: sessionData } = await supabase.auth.getSession()
        const token = sessionData.session?.access_token
        const res = await fetch(`${API_BASE}/players/${player.id}/stats`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) throw new Error(await res.text())
        setStats(await res.json())
      } catch (err) {
        setError(err.message)
      }
    }
    load()
  }, [player.id])

  if (error) return <div style={styles.page}><p style={styles.error}>{error}</p></div>
  if (!stats) return <div style={styles.page}><p>Loading…</p></div>

  if (!stats.rounds_played) {
    return (
      <div style={styles.page}>
        <h2>My Stats</h2>
        <p>No completed rounds yet — finish a round to see your stats here.</p>
      </div>
    )
  }

  return (
    <div style={styles.page}>
      <h2>My Stats</h2>
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
  error: { color: '#b00020' },
}

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
        <StatCard label="Putts / Round" value={stats.putts_per_round} />
      </div>
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
  if (n === 0) return 'E'
  return n > 0 ? `+${n}` : `${n}`
}

const styles = {
  page: { fontFamily: 'system-ui, sans-serif', padding: '1.5rem', maxWidth: 480, margin: '0 auto' },
  subtitle: { color: '#666', marginTop: '-0.5rem' },
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1.5rem' },
  card: { background: '#f4f6f4', borderRadius: '0.75rem', padding: '1.25rem', textAlign: 'center' },
  cardValue: { fontSize: '1.8rem', fontWeight: 'bold', color: '#0b3d2e' },
  cardLabel: { fontSize: '0.85rem', color: '#666', marginTop: '0.25rem' },
  error: { color: '#b00020' },
}

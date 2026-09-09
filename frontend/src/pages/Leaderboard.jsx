import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'

const API_BASE = import.meta.env.VITE_API_BASE

export default function Leaderboard() {
  const { slug } = useParams()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function fetchLeaderboard() {
      try {
        const res = await fetch(`${API_BASE}/tournaments/${slug}/leaderboard`)
        if (!res.ok) throw new Error('Tournament not found')
        setData(await res.json())
      } catch (err) {
        setError(err.message)
      }
    }

    fetchLeaderboard()
    // Simple polling for Phase 1. Swap for a Supabase real-time subscription
    // later if you want push-style updates instead of a 10s poll.
    const interval = setInterval(fetchLeaderboard, 10000)
    return () => clearInterval(interval)
  }, [slug])

  if (error) return <div style={styles.page}>{error}</div>
  if (!data) return <div style={styles.page}>Loading leaderboard…</div>

  return (
    <div style={styles.page}>
      <h1 style={styles.title}>{data.tournament_name}</h1>
      <div style={styles.list}>
        {data.leaderboard.map((row, i) => (
          <div key={i} style={styles.row}>
            <span style={styles.rank}>{i + 1}</span>
            <span style={styles.name}>{row.player_name}</span>
            <span style={styles.score}>
              {row.score_to_par > 0 ? `+${row.score_to_par}` : row.score_to_par === 0 ? 'E' : row.score_to_par}
            </span>
            <span style={styles.thru}>
              {row.completed ? 'F' : `thru ${row.holes_played}`}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

const styles = {
  page: { fontFamily: 'system-ui, sans-serif', padding: '1rem', maxWidth: 480, margin: '0 auto' },
  title: { textAlign: 'center', color: '#0b3d2e' },
  list: { display: 'flex', flexDirection: 'column', gap: '0.5rem' },
  row: {
    display: 'grid',
    gridTemplateColumns: '2rem 1fr 3rem 4rem',
    alignItems: 'center',
    padding: '0.75rem',
    background: '#f4f6f4',
    borderRadius: '0.5rem',
  },
  rank: { fontWeight: 'bold', color: '#888' },
  name: { fontWeight: 600 },
  score: { fontWeight: 'bold', textAlign: 'right' },
  thru: { fontSize: '0.85rem', color: '#666', textAlign: 'right' },
}

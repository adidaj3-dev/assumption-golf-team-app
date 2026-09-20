import { useState } from 'react'
import { supabase } from '../supabaseClient.js'
import { colors } from '../theme.js'

const API_BASE = import.meta.env.VITE_API_BASE

export default function Standings() {
  const [team, setTeam] = useState(null) // 'men' or 'women'
  const [entries, setEntries] = useState(null)
  const [error, setError] = useState(null)

  async function openTeam(t) {
    setTeam(t)
    setEntries(null)
    setError(null)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      const res = await fetch(`${API_BASE}/standings?team=${t}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error(await res.text())
      setEntries(await res.json())
    } catch (err) {
      setError(err.message)
    }
  }

  if (!team) {
    return (
      <div style={styles.page}>
        <h2>Individual Standings</h2>
        <p style={styles.objective}>
          Ranked by season scoring average — completed 9 or 18 hole Team Rounds only.
        </p>
        <div style={styles.teamButtons}>
          <button style={styles.teamBtn} onClick={() => openTeam('men')}>Men's Team</button>
          <button style={styles.teamBtn} onClick={() => openTeam('women')}>Women's Team</button>
        </div>
      </div>
    )
  }

  return (
    <div style={styles.page}>
      <button style={styles.linkBtn} onClick={() => setTeam(null)}>← Back</button>
      <h2>{team === 'men' ? "Men's" : "Women's"} Standings</h2>

      {error && <p style={styles.error}>{error}</p>}
      {!entries && !error && <p>Loading…</p>}

      {entries && entries.length === 0 && (
        <p style={styles.muted}>No players assigned to this team yet.</p>
      )}

      {entries && entries.map((e, i) => {
        const showCutLine =
          (team === 'men' && (e.rank === 6 || e.rank === 10)) ||
          (team === 'women' && e.rank === 6)
        return (
          <div key={e.player_id}>
            {showCutLine && (
              <div style={styles.cutLine}>
                <span>{team === 'men' && e.rank === 6 ? 'STARTING LINEUP CUT' : team === 'men' ? 'QUALIFIER CUT' : 'CUT LINE'}</span>
              </div>
            )}
            <div style={{ ...styles.row, ...tierRowStyle(e.tier) }}>
              <div style={styles.rankCol}>
                <div style={{ ...styles.rankBadge, ...tierBadgeStyle(e.tier) }}>{e.rank}</div>
              </div>
              <div style={styles.nameCol}>
                <div style={styles.name}>{e.full_name}</div>
                <div style={styles.tierLabel}>{e.tier}</div>
              </div>
              <div style={styles.avgCol}>
                {e.scoring_avg_to_par == null ? '—' : formatToPar(e.scoring_avg_to_par)}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function tierRowStyle(tier) {
  if (tier === 'Starting Lineup' || tier === 'In') return { background: '#e8f0f7' }
  if (tier === 'Qualifier') return { background: '#f5f5f5' }
  return { opacity: 0.7 }
}

function tierBadgeStyle(tier) {
  if (tier === 'Starting Lineup' || tier === 'In') return { background: colors.primary }
  if (tier === 'Qualifier') return { background: colors.gray, color: colors.primaryDark }
  return { background: '#999' }
}

function formatToPar(n) {
  if (n === 0) return 'E'
  return n > 0 ? `+${n}` : `${n}`
}

const styles = {
  page: {
    fontFamily: 'system-ui, sans-serif',
    padding: '1.5rem',
    maxWidth: 500,
    margin: '1.5rem auto',
    background: 'white',
    borderRadius: '0.75rem',
    boxShadow: '0 2px 10px rgba(0,0,0,0.06)',
  },
  objective: { color: colors.textMuted },
  teamButtons: { display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '1.5rem' },
  teamBtn: {
    padding: '1.25rem',
    fontSize: '1.1rem',
    fontWeight: 600,
    background: colors.primary,
    color: 'white',
    border: 'none',
    borderRadius: '0.6rem',
  },
  muted: { color: '#888' },
  cutLine: {
    margin: '0.75rem 0',
    textAlign: 'center',
    color: '#b00020',
    fontSize: '0.7rem',
    fontWeight: 'bold',
    letterSpacing: '0.08em',
    borderTop: '2px dashed #b00020',
    paddingTop: '0.3rem',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.9rem',
    padding: '0.9rem 1rem',
    borderRadius: '0.6rem',
    marginBottom: '0.5rem',
  },
  rankCol: { flexShrink: 0 },
  rankBadge: {
    width: '2rem',
    height: '2rem',
    borderRadius: '50%',
    color: 'white',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 'bold',
  },
  nameCol: { flex: 1 },
  name: { fontWeight: 600 },
  tierLabel: { fontSize: '0.75rem', color: colors.textMuted, marginTop: '0.1rem' },
  avgCol: { fontWeight: 'bold', fontSize: '1.1rem', color: colors.primary },
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

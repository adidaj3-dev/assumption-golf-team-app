import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient.js'
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

export default function CombinesDashboard({ onBack }) {
  const [view, setView] = useState('players') // 'players' or 'detail'
  const [players, setPlayers] = useState(null)
  const [selectedPlayer, setSelectedPlayer] = useState(null)
  const [summary, setSummary] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    authedFetch('/team/players').then(setPlayers).catch((err) => setError(err.message))
  }, [])

  function openPlayer(p) {
    setSelectedPlayer(p)
    setSummary(null)
    setError(null)
    setView('detail')
    authedFetch(`/players/${p.id}/combines/summary`)
      .then(setSummary)
      .catch((err) => setError(err.message))
  }

  if (error) {
    return (
      <div style={styles.page}>
        <p style={styles.error}>{error}</p>
        <button style={styles.linkBtn} onClick={() => { setError(null); setView('players') }}>← Back</button>
      </div>
    )
  }

  if (view === 'detail') {
    const byCategory = {}
    if (summary) {
      for (const c of summary) {
        byCategory[c.category] = byCategory[c.category] || []
        byCategory[c.category].push(c)
      }
    }

    return (
      <div style={styles.page}>
        <button style={styles.linkBtn} onClick={() => setView('players')}>← Back to team</button>
        <h2>{selectedPlayer.full_name} — Combines</h2>

        {!summary ? (
          <p>Loading…</p>
        ) : (
          Object.entries(byCategory).map(([cat, combines]) => (
            <div key={cat}>
              <h3 style={styles.sectionTitle}>{cat}</h3>
              {combines.map((c) => (
                <div key={c.slug} style={styles.combineCard}>
                  <div style={styles.combineHeader}>
                    <div style={styles.combineName}>{c.name}</div>
                    {c.attempts_count > 0 && (
                      <div style={styles.attempts}>{c.attempts_count} attempt{c.attempts_count === 1 ? '' : 's'}</div>
                    )}
                  </div>

                  {c.attempts_count === 0 ? (
                    <p style={styles.noAttempts}>Not attempted yet</p>
                  ) : (
                    <>
                      <div style={styles.scoreRow}>
                        <Stat label="Average" value={`${c.average} / ${c.max_points}`} />
                        <Stat label="Best" value={`${c.best} / ${c.max_points}`} />
                      </div>
                      <div style={styles.benchmarkTier}>{benchmarkTierLabel(c.average, c.benchmarks)}</div>
                    </>
                  )}

                  <div style={styles.benchmarkList}>
                    {c.benchmarks.map((b) => (
                      <span key={b.level} style={styles.benchmarkChip}>{b.level}: {b.range}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    )
  }

  // view === 'players'
  if (!players) return <div style={styles.page}><p>Loading…</p></div>

  return (
    <div style={styles.page}>
      {onBack && <button style={styles.linkBtn} onClick={onBack}>← Back to stats</button>}
      <h2>Combine Stats</h2>
      <p style={styles.subtitle}>Tap a player to see all their combine results vs. D1/PGA benchmarks</p>

      {players.map((p) => (
        <button key={p.id} style={styles.playerCard} onClick={() => openPlayer(p)}>
          {p.full_name}
        </button>
      ))}
    </div>
  )
}

function Stat({ label, value }) {
  return (
    <div style={styles.stat}>
      <div style={styles.statValue}>{value}</div>
      <div style={styles.statLabel}>{label}</div>
    </div>
  )
}

// Finds the highest benchmark tier whose range the average meets or exceeds
// (ranges are like "18-24" — meeting the low end of a tier counts).
function benchmarkTierLabel(average, benchmarks) {
  let best = null
  for (const b of benchmarks) {
    const low = parseFloat(b.range.split('-')[0])
    if (average >= low) best = b.level
  }
  return best ? `At or above ${best} level` : 'Below all benchmark levels'
}

const styles = {
  page: {
    fontFamily: 'system-ui, sans-serif',
    padding: '1.5rem',
    maxWidth: 600,
    margin: '1.5rem auto',
    background: 'white',
    borderRadius: '0.75rem',
    boxShadow: '0 2px 10px rgba(0,0,0,0.06)',
  },
  subtitle: { color: colors.textMuted, marginTop: '-0.5rem', marginBottom: '1.5rem' },
  sectionTitle: { marginTop: '1.5rem', marginBottom: '0.5rem' },
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
    fontSize: '1rem',
  },
  combineCard: {
    background: colors.grayLight,
    borderRadius: '0.6rem',
    padding: '1rem',
    marginBottom: '0.75rem',
  },
  combineHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' },
  combineName: { fontWeight: 600 },
  attempts: { fontSize: '0.8rem', color: colors.textMuted },
  noAttempts: { color: '#999', fontSize: '0.85rem', margin: '0.5rem 0 0' },
  scoreRow: { display: 'flex', gap: '1.5rem', marginTop: '0.75rem' },
  stat: { textAlign: 'center' },
  statValue: { fontSize: '1.1rem', fontWeight: 'bold', color: colors.primary },
  statLabel: { fontSize: '0.75rem', color: colors.textMuted },
  benchmarkTier: { marginTop: '0.5rem', fontSize: '0.85rem', fontWeight: 600, color: '#004b87' },
  benchmarkList: { display: 'flex', gap: '0.5rem', marginTop: '0.6rem', flexWrap: 'wrap' },
  benchmarkChip: {
    fontSize: '0.75rem',
    background: 'white',
    border: '1px solid #ddd',
    borderRadius: '1rem',
    padding: '0.2rem 0.6rem',
    color: '#555',
  },
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

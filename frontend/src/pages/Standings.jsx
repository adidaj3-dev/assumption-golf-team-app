import { useState } from 'react'
import { supabase } from '../supabaseClient.js'
import { colors } from '../theme.js'

const API_BASE = import.meta.env.VITE_API_BASE

const SECTIONS = [
  {
    key: 'lineup',
    title: 'Lineup',
    subtitle: 'Ranked by season scoring average — completed 9/18-hole Team Rounds only.',
    endpoint: '/standings',
    hasTiers: true,
  },
  {
    key: 'individual',
    title: 'Individual Standings',
    subtitle: 'Ranked by season scoring average — completed 9/18-hole Individual Rounds only.',
    endpoint: '/round-leaderboard',
    roundType: 'individual',
    hasTiers: false,
  },
  {
    key: 'qualifier',
    title: 'Qualifier Leaderboard',
    subtitle: 'Ranked by season scoring average — completed 9/18-hole Qualifier Rounds only.',
    endpoint: '/round-leaderboard',
    roundType: 'qualifier',
    hasTiers: false,
  },
  {
    key: 'combine',
    title: 'Combine Standings',
    subtitle: 'Ranked by season-wide combine performance across every practice combine logged.',
    endpoint: '/combine-standings',
    hasTiers: true,
  },
]

export default function Standings() {
  const [activeSection, setActiveSection] = useState(null) // a SECTIONS entry, or null
  const [team, setTeam] = useState(null) // 'men' or 'women'
  const [entries, setEntries] = useState(null)
  const [error, setError] = useState(null)

  async function openTeam(section, t) {
    setActiveSection(section)
    setTeam(t)
    setEntries(null)
    setError(null)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      const qs = section.roundType ? `?team=${t}&round_type=${section.roundType}` : `?team=${t}`
      const res = await fetch(`${API_BASE}${section.endpoint}${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error(await res.text())
      setEntries(await res.json())
    } catch (err) {
      setError(err.message)
    }
  }

  function goHome() {
    setActiveSection(null)
    setTeam(null)
    setEntries(null)
    setError(null)
  }

  if (!activeSection) {
    return (
      <div style={styles.page}>
        <h2>Standings</h2>
        {SECTIONS.map((s) => (
          <div key={s.key}>
            <h3 style={styles.sectionTitle}>{s.title}</h3>
            <p style={styles.objective}>{s.subtitle}</p>
            <div style={styles.teamButtons}>
              <button style={styles.teamBtn} onClick={() => openTeam(s, 'men')}>
                {s.key === 'lineup' ? "Men's Lineup" : "Men's Team"}
              </button>
              <button style={styles.teamBtn} onClick={() => openTeam(s, 'women')}>
                {s.key === 'lineup' ? "Women's Lineup" : "Women's Team"}
              </button>
            </div>
          </div>
        ))}
      </div>
    )
  }

  const isCombine = activeSection.key === 'combine'

  return (
    <div style={styles.page}>
      <button style={styles.linkBtn} onClick={goHome}>← Back</button>
      <h2>
        {team === 'men' ? "Men's" : "Women's"} {activeSection.title}
      </h2>

      {error && <p style={styles.error}>{error}</p>}
      {!entries && !error && <p>Loading…</p>}

      {entries && entries.length === 0 && (
        <p style={styles.muted}>No players assigned to this team yet.</p>
      )}

      {entries && entries.map((e) => {
        const showCutLine =
          activeSection.hasTiers && (
            (team === 'men' && (e.rank === 6 || e.rank === 10)) ||
            (team === 'women' && e.rank === 6)
          )
        const value = isCombine ? e.combine_score_pct : e.scoring_avg_to_par
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
                {e.tier && <div style={styles.tierLabel}>{e.tier}</div>}
              </div>
              <div style={styles.avgCol}>
                {value == null ? '—' : isCombine ? `${value}%` : formatToPar(value)}
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
  if (tier) return { opacity: 0.7 }
  return { background: colors.grayLight }
}

function tierBadgeStyle(tier) {
  if (tier === 'Starting Lineup' || tier === 'In') return { background: colors.primary }
  if (tier === 'Qualifier') return { background: colors.gray, color: colors.primaryDark }
  if (tier) return { background: '#999' }
  return { background: colors.primary }
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
  sectionTitle: { marginTop: '1.75rem', marginBottom: '0.25rem', color: colors.primary },
  objective: { color: colors.textMuted, marginTop: 0 },
  teamButtons: { display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.75rem' },
  teamBtn: {
    padding: '1.1rem',
    fontSize: '1.05rem',
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

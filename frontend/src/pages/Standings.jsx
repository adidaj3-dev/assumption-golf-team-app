import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient.js'
import Lineup from './Lineup.jsx'
import { colors, GREYHOUNDS_SIGN_URL, subtleBackdrop } from '../theme.js'

const API_BASE = import.meta.env.VITE_API_BASE

const SECTIONS = [
  {
    key: 'individual',
    title: 'Individual Standings',
    subtitle: 'Season scoring average across EVERY completed round, any type — the all-in combined average.',
    endpoint: '/round-leaderboard',
    roundType: 'individual',
    hasTiers: false,
  },
  {
    key: 'qualifier',
    title: 'Qualifier Leaderboard',
    subtitle: 'Season scoring average from Qualifier rounds, plus any round the coach has flagged to count.',
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

async function authedFetch(path) {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export default function Standings({ player }) {
  const [activeSection, setActiveSection] = useState(null) // a SECTIONS entry, 'lineup', or null
  const [team, setTeam] = useState(null) // 'men' or 'women'
  const [entries, setEntries] = useState(null)
  const [lineups, setLineups] = useState(null)
  const [showManageLineup, setShowManageLineup] = useState(false)
  const [error, setError] = useState(null)

  if (showManageLineup) {
    return <Lineup onBack={() => setShowManageLineup(false)} />
  }

  async function openTeam(section, t) {
    setActiveSection(section.key)
    setTeam(t)
    setEntries(null)
    setError(null)
    try {
      const qs = section.roundType ? `?team=${t}&round_type=${section.roundType}` : `?team=${t}`
      setEntries(await authedFetch(`${section.endpoint}${qs}`))
    } catch (err) {
      setError(err.message)
    }
  }

  async function openLineup(t) {
    setActiveSection('lineup')
    setTeam(t)
    setLineups(null)
    setError(null)
    try {
      setLineups(await authedFetch(`/lineups?team=${t}`))
    } catch (err) {
      setError(err.message)
    }
  }

  function goHome() {
    setActiveSection(null)
    setTeam(null)
    setEntries(null)
    setLineups(null)
    setError(null)
  }

  if (!activeSection) {
    return (
      <div style={styles.page}>
        <h2>Standings</h2>

        <h3 style={styles.sectionTitle}>Lineup</h3>
        <p style={styles.objective}>The coach's current starting lineup and individuals, by tournament.</p>
        <div style={styles.teamButtons}>
          <button style={styles.teamBtn} onClick={() => openLineup('men')}>Men's Lineup</button>
          <button style={styles.teamBtn} onClick={() => openLineup('women')}>Women's Lineup</button>
        </div>
        {player?.role === 'coach' && (
          <button style={styles.linkBtn} onClick={() => setShowManageLineup(true)}>
            📋 Manage Lineup
          </button>
        )}

        {SECTIONS.map((s) => (
          <div key={s.key}>
            <h3 style={styles.sectionTitle}>{s.title}</h3>
            <p style={styles.objective}>{s.subtitle}</p>
            <div style={styles.teamButtons}>
              <button style={styles.teamBtn} onClick={() => openTeam(s, 'men')}>Men's Team</button>
              <button style={styles.teamBtn} onClick={() => openTeam(s, 'women')}>Women's Team</button>
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (activeSection === 'lineup') {
    return (
      <div style={styles.page}>
        <button style={styles.linkBtn} onClick={goHome}>← Back</button>
        <h2>{team === 'men' ? "Men's" : "Women's"} Lineup</h2>

        {error && <p style={styles.error}>{error}</p>}
        {!lineups && !error && <p>Loading…</p>}
        {lineups && lineups.length === 0 && <p style={styles.muted}>No lineup set yet for this team.</p>}

        {lineups && lineups.length > 0 && (
          <LineupPreview lineupId={lineups[0].id} />
        )}

        {lineups && lineups.length > 1 && (
          <p style={styles.muted}>{lineups.length - 1} earlier tournament lineup{lineups.length - 1 === 1 ? '' : 's'} on file.</p>
        )}
      </div>
    )
  }

  const activeSectionDef = SECTIONS.find((s) => s.key === activeSection)
  const isCombine = activeSectionDef.key === 'combine'

  return (
    <div style={styles.page}>
      <button style={styles.linkBtn} onClick={goHome}>← Back</button>
      <h2>
        {team === 'men' ? "Men's" : "Women's"} {activeSectionDef.title}
      </h2>

      {error && <p style={styles.error}>{error}</p>}
      {!entries && !error && <p>Loading…</p>}

      {entries && entries.length === 0 && (
        <p style={styles.muted}>No players assigned to this team yet.</p>
      )}

      {entries && entries.map((e) => {
        const value = isCombine ? e.combine_score_pct : e.scoring_avg_to_par
        return (
          <div key={e.player_id}>
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

function LineupPreview({ lineupId }) {
  const [detail, setDetail] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    setDetail(null)
    setError(null)
    authedFetch(`/lineups/${lineupId}`).then(setDetail).catch((err) => setError(err.message))
  }, [lineupId])

  if (error) return <p style={styles.error}>{error}</p>
  if (!detail) return <p>Loading…</p>

  return (
    <div>
      <h3 style={styles.sectionTitle}>{detail.name}</h3>
      {detail.course_name && (
        <p style={styles.objective}>{detail.course_name}{detail.course_par ? ` · Par ${detail.course_par}` : ''}</p>
      )}
      {detail.entries.map((e) => (
        <div key={e.id} style={{ ...styles.row, ...tierRowStyle(e.category === 'Starting Lineup' || e.category === 'A Team' ? 'Starting Lineup' : null) }}>
          <div style={styles.rankCol}>
            <div style={{ ...styles.rankBadge, ...tierBadgeStyle(e.category === 'Starting Lineup' || e.category === 'A Team' ? 'Starting Lineup' : null) }}>{e.slot}</div>
          </div>
          <div style={styles.nameCol}>
            <div style={styles.name}>{e.full_name}</div>
            <div style={styles.tierLabel}>{e.category}</div>
          </div>
          <div style={styles.avgCol}>{formatToPar(e.tournament_avg_to_par)}</div>
        </div>
      ))}
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
    borderRadius: '0.75rem',
    boxShadow: '0 2px 10px rgba(0,0,0,0.06)',
    ...subtleBackdrop(GREYHOUNDS_SIGN_URL),
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

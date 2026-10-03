import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { colors, fonts } from '../theme.js'

const API_BASE = import.meta.env.VITE_API_BASE

// Computes PGA Tour-style positions, with ties sharing a rank and getting
// the "T" prefix (T1, T2, ...). Assumes the backend already sorts rows
// best-score-first.
function withPositions(rows) {
  let lastScore = null
  let lastPos = 0
  let tieCounts = {}
  rows.forEach((r) => (tieCounts[r.score_to_par] = (tieCounts[r.score_to_par] || 0) + 1))
  return rows.map((row, i) => {
    const pos = row.score_to_par === lastScore ? lastPos : i + 1
    lastScore = row.score_to_par
    lastPos = pos
    const tied = tieCounts[row.score_to_par] > 1
    return { ...row, pos: tied ? `T${pos}` : `${pos}` }
  })
}

function formatToPar(n) {
  if (n == null) return '—'
  if (n === 0) return 'E'
  return n > 0 ? `+${n}` : `${n}`
}

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

  if (error) return <div style={styles.page}><p style={styles.error}>{error}</p></div>
  if (!data) return <div style={styles.page}><p style={styles.loading}>Loading leaderboard…</p></div>

  const rows = withPositions(data.leaderboard)
  const anyLive = rows.some((r) => !r.completed)

  return (
    <div style={styles.wrap}>
      <div style={styles.card}>
        <div style={styles.banner}>
          <img src="/branding/assumption-seal.png" alt="" style={styles.bannerSeal} />
          <div style={styles.bannerText}>
            <div style={styles.bannerEyebrow}>ASSUMPTION GREYHOUNDS GOLF</div>
            <h1 style={styles.title}>{data.tournament_name}</h1>
          </div>
          {anyLive && (
            <div style={styles.liveTag}>
              <span style={styles.liveDot} />
              LIVE
            </div>
          )}
        </div>

        <div style={styles.headerRow}>
          <span style={styles.headerPos}>POS</span>
          <span style={styles.headerName}>PLAYER</span>
          <span style={styles.headerScore}>TO PAR</span>
          <span style={styles.headerThru}>THRU</span>
        </div>

        <div style={styles.list}>
          {rows.map((row, i) => (
            <div key={i} style={{ ...styles.row, ...(i % 2 === 1 ? styles.rowAlt : {}) }}>
              <span style={styles.pos}>{row.pos}</span>
              <span style={styles.name}>{row.player_name}</span>
              <span style={{ ...styles.score, color: row.score_to_par < 0 ? colors.scoreUnder : colors.black }}>
                {formatToPar(row.score_to_par)}
              </span>
              <span style={styles.thru}>
                {row.completed ? 'F' : row.holes_played ? `thru ${row.holes_played}` : '—'}
              </span>
            </div>
          ))}
        </div>

        <div style={styles.footer}>
          <img src="/branding/ne10-logo.jpg" alt="Northeast-10 Conference" style={styles.footerLogo} />
          <span style={styles.footerText}>Northeast-10 Conference</span>
        </div>
      </div>
    </div>
  )
}

const styles = {
  wrap: {
    fontFamily: fonts.body,
    background: colors.grayLight,
    minHeight: '100vh',
    padding: '1.5rem 1rem',
  },
  card: {
    maxWidth: 520,
    margin: '0 auto',
    background: colors.white,
    borderRadius: '0.9rem',
    overflow: 'hidden',
    boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
  },
  banner: {
    background: `linear-gradient(135deg, ${colors.primary}, ${colors.primaryDark})`,
    padding: '1.25rem 1.25rem',
    display: 'flex',
    alignItems: 'center',
    gap: '0.9rem',
    position: 'relative',
  },
  bannerSeal: { width: 48, height: 48, objectFit: 'contain', flexShrink: 0 },
  bannerText: { flex: 1, minWidth: 0 },
  bannerEyebrow: {
    color: colors.gold,
    fontSize: '0.68rem',
    fontWeight: 700,
    letterSpacing: '0.1em',
    marginBottom: '0.2rem',
  },
  title: {
    color: colors.white,
    fontFamily: fonts.heading,
    fontSize: '1.3rem',
    margin: 0,
    lineHeight: 1.2,
    overflowWrap: 'break-word',
  },
  liveTag: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.35rem',
    background: 'rgba(255,255,255,0.15)',
    color: colors.white,
    fontSize: '0.7rem',
    fontWeight: 700,
    letterSpacing: '0.08em',
    padding: '0.3rem 0.55rem',
    borderRadius: '1rem',
    flexShrink: 0,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: '50%',
    background: '#ff4d4d',
    display: 'inline-block',
    animation: 'pulse 1.5s infinite',
  },
  headerRow: {
    display: 'grid',
    gridTemplateColumns: '3rem 1fr 4.5rem 4.5rem',
    padding: '0.6rem 1.1rem',
    background: colors.grayLight,
    borderBottom: `2px solid ${colors.gray}`,
    fontSize: '0.68rem',
    fontWeight: 700,
    letterSpacing: '0.08em',
    color: colors.textMuted,
  },
  headerPos: {},
  headerName: {},
  headerScore: { textAlign: 'right' },
  headerThru: { textAlign: 'right' },
  list: { display: 'flex', flexDirection: 'column' },
  row: {
    display: 'grid',
    gridTemplateColumns: '3rem 1fr 4.5rem 4.5rem',
    alignItems: 'center',
    padding: '0.7rem 1.1rem',
  },
  rowAlt: { background: '#f7f9fb' },
  pos: { fontWeight: 700, color: colors.textMuted, fontSize: '0.95rem' },
  name: { fontWeight: 600, color: colors.black, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  score: { fontWeight: 800, textAlign: 'right', fontSize: '1rem' },
  thru: { fontSize: '0.78rem', color: colors.textMuted, textAlign: 'right' },
  footer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    padding: '0.9rem',
    borderTop: `1px solid ${colors.grayLight}`,
  },
  footerLogo: { height: 18, objectFit: 'contain' },
  footerText: { fontSize: '0.72rem', color: colors.textMuted, fontWeight: 600, letterSpacing: '0.04em' },
  loading: { textAlign: 'center', padding: '2rem', color: colors.textMuted },
  error: { textAlign: 'center', padding: '2rem', color: colors.error },
}

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

const CUT_LINE = 5

export default function CoachDashboard() {
  const [view, setView] = useState('players') // 'players', 'live', 'rounds', 'scorecard'
  const [players, setPlayers] = useState(null)
  const [live, setLive] = useState(null)
  const [selectedPlayer, setSelectedPlayer] = useState(null)
  const [playerRounds, setPlayerRounds] = useState(null)
  const [selectedRoundId, setSelectedRoundId] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    authedFetch('/coach/team-stats').then(setPlayers).catch((err) => setError(err.message))
  }, [])

  function openLive() {
    setError(null)
    setView('live')
    authedFetch('/coach/live-rounds').then(setLive).catch((err) => setError(err.message))
  }

  useEffect(() => {
    if (view !== 'live') return
    const interval = setInterval(() => {
      authedFetch('/coach/live-rounds').then(setLive).catch(() => {})
    }, 10000)
    return () => clearInterval(interval)
  }, [view])

  function openPlayer(p) {
    setSelectedPlayer(p)
    setPlayerRounds(null)
    setError(null)
    setView('rounds')
    authedFetch(`/players/${p.player_id}/rounds`)
      .then(setPlayerRounds)
      .catch((err) => setError(err.message))
  }

  function openRound(roundId) {
    setSelectedRoundId(roundId)
    setView('scorecard')
  }

  if (error) {
    return (
      <div style={styles.page}>
        <p style={styles.error}>{error}</p>
        <button style={styles.linkBtn} onClick={() => { setError(null); setView('players') }}>← Back to team</button>
      </div>
    )
  }

  if (view === 'scorecard') {
    return <Scorecard roundId={selectedRoundId} onBack={() => setView('rounds')} editable />
  }

  if (view === 'rounds') {
    const isTeam = (r) => r.round_type === 'team'
    const groups = playerRounds ? [
      { key: 'completeTeam', title: 'Complete Team Rounds', rounds: playerRounds.filter((r) => isTeam(r) && r.completed) },
      { key: 'completeIndividual', title: 'Complete Individual Rounds', rounds: playerRounds.filter((r) => !isTeam(r) && r.completed) },
      { key: 'incompleteTeam', title: 'Incomplete Team Rounds', rounds: playerRounds.filter((r) => isTeam(r) && !r.completed) },
      { key: 'incompleteIndividual', title: 'Incomplete Individual Rounds', rounds: playerRounds.filter((r) => !isTeam(r) && !r.completed) },
    ] : []

    return (
      <div style={styles.page}>
        <button style={styles.linkBtn} onClick={() => setView('players')}>← Back to team</button>
        <h2>{selectedPlayer.full_name}'s Rounds</h2>

        {!playerRounds ? (
          <p>Loading…</p>
        ) : playerRounds.length === 0 ? (
          <p>No rounds yet.</p>
        ) : (
          groups.map((g) => (
            <div key={g.key}>
              <h3 style={styles.sectionTitle}>{g.title} ({g.rounds.length})</h3>
              {g.rounds.length === 0 ? (
                <p style={styles.muted}>None yet.</p>
              ) : (
                g.rounds.map((r) => (
                  <button key={r.id} style={styles.roundRow} onClick={() => openRound(r.id)}>
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
          ))
        )}
      </div>
    )
  }

  if (view === 'live') {
    return (
      <div style={styles.page}>
        <button style={styles.linkBtn} onClick={() => setView('players')}>← Back to team</button>
        <h2>Live Rounds</h2>
        <p style={styles.subtitle}>Updates every 10 seconds</p>

        {!live ? (
          <p>Loading…</p>
        ) : live.length === 0 ? (
          <p>No one is currently on the course.</p>
        ) : (
          live.map((r) => (
            <div key={r.round_id} style={styles.roundRow}>
              <div>
                <div style={styles.roundCourse}>{r.player_name}</div>
                <div style={styles.roundDate}>{r.course_name} · Hole {r.current_hole}</div>
              </div>
              <div style={styles.roundScore}>{formatToPar(r.score_to_par)}</div>
            </div>
          ))
        )}
      </div>
    )
  }

  // view === 'players'
  if (!players) return <div style={styles.page}><p>Loading…</p></div>

  const ranked = [...players].sort((a, b) => {
    if (!a.rounds_played && !b.rounds_played) return 0
    if (!a.rounds_played) return 1
    if (!b.rounds_played) return -1
    return a.scoring_avg_to_par - b.scoring_avg_to_par
  })

  return (
    <div style={styles.page}>
      <div style={styles.headerRow}>
        <h2 style={{ margin: 0 }}>Team Stats</h2>
        <button style={styles.liveBtn} onClick={openLive}>● Live Rounds</button>
      </div>
      <p style={styles.subtitle}>{players.length} player{players.length === 1 ? '' : 's'}, ranked by scoring average · tap a name for full history</p>

      {ranked.map((p, i) => {
        const rank = i + 1
        const showCutLine = rank === CUT_LINE + 1 && ranked.slice(0, i).some((x) => x.rounds_played)
        return (
          <div key={p.player_id}>
            {showCutLine && (
              <div style={styles.cutLine}>
                <span>CUT LINE</span>
              </div>
            )}
            <button
              style={{
                ...styles.playerCard,
                ...(rank > CUT_LINE && p.rounds_played ? styles.playerCardBelowCut : {}),
              }}
              onClick={() => openPlayer(p)}
            >
              <div style={styles.playerHeader}>
                <div style={{ ...styles.rankBadge, ...(rank <= CUT_LINE ? styles.rankBadgeTop : {}) }}>{rank}</div>
                <div style={styles.playerName}>{p.full_name}</div>
              </div>

              {!p.rounds_played ? (
                <p style={styles.noRounds}>No completed rounds yet</p>
              ) : (
                <>
                  <div style={styles.statsRow}>
                    <Stat label="Rounds" value={p.rounds_played} />
                    <Stat label="Scoring Avg" value={formatToPar(p.scoring_avg_to_par)} />
                    <Stat label="GIR %" value={p.gir_pct != null ? `${p.gir_pct}%` : '—'} />
                    <Stat label="Fairways %" value={p.fairway_pct != null ? `${p.fairway_pct}%` : '—'} />
                    <Stat label="Putts/Rd" value={p.putts_per_round} />
                  </div>
                  {p.last_round && (
                    <div style={styles.lastRound}>
                      Last round: Front {formatToPar(p.last_round.front9_to_par)} / Back {formatToPar(p.last_round.back9_to_par)} / Total {formatToPar(p.last_round.total_to_par)}
                    </div>
                  )}
                </>
              )}
            </button>
          </div>
        )
      })}
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

function formatToPar(n) {
  if (n == null) return '—'
  if (n === 0) return 'E'
  return n > 0 ? `+${n}` : `${n}`
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
  headerRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  liveBtn: {
    padding: '0.5rem 0.9rem',
    fontSize: '0.85rem',
    border: '1px solid #c62828',
    borderRadius: '0.4rem',
    background: 'white',
    color: '#c62828',
    fontWeight: 600,
  },
  subtitle: { color: '#666', marginTop: '0.3rem', marginBottom: '1.5rem' },
  cutLine: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    margin: '0.5rem 0',
    color: '#b00020',
    fontSize: '0.75rem',
    fontWeight: 'bold',
    letterSpacing: '0.08em',
  },
  playerCard: {
    display: 'block',
    width: '100%',
    textAlign: 'left',
    background: '#eef1f5',
    border: 'none',
    borderRadius: '0.75rem',
    padding: '1.25rem',
    marginBottom: '1rem',
    cursor: 'pointer',
  },
  playerCardBelowCut: {
    opacity: 0.7,
  },
  playerHeader: { display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' },
  rankBadge: {
    width: '1.8rem',
    height: '1.8rem',
    borderRadius: '50%',
    background: '#b6bfc5',
    color: 'white',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 'bold',
    fontSize: '0.9rem',
    flexShrink: 0,
  },
  rankBadgeTop: {
    background: '#004b87',
  },
  playerName: { fontSize: '1.15rem', fontWeight: 'bold', color: '#004b87' },
  noRounds: { color: '#888', fontSize: '0.9rem', margin: 0 },
  statsRow: { display: 'flex', flexWrap: 'wrap', gap: '1.25rem' },
  stat: { textAlign: 'center' },
  statValue: { fontSize: '1.2rem', fontWeight: 'bold', color: '#004b87' },
  statLabel: { fontSize: '0.75rem', color: '#666' },
  lastRound: { marginTop: '0.75rem', fontSize: '0.85rem', color: '#444', borderTop: '1px solid #ddd', paddingTop: '0.5rem' },
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
  sectionTitle: { marginTop: '1.5rem', marginBottom: '0.5rem' },
  muted: { color: '#888', fontSize: '0.9rem' },
  linkBtn: {
    display: 'block',
    marginBottom: '1rem',
    background: 'none',
    border: 'none',
    color: '#004b87',
    textDecoration: 'underline',
    fontSize: '0.95rem',
    cursor: 'pointer',
    padding: 0,
  },
  error: { color: '#b00020' },
}

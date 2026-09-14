import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient.js'

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

export default function CoachDashboard() {
  const [view, setView] = useState('players') // 'players', 'rounds', or 'roundDetail'
  const [players, setPlayers] = useState(null)
  const [selectedPlayer, setSelectedPlayer] = useState(null)
  const [playerRounds, setPlayerRounds] = useState(null)
  const [roundDetail, setRoundDetail] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    authedFetch('/coach/team-stats').then(setPlayers).catch((err) => setError(err.message))
  }, [])

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
    setRoundDetail(null)
    setError(null)
    setView('roundDetail')
    authedFetch(`/rounds/${roundId}/summary`)
      .then(setRoundDetail)
      .catch((err) => setError(err.message))
  }

  if (error) {
    return (
      <div style={styles.page}>
        <p style={styles.error}>{error}</p>
        <button style={styles.linkBtn} onClick={() => { setError(null); setView('players') }}>← Back to team</button>
      </div>
    )
  }

  if (view === 'roundDetail') {
    return (
      <div style={styles.page}>
        <button style={styles.linkBtn} onClick={() => setView('rounds')}>← Back to {selectedPlayer.full_name}'s rounds</button>
        {!roundDetail ? (
          <p>Loading…</p>
        ) : (
          <>
            <h2>Round Detail</h2>
            <p style={styles.subtitle}>
              {new Date(roundDetail.started_at).toLocaleDateString()} · {roundDetail.completed ? 'Completed' : 'In progress'}
            </p>
            <div style={styles.grid}>
              <Stat label="Score" value={formatToPar(roundDetail.score_to_par)} />
              <Stat label="Strokes" value={roundDetail.total_strokes} />
              <Stat label="Putts" value={roundDetail.putts} />
              <Stat label="Holes Played" value={roundDetail.holes_played} />
              <Stat label="GIR" value={`${roundDetail.gir_count}/${roundDetail.holes_played} (${roundDetail.gir_pct}%)`} />
              {roundDetail.fairway_count !== null && (
                <Stat label="Fairways" value={`${roundDetail.fairway_count} (${roundDetail.fairway_pct}%)`} />
              )}
            </div>
          </>
        )}
      </div>
    )
  }

  if (view === 'rounds') {
    return (
      <div style={styles.page}>
        <button style={styles.linkBtn} onClick={() => setView('players')}>← Back to team</button>
        <h2>{selectedPlayer.full_name}'s Rounds</h2>

        {!playerRounds ? (
          <p>Loading…</p>
        ) : playerRounds.length === 0 ? (
          <p>No rounds yet.</p>
        ) : (
          playerRounds.map((r) => (
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
    )
  }

  // view === 'players'
  if (!players) return <div style={styles.page}><p>Loading…</p></div>

  return (
    <div style={styles.page}>
      <h2>Team Stats</h2>
      <p style={styles.subtitle}>{players.length} player{players.length === 1 ? '' : 's'} · tap a name for full round history</p>

      {players.map((p) => (
        <button key={p.player_id} style={styles.playerCard} onClick={() => openPlayer(p)}>
          <div style={styles.playerName}>{p.full_name}</div>

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

function formatToPar(n) {
  if (n == null) return '—'
  if (n === 0) return 'E'
  return n > 0 ? `+${n}` : `${n}`
}

const styles = {
  page: { fontFamily: 'system-ui, sans-serif', padding: '1.5rem', maxWidth: 600, margin: '0 auto' },
  subtitle: { color: '#666', marginTop: '-0.5rem', marginBottom: '1.5rem' },
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1rem' },
  playerCard: {
    display: 'block',
    width: '100%',
    textAlign: 'left',
    background: '#f4f6f4',
    border: 'none',
    borderRadius: '0.75rem',
    padding: '1.25rem',
    marginBottom: '1rem',
    cursor: 'pointer',
  },
  playerName: { fontSize: '1.15rem', fontWeight: 'bold', color: '#0b3d2e', marginBottom: '0.5rem' },
  noRounds: { color: '#888', fontSize: '0.9rem', margin: 0 },
  statsRow: { display: 'flex', flexWrap: 'wrap', gap: '1.25rem' },
  stat: { textAlign: 'center' },
  statValue: { fontSize: '1.2rem', fontWeight: 'bold', color: '#0b3d2e' },
  statLabel: { fontSize: '0.75rem', color: '#666' },
  lastRound: { marginTop: '0.75rem', fontSize: '0.85rem', color: '#444', borderTop: '1px solid #ddd', paddingTop: '0.5rem' },
  roundRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    textAlign: 'left',
    background: '#f4f6f4',
    border: 'none',
    borderRadius: '0.6rem',
    padding: '1rem',
    marginBottom: '0.6rem',
    cursor: 'pointer',
  },
  roundCourse: { fontWeight: 600 },
  roundDate: { fontSize: '0.8rem', color: '#666', marginTop: '0.15rem' },
  roundScore: { fontSize: '1.3rem', fontWeight: 'bold', color: '#0b3d2e' },
  linkBtn: {
    display: 'block',
    marginBottom: '1rem',
    background: 'none',
    border: 'none',
    color: '#0b3d2e',
    textDecoration: 'underline',
    fontSize: '0.95rem',
    cursor: 'pointer',
    padding: 0,
  },
  error: { color: '#b00020' },
}

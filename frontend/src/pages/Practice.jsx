import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient.js'
import { colors } from '../theme.js'

const API_BASE = import.meta.env.VITE_API_BASE

async function authedFetch(path, options = {}) {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export default function Practice({ player }) {
  const [view, setView] = useState('selectPlayer') // 'selectPlayer', 'list', 'rules', 'entry', 'result'
  const [teamPlayers, setTeamPlayers] = useState(null)
  const [targetPlayer, setTargetPlayer] = useState(null)
  const [combines, setCombines] = useState(null)
  const [selected, setSelected] = useState(null) // combine definition
  const [attempts, setAttempts] = useState([])
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    authedFetch('/team/players').then(setTeamPlayers).catch((err) => setError(err.message))
    authedFetch('/combines').then(setCombines).catch((err) => setError(err.message))
  }, [])

  function pickTargetPlayer(p) {
    setTargetPlayer(p)
    setView('list')
  }

  function openRules(combine) {
    setSelected(combine)
    setView('rules')
  }

  function startCombine() {
    const isLadder = selected.scoring_type === 'ladder_completions'
    const length = isLadder
      ? selected.groups.length * selected.sub_attempts_per_group
      : selected.attempts
    setAttempts(Array(length).fill(null))
    setView('entry')
  }

  function setAttempt(index, code) {
    const next = [...attempts]
    next[index] = code
    setAttempts(next)
  }

  async function completeCombine() {
    setError(null)
    try {
      const res = await authedFetch(`/combines/${selected.slug}/submit`, {
        method: 'POST',
        body: JSON.stringify({ attempts, player_id: targetPlayer.id }),
      })
      setResult(res)
      setView('result')
    } catch (err) {
      setError(err.message)
    }
  }

  const isLadder = selected?.scoring_type === 'ladder_completions'
  const pointsByCode = selected
    ? Object.fromEntries(selected.results.map((r) => [r.code, r.points]))
    : {}

  let runningTotal = 0
  if (isLadder && selected) {
    const per = selected.sub_attempts_per_group
    for (let g = 0; g < selected.groups.length; g++) {
      const groupCodes = attempts.slice(g * per, (g + 1) * per)
      if (groupCodes.every((c) => c === 'make')) runningTotal += 1
    }
  } else {
    runningTotal = attempts.reduce((sum, code) => sum + (code ? pointsByCode[code] : 0), 0)
  }

  const allFilled = attempts.length > 0 && attempts.every((a) => a !== null)

  if (error) {
    return (
      <div style={styles.page}>
        <p style={styles.error}>{error}</p>
        <button style={styles.linkBtn} onClick={() => { setError(null); setView('list') }}>← Back</button>
      </div>
    )
  }

  if (view === 'selectPlayer') {
    return (
      <div style={styles.page}>
        <h2>Who's practicing?</h2>
        <p style={styles.objective}>
          Pick the player this combine is for. Practicing in pairs? Whoever has the phone can log for their partner — select their name instead of your own.
        </p>
        {!teamPlayers ? (
          <p>Loading…</p>
        ) : (
          teamPlayers.map((p) => (
            <button
              key={p.id}
              style={{ ...styles.combineCard, ...(p.id === player?.id ? styles.selfCard : {}) }}
              onClick={() => pickTargetPlayer(p)}
            >
              <div style={styles.combineName}>
                {p.full_name}{p.id === player?.id ? ' (Me)' : ''}
              </div>
            </button>
          ))
        )}
      </div>
    )
  }

  if (view === 'result' && result) {
    const unitLabel = isLadder ? 'completions' : 'points'
    return (
      <div style={styles.page}>
        <h2>{selected.name} — Complete</h2>
        <div style={styles.scoreBox}>
          <div style={styles.scoreValue}>{result.total_points} / {result.max_points}</div>
          <div style={styles.scoreLabel}>{unitLabel}</div>
        </div>

        <h3 style={styles.sectionTitle}>Benchmarks</h3>
        {selected.benchmarks.map((b) => (
          <div key={b.level} style={styles.benchmarkRow}>
            <span>{b.level}</span>
            <span>{b.range} {isLadder ? '' : 'pts'}</span>
          </div>
        ))}

        <button style={styles.button} onClick={() => setView('list')}>Done</button>
      </div>
    )
  }

  if (view === 'entry' && selected) {
    return (
      <div style={styles.page}>
        <div style={styles.topRow}>
          <button style={styles.smallBtn} onClick={() => setView('rules')}>← Back</button>
          <div style={styles.runningTotal}>{runningTotal} {isLadder ? 'completions' : 'pts'}</div>
        </div>

        <h2>{selected.name}</h2>

        {isLadder ? (
          selected.groups.map((group, g) => {
            const per = selected.sub_attempts_per_group
            return (
              <div key={g} style={styles.attemptRow}>
                <div style={styles.attemptLabel}>{group.label}</div>
                <div style={styles.ladderSubRow}>
                  {Array.from({ length: per }, (_, k) => {
                    const index = g * per + k
                    return (
                      <div key={k}>
                        <div style={styles.subLabel}>Putt {k + 1}</div>
                        <div style={styles.resultButtons}>
                          {selected.results.map((r) => (
                            <button
                              key={r.code}
                              type="button"
                              style={{ ...styles.resultBtn, ...(attempts[index] === r.code ? styles.resultBtnActive : {}) }}
                              onClick={() => setAttempt(index, r.code)}
                            >
                              {r.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })
        ) : (
          attempts.map((value, i) => (
            <div key={i} style={styles.attemptRow}>
              <div style={styles.attemptLabel}>
                {selected.attempt_labels ? selected.attempt_labels[i] : `Attempt ${i + 1}`}
              </div>
              <div style={styles.resultButtons}>
                {selected.results.map((r) => (
                  <button
                    key={r.code}
                    type="button"
                    style={{ ...styles.resultBtn, ...(value === r.code ? styles.resultBtnActive : {}) }}
                    onClick={() => setAttempt(i, r.code)}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
          ))
        )}

        {error && <p style={styles.error}>{error}</p>}

        <button style={styles.button} onClick={completeCombine} disabled={!allFilled}>
          Complete Combine
        </button>
      </div>
    )
  }

  if (view === 'rules' && selected) {
    return (
      <div style={styles.page}>
        <button style={styles.linkBtn} onClick={() => setView('list')}>← Back to Practice</button>
        <h2>{selected.name}</h2>
        <p style={styles.objective}>{selected.objective}</p>

        <h3 style={styles.sectionTitle}>Instructions</h3>
        <p>{selected.instructions}</p>

        <h3 style={styles.sectionTitle}>Scoring</h3>
        {isLadder ? (
          <p>A distance counts as 1 completion only if <strong>both</strong> putts at that distance are made. Max {selected.max_points} completions ({selected.groups.length} distances).</p>
        ) : (
          selected.results.map((r) => (
            <div key={r.code} style={styles.scoringRow}>
              <span>{r.label}</span>
              <span style={styles.scoringPoints}>{r.points} pt{r.points === 1 ? '' : 's'}</span>
            </div>
          ))
        )}

        <h3 style={styles.sectionTitle}>Benchmarks</h3>
        {selected.benchmarks.map((b) => (
          <div key={b.level} style={styles.benchmarkRow}>
            <span>{b.level}</span>
            <span>{b.range}{isLadder ? '' : ' pts'}</span>
          </div>
        ))}

        <button style={styles.button} onClick={startCombine}>Start Combine</button>
      </div>
    )
  }

  // view === 'list'
  if (!combines) return <div style={styles.page}><p>Loading…</p></div>

  const categories = [...new Set(combines.map((c) => c.category))]

  return (
    <div style={styles.page}>
      <div style={styles.loggingForBar}>
        <span>Logging for: <strong>{targetPlayer?.full_name}</strong></span>
        <button style={styles.changeBtn} onClick={() => setView('selectPlayer')}>Change</button>
      </div>
      <h2>Practice</h2>
      {categories.map((cat) => (
        <div key={cat}>
          <h3 style={styles.sectionTitle}>{cat}</h3>
          {combines.filter((c) => c.category === cat).map((c) => (
            <button key={c.slug} style={styles.combineCard} onClick={() => openRules(c)}>
              <div style={styles.combineName}>{c.name}</div>
              <div style={styles.combineObjective}>{c.objective}</div>
            </button>
          ))}
        </div>
      ))}
    </div>
  )
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
  sectionTitle: { marginTop: '1.5rem', marginBottom: '0.5rem' },
  objective: { color: colors.textMuted },
  combineCard: {
    display: 'block',
    width: '100%',
    textAlign: 'left',
    background: colors.grayLight,
    border: 'none',
    borderRadius: '0.6rem',
    padding: '1rem',
    marginBottom: '0.6rem',
    cursor: 'pointer',
  },
  combineName: { fontWeight: 600, color: colors.primary },
  combineObjective: { fontSize: '0.85rem', color: colors.textMuted, marginTop: '0.2rem' },
  selfCard: { border: `2px solid ${colors.primary}` },
  loggingForBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    background: colors.grayLight,
    borderRadius: '0.5rem',
    padding: '0.6rem 0.9rem',
    marginBottom: '1rem',
    fontSize: '0.85rem',
  },
  changeBtn: {
    background: 'none',
    border: 'none',
    color: colors.primary,
    textDecoration: 'underline',
    fontSize: '0.85rem',
    cursor: 'pointer',
    padding: 0,
  },
  scoringRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '0.5rem 0',
    borderBottom: '1px solid #eee',
  },
  scoringPoints: { fontWeight: 600, color: colors.primary },
  benchmarkRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '0.4rem 0',
  },
  button: {
    width: '100%',
    padding: '1rem',
    marginTop: '1.5rem',
    background: colors.primary,
    color: 'white',
    border: 'none',
    borderRadius: '0.5rem',
    fontSize: '1.1rem',
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
  topRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '1rem',
  },
  smallBtn: {
    padding: '0.5rem 0.9rem',
    fontSize: '0.9rem',
    border: '1px solid #ccc',
    borderRadius: '0.4rem',
    background: 'white',
    color: '#333',
  },
  runningTotal: {
    fontWeight: 'bold',
    fontSize: '1.2rem',
    color: colors.primary,
  },
  attemptRow: { marginBottom: '1.25rem' },
  attemptLabel: { fontWeight: 600, marginBottom: '0.4rem' },
  ladderSubRow: { display: 'flex', gap: '1.5rem', flexWrap: 'wrap' },
  subLabel: { fontSize: '0.8rem', color: colors.textMuted, marginBottom: '0.3rem' },
  resultButtons: { display: 'flex', flexWrap: 'wrap', gap: '0.5rem' },
  resultBtn: {
    padding: '0.6rem 0.9rem',
    fontSize: '0.95rem',
    border: '1px solid #ccc',
    borderRadius: '0.5rem',
    background: 'white',
  },
  resultBtnActive: {
    background: colors.primary,
    color: 'white',
    borderColor: colors.primary,
  },
  scoreBox: {
    textAlign: 'center',
    background: colors.grayLight,
    borderRadius: '0.75rem',
    padding: '1.5rem',
    marginTop: '1rem',
  },
  scoreValue: { fontSize: '2.2rem', fontWeight: 'bold', color: colors.primary },
  scoreLabel: { color: colors.textMuted },
  error: { color: colors.error, marginTop: '0.75rem' },
}

import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient.js'
import { colors, GREYHOUNDS_SIGN_URL, subtleBackdrop } from '../theme.js'

const API_BASE = import.meta.env.VITE_API_BASE

async function api(path, options = {}) {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    },
  })
  if (!res.ok) {
    const text = await res.text()
    try {
      const parsed = JSON.parse(text)
      throw new Error(parsed.detail || text)
    } catch (err) {
      if (err instanceof SyntaxError) throw new Error(text)
      throw err
    }
  }
  return res.json()
}

const STROKE_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

// Index of the first hole where something *I* enter is still missing: the
// official score for the card I keep, or my own copy of my score.
function firstIncompleteHole(state) {
  if (!state.mine || !state.marking) return 0
  for (let i = 0; i < state.holes.length; i++) {
    if (state.marking.holes[i]?.official == null || state.mine.holes[i]?.own == null) return i
  }
  return -1 // everything's entered
}

function formatToPar(n) {
  if (n === 0) return 'E'
  return n > 0 ? `+${n}` : `${n}`
}

export default function QualifierRound({ onBack, isCoach = false }) {
  const [state, setState] = useState(null)
  const [courses, setCourses] = useState([])
  const [courseId, setCourseId] = useState('')
  const [step, setStep] = useState('loading') // loading | start | play | sign
  const [holeIndex, setHoleIndex] = useState(0)
  const [officialVal, setOfficialVal] = useState(null)
  const [ownVal, setOwnVal] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  function routeFor(s) {
    if (!s.active || !s.mine || !s.marking) return { step: 'start' }
    const idx = firstIncompleteHole(s)
    return idx === -1 ? { step: 'sign' } : { step: 'play', idx }
  }

  useEffect(() => {
    Promise.all([api('/qualifier/my-cards'), api('/courses')])
      .then(([s, c]) => {
        setState(s)
        setCourses(c)
        const r = routeFor(s)
        setStep(r.step)
        if (r.idx != null) setHoleIndex(r.idx)
      })
      .catch((err) => setError(err.message))
  }, [])

  // Prefill the hole screen with whatever's already saved for this hole, so
  // coming back to fix a hole shows the current numbers.
  useEffect(() => {
    if (step !== 'play' || !state?.mine || !state?.marking) return
    setOfficialVal(state.marking.holes[holeIndex]?.official ?? null)
    setOwnVal(state.mine.holes[holeIndex]?.own ?? null)
  }, [step, holeIndex, state])

  // On the sign screen, keep refreshing so you see when your groupmates
  // finish entering / sign.
  useEffect(() => {
    if (step !== 'sign') return
    const refresh = () =>
      api('/qualifier/my-cards?include_completed=true').then(setState).catch(() => {})
    refresh()
    const interval = setInterval(refresh, 5000)
    return () => clearInterval(interval)
  }, [step])

  async function startQualifier() {
    setError(null)
    setBusy(true)
    try {
      const s = await api('/qualifier/start', {
        method: 'POST',
        body: JSON.stringify({ course_id: state.course_id || courseId }),
      })
      setState(s)
      const r = routeFor(s)
      setStep(r.step)
      setHoleIndex(r.idx ?? 0)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function saveHole() {
    setError(null)
    setBusy(true)
    try {
      const hole = state.holes[holeIndex]
      await api(`/rounds/${state.marking.round_id}/holes`, {
        method: 'POST',
        body: JSON.stringify({ hole_id: hole.id, strokes: officialVal }),
      })
      await api(`/rounds/${state.mine.round_id}/own-score`, {
        method: 'POST',
        body: JSON.stringify({ hole_id: hole.id, strokes: ownVal }),
      })
      const fresh = await api('/qualifier/my-cards')
      setState(fresh)
      if (holeIndex + 1 < state.holes.length) {
        setHoleIndex(holeIndex + 1)
      } else {
        setStep('sign')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function signCard() {
    setError(null)
    setBusy(true)
    try {
      setState(await api('/qualifier/sign', { method: 'POST' }))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function editCard() {
    setError(null)
    setBusy(true)
    try {
      setState(await api('/qualifier/unsign', { method: 'POST' }))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  function fixHole(number) {
    const idx = state.holes.findIndex((h) => h.hole_number === number)
    if (idx >= 0) {
      setError(null)
      setHoleIndex(idx)
      setStep('play')
    }
  }

  if (!state) {
    return (
      <div style={styles.page}>
        <button style={styles.linkBtn} onClick={onBack}>← Back</button>
        {error ? <p style={styles.error}>{error}</p> : <p>Loading…</p>}
      </div>
    )
  }

  if (!state.assignment) {
    return (
      <div style={styles.page}>
        <button style={styles.linkBtn} onClick={onBack}>← Back</button>
        <h2>Qualifier</h2>
        {isCoach ? (
          <p>
            Qualifier cards are kept by the players in each group. To enter a score yourself, go back and use
            "Enter a round for a player." Live scores are under Team → Live Rounds.
          </p>
        ) : (
          <p>
            You're not in a qualifier group yet. Your coach sets the groups before a qualifier —
            once you're in one, come back here to keep your card.
          </p>
        )}
      </div>
    )
  }

  const { target, marker } = state.assignment

  // ---- Start (pick a course / join the group's card) ----
  if (step === 'start') {
    const locked = !!state.course_id
    return (
      <div style={styles.page}>
        <button style={styles.linkBtn} onClick={onBack}>← Back</button>
        <h2>Qualifier</h2>
        <div style={styles.infoBox}>
          <div>You keep <strong>{target.full_name}</strong>'s score — it counts for them.</div>
          <div><strong>{marker.full_name}</strong> keeps yours — it counts for you.</div>
          <div>You also keep your own score as a second copy. No stats — just strokes.</div>
        </div>

        {locked ? (
          <p>Course: <strong>{state.course_name}</strong> (already set by your group)</p>
        ) : (
          <>
            <label style={styles.label}>Course</label>
            <select style={styles.select} value={courseId} onChange={(e) => setCourseId(e.target.value)}>
              <option value="" disabled>Select a course…</option>
              {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </>
        )}

        {error && <p style={styles.error}>{error}</p>}
        <button style={styles.button} onClick={startQualifier} disabled={busy || (!locked && !courseId)}>
          {busy ? 'Starting…' : 'Start Qualifier'}
        </button>
      </div>
    )
  }

  // ---- Hole by hole ----
  if (step === 'play') {
    const hole = state.holes[holeIndex]
    return (
      <div style={styles.page}>
        <div style={styles.topRow}>
          {holeIndex > 0 && (
            <button style={styles.smallBtn} onClick={() => { setError(null); setHoleIndex(holeIndex - 1) }}>← Back</button>
          )}
          <button style={styles.smallBtn} onClick={onBack}>Save &amp; Exit</button>
          {firstIncompleteHole(state) === -1 && (
            <button style={styles.smallBtn} onClick={() => setStep('sign')}>Review &amp; Sign</button>
          )}
        </div>

        <div style={styles.courseLine}>{state.course_name}</div>
        <div style={styles.holeHeader}>
          <h2 style={{ margin: 0 }}>Hole {hole.hole_number} <span style={styles.of}>of {state.holes.length}</span></h2>
          <div style={styles.parBadge}>PAR {hole.par}</div>
        </div>

        <label style={styles.label}>{target.full_name}'s score</label>
        <p style={styles.hint}>Their official score — you're keeping it.</p>
        <StrokeGrid value={officialVal} onChange={setOfficialVal} par={hole.par} />

        <label style={styles.label}>Your score</label>
        <p style={styles.hint}>Your own copy — {marker.full_name} is keeping the official one.</p>
        <StrokeGrid value={ownVal} onChange={setOwnVal} par={hole.par} />

        {error && <p style={styles.error}>{error}</p>}
        <button
          style={styles.button}
          onClick={saveHole}
          disabled={busy || officialVal == null || ownVal == null}
        >
          {busy ? 'Saving…' : holeIndex + 1 < state.holes.length ? 'Next Hole' : 'Finish & Review'}
        </button>
      </div>
    )
  }

  // ---- Review & sign ----
  const { mine, marking } = state
  const iSigned = !!(mine?.player_signed && marking?.marker_signed)
  const allDone = !!(mine?.completed && marking?.completed)
  const canSign = !!(mine?.ready && marking?.ready) && !iSigned

  return (
    <div style={styles.page}>
      <button style={styles.linkBtn} onClick={onBack}>← Back to Play</button>
      <h2>Review &amp; Sign</h2>
      <p style={styles.hint}>
        Check that each card matches. Both copies must agree on every hole before anyone can sign.
      </p>

      {mine && (
        <CardTable
          title="Your card"
          subtitle={`Kept by ${mine.marker_name}`}
          leftLabel="You wrote"
          rightLabel={`${mine.marker_name} wrote`}
          card={mine}
          leftKey="own"
          rightKey="official"
          signedLine={`You: ${mine.player_signed ? '✓ signed' : 'not signed'} · ${mine.marker_name}: ${mine.marker_signed ? '✓ signed' : 'not signed'}`}
          onFix={fixHole}
          locked={iSigned}
        />
      )}
      {marking && (
        <CardTable
          title={`${marking.player_name}'s card`}
          subtitle="Kept by you"
          leftLabel="You wrote"
          rightLabel={`${marking.player_name} wrote`}
          card={marking}
          leftKey="official"
          rightKey="own"
          signedLine={`You: ${marking.marker_signed ? '✓ signed' : 'not signed'} · ${marking.player_name}: ${marking.player_signed ? '✓ signed' : 'not signed'}`}
          onFix={fixHole}
          locked={iSigned}
        />
      )}

      {error && <p style={styles.error}>{error}</p>}

      {allDone ? (
        <>
          <p style={styles.success}>Both cards are signed — the scores are now on each player's profile.</p>
          <button style={styles.button} onClick={onBack}>Done</button>
        </>
      ) : iSigned ? (
        <>
          <p style={styles.success}>You signed. Waiting on your groupmates to sign their side — this updates automatically.</p>
          <button style={styles.secondaryBtn} onClick={editCard} disabled={busy}>
            Edit my card (unsign)
          </button>
        </>
      ) : (
        <>
          {!canSign && (
            <p style={styles.hint}>
              {[mine, marking].filter((c) => c && !c.ready).map((c) => (
                <span key={c.round_id} style={{ display: 'block' }}>
                  {c.missing.length > 0
                    ? `Waiting for scores on hole(s) ${c.missing.join(', ')} of ${c.kind === 'mine' ? 'your' : `${c.player_name}'s`} card.`
                    : `Copies don't match on hole(s) ${c.mismatched.join(', ')} of ${c.kind === 'mine' ? 'your' : `${c.player_name}'s`} card.`}
                </span>
              ))}
            </p>
          )}
          <button style={styles.button} onClick={signCard} disabled={busy || !canSign}>
            {busy ? 'Signing…' : 'Sign Card'}
          </button>
        </>
      )}
    </div>
  )
}

function StrokeGrid({ value, onChange, par }) {
  return (
    <div style={styles.grid}>
      {STROKE_OPTIONS.map((n) => {
        const selected = value === n
        return (
          <button
            key={n}
            type="button"
            style={{ ...styles.gridBtn, ...(selected ? styles.gridBtnSelected : {}) }}
            onClick={() => onChange(n)}
            aria-label={`${n} strokes on a par ${par}`}
          >
            {n}
          </button>
        )
      })}
    </div>
  )
}

function CardTable({ title, subtitle, leftLabel, rightLabel, card, leftKey, rightKey, signedLine, onFix, locked }) {
  const par = card.holes.reduce((sum, h) => sum + h.par, 0)
  const leftTotal = card.holes.every((h) => h[leftKey] != null) ? card.holes.reduce((s, h) => s + h[leftKey], 0) : null
  const rightTotal = card.holes.every((h) => h[rightKey] != null) ? card.holes.reduce((s, h) => s + h[rightKey], 0) : null
  return (
    <div style={styles.cardBox}>
      <div style={styles.cardTitle}>{title}</div>
      <div style={styles.cardSub}>{subtitle}</div>
      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th}>Hole</th>
            <th style={styles.th}>Par</th>
            <th style={styles.th}>{leftLabel}</th>
            <th style={styles.th}>{rightLabel}</th>
            <th style={styles.th}></th>
          </tr>
        </thead>
        <tbody>
          {card.holes.map((h) => {
            const l = h[leftKey]
            const r = h[rightKey]
            const bad = l != null && r != null && l !== r
            const pending = l == null || r == null
            return (
              <tr key={h.hole_id} style={bad ? styles.badRow : undefined}>
                <td style={styles.td}>{h.hole_number}</td>
                <td style={styles.td}>{h.par}</td>
                <td style={styles.td}>{l ?? '—'}</td>
                <td style={styles.td}>{r ?? '—'}</td>
                <td style={styles.td}>
                  {!locked && (bad || pending) && (
                    <button style={styles.fixBtn} onClick={() => onFix(h.hole_number)}>
                      {bad ? 'Fix' : 'Enter'}
                    </button>
                  )}
                </td>
              </tr>
            )
          })}
          <tr>
            <td style={styles.tdTotal} colSpan={2}>Total</td>
            <td style={styles.tdTotal}>{leftTotal ?? '—'}{leftTotal != null ? ` (${formatToPar(leftTotal - par)})` : ''}</td>
            <td style={styles.tdTotal}>{rightTotal ?? '—'}{rightTotal != null ? ` (${formatToPar(rightTotal - par)})` : ''}</td>
            <td style={styles.tdTotal}></td>
          </tr>
        </tbody>
      </table>
      <div style={styles.signedLine}>{signedLine}</div>
    </div>
  )
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
  linkBtn: {
    display: 'block', marginBottom: '1rem', background: 'none', border: 'none',
    color: colors.primary, textDecoration: 'underline', fontSize: '0.95rem', cursor: 'pointer', padding: 0,
  },
  error: { color: colors.error },
  success: { color: '#1b6e2f', fontWeight: 600 },
  hint: { color: colors.textMuted, fontSize: '0.9rem', margin: '0.25rem 0 0.5rem' },
  infoBox: {
    background: colors.grayLight, borderRadius: '0.6rem', padding: '0.9rem 1rem',
    display: 'flex', flexDirection: 'column', gap: '0.4rem', margin: '1rem 0',
  },
  label: { display: 'block', marginTop: '1.1rem', fontWeight: 600 },
  select: { width: '100%', padding: '0.75rem', fontSize: '1.05rem', marginTop: '0.25rem' },
  button: {
    width: '100%', marginTop: '1.25rem', padding: '1rem', fontSize: '1.1rem', fontWeight: 600,
    background: colors.primary, color: 'white', border: 'none', borderRadius: '0.6rem', cursor: 'pointer',
  },
  secondaryBtn: {
    width: '100%', marginTop: '0.75rem', padding: '0.85rem', fontSize: '1rem', fontWeight: 600,
    background: 'white', color: colors.primary, border: `2px solid ${colors.primary}`, borderRadius: '0.6rem', cursor: 'pointer',
  },
  topRow: { display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' },
  smallBtn: {
    padding: '0.5rem 0.8rem', fontSize: '0.9rem', background: 'white', color: colors.primary,
    border: `1px solid ${colors.primary}`, borderRadius: '0.5rem', cursor: 'pointer',
  },
  courseLine: { color: colors.textMuted, fontSize: '0.9rem' },
  holeHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.25rem' },
  of: { fontSize: '0.9rem', color: colors.textMuted, fontWeight: 400 },
  parBadge: {
    background: colors.primary, color: 'white', borderRadius: '0.5rem', padding: '0.35rem 0.7rem',
    fontWeight: 700, fontSize: '0.9rem',
  },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.5rem' },
  gridBtn: {
    padding: '0.9rem 0', fontSize: '1.15rem', fontWeight: 600, background: 'white', color: colors.black,
    border: `2px solid ${colors.gray}`, borderRadius: '0.6rem', cursor: 'pointer',
  },
  gridBtnSelected: { background: colors.primary, color: 'white', borderColor: colors.primary },
  cardBox: { border: `1px solid ${colors.gray}`, borderRadius: '0.6rem', padding: '0.9rem', margin: '1rem 0', background: 'white' },
  cardTitle: { fontWeight: 700, fontSize: '1.05rem', color: colors.primary },
  cardSub: { color: colors.textMuted, fontSize: '0.85rem', marginBottom: '0.5rem' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' },
  th: { textAlign: 'left', padding: '0.3rem 0.25rem', borderBottom: `1px solid ${colors.gray}`, fontSize: '0.75rem', color: colors.textMuted },
  td: { padding: '0.3rem 0.25rem', borderBottom: `1px solid ${colors.grayLight}` },
  tdTotal: { padding: '0.45rem 0.25rem', fontWeight: 700 },
  badRow: { background: '#fdecea', color: colors.error, fontWeight: 600 },
  fixBtn: {
    padding: '0.2rem 0.6rem', fontSize: '0.8rem', background: 'white', color: colors.primary,
    border: `1px solid ${colors.primary}`, borderRadius: '0.4rem', cursor: 'pointer',
  },
  signedLine: { marginTop: '0.6rem', fontSize: '0.85rem', color: colors.textMuted },
}

import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient.js'
import Login from './Login.jsx'
import CourseSetup from './CourseSetup.jsx'
import RoundSummary from './RoundSummary.jsx'
import Stats from './Stats.jsx'
import CoachDashboard from './CoachDashboard.jsx'
import Practice from './Practice.jsx'
import CombinesDashboard from './CombinesDashboard.jsx'

const API_BASE = import.meta.env.VITE_API_BASE

function strokeOptions(par) {
  if (par === 3) return range(1, 6)
  if (par === 4) return range(1, 8)
  return range(2, 9) // par 5
}

// Classifies a stroke count relative to par, used to color-code the
// strokes buttons (blue par, red birdie/eagle, gold ace, purple albatross).
function scoreTier(strokes, par) {
  if (strokes === 1) return 'ace'
  const relative = strokes - par
  if (relative === -3) return 'albatross'
  if (relative === -2) return 'eagle'
  if (relative === -1) return 'birdie'
  if (relative === 0) return 'par'
  return 'over' // bogey or worse
}

const TIER_COLORS = {
  par: '#004b87',
  birdie: '#c62828',
  eagle: '#c62828',
  albatross: '#6a1b9a',
  ace: '#d4af37',
  over: '#111111',
}

function range(start, end) {
  const out = []
  for (let i = start; i <= end; i++) out.push(i)
  return out
}

export default function ScoreEntry() {
  const [session, setSession] = useState(null)
  const [player, setPlayer] = useState(null)
  const [courses, setCourses] = useState([])
  const [selectedCourseId, setSelectedCourseId] = useState('')
  const [showCourseSetup, setShowCourseSetup] = useState(false)
  const [tab, setTab] = useState('play') // 'play', 'stats', or 'team' (coach only)
  const [round, setRound] = useState(null)
  const [holes, setHoles] = useState([])
  const [holeIndex, setHoleIndex] = useState(0)
  const [form, setForm] = useState({ strokes: null, putts: null, fairway_hit: null, gir: null })
  const [error, setError] = useState(null)
  const [summary, setSummary] = useState(null) // holds turn/final summary data when shown
  const [summaryIsTurn, setSummaryIsTurn] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: listener } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => listener.subscription.unsubscribe()
  }, [])

  // Once logged in, look up this user's row in `players` to get their role
  // (coach vs player) and load the list of courses for the picker.
  useEffect(() => {
    if (!session) {
      setPlayer(null)
      return
    }
    supabase
      .from('players')
      .select('*')
      .eq('id', session.user.id)
      .single()
      .then(({ data, error: playerError }) => {
        if (playerError) {
          setError(`Couldn't load your player profile: ${playerError.message}`)
          return
        }
        setPlayer(data)
      })

    apiCall('/courses')
      .then(setCourses)
      .catch((err) => setError(err.message))
  }, [session])

  async function apiCall(path, options = {}) {
    const token = session?.access_token
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

  async function startRound() {
    setError(null)
    try {
      // Fetch the course (and its holes) BEFORE starting the round, so if
      // this fails we never end up with a round marked started but no
      // hole data to show.
      const course = await apiCall(`/courses/${selectedCourseId}`)
      if (!course.holes || course.holes.length === 0) {
        throw new Error('This course has no holes set up yet.')
      }
      const sortedHoles = course.holes.sort((a, b) => a.hole_number - b.hole_number)

      const r = await apiCall('/rounds/start', {
        method: 'POST',
        body: JSON.stringify({ course_id: selectedCourseId }),
      })

      setHoles(sortedHoles)
      setHoleIndex(0)
      setRound(r)
    } catch (err) {
      setError(err.message)
    }
  }

  async function submitHole() {
    const hole = holes[holeIndex]
    try {
      await apiCall(`/rounds/${round.id}/holes`, {
        method: 'POST',
        body: JSON.stringify({
          hole_id: hole.id,
          strokes: form.strokes,
          putts: form.putts,
          fairway_hit: hole.par === 3 ? null : form.fairway_hit,
          gir: form.gir,
        }),
      })
      setForm({ strokes: null, putts: null, fairway_hit: null, gir: null })

      const holesJustCompleted = holeIndex + 1

      if (holesJustCompleted === holes.length) {
        // Finished the whole round
        await apiCall(`/rounds/${round.id}/complete`, { method: 'POST' })
        const finalSummary = await apiCall(`/rounds/${round.id}/summary`)
        setSummary(finalSummary)
        setSummaryIsTurn(false)
      } else if (holesJustCompleted === 9 && holes.length > 9) {
        // Reached the turn on an 18-hole round
        const turnSummary = await apiCall(`/rounds/${round.id}/summary`)
        setSummary(turnSummary)
        setSummaryIsTurn(true)
        setHoleIndex(holeIndex + 1)
      } else {
        setHoleIndex(holeIndex + 1)
      }
    } catch (err) {
      setError(err.message)
    }
  }

  function goToPreviousHole() {
    setError(null)
    setForm({ strokes: null, putts: null, fairway_hit: null, gir: null })
    setHoleIndex(Math.max(0, holeIndex - 1))
  }

  async function endRoundEarly() {
    const holesDone = holeIndex + (form.strokes ? 1 : 0)
    const confirmed = window.confirm(
      holesDone === 0
        ? 'End this round now with no holes recorded?'
        : `End this round now after ${holesDone} hole${holesDone === 1 ? '' : 's'}? This can't be undone.`
    )
    if (!confirmed) return

    setError(null)
    try {
      await apiCall(`/rounds/${round.id}/complete`, { method: 'POST' })
      const finalSummary = await apiCall(`/rounds/${round.id}/summary`)
      setSummary(finalSummary)
      setSummaryIsTurn(false)
    } catch (err) {
      setError(err.message)
    }
  }

  function dismissSummary() {
    if (summaryIsTurn) {
      setSummary(null)
    } else {
      // Round fully done — reset back to the start screen
      setSummary(null)
      setRound(null)
    }
  }

  if (!session) {
    return <Login />
  }

  if (!player) {
    return (
      <div style={styles.page}>
        <p>Loading…</p>
        {error && <p style={styles.error}>{error}</p>}
      </div>
    )
  }

  if (summary) {
    return <RoundSummary summary={summary} isTurn={summaryIsTurn} onContinue={dismissSummary} />
  }

  if (showCourseSetup) {
    return (
      <div>
        <CourseSetup
          onCreated={(course) => {
            setCourses([...courses, { id: course.id, name: course.name }])
            setShowCourseSetup(false)
          }}
        />
        <div style={styles.page}>
          <button style={styles.linkBtn} onClick={() => setShowCourseSetup(false)}>
            ← Back
          </button>
        </div>
      </div>
    )
  }

  // Mid-round: no nav tabs, just the hole entry screen, so nothing interrupts
  // an in-progress round.
  if (round) {
    const hole = holes[holeIndex]

    if (!hole) {
      return (
        <div style={styles.page}>
          <p>Something went wrong loading this hole.</p>
          {error && <p style={styles.error}>{error}</p>}
          <button style={styles.linkBtn} onClick={() => setRound(null)}>← Back to start</button>
        </div>
      )
    }

    return (
      <div style={styles.page}>
        <div style={styles.topRow}>
          {holeIndex > 0 && (
            <button style={styles.smallBtn} onClick={goToPreviousHole}>← Back</button>
          )}
          <button style={styles.smallBtnDanger} onClick={endRoundEarly}>End Round</button>
        </div>

        <div style={styles.holeHeader}>
          <div>
            <h2 style={styles.holeNumber}>Hole {hole.hole_number}</h2>
            <div style={styles.holeMeta}>
              HDCP {hole.handicap}{hole.yardage ? ` · ${hole.yardage} yds` : ''}
            </div>
          </div>
          <div style={styles.parBadge}>
            <div style={styles.parBadgeNumber}>{hole.par}</div>
            <div style={styles.parBadgeLabel}>PAR</div>
          </div>
        </div>

        <label style={styles.label}>Strokes</label>
        <ButtonGroup
          options={strokeOptions(hole.par)}
          value={form.strokes}
          onChange={(v) => setForm({ ...form, strokes: v })}
          tierFn={(v) => scoreTier(v, hole.par)}
        />

        <label style={styles.label}>Putts</label>
        <ButtonGroup
          options={[
            { value: 0, label: '0' },
            { value: 1, label: '1' },
            { value: 2, label: '2' },
            { value: 3, label: '3' },
            { value: 4, label: '4' },
            { value: 5, label: '4+' },
          ]}
          value={form.putts}
          onChange={(v) => setForm({ ...form, putts: v })}
        />

        {hole.par !== 3 && (
          <ToggleRow
            label="Fairway hit"
            value={form.fairway_hit}
            onChange={(v) => setForm({ ...form, fairway_hit: v })}
          />
        )}

        <ToggleRow label="Green in regulation" value={form.gir} onChange={(v) => setForm({ ...form, gir: v })} />

        {error && <p style={styles.error}>{error}</p>}

        <button style={styles.button} onClick={submitHole} disabled={!form.strokes}>
          {holeIndex + 1 < holes.length ? 'Next Hole' : 'Finish Round'}
        </button>
      </div>
    )
  }

  // Not mid-round: show the nav tabs (Play / My Stats / Team Stats for coaches)
  return (
    <div>
      <div style={styles.tabBar}>
        <button
          style={{ ...styles.tabBtn, ...(tab === 'play' ? styles.tabBtnActive : {}) }}
          onClick={() => setTab('play')}
        >
          Play
        </button>
        <button
          style={{ ...styles.tabBtn, ...(tab === 'stats' ? styles.tabBtnActive : {}) }}
          onClick={() => setTab('stats')}
        >
          My Stats
        </button>
        <button
          style={{ ...styles.tabBtn, ...(tab === 'practice' ? styles.tabBtnActive : {}) }}
          onClick={() => setTab('practice')}
        >
          Practice
        </button>
        {player.role === 'coach' && (
          <button
            style={{ ...styles.tabBtn, ...(tab === 'team' ? styles.tabBtnActive : {}) }}
            onClick={() => setTab('team')}
          >
            Team
          </button>
        )}
        {player.role === 'coach' && (
          <button
            style={{ ...styles.tabBtn, ...(tab === 'combines' ? styles.tabBtnActive : {}) }}
            onClick={() => setTab('combines')}
          >
            Combines
          </button>
        )}
      </div>

      {tab === 'stats' && <Stats player={player} />}
      {tab === 'practice' && <Practice player={player} />}
      {tab === 'team' && player.role === 'coach' && <CoachDashboard />}
      {tab === 'combines' && player.role === 'coach' && <CombinesDashboard />}
      {tab === 'play' && (
        <div style={styles.page}>
          <h2>Start a round</h2>

          {player.role === 'coach' && (
            <button style={styles.linkBtn} onClick={() => setShowCourseSetup(true)}>
              + Add a new course
            </button>
          )}

          {courses.length === 0 ? (
            <p>No courses yet. {player.role === 'coach' ? 'Add one above to get started.' : 'Ask your coach to add one.'}</p>
          ) : (
            <>
              <label style={styles.label}>Course</label>
              <select
                style={styles.input}
                value={selectedCourseId}
                onChange={(e) => setSelectedCourseId(e.target.value)}
              >
                <option value="" disabled>Select a course…</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>

              {error && <p style={styles.error}>{error}</p>}

              <button style={styles.button} onClick={startRound} disabled={!selectedCourseId}>
                Start Round
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

const TIER_ICONS = {
  ace: '★ ',
  albatross: '◆ ',
}

const GLOW_TIERS = new Set(['ace', 'albatross']) // extra size + glow to stand out further

function ButtonGroup({ options, value, onChange, tierFn }) {
  return (
    <div style={styles.buttonGroup}>
      {options.map((opt) => {
        const optValue = typeof opt === 'object' ? opt.value : opt
        const optLabel = typeof opt === 'object' ? opt.label : opt
        const tier = tierFn ? tierFn(optValue) : null
        const isSelected = value === optValue
        const tierColor = tier ? TIER_COLORS[tier] : null

        // Unselected tiered button: solid color, white text.
        // Selected tiered button: flips to white background, colored text —
        // makes the chosen value obvious at a glance.
        const tierColorStyle = tier
          ? {
              background: isSelected ? 'white' : tierColor,
              color: isSelected ? tierColor : 'white',
              borderColor: tierColor,
              borderWidth: '2px',
            }
          : {}

        return (
          <button
            key={optValue}
            type="button"
            style={{
              ...styles.groupBtn,
              ...(tier ? styles.groupBtnEmph : {}),
              ...(tier && GLOW_TIERS.has(tier) ? styles.groupBtnGlow : {}),
              ...tierColorStyle,
              ...(isSelected && !tier ? styles.groupBtnActive : {}),
            }}
            onClick={() => onChange(optValue)}
          >
            {TIER_ICONS[tier] || ''}{optLabel}
          </button>
        )
      })}
    </div>
  )
}

function ToggleRow({ label, value, onChange }) {
  return (
    <div style={styles.toggleRow}>
      <span>{label}</span>
      <div>
        <button
          style={{ ...styles.toggleBtn, ...(value === true ? styles.toggleActive : {}) }}
          onClick={() => onChange(true)}
        >
          Yes
        </button>
        <button
          style={{ ...styles.toggleBtn, ...(value === false ? styles.toggleActive : {}) }}
          onClick={() => onChange(false)}
        >
          No
        </button>
      </div>
    </div>
  )
}

const styles = {
  holeHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '0.5rem',
  },
  holeNumber: { margin: 0 },
  holeMeta: { color: '#5a6672', fontSize: '0.9rem', marginTop: '0.15rem' },
  parBadge: {
    background: '#004b87',
    color: 'white',
    borderRadius: '0.6rem',
    padding: '0.5rem 1.1rem',
    textAlign: 'center',
    minWidth: '3.5rem',
  },
  parBadgeNumber: { fontSize: '1.8rem', fontWeight: 'bold', lineHeight: 1 },
  parBadgeLabel: { fontSize: '0.65rem', letterSpacing: '0.08em', marginTop: '0.1rem' },
  page: {
    fontFamily: 'system-ui, sans-serif',
    padding: '1.5rem',
    maxWidth: 420,
    margin: '1.5rem auto',
    background: 'white',
    borderRadius: '0.75rem',
    boxShadow: '0 2px 10px rgba(0,0,0,0.06)',
  },
  label: { display: 'block', marginTop: '1rem', fontWeight: 600 },
  input: { width: '100%', padding: '0.75rem', fontSize: '1.25rem', marginTop: '0.25rem' },
  button: {
    width: '100%',
    padding: '1rem',
    marginTop: '1.5rem',
    background: '#004b87',
    color: 'white',
    border: 'none',
    borderRadius: '0.5rem',
    fontSize: '1.1rem',
  },
  buttonGroup: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.5rem',
    marginTop: '0.5rem',
  },
  groupBtn: {
    minWidth: '3rem',
    padding: '0.75rem',
    fontSize: '1.1rem',
    border: '1px solid #ccc',
    borderRadius: '0.5rem',
    background: 'white',
  },
  groupBtnEmph: {
    minWidth: '4rem',
    padding: '1rem',
    fontSize: '1.4rem',
    fontWeight: 'bold',
  },
  groupBtnActive: {
    background: '#004b87',
    color: 'white',
    borderColor: '#004b87',
  },
  // Extra size + glow for ace/albatross on top of the standard tier coloring
  // computed inline in ButtonGroup.
  groupBtnGlow: {
    minWidth: '4.5rem',
    padding: '1.1rem',
    fontSize: '1.6rem',
    boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
  },
  toggleRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem' },
  toggleBtn: { padding: '0.5rem 1rem', marginLeft: '0.5rem', border: '1px solid #ccc', borderRadius: '0.4rem' },
  toggleActive: { background: '#004b87', color: 'white', borderColor: '#004b87' },
  topRow: {
    display: 'flex',
    justifyContent: 'space-between',
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
  smallBtnDanger: {
    padding: '0.5rem 0.9rem',
    fontSize: '0.9rem',
    border: '1px solid #b00020',
    borderRadius: '0.4rem',
    background: 'white',
    color: '#b00020',
    marginLeft: 'auto',
  },
  linkBtn: {
    display: 'block',
    width: '100%',
    padding: '0.75rem',
    marginBottom: '1rem',
    background: 'none',
    border: '1px dashed #004b87',
    color: '#004b87',
    borderRadius: '0.4rem',
    fontSize: '0.95rem',
  },
  error: { color: '#b00020', marginTop: '0.75rem' },
  tabBar: {
    display: 'flex',
    flexWrap: 'wrap',
    maxWidth: 420,
    margin: '0 auto',
    borderBottom: '1px solid #ddd',
  },
  tabBtn: {
    flex: 1,
    padding: '1rem',
    background: 'none',
    border: 'none',
    borderBottom: '3px solid transparent',
    fontSize: '1rem',
    color: '#666',
  },
  tabBtnActive: {
    borderBottom: '3px solid #004b87',
    color: '#004b87',
    fontWeight: 600,
  },
}

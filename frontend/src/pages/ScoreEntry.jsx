import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient.js'
import Login from './Login.jsx'
import CourseSetup from './CourseSetup.jsx'
import RoundSummary from './RoundSummary.jsx'
import Stats from './Stats.jsx'

const API_BASE = import.meta.env.VITE_API_BASE

export default function ScoreEntry() {
  const [session, setSession] = useState(null)
  const [player, setPlayer] = useState(null)
  const [courses, setCourses] = useState([])
  const [selectedCourseId, setSelectedCourseId] = useState('')
  const [showCourseSetup, setShowCourseSetup] = useState(false)
  const [tab, setTab] = useState('play') // 'play' or 'stats'
  const [round, setRound] = useState(null)
  const [holes, setHoles] = useState([])
  const [holeIndex, setHoleIndex] = useState(0)
  const [form, setForm] = useState({ strokes: '', putts: '', fairway_hit: null, gir: null })
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
          strokes: Number(form.strokes),
          putts: form.putts ? Number(form.putts) : null,
          fairway_hit: hole.par === 3 ? null : form.fairway_hit,
          gir: form.gir,
        }),
      })
      setForm({ strokes: '', putts: '', fairway_hit: null, gir: null })

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
        <h2>Hole {hole.hole_number} — Par {hole.par}</h2>

        <label style={styles.label}>Strokes</label>
        <input
          type="number"
          inputMode="numeric"
          style={styles.input}
          value={form.strokes}
          onChange={(e) => setForm({ ...form, strokes: e.target.value })}
        />

        <label style={styles.label}>Putts</label>
        <input
          type="number"
          inputMode="numeric"
          style={styles.input}
          value={form.putts}
          onChange={(e) => setForm({ ...form, putts: e.target.value })}
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

  // Not mid-round: show the Play / My Stats tabs
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
      </div>

      {tab === 'stats' ? (
        <Stats player={player} />
      ) : (
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
  page: { fontFamily: 'system-ui, sans-serif', padding: '1.5rem', maxWidth: 420, margin: '0 auto' },
  label: { display: 'block', marginTop: '1rem', fontWeight: 600 },
  input: { width: '100%', padding: '0.75rem', fontSize: '1.25rem', marginTop: '0.25rem' },
  button: {
    width: '100%',
    padding: '1rem',
    marginTop: '1.5rem',
    background: '#0b3d2e',
    color: 'white',
    border: 'none',
    borderRadius: '0.5rem',
    fontSize: '1.1rem',
  },
  toggleRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem' },
  toggleBtn: { padding: '0.5rem 1rem', marginLeft: '0.5rem', border: '1px solid #ccc', borderRadius: '0.4rem' },
  toggleActive: { background: '#0b3d2e', color: 'white', borderColor: '#0b3d2e' },
  linkBtn: {
    display: 'block',
    width: '100%',
    padding: '0.75rem',
    marginBottom: '1rem',
    background: 'none',
    border: '1px dashed #0b3d2e',
    color: '#0b3d2e',
    borderRadius: '0.4rem',
    fontSize: '0.95rem',
  },
  error: { color: '#b00020', marginTop: '0.75rem' },
  tabBar: {
    display: 'flex',
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
    borderBottom: '3px solid #0b3d2e',
    color: '#0b3d2e',
    fontWeight: 600,
  },
}

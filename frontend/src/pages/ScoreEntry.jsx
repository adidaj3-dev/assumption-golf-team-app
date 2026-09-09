import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient.js'

const API_BASE = import.meta.env.VITE_API_BASE

export default function ScoreEntry() {
  const [session, setSession] = useState(null)
  const [round, setRound] = useState(null)
  const [holes, setHoles] = useState([])
  const [holeIndex, setHoleIndex] = useState(0)
  const [form, setForm] = useState({ strokes: '', putts: '', fairway_hit: null, gir: null })

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: listener } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => listener.subscription.unsubscribe()
  }, [])

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

  // Example flow: start a round against a known course_id.
  // In the real app, this would come from a "pick your course/tournament" screen —
  // stubbed here so the entry form itself is the focus of this scaffold.
  async function startPracticeRound(courseId) {
    const r = await apiCall('/rounds/start', {
      method: 'POST',
      body: JSON.stringify({ course_id: courseId }),
    })
    setRound(r)
    const course = await apiCall(`/courses/${courseId}`)
    setHoles(course.holes.sort((a, b) => a.hole_number - b.hole_number))
  }

  async function submitHole() {
    const hole = holes[holeIndex]
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
    if (holeIndex + 1 < holes.length) {
      setHoleIndex(holeIndex + 1)
    } else {
      await apiCall(`/rounds/${round.id}/complete`, { method: 'POST' })
      alert('Round complete!')
      setRound(null)
    }
  }

  if (!session) {
    return <div style={styles.page}>Sign in to enter scores. (Wire up Supabase auth UI here.)</div>
  }

  if (!round) {
    return (
      <div style={styles.page}>
        <h2>Start a round</h2>
        {/* Replace with a real course/tournament picker */}
        <button style={styles.button} onClick={() => startPracticeRound('REPLACE-WITH-COURSE-ID')}>
          Start Practice Round
        </button>
      </div>
    )
  }

  const hole = holes[holeIndex]

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

      <button style={styles.button} onClick={submitHole} disabled={!form.strokes}>
        {holeIndex + 1 < holes.length ? 'Next Hole' : 'Finish Round'}
      </button>
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
}

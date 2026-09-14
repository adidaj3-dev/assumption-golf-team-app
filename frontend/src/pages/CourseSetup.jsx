import { useState } from 'react'
import { supabase } from '../supabaseClient.js'

const API_BASE = import.meta.env.VITE_API_BASE

function emptyHoles(count) {
  return Array.from({ length: count }, (_, i) => ({
    hole_number: i + 1,
    par: 4,
    handicap: i + 1,
    yardage: '',
  }))
}

export default function CourseSetup({ onCreated }) {
  const [name, setName] = useState('')
  const [teeBox, setTeeBox] = useState('')
  const [holeCount, setHoleCount] = useState(18)
  const [holes, setHoles] = useState(emptyHoles(18))
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(null)

  function changeHoleCount(count) {
    setHoleCount(count)
    setHoles(emptyHoles(count))
  }

  function updateHole(index, field, value) {
    const next = [...holes]
    next[index] = { ...next[index], [field]: field === 'yardage' ? value : Number(value) }
    setHoles(next)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setSaving(true)
    setSuccess(null)

    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token

      const holesPayload = holes.map((h) => ({
        ...h,
        yardage: h.yardage === '' ? null : Number(h.yardage),
        tee_box: teeBox || null,
      }))

      const res = await fetch(`${API_BASE}/courses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name, holes: holesPayload }),
      })

      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || 'Failed to create course')
      }

      const course = await res.json()
      setSuccess(`Course "${course.name}" created.`)
      setName('')
      setTeeBox('')
      setHoleCount(18)
      setHoles(emptyHoles(18))
      if (onCreated) onCreated(course)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  // Basic sanity check: handicaps should be a full permutation of 1..holeCount,
  // each used exactly once. This just flags it — it doesn't block saving,
  // since you may still be mid-edit.
  const handicapValues = holes.map((h) => h.handicap)
  const handicapsValid =
    new Set(handicapValues).size === handicapValues.length &&
    handicapValues.every((h) => h >= 1 && h <= holeCount)

  const totalPar = holes.reduce((sum, h) => sum + h.par, 0)
  const totalYardage = holes.reduce((sum, h) => sum + (Number(h.yardage) || 0), 0)

  return (
    <div style={styles.page}>
      <h2>Add a course</h2>

      <form onSubmit={handleSubmit}>
        <label style={styles.label}>Course name</label>
        <input
          style={styles.input}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Pleasant Valley — Men's"
          required
        />

        <label style={styles.label}>Tee box (optional)</label>
        <input
          style={styles.input}
          value={teeBox}
          onChange={(e) => setTeeBox(e.target.value)}
          placeholder="e.g. Blue, White, Red"
        />

        <label style={styles.label}>Number of holes</label>
        <select
          style={styles.input}
          value={holeCount}
          onChange={(e) => changeHoleCount(Number(e.target.value))}
        >
          <option value={9}>9</option>
          <option value={18}>18</option>
        </select>

        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Hole</th>
              <th style={styles.th}>Par</th>
              <th style={styles.th}>Handicap</th>
              <th style={styles.th}>Yardage</th>
            </tr>
          </thead>
          <tbody>
            {holes.map((h, i) => (
              <tr key={h.hole_number}>
                <td style={styles.td}>{h.hole_number}</td>
                <td style={styles.td}>
                  <select
                    style={styles.selectSmall}
                    value={h.par}
                    onChange={(e) => updateHole(i, 'par', e.target.value)}
                  >
                    {[3, 4, 5].map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </td>
                <td style={styles.td}>
                  <select
                    style={styles.selectSmall}
                    value={h.handicap}
                    onChange={(e) => updateHole(i, 'handicap', e.target.value)}
                  >
                    {Array.from({ length: holeCount }, (_, n) => n + 1).map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </td>
                <td style={styles.td}>
                  <input
                    type="number"
                    inputMode="numeric"
                    style={styles.yardageInput}
                    value={h.yardage}
                    onChange={(e) => updateHole(i, 'yardage', e.target.value)}
                    placeholder="yds"
                  />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td style={styles.totalLabel}>Total</td>
              <td style={styles.totalValue}>{totalPar}</td>
              <td></td>
              <td style={styles.totalValue}>{totalYardage > 0 ? totalYardage : '—'}</td>
            </tr>
          </tfoot>
        </table>

        {!handicapsValid && (
          <p style={styles.warning}>
            Heads up: handicaps should each be used exactly once (1–{holeCount}). Double check before saving.
          </p>
        )}

        {error && <p style={styles.error}>{error}</p>}
        {success && <p style={styles.success}>{success}</p>}

        <button style={styles.button} disabled={saving}>
          {saving ? 'Saving…' : 'Create course'}
        </button>
      </form>
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
  label: { display: 'block', marginTop: '1rem', fontWeight: 600 },
  input: { width: '100%', padding: '0.75rem', fontSize: '1.1rem', marginTop: '0.25rem', boxSizing: 'border-box' },
  table: { width: '100%', marginTop: '1.5rem', borderCollapse: 'collapse' },
  th: { textAlign: 'left', borderBottom: '2px solid #ddd', padding: '0.4rem' },
  td: { padding: '0.3rem 0.4rem', borderBottom: '1px solid #eee' },
  selectSmall: { padding: '0.4rem', fontSize: '1rem' },
  yardageInput: { width: '4.5rem', padding: '0.4rem', fontSize: '1rem' },
  totalLabel: { padding: '0.5rem 0.4rem', fontWeight: 'bold', borderTop: '2px solid #ddd' },
  totalValue: { padding: '0.5rem 0.4rem', fontWeight: 'bold', borderTop: '2px solid #ddd', color: '#004b87' },
  warning: { color: '#8a6d00', marginTop: '1rem', fontSize: '0.9rem' },
  error: { color: '#b00020', marginTop: '0.75rem' },
  success: { color: '#004b87', marginTop: '0.75rem', fontWeight: 600 },
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
}

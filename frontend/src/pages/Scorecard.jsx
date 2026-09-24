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

export default function Scorecard({ roundId, onBack, editable }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(null) // holes array being edited, or null
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundId])

  function load() {
    authedFetch(`/rounds/${roundId}/scorecard`).then(setData).catch((err) => setError(err.message))
  }

  function startEditing() {
    setDraft(data.holes.map((h) => ({ ...h })))
    setEditing(true)
  }

  function cancelEditing() {
    setDraft(null)
    setEditing(false)
  }

  function updateDraftHole(index, field, value) {
    const next = [...draft]
    const parsed = value === '' ? null : Number(value)
    next[index] = { ...next[index], [field]: parsed }
    setDraft(next)
  }

  async function saveEdits() {
    setSaving(true)
    setError(null)
    try {
      for (let i = 0; i < draft.length; i++) {
        const original = data.holes[i]
        const edited = draft[i]
        const changed =
          edited.strokes !== original.strokes ||
          edited.putts !== original.putts ||
          edited.fairway_hit !== original.fairway_hit ||
          edited.gir !== original.gir
        if (!changed || edited.strokes === null) continue // skip untouched or blanked-out holes

        await authedFetch(`/rounds/${roundId}/holes`, {
          method: 'POST',
          body: JSON.stringify({
            hole_id: edited.hole_id,
            strokes: edited.strokes,
            putts: edited.putts,
            fairway_hit: edited.fairway_hit,
            gir: edited.gir,
          }),
        })
      }
      setEditing(false)
      setDraft(null)
      load()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (error) {
    return (
      <div style={styles.page}>
        <p style={styles.error}>{error}</p>
        <button style={styles.linkBtn} onClick={onBack}>← Back</button>
      </div>
    )
  }
  if (!data) return <div style={styles.page}><p>Loading…</p></div>

  const rows = editing ? draft : data.holes
  const played = rows.filter((h) => h.strokes !== null)
  const totalStrokes = played.reduce((s, h) => s + h.strokes, 0)
  const totalPar = played.reduce((s, h) => s + h.par, 0)

  return (
    <div style={styles.page}>
      <div style={styles.topRow}>
        <button style={styles.linkBtn} onClick={onBack}>← Back</button>
        {editable && !editing && (
          <button style={styles.editBtn} onClick={startEditing}>Edit scores</button>
        )}
      </div>
      <h2>{data.course_name}</h2>
      <p style={styles.subtitle}>
        {new Date(data.started_at).toLocaleDateString()} · {data.completed_at ? 'Completed' : 'In progress'}
      </p>

      {editing && (
        <p style={styles.editNote}>Editing — change any value below, then Save Changes. Leaving Strokes blank skips that hole.</p>
      )}

      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Hole</th>
              <th style={styles.th}>Par</th>
              <th style={styles.th}>HDCP</th>
              <th style={styles.th}>Yds</th>
              <th style={styles.th}>Score</th>
              <th style={styles.th}>Putts</th>
              <th style={styles.th}>FIR</th>
              <th style={styles.th}>GIR</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((h, i) => (
              <tr key={h.hole_number}>
                <td style={styles.td}>{h.hole_number}</td>
                <td style={styles.td}>{h.par}</td>
                <td style={styles.td}>{h.handicap}</td>
                <td style={styles.td}>{h.yardage ?? '—'}</td>
                {editing ? (
                  <>
                    <td style={styles.td}>
                      <input
                        type="number"
                        style={styles.editInput}
                        value={h.strokes ?? ''}
                        onChange={(e) => updateDraftHole(i, 'strokes', e.target.value)}
                      />
                    </td>
                    <td style={styles.td}>
                      <input
                        type="number"
                        style={styles.editInput}
                        value={h.putts ?? ''}
                        onChange={(e) => updateDraftHole(i, 'putts', e.target.value)}
                      />
                    </td>
                    <td style={styles.td}>
                      {h.fairway_hit === null ? (
                        '—'
                      ) : (
                        <button
                          style={styles.toggleCell}
                          onClick={() => updateDraftHole(i, 'fairway_hit', h.fairway_hit ? 0 : 1)}
                        >
                          {h.fairway_hit ? '✓' : '✗'}
                        </button>
                      )}
                    </td>
                    <td style={styles.td}>
                      <button
                        style={styles.toggleCell}
                        onClick={() => updateDraftHole(i, 'gir', h.gir ? 0 : 1)}
                      >
                        {h.gir ? '✓' : '✗'}
                      </button>
                    </td>
                  </>
                ) : (
                  <>
                    <td style={{ ...styles.td, ...scoreStyle(h.strokes, h.par) }}>{h.strokes ?? '—'}</td>
                    <td style={styles.td}>{h.putts ?? '—'}</td>
                    <td style={styles.td}>{h.fairway_hit === null ? '—' : h.fairway_hit ? '✓' : '✗'}</td>
                    <td style={styles.td}>{h.gir === null ? '—' : h.gir ? '✓' : '✗'}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td style={styles.totalLabel} colSpan={4}>Total</td>
              <td style={styles.totalValue}>{totalStrokes || '—'}</td>
              <td colSpan={3} style={styles.totalToPar}>
                {played.length > 0 ? formatToPar(totalStrokes - totalPar) : ''}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {editing && (
        <div style={styles.editActions}>
          <button style={styles.button} onClick={saveEdits} disabled={saving}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
          <button style={styles.linkBtn} onClick={cancelEditing}>Cancel</button>
        </div>
      )}
    </div>
  )
}

function scoreStyle(strokes, par) {
  if (strokes === null) return {}
  const rel = strokes - par
  if (strokes === 1) return { color: '#8a6d00', fontWeight: 'bold' }
  if (rel <= -2) return { color: '#6a1b9a', fontWeight: 'bold' }
  if (rel === -1) return { color: '#c62828', fontWeight: 'bold' }
  if (rel === 0) return { color: '#004b87', fontWeight: 'bold' }
  return { color: '#111' }
}

function formatToPar(n) {
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
  topRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  editBtn: {
    padding: '0.5rem 0.9rem',
    fontSize: '0.85rem',
    border: `1px solid ${colors.primary}`,
    borderRadius: '0.4rem',
    background: 'white',
    color: colors.primary,
    fontWeight: 600,
    height: 'fit-content',
  },
  editNote: { fontSize: '0.85rem', color: '#8a6d00', background: '#fff8e1', padding: '0.6rem 0.9rem', borderRadius: '0.4rem' },
  subtitle: { color: colors.textMuted, marginTop: '-0.5rem' },
  tableWrap: { overflowX: 'auto', marginTop: '1rem' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' },
  th: { textAlign: 'center', padding: '0.5rem 0.4rem', borderBottom: '2px solid #ddd', whiteSpace: 'nowrap' },
  td: { textAlign: 'center', padding: '0.45rem 0.4rem', borderBottom: '1px solid #eee' },
  editInput: { width: '3rem', padding: '0.3rem', fontSize: '0.95rem', textAlign: 'center' },
  toggleCell: {
    width: '2rem',
    padding: '0.3rem',
    border: '1px solid #ccc',
    borderRadius: '0.3rem',
    background: 'white',
  },
  totalLabel: { padding: '0.6rem 0.4rem', fontWeight: 'bold', borderTop: '2px solid #ddd', textAlign: 'right' },
  totalValue: { padding: '0.6rem 0.4rem', fontWeight: 'bold', borderTop: '2px solid #ddd', textAlign: 'center', color: colors.primary },
  totalToPar: { padding: '0.6rem 0.4rem', fontWeight: 'bold', borderTop: '2px solid #ddd', textAlign: 'center', color: colors.primary },
  editActions: { display: 'flex', gap: '1rem', alignItems: 'center', marginTop: '1.5rem' },
  button: {
    padding: '0.9rem 1.5rem',
    background: colors.primary,
    color: 'white',
    border: 'none',
    borderRadius: '0.5rem',
    fontSize: '1rem',
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
  error: { color: colors.error },
}

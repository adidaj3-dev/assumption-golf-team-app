import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient.js'
import { colors } from '../theme.js'

const API_BASE = import.meta.env.VITE_API_BASE

export default function Scorecard({ roundId, onBack }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function load() {
      try {
        const { data: sessionData } = await supabase.auth.getSession()
        const token = sessionData.session?.access_token
        const res = await fetch(`${API_BASE}/rounds/${roundId}/scorecard`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) throw new Error(await res.text())
        setData(await res.json())
      } catch (err) {
        setError(err.message)
      }
    }
    load()
  }, [roundId])

  if (error) {
    return (
      <div style={styles.page}>
        <p style={styles.error}>{error}</p>
        <button style={styles.linkBtn} onClick={onBack}>← Back</button>
      </div>
    )
  }
  if (!data) return <div style={styles.page}><p>Loading…</p></div>

  const played = data.holes.filter((h) => h.strokes !== null)
  const totalStrokes = played.reduce((s, h) => s + h.strokes, 0)
  const totalPar = played.reduce((s, h) => s + h.par, 0)

  return (
    <div style={styles.page}>
      <button style={styles.linkBtn} onClick={onBack}>← Back</button>
      <h2>{data.course_name}</h2>
      <p style={styles.subtitle}>
        {new Date(data.started_at).toLocaleDateString()} · {data.completed_at ? 'Completed' : 'In progress'}
      </p>

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
            {data.holes.map((h) => (
              <tr key={h.hole_number}>
                <td style={styles.td}>{h.hole_number}</td>
                <td style={styles.td}>{h.par}</td>
                <td style={styles.td}>{h.handicap}</td>
                <td style={styles.td}>{h.yardage ?? '—'}</td>
                <td style={{ ...styles.td, ...scoreStyle(h.strokes, h.par) }}>{h.strokes ?? '—'}</td>
                <td style={styles.td}>{h.putts ?? '—'}</td>
                <td style={styles.td}>{h.fairway_hit === null ? '—' : h.fairway_hit ? '✓' : '✗'}</td>
                <td style={styles.td}>{h.gir === null ? '—' : h.gir ? '✓' : '✗'}</td>
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
  subtitle: { color: colors.textMuted, marginTop: '-0.5rem' },
  tableWrap: { overflowX: 'auto', marginTop: '1rem' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' },
  th: { textAlign: 'center', padding: '0.5rem 0.4rem', borderBottom: '2px solid #ddd', whiteSpace: 'nowrap' },
  td: { textAlign: 'center', padding: '0.45rem 0.4rem', borderBottom: '1px solid #eee' },
  totalLabel: { padding: '0.6rem 0.4rem', fontWeight: 'bold', borderTop: '2px solid #ddd', textAlign: 'right' },
  totalValue: { padding: '0.6rem 0.4rem', fontWeight: 'bold', borderTop: '2px solid #ddd', textAlign: 'center', color: colors.primary },
  totalToPar: { padding: '0.6rem 0.4rem', fontWeight: 'bold', borderTop: '2px solid #ddd', textAlign: 'center', color: colors.primary },
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

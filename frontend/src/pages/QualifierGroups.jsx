import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient.js'
import { colors } from '../theme.js'

const API_BASE = import.meta.env.VITE_API_BASE

async function authedFetch(path, options = {}) {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...options.headers },
  })
  if (!res.ok) throw new Error(await res.text())
  const text = await res.text()
  return text ? JSON.parse(text) : null
}

const GROUP_NUMBERS = [1, 2, 3, 4]

export default function QualifierGroups({ onBack }) {
  const [roster, setRoster] = useState(null)
  const [teeTimes, setTeeTimes] = useState({ 1: '', 2: '', 3: '', 4: '' })
  const [assignments, setAssignments] = useState({}) // player_id -> group_number (or '' for unassigned)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    Promise.all([authedFetch('/team/players'), authedFetch('/qualifier/groups')])
      .then(([players, groups]) => {
        setRoster(players)
        const tt = { 1: '', 2: '', 3: '', 4: '' }
        const assign = {}
        for (const g of groups) {
          tt[g.group_number] = g.tee_time || ''
          for (const m of g.members) assign[m.id] = g.group_number
        }
        setTeeTimes(tt)
        setAssignments(assign)
      })
      .catch((err) => setError(err.message))
  }, [])

  function setGroupFor(playerId, groupNumber) {
    setSaved(false)
    setAssignments({ ...assignments, [playerId]: groupNumber })
  }

  async function save() {
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      const groups = GROUP_NUMBERS.map((n) => ({
        group_number: n,
        tee_time: teeTimes[n] || null,
        player_ids: Object.entries(assignments)
          .filter(([, g]) => Number(g) === n)
          .map(([pid]) => pid),
      }))
      await authedFetch('/qualifier/groups', { method: 'PUT', body: JSON.stringify({ groups }) })
      setSaved(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={styles.page}>
      <button style={styles.linkBtn} onClick={onBack}>← Back</button>
      <h2>Qualifier Groups</h2>
      <p style={styles.subtitleText}>
        Set this week's 4 tee-time groups from the roster. Once saved, each player sees their own
        group and can pick a groupmate to mark their scorecard instead of entering their own.
      </p>

      {!roster ? (
        <p>Loading…</p>
      ) : (
        <>
          <div style={styles.teeTimeGrid}>
            {GROUP_NUMBERS.map((n) => (
              <div key={n} style={styles.teeTimeBox}>
                <label style={styles.label}>Group {n} tee time</label>
                <input
                  style={styles.input}
                  placeholder="e.g. 8:10 AM"
                  value={teeTimes[n]}
                  onChange={(e) => { setSaved(false); setTeeTimes({ ...teeTimes, [n]: e.target.value }) }}
                />
              </div>
            ))}
          </div>

          <h3 style={styles.sectionTitle}>Roster</h3>
          {roster.map((p) => (
            <div key={p.id} style={styles.rosterRow}>
              <span style={styles.rosterName}>{p.full_name}</span>
              <select
                style={styles.select}
                value={assignments[p.id] ?? ''}
                onChange={(e) => setGroupFor(p.id, e.target.value ? Number(e.target.value) : '')}
              >
                <option value="">Unassigned</option>
                {GROUP_NUMBERS.map((n) => (
                  <option key={n} value={n}>Group {n}</option>
                ))}
              </select>
            </div>
          ))}

          {error && <p style={styles.error}>{error}</p>}
          {saved && <p style={styles.success}>Saved — groups are live for everyone.</p>}

          <button style={styles.button} onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save Groups'}
          </button>
        </>
      )}
    </div>
  )
}

const styles = {
  page: {
    fontFamily: 'system-ui, sans-serif',
    padding: '1.5rem',
    maxWidth: 480,
    margin: '1.5rem auto',
    background: colors.white,
    borderRadius: '0.75rem',
    boxShadow: '0 2px 10px rgba(0,0,0,0.06)',
  },
  subtitleText: { color: colors.textMuted, marginTop: '-0.25rem' },
  teeTimeGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginTop: '1rem' },
  teeTimeBox: {},
  label: { display: 'block', fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.3rem' },
  input: {
    width: '100%',
    padding: '0.6rem',
    fontSize: '0.95rem',
    boxSizing: 'border-box',
    border: `1px solid ${colors.gray}`,
    borderRadius: '0.4rem',
  },
  sectionTitle: { marginTop: '1.75rem', marginBottom: '0.5rem' },
  rosterRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.75rem',
    padding: '0.6rem 0',
    borderBottom: `1px solid ${colors.grayLight}`,
  },
  rosterName: { fontWeight: 600 },
  select: {
    padding: '0.5rem',
    fontSize: '0.9rem',
    border: `1px solid ${colors.gray}`,
    borderRadius: '0.4rem',
  },
  button: {
    width: '100%',
    padding: '1rem',
    marginTop: '1.5rem',
    background: colors.primary,
    color: colors.white,
    border: 'none',
    borderRadius: '0.5rem',
    fontSize: '1.05rem',
    fontWeight: 600,
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
  error: { color: colors.error, marginTop: '1rem' },
  success: { color: '#2e7d32', marginTop: '1rem', fontWeight: 600 },
}

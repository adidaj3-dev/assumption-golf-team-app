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

const SLOTS = Array.from({ length: 10 }, (_, i) => i + 1)

function formatToPar(n) {
  if (n == null) return '—'
  if (n === 0) return 'E'
  return n > 0 ? `+${n}` : `${n}`
}

// Coach-only: create a new tournament lineup (1-10 roster slots, course +
// par typed directly), browse past lineups, and log up to 3 quick-score
// rounds per player once one's set. Mirrors Qualifier Groups in spirit —
// this just replaces the old auto-ranked "Lineup" standings tier with
// something the coach actually sets by hand, tournament by tournament.
export default function Lineup({ onBack }) {
  const [team, setTeam] = useState(null) // 'men' | 'women', chosen first
  const [view, setView] = useState('list') // 'list' | 'new' | 'detail'
  const [lineups, setLineups] = useState(null)
  const [detail, setDetail] = useState(null)
  const [error, setError] = useState(null)

  // New-lineup form state
  const [roster, setRoster] = useState(null)
  const [name, setName] = useState('')
  const [courseName, setCourseName] = useState('')
  const [coursePar, setCoursePar] = useState('')
  const [slotAssignments, setSlotAssignments] = useState({}) // slot -> player_id
  const [saving, setSaving] = useState(false)

  // Quick-score form, keyed by entry id while open
  const [scoreFormFor, setScoreFormFor] = useState(null)
  const [scoreForm, setScoreForm] = useState({ strokes: '', putts: '', fairwaysHit: '', fairwaysTotal: '', girHit: '', girTotal: '' })
  const [scoreSaving, setScoreSaving] = useState(false)

  // Add-players editor, for filling in the rest of an already-saved lineup
  const [addingPlayers, setAddingPlayers] = useState(false)
  const [addRoster, setAddRoster] = useState(null)
  const [addSlotAssignments, setAddSlotAssignments] = useState({}) // slot -> player_id, empty slots only
  const [addSaving, setAddSaving] = useState(false)

  useEffect(() => {
    if (!team) return
    authedFetch(`/lineups?team=${team}`).then(setLineups).catch((err) => setError(err.message))
  }, [team])

  function startNew() {
    setView('new')
    setName('')
    setCourseName('')
    setCoursePar('')
    setSlotAssignments({})
    if (!roster) authedFetch('/team/players').then(setRoster).catch((err) => setError(err.message))
  }

  function openDetail(id) {
    setView('detail')
    setDetail(null)
    setAddingPlayers(false)
    setAddSlotAssignments({})
    authedFetch(`/lineups/${id}`).then(setDetail).catch((err) => setError(err.message))
  }

  function startAddingPlayers() {
    setAddingPlayers(true)
    setAddSlotAssignments({})
    setError(null)
    if (!addRoster) authedFetch('/team/players').then(setAddRoster).catch((err) => setError(err.message))
  }

  async function saveAddedPlayers() {
    setAddSaving(true)
    setError(null)
    try {
      const entries = Object.entries(addSlotAssignments)
        .filter(([, pid]) => pid)
        .map(([slot, pid]) => ({ slot: Number(slot), player_id: pid }))
      if (entries.length === 0) {
        setAddingPlayers(false)
        return
      }
      const updated = await authedFetch(`/lineups/${detail.id}/entries`, {
        method: 'PATCH',
        body: JSON.stringify({ entries }),
      })
      setDetail(updated)
      setAddingPlayers(false)
      setAddSlotAssignments({})
    } catch (err) {
      setError(err.message)
    } finally {
      setAddSaving(false)
    }
  }

  async function saveLineup() {
    setSaving(true)
    setError(null)
    try {
      const entries = Object.entries(slotAssignments)
        .filter(([, pid]) => pid)
        .map(([slot, pid]) => ({ slot: Number(slot), player_id: pid }))
      const created = await authedFetch('/lineups', {
        method: 'POST',
        body: JSON.stringify({
          team,
          name,
          course_name: courseName || null,
          course_par: coursePar ? Number(coursePar) : null,
          entries,
        }),
      })
      setLineups(await authedFetch(`/lineups?team=${team}`))
      setDetail(created)
      setView('detail')
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function saveScore(entryId) {
    setScoreSaving(true)
    setError(null)
    try {
      await authedFetch(`/lineups/${detail.id}/entries/${entryId}/rounds`, {
        method: 'POST',
        body: JSON.stringify({
          strokes: Number(scoreForm.strokes),
          putts: scoreForm.putts === '' ? null : Number(scoreForm.putts),
          fairways_hit: scoreForm.fairwaysHit === '' ? null : Number(scoreForm.fairwaysHit),
          fairways_total: scoreForm.fairwaysTotal === '' ? null : Number(scoreForm.fairwaysTotal),
          gir_hit: scoreForm.girHit === '' ? null : Number(scoreForm.girHit),
          gir_total: scoreForm.girTotal === '' ? null : Number(scoreForm.girTotal),
        }),
      })
      setDetail(await authedFetch(`/lineups/${detail.id}`))
      setScoreFormFor(null)
      setScoreForm({ strokes: '', putts: '', fairwaysHit: '', fairwaysTotal: '', girHit: '', girTotal: '' })
    } catch (err) {
      setError(err.message)
    } finally {
      setScoreSaving(false)
    }
  }

  if (!team) {
    return (
      <div style={styles.page}>
        <button style={styles.linkBtn} onClick={onBack}>← Back</button>
        <h2>Manage Lineup</h2>
        <p style={styles.subtitleText}>Which team?</p>
        <button style={styles.roundTypeBtn} onClick={() => setTeam('men')}>
          <div style={styles.roundTypeName}>Men's Lineup</div>
        </button>
        <button style={styles.roundTypeBtn} onClick={() => setTeam('women')}>
          <div style={styles.roundTypeName}>Women's Lineup</div>
        </button>
      </div>
    )
  }

  if (view === 'new') {
    const filledCount = Object.values(slotAssignments).filter(Boolean).length
    return (
      <div style={styles.page}>
        <button style={styles.linkBtn} onClick={() => setView('list')}>← Back</button>
        <h2>New {team === 'men' ? "Men's" : "Women's"} Lineup</h2>

        <label style={styles.label}>Tournament name</label>
        <input style={styles.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. NE10 Championship" />

        <label style={styles.label}>Course name</label>
        <input style={styles.input} value={courseName} onChange={(e) => setCourseName(e.target.value)} placeholder="e.g. Pleasant Valley" />

        <label style={styles.label}>Course par</label>
        <input
          style={styles.input}
          type="number"
          inputMode="numeric"
          value={coursePar}
          onChange={(e) => setCoursePar(e.target.value)}
          placeholder="e.g. 72"
        />

        <h3 style={styles.sectionTitle}>Slots (1–10)</h3>
        <p style={styles.subtitleText}>
          1–5 are always the starting lineup. Fill 6 or more and they're individuals — fill all 10 and 6–10 becomes a full B team.
        </p>

        {!roster ? (
          <p>Loading roster…</p>
        ) : (
          SLOTS.map((slot) => (
            <div key={slot} style={styles.slotRow}>
              <span style={styles.slotNumber}>{slot}</span>
              <select
                style={styles.select}
                value={slotAssignments[slot] || ''}
                onChange={(e) => setSlotAssignments({ ...slotAssignments, [slot]: e.target.value })}
              >
                <option value="">— empty —</option>
                {roster
                  .filter((p) => Object.entries(slotAssignments).every(([s, pid]) => Number(s) === slot || pid !== p.id))
                  .map((p) => (
                    <option key={p.id} value={p.id}>{p.full_name}</option>
                  ))}
              </select>
              <span style={styles.slotCategoryHint}>
                {slot <= 5 ? 'Starting' : filledCount >= 10 ? 'B Team' : 'Individual'}
              </span>
            </div>
          ))
        )}

        {error && <p style={styles.error}>{error}</p>}

        <button style={styles.button} onClick={saveLineup} disabled={saving || !name}>
          {saving ? 'Saving…' : 'Save Lineup'}
        </button>
      </div>
    )
  }

  if (view === 'detail') {
    if (!detail) return <div style={styles.page}><p>Loading…</p></div>
    return (
      <div style={styles.page}>
        <button style={styles.linkBtn} onClick={() => setView('list')}>← Back to lineups</button>
        <h2>{detail.name}</h2>
        {detail.course_name && (
          <p style={styles.subtitleText}>{detail.course_name}{detail.course_par ? ` · Par ${detail.course_par}` : ''}</p>
        )}

        {detail.entries.length === 0 && <p style={styles.muted}>No players assigned yet.</p>}
        {detail.entries.length < 10 && !addingPlayers && (
          <button style={styles.addRoundBtn} onClick={startAddingPlayers}>
            + Add Players ({detail.entries.length}/10 filled)
          </button>
        )}

        {addingPlayers && (
          <div style={styles.entryCard}>
            <div style={styles.entryName}>Fill in the rest</div>
            <p style={styles.entryCategory}>Only empty slots are shown — the ones already set are left alone.</p>
            {!addRoster ? (
              <p>Loading roster…</p>
            ) : (
              SLOTS.filter((slot) => !detail.entries.some((e) => e.slot === slot)).map((slot) => {
                const usedIds = new Set([
                  ...detail.entries.map((e) => e.player_id),
                  ...Object.entries(addSlotAssignments).filter(([s]) => Number(s) !== slot).map(([, pid]) => pid),
                ])
                return (
                  <div key={slot} style={styles.slotRow}>
                    <span style={styles.slotNumber}>{slot}</span>
                    <select
                      style={styles.select}
                      value={addSlotAssignments[slot] || ''}
                      onChange={(ev) => setAddSlotAssignments({ ...addSlotAssignments, [slot]: ev.target.value })}
                    >
                      <option value="">— empty —</option>
                      {addRoster.filter((p) => !usedIds.has(p.id)).map((p) => (
                        <option key={p.id} value={p.id}>{p.full_name}</option>
                      ))}
                    </select>
                    <span style={styles.slotCategoryHint}>{slot <= 5 ? 'Starting' : 'Individual'}</span>
                  </div>
                )
              })
            )}
            <div style={styles.scoreFormButtons}>
              <button style={styles.smallBtn} onClick={() => { setAddingPlayers(false); setAddSlotAssignments({}) }}>Cancel</button>
              <button style={styles.smallBtnPrimary} onClick={saveAddedPlayers} disabled={addSaving}>
                {addSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        )}

        {detail.entries.map((e) => (
          <div key={e.id} style={styles.entryCard}>
            <div style={styles.entryHeader}>
              <div>
                <div style={styles.entryName}>{e.slot}. {e.full_name}</div>
                <div style={styles.entryCategory}>{e.category}</div>
              </div>
              <div style={styles.entryAvg}>{formatToPar(e.tournament_avg_to_par)}</div>
            </div>

            {e.rounds.map((r) => (
              <div key={r.id} style={styles.roundLine}>
                <span>{r.strokes} strokes ({formatToPar(r.to_par)})</span>
                {r.putts != null && <span> · {r.putts} putts</span>}
                {r.fairways_total != null && <span> · {r.fairways_hit}/{r.fairways_total} FW</span>}
                {r.gir_total != null && <span> · {r.gir_hit}/{r.gir_total} GIR</span>}
              </div>
            ))}

            {e.rounds.length < 3 && (
              scoreFormFor === e.id ? (
                <div style={styles.scoreForm}>
                  <input
                    style={styles.scoreInput}
                    type="number"
                    inputMode="numeric"
                    placeholder="Total score"
                    value={scoreForm.strokes}
                    onChange={(ev) => setScoreForm({ ...scoreForm, strokes: ev.target.value })}
                  />
                  <input
                    style={styles.scoreInput}
                    type="number"
                    inputMode="numeric"
                    placeholder="Putts"
                    value={scoreForm.putts}
                    onChange={(ev) => setScoreForm({ ...scoreForm, putts: ev.target.value })}
                  />
                  <div style={styles.pairRow}>
                    <input
                      style={styles.pairInput}
                      type="number"
                      inputMode="numeric"
                      placeholder="FW made"
                      value={scoreForm.fairwaysHit}
                      onChange={(ev) => setScoreForm({ ...scoreForm, fairwaysHit: ev.target.value })}
                    />
                    <span>/</span>
                    <input
                      style={styles.pairInput}
                      type="number"
                      inputMode="numeric"
                      placeholder="FW total"
                      value={scoreForm.fairwaysTotal}
                      onChange={(ev) => setScoreForm({ ...scoreForm, fairwaysTotal: ev.target.value })}
                    />
                  </div>
                  <div style={styles.pairRow}>
                    <input
                      style={styles.pairInput}
                      type="number"
                      inputMode="numeric"
                      placeholder="GIR made"
                      value={scoreForm.girHit}
                      onChange={(ev) => setScoreForm({ ...scoreForm, girHit: ev.target.value })}
                    />
                    <span>/</span>
                    <input
                      style={styles.pairInput}
                      type="number"
                      inputMode="numeric"
                      placeholder="GIR total"
                      value={scoreForm.girTotal}
                      onChange={(ev) => setScoreForm({ ...scoreForm, girTotal: ev.target.value })}
                    />
                  </div>
                  <div style={styles.scoreFormButtons}>
                    <button style={styles.smallBtn} onClick={() => setScoreFormFor(null)}>Cancel</button>
                    <button
                      style={styles.smallBtnPrimary}
                      onClick={() => saveScore(e.id)}
                      disabled={scoreSaving || !scoreForm.strokes}
                    >
                      {scoreSaving ? 'Saving…' : 'Save Round'}
                    </button>
                  </div>
                </div>
              ) : (
                <button style={styles.addRoundBtn} onClick={() => setScoreFormFor(e.id)}>
                  + Add Round ({e.rounds.length}/3)
                </button>
              )
            )}
          </div>
        ))}

        {error && <p style={styles.error}>{error}</p>}
      </div>
    )
  }

  // view === 'list'
  return (
    <div style={styles.page}>
      <button style={styles.linkBtn} onClick={() => setTeam(null)}>← Back</button>
      <h2>{team === 'men' ? "Men's" : "Women's"} Lineups</h2>
      <button style={styles.button} onClick={startNew}>+ New Lineup</button>

      {error && <p style={styles.error}>{error}</p>}
      {!lineups ? (
        <p>Loading…</p>
      ) : lineups.length === 0 ? (
        <p style={styles.muted}>No lineups set yet.</p>
      ) : (
        lineups.map((l) => (
          <button key={l.id} style={styles.lineupRow} onClick={() => openDetail(l.id)}>
            <div style={styles.entryName}>{l.name}</div>
            <div style={styles.entryCategory}>
              {l.course_name || 'No course set'}{l.course_par ? ` · Par ${l.course_par}` : ''}
            </div>
          </button>
        ))
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
  label: { display: 'block', marginTop: '1rem', fontWeight: 600 },
  input: { width: '100%', padding: '0.75rem', fontSize: '1.05rem', marginTop: '0.25rem', boxSizing: 'border-box' },
  sectionTitle: { marginTop: '1.75rem', marginBottom: '0.25rem' },
  slotRow: { display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.5rem 0', borderBottom: `1px solid ${colors.grayLight}` },
  slotNumber: { width: '1.5rem', fontWeight: 'bold', color: colors.primary },
  select: { flex: 1, padding: '0.5rem', fontSize: '0.9rem', border: `1px solid ${colors.gray}`, borderRadius: '0.4rem' },
  slotCategoryHint: { fontSize: '0.75rem', color: colors.textMuted, width: '4.5rem', textAlign: 'right' },
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
  roundTypeBtn: {
    display: 'block',
    width: '100%',
    textAlign: 'left',
    background: colors.primary,
    border: 'none',
    borderRadius: '0.6rem',
    padding: '1.1rem',
    marginBottom: '0.75rem',
    cursor: 'pointer',
  },
  roundTypeName: { fontWeight: 'bold', color: 'white', fontSize: '1.05rem' },
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
  lineupRow: {
    display: 'block',
    width: '100%',
    textAlign: 'left',
    background: colors.grayLight,
    border: 'none',
    borderRadius: '0.6rem',
    padding: '1rem',
    marginTop: '0.75rem',
    cursor: 'pointer',
  },
  entryCard: {
    background: colors.grayLight,
    borderRadius: '0.6rem',
    padding: '1rem',
    marginTop: '0.75rem',
  },
  entryHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  entryName: { fontWeight: 'bold', fontSize: '1.05rem' },
  entryCategory: { fontSize: '0.8rem', color: colors.textMuted, marginTop: '0.15rem' },
  entryAvg: { fontWeight: 'bold', fontSize: '1.1rem', color: colors.primary },
  roundLine: { fontSize: '0.85rem', color: '#444', marginTop: '0.5rem' },
  addRoundBtn: {
    marginTop: '0.75rem',
    padding: '0.5rem 0.9rem',
    fontSize: '0.85rem',
    border: `1px dashed ${colors.primary}`,
    borderRadius: '0.4rem',
    background: 'none',
    color: colors.primary,
  },
  scoreForm: { marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' },
  scoreInput: { padding: '0.6rem', fontSize: '0.95rem', border: `1px solid ${colors.gray}`, borderRadius: '0.4rem' },
  pairRow: { display: 'flex', alignItems: 'center', gap: '0.5rem' },
  pairInput: { flex: 1, padding: '0.6rem', fontSize: '0.95rem', border: `1px solid ${colors.gray}`, borderRadius: '0.4rem', boxSizing: 'border-box' },
  scoreFormButtons: { display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' },
  smallBtn: { padding: '0.5rem 0.9rem', fontSize: '0.85rem', border: `1px solid ${colors.gray}`, borderRadius: '0.4rem', background: 'white' },
  smallBtnPrimary: { padding: '0.5rem 0.9rem', fontSize: '0.85rem', border: 'none', borderRadius: '0.4rem', background: colors.primary, color: 'white' },
  muted: { color: '#888', marginTop: '0.75rem' },
  error: { color: colors.error, marginTop: '0.75rem' },
}

import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient.js'
import { colors } from '../theme.js'

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
      throw new Error(JSON.parse(text).detail || text)
    } catch (err) {
      if (err instanceof SyntaxError) throw new Error(text)
      throw err
    }
  }
  return res.json()
}

const CATEGORIES = [
  ['putting', 'Putting'],
  ['short_game', 'Short Game'],
  ['wedges', 'Wedges'],
  ['irons', 'Irons'],
  ['driving', 'Driving'],
  ['course_management', 'Course Mgmt'],
  ['mental_game', 'Mental Game'],
  ['fitness', 'Fitness'],
  ['simulator', 'Simulator'],
  ['scoring_games', 'Scoring Games'],
]
const CATEGORY_LABEL = Object.fromEntries(CATEGORIES)
const LEVELS = [
  ['beginner', 'Beginner'],
  ['intermediate', 'Intermediate'],
  ['advanced', 'Advanced'],
  ['collegiate', 'Collegiate'],
]
const LEVEL_LABEL = { ...Object.fromEntries(LEVELS), all: 'All levels' }

const EMPTY_DRILL = {
  title: '', category: 'putting', level: 'intermediate', goal: '', setup: '', equipment: '',
  instructions: '', scoring: '', targets: '', coach_notes: '', duration_minutes: '', video_url: '',
  metric_label: '', higher_is_better: true, is_test: false, published: true,
}

// YouTube / Vimeo links play right in the page; anything else gets a link.
function embedUrl(url) {
  if (!url) return null
  const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{6,})/)
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`
  const vm = url.match(/vimeo\.com\/(\d+)/)
  if (vm) return `https://player.vimeo.com/video/${vm[1]}`
  return null
}

export default function Drills({ player }) {
  const isCoach = player?.role === 'coach'
  const [view, setView] = useState('list') // list | detail | edit | assign | assignments
  const [drills, setDrills] = useState(null)
  const [category, setCategory] = useState('')
  const [level, setLevel] = useState('')
  const [search, setSearch] = useState('')
  const [testsOnly, setTestsOnly] = useState(false)
  const [mine, setMine] = useState([]) // drills assigned to me
  const [detail, setDetail] = useState(null)
  const [form, setForm] = useState(EMPTY_DRILL)
  const [editingId, setEditingId] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)

  function loadList() {
    const params = new URLSearchParams()
    if (category) params.set('category', category)
    if (level) params.set('level', level)
    if (search.trim()) params.set('q', search.trim())
    if (testsOnly) params.set('tests_only', 'true')
    api(`/drills?${params}`).then(setDrills).catch((err) => setError(err.message))
  }

  useEffect(() => {
    const t = setTimeout(loadList, search ? 300 : 0)
    return () => clearTimeout(t)
  }, [category, level, search, testsOnly])

  useEffect(() => {
    api('/drill-assignments/mine').then(setMine).catch(() => {})
  }, [])

  async function openDrill(id) {
    setError(null)
    setNotice(null)
    setDetail(null)
    setView('detail')
    try {
      setDetail(await api(`/drills/${id}`))
    } catch (err) {
      setError(err.message)
    }
  }

  function startNew() {
    setForm(EMPTY_DRILL)
    setEditingId(null)
    setError(null)
    setView('edit')
  }

  function startEdit() {
    const f = { ...EMPTY_DRILL }
    for (const k of Object.keys(f)) f[k] = detail[k] ?? f[k]
    setForm(f)
    setEditingId(detail.id)
    setError(null)
    setView('edit')
  }

  async function saveDrill() {
    setBusy(true)
    setError(null)
    try {
      const body = {
        ...form,
        duration_minutes: form.duration_minutes === '' ? null : Number(form.duration_minutes),
      }
      const saved = await api(editingId ? `/drills/${editingId}` : '/drills', {
        method: editingId ? 'PATCH' : 'POST',
        body: JSON.stringify(body),
      })
      loadList()
      await openDrill(saved.id)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function deleteDrill() {
    if (!window.confirm(`Delete "${detail.title}"? This also removes its results and assignments.`)) return
    try {
      await api(`/drills/${detail.id}`, { method: 'DELETE' })
      loadList()
      setView('list')
    } catch (err) {
      setError(err.message)
    }
  }

  async function loadStarter() {
    setBusy(true)
    setError(null)
    try {
      const r = await api('/drills/load-starter-library', { method: 'POST' })
      setNotice(r.added > 0 ? `Added ${r.added} starter drills.` : 'The starter library is already loaded.')
      loadList()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })

  // ------------------------------------------------------------------ edit
  if (view === 'edit') {
    return (
      <div style={styles.page}>
        <button style={styles.linkBtn} onClick={() => (editingId ? setView('detail') : setView('list'))}>← Cancel</button>
        <h2>{editingId ? 'Edit drill' : 'New drill'}</h2>

        <Field label="Title"><input style={styles.input} value={form.title} onChange={set('title')} /></Field>
        <div style={styles.twoCol}>
          <Field label="Category">
            <select style={styles.input} value={form.category} onChange={set('category')}>
              {CATEGORIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </Field>
          <Field label="Level">
            <select style={styles.input} value={form.level} onChange={set('level')}>
              {LEVELS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              <option value="all">All levels</option>
            </select>
          </Field>
        </div>
        <Field label="Goal — what is this drill for?"><textarea style={styles.textarea} rows={2} value={form.goal} onChange={set('goal')} /></Field>
        <Field label="Setup"><textarea style={styles.textarea} rows={2} value={form.setup} onChange={set('setup')} /></Field>
        <Field label="Equipment"><input style={styles.input} value={form.equipment} onChange={set('equipment')} /></Field>
        <Field label="Instructions — one step per line">
          <textarea style={styles.textarea} rows={6} value={form.instructions} onChange={set('instructions')} />
        </Field>
        <Field label="How to score"><textarea style={styles.textarea} rows={2} value={form.scoring} onChange={set('scoring')} /></Field>
        <Field label="Targets by level"><input style={styles.input} value={form.targets} onChange={set('targets')} placeholder="Beginner 5 · Intermediate 7 · Advanced 8 · Collegiate 9" /></Field>
        <Field label="Your coaching notes — shown to players">
          <textarea style={styles.textarea} rows={4} value={form.coach_notes} onChange={set('coach_notes')} />
        </Field>
        <Field label="Video link (YouTube, Vimeo or any URL)">
          <input style={styles.input} value={form.video_url} onChange={set('video_url')} placeholder="https://" />
        </Field>
        <div style={styles.twoCol}>
          <Field label="Minutes"><input style={styles.input} type="number" min="1" value={form.duration_minutes} onChange={set('duration_minutes')} /></Field>
          <Field label="Result players log (leave blank = no logging)">
            <input style={styles.input} value={form.metric_label} onChange={set('metric_label')} placeholder="e.g. Makes out of 10" />
          </Field>
        </div>
        <label style={styles.check}><input type="checkbox" checked={form.higher_is_better} onChange={set('higher_is_better')} /> Higher result is better</label>
        <label style={styles.check}><input type="checkbox" checked={form.is_test} onChange={set('is_test')} /> This is a scored test (shows in "Tests only")</label>
        <label style={styles.check}><input type="checkbox" checked={form.published} onChange={set('published')} /> Visible to players</label>

        {error && <p style={styles.error}>{error}</p>}
        <button style={styles.button} onClick={saveDrill} disabled={busy || !form.title.trim() || !form.instructions.trim()}>
          {busy ? 'Saving…' : 'Save drill'}
        </button>
      </div>
    )
  }

  // ---------------------------------------------------------------- assign
  if (view === 'assign') {
    return <AssignView drill={detail} onDone={() => setView('detail')} />
  }
  if (view === 'assignments') {
    return <AssignmentsView onBack={() => setView('list')} />
  }

  // ---------------------------------------------------------------- detail
  if (view === 'detail') {
    return (
      <div style={styles.page}>
        <button style={styles.linkBtn} onClick={() => { setView('list'); api('/drill-assignments/mine').then(setMine).catch(() => {}) }}>← All drills</button>
        {error && <p style={styles.error}>{error}</p>}
        {!detail && !error && <p>Loading…</p>}
        {detail && (
          <DrillDetail
            drill={detail}
            isCoach={isCoach}
            player={player}
            onEdit={startEdit}
            onDelete={deleteDrill}
            onAssign={() => setView('assign')}
            onReload={() => openDrill(detail.id)}
          />
        )}
      </div>
    )
  }

  // ------------------------------------------------------------------ list
  const pending = mine.filter((a) => !a.done)
  return (
    <div style={styles.page}>
      <div style={styles.headerRow}>
        <h2 style={{ margin: 0 }}>Drills</h2>
        {isCoach && (
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            <button style={styles.smallBtn} onClick={() => setView('assignments')}>Assigned</button>
            <button style={styles.smallBtnPrimary} onClick={startNew}>+ New</button>
          </div>
        )}
      </div>

      {pending.length > 0 && (
        <div style={styles.assignedBox}>
          <div style={styles.assignedTitle}>Assigned to you</div>
          {pending.map((a) => (
            <button key={a.id} style={styles.assignedRow} onClick={() => openDrill(a.drill_id)}>
              <span style={{ fontWeight: 600 }}>{a.title}</span>
              <span style={styles.rowSub}>
                {CATEGORY_LABEL[a.category]}{a.due_date ? ` · due ${a.due_date}` : ''}{a.note ? ` · ${a.note}` : ''}
              </span>
            </button>
          ))}
        </div>
      )}

      <input
        style={styles.input}
        placeholder="Search drills"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div style={styles.chips}>
        <Chip active={!category} onClick={() => setCategory('')}>All</Chip>
        {CATEGORIES.map(([k, l]) => (
          <Chip key={k} active={category === k} onClick={() => setCategory(category === k ? '' : k)}>{l}</Chip>
        ))}
      </div>
      <div style={styles.filterRow}>
        <select style={{ ...styles.input, marginTop: 0 }} value={level} onChange={(e) => setLevel(e.target.value)}>
          <option value="">Any level</option>
          {LEVELS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <label style={styles.check}>
          <input type="checkbox" checked={testsOnly} onChange={(e) => setTestsOnly(e.target.checked)} /> Tests only
        </label>
      </div>

      {notice && <p style={styles.success}>{notice}</p>}
      {error && <p style={styles.error}>{error}</p>}
      {!drills && !error && <p>Loading…</p>}

      {drills && drills.length === 0 && (
        <div style={styles.empty}>
          <p>No drills match.</p>
          {isCoach && !category && !level && !search && !testsOnly && (
            <button style={styles.button} onClick={loadStarter} disabled={busy}>
              {busy ? 'Loading…' : 'Load the starter drill library'}
            </button>
          )}
        </div>
      )}

      {drills && drills.map((d) => (
        <button key={d.id} style={styles.drillCard} onClick={() => openDrill(d.id)}>
          <div style={styles.drillTop}>
            <span style={styles.drillTitle}>{d.title}</span>
            {d.video_url && <span title="Has video" style={styles.videoDot}>▶</span>}
          </div>
          <div style={styles.drillMeta}>
            <span style={styles.pill}>{CATEGORY_LABEL[d.category]}</span>
            <span style={styles.pill}>{LEVEL_LABEL[d.level]}</span>
            {d.is_test && <span style={{ ...styles.pill, ...styles.pillTest }}>Test</span>}
            {!d.published && <span style={{ ...styles.pill, ...styles.pillHidden }}>Hidden</span>}
            {d.duration_minutes && <span style={styles.rowSub}>{d.duration_minutes} min</span>}
          </div>
          {d.goal && <div style={styles.drillGoal}>{d.goal}</div>}
        </button>
      ))}

      {isCoach && drills && drills.length > 0 && !category && !level && !search && !testsOnly && (
        <button style={styles.linkBtn} onClick={loadStarter} disabled={busy}>
          Add any missing starter drills
        </button>
      )}
    </div>
  )
}

// ------------------------------------------------------------------ detail
function DrillDetail({ drill, isCoach, player, onEdit, onDelete, onAssign, onReload }) {
  const [value, setValue] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const embed = embedUrl(drill.video_url)
  const steps = (drill.instructions || '').split('\n').filter((s) => s.trim())

  async function logResult() {
    setSaving(true)
    setError(null)
    try {
      await api(`/drills/${drill.id}/results`, {
        method: 'POST',
        body: JSON.stringify({ value: Number(value), notes }),
      })
      setValue('')
      setNotes('')
      onReload()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function removeResult(id) {
    try {
      await api(`/drill-results/${id}`, { method: 'DELETE' })
      onReload()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div>
      <h2 style={{ marginBottom: '0.4rem' }}>{drill.title}</h2>
      <div style={styles.drillMeta}>
        <span style={styles.pill}>{CATEGORY_LABEL[drill.category]}</span>
        <span style={styles.pill}>{LEVEL_LABEL[drill.level]}</span>
        {drill.is_test && <span style={{ ...styles.pill, ...styles.pillTest }}>Test</span>}
        {!drill.published && <span style={{ ...styles.pill, ...styles.pillHidden }}>Hidden</span>}
        {drill.duration_minutes && <span style={styles.rowSub}>{drill.duration_minutes} min</span>}
      </div>

      {isCoach && (
        <div style={styles.coachBar}>
          <button style={styles.smallBtn} onClick={onEdit}>Edit</button>
          <button style={styles.smallBtn} onClick={onAssign}>Assign</button>
          <button style={{ ...styles.smallBtn, color: colors.error, borderColor: colors.error }} onClick={onDelete}>Delete</button>
        </div>
      )}

      {drill.video_url && (
        <div style={{ marginTop: '1rem' }}>
          {embed ? (
            <div style={styles.videoWrap}>
              <iframe
                src={embed}
                title={drill.title}
                style={styles.iframe}
                allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          ) : null}
          <a href={drill.video_url} target="_blank" rel="noreferrer" style={styles.videoLink}>▶ Watch the video</a>
        </div>
      )}

      {drill.coach_notes && (
        <div style={styles.coachNotes}>
          <div style={styles.sectionLabel}>Coach's notes</div>
          <div style={{ whiteSpace: 'pre-wrap' }}>{drill.coach_notes}</div>
        </div>
      )}

      <Section label="Goal">{drill.goal}</Section>
      <Section label="Setup">{drill.setup}</Section>
      <Section label="Equipment">{drill.equipment}</Section>
      <div style={styles.section}>
        <div style={styles.sectionLabel}>Instructions</div>
        <ol style={styles.steps}>
          {steps.map((s, i) => <li key={i}>{s}</li>)}
        </ol>
      </div>
      <Section label="How to score">{drill.scoring}</Section>
      <Section label="Targets">{drill.targets}</Section>

      {drill.metric_label && (
        <div style={styles.logBox}>
          <div style={styles.sectionLabel}>Log a result</div>
          <div style={styles.rowSub}>{drill.metric_label}{drill.higher_is_better ? ' — higher is better' : ' — lower is better'}</div>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
            <input
              style={{ ...styles.input, marginTop: 0, flex: '0 0 7rem' }}
              type="number"
              inputMode="decimal"
              step="any"
              placeholder="Result"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
            <input
              style={{ ...styles.input, marginTop: 0 }}
              placeholder="Notes (optional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          {error && <p style={styles.error}>{error}</p>}
          <button style={styles.button} onClick={logResult} disabled={saving || value === ''}>
            {saving ? 'Saving…' : 'Save result'}
          </button>

          {drill.my_results.length > 0 && (
            <div style={{ marginTop: '1rem' }}>
              <div style={styles.sectionLabel}>
                Your results{drill.my_best != null ? ` — best ${drill.my_best}` : ''}
              </div>
              {drill.my_results.map((r) => (
                <div key={r.id} style={styles.resultRow}>
                  <span>
                    <strong>{Number(r.value)}</strong>
                    <span style={styles.rowSub}> · {new Date(r.created_at).toLocaleDateString()}{r.notes ? ` · ${r.notes}` : ''}</span>
                  </span>
                  <button style={styles.xBtn} onClick={() => removeResult(r.id)} aria-label="Delete result">✕</button>
                </div>
              ))}
            </div>
          )}

          {drill.team_board.length > 0 && (
            <div style={{ marginTop: '1rem' }}>
              <div style={styles.sectionLabel}>Team best</div>
              {drill.team_board.map((b, i) => (
                <div key={b.player_id} style={{ ...styles.resultRow, ...(b.player_id === player?.id ? styles.meRow : {}) }}>
                  <span>{i + 1}. {b.full_name}</span>
                  <strong>{b.best}</strong>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ------------------------------------------------------------------ assign
function AssignView({ drill, onDone }) {
  const [players, setPlayers] = useState([])
  const [target, setTarget] = useState('all') // 'all' | 'men' | 'women' | player id
  const [due, setDue] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    api('/team/players').then((p) => setPlayers(p.filter((x) => x.role !== 'coach'))).catch(() => {})
  }, [])

  async function save() {
    setBusy(true)
    setError(null)
    try {
      const isTeam = ['all', 'men', 'women'].includes(target)
      await api('/drill-assignments', {
        method: 'POST',
        body: JSON.stringify({
          drill_id: drill.id,
          team: isTeam ? target : null,
          player_id: isTeam ? null : target,
          due_date: due || null,
          note,
        }),
      })
      setDone(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={styles.page}>
      <button style={styles.linkBtn} onClick={onDone}>← Back</button>
      <h2>Assign drill</h2>
      <p style={styles.rowSub}>{drill.title}</p>
      {done ? (
        <>
          <p style={styles.success}>Assigned. It now shows at the top of their Drills screen.</p>
          <button style={styles.button} onClick={onDone}>Done</button>
        </>
      ) : (
        <>
          <Field label="Assign to">
            <select style={styles.input} value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="all">Whole team</option>
              <option value="men">Men's team</option>
              <option value="women">Women's team</option>
              <optgroup label="One player">
                {players.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
              </optgroup>
            </select>
          </Field>
          <Field label="Due date (optional)"><input style={styles.input} type="date" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
          <Field label="Note (optional)"><input style={styles.input} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Do this before Friday's practice" /></Field>
          {error && <p style={styles.error}>{error}</p>}
          <button style={styles.button} onClick={save} disabled={busy}>{busy ? 'Assigning…' : 'Assign'}</button>
        </>
      )}
    </div>
  )
}

function AssignmentsView({ onBack }) {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState(null)
  const load = () => api('/drill-assignments').then(setRows).catch((err) => setError(err.message))
  useEffect(() => { load() }, [])

  async function remove(id) {
    try {
      await api(`/drill-assignments/${id}`, { method: 'DELETE' })
      load()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div style={styles.page}>
      <button style={styles.linkBtn} onClick={onBack}>← All drills</button>
      <h2>Assigned drills</h2>
      {error && <p style={styles.error}>{error}</p>}
      {!rows && !error && <p>Loading…</p>}
      {rows && rows.length === 0 && <p style={styles.rowSub}>Nothing assigned yet. Open a drill and tap Assign.</p>}
      {rows && rows.map((r) => (
        <div key={r.id} style={styles.resultRow}>
          <span>
            <strong>{r.title}</strong>
            <div style={styles.rowSub}>{r.target}{r.due_date ? ` · due ${r.due_date}` : ''}{r.note ? ` · ${r.note}` : ''}</div>
          </span>
          <button style={styles.xBtn} onClick={() => remove(r.id)} aria-label="Remove assignment">✕</button>
        </div>
      ))}
    </div>
  )
}

// ------------------------------------------------------------------ bits
function Field({ label, children }) {
  return (
    <label style={styles.field}>
      <span style={styles.fieldLabel}>{label}</span>
      {children}
    </label>
  )
}

function Section({ label, children }) {
  if (!children) return null
  return (
    <div style={styles.section}>
      <div style={styles.sectionLabel}>{label}</div>
      <div style={{ whiteSpace: 'pre-wrap' }}>{children}</div>
    </div>
  )
}

function Chip({ active, onClick, children }) {
  return (
    <button type="button" onClick={onClick} style={{ ...styles.chip, ...(active ? styles.chipActive : {}) }}>
      {children}
    </button>
  )
}

const styles = {
  page: {
    fontFamily: 'system-ui, sans-serif',
    padding: '1.5rem',
    maxWidth: 480,
    margin: '0 auto 1.5rem',
    background: 'white',
    borderRadius: '0.75rem',
    boxShadow: '0 2px 10px rgba(0,0,0,0.06)',
  },
  headerRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' },
  linkBtn: {
    display: 'block', marginBottom: '1rem', background: 'none', border: 'none', color: colors.primary,
    textDecoration: 'underline', fontSize: '0.95rem', cursor: 'pointer', padding: 0,
  },
  input: { width: '100%', padding: '0.7rem', fontSize: '1rem', marginTop: '0.25rem', boxSizing: 'border-box', borderRadius: '0.4rem', border: `1px solid ${colors.gray}` },
  textarea: { width: '100%', padding: '0.7rem', fontSize: '1rem', marginTop: '0.25rem', boxSizing: 'border-box', borderRadius: '0.4rem', border: `1px solid ${colors.gray}`, fontFamily: 'inherit' },
  field: { display: 'block', marginTop: '0.9rem' },
  fieldLabel: { fontSize: '0.85rem', fontWeight: 600, color: colors.textMuted },
  twoCol: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' },
  check: { display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.7rem', fontSize: '0.95rem' },
  button: {
    width: '100%', marginTop: '1rem', padding: '0.9rem', fontSize: '1.05rem', fontWeight: 600,
    background: colors.primary, color: 'white', border: 'none', borderRadius: '0.6rem', cursor: 'pointer',
  },
  smallBtn: {
    padding: '0.45rem 0.8rem', fontSize: '0.9rem', background: 'white', color: colors.primary,
    border: `1px solid ${colors.primary}`, borderRadius: '0.5rem', cursor: 'pointer',
  },
  smallBtnPrimary: {
    padding: '0.45rem 0.8rem', fontSize: '0.9rem', background: colors.primary, color: 'white',
    border: `1px solid ${colors.primary}`, borderRadius: '0.5rem', cursor: 'pointer',
  },
  chips: { display: 'flex', gap: '0.4rem', overflowX: 'auto', padding: '0.7rem 0', WebkitOverflowScrolling: 'touch' },
  chip: {
    flex: '0 0 auto', padding: '0.4rem 0.8rem', fontSize: '0.85rem', borderRadius: '1rem', cursor: 'pointer',
    background: colors.grayLight, color: colors.primary, border: `1px solid ${colors.grayLight}`, whiteSpace: 'nowrap',
  },
  chipActive: { background: colors.primary, color: 'white', borderColor: colors.primary },
  filterRow: { display: 'flex', alignItems: 'center', gap: '1rem' },
  drillCard: {
    display: 'block', width: '100%', textAlign: 'left', background: colors.grayLight, border: 'none',
    borderRadius: '0.6rem', padding: '0.9rem 1rem', marginTop: '0.6rem', cursor: 'pointer', color: colors.black,
  },
  drillTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' },
  drillTitle: { fontWeight: 700, color: colors.primary },
  videoDot: { color: colors.primary, fontSize: '0.8rem' },
  drillMeta: { display: 'flex', flexWrap: 'wrap', gap: '0.4rem', alignItems: 'center', marginTop: '0.4rem' },
  drillGoal: { fontSize: '0.85rem', color: colors.textMuted, marginTop: '0.4rem' },
  pill: { fontSize: '0.7rem', fontWeight: 600, padding: '0.15rem 0.5rem', borderRadius: '0.8rem', background: 'white', color: colors.primary, border: `1px solid ${colors.gray}` },
  pillTest: { background: colors.primary, color: 'white', borderColor: colors.primary },
  pillHidden: { background: '#fdecea', color: colors.error, borderColor: colors.error },
  rowSub: { fontSize: '0.8rem', color: colors.textMuted },
  assignedBox: { background: '#fff8e1', border: `1px solid ${colors.gold}`, borderRadius: '0.6rem', padding: '0.7rem 0.9rem', marginBottom: '1rem' },
  assignedTitle: { fontWeight: 700, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#7a5d00' },
  assignedRow: { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '0.1rem', width: '100%', textAlign: 'left', background: 'none', border: 'none', borderTop: '1px solid #f0e2a8', padding: '0.5rem 0', marginTop: '0.4rem', cursor: 'pointer', color: colors.black },
  empty: { textAlign: 'center', color: colors.textMuted },
  coachBar: { display: 'flex', gap: '0.5rem', marginTop: '0.8rem' },
  videoWrap: { position: 'relative', paddingBottom: '56.25%', height: 0, overflow: 'hidden', borderRadius: '0.6rem', background: '#000' },
  iframe: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 0 },
  videoLink: { display: 'inline-block', marginTop: '0.5rem', color: colors.primary, fontWeight: 600 },
  coachNotes: { marginTop: '1rem', background: colors.grayLight, borderLeft: `4px solid ${colors.primary}`, borderRadius: '0.4rem', padding: '0.8rem 1rem' },
  section: { marginTop: '1.1rem' },
  sectionLabel: { fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: colors.primary, marginBottom: '0.3rem' },
  steps: { margin: 0, paddingLeft: '1.2rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' },
  logBox: { marginTop: '1.5rem', border: `2px solid ${colors.primary}`, borderRadius: '0.6rem', padding: '1rem' },
  resultRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0', borderBottom: `1px solid ${colors.grayLight}` },
  meRow: { background: colors.grayLight, margin: '0 -0.4rem', padding: '0.5rem 0.4rem', borderRadius: '0.3rem' },
  xBtn: { background: 'none', border: 'none', color: colors.textMuted, cursor: 'pointer', fontSize: '1rem' },
  error: { color: colors.error },
  success: { color: '#1b6e2f', fontWeight: 600 },
}

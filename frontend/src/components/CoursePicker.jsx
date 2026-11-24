import { useEffect, useRef, useState } from 'react'
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

// Searchable course picker. Type a name; saved courses show first, then the
// national course database. Picking an online course asks which tee box, then
// copies it into the app's own database so it's a saved course from then on.
//
//   value      currently selected course id ('' if none)
//   savedCourses  [{id, name}] already in the app — shown before you type
//   onSelect   called with { id, name } once a course is chosen/imported
export default function CoursePicker({ value, savedCourses = [], onSelect }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState(null)
  const [searching, setSearching] = useState(false)
  const [openCourse, setOpenCourse] = useState(null) // { external_id, label, tees } while choosing a tee
  const [loadingTees, setLoadingTees] = useState(null)
  const [importing, setImporting] = useState(null)
  const [selected, setSelected] = useState(null) // { id, name } the person picked in this component
  const [error, setError] = useState(null)
  const [showAll, setShowAll] = useState(false)
  const latestSearch = useRef(0)
  const teesCache = useRef({}) // external_id -> tee list
  const onlineCache = useRef({}) // query -> online results, so repeating a search costs nothing

  // Search our own saved courses as they type. The online course database is
  // only asked when nothing saved matches (or they tap the button), because
  // every online search counts against the daily limit.
  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      setResults(null)
      setSearching(false)
      return
    }
    setSearching(true)
    const ticket = ++latestSearch.current
    const timer = setTimeout(async () => {
      try {
        const r = await api(`/course-search?q=${encodeURIComponent(q)}`)
        if (ticket !== latestSearch.current) return
        setResults({ ...r, onlineSearched: false })
        if (r.saved.length === 0 && r.online_enabled && q.length >= 3) await runOnline(q, ticket)
      } catch (err) {
        if (ticket === latestSearch.current) setError(err.message)
      } finally {
        if (ticket === latestSearch.current) setSearching(false)
      }
    }, 450)
    return () => clearTimeout(timer)
  }, [query])

  async function runOnline(q, ticket) {
    const key = q.toLowerCase()
    let o = onlineCache.current[key]
    if (!o) {
      o = await api(`/course-search?q=${encodeURIComponent(q)}&online=true`)
      if (!o.online_error) onlineCache.current[key] = o
    }
    if (ticket !== latestSearch.current) return
    setResults((prev) => (prev ? { ...prev, online: o.online, online_error: o.online_error, onlineSearched: true } : prev))
  }

  async function searchOnlineClick() {
    setError(null)
    setSearching(true)
    try {
      await runOnline(query.trim(), latestSearch.current)
    } catch (err) {
      setError(err.message)
    } finally {
      setSearching(false)
    }
  }

  function choose(course) {
    setSelected(course)
    setOpenCourse(null)
    setQuery('')
    setResults(null)
    setError(null)
    onSelect(course)
  }

  async function openOnline(c) {
    setError(null)
    setLoadingTees(c.external_id)
    try {
      const data = teesCache.current[c.external_id] || await api(`/course-tees?external_id=${encodeURIComponent(c.external_id)}`)
      teesCache.current[c.external_id] = data
      setOpenCourse({
        external_id: c.external_id,
        label: [data.club_name, data.course_name && data.course_name !== data.club_name ? data.course_name : null]
          .filter(Boolean)
          .join(' — '),
        tees: data.tees,
      })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoadingTees(null)
    }
  }

  async function pickTee(tee) {
    if (tee.local_course_id) {
      choose({ id: tee.local_course_id, name: `${openCourse.label} · ${tee.tee_name}` })
      return
    }
    setError(null)
    setImporting(tee.tee_name + tee.gender)
    try {
      choose(
        await api('/course-import', {
          method: 'POST',
          body: JSON.stringify({ external_id: openCourse.external_id, tee_name: tee.tee_name, gender: tee.gender }),
        }),
      )
    } catch (err) {
      setError(err.message)
    } finally {
      setImporting(null)
    }
  }

  const currentName = value
    ? (selected && selected.id === value ? selected.name : savedCourses.find((c) => c.id === value)?.name)
    : null

  if (value && currentName) {
    return (
      <div style={styles.selectedBox}>
        <div>
          <div style={styles.selectedLabel}>Course</div>
          <div style={styles.selectedName}>{currentName}</div>
        </div>
        <button type="button" style={styles.changeBtn} onClick={() => { setSelected(null); onSelect({ id: '', name: '' }) }}>
          Change
        </button>
      </div>
    )
  }

  // Newest first, so a course you just added is right at the top.
  const recentFirst = [...savedCourses].sort((a, b) => (b.created_at || '9').localeCompare(a.created_at || '9'))
  const showSaved = results ? results.saved : showAll ? recentFirst : recentFirst.slice(0, 8)
  const showSavedHeading = !openCourse && showSaved.length > 0

  return (
    <div>
      <label style={styles.label}>Course</label>
      <input
        style={styles.input}
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpenCourse(null) }}
        placeholder="Search any course — name or town"
        autoComplete="off"
      />

      {error && <p style={styles.error}>{error}</p>}

      {openCourse ? (
        <div style={styles.panel}>
          <div style={styles.panelTitle}>{openCourse.label}</div>
          <div style={styles.hint}>Which tees?</div>
          {openCourse.tees.length === 0 && <div style={styles.hint}>No full scorecards are available for this course.</div>}
          {openCourse.tees.map((t) => (
            <button
              key={t.tee_name + t.gender}
              type="button"
              style={styles.row}
              disabled={!!importing}
              onClick={() => pickTee(t)}
            >
              <span style={styles.rowMain}>
                {t.tee_name} <span style={styles.rowTag}>{t.gender === 'female' ? "Women's" : "Men's"}</span>
              </span>
              <span style={styles.rowSub}>
                {[
                  t.total_yards && `${t.total_yards} yds`,
                  t.par_total && `Par ${t.par_total}`,
                  t.course_rating && t.slope_rating && `${t.course_rating} / ${t.slope_rating}`,
                  t.number_of_holes === 9 && '9 holes',
                ].filter(Boolean).join(' · ')}
                {importing === t.tee_name + t.gender && ' — adding…'}
              </span>
            </button>
          ))}
          <button type="button" style={styles.linkBtn} onClick={() => setOpenCourse(null)}>← Back to results</button>
        </div>
      ) : (
        <>
          {showSavedHeading && (
            <div style={styles.panel}>
              <div style={styles.panelTitle}>{results ? 'Saved courses' : 'Your courses (newest first)'}</div>
              {showSaved.map((c) => (
                <button key={c.id} type="button" style={styles.row} onClick={() => choose({ id: c.id, name: c.name })}>
                  <span style={styles.rowMain}>{c.name}</span>
                  {(c.city || c.state) && <span style={styles.rowSub}>{[c.city, c.state].filter(Boolean).join(', ')}</span>}
                </button>
              ))}
              {!results && savedCourses.length > 8 && (
                <button type="button" style={styles.linkBtn} onClick={() => setShowAll(!showAll)}>
                  {showAll ? 'Show fewer' : `Show all ${savedCourses.length} saved courses`}
                </button>
              )}
            </div>
          )}

          {searching && <p style={styles.hint}>Searching…</p>}

          {results && results.online.length > 0 && (
            <div style={styles.panel}>
              <div style={styles.panelTitle}>Course database</div>
              {results.online.map((c) => (
                <button
                  key={c.external_id}
                  type="button"
                  style={styles.row}
                  disabled={loadingTees === c.external_id}
                  onClick={() => openOnline(c)}
                >
                  <span style={styles.rowMain}>
                    {[c.club_name, c.course_name && c.course_name !== c.club_name ? c.course_name : null].filter(Boolean).join(' — ')}
                  </span>
                  <span style={styles.rowSub}>
                    {[c.city, c.state].filter(Boolean).join(', ')}
                    {loadingTees === c.external_id && ' — loading tees…'}
                  </span>
                </button>
              ))}
            </div>
          )}

          {results && !searching && results.saved.length > 0 && !results.onlineSearched && results.online_enabled && (
            <button type="button" style={styles.linkBtn} onClick={searchOnlineClick}>
              Not listed? Search the course database
            </button>
          )}

          {results && !searching && results.saved.length === 0 && results.online.length === 0 &&
            (results.onlineSearched || !results.online_enabled) && (
            <p style={styles.hint}>
              No matches.{' '}
              {results.online_error
                ? results.online_error
                : !results.online_enabled
                  ? 'Online course search isn\'t turned on yet, so only saved courses show.'
                  : 'Try just the club name, or add it manually.'}
            </p>
          )}
          {results && results.onlineSearched && results.online_error && (results.saved.length > 0 || results.online.length > 0) && (
            <p style={styles.hint}>{results.online_error}</p>
          )}
        </>
      )}
    </div>
  )
}

const styles = {
  label: { display: 'block', marginTop: '1rem', fontWeight: 600 },
  input: { width: '100%', padding: '0.75rem', fontSize: '1.1rem', marginTop: '0.25rem', boxSizing: 'border-box' },
  hint: { color: colors.textMuted, fontSize: '0.9rem', margin: '0.5rem 0' },
  error: { color: colors.error, margin: '0.5rem 0' },
  panel: {
    marginTop: '0.5rem',
    border: `1px solid ${colors.gray}`,
    borderRadius: '0.6rem',
    background: 'white',
    overflow: 'hidden',
  },
  panelTitle: {
    padding: '0.5rem 0.75rem',
    background: colors.grayLight,
    fontSize: '0.75rem',
    fontWeight: 700,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    color: colors.primary,
  },
  row: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: '0.1rem',
    width: '100%',
    textAlign: 'left',
    padding: '0.7rem 0.75rem',
    background: 'white',
    border: 'none',
    borderTop: `1px solid ${colors.grayLight}`,
    cursor: 'pointer',
    fontSize: '1rem',
    color: colors.black,
  },
  rowMain: { fontWeight: 600 },
  rowSub: { fontSize: '0.8rem', color: colors.textMuted },
  rowTag: {
    marginLeft: '0.4rem',
    fontSize: '0.7rem',
    fontWeight: 600,
    padding: '0.1rem 0.4rem',
    borderRadius: '0.7rem',
    background: colors.grayLight,
    color: colors.primary,
  },
  linkBtn: {
    display: 'block',
    margin: '0.6rem 0.75rem',
    background: 'none',
    border: 'none',
    color: colors.primary,
    textDecoration: 'underline',
    cursor: 'pointer',
    padding: 0,
    fontSize: '0.9rem',
  },
  selectedBox: {
    marginTop: '1rem',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '0.75rem 1rem',
    border: `2px solid ${colors.primary}`,
    borderRadius: '0.6rem',
    background: colors.grayLight,
  },
  selectedLabel: { fontSize: '0.7rem', fontWeight: 700, color: colors.primary, textTransform: 'uppercase', letterSpacing: '0.05em' },
  selectedName: { fontWeight: 600 },
  changeBtn: {
    padding: '0.4rem 0.8rem',
    background: 'white',
    color: colors.primary,
    border: `1px solid ${colors.primary}`,
    borderRadius: '0.5rem',
    cursor: 'pointer',
  },
}

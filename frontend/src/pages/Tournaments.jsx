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

export default function Tournaments({ player }) {
  const [view, setView] = useState('list') // 'list', 'create', 'detail'
  const [events, setEvents] = useState(null)
  const [formats, setFormats] = useState(null)
  const [courses, setCourses] = useState(null)
  const [selectedEventId, setSelectedEventId] = useState(null)
  const [error, setError] = useState(null)

  const canManage = player.role === 'coach' || player.role === 'captain'

  useEffect(() => {
    loadEvents()
  }, [])

  function loadEvents() {
    authedFetch('/events').then(setEvents).catch((err) => setError(err.message))
  }

  function openCreate() {
    setError(null)
    setView('create')
    if (!formats) authedFetch('/event-formats').then(setFormats).catch((err) => setError(err.message))
    if (!courses) authedFetch('/courses').then(setCourses).catch((err) => setError(err.message))
  }

  function openEvent(id) {
    setSelectedEventId(id)
    setView('detail')
  }

  if (view === 'create') {
    return (
      <CreateEvent
        formats={formats}
        courses={courses}
        onCancel={() => setView('list')}
        onCreated={(ev) => { loadEvents(); openEvent(ev.id) }}
      />
    )
  }

  if (view === 'detail') {
    return (
      <EventDetail
        eventId={selectedEventId}
        canManage={canManage}
        onBack={() => { loadEvents(); setView('list') }}
      />
    )
  }

  // view === 'list'
  if (error) return <div style={styles.page}><p style={styles.error}>{error}</p></div>
  if (!events) return <div style={styles.page}><p>Loading…</p></div>

  return (
    <div style={styles.page}>
      <h2>Tournaments</h2>

      {canManage && (
        <button style={styles.linkBtn} onClick={openCreate}>+ Create an event</button>
      )}

      {events.length === 0 ? (
        <p style={styles.muted}>No events yet.</p>
      ) : (
        events.map((ev) => (
          <button key={ev.id} style={styles.eventCard} onClick={() => openEvent(ev.id)}>
            <div style={styles.eventName}>{ev.name}</div>
            <div style={styles.eventMeta}>
              {FORMAT_LABEL(ev.format_type)} · {ev.num_holes} holes
              {ev.courses && ` · ${ev.courses.name}`}
              {ev.event_date && ` · ${ev.event_date}`}
            </div>
          </button>
        ))
      )}
    </div>
  )
}

function FORMAT_LABEL(value) {
  const map = {
    stroke_individual: 'Stroke Play — Individual',
    stroke_team: 'Stroke Play — Team',
    best_ball: 'Best Ball',
    scramble_2: '2-Man Scramble',
    scramble_4: '4-Man Scramble',
    alt_shot: 'Alternate Shot',
    shamble: 'Shamble',
    chapman: 'Chapman (Pinehurst)',
    skins: 'Skins',
    stableford: 'Stableford',
    greyhound_cup: 'Greyhound Cup',
    wolf: 'Wolf',
    match_play: 'Match Play',
  }
  return map[value] || value
}

function CreateEvent({ formats, courses, onCancel, onCreated }) {
  const [name, setName] = useState('')
  const [eventDate, setEventDate] = useState('')
  const [courseId, setCourseId] = useState('')
  const [formatType, setFormatType] = useState('')
  const [numHoles, setNumHoles] = useState(18)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setSaving(true)
    try {
      const ev = await authedFetch('/events', {
        method: 'POST',
        body: JSON.stringify({
          name,
          event_date: eventDate || null,
          course_id: courseId || null,
          format_type: formatType,
          num_holes: Number(numHoles),
        }),
      })
      onCreated(ev)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={styles.page}>
      <button style={styles.linkBtn} onClick={onCancel}>← Back</button>
      <h2>Create Event</h2>

      <form onSubmit={handleSubmit}>
        <label style={styles.label}>Event name</label>
        <input style={styles.input} value={name} onChange={(e) => setName(e.target.value)} required />

        <label style={styles.label}>Date (optional)</label>
        <input type="date" style={styles.input} value={eventDate} onChange={(e) => setEventDate(e.target.value)} />

        <label style={styles.label}>Course (optional)</label>
        <select style={styles.input} value={courseId} onChange={(e) => setCourseId(e.target.value)}>
          <option value="">No course selected</option>
          {courses && courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>

        <label style={styles.label}>Format</label>
        <select style={styles.input} value={formatType} onChange={(e) => setFormatType(e.target.value)} required>
          <option value="" disabled>Select a format…</option>
          {formats && formats.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>

        <label style={styles.label}>Number of holes</label>
        <select style={styles.input} value={numHoles} onChange={(e) => setNumHoles(e.target.value)}>
          <option value={6}>6</option>
          <option value={9}>9</option>
          <option value={18}>18</option>
          <option value={36}>36</option>
        </select>

        {error && <p style={styles.error}>{error}</p>}

        <button style={styles.button} disabled={saving || !formatType}>
          {saving ? 'Creating…' : 'Create Event'}
        </button>
      </form>
    </div>
  )
}

function EventDetail({ eventId, canManage, onBack }) {
  const [event, setEvent] = useState(null)
  const [roster, setRoster] = useState(null)
  const [selectedPlayerIds, setSelectedPlayerIds] = useState([])
  const [groupSize, setGroupSize] = useState(2)
  const [leaderboard, setLeaderboard] = useState(null)
  const [error, setError] = useState(null)

  const PLAYABLE_FORMATS = ['stroke_individual', 'stroke_team', 'best_ball', 'scramble_2', 'scramble_4', 'alt_shot']
  const TEAM_BALL_FORMATS = ['scramble_2', 'scramble_4', 'alt_shot']

  useEffect(() => {
    load()
    authedFetch('/team/players').then(setRoster).catch((err) => setError(err.message))
  }, [eventId])

  useEffect(() => {
    if (!event || !PLAYABLE_FORMATS.includes(event.format_type)) return
    loadLeaderboard()
    const interval = setInterval(loadLeaderboard, 10000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event?.format_type])

  function loadLeaderboard() {
    authedFetch(`/events/${eventId}/leaderboard`).then((res) => setLeaderboard(res.leaderboard)).catch(() => {})
  }

  function load() {
    authedFetch(`/events/${eventId}`).then(setEvent).catch((err) => setError(err.message))
  }

  function togglePlayer(id) {
    setSelectedPlayerIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    )
  }

  async function generateTeams() {
    setError(null)
    try {
      await authedFetch(`/events/${eventId}/generate-teams`, {
        method: 'POST',
        body: JSON.stringify({ player_ids: selectedPlayerIds, group_size: Number(groupSize) }),
      })
      load()
    } catch (err) {
      setError(err.message)
    }
  }

  async function moveMember(memberId, fromTeamId, toTeamId) {
    if (!event) return
    const newTeams = event.teams.map((t) => {
      if (t.id === fromTeamId) return { ...t, members: t.members.filter((m) => m.player_id !== memberId) }
      if (t.id === toTeamId) {
        const moved = event.teams.find((x) => x.id === fromTeamId).members.find((m) => m.player_id === memberId)
        return { ...t, members: [...t.members, moved] }
      }
      return t
    })
    setEvent({ ...event, teams: newTeams })
    try {
      await authedFetch(`/events/${eventId}/teams`, {
        method: 'PUT',
        body: JSON.stringify({
          teams: newTeams.map((t) => ({ team_name: t.team_name, player_ids: t.members.map((m) => m.player_id) })),
        }),
      })
      load()
    } catch (err) {
      setError(err.message)
    }
  }

  if (error) return <div style={styles.page}><p style={styles.error}>{error}</p></div>
  if (!event) return <div style={styles.page}><p>Loading…</p></div>

  const isPlayable = PLAYABLE_FORMATS.includes(event.format_type)

  return (
    <div style={styles.page}>
      <button style={styles.linkBtn} onClick={onBack}>← Back to Tournaments</button>
      <h2>{event.name}</h2>
      <p style={styles.muted}>
        {FORMAT_LABEL(event.format_type)} · {event.num_holes} holes
        {event.courses && ` · ${event.courses.name}`}
        {event.event_date && ` · ${event.event_date}`}
      </p>

      {isPlayable && (
        <p style={styles.hint}>Players enter their scores from the Play tab → Tournament → {event.name}.</p>
      )}

      {isPlayable && (
        <>
          <h3 style={styles.sectionTitle}>Live Leaderboard</h3>
          {!leaderboard ? (
            <p>Loading…</p>
          ) : leaderboard.length === 0 ? (
            <p style={styles.muted}>No one has started a round for this event yet.</p>
          ) : event.format_type === 'stroke_individual' ? (
            leaderboard.map((row, i) => (
              <div key={i} style={styles.leaderboardRow}>
                <span style={styles.leaderboardRank}>{i + 1}</span>
                <span style={styles.leaderboardName}>{row.player_name}</span>
                <span style={styles.leaderboardScore}>
                  {row.score_to_par == null ? 'Not started' : formatToPar(row.score_to_par)}
                </span>
                <span style={styles.leaderboardThru}>
                  {row.score_to_par == null ? '' : row.completed ? 'F' : `thru ${row.holes_played}`}
                </span>
              </div>
            ))
          ) : TEAM_BALL_FORMATS.includes(event.format_type) ? (
            leaderboard.map((team, i) => (
              <div key={i} style={styles.teamLeaderboardCard}>
                <div style={styles.teamLeaderboardHeader}>
                  <span style={styles.leaderboardRank}>{i + 1}</span>
                  <span style={styles.leaderboardName}>{team.team_name}</span>
                  <span style={styles.leaderboardScore}>
                    {team.team_score_to_par == null ? 'Not started' : formatToPar(team.team_score_to_par)}
                  </span>
                </div>
                <div style={styles.teamMembersLine}>
                  {team.member_names.join(', ')}
                  {team.team_score_to_par != null && !team.completed && ` · thru ${team.holes_played}`}
                  {team.completed && ' · F'}
                </div>
              </div>
            ))
          ) : (
            leaderboard.map((team, i) => (
              <div key={i} style={styles.teamLeaderboardCard}>
                <div style={styles.teamLeaderboardHeader}>
                  <span style={styles.leaderboardRank}>{i + 1}</span>
                  <span style={styles.leaderboardName}>{team.team_name}</span>
                  <span style={styles.leaderboardScore}>
                    {team.team_score_to_par == null ? '—' : formatToPar(team.team_score_to_par)}
                  </span>
                </div>
                {team.members.map((m, j) => (
                  <div key={j} style={styles.teamMemberRow}>
                    <span>{m.player_name}</span>
                    <span>{m.score_to_par == null ? 'Not started' : formatToPar(m.score_to_par)}</span>
                  </div>
                ))}
              </div>
            ))
          )}
        </>
      )}

      {canManage && (
        <>
          <h3 style={styles.sectionTitle}>Who's playing?</h3>
          {!roster ? (
            <p>Loading roster…</p>
          ) : (
            <div style={styles.rosterGrid}>
              {roster.map((p) => (
                <button
                  key={p.id}
                  style={{ ...styles.rosterChip, ...(selectedPlayerIds.includes(p.id) ? styles.rosterChipActive : {}) }}
                  onClick={() => togglePlayer(p.id)}
                >
                  {p.full_name}
                </button>
              ))}
            </div>
          )}

          <label style={styles.label}>Group size</label>
          <select style={styles.input} value={groupSize} onChange={(e) => setGroupSize(e.target.value)}>
            <option value={1}>1 (individuals, no teams)</option>
            <option value={2}>2</option>
            <option value={4}>4</option>
          </select>

          <button style={styles.button} onClick={generateTeams} disabled={selectedPlayerIds.length === 0}>
            🎲 Randomize Teams
          </button>
        </>
      )}

      {event.teams.length > 0 && (
        <>
          <h3 style={styles.sectionTitle}>Teams / Pairings</h3>
          {event.teams.map((t) => (
            <div key={t.id} style={styles.teamCard}>
              <div style={styles.teamName}>{t.team_name}</div>
              {t.members.map((m) => (
                <div key={m.player_id} style={styles.memberRow}>
                  <span>{m.full_name}</span>
                  {canManage && event.teams.length > 1 && (
                    <select
                      style={styles.moveSelect}
                      value={t.id}
                      onChange={(e) => moveMember(m.player_id, t.id, e.target.value)}
                    >
                      {event.teams.map((opt) => (
                        <option key={opt.id} value={opt.id}>{opt.team_name}</option>
                      ))}
                    </select>
                  )}
                </div>
              ))}
            </div>
          ))}
        </>
      )}
    </div>
  )
}

function formatToPar(n) {
  if (n === 0) return 'E'
  return n > 0 ? `+${n}` : `${n}`
}

const styles = {
  page: {
    fontFamily: 'system-ui, sans-serif',
    padding: '1.5rem',
    maxWidth: 560,
    margin: '1.5rem auto',
    background: 'white',
    borderRadius: '0.75rem',
    boxShadow: '0 2px 10px rgba(0,0,0,0.06)',
  },
  sectionTitle: { marginTop: '1.75rem', marginBottom: '0.5rem' },
  hint: { fontSize: '0.85rem', color: colors.textMuted, marginTop: '0.5rem' },
  leaderboardRow: {
    display: 'grid',
    gridTemplateColumns: '1.5rem 1fr auto auto',
    gap: '0.6rem',
    alignItems: 'center',
    padding: '0.6rem 0.75rem',
    background: colors.grayLight,
    borderRadius: '0.5rem',
    marginBottom: '0.4rem',
  },
  leaderboardRank: { color: '#888', fontWeight: 'bold', fontSize: '0.9rem' },
  leaderboardName: { fontWeight: 600 },
  leaderboardScore: { fontWeight: 'bold', color: colors.primary },
  leaderboardThru: { fontSize: '0.8rem', color: colors.textMuted },
  teamLeaderboardCard: {
    background: colors.grayLight,
    borderRadius: '0.6rem',
    padding: '0.75rem 1rem',
    marginBottom: '0.5rem',
  },
  teamLeaderboardHeader: { display: 'grid', gridTemplateColumns: '1.5rem 1fr auto', gap: '0.6rem', alignItems: 'center' },
  teamMembersLine: {
    fontSize: '0.85rem',
    color: colors.textMuted,
    paddingLeft: '2.1rem',
    marginTop: '0.2rem',
  },
  teamMemberRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '0.85rem',
    color: colors.textMuted,
    padding: '0.25rem 0 0 2.1rem',
  },
  muted: { color: colors.textMuted },
  label: { display: 'block', marginTop: '1rem', fontWeight: 600 },
  input: { width: '100%', padding: '0.75rem', fontSize: '1.05rem', marginTop: '0.25rem', boxSizing: 'border-box' },
  button: {
    width: '100%',
    padding: '1rem',
    marginTop: '1.5rem',
    background: colors.primary,
    color: 'white',
    border: 'none',
    borderRadius: '0.5rem',
    fontSize: '1.1rem',
  },
  eventCard: {
    display: 'block',
    width: '100%',
    textAlign: 'left',
    background: colors.grayLight,
    border: 'none',
    borderRadius: '0.6rem',
    padding: '1rem',
    marginBottom: '0.6rem',
    cursor: 'pointer',
  },
  eventName: { fontWeight: 'bold', color: colors.primary },
  eventMeta: { fontSize: '0.85rem', color: colors.textMuted, marginTop: '0.2rem' },
  rosterGrid: { display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.5rem' },
  rosterChip: {
    padding: '0.5rem 0.9rem',
    fontSize: '0.9rem',
    border: '1px solid #ccc',
    borderRadius: '1rem',
    background: 'white',
  },
  rosterChipActive: {
    background: colors.primary,
    color: 'white',
    borderColor: colors.primary,
  },
  teamCard: {
    background: colors.grayLight,
    borderRadius: '0.6rem',
    padding: '1rem',
    marginBottom: '0.75rem',
  },
  teamName: { fontWeight: 'bold', color: colors.primary, marginBottom: '0.5rem' },
  memberRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0.4rem 0',
    borderBottom: '1px solid #e0e0e0',
  },
  moveSelect: { fontSize: '0.8rem', padding: '0.2rem' },
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

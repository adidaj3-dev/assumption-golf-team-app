import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient.js'
import Login from './Login.jsx'
import CourseSetup from './CourseSetup.jsx'
import RoundSummary from './RoundSummary.jsx'
import Stats from './Stats.jsx'
import CoachDashboard from './CoachDashboard.jsx'
import Practice from './Practice.jsx'
import Standings from './Standings.jsx'
import Tournaments from './Tournaments.jsx'

const API_BASE = import.meta.env.VITE_API_BASE

function strokeOptions(par) {
  if (par === 3) return range(1, 6)
  if (par === 4) return range(1, 8)
  return range(2, 9) // par 5
}

// Classifies a stroke count relative to par, used to color-code the
// strokes buttons (blue par, red birdie/eagle, gold ace, purple albatross).
function scoreTier(strokes, par) {
  if (strokes === 1) return 'ace'
  const relative = strokes - par
  if (relative === -3) return 'albatross'
  if (relative === -2) return 'eagle'
  if (relative === -1) return 'birdie'
  if (relative === 0) return 'par'
  return 'over' // bogey or worse
}

const TIER_COLORS = {
  par: '#004b87',
  birdie: '#c62828',
  eagle: '#c62828',
  albatross: '#6a1b9a',
  ace: '#d4af37',
  over: '#111111',
}

const TEAM_BALL_FORMATS = ['scramble_2', 'scramble_4', 'alt_shot', 'chapman']
const ALL_PLAYABLE_FORMATS = [
  'stroke_individual', 'stroke_team', 'best_ball', 'shamble',
  'scramble_2', 'scramble_4', 'alt_shot', 'chapman',
  'stableford', 'skins', 'match_play', 'greyhound_cup', 'wolf',
]

function FORMAT_LABEL(value) {
  const map = {
    stroke_individual: 'Stroke Play — Individual',
    stroke_team: 'Stroke Play — Team',
    best_ball: 'Best Ball',
    shamble: 'Shamble',
    scramble_2: '2-Man Scramble',
    scramble_4: '4-Man Scramble',
    alt_shot: 'Alternate Shot',
    chapman: 'Chapman (Pinehurst)',
    stableford: 'Stableford',
    skins: 'Skins',
    match_play: 'Match Play',
    greyhound_cup: 'Greyhound Cup',
    wolf: 'Wolf',
  }
  return map[value] || value
}

function range(start, end) {
  const out = []
  for (let i = start; i <= end; i++) out.push(i)
  return out
}

export default function ScoreEntry() {
  const [session, setSession] = useState(null)
  const [player, setPlayer] = useState(null)
  const [courses, setCourses] = useState([])
  const [selectedCourseId, setSelectedCourseId] = useState('')
  const [showCourseSetup, setShowCourseSetup] = useState(false)
  const [tab, setTab] = useState('play') // 'play', 'stats', 'practice', 'standings', 'team' (coach only), 'combines' (coach only)
  const [roundType, setRoundType] = useState(null) // 'team' | 'individual' | 'qualifier' — chosen on the Play screen before picking a course
  const [tournamentEvents, setTournamentEvents] = useState(null)
  const [selectedEventId, setSelectedEventId] = useState('')
  const [selectedEventTeamId, setSelectedEventTeamId] = useState('')
  const [activeTeamName, setActiveTeamName] = useState('')
  const [teamAssignmentError, setTeamAssignmentError] = useState(null)
  const [round, setRound] = useState(null)
  const [holes, setHoles] = useState([])
  const [courseName, setCourseName] = useState('')
  const [holeIndex, setHoleIndex] = useState(0)
  const [form, setForm] = useState({ strokes: null, putts: null, fairway_hit: null, gir: null })
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
        body: JSON.stringify({
          course_id: selectedCourseId,
          round_type: roundType,
          event_id: roundType === 'tournament' ? selectedEventId : null,
          event_team_id: roundType === 'tournament' && selectedEventTeamId ? selectedEventTeamId : null,
        }),
      })

      setHoles(sortedHoles)
      setCourseName(course.name)
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
          strokes: form.strokes,
          putts: form.putts,
          fairway_hit: hole.par === 3 ? null : form.fairway_hit,
          gir: form.gir,
        }),
      })
      setForm({ strokes: null, putts: null, fairway_hit: null, gir: null })

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

  function goToPreviousHole() {
    setError(null)
    setForm({ strokes: null, putts: null, fairway_hit: null, gir: null })
    setHoleIndex(Math.max(0, holeIndex - 1))
  }

  async function endRoundEarly() {
    const holesDone = holeIndex + (form.strokes ? 1 : 0)
    const confirmed = window.confirm(
      holesDone === 0
        ? 'End this round now with no holes recorded?'
        : `End this round now after ${holesDone} hole${holesDone === 1 ? '' : 's'}? This can't be undone.`
    )
    if (!confirmed) return

    setError(null)
    try {
      await apiCall(`/rounds/${round.id}/complete`, { method: 'POST' })
      const finalSummary = await apiCall(`/rounds/${round.id}/summary`)
      setSummary(finalSummary)
      setSummaryIsTurn(false)
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
        <div style={styles.topRow}>
          {holeIndex > 0 && (
            <button style={styles.smallBtn} onClick={goToPreviousHole}>← Back</button>
          )}
          <button style={styles.smallBtnDanger} onClick={endRoundEarly}>End Round</button>
        </div>

        <div style={styles.playerCourseHeader}>
          <div style={styles.playerNameHeader}>{activeTeamName || player.full_name}</div>
          <div style={styles.courseNameHeader}>{courseName}</div>
        </div>

        <div style={styles.holeHeader}>
          <div>
            <h2 style={styles.holeNumber}>Hole {hole.hole_number}</h2>
            <div style={styles.holeMeta}>
              HDCP {hole.handicap}{hole.yardage ? ` · ${hole.yardage} yds` : ''}
            </div>
          </div>
          <div style={styles.parBadge}>
            <div style={styles.parBadgeNumber}>{hole.par}</div>
            <div style={styles.parBadgeLabel}>PAR</div>
          </div>
        </div>

        <label style={styles.label}>Strokes</label>
        <ButtonGroup
          options={strokeOptions(hole.par)}
          value={form.strokes}
          onChange={(v) => setForm({ ...form, strokes: v })}
          tierFn={(v) => scoreTier(v, hole.par)}
        />

        <label style={styles.label}>Putts</label>
        <ButtonGroup
          options={[
            { value: 0, label: '0' },
            { value: 1, label: '1' },
            { value: 2, label: '2' },
            { value: 3, label: '3' },
            { value: 4, label: '4' },
            { value: 5, label: '4+' },
          ]}
          value={form.putts}
          onChange={(v) => setForm({ ...form, putts: v })}
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

  // Not mid-round: show the nav tabs
  return (
    <div>
      <div style={styles.tabBar}>
        <button
          style={{ ...styles.tabBtn, ...(tab === 'play' ? styles.tabBtnActive : {}) }}
          onClick={() => { setTab('play'); setRoundType(null); setSelectedEventId(''); setSelectedEventTeamId(''); setActiveTeamName(''); setTeamAssignmentError(null) }}
        >
          Play
        </button>
        {player.role === 'coach' && (
          <button
            style={{ ...styles.tabBtn, ...(tab === 'stats' ? styles.tabBtnActive : {}) }}
            onClick={() => setTab('stats')}
          >
            Stats
          </button>
        )}
        <button
          style={{ ...styles.tabBtn, ...(tab === 'practice' ? styles.tabBtnActive : {}) }}
          onClick={() => setTab('practice')}
        >
          Practice
        </button>
        {player.role !== 'coach' && (
          <button
            style={{ ...styles.tabBtn, ...(tab === 'stats' ? styles.tabBtnActive : {}) }}
            onClick={() => setTab('stats')}
          >
            Stats
          </button>
        )}
        <button
          style={{ ...styles.tabBtn, ...(tab === 'standings' ? styles.tabBtnActive : {}) }}
          onClick={() => setTab('standings')}
        >
          {player.role === 'coach' ? 'Standings' : 'Individual Standings'}
        </button>
        <button
          style={{ ...styles.tabBtn, ...(tab === 'tournaments' ? styles.tabBtnActive : {}) }}
          onClick={() => setTab('tournaments')}
        >
          Tournaments
        </button>
        {player.role === 'coach' && (
          <button
            style={{ ...styles.tabBtn, ...(tab === 'team' ? styles.tabBtnActive : {}) }}
            onClick={() => setTab('team')}
          >
            Team
          </button>
        )}
      </div>

      {tab === 'stats' && <Stats player={player} />}
      {tab === 'practice' && <Practice player={player} />}
      {tab === 'standings' && <Standings />}
      {tab === 'tournaments' && <Tournaments player={player} />}
      {tab === 'team' && player.role === 'coach' && <CoachDashboard />}
      {tab === 'play' && !roundType && (
        <div style={styles.page}>
          <h2>Play</h2>
          <p style={styles.subtitleText}>What kind of round is this?</p>

          <button style={styles.roundTypeBtn} onClick={() => setRoundType('team')}>
            <div style={styles.roundTypeName}>Team Round</div>
            <div style={styles.roundTypeDesc}>Counts toward season standings</div>
          </button>
          <button style={styles.roundTypeBtn} onClick={() => setRoundType('individual')}>
            <div style={styles.roundTypeName}>Individual Round</div>
            <div style={styles.roundTypeDesc}>Practice on your own — stats only, not scored toward standings</div>
          </button>
          <button style={styles.roundTypeBtn} onClick={() => setRoundType('qualifier')}>
            <div style={styles.roundTypeName}>Qualifier</div>
            <div style={styles.roundTypeDesc}>Playing for a tournament spot</div>
          </button>
          <button
            style={styles.roundTypeBtn}
            onClick={() => {
              setRoundType('tournament')
              apiCall('/events').then(setTournamentEvents).catch((err) => setError(err.message))
            }}
          >
            <div style={styles.roundTypeName}>Tournament</div>
            <div style={styles.roundTypeDesc}>Play a round tied to a tournament event</div>
          </button>

          {(player.role === 'coach' || player.role === 'captain') && (
            <button style={styles.linkBtn} onClick={() => setShowCourseSetup(true)}>
              + Add a new course
            </button>
          )}
        </div>
      )}

      {tab === 'play' && roundType === 'tournament' && (
        <div style={styles.page}>
          <button
            style={styles.linkBtn}
            onClick={() => {
              setRoundType(null)
              setSelectedEventId('')
              setSelectedEventTeamId('')
              setActiveTeamName('')
              setTeamAssignmentError(null)
            }}
          >
            ← Back
          </button>
          <h2>Tournament</h2>

          {!tournamentEvents ? (
            <p>Loading events…</p>
          ) : (
            (() => {
              const playable = tournamentEvents.filter((e) =>
                ALL_PLAYABLE_FORMATS.includes(e.format_type)
              )
              if (playable.length === 0) {
                return <p>No tournament events set up for play yet — other formats are coming in a later update.</p>
              }
              return playable.map((ev) => (
                <button
                  key={ev.id}
                  style={styles.roundTypeBtn}
                  onClick={async () => {
                    setSelectedEventId(ev.id)
                    setSelectedEventTeamId('')
                    setTeamAssignmentError(null)
                    if (ev.course_id) setSelectedCourseId(ev.course_id)

                    if (TEAM_BALL_FORMATS.includes(ev.format_type)) {
                      try {
                        const detail = await apiCall(`/events/${ev.id}`)
                        const myTeam = detail.teams.find((t) =>
                          t.members.some((m) => m.player_id === player.id)
                        )
                        if (myTeam) {
                          setSelectedEventTeamId(myTeam.id)
                          setActiveTeamName(myTeam.team_name)
                        } else {
                          setTeamAssignmentError("You're not assigned to a team for this event yet — ask your coach or captain.")
                        }
                      } catch (err) {
                        setError(err.message)
                      }
                    }
                  }}
                >
                  <div style={styles.roundTypeName}>{ev.name}</div>
                  <div style={styles.roundTypeDesc}>
                    {FORMAT_LABEL(ev.format_type)}
                    {ev.courses && ` · ${ev.courses.name}`}
                  </div>
                </button>
              ))
            })()
          )}

          {selectedEventId && teamAssignmentError && (
            <p style={styles.error}>{teamAssignmentError}</p>
          )}

          {selectedEventId && !teamAssignmentError && (
            <>
              {!courses.find((c) => c.id === selectedCourseId) && courses.length > 0 && (
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
                </>
              )}

              {error && <p style={styles.error}>{error}</p>}

              <button style={styles.button} onClick={startRound} disabled={!selectedCourseId}>
                Start Round
              </button>
            </>
          )}
        </div>
      )}

      {tab === 'play' && roundType && roundType !== 'tournament' && (
        <div style={styles.page}>
          <button style={styles.linkBtn} onClick={() => setRoundType(null)}>← Back</button>
          <h2>
            {roundType === 'team' ? 'Team Round' : roundType === 'individual' ? 'Individual Round' : 'Qualifier'}
          </h2>

          {courses.length === 0 ? (
            <p>No courses yet. {player.role === 'coach' || player.role === 'captain' ? 'Add one from the previous screen.' : 'Ask your coach to add one.'}</p>
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

const TIER_ICONS = {
  ace: '★ ',
  albatross: '◆ ',
}

const GLOW_TIERS = new Set(['ace', 'albatross']) // extra size + glow to stand out further

function ButtonGroup({ options, value, onChange, tierFn }) {
  return (
    <div style={styles.buttonGroup}>
      {options.map((opt) => {
        const optValue = typeof opt === 'object' ? opt.value : opt
        const optLabel = typeof opt === 'object' ? opt.label : opt
        const tier = tierFn ? tierFn(optValue) : null
        const isSelected = value === optValue
        const tierColor = tier ? TIER_COLORS[tier] : null

        // Unselected tiered button: solid color, white text.
        // Selected tiered button: flips to white background, colored text —
        // makes the chosen value obvious at a glance.
        const tierColorStyle = tier
          ? {
              background: isSelected ? 'white' : tierColor,
              color: isSelected ? tierColor : 'white',
              borderColor: tierColor,
              borderWidth: '2px',
            }
          : {}

        return (
          <button
            key={optValue}
            type="button"
            style={{
              ...styles.groupBtn,
              ...(tier ? styles.groupBtnEmph : {}),
              ...(tier && GLOW_TIERS.has(tier) ? styles.groupBtnGlow : {}),
              ...tierColorStyle,
              ...(isSelected && !tier ? styles.groupBtnActive : {}),
            }}
            onClick={() => onChange(optValue)}
          >
            {TIER_ICONS[tier] || ''}{optLabel}
          </button>
        )
      })}
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
  playerCourseHeader: { marginBottom: '0.75rem' },
  playerNameHeader: { fontWeight: 'bold', color: '#111', fontSize: '1.1rem' },
  courseNameHeader: { color: '#004b87', fontSize: '0.9rem', marginTop: '0.1rem' },
  holeHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '0.5rem',
  },
  holeNumber: { margin: 0 },
  holeMeta: { color: '#5a6672', fontSize: '0.9rem', marginTop: '0.15rem' },
  parBadge: {
    background: '#004b87',
    color: 'white',
    borderRadius: '0.6rem',
    padding: '0.5rem 1.1rem',
    textAlign: 'center',
    minWidth: '3.5rem',
  },
  parBadgeNumber: { fontSize: '1.8rem', fontWeight: 'bold', lineHeight: 1 },
  parBadgeLabel: { fontSize: '0.65rem', letterSpacing: '0.08em', marginTop: '0.1rem' },
  page: {
    fontFamily: 'system-ui, sans-serif',
    padding: '1.5rem',
    maxWidth: 420,
    margin: '1.5rem auto',
    background: 'white',
    borderRadius: '0.75rem',
    boxShadow: '0 2px 10px rgba(0,0,0,0.06)',
  },
  label: { display: 'block', marginTop: '1rem', fontWeight: 600 },
  input: { width: '100%', padding: '0.75rem', fontSize: '1.25rem', marginTop: '0.25rem' },
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
  buttonGroup: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.5rem',
    marginTop: '0.5rem',
  },
  groupBtn: {
    minWidth: '3rem',
    padding: '0.75rem',
    fontSize: '1.1rem',
    border: '1px solid #ccc',
    borderRadius: '0.5rem',
    background: 'white',
  },
  groupBtnEmph: {
    minWidth: '4rem',
    padding: '1rem',
    fontSize: '1.4rem',
    fontWeight: 'bold',
  },
  groupBtnActive: {
    background: '#004b87',
    color: 'white',
    borderColor: '#004b87',
  },
  // Extra size + glow for ace/albatross on top of the standard tier coloring
  // computed inline in ButtonGroup.
  groupBtnGlow: {
    minWidth: '4.5rem',
    padding: '1.1rem',
    fontSize: '1.6rem',
    boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
  },
  toggleRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem' },
  toggleBtn: { padding: '0.5rem 1rem', marginLeft: '0.5rem', border: '1px solid #ccc', borderRadius: '0.4rem' },
  toggleActive: { background: '#004b87', color: 'white', borderColor: '#004b87' },
  topRow: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '1rem',
  },
  smallBtn: {
    padding: '0.5rem 0.9rem',
    fontSize: '0.9rem',
    border: '1px solid #ccc',
    borderRadius: '0.4rem',
    background: 'white',
    color: '#333',
  },
  smallBtnDanger: {
    padding: '0.5rem 0.9rem',
    fontSize: '0.9rem',
    border: '1px solid #b00020',
    borderRadius: '0.4rem',
    background: 'white',
    color: '#b00020',
    marginLeft: 'auto',
  },
  subtitleText: { color: '#666', marginTop: '-0.5rem', marginBottom: '1.5rem' },
  roundTypeBtn: {
    display: 'block',
    width: '100%',
    textAlign: 'left',
    background: '#eef1f5',
    border: 'none',
    borderRadius: '0.6rem',
    padding: '1.1rem',
    marginBottom: '0.75rem',
    cursor: 'pointer',
  },
  roundTypeName: { fontWeight: 'bold', color: '#004b87', fontSize: '1.05rem' },
  roundTypeDesc: { fontSize: '0.85rem', color: '#666', marginTop: '0.2rem' },
  linkBtn: {
    display: 'block',
    width: '100%',
    padding: '0.75rem',
    marginBottom: '1rem',
    background: 'none',
    border: '1px dashed #004b87',
    color: '#004b87',
    borderRadius: '0.4rem',
    fontSize: '0.95rem',
  },
  error: { color: '#b00020', marginTop: '0.75rem' },
  tabBar: {
    display: 'flex',
    flexWrap: 'wrap',
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
    borderBottom: '3px solid #004b87',
    color: '#004b87',
    fontWeight: 600,
  },
}

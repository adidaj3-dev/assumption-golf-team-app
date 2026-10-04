import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient.js'
import Login from './Login.jsx'
import CourseSetup from './CourseSetup.jsx'
import QualifierGroups from './QualifierGroups.jsx'
import Lineup from './Lineup.jsx'
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
  const [resumableRound, setResumableRound] = useState(null) // an incomplete round found on load, offered for resume
  const [resumeDismissed, setResumeDismissed] = useState(false)
  const [forPlayer, setForPlayer] = useState(null) // coach-only: entering a round on behalf of this player
  const [pickingForPlayer, setPickingForPlayer] = useState(false)
  const [teamRoster, setTeamRoster] = useState(null)
  const [qualifierGroup, setQualifierGroup] = useState(null) // { group_number, tee_time, members } for the current player, once Qualifier is picked
  const [qualifierOwnChosen, setQualifierOwnChosen] = useState(false) // true once they pick "Enter My Own Round" instead of marking a teammate
  const [showQualifierGroups, setShowQualifierGroups] = useState(false) // coach-only: the group setup screen
  const [showLineup, setShowLineup] = useState(false) // coach-only: the lineup setup/scoring screen
  const [quickEntry, setQuickEntry] = useState(false) // coach-for-player only: skip hole-by-hole, enter one set of totals
  const [quickForm, setQuickForm] = useState({
    courseName: '', coursePar: '', strokes: '', putts: '',
    fairwaysHit: '', fairwaysTotal: '', girHit: '', girTotal: '', isQualifying: false,
  })
  const [quickSaving, setQuickSaving] = useState(false)
  const [quickSaved, setQuickSaved] = useState(false)

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
          // "Cannot coerce..." means this login has no matching row in the
          // players table at all — almost always a second/duplicate account,
          // not a real bug. Sign Out (in the header) lets them switch accounts
          // instead of being stuck on a loading screen with no way out.
          setError(
            "This login doesn't have a player profile set up. If you have another account you normally use, use Sign Out above and sign in with that one instead."
          )
          return
        }
        setPlayer(data)
      })

    apiCall('/courses')
      .then(setCourses)
      .catch((err) => setError(err.message))
  }, [session])

  // Once we know who's logged in, check whether they have a round they
  // started and never finished (closed the app instead of hitting End
  // Round) — offer to pick it back up instead of silently losing track.
  useEffect(() => {
    if (!player) return
    apiCall(`/players/${player.id}/rounds`)
      .then((rounds) => {
        const mine = rounds.find((r) => !r.completed)
        if (mine) setResumableRound(mine)
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player])

  async function resumeRound() {
    if (!resumableRound) return
    setError(null)
    try {
      const course = await apiCall(`/courses/${resumableRound.course_id}`)
      const sortedHoles = course.holes.sort((a, b) => a.hole_number - b.hole_number)
      const scorecard = await apiCall(`/rounds/${resumableRound.id}/scorecard`)
      // This round list is always MY OWN rounds (player_id === me), so if
      // marked_by is set to someone else, I'm the one being marked — resume
      // at the first hole missing MY stats (putts), not strokes, since
      // strokes aren't mine to enter here.
      const amBeingMarked = resumableRound.marked_by && resumableRound.marked_by !== player.id
      let resumeIndex = sortedHoles.length - 1
      for (let i = 0; i < scorecard.holes.length; i++) {
        const notYetDone = amBeingMarked ? scorecard.holes[i].putts === null : scorecard.holes[i].strokes === null
        if (notYetDone) {
          resumeIndex = i
          break
        }
      }
      setHoles(sortedHoles)
      setCourseName(course.name)
      setHoleIndex(resumeIndex)
      setRoundType(resumableRound.round_type)
      setSelectedCourseId(resumableRound.course_id)
      if (resumableRound.event_id) setSelectedEventId(resumableRound.event_id)
      if (resumableRound.event_team_id) {
        setSelectedEventTeamId(resumableRound.event_team_id)
        try {
          const eventDetail = await apiCall(`/events/${resumableRound.event_id}`)
          const myTeam = eventDetail.teams.find((t) => t.id === resumableRound.event_team_id)
          if (myTeam) setActiveTeamName(myTeam.team_name)
        } catch {
          // non-fatal — the round still resumes fine without the team name label
        }
      }
      setRound(resumableRound)
      setResumableRound(null)
    } catch (err) {
      setError(err.message)
    }
  }

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
          for_player_id: forPlayer ? forPlayer.id : null,
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

  async function submitQuickRound() {
    setError(null)
    setQuickSaving(true)
    try {
      await apiCall('/rounds/quick', {
        method: 'POST',
        body: JSON.stringify({
          for_player_id: forPlayer.id,
          round_type: roundType,
          course_name: quickForm.courseName,
          course_par: Number(quickForm.coursePar),
          strokes: Number(quickForm.strokes),
          putts: quickForm.putts === '' ? null : Number(quickForm.putts),
          fairways_hit: quickForm.fairwaysHit === '' ? null : Number(quickForm.fairwaysHit),
          fairways_total: quickForm.fairwaysTotal === '' ? null : Number(quickForm.fairwaysTotal),
          gir_hit: quickForm.girHit === '' ? null : Number(quickForm.girHit),
          gir_total: quickForm.girTotal === '' ? null : Number(quickForm.girTotal),
          is_qualifying: quickForm.isQualifying,
        }),
      })
      setQuickSaved(true)
      setQuickForm({
        courseName: '', coursePar: '', strokes: '', putts: '',
        fairwaysHit: '', fairwaysTotal: '', girHit: '', girTotal: '', isQualifying: false,
      })
    } catch (err) {
      setError(err.message)
    } finally {
      setQuickSaving(false)
    }
  }

  async function submitHole() {
    const hole = holes[holeIndex]
    // Qualifier scorecard marking: the marker (someone else's round, which
    // they started) sends strokes only; the round's own player, when a
    // groupmate is marking them, sends only their own stats — never both,
    // so neither side's entry can clobber the other's (see submit_hole_score).
    const isMarkingSomeoneElse = round.marked_by === player.id && round.player_id !== player.id
    const isBeingMarkedByOther = round.player_id === player.id && round.marked_by && round.marked_by !== player.id
    try {
      const payload = { hole_id: hole.id }
      if (!isBeingMarkedByOther) payload.strokes = form.strokes
      if (!isMarkingSomeoneElse) {
        payload.putts = form.putts
        payload.fairway_hit = hole.par === 3 ? null : form.fairway_hit
        payload.gir = form.gir
      }
      await apiCall(`/rounds/${round.id}/holes`, { method: 'POST', body: JSON.stringify(payload) })
      setForm({ strokes: null, putts: null, fairway_hit: null, gir: null })

      const holesJustCompleted = holeIndex + 1

      if (holesJustCompleted === holes.length) {
        if (isBeingMarkedByOther) {
          // Not mine to complete — the marker's entry is what finishes the
          // official round. Just save my stats and head back.
          window.alert("Your stats are saved for this round — your marker will finish out the official score.")
          setRound(null)
          setForPlayer(null)
        } else {
          await apiCall(`/rounds/${round.id}/complete`, { method: 'POST' })
          const finalSummary = await apiCall(`/rounds/${round.id}/summary`)
          setSummary(finalSummary)
          setSummaryIsTurn(false)
        }
      } else if (holesJustCompleted === 9 && holes.length > 9 && !isBeingMarkedByOther) {
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

  function saveAndExit() {
    // Every hole already saves to the database the instant it's submitted,
    // so "saving" here is really just leaving cleanly — the round stays
    // incomplete and resumable, exactly like closing the app by accident,
    // except deliberate and without losing your place in the UI.
    setRound(null)
    setForPlayer(null)
  }

  function dismissSummary() {
    if (summaryIsTurn) {
      setSummary(null)
    } else {
      // Round fully done — reset back to the start screen
      setSummary(null)
      setRound(null)
      setForPlayer(null)
    }
  }

  if (!session) {
    return <Login />
  }

  if (!player) {
    return (
      <div style={styles.page}>
        {error ? (
          <>
            <p style={styles.error}>{error}</p>
            <button style={styles.button} onClick={() => supabase.auth.signOut()}>
              Sign Out
            </button>
          </>
        ) : (
          <p>Loading…</p>
        )}
      </div>
    )
  }

  if (summary) {
    return <RoundSummary summary={summary} isTurn={summaryIsTurn} onContinue={dismissSummary} />
  }

  if (showQualifierGroups) {
    return <QualifierGroups onBack={() => setShowQualifierGroups(false)} />
  }

  if (showLineup) {
    return <Lineup onBack={() => setShowLineup(false)} />
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
    const isMarkingSomeoneElse = round.marked_by === player.id && round.player_id !== player.id
    const isBeingMarkedByOther = round.player_id === player.id && round.marked_by && round.marked_by !== player.id
    const canSubmit = isBeingMarkedByOther ? form.putts !== null : !!form.strokes

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
          <button style={styles.smallBtn} onClick={saveAndExit}>Save &amp; Exit</button>
          {!isBeingMarkedByOther && (
            <button style={styles.smallBtnDanger} onClick={endRoundEarly}>End Round</button>
          )}
        </div>

        <div style={styles.playerCourseHeader}>
          <div style={styles.playerNameHeader}>{activeTeamName || (forPlayer ? forPlayer.full_name : player.full_name)}</div>
          <div style={styles.courseNameHeader}>{courseName}</div>
        </div>

        {isBeingMarkedByOther && (
          <p style={styles.subtitleText}>Logging your own stats — a groupmate is keeping your official score.</p>
        )}

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

        {!isBeingMarkedByOther && (
          <>
            <label style={styles.label}>Strokes</label>
            <ButtonGroup
              options={strokeOptions(hole.par)}
              value={form.strokes}
              onChange={(v) => setForm({ ...form, strokes: v })}
              tierFn={(v) => scoreTier(v, hole.par)}
            />
          </>
        )}

        {!isMarkingSomeoneElse && (
          <>
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
          </>
        )}

        {error && <p style={styles.error}>{error}</p>}

        <button style={styles.button} onClick={submitHole} disabled={!canSubmit}>
          {holeIndex + 1 < holes.length ? 'Next Hole' : isBeingMarkedByOther ? 'Save Stats' : 'Finish Round'}
        </button>
      </div>
    )
  }

  // Qualifier only: once a group's been fetched, make them choose between
  // marking a groupmate's scorecard and entering their own round before
  // showing the normal course picker.
  const qualifierNeedsChoice =
    roundType === 'qualifier' && !forPlayer && qualifierGroup && qualifierGroup.members.length > 0 && !qualifierOwnChosen

  // Not mid-round: show the nav tabs
  return (
    <div>
      <div style={styles.tabBar}>
        <button
          style={{ ...styles.tabBtn, ...(tab === 'play' ? styles.tabBtnActive : {}) }}
          onClick={() => { setTab('play'); setRoundType(null); setSelectedEventId(''); setSelectedEventTeamId(''); setActiveTeamName(''); setTeamAssignmentError(null); setQualifierGroup(null); setQualifierOwnChosen(false); setQuickEntry(false); setQuickSaved(false) }}
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
          Standings
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
      {tab === 'standings' && <Standings player={player} />}
      {tab === 'tournaments' && <Tournaments player={player} />}
      {tab === 'team' && player.role === 'coach' && <CoachDashboard />}
      {tab === 'play' && !roundType && pickingForPlayer && (
        <div style={styles.page}>
          <button style={styles.linkBtn} onClick={() => setPickingForPlayer(false)}>← Cancel</button>
          <h2>Enter a Round For…</h2>
          <p style={styles.subtitleText}>Pick who this round is actually for.</p>
          {!teamRoster ? (
            <p>Loading roster…</p>
          ) : (
            teamRoster.map((p) => (
              <button
                key={p.id}
                style={styles.roundTypeBtn}
                onClick={() => {
                  setForPlayer(p)
                  setPickingForPlayer(false)
                }}
              >
                <div style={styles.roundTypeName}>{p.full_name}</div>
              </button>
            ))
          )}
        </div>
      )}

      {tab === 'play' && !roundType && !pickingForPlayer && (
        <div style={styles.page}>
          {resumableRound && !resumeDismissed && (
            <div style={styles.resumeBanner}>
              <div style={styles.resumeBannerText}>
                <strong>Unfinished round</strong> at {resumableRound.course_name} — {resumableRound.holes_played} hole{resumableRound.holes_played === 1 ? '' : 's'} entered.
              </div>
              <div style={styles.resumeBannerButtons}>
                <button style={styles.button} onClick={resumeRound}>Resume Round</button>
                <button style={styles.linkBtn} onClick={() => setResumeDismissed(true)}>Not now</button>
              </div>
            </div>
          )}

          <h2>Play</h2>

          {forPlayer && (
            <div style={styles.loggingForBar}>
              <span>Entering for: <strong>{forPlayer.full_name}</strong></span>
              <button style={styles.changeBtn} onClick={() => setForPlayer(null)}>Change</button>
            </div>
          )}

          <p style={styles.subtitleText}>What kind of round is this?</p>

          <button style={styles.roundTypeBtn} onClick={() => setRoundType('individual')}>
            <div style={styles.roundTypeName}>Individual Round</div>
            <div style={styles.roundTypeDesc}>Practice on your own — stats only, not scored toward standings</div>
          </button>
          <button
            style={styles.roundTypeBtn}
            onClick={() => {
              setRoundType('qualifier')
              setQualifierOwnChosen(false)
              apiCall('/qualifier/my-group').then(setQualifierGroup).catch(() => setQualifierGroup(null))
            }}
          >
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

          {player.role === 'coach' && (
            <button style={styles.linkBtn} onClick={() => setShowQualifierGroups(true)}>
              ⛳ Manage Qualifier Groups
            </button>
          )}

          {player.role === 'coach' && (
            <button style={styles.linkBtn} onClick={() => setShowLineup(true)}>
              📋 Manage Lineup
            </button>
          )}

          {player.role === 'coach' && !forPlayer && (
            <button
              style={styles.linkBtn}
              onClick={() => {
                setPickingForPlayer(true)
                if (!teamRoster) apiCall('/team/players').then(setTeamRoster).catch((err) => setError(err.message))
              }}
            >
              📋 Enter a round for a player
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

      {tab === 'play' && qualifierNeedsChoice && (
        <div style={styles.page}>
          <button
            style={styles.linkBtn}
            onClick={() => { setRoundType(null); setQualifierGroup(null); setQualifierOwnChosen(false) }}
          >
            ← Back
          </button>
          <h2>Your Qualifier Group</h2>
          {qualifierGroup.tee_time && <p style={styles.subtitleText}>Tee time: {qualifierGroup.tee_time}</p>}
          <p style={styles.subtitleText}>
            Just like a real tournament, you don't keep your own score — pick a groupmate to mark
            their scorecard (you enter their strokes; they log their own putts, fairways, and GIR),
            or enter your own round if nobody's marking you.
          </p>
          <button style={styles.roundTypeBtn} onClick={() => setQualifierOwnChosen(true)}>
            <div style={styles.roundTypeName}>Enter My Own Round</div>
          </button>
          {qualifierGroup.members.filter((m) => m.id !== player.id).map((m) => (
            <button key={m.id} style={styles.roundTypeBtn} onClick={() => setForPlayer(m)}>
              <div style={styles.roundTypeName}>Mark {m.full_name}'s Scorecard</div>
            </button>
          ))}
        </div>
      )}

      {tab === 'play' && roundType && roundType !== 'tournament' && !qualifierNeedsChoice && (
        <div style={styles.page}>
          <button
            style={styles.linkBtn}
            onClick={() => {
              setRoundType(null); setQualifierGroup(null); setQualifierOwnChosen(false)
              setQuickEntry(false); setQuickSaved(false)
            }}
          >
            ← Back
          </button>
          <h2>
            {roundType === 'individual' ? 'Individual Round' : 'Qualifier'}
          </h2>
          {forPlayer && (
            <p style={styles.subtitleText}>
              {roundType === 'qualifier' && player.role !== 'coach'
                ? <>Marking <strong>{forPlayer.full_name}</strong>'s scorecard</>
                : <>Entering for <strong>{forPlayer.full_name}</strong></>}
            </p>
          )}

          {forPlayer && player.role === 'coach' && (
            <div style={styles.entryModeRow}>
              <button
                style={{ ...styles.entryModeBtn, ...(!quickEntry ? styles.entryModeBtnActive : {}) }}
                onClick={() => { setQuickEntry(false); setQuickSaved(false) }}
              >
                Hole by Hole
              </button>
              <button
                style={{ ...styles.entryModeBtn, ...(quickEntry ? styles.entryModeBtnActive : {}) }}
                onClick={() => { setQuickEntry(true); setQuickSaved(false) }}
              >
                Quick Score Entry
              </button>
            </div>
          )}

          {forPlayer && player.role === 'coach' && quickEntry ? (
            <>
              <label style={styles.label}>Course name</label>
              <input
                style={styles.input}
                value={quickForm.courseName}
                onChange={(e) => setQuickForm({ ...quickForm, courseName: e.target.value })}
                placeholder="e.g. Pleasant Valley"
              />
              <label style={styles.label}>Course par</label>
              <input
                style={styles.input}
                type="number"
                inputMode="numeric"
                value={quickForm.coursePar}
                onChange={(e) => setQuickForm({ ...quickForm, coursePar: e.target.value })}
                placeholder="e.g. 72"
              />
              <label style={styles.label}>Total score shot</label>
              <input
                style={styles.input}
                type="number"
                inputMode="numeric"
                value={quickForm.strokes}
                onChange={(e) => setQuickForm({ ...quickForm, strokes: e.target.value })}
              />
              <label style={styles.label}>Total putts</label>
              <input
                style={styles.input}
                type="number"
                inputMode="numeric"
                value={quickForm.putts}
                onChange={(e) => setQuickForm({ ...quickForm, putts: e.target.value })}
              />
              <label style={styles.label}>Fairways hit (made / total)</label>
              <div style={styles.pairRow}>
                <input
                  style={styles.pairInput}
                  type="number"
                  inputMode="numeric"
                  value={quickForm.fairwaysHit}
                  onChange={(e) => setQuickForm({ ...quickForm, fairwaysHit: e.target.value })}
                  placeholder="made"
                />
                <span>/</span>
                <input
                  style={styles.pairInput}
                  type="number"
                  inputMode="numeric"
                  value={quickForm.fairwaysTotal}
                  onChange={(e) => setQuickForm({ ...quickForm, fairwaysTotal: e.target.value })}
                  placeholder="total"
                />
              </div>
              <label style={styles.label}>Greens hit (made / total)</label>
              <div style={styles.pairRow}>
                <input
                  style={styles.pairInput}
                  type="number"
                  inputMode="numeric"
                  value={quickForm.girHit}
                  onChange={(e) => setQuickForm({ ...quickForm, girHit: e.target.value })}
                  placeholder="made"
                />
                <span>/</span>
                <input
                  style={styles.pairInput}
                  type="number"
                  inputMode="numeric"
                  value={quickForm.girTotal}
                  onChange={(e) => setQuickForm({ ...quickForm, girTotal: e.target.value })}
                  placeholder="total"
                />
              </div>
              <ToggleRow
                label="Count toward qualifying average"
                value={quickForm.isQualifying}
                onChange={(v) => setQuickForm({ ...quickForm, isQualifying: v })}
              />

              {error && <p style={styles.error}>{error}</p>}
              {quickSaved && <p style={styles.successText}>Round saved.</p>}

              <button
                style={styles.button}
                onClick={submitQuickRound}
                disabled={quickSaving || !quickForm.courseName || !quickForm.coursePar || !quickForm.strokes}
              >
                {quickSaving ? 'Saving…' : 'Save Round'}
              </button>
            </>
          ) : courses.length === 0 ? (
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
    flexWrap: 'wrap',
    gap: '0.5rem',
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
    background: '#004b87',
    border: 'none',
    borderRadius: '0.6rem',
    padding: '1.1rem',
    marginBottom: '0.75rem',
    cursor: 'pointer',
  },
  roundTypeName: { fontWeight: 'bold', color: 'white', fontSize: '1.05rem' },
  roundTypeDesc: { fontSize: '0.85rem', color: '#cfe0ef', marginTop: '0.2rem' },
  resumeBanner: {
    background: '#fff8e1',
    border: '2px solid #d4af37',
    borderRadius: '0.6rem',
    padding: '1rem',
    marginBottom: '1.5rem',
  },
  resumeBannerText: { fontSize: '0.9rem', color: '#333' },
  resumeBannerButtons: { display: 'flex', gap: '1rem', alignItems: 'center', marginTop: '0.75rem' },
  loggingForBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    background: '#eef1f5',
    borderRadius: '0.5rem',
    padding: '0.6rem 0.9rem',
    marginBottom: '1rem',
    fontSize: '0.85rem',
  },
  changeBtn: {
    background: 'none',
    border: 'none',
    color: '#004b87',
    textDecoration: 'underline',
    fontSize: '0.85rem',
    cursor: 'pointer',
    padding: 0,
  },
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
  successText: { color: '#2e7d32', marginTop: '0.75rem', fontWeight: 600 },
  entryModeRow: { display: 'flex', gap: '0.5rem', marginTop: '1rem' },
  entryModeBtn: {
    flex: 1,
    padding: '0.6rem',
    fontSize: '0.9rem',
    border: '1px solid #004b87',
    borderRadius: '0.4rem',
    background: 'white',
    color: '#004b87',
  },
  entryModeBtnActive: { background: '#004b87', color: 'white' },
  pairRow: { display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' },
  pairInput: { flex: 1, padding: '0.6rem', fontSize: '1rem', boxSizing: 'border-box' },
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

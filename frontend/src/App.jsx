import { Routes, Route } from 'react-router-dom'
import ScoreEntry from './pages/ScoreEntry.jsx'
import Leaderboard from './pages/Leaderboard.jsx'
import Header from './components/Header.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { colors, fonts, HERO_TEE_URL, HERO_PUTTING_URL } from './theme.js'

export default function App() {
  return (
    <div style={{ fontFamily: fonts.body, minHeight: '100vh', position: 'relative' }}>
      {/* Fixed-position (not background-attachment: fixed — unreliable on iOS
          Safari) backdrop: solid navy, with two landscape-cropped photos
          floating in full color — one upper-left, one lower-right — rather
          than filling the whole screen, so they read as accents in the
          dead space around each page's centered white card. */}
      <div style={styles.backdrop}>
        <div style={{ ...styles.backdropPhoto, ...styles.backdropPhotoLeft, backgroundImage: `url(${HERO_TEE_URL})` }} />
        <div style={{ ...styles.backdropPhoto, ...styles.backdropPhotoRight, backgroundImage: `url(${HERO_PUTTING_URL})` }} />
      </div>

      <div style={{ position: 'relative' }}>
        <Header />
        <ErrorBoundary>
          <Routes>
            {/* Players use this, installed to their home screen */}
            <Route path="/" element={<ScoreEntry />} />

            {/* Public, no-login link you send out per tournament, e.g. /t/fall-invite-2026 */}
            <Route path="/t/:slug" element={<Leaderboard />} />
          </Routes>
        </ErrorBoundary>
      </div>
    </div>
  )
}

const styles = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    zIndex: -1,
    background: colors.primaryDark,
    overflow: 'hidden',
  },
  // Fixed landscape aspect ratio regardless of the source photo's own
  // orientation — object-fit crops each one to come out horizontal, never
  // sideways. Full color, no wash, so they stay vivid against the navy.
  backdropPhoto: {
    position: 'absolute',
    width: '46vw',
    maxWidth: 340,
    aspectRatio: '16 / 10',
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
    borderRadius: '0.75rem',
    boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
  },
  // Staggered: one sits higher on the left, the other lower on the right.
  backdropPhotoLeft: {
    left: '3vw',
    top: '6vh',
  },
  backdropPhotoRight: {
    right: '3vw',
    top: '62vh',
  },
}

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
          Safari) backdrop: solid navy, with two larger landscape-cropped
          photos staggered (one upper-left, one lower-right) and only a
          light navy tint over each so they stay readable as photos instead
          of washing out, filling most of the dead space around each
          page's centered white card. */}
      <div style={styles.backdrop}>
        <div style={{ ...styles.backdropPhoto, ...styles.backdropPhotoLeft, backgroundImage: `linear-gradient(rgba(0,50,92,0.22), rgba(0,50,92,0.22)), url(${HERO_TEE_URL})` }} />
        <div style={{ ...styles.backdropPhoto, ...styles.backdropPhotoRight, backgroundImage: `linear-gradient(rgba(0,50,92,0.22), rgba(0,50,92,0.22)), url(${HERO_PUTTING_URL})` }} />
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
  // Fixed landscape aspect ratio — the source photos are portrait (shot
  // vertically), so cropping to a wide box via background-size: cover is
  // what keeps them horizontal, not sideways. A faint navy tint (via the
  // gradient layered into backgroundImage below) keeps them cohesive with
  // the navy page without washing out the color.
  backdropPhoto: {
    position: 'absolute',
    width: '72vw',
    maxWidth: 480,
    aspectRatio: '16 / 11',
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
    borderRadius: '0.75rem',
    boxShadow: '0 8px 28px rgba(0,0,0,0.4)',
  },
  // Staggered: one sits higher on the left, the other lower on the right.
  backdropPhotoLeft: {
    left: '-4vw',
    top: '2vh',
  },
  backdropPhotoRight: {
    right: '-4vw',
    top: '58vh',
  },
}

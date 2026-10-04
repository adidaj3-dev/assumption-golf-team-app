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
          Safari) photo backdrop filling the dead space around every page's
          centered white card. Two hero shots, split left/right, under a
          navy wash so nothing on top of it loses contrast. */}
      <div style={styles.backdrop}>
        <div style={{ ...styles.backdropHalf, backgroundImage: `url(${HERO_TEE_URL})` }} />
        <div style={{ ...styles.backdropHalf, backgroundImage: `url(${HERO_PUTTING_URL})` }} />
        <div style={styles.backdropWash} />
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
    display: 'flex',
    background: colors.primaryDark,
  },
  backdropHalf: {
    flex: 1,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
  },
  backdropWash: {
    position: 'absolute',
    inset: 0,
    background: `linear-gradient(180deg, rgba(0,50,92,0.88), rgba(0,50,92,0.93))`,
  },
}

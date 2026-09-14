import { Routes, Route } from 'react-router-dom'
import ScoreEntry from './pages/ScoreEntry.jsx'
import Leaderboard from './pages/Leaderboard.jsx'
import Header from './components/Header.jsx'
import { colors, fonts } from './theme.js'

export default function App() {
  return (
    <div style={{ fontFamily: fonts.body, background: colors.grayLight, minHeight: '100vh' }}>
      <Header />
      <Routes>
        {/* Players use this, installed to their home screen */}
        <Route path="/" element={<ScoreEntry />} />

        {/* Public, no-login link you send out per tournament, e.g. /t/fall-invite-2026 */}
        <Route path="/t/:slug" element={<Leaderboard />} />
      </Routes>
    </div>
  )
}

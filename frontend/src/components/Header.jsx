import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient.js'
import { colors, fonts, LOGO_URL, NE10_URL } from '../theme.js'

// Header tracks its own session (instead of taking it as a prop) so the
// Sign Out button is always available on every screen — including a
// broken/stuck loading screen elsewhere in the app, which is exactly the
// situation a signed-in-but-can't-proceed player needs a way out of.
export default function Header() {
  const [session, setSession] = useState(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: listener } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => listener.subscription.unsubscribe()
  }, [])

  return (
    <div style={styles.bar}>
      <div style={styles.inner}>
        <div style={styles.left}>
          <img src={LOGO_URL} alt="Assumption University" style={styles.logoImg} />
          <div style={styles.divider} />
          <div style={styles.titleBlock}>
            <div style={styles.title}>GOLF</div>
            <div style={styles.subtitle}>GREYHOUNDS ATHLETICS</div>
          </div>
        </div>
        <div style={styles.right}>
          <img src={NE10_URL} alt="Northeast-10 Conference" style={styles.ne10Img} />
          {session && (
            <button style={styles.signOutBtn} onClick={() => supabase.auth.signOut()}>
              Sign Out
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

const styles = {
  bar: {
    background: colors.white,
    borderBottom: `4px solid ${colors.primary}`,
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  },
  inner: {
    maxWidth: 600,
    margin: '0 auto',
    padding: '0.7rem 1.25rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.75rem',
  },
  left: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    minWidth: 0,
  },
  logoImg: {
    height: 34,
    objectFit: 'contain',
    flexShrink: 0,
  },
  divider: {
    width: 1,
    height: 28,
    background: colors.gray,
    flexShrink: 0,
  },
  titleBlock: { lineHeight: 1.1, minWidth: 0 },
  title: {
    color: colors.primary,
    fontFamily: fonts.heading,
    fontWeight: 'bold',
    fontSize: '1.05rem',
    letterSpacing: '0.06em',
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: '0.62rem',
    letterSpacing: '0.1em',
    marginTop: '0.1rem',
  },
  right: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.6rem',
    flexShrink: 0,
  },
  ne10Img: {
    height: 24,
    objectFit: 'contain',
    flexShrink: 0,
  },
  signOutBtn: {
    background: 'none',
    border: `1px solid ${colors.gray}`,
    borderRadius: '0.4rem',
    color: colors.textMuted,
    fontSize: '0.68rem',
    fontWeight: 600,
    letterSpacing: '0.03em',
    padding: '0.3rem 0.5rem',
    whiteSpace: 'nowrap',
  },
}

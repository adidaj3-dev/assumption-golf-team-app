import { colors, fonts, LOGO_URL } from '../theme.js'

export default function Header() {
  return (
    <div style={styles.bar}>
      <div style={styles.inner}>
        {LOGO_URL ? (
          <img src={LOGO_URL} alt="Assumption Greyhounds" style={styles.logoImg} />
        ) : (
          <div style={styles.badge}>AU</div>
        )}
        <div>
          <div style={styles.title}>ASSUMPTION GOLF</div>
          <div style={styles.subtitle}>GREYHOUNDS ATHLETICS</div>
        </div>
      </div>
    </div>
  )
}

const styles = {
  bar: {
    background: colors.primary,
    borderBottom: `3px solid ${colors.gray}`,
  },
  inner: {
    maxWidth: 600,
    margin: '0 auto',
    padding: '0.9rem 1.5rem',
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
  },
  badge: {
    width: 42,
    height: 42,
    borderRadius: '50%',
    background: colors.gray,
    color: colors.primaryDark,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 'bold',
    fontFamily: fonts.heading,
    fontSize: '1.1rem',
    flexShrink: 0,
  },
  logoImg: {
    width: 42,
    height: 42,
    objectFit: 'contain',
    flexShrink: 0,
  },
  title: {
    color: colors.white,
    fontFamily: fonts.heading,
    fontWeight: 'bold',
    fontSize: '1.15rem',
    letterSpacing: '0.04em',
    lineHeight: 1.1,
  },
  subtitle: {
    color: colors.gray,
    fontSize: '0.7rem',
    letterSpacing: '0.12em',
    marginTop: '0.15rem',
  },
}

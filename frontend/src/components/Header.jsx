import { colors, fonts, LOGO_URL } from '../theme.js'

// Original monogram — not a reproduction of Assumption's official trademarked
// logo. Swap LOGO_URL in theme.js to the real file (from the Office of
// Athletic Communications download page) whenever you have it, and this
// falls away automatically.
function Monogram() {
  return (
    <svg width="42" height="42" viewBox="0 0 100 100" style={{ flexShrink: 0 }}>
      <path
        d="M50 4 L92 20 V50 C92 74 74 90 50 97 C26 90 8 74 8 50 V20 Z"
        fill={colors.gray}
        stroke={colors.white}
        strokeWidth="2"
      />
      <path
        d="M50 12 L85 26 V50 C85 70 70 83 50 89 C30 83 15 70 15 50 V26 Z"
        fill={colors.primary}
      />
      <text
        x="50"
        y="68"
        textAnchor="middle"
        fontFamily="Georgia, 'Times New Roman', serif"
        fontWeight="bold"
        fontSize="52"
        fill={colors.white}
      >
        A
      </text>
    </svg>
  )
}

export default function Header() {
  return (
    <div style={styles.bar}>
      <div style={styles.inner}>
        {LOGO_URL ? (
          <img src={LOGO_URL} alt="Assumption Greyhounds" style={styles.logoImg} />
        ) : (
          <Monogram />
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

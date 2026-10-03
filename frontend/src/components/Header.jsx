import { colors, fonts, LOGO_URL, NE10_URL } from '../theme.js'

export default function Header() {
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
        <img src={NE10_URL} alt="Northeast-10 Conference" style={styles.ne10Img} />
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
  ne10Img: {
    height: 24,
    objectFit: 'contain',
    flexShrink: 0,
  },
}

export default function RoundSummary({ summary, isTurn, onContinue }) {
  return (
    <div style={styles.page}>
      <h2>{isTurn ? 'Turn — Through 9' : 'Round Complete'}</h2>

      <div style={styles.grid}>
        <StatCard label="Score" value={formatToPar(summary.score_to_par)} />
        <StatCard label="Strokes" value={summary.total_strokes} />
        <StatCard label="Putts" value={summary.putts} />
        <StatCard label="GIR" value={`${summary.gir_count}/${summary.holes_played}`} />
        {summary.fairway_count !== null && (
          <StatCard label="Fairways" value={`${summary.fairway_count} (${summary.fairway_pct}%)`} />
        )}
      </div>

      <button style={styles.button} onClick={onContinue}>
        {isTurn ? 'Continue to Back 9' : 'Done'}
      </button>
    </div>
  )
}

function StatCard({ label, value }) {
  return (
    <div style={styles.card}>
      <div style={styles.cardValue}>{value}</div>
      <div style={styles.cardLabel}>{label}</div>
    </div>
  )
}

function formatToPar(n) {
  if (n === 0) return 'E'
  return n > 0 ? `+${n}` : `${n}`
}

const styles = {
  page: {
    fontFamily: 'system-ui, sans-serif',
    padding: '1.5rem',
    maxWidth: 480,
    margin: '1.5rem auto',
    background: 'white',
    borderRadius: '0.75rem',
    boxShadow: '0 2px 10px rgba(0,0,0,0.06)',
  },
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1.5rem' },
  card: { background: '#eef1f5', borderRadius: '0.75rem', padding: '1.25rem', textAlign: 'center' },
  cardValue: { fontSize: '1.6rem', fontWeight: 'bold', color: '#004b87' },
  cardLabel: { fontSize: '0.85rem', color: '#666', marginTop: '0.25rem' },
  button: {
    width: '100%',
    padding: '1rem',
    marginTop: '2rem',
    background: '#004b87',
    color: 'white',
    border: 'none',
    borderRadius: '0.5rem',
    fontSize: '1.1rem',
  },
}

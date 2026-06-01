export default function FactorBadge({ factor }: { factor: string }) {
  const styles: Record<string, { bg: string; color: string }> = {
    BOTH:          { bg: '#e8f1fb', color: '#0071e3' },
    CONTENT:       { bg: '#eaf6ee', color: '#1d8348' },
    LINK_BUILDING: { bg: '#fef3e2', color: '#9a6700' },
    NONE:          { bg: '#f5f5f7', color: '#aeaeb2' },
  };

  const s = styles[factor] || styles.NONE;

  return (
    <span style={{
      display: 'inline-block',
      fontSize: 10,
      fontWeight: 600,
      padding: '2px 8px',
      borderRadius: 20,
      background: s.bg,
      color: s.color,
      whiteSpace: 'nowrap',
      letterSpacing: '0.03em',
    }}>
      {factor.replace('_', ' ')}
    </span>
  );
}
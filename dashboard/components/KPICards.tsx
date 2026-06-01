'use client';

interface KPIData {
  total_keywords: number;
  with_opportunity: number;
  total_revenue: number;
  active_revenue: number;
  top_opportunity: {
    query: string;
    revenue_final: number;
    agency_factor: string;
    avg_position: string;
  } | null;
}

function formatCLP(v: number) {
  if (v >= 1000000) return `$${(v / 1000000).toFixed(1)}M`;
  if (v >= 1000) return `$${Math.round(v / 1000)}k`;
  return `$${v}`;
}

export default function KPICards({ data }: { data: KPIData }) {
  const cards = [
    {
      label: 'Revenue potencial total',
      value: formatCLP(data.total_revenue),
      sub: 'CLP / mes en todas las keywords',
      accent: '#0071e3',
    },
    {
      label: 'Keywords analizadas',
      value: data.total_keywords.toLocaleString('es-CL'),
      sub: 'Excluyendo branded',
      accent: '#1d8348',
    },
    {
      label: 'Con oportunidad activa',
      value: data.with_opportunity.toLocaleString('es-CL'),
      sub: 'BOTH + CONTENT + LINK BUILDING',
      accent: '#9a6700',
    },
    {
      label: 'Top oportunidad',
      value: data.top_opportunity?.query || '—',
      sub: data.top_opportunity
        ? `${formatCLP(Number(data.top_opportunity.revenue_final))} CLP/mes`
        : '',
      accent: '#0071e3',
    },
  ];

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(4, 1fr)',
      gap: 12,
      marginBottom: '1.5rem',
    }}>
      {cards.map((c, i) => (
        <div key={i} style={{
          background: '#ffffff',
          border: '0.5px solid var(--border)',
          borderRadius: 16,
          padding: '1.25rem',
          borderTop: `3px solid ${c.accent}`,
        }}>
          <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 8, letterSpacing: '0.01em' }}>{c.label}</div>
          <div style={{ fontSize: 24, fontWeight: 600, color: 'var(--text)', lineHeight: 1.1, letterSpacing: '-0.02em' }}>{c.value}</div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>{c.sub}</div>
        </div>
      ))}
    </div>
  );
}
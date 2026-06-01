'use client';

import FactorBadge from './FactorBadge';

interface Opportunity {
  query: string;
  avg_position: string;
  delta_clicks: number;
  revenue_final: number;
  agency_factor: string;
  opportunity_score: string;
}

function formatCLP(v: number) {
  return '$' + Math.round(v).toLocaleString('es-CL');
}

export default function Top5List({ data }: { data: Opportunity[] }) {
  const top5 = [...data]
    .sort((a, b) => b.revenue_final - a.revenue_final)
    .slice(0, 5);

  const maxRev = top5[0]?.revenue_final || 1;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {top5.map((d, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{
            fontSize: 13,
            fontWeight: 500,
            color: 'var(--text3)',
            width: 18,
            textAlign: 'center',
            flexShrink: 0,
          }}>{i + 1}</span>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 14,
              fontWeight: 500,
              color: 'var(--text)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              marginBottom: 3,
            }}>{d.query}</div>
            <div style={{
              fontSize: 11,
              color: 'var(--text2)',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              marginBottom: 6,
            }}>
              pos {parseFloat(d.avg_position).toFixed(1)}
              <FactorBadge factor={d.agency_factor} />
              {d.delta_clicks} clics proyectados
            </div>
            <div style={{
              height: 2,
              background: '#f0f0f0',
              borderRadius: 2,
            }}>
              <div style={{
                height: 2,
                borderRadius: 2,
                background: '#0071e3',
                width: `${Math.round((d.revenue_final / maxRev) * 100)}%`,
                transition: 'width 0.6s ease',
              }} />
            </div>
          </div>

          <div style={{
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--text)',
            textAlign: 'right',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}>{formatCLP(d.revenue_final)}</div>
        </div>
      ))}
    </div>
  );
}
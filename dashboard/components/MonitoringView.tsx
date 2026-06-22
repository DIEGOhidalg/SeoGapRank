'use client';

import { useState } from 'react';
import FactorBadge from './FactorBadge';
import { useIsMobile } from '@/lib/useIsMobile';

export interface WeeklyPoint {
  week:         string;
  avg_position: number;
}

export interface MonitoredKeyword {
  id:                    number;
  query:                 string;
  page_url:              string;
  baseline_position:     number;
  baseline_date:         string;
  target_position:       number;
  agency_factor_aplicado: string;
  notas:                 string | null;
  created_at:            string;
  current_position:      number | null;
  delta:                 number | null;
  weekly_series:         WeeklyPoint[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function PosBadge({ pos }: { pos: number }) {
  const [bg, color] =
    pos <= 5  ? ['#eaf6ee', '#1d8348'] :
    pos <= 10 ? ['#fef3e2', '#9a6700'] :
                ['#fdecea', '#c0392b'];
  return (
    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: bg, color, fontWeight: 500 }}>
      {pos.toFixed(1)}
    </span>
  );
}

type DeltaStatus = 'improved' | 'worsened' | 'stable' | 'nodata';

function getDeltaStatus(delta: number | null): DeltaStatus {
  if (delta === null) return 'nodata';
  if (delta < -0.5)  return 'improved';
  if (delta > 0.5)   return 'worsened';
  return 'stable';
}

const DELTA_STYLES: Record<DeltaStatus, { bg: string; color: string; label: string }> = {
  improved: { bg: '#eaf6ee', color: '#1d8348', label: 'Mejoró' },
  worsened: { bg: '#fdecea', color: '#c0392b', label: 'Empeoró' },
  stable:   { bg: '#f5f5f7', color: '#6e6e73', label: 'Estable' },
  nodata:   { bg: '#f5f5f7', color: '#aeaeb2', label: 'Sin datos' },
};

function DeltaBadge({ delta }: { delta: number | null }) {
  const status = getDeltaStatus(delta);
  const { bg, color, label } = DELTA_STYLES[status];
  const display = delta === null ? '—'
    : delta > 0 ? `+${delta.toFixed(1)}`
    : delta === 0 ? '≈ 0'
    : delta.toFixed(1);

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
      <span style={{ fontSize: 13, fontWeight: 700, color }}>{display}</span>
      <span style={{ fontSize: 9, fontWeight: 600, padding: '1px 6px', borderRadius: 10, background: bg, color, letterSpacing: '0.03em' }}>
        {label}
      </span>
    </div>
  );
}

function Sparkline({ series }: { series: WeeklyPoint[] }) {
  if (series.length < 2) {
    return <span style={{ fontSize: 11, color: 'var(--text3)' }}>—</span>;
  }

  const W = 80, H = 28, pad = 3;
  const positions = series.map(p => p.avg_position);
  const minP  = Math.min(...positions);
  const maxP  = Math.max(...positions);
  const range = maxP - minP || 1;

  // Lower position value (better rank) → smaller y → higher on chart
  const pts = series.map((p, i) => {
    const x = pad + (i / (series.length - 1)) * (W - pad * 2);
    const y = pad + ((p.avg_position - minP) / range) * (H - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  const first = positions[0];
  const last  = positions[positions.length - 1];
  const trendColor = last < first - 0.1 ? '#1d8348'
                   : last > first + 0.1 ? '#c0392b'
                   : '#aeaeb2';

  const lastX = pad + (W - pad * 2);
  const lastY = pad + ((last - minP) / range) * (H - pad * 2);

  return (
    <svg width={W} height={H} style={{ display: 'block', overflow: 'visible' }}>
      <polyline
        points={pts}
        fill="none"
        stroke={trendColor}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={lastX.toFixed(1)} cy={lastY.toFixed(1)} r={2.5} fill={trendColor} />
    </svg>
  );
}

// ─── Desktop table row ────────────────────────────────────────────────────────

function MonitorRow({
  row, index, onDelete, tdStyle,
}: {
  row:      MonitoredKeyword;
  index:    number;
  onDelete: (id: number) => Promise<void>;
  tdStyle:  React.CSSProperties;
}) {
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!confirm(`¿Quitar "${row.query}" del monitoreo?`)) return;
    setDeleting(true);
    await onDelete(row.id);
    setDeleting(false);
  }

  const pathDisplay = row.page_url.replace(/^https?:\/\/[^/]+/, '').replace(/\/$/, '') || '/';
  const status = getDeltaStatus(row.delta);

  return (
    <tr
      onMouseEnter={e => (e.currentTarget.style.background = '#fafafa')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
      style={{ transition: 'background 0.1s', borderLeft: `3px solid ${DELTA_STYLES[status].color}` }}
    >
      <td style={{ ...tdStyle, color: 'var(--text3)', fontSize: 12 }}>{index}</td>

      <td style={{ ...tdStyle, fontWeight: 500, maxWidth: 150 }}>
        <div title={row.query} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {row.query}
        </div>
        <a href={row.page_url} target="_blank" rel="noopener noreferrer"
          style={{ fontSize: 10, color: '#0071e3', textDecoration: 'none', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {pathDisplay}
        </a>
      </td>

      <td style={tdStyle}>
        <FactorBadge factor={row.agency_factor_aplicado} />
      </td>

      <td style={{ ...tdStyle, textAlign: 'center' }}>
        <PosBadge pos={row.baseline_position} />
        <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>
          {new Date(row.baseline_date).toLocaleDateString('es-CL', { day: '2-digit', month: 'short' })}
        </div>
      </td>

      <td style={{ ...tdStyle, textAlign: 'center' }}>
        {row.current_position !== null
          ? <PosBadge pos={row.current_position} />
          : <span style={{ fontSize: 11, color: 'var(--text3)' }}>—</span>}
      </td>

      <td style={{ ...tdStyle, textAlign: 'center' }}>
        <DeltaBadge delta={row.delta} />
      </td>

      <td style={{ ...tdStyle, textAlign: 'center' }}>
        <PosBadge pos={row.target_position} />
      </td>

      <td style={tdStyle}>
        <Sparkline series={row.weekly_series} />
      </td>

      <td style={{ ...tdStyle, textAlign: 'center' }}>
        <button
          onClick={handleDelete}
          disabled={deleting}
          style={{
            fontSize: 11, padding: '3px 10px', borderRadius: 6,
            border: '0.5px solid #fdecea', background: '#fdecea',
            color: '#c0392b', cursor: 'pointer', fontWeight: 500,
            opacity: deleting ? 0.5 : 1, transition: 'all 0.15s',
          }}
        >
          {deleting ? '…' : 'Quitar'}
        </button>
      </td>
    </tr>
  );
}

// ─── Mobile card ──────────────────────────────────────────────────────────────

function MonitorCard({
  row, index, onDelete,
}: {
  row:      MonitoredKeyword;
  index:    number;
  onDelete: (id: number) => Promise<void>;
}) {
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!confirm(`¿Quitar "${row.query}" del monitoreo?`)) return;
    setDeleting(true);
    await onDelete(row.id);
    setDeleting(false);
  }

  const status = getDeltaStatus(row.delta);
  const { color: statusColor } = DELTA_STYLES[status];

  return (
    <div style={{
      background: '#ffffff',
      border: '0.5px solid var(--border)',
      borderLeft: `3px solid ${statusColor}`,
      borderRadius: 12,
      padding: '1rem',
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
            <span style={{ fontSize: 11, color: 'var(--text3)' }}>{index}</span>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {row.query}
            </span>
          </div>
          <a href={row.page_url} target="_blank" rel="noopener noreferrer"
            style={{ fontSize: 11, color: '#0071e3', textDecoration: 'none' }}>
            {row.page_url.replace(/^https?:\/\/[^/]+/, '').replace(/\/$/, '') || '/'}
          </a>
        </div>
        <FactorBadge factor={row.agency_factor_aplicado} />
      </div>

      {/* Delta destacado */}
      <div style={{
        background: DELTA_STYLES[status].bg,
        borderRadius: 8,
        padding: '8px 12px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <span style={{ fontSize: 11, color: statusColor, fontWeight: 500 }}>
          {DELTA_STYLES[status].label}
        </span>
        <DeltaBadge delta={row.delta} />
      </div>

      {/* Grid posiciones */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        {[
          { label: 'Baseline', value: <PosBadge pos={row.baseline_position} /> },
          { label: 'Actual',   value: row.current_position !== null ? <PosBadge pos={row.current_position} /> : <span style={{ color: 'var(--text3)', fontSize: 12 }}>—</span> },
          { label: 'Target',   value: <PosBadge pos={row.target_position} /> },
        ].map((m, i) => (
          <div key={i} style={{ background: '#fafafa', borderRadius: 8, padding: '6px 8px' }}>
            <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 3 }}>{m.label}</div>
            <div style={{ fontSize: 12, fontWeight: 500 }}>{m.value}</div>
          </div>
        ))}
      </div>

      {/* Sparkline */}
      {row.weekly_series.length >= 2 && (
        <div>
          <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 4 }}>Evolución semanal</div>
          <Sparkline series={row.weekly_series} />
        </div>
      )}

      {/* Footer */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 10, color: 'var(--text3)' }}>
          Desde {new Date(row.baseline_date).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })}
        </span>
        <button
          onClick={handleDelete}
          disabled={deleting}
          style={{
            fontSize: 11, padding: '4px 12px', borderRadius: 6,
            border: '0.5px solid #fdecea', background: '#fdecea',
            color: '#c0392b', cursor: 'pointer', fontWeight: 500,
            opacity: deleting ? 0.5 : 1,
          }}
        >
          {deleting ? '…' : 'Quitar'}
        </button>
      </div>
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '3rem 1rem', gap: 12,
      color: 'var(--text3)',
    }}>
      <div style={{ fontSize: 32 }}>📊</div>
      <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text2)' }}>
        No hay keywords monitoreadas
      </div>
      <div style={{ fontSize: 12, textAlign: 'center', maxWidth: 280 }}>
        Cambia el esfuerzo SEO en la vista SEO y pulsa "+ Monitor" en la fila para empezar a rastrear.
      </div>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

interface Props {
  data:     MonitoredKeyword[] | null;
  loading:  boolean;
  onDelete: (id: number) => Promise<void>;
}

export default function MonitoringView({ data, loading, onDelete }: Props) {
  const isMobile = useIsMobile();

  const thStyle: React.CSSProperties = {
    textAlign: 'left', fontSize: 11, fontWeight: 500,
    color: 'var(--text2)', padding: '8px 12px',
    borderBottom: '0.5px solid var(--border)',
    whiteSpace: 'nowrap', letterSpacing: '0.02em',
  };

  const tdStyle: React.CSSProperties = {
    padding: '10px 12px',
    borderBottom: '0.5px solid var(--border)',
    color: 'var(--text)', fontSize: 13,
    verticalAlign: 'middle',
  };

  const isEmpty = !loading && data !== null && data.length === 0;

  return (
    <div style={{
      background: '#ffffff',
      border: '0.5px solid var(--border)',
      borderRadius: 16,
      padding: isMobile ? '1rem' : '1.25rem',
      position: 'relative',
      minHeight: 120,
    }}>
      {/* Header */}
      <div style={{ marginBottom: '1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text2)', letterSpacing: '0.01em' }}>
            Keywords en monitoreo
          </div>
          {data && data.length > 0 && (
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
              {data.length} keyword{data.length !== 1 ? 's' : ''} · última actualización: hoy
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 11, color: 'var(--text3)' }}>
          <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#1d8348' }} /> Mejoró
          <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#c0392b', marginLeft: 4 }} /> Empeoró
          <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#aeaeb2', marginLeft: 4 }} /> Estable
        </div>
      </div>

      {/* Loading overlay */}
      {loading && (
        <div style={{
          position: 'absolute', inset: 0,
          background: 'rgba(255,255,255,0.8)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderRadius: 16, fontSize: 13, color: '#6e6e73',
          backdropFilter: 'blur(2px)', zIndex: 10,
        }}>
          Cargando…
        </div>
      )}

      {isEmpty && <EmptyState />}

      {/* MOBILE */}
      {!loading && !isEmpty && isMobile && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {(data ?? []).map((row, i) => (
            <MonitorCard key={row.id} row={row} index={i + 1} onDelete={onDelete} />
          ))}
        </div>
      )}

      {/* DESKTOP */}
      {!loading && !isEmpty && !isMobile && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <thead>
              <tr style={{ background: '#fafafa' }}>
                <th style={{ ...thStyle, width: 30 }}>#</th>
                <th style={{ ...thStyle, width: 180 }}>Keyword / URL</th>
                <th style={{ ...thStyle, width: 105 }}>Factor</th>
                <th style={{ ...thStyle, width: 85, textAlign: 'center' }}>Baseline</th>
                <th style={{ ...thStyle, width: 75, textAlign: 'center' }}>Actual</th>
                <th style={{ ...thStyle, width: 90, textAlign: 'center' }}>Delta</th>
                <th style={{ ...thStyle, width: 75, textAlign: 'center' }}>Target</th>
                <th style={{ ...thStyle, width: 100 }}>Evolución</th>
                <th style={{ ...thStyle, width: 75, textAlign: 'center' }}></th>
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((row, i) => (
                <MonitorRow
                  key={row.id}
                  row={row}
                  index={i + 1}
                  onDelete={onDelete}
                  tdStyle={tdStyle}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

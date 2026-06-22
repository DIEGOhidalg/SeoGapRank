'use client';

import { useState } from 'react';
import { simulate, SimulatorParams } from '@/lib/simulator';

export interface SimOpportunity {
  query:           string;
  page_url:        string;
  avg_position:    string;
  impressions:     number;
  ctr_actual:      string;
  revenue_final:   number;
  agency_factor:   string;
  conversion_rate: number;
  avg_ticket:      number;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatCLP(v: number) {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `$${Math.round(v / 1_000)}k`;
  return `$${v}`;
}

function formatCLPFull(v: number) {
  return '$' + Math.round(v).toLocaleString('es-CL');
}

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

function PosTargetBadge({ pos, baseline }: { pos: number; baseline: number }) {
  const improved = pos < baseline - 0.05;
  const [bg, color] =
    pos <= 5  ? ['#eaf6ee', '#1d8348'] :
    pos <= 10 ? ['#fef3e2', '#9a6700'] :
                ['#fdecea', '#c0392b'];
  return (
    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: bg, color, fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
      {improved && <span style={{ fontSize: 9 }}>▲</span>}
      {pos.toFixed(1)}
    </span>
  );
}

function ScoreBar({ score }: { score: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontSize: 12, fontWeight: 500, minWidth: 32, color: 'var(--text)' }}>
        {score.toFixed(1)}
      </span>
      <div style={{ flex: 1, height: 3, background: '#f0f0f0', borderRadius: 2 }}>
        <div style={{ height: 3, borderRadius: 2, background: '#0071e3', width: `${score}%` }} />
      </div>
    </div>
  );
}

const dropdownStyle: React.CSSProperties = {
  fontSize: 12,
  padding: '4px 8px',
  borderRadius: 6,
  border: '0.5px solid var(--border)',
  background: '#ffffff',
  color: 'var(--text)',
  outline: 'none',
  cursor: 'pointer',
  width: '100%',
};

const FACTOR_LABELS: Record<string, string> = {
  NONE:          'Ninguno',
  CONTENT:       'Contenido',
  LINK_BUILDING: 'Link Building',
  BOTH:          'Ambos',
};

function SaveButton({
  factor, saving, saved,
  onClick,
}: {
  factor: string; saving: boolean; saved: boolean;
  onClick: () => void;
}) {
  if (saved) {
    return (
      <span style={{ fontSize: 11, color: '#1d8348', fontWeight: 600, whiteSpace: 'nowrap' }}>
        Guardado ✓
      </span>
    );
  }
  const disabled = factor === 'NONE' || saving;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        fontSize: 11,
        padding: '4px 10px',
        borderRadius: 6,
        border: '0.5px solid',
        borderColor: disabled ? 'var(--border)' : '#0071e3',
        background:  disabled ? '#f5f5f7' : '#0071e3',
        color:       disabled ? '#aeaeb2' : '#ffffff',
        cursor:      disabled ? 'not-allowed' : 'pointer',
        fontWeight: 500,
        whiteSpace: 'nowrap',
        transition: 'all 0.15s',
      }}
    >
      {saving ? '…' : '+ Monitor'}
    </button>
  );
}

// ─── Shared simulation hook ─────────────────────────────────────────────────

function useSimulator(row: SimOpportunity, params: SimulatorParams) {
  const [factor, setFactor] = useState(row.agency_factor);
  const [saved, setSaved]   = useState(false);
  const [saving, setSaving] = useState(false);

  const avgPos            = parseFloat(row.avg_position);
  const ctrActualDecimal  = parseFloat(row.ctr_actual) / 100;

  const result = simulate(
    {
      avg_position:       avgPos,
      ctr_actual_decimal: ctrActualDecimal,
      impressions:        row.impressions,
      conversion_rate:    row.conversion_rate,
      avg_ticket:         row.avg_ticket,
    },
    factor,
    params
  );

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch('/api/monitor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query:                 row.query,
          page_url:              row.page_url,
          agency_factor_aplicado: factor,
          baseline_position:     avgPos,
          target_position:       result.posTarget,
          baseline_date:         new Date().toISOString().split('T')[0],
        }),
      });
      if (res.ok) setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  function changeFactor(f: string) {
    setFactor(f);
    setSaved(false);
  }

  return { factor, changeFactor, saved, saving, avgPos, result, handleSave };
}

// ─── Desktop: table row ──────────────────────────────────────────────────────

export function SimulatorRow({
  row, index, params, tdStyle,
}: {
  row:     SimOpportunity;
  index:   number;
  params:  SimulatorParams;
  tdStyle: React.CSSProperties;
}) {
  const { factor, changeFactor, saved, saving, avgPos, result, handleSave } =
    useSimulator(row, params);

  const pathDisplay = row.page_url
    .replace(/^https?:\/\/[^/]+/, '')
    .replace(/\/$/, '') || '/';

  return (
    <tr
      onMouseEnter={e => (e.currentTarget.style.background = '#fafafa')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
      style={{ transition: 'background 0.1s' }}
    >
      <td style={{ ...tdStyle, color: 'var(--text3)', fontSize: 12 }}>{index}</td>

      <td style={{ ...tdStyle, fontWeight: 500, maxWidth: 150 }}>
        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.query}>
          {row.query}
        </div>
      </td>

      <td style={{ ...tdStyle, maxWidth: 130 }}>
        <a
          href={row.page_url}
          target="_blank"
          rel="noopener noreferrer"
          title={row.page_url}
          style={{ fontSize: 11, color: '#0071e3', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}
        >
          {pathDisplay}
        </a>
      </td>

      <td style={tdStyle}>
        <PosBadge pos={avgPos} />
      </td>

      <td style={{ ...tdStyle, minWidth: 130 }}>
        <select value={factor} onChange={e => changeFactor(e.target.value)} style={dropdownStyle}>
          {Object.entries(FACTOR_LABELS).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
      </td>

      <td style={tdStyle}>
        {factor === 'NONE'
          ? <span style={{ color: 'var(--text3)', fontSize: 12 }}>—</span>
          : <PosTargetBadge pos={result.posTarget} baseline={avgPos} />}
      </td>

      <td style={{ ...tdStyle, fontWeight: 600 }}>
        {factor === 'NONE'
          ? <span style={{ color: 'var(--text3)', fontSize: 12 }}>—</span>
          : formatCLPFull(result.revenue)}
      </td>

      <td style={tdStyle}>
        {factor === 'NONE'
          ? <span style={{ color: 'var(--text3)', fontSize: 12 }}>0</span>
          : <ScoreBar score={result.score} />}
      </td>

      <td style={{ ...tdStyle, textAlign: 'center' }}>
        <SaveButton factor={factor} saving={saving} saved={saved} onClick={handleSave} />
      </td>
    </tr>
  );
}

// ─── Mobile: card ────────────────────────────────────────────────────────────

export function SimulatorCard({
  row, index, params,
}: {
  row:    SimOpportunity;
  index:  number;
  params: SimulatorParams;
}) {
  const { factor, changeFactor, saved, saving, avgPos, result, handleSave } =
    useSimulator(row, params);

  return (
    <div style={{
      background: '#ffffff',
      border: '0.5px solid var(--border)',
      borderRadius: 12,
      padding: '1rem',
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: 11, color: 'var(--text3)', minWidth: 18, paddingTop: 2 }}>{index}</span>
          <div style={{ minWidth: 0 }}>
            <div style={{
              fontSize: 14, fontWeight: 600, color: 'var(--text)', lineHeight: 1.3,
              overflow: 'hidden', display: '-webkit-box',
              WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
            }}>
              {row.query}
            </div>
            <a href={row.page_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: '#0071e3', textDecoration: 'none' }}>
              {row.page_url.replace(/^https?:\/\/[^/]+/, '').replace(/\/$/, '') || '/'}
            </a>
          </div>
        </div>
      </div>

      {/* Esfuerzo SEO */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 11, color: 'var(--text2)', whiteSpace: 'nowrap' }}>Esfuerzo SEO</span>
        <select value={factor} onChange={e => changeFactor(e.target.value)} style={{ ...dropdownStyle, flex: 1 }}>
          {Object.entries(FACTOR_LABELS).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
      </div>

      {/* Revenue proyectado */}
      <div style={{
        background: factor === 'NONE' ? '#f5f5f7' : '#f5f9ff',
        borderRadius: 8,
        padding: '8px 12px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <span style={{ fontSize: 11, color: factor === 'NONE' ? 'var(--text3)' : '#0071e3', fontWeight: 500 }}>
          Revenue proyectado
        </span>
        <span style={{ fontSize: 16, fontWeight: 700, color: factor === 'NONE' ? 'var(--text3)' : '#0071e3' }}>
          {factor === 'NONE' ? '—' : formatCLP(result.revenue)}
        </span>
      </div>

      {/* Grid métricas */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        {[
          { label: 'Pos. actual',   value: <PosBadge pos={avgPos} /> },
          { label: 'Pos. esperada', value: factor === 'NONE' ? '—' : <PosTargetBadge pos={result.posTarget} baseline={avgPos} /> },
          { label: 'Score',         value: factor === 'NONE' ? '0' : result.score.toFixed(1) },
        ].map((m, i) => (
          <div key={i} style={{ background: '#fafafa', borderRadius: 8, padding: '6px 8px' }}>
            <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 3 }}>{m.label}</div>
            <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)' }}>{m.value}</div>
          </div>
        ))}
      </div>

      {/* Guardar */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <SaveButton factor={factor} saving={saving} saved={saved} onClick={handleSave} />
      </div>
    </div>
  );
}

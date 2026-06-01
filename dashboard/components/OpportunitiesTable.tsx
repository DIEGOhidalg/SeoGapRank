'use client';

import FactorBadge from './FactorBadge';
import { useIsMobile } from '@/lib/useIsMobile';

interface Opportunity {
  query: string;
  page_url: string;
  avg_position: string;
  impressions: number;
  delta_clicks: number;
  ctr_actual: string;
  ctr_expected: string;
  revenue_final: number;
  agency_factor: string;
  opportunity_score: string;
}

interface Props {
  data: Opportunity[];
  total: number;
  page: number;
  pageSize: number;
  sortKey: string;
  sortDir: string;
  onSort: (key: string) => void;
  onPage: (page: number) => void;
  onFilter: (key: string, value: string) => void;
  filters: Record<string, string>;
}

function formatCLP(v: number) {
  return '$' + Math.round(v).toLocaleString('es-CL');
}

function formatCLPShort(v: number) {
  if (v >= 1000000) return `$${(v / 1000000).toFixed(1)}M`;
  if (v >= 1000) return `$${Math.round(v / 1000)}k`;
  return `$${v}`;
}

function PosBadge({ pos }: { pos: number }) {
  const [bg, color] =
    pos <= 5  ? ['#eaf6ee', '#1d8348'] :
    pos <= 10 ? ['#fef3e2', '#9a6700'] :
                ['#fdecea', '#c0392b'];
  return (
    <span style={{
      fontSize: 11, padding: '2px 8px', borderRadius: 20,
      background: bg, color, fontWeight: 500,
    }}>
      {pos.toFixed(1)}
    </span>
  );
}

function ScoreBar({ score }: { score: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 12, fontWeight: 500, minWidth: 32, color: 'var(--text)' }}>
        {score.toFixed(1)}
      </span>
      <div style={{ flex: 1, height: 3, background: '#f0f0f0', borderRadius: 2 }}>
        <div style={{
          height: 3, borderRadius: 2,
          background: '#0071e3',
          width: `${score}%`,
        }} />
      </div>
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  fontSize: 13,
  padding: '5px 10px',
  borderRadius: 8,
  border: '0.5px solid var(--border)',
  background: '#ffffff',
  color: 'var(--text)',
  outline: 'none',
  cursor: 'pointer',
};

// ─── Mobile card por keyword ────────────────────────────────────────────────
function OpportunityCard({ d, index }: { d: Opportunity; index: number }) {
  const pos = parseFloat(d.avg_position);
  const score = parseFloat(d.opportunity_score);

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
      {/* Header: número + keyword + factor */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: 11, color: 'var(--text3)', minWidth: 18, paddingTop: 2 }}>
            {index}
          </span>
          <a href={d.page_url} target="_blank" rel="noopener noreferrer"
            style={{
              fontSize: 14, fontWeight: 600, color: 'var(--text)',
              textDecoration: 'none', lineHeight: 1.3,
              overflow: 'hidden', display: '-webkit-box',
              WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
            }}>
            {d.query}
          </a>
        </div>
        <FactorBadge factor={d.agency_factor} />
      </div>

      {/* Revenue destacado */}
      <div style={{
        background: '#f5f9ff',
        borderRadius: 8,
        padding: '8px 12px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <span style={{ fontSize: 11, color: '#0071e3', fontWeight: 500 }}>Revenue CLP/mes</span>
        <span style={{ fontSize: 16, fontWeight: 700, color: '#0071e3' }}>
          {formatCLPShort(d.revenue_final)}
        </span>
      </div>

      {/* Grid de métricas: 3 columnas */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 8,
      }}>
        {[
          { label: 'Posición', value: <PosBadge pos={pos} /> },
          { label: 'Δ Clics', value: d.delta_clicks },
          { label: 'CTR real', value: `${d.ctr_actual}%` },
          { label: 'CTR esp.', value: `${d.ctr_expected}%` },
          { label: 'Impresiones', value: d.impressions.toLocaleString('es-CL') },
          { label: 'Score', value: score.toFixed(1) },
        ].map((m, i) => (
          <div key={i} style={{
            background: '#fafafa',
            borderRadius: 8,
            padding: '6px 8px',
          }}>
            <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 3 }}>{m.label}</div>
            <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)' }}>{m.value}</div>
          </div>
        ))}
      </div>

      {/* Score bar */}
      <div>
        <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 4 }}>Opportunity Score</div>
        <ScoreBar score={score} />
      </div>
    </div>
  );
}

// ─── Filtros compartidos ─────────────────────────────────────────────────────
function Filters({
  filters, onFilter, onExport, isMobile,
}: {
  filters: Record<string, string>;
  onFilter: (k: string, v: string) => void;
  onExport: () => void;
  isMobile: boolean;
}) {
  return (
    <div style={{
      display: 'flex',
      gap: isMobile ? 8 : 10,
      marginBottom: '1.25rem',
      flexWrap: 'wrap',
      alignItems: 'center',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <label style={{ fontSize: 12, color: 'var(--text2)' }}>Factor</label>
        <select value={filters.factor || ''} onChange={e => onFilter('factor', e.target.value)} style={selectStyle}>
          <option value="">Todos</option>
          <option value="BOTH">BOTH</option>
          <option value="CONTENT">CONTENT</option>
          <option value="LINK_BUILDING">LINK BUILDING</option>
          <option value="NONE">NONE</option>
        </select>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <label style={{ fontSize: 12, color: 'var(--text2)' }}>Pos. máx.</label>
        <select value={filters.maxPos || ''} onChange={e => onFilter('maxPos', e.target.value)} style={selectStyle}>
          <option value="">Todas</option>
          <option value="5">≤ 5</option>
          <option value="10">≤ 10</option>
          <option value="15">≤ 15</option>
        </select>
      </div>

      {!isMobile && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <label style={{ fontSize: 12, color: 'var(--text2)' }}>Revenue mín.</label>
          <select value={filters.minRevenue || '0'} onChange={e => onFilter('minRevenue', e.target.value)} style={selectStyle}>
            <option value="0">Sin filtro</option>
            <option value="100000">$100k+</option>
            <option value="300000">$300k+</option>
            <option value="500000">$500k+</option>
          </select>
        </div>
      )}

      <button onClick={onExport} style={{
        marginLeft: 'auto',
        fontSize: 12,
        padding: '5px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        cursor: 'pointer',
        border: '0.5px solid var(--border)',
        borderRadius: 8,
        background: '#ffffff',
        color: 'var(--text2)',
        fontWeight: 500,
        transition: 'all 0.15s',
        whiteSpace: 'nowrap',
      }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLButtonElement).style.background = '#f5f5f7';
          (e.currentTarget as HTMLButtonElement).style.color = 'var(--text)';
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLButtonElement).style.background = '#ffffff';
          (e.currentTarget as HTMLButtonElement).style.color = 'var(--text2)';
        }}
      >
        ↓ {isMobile ? 'CSV' : 'Exportar CSV'}
      </button>
    </div>
  );
}

// ─── Paginación compartida ───────────────────────────────────────────────────
function Pagination({
  page, totalPages, total, start, end, onPage, isMobile,
}: {
  page: number; totalPages: number; total: number;
  start: number; end: number; onPage: (p: number) => void; isMobile: boolean;
}) {
  const visiblePages = Array.from({ length: totalPages }, (_, i) => i + 1)
    .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= (isMobile ? 1 : 2));

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: '1rem',
      flexWrap: 'wrap',
      gap: 8,
    }}>
      <span style={{ fontSize: 11, color: 'var(--text3)' }}>
        {isMobile
          ? `${start}–${end} / ${total}`
          : `Mostrando ${start}–${end} de ${total} keywords`}
      </span>
      <div style={{ display: 'flex', gap: 4 }}>
        {visiblePages.map((p, idx, arr) => (
          <>
            {idx > 0 && arr[idx - 1] !== p - 1 && (
              <span key={`ellipsis-${p}`} style={{ fontSize: 12, color: 'var(--text3)', padding: '3px 4px' }}>…</span>
            )}
            <button key={p} onClick={() => onPage(p)} style={{
              fontSize: 12,
              padding: isMobile ? '5px 11px' : '3px 9px',
              borderRadius: 6,
              cursor: 'pointer',
              border: '0.5px solid',
              borderColor: page === p ? '#0071e3' : 'var(--border)',
              background: page === p ? '#0071e3' : '#ffffff',
              color: page === p ? '#ffffff' : 'var(--text2)',
              fontWeight: page === p ? 500 : 400,
              transition: 'all 0.15s',
            }}>{p}</button>
          </>
        ))}
      </div>
    </div>
  );
}

// ─── Componente principal ────────────────────────────────────────────────────
export default function OpportunitiesTable({
  data, total, page, pageSize, sortKey, sortDir,
  onSort, onPage, onFilter, filters,
}: Props) {
  const isMobile = useIsMobile();
  const totalPages = Math.ceil(total / pageSize);
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  function exportCSV() {
    const headers = ['keyword','posicion','impresiones','delta_clics','ctr_real','ctr_esperado','revenue_clp','agency_factor','score'];
    const rows = data.map(r => [
      r.query, parseFloat(r.avg_position).toFixed(2),
      r.impressions, r.delta_clicks,
      r.ctr_actual + '%', r.ctr_expected + '%',
      r.revenue_final, r.agency_factor, r.opportunity_score,
    ].join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    a.download = `gaprank_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  }

  function SortIcon({ col }: { col: string }) {
    if (sortKey !== col) return <span style={{ opacity: 0.25, fontSize: 10, marginLeft: 3 }}>⇅</span>;
    return <span style={{ fontSize: 10, marginLeft: 3, color: '#0071e3' }}>{sortDir === 'DESC' ? '↓' : '↑'}</span>;
  }

  const thStyle: React.CSSProperties = {
    textAlign: 'left', fontSize: 11, fontWeight: 500,
    color: 'var(--text2)', padding: '8px 12px',
    borderBottom: '0.5px solid var(--border)',
    whiteSpace: 'nowrap', cursor: 'pointer',
    userSelect: 'none', letterSpacing: '0.02em',
  };

  const tdStyle: React.CSSProperties = {
    padding: '10px 12px',
    borderBottom: '0.5px solid var(--border)',
    color: 'var(--text)', whiteSpace: 'nowrap',
    overflow: 'hidden', textOverflow: 'ellipsis', fontSize: 13,
  };

  return (
    <div style={{
      background: '#ffffff',
      border: '0.5px solid var(--border)',
      borderRadius: 16,
      padding: isMobile ? '1rem' : '1.25rem',
    }}>
      <Filters
        filters={filters}
        onFilter={onFilter}
        onExport={exportCSV}
        isMobile={isMobile}
      />

      {/* ── MOBILE: lista de cards ── */}
      {isMobile && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {data.map((d, i) => (
            <OpportunityCard key={i} d={d} index={start + i} />
          ))}
        </div>
      )}

      {/* ── DESKTOP: tabla ── */}
      {!isMobile && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <thead>
              <tr style={{ background: '#fafafa' }}>
                <th style={{ ...thStyle, width: 30 }}>#</th>
                <th style={{ ...thStyle, width: 155 }} onClick={() => onSort('query')}>Keyword <SortIcon col="query" /></th>
                <th style={{ ...thStyle, width: 65 }} onClick={() => onSort('avg_position')}>Pos. <SortIcon col="avg_position" /></th>
                <th style={{ ...thStyle, width: 72 }} onClick={() => onSort('delta_clicks')}>Δ Clics <SortIcon col="delta_clicks" /></th>
                <th style={{ ...thStyle, width: 78 }} onClick={() => onSort('ctr_actual')}>CTR real <SortIcon col="ctr_actual" /></th>
                <th style={{ ...thStyle, width: 78 }} onClick={() => onSort('ctr_expected')}>CTR esp. <SortIcon col="ctr_expected" /></th>
                <th style={{ ...thStyle, width: 118 }} onClick={() => onSort('revenue_final')}>Revenue CLP <SortIcon col="revenue_final" /></th>
                <th style={{ ...thStyle, width: 105 }} onClick={() => onSort('agency_factor')}>Factor <SortIcon col="agency_factor" /></th>
                <th style={{ ...thStyle, width: 105 }} onClick={() => onSort('opportunity_score')}>Score <SortIcon col="opportunity_score" /></th>
              </tr>
            </thead>
            <tbody>
              {data.map((d, i) => (
                <tr key={i}
                  onMouseEnter={e => (e.currentTarget.style.background = '#fafafa')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  style={{ transition: 'background 0.1s' }}
                >
                  <td style={{ ...tdStyle, color: 'var(--text3)', fontSize: 12 }}>{start + i}</td>
                  <td style={{ ...tdStyle, fontWeight: 500 }}>
                    <a href={d.page_url} target="_blank" rel="noopener noreferrer"
                      style={{ color: 'var(--text)', textDecoration: 'none', transition: 'color 0.15s' }}
                      onMouseEnter={e => (e.currentTarget.style.color = '#0071e3')}
                      onMouseLeave={e => (e.currentTarget.style.color = 'var(--text)')}>
                      {d.query}
                    </a>
                  </td>
                  <td style={tdStyle}><PosBadge pos={parseFloat(d.avg_position)} /></td>
                  <td style={tdStyle}>{d.delta_clicks}</td>
                  <td style={tdStyle}>{d.ctr_actual}%</td>
                  <td style={tdStyle}>{d.ctr_expected}%</td>
                  <td style={{ ...tdStyle, fontWeight: 600 }}>{formatCLP(d.revenue_final)}</td>
                  <td style={tdStyle}><FactorBadge factor={d.agency_factor} /></td>
                  <td style={tdStyle}><ScoreBar score={parseFloat(d.opportunity_score)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination
        page={page}
        totalPages={totalPages}
        total={total}
        start={start}
        end={end}
        onPage={onPage}
        isMobile={isMobile}
      />
    </div>
  );
}

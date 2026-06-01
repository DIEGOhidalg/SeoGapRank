'use client';

import { useState, useEffect, useCallback } from 'react';
import Script from 'next/script';
import KPICards from '@/components/KPICards';
import Top5List from '@/components/Top5List';
import DistributionChart from '@/components/DistributionChart';
import RevenueBarChart from '@/components/RevenueBarChart';
import OpportunitiesTable from '@/components/OpportunitiesTable';

interface KPIData {
  date: string;
  total_keywords: number;
  with_opportunity: number;
  total_revenue: number;
  active_revenue: number;
  distribution: { BOTH: number; CONTENT: number; LINK_BUILDING: number; NONE: number };
  top_opportunity: { query: string; revenue_final: number; agency_factor: string; avg_position: string } | null;
}

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

interface OppResponse {
  data: Opportunity[];
  total: number;
  page: number;
  pageSize: number;
}

export default function Home() {
  const [view, setView] = useState<'gerencia' | 'seo'>('gerencia');
  const [chartReady, setChartReady] = useState(false);
  const [kpis, setKpis] = useState<KPIData | null>(null);
  const [opps, setOpps] = useState<OppResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState('opportunity_score');
  const [sortDir, setSortDir] = useState('DESC');
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch('/api/kpis')
      .then(r => r.json())
      .then(setKpis)
      .catch(console.error);
  }, []);

  const fetchOpps = useCallback(() => {
    const params = new URLSearchParams({
      sortKey, sortDir,
      page: String(page),
      pageSize: '10',
      ...filters,
    });
    setLoading(true);
    fetch(`/api/opportunities?${params}`)
      .then(r => r.json())
      .then(d => { setOpps(d); setLoading(false); })
      .catch(console.error);
  }, [sortKey, sortDir, page, filters]);

  useEffect(() => { fetchOpps(); }, [fetchOpps]);

  function handleSort(key: string) {
    if (sortKey === key) setSortDir(d => d === 'DESC' ? 'ASC' : 'DESC');
    else { setSortKey(key); setSortDir('DESC'); }
    setPage(1);
  }

  function handleFilter(key: string, value: string) {
    setFilters(f => ({ ...f, [key]: value }));
    setPage(1);
  }

  const card: React.CSSProperties = {
    background: '#ffffff',
    border: '0.5px solid rgba(0,0,0,0.08)',
    borderRadius: 16,
    padding: '1.25rem',
  };

  return (
    <>
      <Script
        src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js"
        onLoad={() => setChartReady(true)}
      />

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '2rem 1rem' }}>

        {/* Top bar */}
        <div style={{
          display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', marginBottom: '2rem',
        }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 600, color: '#1d1d1f', letterSpacing: '-0.02em' }}>
              GAPRANK v2.0
            </div>
            <div style={{ fontSize: 13, color: '#6e6e73', marginTop: 2 }}>
              paris.cl / tecnología
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {kpis?.date && (
              <span style={{
                fontSize: 12, color: '#6e6e73',
                background: '#ffffff',
                border: '0.5px solid rgba(0,0,0,0.08)',
                padding: '5px 12px', borderRadius: 8,
              }}>
                {new Date(kpis.date).toLocaleDateString('es-CL', {
                  day: '2-digit', month: 'long', year: 'numeric'
                })}
              </span>
            )}
            <div style={{
              display: 'flex',
              background: '#ffffff',
              border: '0.5px solid rgba(0,0,0,0.08)',
              borderRadius: 10, padding: 3, gap: 2,
            }}>
              {(['gerencia', 'seo'] as const).map(v => (
                <button key={v} onClick={() => setView(v)} style={{
                  padding: '6px 16px', fontSize: 13,
                  border: 'none', cursor: 'pointer',
                  borderRadius: 8, transition: 'all 0.2s',
                  background: view === v ? '#0071e3' : 'transparent',
                  color: view === v ? '#ffffff' : '#6e6e73',
                  fontWeight: view === v ? 500 : 400,
                  letterSpacing: '-0.01em',
                }}>
                  {v === 'gerencia' ? 'Gerencia' : 'Equipo SEO'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* KPIs */}
        {kpis && <KPICards data={kpis} />}

        {/* Vista Gerencia */}
        {view === 'gerencia' && opps && kpis && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
              <div style={card}>
                <div style={{
                  fontSize: 13, fontWeight: 500,
                  color: '#6e6e73', marginBottom: '1.25rem',
                  letterSpacing: '0.01em',
                }}>
                  Top 5 oportunidades del día
                </div>
                <Top5List data={opps.data} />
              </div>
              <div style={card}>
                <div style={{
                  fontSize: 13, fontWeight: 500,
                  color: '#6e6e73', marginBottom: '1.25rem',
                  letterSpacing: '0.01em',
                }}>
                  Distribución por acción SEO
                </div>
                {chartReady && <DistributionChart data={kpis.distribution} />}
              </div>
            </div>
            <div style={card}>
              <div style={{
                fontSize: 13, fontWeight: 500,
                color: '#6e6e73', marginBottom: '0.75rem',
                letterSpacing: '0.01em',
              }}>
                Revenue potencial — top 10 keywords
              </div>
              {chartReady && <RevenueBarChart data={opps.data} />}
            </div>
          </>
        )}

        {/* Vista SEO */}
        {view === 'seo' && (
          <div style={{ position: 'relative' }}>
            {loading && (
              <div style={{
                position: 'absolute', inset: 0,
                background: 'rgba(255,255,255,0.7)',
                display: 'flex', alignItems: 'center',
                justifyContent: 'center', zIndex: 10,
                borderRadius: 16, fontSize: 13,
                color: '#6e6e73',
                backdropFilter: 'blur(2px)',
              }}>
                Cargando...
              </div>
            )}
            {opps && (
              <OpportunitiesTable
                data={opps.data}
                total={opps.total}
                page={page}
                pageSize={10}
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={handleSort}
                onPage={setPage}
                onFilter={handleFilter}
                filters={filters}
              />
            )}
          </div>
        )}

        {/* Footer */}
        <div style={{
          marginTop: '2rem', textAlign: 'center',
          fontSize: 11, color: '#aeaeb2',
          letterSpacing: '0.02em',
        }}>
          GAPRANK v2.0 · Paris.cl · Pipeline automático 6 AM
        </div>
      </div>
    </>
  );
}
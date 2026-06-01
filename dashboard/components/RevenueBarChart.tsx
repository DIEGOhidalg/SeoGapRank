'use client';

import { useEffect, useRef } from 'react';

interface Opportunity {
  query: string;
  revenue_final: number;
  agency_factor: string;
}

export default function RevenueBarChart({ data }: { data: Opportunity[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<any>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const Chart = (window as any).Chart;
    if (!Chart) return;
    if (chartRef.current) chartRef.current.destroy();

    const top10 = [...data]
      .sort((a, b) => b.revenue_final - a.revenue_final)
      .slice(0, 10);

    chartRef.current = new Chart(canvasRef.current, {
      type: 'bar',
      data: {
        labels: top10.map(d => d.query),
        datasets: [{
          label: 'Revenue CLP',
          data: top10.map(d => Math.round(d.revenue_final / 1000)),
          backgroundColor: top10.map(d =>
            d.agency_factor === 'CONTENT'       ? '#1d8348' :
            d.agency_factor === 'LINK_BUILDING' ? '#9a6700' : '#0071e3'
          ),
          borderRadius: 6,
          borderSkipped: false,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#1d1d1f',
            titleColor: '#ffffff',
            bodyColor: '#aeaeb2',
            padding: 10,
            cornerRadius: 8,
            callbacks: {
              label: (ctx: any) => ` $${ctx.raw.toLocaleString('es-CL')}k CLP`,
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            border: { display: false },
            ticks: {
              font: { size: 11, family: '-apple-system, BlinkMacSystemFont, sans-serif' },
              color: '#6e6e73',
              maxRotation: 35,
            },
          },
          y: {
            grid: { color: 'rgba(0,0,0,0.04)', lineWidth: 1 },
            border: { display: false },
            ticks: {
              font: { size: 11 },
              color: '#6e6e73',
              callback: (v: any) => `$${v}k`,
            },
          },
        },
      },
    });

    return () => { if (chartRef.current) chartRef.current.destroy(); };
  }, [data]);

  return (
    <div style={{ position: 'relative', height: 220 }}>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label="Gráfico de barras con revenue potencial de las top 10 keywords"
      >
        Revenue potencial por keyword en CLP.
      </canvas>
    </div>
  );
}
'use client';

import { useEffect, useRef } from 'react';

interface Distribution {
  BOTH: number;
  CONTENT: number;
  LINK_BUILDING: number;
  NONE: number;
}

export default function DistributionChart({ data }: { data: Distribution }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<any>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const Chart = (window as any).Chart;
    if (!Chart) return;
    if (chartRef.current) chartRef.current.destroy();

    chartRef.current = new Chart(canvasRef.current, {
      type: 'doughnut',
      data: {
        labels: ['BOTH', 'CONTENT', 'LINK BUILDING', 'NONE'],
        datasets: [{
          data: [data.BOTH, data.CONTENT, data.LINK_BUILDING, data.NONE],
          backgroundColor: ['#0071e3', '#1d8348', '#9a6700', '#e0e0e5'],
          borderWidth: 2,
          borderColor: '#ffffff',
          borderRadius: 4,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '68%',
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#1d1d1f',
            titleColor: '#ffffff',
            bodyColor: '#aeaeb2',
            padding: 10,
            cornerRadius: 8,
            callbacks: {
              label: (ctx: any) => ` ${ctx.label}: ${ctx.raw} keywords`,
            },
          },
        },
      },
    });

    return () => { if (chartRef.current) chartRef.current.destroy(); };
  }, [data]);

  const total = data.BOTH + data.CONTENT + data.LINK_BUILDING + data.NONE;
  const active = data.BOTH + data.CONTENT + data.LINK_BUILDING;

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        {[
          { label: 'BOTH',         color: '#0071e3', count: data.BOTH },
          { label: 'CONTENT',      color: '#1d8348', count: data.CONTENT },
          { label: 'LINK BUILDING',color: '#9a6700', count: data.LINK_BUILDING },
          { label: 'NONE',         color: '#e0e0e5', count: data.NONE },
        ].map(({ label, color, count }) => (
          <span key={label} style={{
            display: 'flex', alignItems: 'center', gap: 5,
            fontSize: 12, color: 'var(--text2)',
          }}>
            <span style={{
              width: 8, height: 8, borderRadius: '50%',
              background: color, display: 'inline-block', flexShrink: 0,
            }} />
            {label} <strong style={{ color: 'var(--text)', fontWeight: 500 }}>{count}</strong>
          </span>
        ))}
      </div>
      <div style={{ position: 'relative', height: 160 }}>
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={`Distribución: BOTH ${data.BOTH}, CONTENT ${data.CONTENT}, LINK BUILDING ${data.LINK_BUILDING}, NONE ${data.NONE}`}
        />
      </div>
      <div style={{
        textAlign: 'center', marginTop: 10,
        fontSize: 12, color: 'var(--text2)',
      }}>
        <strong style={{ color: 'var(--text)', fontWeight: 500 }}>{active}</strong> de {total} keywords con acción recomendada
      </div>
    </div>
  );
}
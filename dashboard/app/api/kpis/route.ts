import { NextResponse } from 'next/server';
import pool from '@/lib/db';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date') || '';

  try {
    const dateQuery = date
      ? `WHERE date = '${date}'`
      : `WHERE date = (SELECT MAX(date) FROM keyword_gaps)`;

    const [kpis, topOpp] = await Promise.all([
      pool.query(`
        SELECT
          date,
          COUNT(*)                                          AS total_keywords,
          COUNT(*) FILTER (WHERE agency_factor != 'NONE')  AS with_opportunity,
          COUNT(*) FILTER (WHERE agency_factor = 'BOTH')   AS factor_both,
          COUNT(*) FILTER (WHERE agency_factor = 'CONTENT') AS factor_content,
          COUNT(*) FILTER (WHERE agency_factor = 'LINK_BUILDING') AS factor_lb,
          COUNT(*) FILTER (WHERE agency_factor = 'NONE')   AS factor_none,
          COALESCE(SUM(revenue_final), 0)                  AS total_revenue,
          COALESCE(SUM(revenue_final) FILTER (WHERE agency_factor != 'NONE'), 0) AS active_revenue
        FROM keyword_gaps
        ${dateQuery}
        GROUP BY date
      `),
      pool.query(`
        SELECT query, revenue_final, opportunity_score, agency_factor, avg_position
        FROM keyword_gaps
        ${dateQuery}
          AND revenue_final IS NOT NULL
        ORDER BY revenue_final DESC
        LIMIT 1
      `)
    ]);

    const row = kpis.rows[0] || {};
    const top = topOpp.rows[0] || null;

    return NextResponse.json({
      date: row.date,
      total_keywords: parseInt(row.total_keywords || '0'),
      with_opportunity: parseInt(row.with_opportunity || '0'),
      total_revenue: parseInt(row.total_revenue || '0'),
      active_revenue: parseInt(row.active_revenue || '0'),
      distribution: {
        BOTH: parseInt(row.factor_both || '0'),
        CONTENT: parseInt(row.factor_content || '0'),
        LINK_BUILDING: parseInt(row.factor_lb || '0'),
        NONE: parseInt(row.factor_none || '0'),
      },
      top_opportunity: top,
    });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
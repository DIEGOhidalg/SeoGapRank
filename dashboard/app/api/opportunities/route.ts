import { NextResponse } from 'next/server';
import pool from '@/lib/db';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const date        = searchParams.get('date')   || '';
  const factor      = searchParams.get('factor') || '';
  const maxPos      = searchParams.get('maxPos') || '';
  const minRevenue  = searchParams.get('minRevenue') || '0';
  const sortKey     = searchParams.get('sortKey') || 'opportunity_score';
  const sortDir     = searchParams.get('sortDir') || 'DESC';
  const page        = parseInt(searchParams.get('page') || '1');
  const pageSize    = parseInt(searchParams.get('pageSize') || '10');
  const offset      = (page - 1) * pageSize;

  const allowedSortKeys = [
    'query','avg_position','delta_clicks','ctr_actual',
    'ctr_expected','revenue_final','agency_factor','opportunity_score'
  ];
  const allowedSortDirs = ['ASC','DESC'];
  const safeKey = allowedSortKeys.includes(sortKey) ? sortKey : 'opportunity_score';
  const safeDir = allowedSortDirs.includes(sortDir.toUpperCase()) ? sortDir.toUpperCase() : 'DESC';

  try {
    const conditions: string[] = [];

    if (date) {
      conditions.push(`date = '${date}'`);
    } else {
      conditions.push(`date = (SELECT MAX(date) FROM keyword_gaps)`);
    }

    if (factor) conditions.push(`agency_factor = '${factor}'`);
    if (maxPos)  conditions.push(`avg_position <= ${parseFloat(maxPos)}`);
    if (minRevenue && minRevenue !== '0') conditions.push(`revenue_final >= ${parseInt(minRevenue)}`);

    const where = `WHERE ${conditions.join(' AND ')}`;

    const [rows, countResult] = await Promise.all([
      pool.query(`
        SELECT
          query,
          page_url,
          avg_position,
          impressions,
          delta_clicks,
          ROUND(ctr_actual * 100, 2)    AS ctr_actual,
          ROUND(ctr_expected * 100, 2)  AS ctr_expected,
          revenue_final,
          agency_factor,
          ROUND(opportunity_score, 1)   AS opportunity_score
        FROM keyword_gaps
        ${where}
          AND delta_clicks > 0
        ORDER BY ${safeKey} ${safeDir}
        LIMIT ${pageSize} OFFSET ${offset}
      `),
      pool.query(`
        SELECT COUNT(*) AS total
        FROM keyword_gaps
        ${where}
          AND delta_clicks > 0
      `)
    ]);

    return NextResponse.json({
      data: rows.rows,
      total: parseInt(countResult.rows[0].total),
      page,
      pageSize,
    });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
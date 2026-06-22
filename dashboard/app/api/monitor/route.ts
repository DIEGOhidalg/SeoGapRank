import { NextResponse } from 'next/server';
import pool from '@/lib/db';

export async function GET() {
  try {
    const result = await pool.query(`
      WITH mk_filtered AS (
        SELECT id, query, page_url, baseline_position, baseline_date,
               target_position, agency_factor_aplicado, notas, created_at
        FROM monitored_keywords
      ),
      weekly_agg AS (
        SELECT d.query, d.page,
               DATE_TRUNC('week', d.date)             AS wk,
               ROUND(AVG(d.position)::numeric, 2)     AS avg_pos
        FROM gsc_daily d
        JOIN mk_filtered mk ON mk.query = d.query AND mk.page_url = d.page
        GROUP BY d.query, d.page, DATE_TRUNC('week', d.date)
      ),
      weekly_json AS (
        SELECT query, page,
               json_agg(
                 json_build_object(
                   'week',         TO_CHAR(wk, 'IYYY"-W"IW'),
                   'avg_position', avg_pos::float
                 ) ORDER BY wk
               ) AS series
        FROM weekly_agg
        GROUP BY query, page
      ),
      current_pos AS (
        SELECT d.query, d.page,
               ROUND(AVG(d.position)::numeric, 2) AS cur_pos
        FROM gsc_daily d
        JOIN mk_filtered mk ON mk.query = d.query AND mk.page_url = d.page
        WHERE d.date >= CURRENT_DATE - INTERVAL '7 days'
        GROUP BY d.query, d.page
      )
      SELECT
        mk.id,
        mk.query,
        mk.page_url,
        mk.baseline_position::float,
        mk.baseline_date,
        mk.target_position::float,
        mk.agency_factor_aplicado,
        mk.notas,
        mk.created_at,
        cp.cur_pos::float                                              AS current_position,
        ROUND((cp.cur_pos - mk.baseline_position)::numeric, 2)::float AS delta,
        COALESCE(wj.series, '[]'::json)                                AS weekly_series
      FROM mk_filtered mk
      LEFT JOIN current_pos cp ON cp.query = mk.query AND cp.page = mk.page_url
      LEFT JOIN weekly_json wj ON wj.query = mk.query AND wj.page = mk.page_url
      ORDER BY mk.created_at DESC
    `);

    return NextResponse.json(result.rows);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      query,
      page_url,
      agency_factor_aplicado,
      baseline_position,
      target_position,
      baseline_date,
    } = body;

    if (!query || !page_url || !agency_factor_aplicado || !baseline_position || !target_position || !baseline_date) {
      return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 });
    }

    const result = await pool.query(
      `INSERT INTO monitored_keywords
         (query, page_url, agency_factor_aplicado, baseline_position, target_position, baseline_date)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (query, page_url) DO UPDATE
         SET agency_factor_aplicado = EXCLUDED.agency_factor_aplicado,
             baseline_position      = EXCLUDED.baseline_position,
             target_position        = EXCLUDED.target_position,
             baseline_date          = EXCLUDED.baseline_date,
             created_at             = NOW()
       RETURNING id`,
      [query, page_url, agency_factor_aplicado, baseline_position, target_position, baseline_date]
    );

    return NextResponse.json({ id: result.rows[0].id });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

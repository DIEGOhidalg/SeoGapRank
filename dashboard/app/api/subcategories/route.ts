import { NextResponse } from 'next/server';
import pool from '@/lib/db';

export async function GET() {
  try {
    const result = await pool.query(`
      SELECT DISTINCT
        COALESCE(NULLIF(split_part(split_part(page_url, '.cl/', 2), '/', 2), ''), '(sin subcategoría)') AS subcategory
      FROM keyword_gaps
      WHERE date = (SELECT MAX(date) FROM keyword_gaps)
        AND delta_clicks > 0
      ORDER BY subcategory
    `);

    return NextResponse.json(result.rows.map((r: { subcategory: string }) => r.subcategory));
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import pool from '@/lib/db';

export async function GET() {
  try {
    const [factorsResult, ctrResult, maxScoreResult] = await Promise.all([
      pool.query(`
        SELECT factor_name, ctr_boost::float, success_prob::float
        FROM agency_factor_params
        ORDER BY factor_name
      `),
      pool.query(`
        SELECT position, ctr_mid::float
        FROM ctr_curve
        ORDER BY position
      `),
      pool.query(`
        SELECT MAX(
          COALESCE(kg.revenue_final, 0)
          * af.success_prob
          * CASE WHEN kg.avg_position <= 5  THEN 1.0
                 WHEN kg.avg_position <= 10 THEN 0.8
                 ELSE 0.5 END
        )::float AS max_raw_score
        FROM keyword_gaps kg
        JOIN agency_factor_params af ON af.factor_name = kg.agency_factor
        WHERE kg.date = (SELECT MAX(date) FROM keyword_gaps)
          AND kg.revenue_final IS NOT NULL
          AND kg.revenue_final > 0
      `),
    ]);

    const ctrCurve: Record<number, number> = {};
    for (const row of ctrResult.rows) {
      ctrCurve[parseInt(row.position)] = parseFloat(row.ctr_mid);
    }

    return NextResponse.json({
      factors: factorsResult.rows.map((r: any) => ({
        factor_name:  r.factor_name,
        ctr_boost:    parseFloat(r.ctr_boost),
        success_prob: parseFloat(r.success_prob),
      })),
      ctrCurve,
      maxRawScore: parseFloat(maxScoreResult.rows[0]?.max_raw_score ?? '0'),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export interface FactorParam {
  factor_name:  string;
  ctr_boost:    number;
  success_prob: number;
}

export interface SimulatorParams {
  factors:      FactorParam[];
  ctrCurve:     Record<number, number>;
  maxRawScore:  number;
}

export interface SimResult {
  posTarget:   number;
  deltaClicks: number;
  revenue:     number;
  score:       number;
}

export interface SimRow {
  avg_position:       number;
  ctr_actual_decimal: number;
  impressions:        number;
  conversion_rate:    number;
  avg_ticket:         number;
}

function getPosTarget(avgPosition: number, factor: string): number {
  switch (factor) {
    case 'CONTENT':       return avgPosition;
    case 'LINK_BUILDING': return Math.max(avgPosition - 5.5, 3.0);
    case 'BOTH':          return Math.max(avgPosition - 7.5, 3.0);
    default:              return avgPosition;
  }
}

function lookupCtr(position: number, ctrCurve: Record<number, number>): number {
  const p = Math.min(Math.max(Math.round(position), 1), 20);
  return ctrCurve[p] ?? 0;
}

export function simulate(row: SimRow, factor: string, params: SimulatorParams): SimResult {
  if (factor === 'NONE') {
    return { posTarget: row.avg_position, deltaClicks: 0, revenue: 0, score: 0 };
  }

  const fp = params.factors.find(f => f.factor_name === factor)
          ?? { factor_name: 'NONE', ctr_boost: 1.0, success_prob: 0.0 };

  const posTarget         = getPosTarget(row.avg_position, factor);
  const ctrTargetAdjusted = lookupCtr(posTarget, params.ctrCurve) * fp.ctr_boost;
  const deltaClicks       = Math.max(
    Math.round(row.impressions * (ctrTargetAdjusted - row.ctr_actual_decimal)),
    0
  );
  const revenue = Math.round(deltaClicks * row.conversion_rate * row.avg_ticket);

  const positionGapWeight = row.avg_position <= 5  ? 1.0
                          : row.avg_position <= 10 ? 0.8 : 0.5;
  const rawScore = revenue * fp.success_prob * positionGapWeight;
  const score    = params.maxRawScore > 0
                 ? Math.min((rawScore / params.maxRawScore) * 100, 100)
                 : 0;

  return { posTarget, deltaClicks, revenue, score };
}

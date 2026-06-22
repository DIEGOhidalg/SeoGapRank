BEGIN;

CREATE TABLE IF NOT EXISTS monitored_keywords (
  id                    SERIAL PRIMARY KEY,
  query                 TEXT NOT NULL,
  page_url              TEXT NOT NULL,
  baseline_position     NUMERIC(6,2) NOT NULL,
  baseline_date         DATE NOT NULL,
  target_position       NUMERIC(6,2) NOT NULL,
  agency_factor_aplicado TEXT NOT NULL
    CHECK (agency_factor_aplicado IN ('NONE','CONTENT','LINK_BUILDING','BOTH')),
  notas                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(query, page_url)
);

COMMIT;

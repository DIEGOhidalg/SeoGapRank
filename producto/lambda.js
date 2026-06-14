const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const { google } = require('googleapis');
const { Pool } = require('pg');

const smClient = new SecretsManagerClient({ region: 'us-east-2' });

async function getSecret(secretId) {
  const cmd = new GetSecretValueCommand({ SecretId: secretId });
  const res = await smClient.send(cmd);
  return JSON.parse(res.SecretString);
}

// Retorna fecha consolidada (hoy - 3 días) para evitar fresh data
function getConsolidatedDate() {
  const d = new Date();
  d.setDate(d.getDate() - 3);
  return d.toISOString().split('T')[0];
}

// --- Filtro Branded ---
const BRANDED_TERMS = [
  'paris', 'pars', 'paeis', 'paaris', 'pariw', 'parus', 'parid',
  'patis', 'paros', 'paria', 'parís', 'cenco', 'almacen', 'almacenes'
];
const brandedRegex = new RegExp(BRANDED_TERMS.join('|'), 'i');
const brandedBoundary = /\baris\b/i;

function isBranded(query) {
  return brandedRegex.test(query) || brandedBoundary.test(query);
}

async function fetchGSCDay(auth, date) {
  const sc = google.searchconsole({ version: 'v1', auth });
  const rows = [];
  let startRow = 0;
  const rowLimit = 25000;

  while (true) {
    const res = await sc.searchanalytics.query({
      siteUrl: 'https://www.paris.cl/',
      requestBody: {
        startDate: date,
        endDate: date,
        dimensions: ['query', 'page'],
        rowLimit,
        startRow,
        dimensionFilterGroups: [{
          filters: [{
            dimension: 'page',
            operator: 'contains',
            expression: 'paris.cl/tecnologia/'
          }]
        }]
      }
    });

    const data = res.data.rows || [];
    rows.push(...data);
    if (data.length < rowLimit) break;
    startRow += rowLimit;
  }

  return rows;
}

function shouldExclude(page, position, query) {
  if (page.includes('/listas/')) return true;
  if (page.includes('/search')) return true;
  if (page.includes('.html')) return true;
  if (position > 20) return true;
  if (isBranded(query)) return true;   // Excluir términos branded
  return false;
}

async function saveToDatabase(pool, rows, date) {
  let inserted = 0;
  let excluded = 0;
  const batchSize = 500;

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      for (const row of batch) {
        const [query, page] = row.keys;

        if (shouldExclude(page, row.position, query)) {
          excluded++;
          continue;
        }

        await client.query(`
          INSERT INTO gsc_daily (date, query, page, clicks, impressions, ctr, position)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (date, query, page) DO UPDATE SET
            clicks = EXCLUDED.clicks,
            impressions = EXCLUDED.impressions,
            ctr = EXCLUDED.ctr,
            position = EXCLUDED.position
        `, [date, query, page, row.clicks, row.impressions, row.ctr, row.position]);
        inserted++;
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  console.log(`✅ ${date}: ${inserted} insertadas, ${excluded} excluidas (página + branded)`);
  return inserted;
}

exports.handler = async (event) => {
  let pool;

  try {
    const secret = await getSecret('gaprank/credentials');

    pool = new Pool({
      host: process.env.DB_HOST,
      port: 5432,
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: secret.DB_PASSWORD,
      ssl: { rejectUnauthorized: false }
    });

    await pool.query('SELECT 1');
    console.log('RDS OK');

    const gscKey = typeof secret.GSC_CREDENTIALS === 'string'
      ? JSON.parse(secret.GSC_CREDENTIALS)
      : secret.GSC_CREDENTIALS;

    const auth = new google.auth.GoogleAuth({
      credentials: gscKey,
      scopes: ['https://www.googleapis.com/auth/webmasters.readonly']
    });
    const authClient = await auth.getClient();
    console.log('GSC OK:', gscKey.client_email);

    // Sin argumento en event.date usa fecha consolidada (hoy - 3 días)
    const date = event.date || getConsolidatedDate();
    console.log(`Descargando /tecnologia/ para: ${date}`);

    const rows = await fetchGSCDay(authClient, date);
    console.log(`Filas descargadas: ${rows.length}`);

    if (rows.length === 0) {
      return { statusCode: 200, body: `Sin datos para ${date}` };
    }

    const inserted = await saveToDatabase(pool, rows, date);

    // F2-02a: poblar keyword_gaps desde gsc_daily
    console.log(`Poblando keyword_gaps para ${date}...`);
    const kgResult = await pool.query(`
      INSERT INTO keyword_gaps (date, query, page_url, impressions, avg_position, ctr_actual, agency_factor)
      SELECT
        date,
        query,
        page        AS page_url,
        impressions,
        position    AS avg_position,
        ctr         AS ctr_actual,
        'NONE'      AS agency_factor
      FROM gsc_daily
      WHERE date = $1
      ON CONFLICT DO NOTHING
    `, [date]);
    console.log(`keyword_gaps OK: ${kgResult.rowCount} filas insertadas`);

    // F2-02: CTR gap + clasificación + delta_clicks (la clasificación corre DENTRO de este proc)
    console.log(`Ejecutando scoring F2-02 para ${date}...`);
    await pool.query('CALL calculate_ctr_gap_and_delta_clicks($1)', [date]);
    console.log('F2-02 OK: ctr_gap, agency_factor y delta_clicks calculados');

    // F2-03: revenue incremental en CLP
    console.log(`Ejecutando F2-03 revenue para ${date}...`);
    await pool.query('CALL calculate_revenue($1)', [date]);
    console.log('F2-03 OK: revenue_final calculado');

    // F2-04: opportunity_score normalizado 0-100
    console.log(`Ejecutando F2-04 opportunity_score para ${date}...`);
    await pool.query('CALL calculate_opportunity_score($1)', [date]);
    console.log('F2-04 OK: opportunity_score calculado');

    return {
      statusCode: 200,
      body: `OK: ${inserted} filas para ${date}`
    };

  } catch (err) {
    console.error('ERROR:', err.message);
    return { statusCode: 500, body: err.message };
  } finally {
    if (pool) await pool.end();
  }
};

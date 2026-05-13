// ingest.js — Ejecución local / backfill manual
// Uso normal:    node ingest.js
// Backfill:      node ingest.js 2026-05-01

process.env.DB_HOST = 'gaprank-db-v2.cl0ykwguiwcz.us-east-2.rds.amazonaws.com';
process.env.DB_PORT = '5432';
process.env.DB_NAME = 'gaprank';
process.env.DB_USER = 'gaprank_admin';
process.env.DB_PASSWORD = 'GapRank2026!';
process.env.GSC_PROPERTY = 'https://www.paris.cl/';
process.env.GSC_KEY_FILE = './credentials.json';

const { google } = require('googleapis');
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: { rejectUnauthorized: false }
});

async function getAuthClient() {
  const auth = new google.auth.GoogleAuth({
    keyFile: process.env.GSC_KEY_FILE,
    scopes: ['https://www.googleapis.com/auth/webmasters.readonly']
  });
  return auth.getClient();
}

// Retorna fecha de ayer en formato YYYY-MM-DD
function getYesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}

// Descarga datos de GSC para UN día específico
async function fetchGSCData(auth, date, rowLimit = 25000) {
  const sc = google.searchconsole({ version: 'v1', auth });
  const rows = [];
  let startRow = 0;

  while (true) {
    const res = await sc.searchanalytics.query({
      siteUrl: process.env.GSC_PROPERTY,
      requestBody: {
        startDate: date,
        endDate: date,
        dimensions: ['query', 'page', 'device'],
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
    console.log(`  Fetched ${rows.length} rows (startRow: ${startRow})`);

    if (data.length < rowLimit) break;
    startRow += rowLimit;
  }

  return rows;
}

async function saveToDatabase(rows, date) {
  let inserted = 0;
  const batchSize = 500;

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      for (const row of batch) {
        const [query, page, device] = row.keys;
        await client.query(`
          INSERT INTO gsc_daily (date, query, page, clicks, impressions, ctr, position, device)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (date, query, page, device) DO UPDATE SET
            clicks = EXCLUDED.clicks,
            impressions = EXCLUDED.impressions,
            ctr = EXCLUDED.ctr,
            position = EXCLUDED.position
        `, [date, query, page, row.clicks, row.impressions, row.ctr, row.position, device]);
        inserted++;
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    console.log(`  💾 Insertadas ${inserted} de ${rows.length} filas...`);
  }

  console.log(`✅ Insertadas ${inserted} filas para ${date}`);
  return inserted;
}

async function runIngestion() {
  // Acepta fecha como argumento: node ingest.js 2026-05-01
  const date = process.argv[2] || getYesterday();
  console.log(`🚀 Iniciando ingesta GSC — Fecha: ${date} — Filtro: /tecnologia/`);

  try {
    const auth = await getAuthClient();
    console.log('✅ Autenticación GSC OK');

    await pool.query('SELECT 1');
    console.log('✅ Conexión BD OK');

    console.log(`📥 Descargando datos de /tecnologia/ para ${date}...`);
    const rows = await fetchGSCData(auth, date);
    console.log(`📊 Total filas descargadas: ${rows.length}`);

    if (rows.length === 0) {
      console.log('⚠️  Sin datos para esta fecha');
      return;
    }

    await saveToDatabase(rows, date);
    console.log('✅ Ingesta completada exitosamente');

  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    await pool.end();
  }
}

runIngestion();
// ingest.js — Ingesta GSC → gsc_daily (local / backfill manual)
// Uso:      node ingest.js              (fecha consolidada hoy-3)
//           node ingest.js 2026-05-01   (fecha específica / backfill)
// Requiere: npm install googleapis pg dotenv
//
// Credenciales: en un .env GITIGNORED o variables de entorno. NO hardcodear.
// En producción (Lambda) el password y la key de GSC deben venir de Secrets Manager.

require('dotenv').config();
const { google } = require('googleapis');
const { Pool } = require('pg');

const DB = {
  host: process.env.DB_HOST || 'gaprank-db.cl0ykwguiwcz.us-east-2.rds.amazonaws.com',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'gaprank',
  user: process.env.DB_USER || 'gaprank_admin',
  password: process.env.DB_PASSWORD,
  ssl: { rejectUnauthorized: false }
};
if (!DB.password) {
  console.error('❌ Falta DB_PASSWORD (defínela en env o en un .env gitignored).');
  process.exit(1);
}

const GSC_PROPERTY = process.env.GSC_PROPERTY || 'https://www.paris.cl/';
const GSC_KEY_FILE = process.env.GSC_KEY_FILE || './credentials.json';

const pool = new Pool(DB);

async function getAuthClient() {
  const auth = new google.auth.GoogleAuth({
    keyFile: GSC_KEY_FILE,
    scopes: ['https://www.googleapis.com/auth/webmasters.readonly']
  });
  return auth.getClient();
}

// Fecha consolidada (hoy - 3 días) para evitar fresh data inestable de GSC
function getConsolidatedDate() {
  const d = new Date();
  d.setDate(d.getDate() - 3);
  return d.toISOString().split('T')[0];
}

// Páginas que NO son PLP indexable: se excluyen de la ingesta
function isExcludedPage(page) {
  return page.includes('/listas/') || page.includes('/search') || page.includes('.html');
}

// Descarga datos de GSC para UN día específico
async function fetchGSCData(auth, date, rowLimit = 25000) {
  const sc = google.searchconsole({ version: 'v1', auth });
  const rows = [];
  let startRow = 0;

  while (true) {
    const res = await sc.searchanalytics.query({
      siteUrl: GSC_PROPERTY,
      requestBody: {
        startDate: date,
        endDate: date,
        dimensions: ['query', 'page'],
        rowLimit,
        startRow,
        dimensionFilterGroups: [{
          filters: [{ dimension: 'page', operator: 'contains', expression: 'paris.cl/tecnologia/' }]
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
  let inserted = 0, excludedPage = 0, excludedPos = 0;
  const batchSize = 500;

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      for (const row of batch) {
        const [query, page] = row.keys;

        // Filtro de página: solo PLP indexable
        if (isExcludedPage(page)) { excludedPage++; continue; }

        // Filtro de posición: solo top 20
        if (row.position > 20) { excludedPos++; continue; }

        // Branded: NO se filtra aquí. Lo maneja is_branded() en la BD (tabla
        // branded_terms) durante el scoring — una sola fuente de verdad.
        // Para agregar un término: INSERT INTO branded_terms (term, note) VALUES (...);

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
    console.log(`  💾 ${inserted}/${rows.length} insertadas...`);
  }

  console.log(`✅ ${inserted} filas para ${date} | 🚫 páginas excluidas: ${excludedPage} | pos>20: ${excludedPos}`);
  return inserted;
}

async function runIngestion() {
  const date = process.argv[2] || getConsolidatedDate();
  console.log(`🚀 Ingesta GSC — Fecha: ${date} — Filtro: /tecnologia/`);

  try {
    const auth = await getAuthClient();
    console.log('✅ Auth GSC OK');

    await pool.query('SELECT 1');
    console.log('✅ Conexión BD OK');

    console.log(`📥 Descargando /tecnologia/ para ${date}...`);
    const rows = await fetchGSCData(auth, date);
    console.log(`📊 Filas descargadas: ${rows.length}`);

    if (rows.length === 0) { console.log('⚠️  Sin datos para esta fecha'); return; }

    await saveToDatabase(rows, date);
    console.log('✅ Ingesta completada');
  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    await pool.end();
  }
}

runIngestion();

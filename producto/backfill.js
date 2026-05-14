require('dotenv').config();
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

function getDatesRange(daysBack) {
  const dates = [];
  for (let i = daysBack; i >= 2; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().split('T')[0]);
  }
  return dates;
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

function shouldExclude(page, position) {
  if (page.includes('/listas/')) return true;
  if (page.includes('/search')) return true;
  if (page.includes('.html')) return true;
  if (position > 20) return true;
  return false;
}

async function saveDay(rows, date) {
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

        if (shouldExclude(page, row.position)) {
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

  console.log(`  ✅ ${date}: ${inserted} insertadas, ${excluded} excluidas`);
  return inserted;
}

async function run() {
  const auth = new google.auth.GoogleAuth({
    keyFile: './credentials.json',
    scopes: ['https://www.googleapis.com/auth/webmasters.readonly']
  });
  const authClient = await auth.getClient();
  console.log('GSC autenticado ✅');

  const dates = getDatesRange(60);
  console.log(`Cargando ${dates.length} días: ${dates[0]} → ${dates[dates.length - 1]}\n`);

  let totalInserted = 0;
  for (const date of dates) {
    process.stdout.write(`📥 ${date}... `);
    const rows = await fetchGSCDay(authClient, date);
    if (rows.length === 0) { console.log('sin datos'); continue; }
    const inserted = await saveDay(rows, date);
    totalInserted += inserted;
    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`\n✅ Backfill completo: ${totalInserted} filas totales`);
  await pool.end();
}

run().catch(err => {
  console.error('❌', err.message);
  process.exit(1);
});

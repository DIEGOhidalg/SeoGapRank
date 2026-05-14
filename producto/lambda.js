const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const { google } = require('googleapis');
const { Pool } = require('pg');

const smClient = new SecretsManagerClient({ region: 'us-east-2' });

async function getSecret(secretId) {
  const cmd = new GetSecretValueCommand({ SecretId: secretId });
  const res = await smClient.send(cmd);
  return JSON.parse(res.SecretString);
}

function getYesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}

// Descarga datos de GSC para UN día específico
// startDate = endDate = mismo día → GSC devuelve datos de ese día solamente
async function fetchGSCDay(auth, date, rowLimit = 25000) {
  const sc = google.searchconsole({ version: 'v1', auth });
  const rows = [];
  let startRow = 0;

  while (true) {
    const res = await sc.searchanalytics.query({
      siteUrl: 'https://www.paris.cl/',
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
    if (data.length < rowLimit) break;
    startRow += rowLimit;
  }

  return rows;
}

function shouldExclude(page) {
  return page.includes('/listas/') ||
         page.includes('/search') ||
         page.includes('.html');
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
        const [query, page, device] = row.keys;

        if (shouldExclude(page)) {
          excluded++;
          continue;
        }

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
  }

  console.log(`✅ ${date}: ${inserted} insertadas, ${excluded} excluidas`);
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

    // Un día por ejecución — ayer, o fecha manual si se pasa en el evento
    const date = event.date || getYesterday();
    console.log(`Descargando /tecnologia/ para: ${date}`);

    const rows = await fetchGSCDay(authClient, date);
    console.log(`Filas descargadas: ${rows.length}`);

    if (rows.length === 0) {
      return { statusCode: 200, body: `Sin datos para ${date}` };
    }

    const inserted = await saveToDatabase(pool, rows, date);

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

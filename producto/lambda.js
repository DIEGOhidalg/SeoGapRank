// lambda.js — Función AWS Lambda GAPRANK — descarga 1 día por ejecución
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const { google } = require('googleapis');
const { Pool } = require('pg');

const smClient = new SecretsManagerClient({ region: 'us-east-2' });

async function getSecret(secretId) {
  const cmd = new GetSecretValueCommand({ SecretId: secretId });
  const res = await smClient.send(cmd);
  return JSON.parse(res.SecretString);
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
    console.log(`Fetched ${rows.length} rows (startRow: ${startRow})`);

    if (data.length < rowLimit) break;
    startRow += rowLimit;
  }

  return rows;
}

async function saveToDatabase(pool, rows, date) {
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

    console.log(`Insertadas ${inserted} de ${rows.length} filas...`);
  }

  return inserted;
}

exports.handler = async (event) => {
  let pool;

  try {
    // 1. Leer secretos
    console.log('Leyendo credenciales...');
    const secret = await getSecret('gaprank/credentials');

    // 2. Conexión RDS
    console.log('Conectando a RDS...');
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

    // 3. Autenticación GSC
    console.log('Autenticando GSC...');
    const gscKey = typeof secret.GSC_CREDENTIALS === 'string'
      ? JSON.parse(secret.GSC_CREDENTIALS)
      : secret.GSC_CREDENTIALS;

    const auth = new google.auth.GoogleAuth({
      credentials: gscKey,
      scopes: ['https://www.googleapis.com/auth/webmasters.readonly']
    });
    const authClient = await auth.getClient();
    console.log('GSC OK — cuenta:', gscKey.client_email);

    // 4. Fecha a descargar — ayer por defecto, o fecha específica si se pasa en el evento
    const date = event.date || getYesterday();
    console.log(`Descargando datos de /tecnologia/ para: ${date}`);

    // 5. Descargar datos del día
    const rows = await fetchGSCData(authClient, date);
    console.log(`Total filas: ${rows.length}`);

    if (rows.length === 0) {
      return { statusCode: 200, body: `Sin datos para ${date}` };
    }

    // 6. Guardar en BD
    const inserted = await saveToDatabase(pool, rows, date);

    return {
      statusCode: 200,
      body: `OK: ${inserted} filas insertadas para ${date}`
    };

  } catch (err) {
    console.error('ERROR:', err.message);
    return { statusCode: 500, body: err.message };
  } finally {
    if (pool) await pool.end();
  }
};
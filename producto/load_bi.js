// load_bi.js — F1-08 v2: Carga BI por SUBCATEGORÍA → url_catalog
// Uso: node load_bi.js
// Requiere: npm install pg papaparse dotenv
//
// Credenciales: define DB_PASSWORD (y opcionalmente el resto) en un archivo .env
// GITIGNORED, o expórtalas antes de correr. NO las hardcodees aquí.
//   PowerShell:  $env:DB_PASSWORD="..."   ; node load_bi.js
//   o .env:      DB_PASSWORD=...

require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const Papa = require('papaparse');
const path = require('path');

const DB = {
  host: process.env.DB_HOST || 'gaprank-db.cl0ykwguiwcz.us-east-2.rds.amazonaws.com',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'gaprank',
  user: process.env.DB_USER || 'gaprank_admin',
  password: process.env.DB_PASSWORD,
  ssl: { rejectUnauthorized: false }
};

if (!DB.password) {
  console.error('❌ Falta DB_PASSWORD. Defínela como variable de entorno o en un .env gitignored.');
  process.exit(1);
}

const pool = new Pool(DB);

// Departamentos "blandos" (ropa, moda, calzado, belleza)
const BLANDOS = ['mujer', 'hombre', 'ninos', 'zapatos', 'belleza', 'deportes', 'outlet', 'regalos'];

// Derivar depto (seg.1) y subcat (seg.2) desde el page_url
const SQL_DEPT = `lower(split_part(split_part(page_url, '.cl/', 2), '/', 1))`;
const SQL_SUB  = `lower(split_part(split_part(page_url, '.cl/', 2), '/', 2))`;

async function loadBI() {
  console.log('🚀 F1-08 v2 — Carga BI por subcategoría');

  // 1) Leer y parsear CSV
  const csvPath = path.join(__dirname, 'bi_data.csv');
  const { data } = Papa.parse(fs.readFileSync(csvPath, 'utf8'), {
    header: true, skipEmptyLines: true, dynamicTyping: true
  });
  console.log(`📊 Filas en CSV: ${data.length}`);

  // 2) Mapa por (departamento, subcategoría) + agregados para fallback
  const subMap = {};    // 'dept|sub' -> { conversion_rate, avg_ticket }
  const deptAgg = {};   // 'dept'     -> { tc_sum, ticket_sum, n }
  let siteTc = 0, siteTicket = 0, siteN = 0;

  for (const row of data) {
    const dept = (row['group_.one'] || '').toString().toLowerCase().trim();
    const sub  = (row['group_.two'] || '').toString().toLowerCase().trim();
    const tc = parseFloat(row['tasa_conversion']) || 0;
    const ticket = parseFloat(row['Ticket Promedio']) || 0;

    // Descartar basura: sin_path, vacíos, http/?, métricas en cero
    if (!dept || !sub) continue;
    if (dept.startsWith('sin_path') || dept.startsWith('http') || dept.startsWith('?')) continue;
    if (tc <= 0 || ticket <= 0) continue;

    subMap[`${dept}|${sub}`] = { conversion_rate: tc, avg_ticket: Math.round(ticket) };

    deptAgg[dept] = deptAgg[dept] || { tc_sum: 0, ticket_sum: 0, n: 0 };
    deptAgg[dept].tc_sum += tc; deptAgg[dept].ticket_sum += ticket; deptAgg[dept].n++;

    siteTc += tc; siteTicket += ticket; siteN++;
  }

  // Fallbacks: promedio por departamento y promedio del sitio
  const deptFallback = {};
  for (const [dept, v] of Object.entries(deptAgg)) {
    deptFallback[dept] = {
      conversion_rate: v.tc_sum / v.n,
      avg_ticket: Math.round(v.ticket_sum / v.n)
    };
  }
  const siteFallback = {
    conversion_rate: siteN ? siteTc / siteN : 0.002,
    avg_ticket: siteN ? Math.round(siteTicket / siteN) : 80000
  };

  console.log(`📋 Pares (depto,subcat) válidos: ${Object.keys(subMap).length}`);
  console.log(`📋 Departamentos con fallback:   ${Object.keys(deptFallback).length}`);
  console.log(`📋 Fallback sitio: ${(siteFallback.conversion_rate * 100).toFixed(3)}% / $${siteFallback.avg_ticket.toLocaleString('es-CL')}`);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 3) Limpiar taxonomía: poblar department y category_l1 desde la URL
    const clean = await client.query(`
      UPDATE url_catalog
      SET department = ${SQL_DEPT}, category_l1 = ${SQL_SUB}
      WHERE page_url LIKE '%.cl/%'
    `);
    console.log(`🧹 Taxonomía limpiada desde URL: ${clean.rowCount} filas`);

    // 4) Reset de conv/ticket para recargar limpio
    await client.query(`UPDATE url_catalog SET conversion_rate = NULL, avg_ticket = NULL`);

    // 5) Fase 1 — match exacto por subcategoría
    let n1 = 0;
    for (const [key, v] of Object.entries(subMap)) {
      const [dept, sub] = key.split('|');
      const res = await client.query(`
        UPDATE url_catalog
        SET conversion_rate = $1, avg_ticket = $2, is_blando = $3, updated_at = NOW()
        WHERE department = $4 AND category_l1 = $5 AND conversion_rate IS NULL
      `, [v.conversion_rate, v.avg_ticket, BLANDOS.includes(dept), dept, sub]);
      n1 += res.rowCount;
    }
    console.log(`✅ Fase 1 (subcategoría exacta): ${n1} URLs`);

    // 6) Fase 2 — fallback por departamento
    let n2 = 0;
    for (const [dept, v] of Object.entries(deptFallback)) {
      const res = await client.query(`
        UPDATE url_catalog
        SET conversion_rate = $1, avg_ticket = $2, is_blando = $3, updated_at = NOW()
        WHERE department = $4 AND conversion_rate IS NULL
      `, [v.conversion_rate, v.avg_ticket, BLANDOS.includes(dept), dept]);
      n2 += res.rowCount;
    }
    console.log(`✅ Fase 2 (fallback departamento): ${n2} URLs`);

    // 7) Fase 3 — fallback sitio (todo lo que quedó sin match)
    const res3 = await client.query(`
      UPDATE url_catalog
      SET conversion_rate = $1, avg_ticket = $2, updated_at = NOW()
      WHERE conversion_rate IS NULL
    `, [siteFallback.conversion_rate, siteFallback.avg_ticket]);
    console.log(`✅ Fase 3 (fallback sitio): ${res3.rowCount} URLs`);

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error, rollback:', err.message);
    throw err;
  } finally {
    client.release();
  }

  // 8) Verificación — tecnología por subcategoría (muestra dato real vs fallback)
  const check = await pool.query(`
    SELECT category_l1,
           COUNT(*) AS urls,
           ROUND(AVG(conversion_rate) * 100, 3) AS conv_pct,
           ROUND(AVG(avg_ticket))::bigint AS ticket
    FROM url_catalog
    WHERE department = 'tecnologia' AND conversion_rate > 0
    GROUP BY category_l1
    ORDER BY urls DESC
    LIMIT 25
  `);
  console.log('\n📊 Verificación — tecnología por subcategoría:');
  console.log('─'.repeat(70));
  console.log(`${'Subcategoría'.padEnd(28)} ${'URLs'.padEnd(6)} ${'Conv%'.padEnd(8)} Ticket`);
  console.log('─'.repeat(70));
  for (const r of check.rows) {
    console.log(`${(r.category_l1 || '(sin)').padEnd(28)} ${String(r.urls).padEnd(6)} ${String(r.conv_pct).padEnd(8)}% $${Number(r.ticket).toLocaleString('es-CL')}`);
  }

  await pool.end();
  console.log('\n✅ F1-08 v2 completado');
}

loadBI().catch(err => { console.error('❌ Fatal:', err.message); process.exit(1); });

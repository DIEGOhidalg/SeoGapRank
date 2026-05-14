// load_bi.js — F1-08: Carga datos BI estáticos → url_catalog
// Uso: node load_bi.js
// Requiere: npm install pg papaparse

process.env.DB_HOST = 'gaprank-db-v2.cl0ykwguiwcz.us-east-2.rds.amazonaws.com';
process.env.DB_PORT = '5432';
process.env.DB_NAME = 'gaprank';
process.env.DB_USER = 'gaprank_admin';
process.env.DB_PASSWORD = '';
const { Pool } = require('pg');
const fs = require('fs');
const Papa = require('papaparse');
const path = require('path');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: { rejectUnauthorized: false }
});

// Departamentos blandos (ropa, moda, calzado, belleza)
const BLANDOS = ['mujer', 'hombre', 'ninos', 'zapatos', 'belleza', 'deportes', 'outlet', 'regalos'];

async function loadBI() {
  console.log('🚀 Iniciando carga de datos BI...');

  // Leer CSV
  const csvPath = path.join(__dirname, 'bi_data.csv');
  const csvContent = fs.readFileSync(csvPath, 'utf8');

  const { data } = Papa.parse(csvContent, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: true
  });

  console.log(`📊 Filas en CSV: ${data.length}`);

  // Agrupar por departamento (group_.one) — promediar conversion y ticket
  const deptMap = {};

  for (const row of data) {
    const dept = (row['group_.one'] || '').toString().toLowerCase().trim();
    const tc = parseFloat(row['tasa_conversion']) || 0;
    const ticket = parseFloat(row['Ticket Promedio']) || 0;

    // Ignorar filas con datos inválidos o departamentos sucios
    if (!dept || dept.startsWith('?') || dept.startsWith('http') || tc === 0 || ticket === 0) continue;

    if (!deptMap[dept]) {
      deptMap[dept] = { tc_sum: 0, ticket_sum: 0, count: 0 };
    }
    deptMap[dept].tc_sum += tc;
    deptMap[dept].ticket_sum += ticket;
    deptMap[dept].count++;
  }

  // Calcular promedios por departamento
  const deptAverages = {};
  for (const [dept, vals] of Object.entries(deptMap)) {
    deptAverages[dept] = {
      conversion_rate: vals.tc_sum / vals.count,
      avg_ticket: Math.round(vals.ticket_sum / vals.count),
      is_blando: BLANDOS.includes(dept)
    };
  }

  console.log('\n📋 Promedios por departamento:');
  console.log('─'.repeat(65));
  console.log(`${'Departamento'.padEnd(20)} ${'Conv. Rate'.padEnd(12)} ${'Ticket Prom'.padEnd(15)} Blando`);
  console.log('─'.repeat(65));
  for (const [dept, vals] of Object.entries(deptAverages)) {
    console.log(
      `${dept.padEnd(20)} ${(vals.conversion_rate * 100).toFixed(3).padEnd(12)}% ${'$' + vals.avg_ticket.toLocaleString('es-CL').padEnd(14)} ${vals.is_blando ? 'Sí' : 'No'}`
    );
  }
  console.log('─'.repeat(65));

  // Actualizar url_catalog
  console.log('\n💾 Actualizando url_catalog...');
  let updated = 0;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const [dept, vals] of Object.entries(deptAverages)) {
      const result = await client.query(`
        UPDATE url_catalog
        SET 
          conversion_rate = $1,
          avg_ticket = $2,
          is_blando = $3,
          updated_at = NOW()
        WHERE department = $4
      `, [vals.conversion_rate, vals.avg_ticket, vals.is_blando, dept]);

      updated += result.rowCount;
      console.log(`  ✓ ${dept}: ${result.rowCount} URLs actualizadas`);
    }

    await client.query('COMMIT');
    console.log(`\n✅ Total: ${updated} URLs actualizadas con datos BI`);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error:', err.message);
    throw err;
  } finally {
    client.release();
  }

  // Verificación final
  const check = await pool.query(`
    SELECT 
      department,
      COUNT(*) as urls,
      AVG(conversion_rate)::numeric(6,4) as avg_tc,
      AVG(avg_ticket)::bigint as avg_ticket
    FROM url_catalog
    WHERE conversion_rate IS NOT NULL AND conversion_rate > 0
    GROUP BY department
    ORDER BY urls DESC
    LIMIT 15
  `);

  console.log('\n📊 Verificación — url_catalog con datos BI:');
  console.log('─'.repeat(60));
  console.log(`${'Departamento'.padEnd(20)} ${'URLs'.padEnd(8)} ${'Conv%'.padEnd(10)} Ticket`);
  console.log('─'.repeat(60));
  for (const row of check.rows) {
    console.log(
      `${row.department.padEnd(20)} ${row.urls.toString().padEnd(8)} ${(row.avg_tc * 100).toFixed(3).padEnd(10)}% $${parseInt(row.avg_ticket).toLocaleString('es-CL')}`
    );
  }

  await pool.end();
  console.log('\n✅ F1-08 completado');
}

loadBI().catch(err => {
  console.error('❌ Error fatal:', err.message);
  process.exit(1);
});

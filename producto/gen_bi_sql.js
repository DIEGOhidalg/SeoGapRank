// gen_bi_sql.js — Genera load_bi.sql SIN conectarse a la BD.
// Uso:   node gen_bi_sql.js
// Luego: abre load_bi.sql, copia todo, y pégalo en psql (CloudShell).
// Requiere: npm install papaparse   (ya lo tienes)

const fs = require('fs');
const Papa = require('papaparse');
const path = require('path');

const BLANDOS = ['mujer', 'hombre', 'ninos', 'zapatos', 'belleza', 'deportes', 'outlet', 'regalos'];
const q = s => `'${String(s).replace(/'/g, "''")}'`;  // escapa comillas simples

const { data } = Papa.parse(
  fs.readFileSync(path.join(__dirname, 'bi_data.csv'), 'utf8'),
  { header: true, skipEmptyLines: true, dynamicTyping: true }
);
console.log(`📊 Filas CSV: ${data.length}`);

const subMap = {};   // 'dept|sub' -> { cr, ticket }
const deptAgg = {};  // 'dept'     -> { tc, tk, n }
let siteTc = 0, siteTicket = 0, siteN = 0;

for (const row of data) {
  const dept = (row['group_.one'] || '').toString().toLowerCase().trim();
  const sub  = (row['group_.two'] || '').toString().toLowerCase().trim();
  const tc = parseFloat(row['tasa_conversion']) || 0;
  const ticket = parseFloat(row['Ticket Promedio']) || 0;

  if (!dept || !sub) continue;
  if (dept.startsWith('sin_path') || dept.startsWith('http') || dept.startsWith('?')) continue;
  if (tc <= 0 || ticket <= 0) continue;

  subMap[`${dept}|${sub}`] = { cr: tc, ticket: Math.round(ticket) };
  deptAgg[dept] = deptAgg[dept] || { tc: 0, tk: 0, n: 0 };
  deptAgg[dept].tc += tc; deptAgg[dept].tk += ticket; deptAgg[dept].n++;
  siteTc += tc; siteTicket += ticket; siteN++;
}

const siteCr = (siteTc / siteN).toFixed(6);
const siteTk = Math.round(siteTicket / siteN);

let sql = 'BEGIN;\n\n';

sql += '-- 1. Limpiar taxonomia desde la URL (mata el department sucio)\n';
sql += 'UPDATE url_catalog\n';
sql += "SET department  = lower(split_part(split_part(page_url, '.cl/', 2), '/', 1)),\n";
sql += "    category_l1 = lower(split_part(split_part(page_url, '.cl/', 2), '/', 2))\n";
sql += "WHERE page_url LIKE '%.cl/%';\n\n";

sql += '-- 2. Reset conversion/ticket para recargar limpio\n';
sql += 'UPDATE url_catalog SET conversion_rate = NULL, avg_ticket = NULL;\n\n';

sql += '-- 3. Match exacto por subcategoria\n';
sql += 'CREATE TEMP TABLE bi_sub (dept text, sub text, cr numeric, ticket bigint, blando boolean) ON COMMIT DROP;\n';
sql += 'INSERT INTO bi_sub (dept, sub, cr, ticket, blando) VALUES\n';
sql += Object.entries(subMap).map(([k, v]) => {
  const [dept, sub] = k.split('|');
  return `(${q(dept)}, ${q(sub)}, ${v.cr}, ${v.ticket}, ${BLANDOS.includes(dept)})`;
}).join(',\n') + ';\n';
sql += 'UPDATE url_catalog u SET conversion_rate=b.cr, avg_ticket=b.ticket, is_blando=b.blando, updated_at=NOW()\n';
sql += 'FROM bi_sub b WHERE u.department=b.dept AND u.category_l1=b.sub AND u.conversion_rate IS NULL;\n\n';

sql += '-- 4. Fallback por departamento\n';
sql += 'CREATE TEMP TABLE bi_dept (dept text, cr numeric, ticket bigint, blando boolean) ON COMMIT DROP;\n';
sql += 'INSERT INTO bi_dept (dept, cr, ticket, blando) VALUES\n';
sql += Object.entries(deptAgg).map(([dept, v]) => {
  const cr = (v.tc / v.n).toFixed(6);
  const tk = Math.round(v.tk / v.n);
  return `(${q(dept)}, ${cr}, ${tk}, ${BLANDOS.includes(dept)})`;
}).join(',\n') + ';\n';
sql += 'UPDATE url_catalog u SET conversion_rate=b.cr, avg_ticket=b.ticket, is_blando=b.blando, updated_at=NOW()\n';
sql += 'FROM bi_dept b WHERE u.department=b.dept AND u.conversion_rate IS NULL;\n\n';

sql += '-- 5. Fallback sitio\n';
sql += `UPDATE url_catalog SET conversion_rate=${siteCr}, avg_ticket=${siteTk}, updated_at=NOW()\n`;
sql += 'WHERE conversion_rate IS NULL;\n\n';

sql += 'COMMIT;\n';

fs.writeFileSync(path.join(__dirname, 'load_bi.sql'), sql, 'utf8');
console.log(`✅ load_bi.sql generado`);
console.log(`   ${Object.keys(subMap).length} subcategorias, ${Object.keys(deptAgg).length} departamentos`);
console.log(`   Fallback sitio: ${siteCr} / $${siteTk.toLocaleString('es-CL')}`);

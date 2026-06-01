# GAPRANK v2.0 — Sistema de Detección de Oportunidades SEO
**Paris.cl · Diego Pablo Hidalgo Alvear · Analista Programador · DUOC UC**

---

## ¿Qué es GAPRANK?

GAPRANK es un sistema automatizado que detecta diariamente qué keywords de paris.cl están perdiendo clics y cuánto revenue potencial representa cada oportunidad en pesos chilenos. Ordena las oportunidades por CLP recuperables para que el equipo SEO sepa exactamente dónde actuar primero.

**El problema que resuelve:** sin este sistema, el equipo SEO trabajaba ~8 horas semanales en análisis manuales sin priorización económica. Con GAPRANK, cada mañana a las 6 AM hay una lista ordenada de oportunidades con revenue estimado en CLP y acción SEO recomendada por keyword.

**Resultado actual (2026-05-28):**
- 473 keywords analizadas en /tecnologia/
- Revenue potencial total: **$30.4M CLP/mes**
- Top oportunidad: **ipad** → $2.090.500 CLP/mes (pos 7.8, acción: BOTH)
- Pipeline completo en ~2.7 segundos

---

## Stack tecnológico

| Capa | Tecnología | Dónde corre |
|---|---|---|
| Ingesta datos | Google Search Console API v1 | AWS Lambda |
| Base de datos | PostgreSQL 17 | AWS RDS db.t3.micro |
| Scoring | Stored Procedures SQL | RDS |
| Orquestación | EventBridge Scheduler (cron 6 AM) | AWS |
| Secretos | AWS Secrets Manager | AWS |
| Frontend | Next.js 14 + TypeScript | Vercel |
| API | Next.js API Routes | Vercel |

---

## Estructura del repositorio

```
gaprank-pipeline/
├── producto/               ← Pipeline AWS Lambda
│   ├── lambda.js           ← Handler principal (orquesta el flujo completo)
│   ├── ingest.js           ← Ingesta manual local
│   ├── backfill.js         ← Carga histórica 60 días
│   ├── load_bi.js          ← Carga datos BI estáticos (trimestral)
│   ├── bi_data.csv         ← CSV conversión + ticket por departamento (BI)
│   └── package.json
│
└── dashboard/              ← Frontend Next.js + API
    ├── app/
    │   ├── page.tsx        ← Dashboard principal (vista Gerencia + Equipo SEO)
    │   ├── layout.tsx
    │   ├── globals.css
    │   └── api/
    │       ├── kpis/route.ts          ← GET /api/kpis
    │       └── opportunities/route.ts ← GET /api/opportunities
    ├── components/
    │   ├── KPICards.tsx
    │   ├── Top5List.tsx
    │   ├── DistributionChart.tsx
    │   ├── RevenueBarChart.tsx
    │   ├── OpportunitiesTable.tsx
    │   └── FactorBadge.tsx
    ├── lib/
    │   └── db.ts           ← Cliente PostgreSQL
    └── package.json
```

---

## Flujo diario automático (6 AM)

```
EventBridge Scheduler (cron)
        ↓
    lambda.js
        ↓
GSC API /tecnologia/ → descarga queries, páginas, clics, impresiones, CTR, posición
        ↓
gsc_daily           → INSERT ~473 filas · ~170 excluidas (branded + páginas)
        ↓
keyword_gaps        → INSERT desde gsc_daily con agency_factor = NONE inicial
        ↓
F2-02: calculate_ctr_gap_and_delta_clicks()
    → ctr_expected, ctr_gap, pos_target, ctr_target_adjusted, delta_clicks
        ↓
F2-03: calculate_revenue()
    → conversion_rate, avg_ticket, revenue_final (CLP)
        ↓
F2-05: classify_agency_factor()
    → agency_factor = CONTENT | BOTH | LINK_BUILDING | NONE
        ↓
F2-04: calculate_opportunity_score()
    → opportunity_score normalizado 0–100
        ↓
Dashboard Next.js   → visualización en tiempo real via API Routes
```

---

## Filtros aplicados en ingesta

**Páginas excluidas:**
- URLs con `/listas/`, `/search`, `.html`
- Posición > 20

**Keywords branded excluidas** (tabla `branded_terms` en PostgreSQL):
- Variantes de "paris": paris, pari, parisi, parissi, paris.cl, tienda paris
- Competidores: ripley, falabella, sodimac, hites

> Para agregar un término branded: `INSERT INTO branded_terms (term, note) VALUES ('nuevo', 'descripción');`
> Se aplica automáticamente sin tocar código.

---

## Modelo de scoring — Opportunity Score v2.0

### Paso 1 — CTR gap (F2-02)
```
ctr_gap = MAX(ctr_expected - ctr_actual, 0)
```

### Paso 2 — Clics incrementales proyectados (F2-02)
```
delta_clicks = impressions × (ctr_target_adjusted - ctr_actual)
ctr_target_adjusted = ctr_curve(pos_target) × agency_ctr_boost
```

### Paso 3 — Revenue incremental en CLP (F2-03)
```
revenue_final = delta_clicks × conversion_rate × avg_ticket
```

### Paso 4 — Opportunity Score normalizado (F2-04)
```
score_bruto = revenue_final × success_probability × position_gap_weight
opportunity_score = (score_bruto / max_score_dia) × 100
```

---

## Factor Agencia (agency_factor)

Clasificación automática por reglas (F2-05):

| Regla | Condición | Factor |
|---|---|---|
| 1 | CTR actual < 50% CTR esperado Y posición ≤ 5 | `CONTENT` |
| 2 | Posición > 10 Y impresiones > 1.000/mes | `LINK_BUILDING` |
| 3 | Posición 6–10 Y CTR actual < CTR esperado | `BOTH` |
| 4 | Posición ≤ 5 Y CTR actual < CTR esperado | `CONTENT` |
| 5 | Impresiones < 200 | `NONE` |

---

## Dashboard

El dashboard tiene dos vistas accesibles desde el toggle superior:

**Vista Gerencia:**
- 4 KPIs: revenue potencial total, keywords analizadas, con oportunidad activa, top oportunidad
- Top 5 oportunidades del día con barras de revenue
- Gráfico donut de distribución por agency_factor
- Bar chart de revenue potencial top 10 keywords

**Vista Equipo SEO:**
- Tabla completa con todas las columnas técnicas
- Filtros por factor, posición máxima y revenue mínimo
- Ordenamiento por cualquier columna
- Paginación con 10 filas por página
- Exportación CSV

---

## API endpoints

### `GET /api/kpis`
Devuelve KPIs del día más reciente.

```json
{
  "date": "2026-05-28",
  "total_keywords": 473,
  "with_opportunity": 149,
  "total_revenue": 30358500,
  "distribution": { "BOTH": 116, "CONTENT": 33, "LINK_BUILDING": 0, "NONE": 324 },
  "top_opportunity": { "query": "ipad", "revenue_final": "2090500" }
}
```

### `GET /api/opportunities`
Devuelve oportunidades con filtros, ordenamiento y paginación.

| Parámetro | Descripción | Default |
|---|---|---|
| `factor` | Filtrar por agency_factor | — |
| `maxPos` | Posición máxima | — |
| `minRevenue` | Revenue mínimo CLP | 0 |
| `sortKey` | Columna de ordenamiento | opportunity_score |
| `sortDir` | ASC o DESC | DESC |
| `page` | Página | 1 |
| `pageSize` | Filas por página | 10 |

---

## Schema de base de datos

### Tablas principales

| Tabla | Descripción |
|---|---|
| `gsc_daily` | Datos crudos diarios de GSC |
| `keyword_gaps` | Oportunidades con scoring completo |
| `ctr_curve` | Curva CTR unificada (posiciones 1–20) |
| `agency_factor_params` | Parámetros configurables por acción SEO |
| `branded_terms` | Términos branded excluidos del scoring |
| `url_catalog` | URLs con datos BI: conversión y ticket |

---

## Estado del proyecto

### ✅ Completado — Fase 1 (Semanas 1–2)
- Infraestructura AWS: RDS PostgreSQL, Lambda, EventBridge, Secrets Manager
- Pipeline ingesta GSC API → PostgreSQL
- Schema completo de base de datos
- Backfill histórico 60 días
- Carga datos BI estáticos

### ✅ Completado — Fase 2 (Semanas 3–5)
- Curva CTR unificada (`ctr_curve`)
- Tabla `branded_terms` + función `is_branded()`
- **F2-02** `calculate_ctr_gap_and_delta_clicks()`
- **F2-03** `calculate_revenue()` — revenue en CLP
- **F2-05** `classify_agency_factor()` — clasificación automática
- **F2-04** `calculate_opportunity_score()` — score 0–100
- Lambda automático end-to-end en ~2.7 segundos

**Top 5 oportunidades validadas (2026-05-28):**

| Score | Query | Pos | Revenue CLP | Factor |
|---|---|---|---|---|
| 100.0 | ipad | 7.77 | $2.090.500 | BOTH |
| 62.8 | iphone | 6.14 | $1.313.500 | BOTH |
| 62.6 | apple | 6.26 | $1.308.875 | BOTH |
| 62.0 | samsung | 7.76 | $1.295.000 | BOTH |
| 52.0 | celulares en oferta | 8.19 | $1.086.875 | BOTH |

### ✅ Completado — Fase 3 (Semanas 6–8)
- Dashboard Next.js 14 + TypeScript
- API Routes conectadas a PostgreSQL
- Vista Gerencia: KPIs, Top 5, donut chart, bar chart
- Vista Equipo SEO: tabla completa, filtros, paginación, export CSV
- Deploy en Vercel

### 🔜 Fase 4 (Semanas 9–10)
- Alertas email/Slack para gaps críticos
- Vista comparativa año anterior
- Exportación Excel

### 🔜 Fase 5 — Go-Live (Semanas 11–12)
- Demo con gerencia SEO
- Proceso operativo documentado
- Primeras optimizaciones ejecutadas

---

## Cómo ejecutar localmente

### Pipeline Lambda
```bash
cd producto
node ingest.js 2026-05-01   # ingesta manual
node backfill.js             # backfill 60 días
node load_bi.js              # actualizar datos BI
```

### Dashboard
```bash
cd dashboard
npm install
npm run dev                  # http://localhost:3000
```

---

## Variables de entorno

### `producto/` — `.env`
```
DB_HOST=gaprank-db-v2.cl0ykwguiwcz.us-east-2.rds.amazonaws.com
DB_PORT=5432
DB_NAME=gaprank
DB_USER=gaprank_admin
DB_PASSWORD=<contraseña>
GSC_KEY_FILE=./credentials.json
```

### `dashboard/` — `.env.local`
```
DB_HOST=gaprank-db-v2.cl0ykwguiwcz.us-east-2.rds.amazonaws.com
DB_PORT=5432
DB_NAME=gaprank
DB_USER=gaprank_admin
DB_PASSWORD=<contraseña>
```

---

## Costo estimado Año 1

| Período | Costo mensual |
|---|---|
| Meses 1–3 (desarrollo MVP) | ~$28–38 USD/mes |
| Meses 4–6 (producción inicial) | ~$57–82 USD/mes |
| Meses 7–12 (operación estable) | ~$45–70 USD/mes |
| **Total Año 1** | **~$480–720 USD** |

ROI conservador: **>3.700x** el costo AWS mensual.

---

*GAPRANK v2.0 — Paris.cl — Mayo 2026*
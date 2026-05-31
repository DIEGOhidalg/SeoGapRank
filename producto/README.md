# GAPRANK v2.0 — Sistema de Detección de Oportunidades SEO
**Paris.cl · Diego Pablo Hidalgo Alvear · Analista Programador · DUOC UC**

---

## ¿Qué es GAPRANK?

GAPRANK es un sistema automatizado que detecta diariamente qué keywords de paris.cl están perdiendo clics y cuánto revenue potencial representa cada oportunidad en pesos chilenos. Ordena las oportunidades por CLP recuperables para que el equipo SEO sepa exactamente dónde actuar primero.

**El problema que resuelve:** sin este sistema, el equipo SEO trabajaba ~8 horas semanales en análisis manuales sin priorización económica. Con GAPRANK, cada mañana a las 6 AM hay una lista ordenada de oportunidades con revenue estimado en CLP y acción SEO recomendada por keyword.

**Resultado actual (2026-05-28):**
- 473 keywords analizadas en /tecnologia/
- Top oportunidad: **ipad** → $2.090.500 CLP/mes potencial (pos 7.8, acción: BOTH)
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
| Frontend (próximo) | Next.js + Tailwind | Vercel |

---

## Archivos del proyecto

| Archivo | Qué hace |
|---|---|
| `lambda.js` | Handler principal de AWS Lambda. Orquesta el flujo completo diario |
| `ingest.js` | Ingesta manual local. `node ingest.js` o `node ingest.js 2026-05-01` |
| `backfill.js` | Carga histórica 60 días. Se ejecuta una sola vez al iniciar |
| `load_bi.js` | Carga datos BI estáticos (conversión + ticket) al `url_catalog`. Trimestral |
| `credentials.json` | Service Account Google Cloud para GSC API. **Nunca al repositorio** |
| `bi_data.csv` | CSV con tasas de conversión y ticket promedio por departamento (BI) |
| `package.json` | Dependencias Node.js |

---

## Flujo diario automático (6 AM)

```
EventBridge Scheduler (cron)
        ↓
    lambda.js
        ↓
GSC API /tecnologia/ → descarga queries, páginas, clics, impresiones, CTR, posición
        ↓
gsc_daily           → INSERT 473 filas · 170 excluidas (branded + páginas no relevantes)
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
`ctr_expected` viene de `ctr_curve` — curva unificada calibrada con datos reales de paris.cl (todos los dispositivos).

### Paso 2 — Clics incrementales proyectados (F2-02)
```
delta_clicks = impressions × (ctr_target_adjusted - ctr_actual)
ctr_target_adjusted = ctr_curve(pos_target) × agency_ctr_boost
```

### Paso 3 — Revenue incremental en CLP (F2-03)
```
revenue_final = delta_clicks × conversion_rate × avg_ticket
```
`conversion_rate` y `avg_ticket` desde `url_catalog` (datos BI estáticos).

### Paso 4 — Opportunity Score normalizado (F2-04)
```
score_bruto = revenue_final × success_probability × position_gap_weight
opportunity_score = (score_bruto / max_score_dia) × 100
```
`position_gap_weight`: 1.0 para pos ≤6 · 0.8 para pos 7–10 · 0.5 para pos 11–20

---

## Factor Agencia (agency_factor)

Clasificación automática por reglas (F2-05), aplicadas en orden de prioridad:

| Regla | Condición | Factor asignado |
|---|---|---|
| 1 | CTR actual < 50% CTR esperado Y posición ≤ 5 | `CONTENT` |
| 2 | Posición > 10 Y impresiones > 1.000/mes | `LINK_BUILDING` |
| 3 | Posición 6–10 Y CTR actual < CTR esperado | `BOTH` |
| 4 | Posición ≤ 5 Y CTR actual < CTR esperado | `CONTENT` |
| 5 | Impresiones < 200 | `NONE` |

Parámetros de impacto por factor:

| Factor | CTR boost | Mejora posición | P(éxito) | Tiempo |
|---|---|---|---|---|
| `NONE` | ×1.00 | — | 0% | — |
| `CONTENT` | ×1.20 | −2.5 pos | 65% | 2–6 sem |
| `LINK_BUILDING` | ×1.10 | −5.5 pos | 55% | 8–16 sem |
| `BOTH` | ×1.35 | −7.5 pos | 75% | 4–12 sem |

---

## Schema de base de datos

### `gsc_daily`
Datos crudos diarios de Google Search Console.
```
date, query, page, clicks, impressions, ctr, position
UNIQUE(date, query, page)
```

### `keyword_gaps`
Oportunidades procesadas con scoring completo. Se regenera diariamente.
```
date, query, page_url, impressions, avg_position, ctr_actual,
ctr_expected, ctr_gap, pos_target, ctr_target, ctr_target_adjusted,
delta_clicks, conversion_rate, avg_ticket, agency_factor,
revenue_final, opportunity_score
UNIQUE(date, query, page_url)
```

### `ctr_curve`
Curva CTR unificada calibrada de paris.cl (posiciones 1–20, todos los dispositivos).
```
position, ctr_low, ctr_mid, ctr_high, color_zone
```

### `agency_factor_params`
Parámetros configurables por tipo de acción SEO.
```
factor_name, ctr_boost, pos_delta, success_prob, impact_weeks_min, impact_weeks_max
```

### `branded_terms`
Lista centralizada de términos branded excluidos del scoring.
```
term, note
```

### `url_catalog`
Catálogo de URLs con datos BI: conversión y ticket promedio por departamento.
```
page_url, department, is_blando, conversion_rate, avg_ticket
```

---

## Estado del proyecto

### ✅ Completado — Fase 1 (Semanas 1–2)
- Infraestructura AWS: RDS PostgreSQL, Lambda, EventBridge, Secrets Manager
- Pipeline ingesta GSC API → PostgreSQL (`gsc_daily`)
- Schema completo de base de datos
- Backfill histórico 60 días
- Carga datos BI estáticos (`url_catalog`)
- Filtros branded y de página en ingesta

### ✅ Completado — Fase 2 (Semanas 3–5)
- Curva CTR unificada (`ctr_curve`) — sin separación mobile/desktop
- Tabla `branded_terms` + función `is_branded()` centralizada
- Tabla `agency_factor_params` con parámetros configurables
- `lookup_ctr()` y `get_target_position()` — funciones SQL auxiliares
- **F2-02** `calculate_ctr_gap_and_delta_clicks()` — CTR gap y clics proyectados
- **F2-03** `calculate_revenue()` — revenue incremental en CLP
- **F2-05** `classify_agency_factor()` — clasificación automática por reglas
- **F2-04** `calculate_opportunity_score()` — score normalizado 0–100
- UNIQUE constraint en `keyword_gaps(date, query, page_url)`
- Lambda automático end-to-end en ~2.7 segundos

**Resultado validado 2026-05-28:**

| Score | Query | Pos | Δ Clics | Revenue CLP | Factor |
|---|---|---|---|---|---|
| 100.0 | ipad | 7.77 | 452 | $2.090.500 | BOTH |
| 62.8 | iphone | 6.14 | 284 | $1.313.500 | BOTH |
| 62.6 | apple | 6.26 | 283 | $1.308.875 | BOTH |
| 62.0 | samsung | 7.76 | 280 | $1.295.000 | BOTH |
| 52.0 | celulares en oferta | 8.19 | 235 | $1.086.875 | BOTH |

### ⏳ Pendiente — Fase 3 (Semanas 6–8)
- Dashboard Next.js con tabla de oportunidades
- Filtros por departamento, agency_factor, revenue mínimo
- KPIs: total oportunidades, revenue potencial agregado, distribución por factor
- API REST Node.js + Express (ECS Fargate)
- Deploy en Vercel

### 🔜 Fase 4 (Semanas 9–10)
- Alertas email/Slack para gaps críticos
- Vista comparativa año anterior
- Exportación CSV/Excel

### 🔜 Fase 5 — Go-Live (Semanas 11–12)
- Demo con gerencia SEO
- Proceso operativo documentado
- Primeras optimizaciones ejecutadas con el sistema

---

## Cómo ejecutar localmente

```bash
# Ingesta manual de un día
node ingest.js 2026-05-01

# Backfill histórico 60 días
node backfill.js

# Actualizar datos BI (trimestral)
node load_bi.js

# Calibrar curva CTR (cada 8 semanas)
node calibrate_ctr_curve.js          # preview
node calibrate_ctr_curve.js --apply  # aplica cambios
```

---

## Variables de entorno

En `.env` para desarrollo local. En producción Lambda las lee desde AWS Secrets Manager (`gaprank/credentials`).

```
DB_HOST=gaprank-db-v2.cl0ykwguiwcz.us-east-2.rds.amazonaws.com
DB_PORT=5432
DB_NAME=gaprank
DB_USER=gaprank_admin
DB_PASSWORD=<desde Secrets Manager>
GSC_PROPERTY=https://www.paris.cl/
GSC_KEY_FILE=./credentials.json
```

---

## Costo estimado Año 1

| Período | Costo mensual |
|---|---|
| Meses 1–3 (desarrollo MVP) | ~$28–38 USD/mes |
| Meses 4–6 (producción inicial) | ~$57–82 USD/mes |
| Meses 7–12 (operación estable) | ~$45–70 USD/mes |
| **Total Año 1** | **~$480–720 USD** |

ROI conservador: **>3.700x** el costo AWS mensual al recuperar el 10% del tráfico orgánico perdido.

---

*GAPRANK v2.0 — Paris.cl — Mayo 2026*
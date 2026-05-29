# GAPRANK v2.0 — Sistema de Detección de Oportunidades SEO
**Paris.cl · Diego Pablo Hidalgo Alvear · Analista Programador · DUOC UC**
 
---
 
## ¿Qué es GAPRANK?
 
GAPRANK es un sistema automatizado que detecta diariamente qué keywords de paris.cl están perdiendo clics y cuánto revenue potencial representa cada oportunidad. Ordena las oportunidades por pesos chilenos recuperables para que el equipo SEO sepa exactamente dónde actuar primero.
 
**El problema que resuelve:** sin este sistema, el equipo SEO trabajaba ~8 horas semanales en análisis manuales sin priorización económica. Con GAPRANK, cada mañana hay una lista ordenada de oportunidades con revenue estimado en CLP y acción recomendada por tipo de intervención SEO.
 
---
 
## Stack tecnológico
 
| Capa | Tecnología | Dónde corre |
|---|---|---|
| Ingesta datos | Google Search Console API v1 | AWS Lambda |
| Base de datos | PostgreSQL 15 | AWS RDS db.t3.micro |
| Scoring | Stored Procedures SQL | RDS |
| Orquestación | EventBridge Scheduler (cron 6 AM) | AWS |
| Secretos | AWS Secrets Manager | AWS |
| Frontend (próximo) | Next.js + Tailwind | Vercel |
 
---
 
## Archivos del proyecto
 
| Archivo | Qué hace |
|---|---|
| `lambda.js` | Handler principal de AWS Lambda. Orquesta el flujo completo: GSC → gsc_daily → keyword_gaps → scoring |
| `ingest.js` | Ingesta manual local. Uso: `node ingest.js` o `node ingest.js 2026-05-01` para fecha específica |
| `backfill.js` | Carga histórica de los últimos 60 días. Se ejecuta una sola vez al iniciar el proyecto |
| `load_bi.js` | Carga datos de BI estáticos (conversión + ticket promedio) al `url_catalog`. Ejecutar trimestralmente |
| `credentials.json` | Service Account de Google Cloud para autenticarse con GSC API. **No va al repositorio** |
| `bi_data.csv` | CSV con tasas de conversión y ticket promedio por departamento, entregado por equipo BI |
| `package.json` | Dependencias Node.js del proyecto |
 
---
 
## Flujo diario automático (6 AM)
 
```
EventBridge (cron)
      ↓
  lambda.js
      ↓
GSC API → descarga queries/páginas/clics/impresiones/CTR/posición de /tecnologia/
      ↓
  gsc_daily (tabla PostgreSQL)
  477 filas/día aprox. · 149 excluidas (branded + páginas no relevantes)
      ↓
  keyword_gaps (tabla PostgreSQL)
  INSERT desde gsc_daily con agency_factor = 'NONE' inicial
      ↓
  SP calculate_ctr_gap_and_delta_clicks()
  Calcula CTR gap y clics incrementales proyectados por keyword
      ↓
  keyword_gaps actualizada con ctr_expected, ctr_gap, delta_clicks
```
 
---
 
## Filtros aplicados en ingesta
 
**Páginas excluidas:**
- URLs que contienen `/listas/`
- URLs que contienen `/search`
- URLs que contienen `.html`
- Posición > 20
**Keywords branded excluidas** (tabla `branded_terms` en PostgreSQL):
- Variantes de "paris": paris, pari, parisi, parissi, paris.cl, tienda paris
- Competidores: ripley, falabella, sodimac, hites
> Para agregar un término branded nuevo: `INSERT INTO branded_terms (term, note) VALUES ('nuevo', 'descripción');`
> El filtro se aplica automáticamente desde la próxima ejecución — sin tocar código.
 
---
 
## Modelo de scoring — Opportunity Score v2.0
 
El score usa un modelo multiplicativo en 4 pasos. Si cualquier factor es cero, el score es cero.
 
### Paso 1 — CTR gap
```
ctr_gap = MAX(ctr_expected - ctr_actual, 0)
```
`ctr_expected` viene de la tabla `ctr_curve` — una curva calibrada con datos reales de paris.cl (todos los dispositivos combinados).
 
### Paso 2 — Clics incrementales proyectados
```
delta_clicks = impressions × (ctr_target_adjusted - ctr_actual)
```
Donde `ctr_target_adjusted = ctr_curve(pos_target) × agency_ctr_boost`
 
### Paso 3 — Revenue incremental en CLP *(pendiente F2-03)*
```
revenue_final = delta_clicks × conversion_rate × avg_ticket
```
`conversion_rate` y `avg_ticket` vienen del CSV de BI estático cargado en `url_catalog`.
 
### Paso 4 — Opportunity Score normalizado *(pendiente F2-04)*
```
opportunity_score = revenue_final × success_probability × position_gap_weight
```
Normalizado a escala 0–100 con min-max sobre el dataset del día.
 
---
 
## Factor Agencia (agency_factor)
 
Define qué tipo de intervención SEO se planifica para cada keyword. Modifica el CTR objetivo y la probabilidad de éxito del scoring.
 
| Valor | Acción | CTR boost | Mejora posición | P(éxito) | Tiempo |
|---|---|---|---|---|---|
| `NONE` | Sin intervención | ×1.00 | — | 0% | — |
| `CONTENT` | Optimizar títulos, H1, meta | ×1.20 | −2.5 pos | 65% | 2–6 sem |
| `LINK_BUILDING` | Adquirir enlaces | ×1.10 | −5.5 pos | 55% | 8–16 sem |
| `BOTH` | Contenido + Link Building | ×1.35 | −7.5 pos | 75% | 4–12 sem |
 
Actualmente todas las keywords entran con `NONE`. Las reglas automáticas de clasificación se implementan en **F2-05**.
 
---
 
## Schema de base de datos — tablas principales
 
### `gsc_daily`
Datos crudos diarios de Google Search Console.
```
date, query, page, clicks, impressions, ctr, position
```
 
### `keyword_gaps`
Oportunidades procesadas con scoring. Se regenera diariamente.
```
date, query, page_url, impressions, avg_position, ctr_actual,
ctr_expected, ctr_gap, pos_target, ctr_target, ctr_target_adjusted,
delta_clicks, conversion_rate, avg_ticket, agency_factor,
revenue_final, opportunity_score, recommendation, impact_weeks
```
 
### `ctr_curve`
Curva CTR calibrada de paris.cl (posiciones 1–20, todos los dispositivos).
```
position, ctr_low, ctr_mid, ctr_high, color_zone
```
 
### `agency_factor_params`
Parámetros configurables por tipo de acción SEO.
```
factor_name, ctr_boost, pos_delta, success_prob, impact_weeks_min, impact_weeks_max
```
 
### `branded_terms`
Lista centralizada de términos branded a excluir del scoring.
```
term, note
```
 
### `url_catalog`
Catálogo de URLs con datos de BI: conversión y ticket promedio por departamento.
```
page_url, department, is_blando, conversion_rate, avg_ticket
```
 
---
 
## Estado del proyecto
 
### ✅ Completado
 
**Fase 1 — Setup AWS + Ingesta GSC (Semanas 1–2)**
- Infraestructura AWS: RDS PostgreSQL, Lambda, EventBridge, Secrets Manager
- Pipeline de ingesta GSC API → PostgreSQL
- Schema de base de datos completo
- Backfill histórico 60 días
- Carga de datos BI estáticos (url_catalog)
- Filtros branded y de página en ingesta
**Fase 2a — Curva CTR + Scoring base (Semanas 3–4)**
- Tabla `ctr_curve` con curva unificada calibrada (sin separación mobile/desktop)
- Tabla `branded_terms` con función `is_branded()` centralizada
- Tabla `agency_factor_params` con parámetros configurables
- Función `lookup_ctr()` — devuelve CTR esperado para cualquier posición
- Función `get_target_position()` — calcula posición objetivo según agency_factor
- Stored Procedure `calculate_ctr_gap_and_delta_clicks()` — Pasos 1 y 2 del modelo
- Lambda automático end-to-end: GSC → gsc_daily → keyword_gaps → scoring
### ⏳ En progreso — Fase 2b (Semana 5)
 
**F2-03 — Revenue incremental en CLP**
- Multiplicar `delta_clicks × conversion_rate × avg_ticket`
- Cada keyword tendrá un número como "$2.300.000 CLP/mes potencial"
- Lee datos de `url_catalog` (BI estático)
**F2-04 — Opportunity Score normalizado 0–100**
- Aplicar `success_probability` y `position_gap_weight` al revenue
- Normalizar con min-max sobre el dataset del día
- `revenue_final` ordena; `opportunity_score` es para la UI
**F2-05 — Reglas automáticas de agency_factor**
- Clasificar cada keyword automáticamente en CONTENT / LINK_BUILDING / BOTH / NONE
- 5 reglas en orden de prioridad según posición, CTR y volumen
- Overrides manuales del equipo SEO se preservan entre ejecuciones
**F2-06 — SP diario unificado**
- Consolidar F2-03 + F2-04 + F2-05 en un único stored procedure
- Lambda lo llama con una sola instrucción
**F2-07 — Validación con equipo SEO**
- Revisar top 20 oportunidades con el equipo
- Validar que las cifras de revenue tienen sentido
- Ajustar parámetros de `agency_factor_params` si es necesario
### 🔜 Próximas fases
 
**Fase 3 — Dashboard Next.js (Semanas 6–8)**
- Tabla de oportunidades con filtros por departamento, agency_factor, revenue
- KPIs: total oportunidades, revenue potencial agregado, distribución por factor
- Deploy en Vercel (plan Hobby gratuito)
**Fase 4 — Alertas + Comparativa (Semanas 9–10)**
- Alertas por email/Slack cuando aparece gap crítico (revenue > umbral)
- Vista comparativa año anterior
- Exportación CSV/Excel
**Fase 5 — Go-Live (Semanas 11–12)**
- Demo con gerencia SEO
- Proceso operativo documentado
- Primeras optimizaciones ejecutadas con el sistema
---
 
## Cómo ejecutar localmente
 
### Ingesta manual de un día específico
```bash
node ingest.js 2026-05-01
```
 
### Backfill histórico (60 días)
```bash
node backfill.js
```
 
### Actualizar datos BI (trimestral)
```bash
node load_bi.js
```
 
### Calibrar curva CTR (cada 8 semanas)
```bash
node calibrate_ctr_curve.js          # preview
node calibrate_ctr_curve.js --apply  # aplica cambios
```
 
---
 
## Variables de entorno
 
Definidas en `.env` para desarrollo local. En producción Lambda las lee desde AWS Secrets Manager (`gaprank/credentials`).
 
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
 
*GAPRANK v2.0 — Paris.cl — Abril 2026*
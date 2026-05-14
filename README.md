# GAPRANK v2.0 — Guía de Instalación y Uso
**Sistema de Detección de Oportunidades SEO — Paris.cl**
Diego Pablo Hidalgo Alvear · Analista Programador · DUOC UC · 2026

---

## Requisitos previos

Antes de comenzar, asegúrate de tener instalado:

- [Node.js 24](https://nodejs.org/) — verificar con `node --version`
- [AWS CLI](https://aws.amazon.com/cli/) — verificar con `aws --version`
- [Git](https://git-scm.com/) — verificar con `git --version`
- Acceso a la cuenta AWS de Cencosud SEO (us-east-2)
- Archivo `credentials.json` de Google Service Account (solicitar a Diego)
- Archivo `bi_data.csv` con datos de conversión y ticket de BI (solicitar a Diego)

---

## Instalación

### 1. Clonar el repositorio

```bash
git clone https://github.com/DIEGOhidalg/SeoGapRank.git
cd SeoGapRank/producto
```

### 2. Instalar dependencias

```bash
npm install
```

### 3. Agregar archivos sensibles

Copia los archivos que te enviará Diego a la carpeta `producto/`:

```
producto/
├── credentials.json   ← Service Account Google (no va en GitHub)
└── bi_data.csv        ← Datos BI Paris.cl (no va en GitHub)
```

### 4. Configurar AWS CLI

```bash
aws configure
```

Ingresa:
- AWS Access Key ID → solicitar a Diego
- AWS Secret Access Key → solicitar a Diego
- Default region → `us-east-2`
- Default output format → `json`

---

## Estructura del proyecto

```
producto/
├── lambda.js          → Función AWS Lambda (ingesta automática diaria)
├── ingest.js          → Script local para ingesta manual o backfill
├── load_bi.js         → Carga datos BI estáticos → base de datos
├── credentials.json   → Service Account Google GSC (NO subir a Git)
├── bi_data.csv        → Datos conversión y ticket BI (NO subir a Git)
├── package.json       → Dependencias Node.js
└── .gitignore         → Archivos excluidos de Git
```

---

## Uso

### Descargar datos de ayer (ejecución normal)

```bash
node ingest.js
```

### Descargar un día específico (backfill)

```bash
node ingest.js 2026-05-01
```

### Cargar datos BI a la base de datos

Solo necesario cuando BI entregue un nuevo CSV trimestral:

```bash
node load_bi.js
```

---

## Despliegue en AWS Lambda

Cuando se modifique `lambda.js`, subir a AWS:

```bash
# 1. Empaquetar
zip -r lambda_gaprank.zip lambda.js node_modules package.json

# 2. Subir a AWS
aws lambda update-function-code \
  --function-name gaprank-ingesta-diaria \
  --zip-file fileb://lambda_gaprank.zip \
  --region us-east-2
```

Luego en la consola AWS:
1. Ir a **Lambda → gaprank-ingesta-diaria**
2. Hacer clic en **Deploy**
3. Verificar con **Test** usando el evento `{"date": "YYYY-MM-DD"}`

---

## Infraestructura AWS

| Componente | Detalle |
|---|---|
| **Lambda** | gaprank-ingesta-diaria — Node.js 20 — 512 MB — 15 min timeout |
| **EventBridge** | Cron diario 06:00 AM Chile — `cron(0 9 * * ? *)` |
| **RDS PostgreSQL** | gaprank-db-v2 — db.t3.micro — us-east-2a |
| **Secrets Manager** | gaprank/credentials — DB_PASSWORD + GSC_CREDENTIALS |
| **Región** | us-east-2 (Ohio) |

---

## Base de datos

**Host:** `gaprank-db-v2.cl0ykwguiwcz.us-east-2.rds.amazonaws.com`
**Puerto:** `5432`
**Base de datos:** `gaprank`
**Usuario:** `gaprank_admin`

### Conectarse desde CloudShell (AWS)

```bash
psql -h gaprank-db-v2.cl0ykwguiwcz.us-east-2.rds.amazonaws.com \
     -U gaprank_admin -d gaprank -p 5432
```

### Tablas principales

| Tabla | Descripción |
|---|---|
| `gsc_daily` | Datos diarios GSC — query, page, clicks, impressions, ctr, position |
| `url_catalog` | Catálogo de URLs clasificadas con datos BI |
| `keyword_gaps` | Oportunidades calculadas con Opportunity Score (Fase 2) |
| `scoring_params` | Parámetros del modelo de scoring por agency_factor |

### Queries útiles

```sql
-- Ver últimas fechas cargadas
SELECT date, COUNT(*) as filas
FROM gsc_daily
GROUP BY date
ORDER BY date DESC
LIMIT 10;

-- Ver top 20 keywords /tecnologia/ por impresiones
SELECT query, page, impressions, clicks, position
FROM gsc_daily
WHERE date = CURRENT_DATE - 1
  AND page LIKE '%/tecnologia/%'
ORDER BY impressions DESC
LIMIT 20;

-- Verificar datos BI por departamento
SELECT department, 
  ROUND(conversion_rate * 100, 2) AS conv_pct,
  avg_ticket
FROM url_catalog
WHERE conversion_rate IS NOT NULL
GROUP BY department, conversion_rate, avg_ticket
ORDER BY avg_ticket DESC;
```

---

## Solución de problemas

| Error | Causa | Solución |
|---|---|---|
| `ETIMEDOUT` | Lambda dentro de VPC sin salida | Verificar que Lambda esté sin VPC |
| `credentials.json not found` | Archivo no copiado | Copiar credentials.json a la carpeta producto/ |
| `No such secret` | Secrets Manager mal configurado | Verificar nombre `gaprank/credentials` en AWS |
| `Sin datos para fecha` | GSC no tiene datos para ese día | Normal para fechas muy recientes — esperar 2 días |

---

## Contacto

**Diego Pablo Hidalgo Alvear**
Analista Programador — DUOC UC
diego.hidalgo@cencosud.cl

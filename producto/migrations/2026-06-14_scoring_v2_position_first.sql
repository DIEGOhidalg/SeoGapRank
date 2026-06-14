-- =====================================================================
-- Migración: Scoring v2.1 — modelo position-first
-- Fecha: 2026-06-14
-- Autor: Diego Hidalgo Alvear
--
-- Resumen de cambios:
--   1. La clasificación (classify_agency_factor) ahora corre ANTES de
--      calcular delta_clicks, dentro de calculate_ctr_gap_and_delta_clicks.
--      Antes corría después => el delta se calculaba con factor 'NONE' para
--      todo y la maquinaria de pos_target nunca se ejecutaba.
--   2. Bandas de clasificación contiguas (<=5 / 5-10 / >10): se elimina la
--      "zona muerta" en posiciones (5,6) que mandaba keywords válidas a NONE.
--   3. Factor agencia: boost de CTR solo para CONTENT; LINK_BUILDING y BOTH
--      ganan por salto de posición (ctr_boost = 1.0) => sin doble conteo.
--   4. get_target_position: CONTENT se mantiene en su posición; LINK/BOTH con
--      piso en pos.3 (no se promete top 1-2).
--   5. position_gap_weight alineado a la tabla documentada (pos 1-5 = 1.0).
--   6. NONE deja de generar delta/revenue (no es accionable).
--
-- Orden de ejecución del scoring tras esta migración:
--   calculate_ctr_gap_and_delta_clicks  (incluye classify)
--   -> calculate_revenue
--   -> calculate_opportunity_score
-- =====================================================================

BEGIN;

-- 1) Parámetros: boost de CTR solo para CONTENT --------------------------
UPDATE agency_factor_params SET ctr_boost = 1.0
WHERE factor_name IN ('LINK_BUILDING', 'BOTH');

-- 2) Posición objetivo por tipo de acción --------------------------------
CREATE OR REPLACE FUNCTION public.get_target_position(p_avg_position numeric, p_agency_factor text)
 RETURNS numeric LANGUAGE sql IMMUTABLE
AS $function$
    SELECT CASE p_agency_factor
        WHEN 'NONE'          THEN p_avg_position
        WHEN 'CONTENT'       THEN p_avg_position                       -- snippet, no mueve posición
        WHEN 'LINK_BUILDING' THEN GREATEST(p_avg_position - 5.5, 3.0)  -- piso pos.3
        WHEN 'BOTH'          THEN GREATEST(p_avg_position - 7.5, 3.0)  -- piso pos.3
        ELSE p_avg_position
    END;
$function$;

-- 3) Clasificación automática (bandas contiguas, position-first) ---------
CREATE OR REPLACE PROCEDURE public.classify_agency_factor(IN p_date date DEFAULT CURRENT_DATE)
 LANGUAGE plpgsql AS $procedure$
DECLARE v_rows INT; r RECORD;
BEGIN
    RAISE NOTICE 'F2-05 | Inicio clasificación | fecha: %', p_date;
    UPDATE keyword_gaps
    SET agency_factor = CASE
        WHEN impressions < 200                                THEN 'NONE'           -- sin demanda
        WHEN avg_position <= 5  AND ctr_actual < ctr_expected THEN 'CONTENT'        -- top, snippet bajo
        WHEN avg_position <= 5                                THEN 'NONE'           -- top, buen snippet
        WHEN avg_position <= 10 AND ctr_actual < ctr_expected THEN 'BOTH'           -- escalada + snippet bajo
        WHEN avg_position <= 10                               THEN 'LINK_BUILDING'  -- escalada, snippet ok
        WHEN impressions > 1000                               THEN 'LINK_BUILDING'  -- profunda (>10) con demanda
        ELSE 'NONE'
    END
    WHERE date = p_date AND NOT is_branded(query);
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    RAISE NOTICE 'F2-05 OK: % keywords clasificadas', v_rows;
    FOR r IN (SELECT agency_factor, COUNT(*) AS n FROM keyword_gaps
              WHERE date = p_date GROUP BY agency_factor ORDER BY n DESC) LOOP
        RAISE NOTICE '  %: % keywords', r.agency_factor, r.n;
    END LOOP;
END;
$procedure$;

-- 4) F2-02: diagnóstico -> clasificación -> proyección -------------------
CREATE OR REPLACE PROCEDURE public.calculate_ctr_gap_and_delta_clicks(IN p_date date DEFAULT CURRENT_DATE)
 LANGUAGE plpgsql AS $procedure$
DECLARE v_rows_updated INT; v_rows_branded INT; r RECORD;
BEGIN
    RAISE NOTICE 'F2-02 | Inicio | fecha: %', p_date;

    UPDATE keyword_gaps SET agency_factor = 'NONE', delta_clicks = 0, ctr_gap = 0
    WHERE date = p_date AND is_branded(query);
    GET DIAGNOSTICS v_rows_branded = ROW_COUNT;
    RAISE NOTICE 'Branded excluidas: %', v_rows_branded;

    -- Paso 1: diagnóstico en la posición ACTUAL
    UPDATE keyword_gaps kg
    SET ctr_expected = lookup_ctr(kg.avg_position),
        ctr_gap = GREATEST(lookup_ctr(kg.avg_position) - kg.ctr_actual, 0.0)
    WHERE kg.date = p_date AND NOT is_branded(kg.query);
    GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
    RAISE NOTICE 'Paso 1 OK: % con ctr_expected/ctr_gap', v_rows_updated;

    -- Paso 1.5: clasificar ANTES de proyectar
    CALL classify_agency_factor(p_date);

    -- Paso 2: proyección con el factor ya asignado
    UPDATE keyword_gaps kg
    SET pos_target = get_target_position(kg.avg_position, kg.agency_factor),
        ctr_target = lookup_ctr(get_target_position(kg.avg_position, kg.agency_factor)),
        ctr_target_adjusted = lookup_ctr(get_target_position(kg.avg_position, kg.agency_factor)) * af.ctr_boost,
        delta_clicks = GREATEST(
            ROUND(kg.impressions * (
                lookup_ctr(get_target_position(kg.avg_position, kg.agency_factor)) * af.ctr_boost
                - kg.ctr_actual))::INT, 0)
    FROM agency_factor_params af
    WHERE kg.date = p_date AND af.factor_name = kg.agency_factor AND NOT is_branded(kg.query);
    GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
    RAISE NOTICE 'Paso 2 OK: % con delta_clicks', v_rows_updated;

    -- NONE no es accionable: delta y revenue en cero
    UPDATE keyword_gaps SET delta_clicks = 0, revenue_final = 0
    WHERE date = p_date AND agency_factor = 'NONE' AND NOT is_branded(query);

    RAISE NOTICE 'F2-02 | Fin.';
END;
$procedure$;

-- 5) F2-04: opportunity_score (position_gap_weight pos.1-5 = 1.0) --------
CREATE OR REPLACE PROCEDURE public.calculate_opportunity_score(IN p_date date DEFAULT CURRENT_DATE)
 LANGUAGE plpgsql AS $procedure$
DECLARE v_rows INT; v_max_rev NUMERIC; r RECORD;
BEGIN
    RAISE NOTICE 'F2-04 | Inicio | fecha: %', p_date;
    UPDATE keyword_gaps kg
    SET opportunity_score = (
        kg.revenue_final::NUMERIC * af.success_prob::NUMERIC
        * CASE WHEN kg.avg_position <= 5 THEN 1.0
               WHEN kg.avg_position <= 10 THEN 0.8
               ELSE 0.5 END)
    FROM agency_factor_params af
    WHERE kg.date = p_date AND af.factor_name = kg.agency_factor
      AND kg.revenue_final IS NOT NULL AND NOT is_branded(kg.query);
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    RAISE NOTICE 'Paso 4a OK: % con score bruto', v_rows;

    SELECT MAX(opportunity_score) INTO v_max_rev FROM keyword_gaps
    WHERE date = p_date AND opportunity_score > 0;
    IF v_max_rev > 0 THEN
        UPDATE keyword_gaps SET opportunity_score = ROUND((opportunity_score::NUMERIC / v_max_rev::NUMERIC) * 100, 2)
        WHERE date = p_date AND opportunity_score IS NOT NULL;
        GET DIAGNOSTICS v_rows = ROW_COUNT;
        RAISE NOTICE 'Paso 4b OK: % normalizadas 0-100', v_rows;
    END IF;
    RAISE NOTICE 'F2-04 | Fin.';
END;
$procedure$;

COMMIT;

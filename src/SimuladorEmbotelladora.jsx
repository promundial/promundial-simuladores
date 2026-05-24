import { useState, useCallback, useMemo, useEffect } from "react";
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  Cell, ComposedChart,
} from "recharts";

// ═══════════════════════════════════════════════════════════════════
// CORE MATH
// ═══════════════════════════════════════════════════════════════════
function rNorm(mu, sigma) {
  let u = 0, v = 0;
  while (!u) u = Math.random();
  while (!v) v = Math.random();
  return mu + sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
const cl = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
// S(mean, cv, lo, hi) — cv = coefficient of variation
const S = (mu, cv, lo, hi) => cl(rNorm(mu, mu * cv), lo, hi);


// ═══════════════════════════════════════════════════════════════════
// MOTOR ESTADÍSTICO — usa sigma directo del usuario
// ═══════════════════════════════════════════════════════════════════
// Override S() to use absolute sigma (not cv): S2(mu, sigma, lo, hi)
const S2 = (mu, sigma, lo, hi) => {
  const s = Math.max(sigma, 0.0001);
  return cl(rNorm(mu, s), lo !== undefined ? lo : mu - 4*s, hi !== undefined ? hi : mu + 4*s);
};

// ─── Defaults: each param has _v (value) and _s (std dev) ──────────
const DEF = {
  // ── BLOQUE 0: DEMANDA & PRECIO ──────────────────────────────────────
  // Canales: moderno (supermercados), tradicional (tiendas), institucional
  vol_moderno_v:18,    vol_moderno_s:2.5,     // M cajas/año canal moderno
  vol_tradicional_v:20,vol_tradicional_s:3.0,  // M cajas/año canal tradicional
  vol_institucional_v:7,vol_institucional_s:1.5,// M cajas/año canal institucional
  precio_moderno_v:9.20, precio_moderno_s:0.50, // USD/caja canal moderno
  precio_tradicional_v:7.80,precio_tradicional_s:0.45,
  precio_institucional_v:7.20,precio_institucional_s:0.60,
  // Descuentos por canal (% sobre precio lista)
  desc_moderno_v:0.05,    desc_moderno_s:0.01,      // 5% desc. canal moderno
  desc_tradicional_v:0.12,desc_tradicional_s:0.02,  // 12% desc. canal tradicional
  desc_institucional_v:0.18,desc_institucional_s:0.03,// 18% desc. canal institucional
  // Elasticidad precio-demanda por canal (negativa: sube precio → baja vol)
  elast_moderno_v:-1.2,  elast_moderno_s:0.20,
  elast_tradicional_v:-0.9,elast_tradicional_s:0.15,
  elast_institucional_v:-0.6,elast_institucional_s:0.15,
  // Estacionalidad — índices mensuales (promedio = 1.0)
  est_ene_v:0.82, est_feb_v:0.85, est_mar_v:0.92, est_abr_v:0.95,
  est_may_v:1.05, est_jun_v:1.15, est_jul_v:1.20, est_ago_v:1.18,
  est_sep_v:1.10, est_oct_v:1.05, est_nov_v:0.95, est_dic_v:0.98,
  // Crecimiento de demanda
  crecimiento_anual_v:0.05, crecimiento_anual_s:0.015, // tasa anual
  // Año de proyección (1=año 1, 2=año 2...)
  año_proyeccion_v:1,
  // ── BLOQUE 1: PRODUCCIÓN ──────────────────────────────────────────
  nLines_v:3,         nLines_s:0,
  vel_teorica_v:1800, vel_teorica_s:0,       // cj/h (capacidad instalada — fija)
  vel_real_v:1530,    vel_real_s:80,          // cj/h
  horas_año_v:7200,   horas_año_s:150,
  // Mantenimiento
  mtto_prog_h_v:480,  mtto_prog_h_s:40,
  mtto_noprog_h_v:120,mtto_noprog_h_s:40,
  mtbf_v:180,         mtbf_s:25,
  mttr_v:3,           mttr_s:0.8,
  oee_qual_v:0.97,    oee_qual_s:0.012,
  // Scrap / Pack / Calidad
  scrap_pct_v:0.018,  scrap_pct_s:0.003,
  overpack_pct_v:0.012,overpack_pct_s:0.003,
  underpack_pct_v:0.004,underpack_pct_s:0.001,
  cpk_v:1.45,         cpk_s:0.15,
  dev_rate_v:0.008,   dev_rate_s:0.002,
  lotes_rech_v:0.012, lotes_rech_s:0.004,
  // SKU / Cambios
  n_skus_v:12,        n_skus_s:0,
  tam_lote_prom_v:1800,tam_lote_prom_s:300,
  t_cambio_min_v:45,  t_cambio_min_s:10,
  // MO & Energía
  operarios_line_v:8, operarios_line_s:1,
  costo_mo_h_v:14,    costo_mo_h_s:1.5,
  hl_x_caja_v:0.05678,hl_x_caja_s:0.002,
  kwh_x_hl_v:14,      kwh_x_hl_s:2,
  costo_kwh_v:0.12,   costo_kwh_s:0.015,
  agua_x_hl_v:2.8,    agua_x_hl_s:0.4,
  co2_x_hl_v:6.5,     co2_x_hl_s:0.8,

  // ── BLOQUE 2: CADENA DE DISTRIBUCIÓN ─────────────────────────────
  // T1
  n_camiones_t1_v:8,  n_camiones_t1_s:0,
  cap_t1_v:1200,      cap_t1_s:50,
  km_t1_v:180,        km_t1_s:20,
  vel_t1_v:60,        vel_t1_s:6,
  t_carga_t1_v:60,    t_carga_t1_s:10,
  t_descarga_t1_v:45, t_descarga_t1_s:8,
  rend_comb_t1_v:17.0,rend_comb_t1_s:1.5,   // km/gal
  // T2
  n_vehiculos_v:22,   n_vehiculos_s:0,
  cap_t2_v:350,       cap_t2_s:20,
  cap_carga_veh_v:550,cap_carga_veh_s:30,
  drop_size_v:140,    drop_size_s:30,
  km_entrega_v:90,    km_entrega_s:15,
  vel_veh_v:35,       vel_veh_s:5,
  horas_dist_v:9,     horas_dist_s:0.5,
  rend_comb_t2_v:26.5,rend_comb_t2_s:3,     // km/gal
  precio_diesel_v:4.16,precio_diesel_s:0.40, // USD/gal
  t_carga_veh_min_v:35,t_carga_veh_min_s:6,
  t_descarga_pdv_min_v:12,t_descarga_pdv_min_s:3,
  // CEDIS Transferencias
  n_cedis_v:4,        n_cedis_s:0,
  pct_vol_transfer_v:0.08,pct_vol_transfer_s:0.02,
  km_cedis_cedis_v:140,km_cedis_cedis_s:30,
  // Fill rate / OTIF / CF
  fill_rate_v:0.97,   fill_rate_s:0.015,
  otif_v:0.95,        otif_s:0.020,
  inv_rot_v:18,       inv_rot_s:2.5,
  temp_excur_v:0.008, temp_excur_s:0.003,
  costo_cf_caja_v:0.28,costo_cf_caja_s:0.04,
  dias_inv_cedis_v:4, dias_inv_cedis_s:1,

  // ── BLOQUE 3: VENTAS & MARKETING ─────────────────────────────────
  n_vendedores_v:35,  n_vendedores_s:0,
  n_pdvs_v:4200,      n_pdvs_s:0,
  h_trabajo_dia_v:8,  h_trabajo_dia_s:0.3,
  t_atencion_min_v:12,t_atencion_min_s:2,
  t_desp_min_v:8,     t_desp_min_s:2,
  frec_visita_sem_v:2,frec_visita_sem_s:0.3,
  ticket_prom_v:180,  ticket_prom_s:25,
  dias_lab_año_v:240, dias_lab_año_s:5,
  costo_vendedor_mes_v:1400,costo_vendedor_mes_s:150,
  costo_pop_pdv_v:28, costo_pop_pdv_s:6,
  presup_mktg_pct_v:0.03,presup_mktg_pct_s:0.005,

  // ── BLOQUE 4: ALMACÉN ────────────────────────────────────────────
  posiciones_cd_v:3200,posiciones_cd_s:0,
  cj_x_pallet_v:80,  cj_x_pallet_s:5,
  t_prep_pedido_min_v:18,t_prep_pedido_min_s:4,
  pallets_x_picker_h_v:14,pallets_x_picker_h_s:2,
  n_pickers_v:12,     n_pickers_s:0,
  n_montacargas_v:4,  n_montacargas_s:0,
  pct_ocup_cd_v:0.78, pct_ocup_cd_s:0.05,
  // Inventarios MP
  dias_inv_conc_v:14,     dias_inv_conc_s:2,
  lead_conc_v:10,         lead_conc_s:2,
  dias_inv_azucar_v:21,   dias_inv_azucar_s:3,
  lead_azucar_v:14,       lead_azucar_s:2,
  dias_inv_co2_v:7,       dias_inv_co2_s:1.5,
  lead_co2_v:5,           lead_co2_s:1,
  dias_inv_envret_v:15,   dias_inv_envret_s:3,
  dias_inv_envnret_v:20,  dias_inv_envnret_s:3,
  lead_envase_v:30,       lead_envase_s:5,
  dias_inv_tapas_v:20,    dias_inv_tapas_s:3,
  lead_tapas_v:14,        lead_tapas_s:2,
  dias_inv_etiq_v:15,     dias_inv_etiq_s:2,
  dias_inv_carton_v:18,   dias_inv_carton_s:3,
  dias_inv_stretch_v:7,   dias_inv_stretch_s:1.5,
  dias_inv_pallets_v:10,  dias_inv_pallets_s:2,
  dias_inv_esquin_v:5,    dias_inv_esquin_s:1,
  lead_emb_sec_v:14,      lead_emb_sec_s:3,
  pct_rotura_prov_v:0.05, pct_rotura_prov_s:0.015,

  // ── BLOQUE 5: FINANCIERO ─────────────────────────────────────────
  precio_v:8.20,      precio_s:0.60,
  mat_pct_v:0.38,     mat_pct_s:0.02,
  sga_pct_v:0.14,     sga_pct_s:0.01,
  capex_v:26,         capex_s:4,
  tax_v:0.30,         tax_s:0.02,
  wacc_v:0.10,        wacc_s:0.01,
  g_v:0.025,          g_s:0.005,
  wc_dias_v:35,       wc_dias_s:5,
};

// Build the "p" object that runSim expects from wizard params
function buildP(w) {
  return {
    nLines: Math.round(w.nLines_v), vel_teorica: w.vel_teorica_v,
    vel_real: w.vel_real_v, horas_año: w.horas_año_v,
    mtto_prog_h: w.mtto_prog_h_v, mtto_noprog_h: w.mtto_noprog_h_v,
    mtbf: w.mtbf_v, mttr: w.mttr_v, oee_qual: w.oee_qual_v,
    scrap_pct: w.scrap_pct_v, overpack_pct: w.overpack_pct_v,
    underpack_pct: w.underpack_pct_v, cpk: w.cpk_v,
    dev_rate: w.dev_rate_v, lotes_rech: w.lotes_rech_v,
    n_skus: Math.round(w.n_skus_v), tam_lote_prom: w.tam_lote_prom_v,
    t_cambio_min: w.t_cambio_min_v, operarios_line: Math.round(w.operarios_line_v),
    costo_mo_h: w.costo_mo_h_v, hl_x_caja: w.hl_x_caja_v,
    kwh_x_hl: w.kwh_x_hl_v, costo_kwh: w.costo_kwh_v,
    agua_x_hl: w.agua_x_hl_v, co2_x_hl: w.co2_x_hl_v,
    n_camiones_t1: Math.round(w.n_camiones_t1_v), cap_t1: w.cap_t1_v,
    km_t1: w.km_t1_v, vel_t1: w.vel_t1_v,
    t_carga_t1: w.t_carga_t1_v, t_descarga_t1: w.t_descarga_t1_v,
    rend_comb_t1: w.rend_comb_t1_v,
    n_vehiculos: Math.round(w.n_vehiculos_v), cap_t2: w.cap_t2_v,
    cap_carga_veh: w.cap_carga_veh_v, drop_size: w.drop_size_v,
    km_entrega: w.km_entrega_v, vel_veh: w.vel_veh_v,
    horas_dist: w.horas_dist_v, rend_comb_t2: w.rend_comb_t2_v,
    precio_diesel: w.precio_diesel_v,
    t_carga_veh_min: w.t_carga_veh_min_v, t_descarga_pdv_min: w.t_descarga_pdv_min_v,
    n_cedis: Math.round(w.n_cedis_v), pct_vol_transfer: w.pct_vol_transfer_v,
    km_cedis_cedis: w.km_cedis_cedis_v,
    fill_rate: w.fill_rate_v, otif: w.otif_v, inv_rot: w.inv_rot_v,
    temp_excur: w.temp_excur_v, costo_cf_caja: w.costo_cf_caja_v,
    dias_inv_cedis: w.dias_inv_cedis_v,
    n_vendedores: Math.round(w.n_vendedores_v), n_pdvs: Math.round(w.n_pdvs_v),
    h_trabajo_dia: w.h_trabajo_dia_v, t_atencion_min: w.t_atencion_min_v,
    t_desp_min: w.t_desp_min_v, frec_visita_sem: w.frec_visita_sem_v,
    ticket_prom: w.ticket_prom_v, dias_lab_año: w.dias_lab_año_v,
    costo_vendedor_mes: w.costo_vendedor_mes_v,
    costo_pop_pdv: w.costo_pop_pdv_v, presup_mktg_pct: w.presup_mktg_pct_v,
    posiciones_cd: Math.round(w.posiciones_cd_v), cj_x_pallet: w.cj_x_pallet_v,
    t_prep_pedido_min: w.t_prep_pedido_min_v, pallets_x_picker_h: w.pallets_x_picker_h_v,
    n_pickers: Math.round(w.n_pickers_v), n_montacargas: Math.round(w.n_montacargas_v),
    pct_ocup_cd: w.pct_ocup_cd_v,
    dias_inv_conc: w.dias_inv_conc_v, lead_conc: w.lead_conc_v,
    dias_inv_azucar: w.dias_inv_azucar_v, lead_azucar: w.lead_azucar_v,
    dias_inv_co2: w.dias_inv_co2_v, lead_co2: w.lead_co2_v,
    dias_inv_envret: w.dias_inv_envret_v, dias_inv_envnret: w.dias_inv_envnret_v,
    lead_envase: w.lead_envase_v, dias_inv_tapas: w.dias_inv_tapas_v,
    lead_tapas: w.lead_tapas_v, dias_inv_etiq: w.dias_inv_etiq_v,
    dias_inv_carton: w.dias_inv_carton_v,
    dias_inv_stretch: w.dias_inv_stretch_v, dias_inv_pallets: w.dias_inv_pallets_v,
    dias_inv_esquin: w.dias_inv_esquin_v, lead_emb_sec: w.lead_emb_sec_v,
    pct_rotura_prov: w.pct_rotura_prov_v,
    precio: w.precio_v, mat_pct: w.mat_pct_v, sga_pct: w.sga_pct_v,
    capex: w.capex_v, tax: w.tax_v, wacc: w.wacc_v,
    g: w.g_v, wc_dias: w.wc_dias_v,
  };
}

// ── Responsive hook ──────────────────────────────────────────────
function useBreakpoint() {
  const [bp, setBp] = useState(() => {
    if (typeof window === "undefined") return "md";
    const w = window.innerWidth;
    return w < 480 ? "xs" : w < 768 ? "sm" : w < 1024 ? "md" : "lg";
  });
  useEffect(() => {
    const handler = () => {
      const w = window.innerWidth;
      setBp(w < 480 ? "xs" : w < 768 ? "sm" : w < 1024 ? "md" : "lg");
    };
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  return bp;
}
// Responsive grid helper: cols(bp, xs, sm, md, lg)
const rcols = (bp, xs, sm, md, lg) =>
  bp==="xs"?`repeat(${xs},1fr)`:bp==="sm"?`repeat(${sm},1fr)`:bp==="md"?`repeat(${md},1fr)`:`repeat(${lg},1fr)`;

// ── Override runSim to use user-supplied sigma ────────────────────
function runSimW(w, N = 3000) {
  const res = [];
  const Sw = (key, lo, hi) => {
    const mu = w[key+'_v'], sig = w[key+'_s'] ?? 0;
    if (sig === 0) return mu;
    const v = rNorm(mu, sig);
    return lo !== undefined ? cl(v, lo, hi) : v;
  };
  for (let i = 0; i < N; i++) {
    // ── DEMANDA & PRECIO POR CANAL ────────────────────────────
    const vol_mod   = Sw('vol_moderno',       0.5, 200);   // M cj
    const vol_trad  = Sw('vol_tradicional',   0.5, 200);
    const vol_inst  = Sw('vol_institucional', 0.1, 100);
    const p_lista_mod  = Sw('precio_moderno',    3, 25);
    const p_lista_trad = Sw('precio_tradicional',3, 20);
    const p_lista_inst = Sw('precio_institucional',2,18);
    const desc_mod  = Sw('desc_moderno',     0, 0.40);
    const desc_trad = Sw('desc_tradicional', 0, 0.40);
    const desc_inst = Sw('desc_institucional',0,0.50);
    const p_mod     = p_lista_mod  * (1 - desc_mod);   // precio neto canal moderno
    const p_trad    = p_lista_trad * (1 - desc_trad);  // precio neto canal tradicional
    const p_inst    = p_lista_inst * (1 - desc_inst);  // precio neto canal institucional
    const e_mod     = Sw('elast_moderno',    -3, -0.1);
    const e_trad    = Sw('elast_tradicional',-3, -0.1);
    const e_inst    = Sw('elast_institucional',-3,-0.1);
    // Crecimiento acumulado al año proyectado
    const crec      = Sw('crecimiento_anual', -0.2, 0.50);
    const año       = Math.max(1, w.año_proyeccion_v||1);
    const factor_crec = Math.pow(1 + crec, año - 1);
    // Estacionalidad promedio anual (normalizada)
    const est_keys  = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
    const est_avg   = est_keys.reduce((s,k)=>s+(w[`est_${k}_v`]||1),0)/12;
    // Volumen demandado ajustado (M cajas)
    const vol_dem_mod  = vol_mod  * factor_crec * est_avg;
    const vol_dem_trad = vol_trad * factor_crec * est_avg;
    const vol_dem_inst = vol_inst * factor_crec * est_avg;
    const vol_demandado= (vol_dem_mod + vol_dem_trad + vol_dem_inst) * 1e6; // cj
    // Revenue ponderado por canal
    const rev_canal = (vol_dem_mod*p_mod + vol_dem_trad*p_trad + vol_dem_inst*p_inst); // M USD
    const precio_prom_canal = rev_canal / Math.max(vol_dem_mod+vol_dem_trad+vol_dem_inst, 0.001);
    // Mix canal
    const mix_moderno      = vol_dem_mod / Math.max(vol_dem_mod+vol_dem_trad+vol_dem_inst,0.001);
    const mix_tradicional  = vol_dem_trad/ Math.max(vol_dem_mod+vol_dem_trad+vol_dem_inst,0.001);
    const mix_institucional= vol_dem_inst/ Math.max(vol_dem_mod+vol_dem_trad+vol_dem_inst,0.001);

    // ── MANTENIMIENTO ──────────────────────────────────────────
    const mtto_prog_h   = Sw('mtto_prog_h',  20, 2000);
    const mtto_noprog_h = Sw('mtto_noprog_h', 0, 2000);
    const mtbf          = Sw('mtbf',  20, 800);
    const mttr          = Sw('mttr',   0.5, 48);
    const horas_año     = Sw('horas_año', 2000, 8760);
    const fallos_año    = horas_año / Math.max(mtbf, 1);
    const tiempo_paro   = mtto_prog_h + mtto_noprog_h + fallos_año * mttr;
    const disponibilidad= cl(1 - tiempo_paro / horas_año, 0.30, 0.99);
    // ── PLANTA ────────────────────────────────────────────────
    const vel_teorica   = w.vel_teorica_v;
    const vel_real      = Sw('vel_real', vel_teorica*0.4, vel_teorica*0.99);
    const rendimiento   = cl(vel_real / vel_teorica, 0.40, 0.99);
    const oee_cal       = Sw('oee_qual', 0.60, 0.999);
    const oee           = disponibilidad * rendimiento * oee_cal;
    const scrap_pct     = Sw('scrap_pct', 0.001, 0.10);
    const overpack_pct  = Sw('overpack_pct', 0, 0.08);
    const underpack_pct = Sw('underpack_pct', 0, 0.05);
    const vol_bruto     = vel_teorica * horas_año * oee;
    const vol_neto_total= vol_bruto * (1 - scrap_pct) * w.nLines_v;
    const cap_instalada = vel_teorica * horas_año * w.nLines_v;
    // SKU / Cambios
    const tam_lote      = Sw('tam_lote_prom', 100, 10000);
    const t_cambio_min  = Sw('t_cambio_min', 5, 480);
    const n_cambios_año = Math.max(1, Math.round(vol_neto_total / Math.max(tam_lote,1) * w.nLines_v));
    const h_cambios_año = (n_cambios_año * t_cambio_min) / 60;
    const pct_tiempo_cambios = cl(h_cambios_año / horas_año, 0, 0.50);
    // Energía
    const vol_hl        = vol_neto_total * w.hl_x_caja_v;
    const kwh_x_hl      = Sw('kwh_x_hl', 4, 50);
    const costo_kwh_r   = Sw('costo_kwh', 0.03, 0.50);
    const costo_energia = vol_hl * kwh_x_hl * costo_kwh_r;
    const agua_x_hl     = Sw('agua_x_hl', 1.0, 15);
    const co2_x_hl      = Sw('co2_x_hl', 1.0, 20);
    // MO
    const operarios     = w.operarios_line_v * w.nLines_v;
    const costo_mo_h    = Sw('costo_mo_h', 4, 60);
    const costo_mo      = operarios * horas_año * costo_mo_h;
    const productividad = vol_neto_total / Math.max(operarios * horas_año, 1);
    const cpk           = Sw('cpk', 0.5, 2.5);
    const dev_rate      = Sw('dev_rate', 0.001, 0.05);
    const lotes_rech    = Sw('lotes_rech', 0.001, 0.08);
    // ── T1 ────────────────────────────────────────────────────
    const cap_t1        = Sw('cap_t1', 200, 5000);
    const km_t1         = Sw('km_t1', 10, 1000);
    const vel_t1        = Sw('vel_t1', 30, 100);
    const t_carga_t1    = Sw('t_carga_t1', 15, 300);
    const t_desc_t1     = Sw('t_descarga_t1', 15, 240);
    const rend_t1_gal   = Sw('rend_comb_t1', 5, 50);
    const h_viaje_t1    = (km_t1*2/Math.max(vel_t1,1)) + (t_carga_t1+t_desc_t1)/60;
    const horas_dist    = Sw('horas_dist', 4, 16);
    const dias_lab_año  = Sw('dias_lab_año', 200, 260);
    const viajes_t1_dia = cl(Math.floor(horas_dist/Math.max(h_viaje_t1,0.5)),1,6);
    const cap_t1_año    = viajes_t1_dia * cap_t1 * w.n_camiones_t1_v;
    const precio_diesel = Sw('precio_diesel', 1.5, 12);
    const costo_comb_t1 = (km_t1*2*viajes_t1_dia*dias_lab_año*w.n_camiones_t1_v) / Math.max(rend_t1_gal/3.78541,0.1) * precio_diesel/3.78541;
    const turnaround_t1 = h_viaje_t1;
    // ── T2 ────────────────────────────────────────────────────
    const drop_size     = Sw('drop_size', 10, 800);
    const km_t2         = Sw('km_entrega', 10, 400);
    const vel_t2        = Sw('vel_veh', 15, 80);
    const t_desc_t2     = Sw('t_descarga_pdv_min', 3, 60);
    const rend_t2_gal   = Sw('rend_comb_t2', 8, 60);
    const t_carga_veh   = Sw('t_carga_veh_min', 10, 150);
    const pct_ocup_veh  = cl(rNorm(0.82,0.05),0.40,0.99);
    const pct_util_veh  = cl(rNorm(0.88,0.05),0.50,0.99);
    const n_pdvs_ruta   = Math.max(1, Math.round(drop_size/Math.max(drop_size/Math.max(w.n_pdvs_v,1)*50,1)));
    const h_ruta_t2     = (km_t2/Math.max(vel_t2,1)) + (n_pdvs_ruta*t_desc_t2)/60 + t_carga_veh/60;
    const viajes_t2_dia = cl(Math.floor(horas_dist/Math.max(h_ruta_t2,0.5)),1,5);
    const cap_t2_año    = viajes_t2_dia * drop_size * w.n_vehiculos_v * dias_lab_año * pct_util_veh;
    const costo_comb_t2 = (km_t2*viajes_t2_dia*dias_lab_año*w.n_vehiculos_v*pct_util_veh) / Math.max(rend_t2_gal/3.78541,0.1) * precio_diesel/3.78541;
    const turnaround_t2 = h_ruta_t2;
    const vol_dist_cap  = cap_t2_año;
    const pct_cap_dist  = cl(vol_dist_cap/Math.max(vol_neto_total,1),0,3);
    const gap_dist      = vol_dist_cap - vol_neto_total;
    const costo_log     = costo_comb_t2;
    const costo_log_caja= costo_log/Math.max(vol_neto_total,1);
    const n_entregas_dia= viajes_t2_dia;
    // CEDIS transfer
    const pct_vol_tr    = Sw('pct_vol_transfer',0.01,0.40);
    const km_cc         = Sw('km_cedis_cedis', 20, 800);
    const vol_transfer  = vol_neto_total * pct_vol_tr;
    const h_viaje_tr    = (km_cc*2/Math.max(vel_t1,1)) + (t_carga_t1+t_desc_t1)/60;
    const viajes_tr_dia = cl(Math.floor(horas_dist/Math.max(h_viaje_tr,0.5)),1,4);
    const n_cam_tr_req  = Math.ceil(vol_transfer/(viajes_tr_dia*dias_lab_año*Math.max(cap_t1,1)));
    const costo_transfer= vol_transfer*km_cc/(Math.max(rend_t1_gal/3.78541,0.1)*Math.max(cap_t1,1))*precio_diesel/3.78541/1e6;
    const turnaround_tr = h_viaje_tr;
    // CF / fill
    const fill_rate     = Sw('fill_rate', 0.70, 0.999);
    const otif          = Sw('otif', 0.70, 0.999);
    const inv_rot       = Sw('inv_rot', 4, 52);
    const temp_excur    = Sw('temp_excur', 0.001, 0.10);
    const dias_inv_r    = 365/Math.max(inv_rot,1);
    const costo_cf_caja = Sw('costo_cf_caja', 0.05, 1.50);
    const dias_inv_cedis= Sw('dias_inv_cedis', 1, 20);
    const stock_cedis   = (vol_neto_total/365)*dias_inv_cedis;
    const costo_cf      = vol_neto_total * costo_cf_caja / 1e6;
    // ── VENTAS / MKTG ─────────────────────────────────────────
    const t_aten        = Sw('t_atencion_min', 2, 60);
    const t_desp        = Sw('t_desp_min', 1, 40);
    const h_trab        = Sw('h_trabajo_dia', 5, 12);
    const visitas_dia   = Math.floor((h_trab*60)/Math.max(t_aten+t_desp,1));
    const frec_vis      = Sw('frec_visita_sem', 0.5, 7);
    const pdvs_x_vend   = Math.floor(visitas_dia*5/Math.max(frec_vis,0.5));
    const cap_pdvs      = pdvs_x_vend * w.n_vendedores_v;
    const gap_cob       = cap_pdvs - w.n_pdvs_v;
    const pct_cob       = cl(cap_pdvs/Math.max(w.n_pdvs_v,1),0,3);
    const ticket        = Sw('ticket_prom', 20, 2000);
    const ing_venta     = w.n_pdvs_v * frec_vis * 52 * ticket / 1e6;
    const costo_vend_mes= Sw('costo_vendedor_mes', 400, 8000);
    const costo_fv      = w.n_vendedores_v * costo_vend_mes * 12 / 1e6;
    const costo_pop_pdv = Sw('costo_pop_pdv', 2, 200);
    const costo_pop     = w.n_pdvs_v * costo_pop_pdv / 1e6;
    const presup_mktg   = Sw('presup_mktg_pct', 0.005, 0.15);
    const costo_mktg    = ing_venta * presup_mktg;
    // ── ALMACÉN ────────────────────────────────────────────────
    const cj_x_pallet   = Sw('cj_x_pallet', 20, 300);
    const pallets_inv   = (vol_neto_total/Math.max(inv_rot,1))/Math.max(cj_x_pallet,1);
    const pct_ocup_cd_r = cl(pallets_inv/Math.max(w.posiciones_cd_v,1),0,2);
    const gap_almacen   = w.posiciones_cd_v - pallets_inv;
    const t_prep        = Sw('t_prep_pedido_min', 2, 90);
    const n_ped_dia     = Math.ceil(vol_dist_cap/Math.max(dias_lab_año*drop_size,1));
    const h_prep_dia    = (n_ped_dia*t_prep)/60;
    const pickers_req   = Math.ceil(h_prep_dia/Math.max(h_trab*0.85,1));
    const gap_pickers   = w.n_pickers_v - pickers_req;
    const mtc_req       = Math.ceil((n_ped_dia*t_carga_veh/60)/Math.max(h_trab*0.80,1));
    const gap_mtc       = w.n_montacargas_v - mtc_req;
    const prod_mtc      = (pallets_inv*inv_rot)/Math.max(w.n_montacargas_v*dias_lab_año*h_trab,1);
    // ── INVENTARIOS MP ─────────────────────────────────────────
    const d_conc        = Sw('dias_inv_conc', 1, 60);
    const d_azucar      = Sw('dias_inv_azucar', 1, 90);
    const d_co2         = Sw('dias_inv_co2', 1, 45);
    const l_conc        = Sw('lead_conc', 1, 60);
    const l_azucar      = Sw('lead_azucar', 1, 45);
    const d_envret      = Sw('dias_inv_envret', 1, 60);
    const d_envnret     = Sw('dias_inv_envnret', 1, 90);
    const l_envase      = Sw('lead_envase', 5, 120);
    const d_tapas       = Sw('dias_inv_tapas', 1, 60);
    const d_etiq        = Sw('dias_inv_etiq', 1, 60);
    const d_carton      = Sw('dias_inv_carton', 1, 60);
    const d_stretch     = Sw('dias_inv_stretch', 1, 45);
    const d_pallets     = Sw('dias_inv_pallets', 1, 60);
    const d_esquin      = Sw('dias_inv_esquin', 1, 40);
    const l_emb_sec     = Sw('lead_emb_sec', 1, 60);
    const pct_rot_prov  = Sw('pct_rotura_prov', 0.001, 0.30);
    const precio_mp     = Sw('precio', 3, 20);
    const costo_mp_dia  = (vol_neto_total/365)*precio_mp*0.38/1e6;
    const inv_mp_total  = (d_conc+d_azucar+d_co2)*costo_mp_dia/3;
    const inv_emp_total = (d_envret+d_envnret+d_tapas+d_etiq+d_carton+d_stretch+d_pallets+d_esquin)*costo_mp_dia*0.6/8;
    const inv_total_mp  = inv_mp_total + inv_emp_total;
    const costo_fin_inv = inv_total_mp * 0.10;
    // ── P&L ────────────────────────────────────────────────────
    const mat_pct       = Sw('mat_pct', 0.15, 0.70);
    const sga_pct       = Sw('sga_pct', 0.04, 0.35);
    // Volume sold = min(production capacity, demand)
    const vol_vendido   = Math.min(vol_neto_total, vol_demandado); // cj
    const demanda_gap   = vol_demandado - vol_neto_total;          // >0 = demanda insatisfecha
    const pct_demanda_cubierta = cl(vol_neto_total/Math.max(vol_demandado,1),0,2);
    // Use channel-weighted price; fallback to user precio if no demand block
    const precio_r      = precio_prom_canal > 3 ? precio_prom_canal : Sw('precio', 3, 20);
    const revenue       = (vol_vendido / 1e6) * precio_r;
    const cogs_mat      = revenue * mat_pct;
    const cogs_scrap    = revenue * scrap_pct * 0.60;
    const cogs_pack     = revenue * Math.abs(overpack_pct) * 0.80;
    const costo_dev     = vol_neto_total * dev_rate * precio_r * 0.4 / 1e6;
    const cogs_total    = cogs_mat + costo_mo/1e6 + costo_energia/1e6 + cogs_scrap + cogs_pack + costo_dev;
    const gross_profit  = revenue - cogs_total;
    const gross_margin  = gross_profit / Math.max(revenue, 0.001);
    const sga           = revenue * sga_pct;
    const dist_total    = costo_cf + costo_log/1e6;
    const ventas_mktg   = costo_fv + costo_mktg;
    const ebitda        = gross_profit - sga - dist_total - ventas_mktg;
    const ebitda_margin = ebitda / Math.max(revenue, 0.001);
    const capex         = Sw('capex', 2, 150);
    const da            = capex * 0.14;
    const ebit          = ebitda - da;
    const tax           = Sw('tax', 0.10, 0.45);
    const nopat         = ebit * (1 - tax);
    const wacc          = Sw('wacc', 0.04, 0.25);
    const g             = Sw('g', 0.005, 0.08);
    const wc_dias_r     = Sw('wc_dias', 5, 90);
    const fcff          = nopat + da - capex - (revenue * wc_dias_r / 365) * 0.05;
    const tv            = wacc > g ? (fcff*(1+g))/(wacc-g) : fcff*14;
    const ev            = fcff*4.3 + tv/Math.pow(1+wacc,5);
    // Scores
    const score_ventas  = cl(pct_cob*100,0,100);
    const score_dist    = cl(pct_cap_dist*100,0,100);
    const score_almacen = cl((1-pct_ocup_cd_r)*100+50,0,100);
    const score_planta  = cl((oee/0.85)*100,0,100);
    const op_score      = (score_ventas+score_dist+score_almacen+score_planta)/4;

    res.push({
      disponibilidad, rendimiento, oee, vel_real,
      mtto_prog_h, mtto_noprog_h, fallos_año, tiempo_paro_total:tiempo_paro, mtbf, mttr,
      scrap_pct, overpack_pct, underpack_pct, cpk, dev_rate, lotes_rech,
      vol_neto_total: +(vol_neto_total/1e6).toFixed(3),
      cap_instalada: +(cap_instalada/1e6).toFixed(3),
      productividad: +productividad.toFixed(2),
      costo_mo: +(costo_mo/1e6).toFixed(3),
      costo_energia: +(costo_energia/1e6).toFixed(3),
      tam_lote_prom: +tam_lote.toFixed(0), n_cambios_año, t_cambio_min,
      h_cambios_año: +h_cambios_año.toFixed(1),
      pct_tiempo_cambios: +pct_tiempo_cambios.toFixed(4),
      kwh_x_hl: +kwh_x_hl.toFixed(2),
      kwh_total: +(vol_hl*kwh_x_hl/1e6).toFixed(3),
      agua_x_hl, co2_x_hl,
      vol_hl_total: +(vol_hl/1e3).toFixed(1),
      visitas_dia, pdvs_x_vendedor:pdvs_x_vend,
      pct_cobertura:+pct_cob.toFixed(4), gap_cobertura:+gap_cob.toFixed(0),
      ticket_prom:+ticket.toFixed(1), ingresos_venta:+ing_venta.toFixed(2),
      costo_fv:+costo_fv.toFixed(3), score_ventas:+score_ventas.toFixed(1),
      costo_pop:+costo_pop.toFixed(3), costo_mktg_total:+costo_mktg.toFixed(3),
      presup_mktg_pct:+presup_mktg.toFixed(4),
      drop_size:+drop_size.toFixed(0), n_entregas_dia:+n_entregas_dia.toFixed(0),
      pct_ocup_veh, pct_util_veh,
      pct_cap_dist:+pct_cap_dist.toFixed(4), gap_dist:+(gap_dist/1e6).toFixed(3),
      costo_log_caja:+costo_log_caja.toFixed(4), costo_log:+(costo_log/1e6).toFixed(3),
      fill_rate, otif, inv_rot, dias_inv:+dias_inv_r.toFixed(1), temp_excur,
      score_dist:+score_dist.toFixed(1),
      viajes_t1_dia:+viajes_t1_dia.toFixed(1), cap_t1_año:+(cap_t1_año/1e6).toFixed(3),
      turnaround_t1:+turnaround_t1.toFixed(2), costo_comb_t1:+(costo_comb_t1/1e6).toFixed(3),
      viajes_t2_dia:+viajes_t2_dia.toFixed(1), cap_t2_año:+(cap_t2_año/1e6).toFixed(3),
      turnaround_t2:+turnaround_t2.toFixed(2), costo_comb_t2:+(costo_comb_t2/1e6).toFixed(3),
      dias_inv_cedis, stock_cedis_cj:+(stock_cedis/1e6).toFixed(3),
      pct_vol_transfer:+pct_vol_tr.toFixed(4), vol_transfer_año:+(vol_transfer/1e6).toFixed(3),
      n_camiones_trans_req:+n_cam_tr_req.toFixed(0),
      km_cedis_cedis:+km_cc.toFixed(0), turnaround_trans:+turnaround_tr.toFixed(2),
      costo_transfer:+costo_transfer.toFixed(3), viajes_trans_dia:+viajes_tr_dia.toFixed(1),
      pallets_inventario:+pallets_inv.toFixed(0), pct_ocup_cd_real:+pct_ocup_cd_r.toFixed(4),
      gap_almacen:+gap_almacen.toFixed(0), pickers_requeridos:+pickers_req.toFixed(0),
      gap_pickers:+gap_pickers.toFixed(0), montacargas_req:+mtc_req.toFixed(0),
      gap_montacargas:+gap_mtc.toFixed(0), t_prep_pedido_min:+t_prep.toFixed(1),
      prod_montacargas:+prod_mtc.toFixed(2), score_almacen:+score_almacen.toFixed(1),
      dias_inv_concentrado:+d_conc.toFixed(1), dias_inv_azucar:+d_azucar.toFixed(1),
      dias_inv_co2:+d_co2.toFixed(1), lead_conc:+l_conc.toFixed(1), lead_azucar:+l_azucar.toFixed(1),
      dias_inv_envase_ret:+d_envret.toFixed(1), dias_inv_envase_nret:+d_envnret.toFixed(1),
      lead_envase:+l_envase.toFixed(1), dias_inv_tapas:+d_tapas.toFixed(1),
      dias_inv_etiquetas:+d_etiq.toFixed(1), dias_inv_carton:+d_carton.toFixed(1),
      dias_inv_stretch:+d_stretch.toFixed(1), dias_inv_pallets:+d_pallets.toFixed(1),
      dias_inv_esquin:+d_esquin.toFixed(1), lead_emb_sec:+l_emb_sec.toFixed(1),
      pct_rotura_prov:+pct_rot_prov.toFixed(4),
      inv_total_mp:+inv_total_mp.toFixed(3), costo_fin_inv_mp:+costo_fin_inv.toFixed(3),
      revenue:+revenue.toFixed(2), cogs_total:+cogs_total.toFixed(2),
      gross_profit:+gross_profit.toFixed(2), gross_margin:+gross_margin.toFixed(4),
      sga:+sga.toFixed(2), dist_total:+dist_total.toFixed(2), ventas_mktg:+ventas_mktg.toFixed(2),
      ebitda:+ebitda.toFixed(2), ebitda_margin:+ebitda_margin.toFixed(4),
      nopat:+nopat.toFixed(2), fcff:+fcff.toFixed(2), ev:+ev.toFixed(2),
      op_score:+op_score.toFixed(1), score_planta:+score_planta.toFixed(1),
      // Demand
      desc_mod:+desc_mod.toFixed(4), desc_trad:+desc_trad.toFixed(4), desc_inst:+desc_inst.toFixed(4),
      p_neto_mod:+p_mod.toFixed(3), p_neto_trad:+p_trad.toFixed(3), p_neto_inst:+p_inst.toFixed(3),
      vol_demandado:+(vol_demandado/1e6).toFixed(3),
      vol_vendido:+(vol_vendido/1e6).toFixed(3),
      demanda_gap:+(demanda_gap/1e6).toFixed(3),
      pct_demanda_cubierta:+pct_demanda_cubierta.toFixed(4),
      mix_moderno:+mix_moderno.toFixed(4),
      mix_tradicional:+mix_tradicional.toFixed(4),
      mix_institucional:+mix_institucional.toFixed(4),
      precio_prom_canal:+precio_prom_canal.toFixed(3),
      rev_canal:+rev_canal.toFixed(2),
      factor_crec:+factor_crec.toFixed(4),
      // Extended financials
      ebit:+ebit.toFixed(2),
      utilidad_neta:+(nopat).toFixed(2),  // NOPAT ≈ Utilidad Neta operativa
      // EVA = NOPAT - (Capital Invertido × WACC)
      capital_invertido:+(capex * 7).toFixed(2), // simplified IC = 7x CAPEX
      eva:+(nopat - capex * 7 * Math.max(wacc,0.01)).toFixed(2),
      wacc_val:+wacc.toFixed(4),
    });
  }
  return res;
}

// ── Stats ─────────────────────────────────────────────────────────
const pctile = (arr, p) => {
  const s = [...arr].sort((a,b)=>a-b);
  const i = (p/100)*(s.length-1);
  return s[Math.floor(i)]+(s[Math.ceil(i)]-s[Math.floor(i)])*(i-Math.floor(i));
};
const avg = arr => arr.reduce((a,b)=>a+b,0)/arr.length;
const stat = (results, key) => {
  const arr = results.map(r=>r[key]).filter(v=>v!=null&&!isNaN(v));
  if(!arr.length) return {p10:0,p25:0,p50:0,p75:0,p90:0,mean:0,arr:[]};
  return {p10:pctile(arr,10),p25:pctile(arr,25),p50:pctile(arr,50),p75:pctile(arr,75),p90:pctile(arr,90),mean:avg(arr),arr};
};

// ── Formatters ────────────────────────────────────────────────────
const fP  = (v,d=1) => (v==null||isNaN(v))?"—":v.toFixed(d);
const fPct= (v,d=1) => `${((v||0)*100).toFixed(d)}%`;
const fM  = v => `$${fP(v)}M`;
const fN  = (v,d=0) => (v==null||isNaN(v))?"—":v.toFixed(d).replace(/\B(?=(\d{3})+(?!\d))/g,",");

const COLS = {
  // Promundial brand palette
  primary:  "#2D5016",   // dark green — primary actions, headers
  mid:      "#4A7C2F",   // medium green — secondary
  light:    "#7AAF5A",   // light green — highlights
  gold:     "#C8A84B",   // gold/amber — warnings, KPIs
  blue:     "#2563A8",   // blue — info, neutral metric
  red:      "#C0392B",   // danger / deficit
  success:  "#2D7A2D",   // success / surplus
  muted:    "#6A7A6A",   // muted text
  border:   "#E0DDD5",   // default border
  surface:  "#FFFFFF",   // card background
  bg:       "#F5F5F0",   // page background
  // Semantic aliases (keep chart code working)
  cyan:     "#2D5016",
  green:    "#2D7A2D",
  yellow:   "#C8A84B",
  pink:     "#C0392B",
  violet:   "#2563A8",
  orange:   "#C8A84B",
  teal:     "#2D7A2D",
  sky:      "#2563A8",
  lime:     "#4A7C2F",
};
const tl    = (v,hi,lo) => v>=hi?COLS.green:v>=lo?COLS.yellow:COLS.red;
const tlInv = (v,lo,hi) => v<=lo?COLS.green:v<=hi?COLS.yellow:COLS.red;

// ── Shared UI atoms ───────────────────────────────────────────────
function GapBadge({gap,unit="",decimals=0}) {
  const pos=gap>=0;
  return <span style={{fontFamily:"monospace",fontWeight:700,fontSize:12,color:pos?COLS.green:COLS.red,background:pos?"#2D7A2D18":"#C0392B18",border:`1px solid ${pos?COLS.green:COLS.red}33`,borderRadius:6,padding:"2px 8px"}}>{pos?"+":""}{fN(gap,decimals)}{unit}</span>;
}
function KCard({label,p50,p10,p90,color,fmt=fM,sub,semaforo}) {
  return (
    <div style={{background:"#FFFFFF",border:`1px solid ${color}22`,borderRadius:10,padding:"12px 15px",minWidth:0}}>
      <div style={{fontSize:11,color:"#5A5A5A",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:5}}>{label}</div>
      <div style={{fontSize:"clamp(14px,4vw,20px)",fontWeight:800,color:semaforo||color,fontFamily:"'DM Mono',monospace",lineHeight:1}}>{fmt(p50)}</div>
      {sub&&<div style={{fontSize:11,color:"#888888",marginTop:3}}>{sub}</div>}
      <div style={{display:"flex",gap:8,marginTop:6,fontSize:11}}>
        <span style={{color:"#C0392B88"}}>▼{fmt(p10)}</span>
        <span style={{color:"#B0C8B8"}}>│</span>
        <span style={{color:"#2D7A2D88"}}>▲{fmt(p90)}</span>
      </div>
    </div>
  );
}
function CapBar({label,req,avail,unit="",fmtFn=v=>fN(v,0)}) {
  const u=Math.min(req/Math.max(avail,0.001),1.5);
  const c=u>1?COLS.red:u>0.85?COLS.yellow:COLS.green;
  return (
    <div style={{marginBottom:14}}>
      <div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:4}}>
        <span style={{color:"#4A6A5A"}}>{label}</span>
        <span style={{fontFamily:"monospace",fontSize:10,color:"#3A6A3A",textAlign:"right"}}>Req:{fmtFn(req)}{unit} · Disp:{fmtFn(avail)}{unit}</span>
      </div>
      <div style={{background:"#F8F8F4",borderRadius:4,height:14,overflow:"hidden"}}>
        <div style={{width:`${Math.min(u*100,100)}%`,height:"100%",background:`linear-gradient(90deg,${c}88,${c})`,borderRadius:4}}/>
      </div>
      <div style={{display:"flex",justifyContent:"space-between",marginTop:3,fontSize:11}}>
        <span style={{color:c,fontFamily:"monospace"}}>{(u*100).toFixed(0)}%</span>
        <GapBadge gap={avail-req} unit={unit}/>
      </div>
    </div>
  );
}
function Panel({title,sub,children,style={}}) {
  return (
    <div style={{background:"#FFFFFF",border:"1px solid #0f1e2e",borderRadius:12,padding:"clamp(10px,3vw,16px)",...style}}>
      {title&&<div style={{fontSize:12,color:"#2D5016",fontWeight:700,marginBottom:sub?3:12}}>{title}</div>}
      {sub&&<div style={{fontSize:11.5,color:"#B0C8B8",marginBottom:12}}>{sub}</div>}
      {children}
    </div>
  );
}

// ── Wizard input field ─────────────────────────────────────────────
function WField({label, unit, kv, ks, vals, onChange, isPct, isInt, hint}) {
  const vVal = vals[kv];
  const sVal = vals[ks];
  const fmt  = v => isPct ? fPct(v) : isInt ? fN(v,0) : fP(v,2);
  return (
    <div style={{marginBottom:14}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:5}}>
        <label style={{fontSize:"clamp(10px,2.5vw,12px)",color:"#2D5016",fontWeight:500}}>{label}</label>
        {unit&&<span style={{fontSize:11,color:"#7A7A7A"}}>{unit}</span>}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))",gap:8}}>
        <div>
          <div style={{fontSize:11,color:"#7A7A7A",marginBottom:3}}>Valor base</div>
          <input
            type="number"
            value={isPct ? +(vVal*100).toFixed(4) : vVal}
            step={isPct ? 0.1 : isInt ? 1 : 0.01}
            onChange={e => {
              const raw = parseFloat(e.target.value)||0;
              onChange(kv, isPct ? raw/100 : raw);
            }}
            style={{
              width:"100%", background:"#F8F8F4", border:"1px solid #1a3a50",
              borderRadius:7, padding:"7px 10px", color:"#2A2A2A",
              fontFamily:"'DM Mono',monospace", fontSize:13, fontWeight:600,
              outline:"none", boxSizing:"border-box",
            }}
          />
        </div>
        <div>
          <div style={{fontSize:11,color:"#4A7C2F",marginBottom:3}}>Desv. estándar (σ)</div>
          <input
            type="number"
            value={isPct ? +(sVal*100).toFixed(4) : sVal}
            step={isPct ? 0.1 : isInt ? 0.5 : 0.001}
            min={0}
            onChange={e => {
              const rawS = parseFloat(e.target.value)||0;
              onChange(ks, isPct ? rawS/100 : Math.max(0,rawS));
            }}
            style={{
              width:"100%", background:"#F0F0EA", border:"1px solid #112a3a",
              borderRadius:7, padding:"7px 10px", color:"#4A6A5A",
              fontFamily:"'DM Mono',monospace", fontSize:13,
              outline:"none", boxSizing:"border-box",
            }}
          />
        </div>
      </div>
      {hint&&<div style={{fontSize:11,color:"#888888",marginTop:3}}>{hint}</div>}
    </div>
  );
}

// ── Wizard group header ────────────────────────────────────────────
function WGroup({title, children}) {
  return (
    <div style={{marginBottom:24}}>
      <div style={{fontSize:10,color:"#4A7C2F",textTransform:"uppercase",letterSpacing:"0.10em",marginBottom:12,paddingBottom:6,borderBottom:"1px solid #E0DDD5",fontWeight:700}}>{title}</div>
      {children}
    </div>
  );
}

// ── WIZARD STEPS DEFINITION ───────────────────────────────────────
const WIZARD_STEPS = [
  { id:"demanda",    label:"Demanda",       icon:"📈" },
  { id:"produccion", label:"Producción",    icon:"🏭" },
  { id:"cadena",     label:"Cadena",        icon:"🚚" },
  { id:"ventas",     label:"Ventas",        icon:"🧑‍💼" },
  { id:"almacen",    label:"Almacén",       icon:"🏪" },
  { id:"inventarios",label:"Inventarios",   icon:"📦" },
  { id:"financiero", label:"Financiero",    icon:"💰" },
];

function WizardStep({step, vals, onChange}) {
  const W = (label, unit, kv, ks, opts={}) =>
    <WField key={kv} label={label} unit={unit} kv={kv} ks={ks} vals={vals} onChange={onChange} {...opts}/>;

  if (step==="demanda") return (
    <div>
      <WGroup title="📈 Canales & Volumen Demandado">
        {W("Volumen canal moderno","M cajas/año","vol_moderno_v","vol_moderno_s",{hint:"Supermercados, autoservicios, tiendas de conveniencia"})}
        {W("Volumen canal tradicional","M cajas/año","vol_tradicional_v","vol_tradicional_s",{hint:"Tiendas de barrio, abarroterías, misceláneas"})}
        {W("Volumen canal institucional","M cajas/año","vol_institucional_v","vol_institucional_s",{hint:"Restaurantes, hoteles, empresas, instituciones"})}
      </WGroup>
      <WGroup title="💵 Precio de Venta por Canal">
        {W("Precio canal moderno","USD/caja","precio_moderno_v","precio_moderno_s")}
        {W("Precio canal tradicional","USD/caja","precio_tradicional_v","precio_tradicional_s")}
        {W("Precio canal institucional","USD/caja","precio_institucional_v","precio_institucional_s")}
      </WGroup>
      <WGroup title="🏷️ Descuentos por Canal (% sobre precio de lista)">
        {W("Descuento canal moderno","%","desc_moderno_v","desc_moderno_s",{isPct:true,hint:"Pronto pago, volumen, acuerdos comerciales con cadenas"})}
        {W("Descuento canal tradicional","%","desc_tradicional_v","desc_tradicional_s",{isPct:true,hint:"Descuento de precio a distribuidores y mayoristas"})}
        {W("Descuento canal institucional","%","desc_institucional_v","desc_institucional_s",{isPct:true,hint:"Descuento negociado con clientes institucionales"})}
      </WGroup>
      <WGroup title="📉 Elasticidad Precio-Demanda">
        {W("Elasticidad canal moderno","(negativa)","elast_moderno_v","elast_moderno_s",{hint:"Ej: -1.2 → 1% ↑ precio = 1.2% ↓ volumen"})}
        {W("Elasticidad canal tradicional","(negativa)","elast_tradicional_v","elast_tradicional_s")}
        {W("Elasticidad canal institucional","(negativa)","elast_institucional_v","elast_institucional_s")}
      </WGroup>
      <WGroup title="📅 Estacionalidad Mensual (índice, promedio = 1.0)">
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(70px,1fr))",gap:8}}>
          {[["ene","Ene"],["feb","Feb"],["mar","Mar"],["abr","Abr"],["may","May"],["jun","Jun"],
            ["jul","Jul"],["ago","Ago"],["sep","Sep"],["oct","Oct"],["nov","Nov"],["dic","Dic"]].map(([mk,ml])=>{
            const vk = "est_"+mk+"_v";
            return (
              <div key={mk}>
                <div style={{fontSize:11,color:"#7A7A7A",marginBottom:3,textTransform:"uppercase"}}>{ml}</div>
                <input type="number" step="0.01"
                  value={(vals[vk]||1).toFixed(2)}
                  onChange={e=>onChange(vk, parseFloat(e.target.value)||1)}
                  style={{width:"100%",background:"#F8F8F4",border:"1px solid #1a3a50",borderRadius:6,padding:"6px 8px",color:"#2A2A2A",fontFamily:"'DM Mono',monospace",fontSize:12,outline:"none"}}
                />
              </div>
            );
          })}
        </div>
        <div style={{fontSize:11,color:"#7A8A7A",marginTop:8}}>
          La suma de índices debe ser ≈ 12.0 (promedio = 1.0). El modelo usa el promedio anual para normalizar.
        </div>
      </WGroup>
      <WGroup title="📊 Crecimiento & Proyección">
        {W("Tasa de crecimiento anual","ratio","crecimiento_anual_v","crecimiento_anual_s",{isPct:true,hint:"Crecimiento esperado del mercado/volumen"})}
        <div style={{marginBottom:14}}>
          <label style={{fontSize:"clamp(10px,2.5vw,12px)",color:"#2D5016",fontWeight:500}}>Año de proyección</label>
          <div style={{marginTop:5}}>
            <input type="number" min={1} max={10} step={1}
              value={vals.año_proyeccion_v||1}
              onChange={e=>onChange("año_proyeccion_v",parseInt(e.target.value)||1)}
              style={{width:"100%",background:"#F8F8F4",border:"1px solid #1a3a50",borderRadius:7,padding:"7px 10px",color:"#2A2A2A",fontFamily:"'DM Mono',monospace",fontSize:13,fontWeight:600,outline:"none"}}
            />
          </div>
          <div style={{fontSize:11,color:"#888888",marginTop:3}}>Año 1 = sin crecimiento aplicado. Año 2+ aplica tasa compuesta.</div>
        </div>
      </WGroup>
    </div>
  );

  if (step==="produccion") return (
    <div>
      <WGroup title="⚙️ Líneas & Velocidad">
        {W("N° de líneas","líneas","nLines_v","nLines_s",{isInt:true,hint:"Desv. Est. = 0 si es dato fijo"})}
        {W("Velocidad teórica (cap. instalada)","cj/hora","vel_teorica_v","vel_teorica_s",{isInt:true,hint:"Velocidad nominal del fabricante — desv. est. normalmente 0"})}
        {W("Velocidad real operativa","cj/hora","vel_real_v","vel_real_s",{isInt:true,hint:"Velocidad a la que corre realmente la línea"})}
        {W("Horas operativas/año","horas","horas_año_v","horas_año_s",{isInt:true})}
      </WGroup>
      <WGroup title="🔧 Mantenimiento">
        {W("Mtto. programado","horas/año","mtto_prog_h_v","mtto_prog_h_s",{hint:"Paros planificados: PMs, lubricación, inspecciones"})}
        {W("Mtto. no programado","horas/año","mtto_noprog_h_v","mtto_noprog_h_s",{hint:"Paros imprevistos adicionales al cálculo MTBF/MTTR"})}
        {W("MTBF — Mean Time Between Failures","horas","mtbf_v","mtbf_s")}
        {W("MTTR — Mean Time To Repair","horas","mttr_v","mttr_s")}
        {W("Calidad OEE (% unidades buenas)","ratio 0-1","oee_qual_v","oee_qual_s",{isPct:true})}
      </WGroup>
      <WGroup title="🗑 Scrap, Pack & Calidad">
        {W("Scrap %","ratio 0-1","scrap_pct_v","scrap_pct_s",{isPct:true})}
        {W("Overpack %","ratio 0-1","overpack_pct_v","overpack_pct_s",{isPct:true})}
        {W("Underpack %","ratio 0-1","underpack_pct_v","underpack_pct_s",{isPct:true})}
        {W("Cpk objetivo","índice","cpk_v","cpk_s")}
        {W("Tasa devoluciones","ratio 0-1","dev_rate_v","dev_rate_s",{isPct:true})}
      </WGroup>
      <WGroup title="🔄 SKU & Cambios de Referencia">
        {W("N° SKUs activos","SKUs","n_skus_v","n_skus_s",{isInt:true})}
        {W("Tamaño de lote promedio","cajas","tam_lote_prom_v","tam_lote_prom_s",{isInt:true})}
        {W("Tiempo de cambio de referencia","minutos","t_cambio_min_v","t_cambio_min_s")}
      </WGroup>
      <WGroup title="👷 Mano de Obra & Energía">
        {W("Operarios por línea","personas","operarios_line_v","operarios_line_s")}
        {W("Costo MO","USD/hora-operario","costo_mo_h_v","costo_mo_h_s")}
        {W("HL por caja","HL/caja","hl_x_caja_v","hl_x_caja_s",{hint:"1 caja 24×355ml ≈ 0.0567 HL"})}
        {W("Consumo energético","kWh/HL","kwh_x_hl_v","kwh_x_hl_s",{hint:"Benchmark industria: 12-18 kWh/HL"})}
        {W("Costo energía","USD/kWh","costo_kwh_v","costo_kwh_s")}
        {W("Consumo agua","L agua/L producto","agua_x_hl_v","agua_x_hl_s",{hint:"World class < 2.0 L/L"})}
        {W("Huella CO₂","g CO₂/L producto","co2_x_hl_v","co2_x_hl_s")}
      </WGroup>
    </div>
  );

  if (step==="cadena") return (
    <div>
      <WGroup title="🚚 T1 — Planta → CEDIS">
        {W("N° camiones T1","camiones","n_camiones_t1_v","n_camiones_t1_s",{isInt:true})}
        {W("Capacidad de carga T1","cajas/camión","cap_t1_v","cap_t1_s",{isInt:true})}
        {W("Distancia planta → CEDIS","km","km_t1_v","km_t1_s")}
        {W("Velocidad promedio T1","km/h","vel_t1_v","vel_t1_s")}
        {W("Tiempo de carga en planta","minutos","t_carga_t1_v","t_carga_t1_s")}
        {W("Tiempo de descarga en CEDIS","minutos","t_descarga_t1_v","t_descarga_t1_s")}
        {W("Rendimiento combustible T1","km/galón","rend_comb_t1_v","rend_comb_t1_s")}
        {W("Precio del diesel","USD/galón","precio_diesel_v","precio_diesel_s")}
      </WGroup>
      <WGroup title="🛻 T2 — CEDIS → PDV">
        {W("N° vehículos T2","vehículos","n_vehiculos_v","n_vehiculos_s",{isInt:true})}
        {W("Capacidad de carga T2","cajas/vehículo","cap_t2_v","cap_t2_s",{isInt:true})}
        {W("Drop size","cajas/entrega","drop_size_v","drop_size_s",{hint:"Cajas promedio por punto de entrega"})}
        {W("Distancia promedio por ruta","km","km_entrega_v","km_entrega_s")}
        {W("Velocidad promedio T2","km/h","vel_veh_v","vel_veh_s",{hint:"Velocidad urbana/suburbana"})}
        {W("Horas de distribución/día","horas","horas_dist_v","horas_dist_s")}
        {W("Rendimiento combustible T2","km/galón","rend_comb_t2_v","rend_comb_t2_s")}
        {W("Tiempo carga en CEDIS","min/vehículo","t_carga_veh_min_v","t_carga_veh_min_s")}
        {W("Tiempo descarga en PDV","min/entrega","t_descarga_pdv_min_v","t_descarga_pdv_min_s")}
      </WGroup>
      <WGroup title="🔁 Transferencias CEDIS ↔ CEDIS">
        {W("N° de CEDIS","centros","n_cedis_v","n_cedis_s",{isInt:true})}
        {W("% Volumen redistribuido lateralmente","ratio 0-1","pct_vol_transfer_v","pct_vol_transfer_s",{isPct:true})}
        {W("Distancia promedio entre CEDIS","km","km_cedis_cedis_v","km_cedis_cedis_s")}
      </WGroup>
      <WGroup title="🧊 Cadena Fría & Nivel de Servicio">
        {W("Fill Rate","ratio 0-1","fill_rate_v","fill_rate_s",{isPct:true})}
        {W("OTIF (On Time In Full)","ratio 0-1","otif_v","otif_s",{isPct:true})}
        {W("Rotación de inventario","veces/año","inv_rot_v","inv_rot_s")}
        {W("% Excursión de temperatura","ratio 0-1","temp_excur_v","temp_excur_s",{isPct:true})}
        {W("Costo cadena fría","USD/caja","costo_cf_caja_v","costo_cf_caja_s")}
        {W("Días inventario en CEDIS","días","dias_inv_cedis_v","dias_inv_cedis_s")}
      </WGroup>
    </div>
  );

  if (step==="ventas") return (
    <div>
      <WGroup title="🧑‍💼 Equipo de Ventas">
        {W("N° de vendedores","personas","n_vendedores_v","n_vendedores_s",{isInt:true})}
        {W("N° de PDVs a atender","puntos","n_pdvs_v","n_pdvs_s",{isInt:true,hint:"Universo total de puntos de venta"})}
        {W("Horas de trabajo/día","horas","h_trabajo_dia_v","h_trabajo_dia_s")}
        {W("Tiempo de atención por PDV","minutos","t_atencion_min_v","t_atencion_min_s")}
        {W("Tiempo de desplazamiento entre PDVs","minutos","t_desp_min_v","t_desp_min_s")}
        {W("Frecuencia de visita","veces/semana","frec_visita_sem_v","frec_visita_sem_s")}
        {W("Ticket promedio por visita","USD","ticket_prom_v","ticket_prom_s")}
        {W("Días laborales/año","días","dias_lab_año_v","dias_lab_año_s",{isInt:true})}
        {W("Costo total por vendedor","USD/mes","costo_vendedor_mes_v","costo_vendedor_mes_s",{hint:"Salario + comisiones + viáticos + prestaciones"})}
      </WGroup>
      <WGroup title="📣 Marketing">
        {W("Costo material POP por PDV","USD/PDV/año","costo_pop_pdv_v","costo_pop_pdv_s")}
        {W("Presupuesto total marketing","% de ingresos","presup_mktg_pct_v","presup_mktg_pct_s",{isPct:true,hint:"Incluye POP, activaciones, trade marketing, eventos"})}
      </WGroup>
    </div>
  );

  if (step==="almacen") return (
    <div>
      <WGroup title="🏪 Infraestructura CD">
        {W("Posiciones de rack disponibles","posiciones","posiciones_cd_v","posiciones_cd_s",{isInt:true,hint:"Capacidad total del almacén"})}
        {W("Cajas por pallet","cajas","cj_x_pallet_v","cj_x_pallet_s")}
      </WGroup>
      <WGroup title="👷 Personal & Equipos">
        {W("N° de pickers","personas","n_pickers_v","n_pickers_s",{isInt:true})}
        {W("Productividad picker","pallets/hora","pallets_x_picker_h_v","pallets_x_picker_h_s")}
        {W("Tiempo preparación de pedido","minutos/pedido","t_prep_pedido_min_v","t_prep_pedido_min_s")}
        {W("N° de montacargas","equipos","n_montacargas_v","n_montacargas_s",{isInt:true})}
        {W("Tiempo de carga de vehículo","min/vehículo","t_carga_veh_min_v","t_carga_veh_min_s")}
        {W("Tiempo de descarga en PDV","min/entrega","t_descarga_pdv_min_v","t_descarga_pdv_min_s")}
      </WGroup>
    </div>
  );

  if (step==="inventarios") return (
    <div>
      <WGroup title="🧪 Materias Primas">
        {W("Días inventario — Concentrado","días","dias_inv_conc_v","dias_inv_conc_s")}
        {W("Lead time Concentrado","días","lead_conc_v","lead_conc_s")}
        {W("Días inventario — Azúcar","días","dias_inv_azucar_v","dias_inv_azucar_s")}
        {W("Lead time Azúcar","días","lead_azucar_v","lead_azucar_s")}
        {W("Días inventario — CO₂","días","dias_inv_co2_v","dias_inv_co2_s")}
        {W("Lead time CO₂","días","lead_co2_v","lead_co2_s")}
        {W("% Roturas de proveedor","ratio 0-1","pct_rotura_prov_v","pct_rotura_prov_s",{isPct:true})}
      </WGroup>
      <WGroup title="🗃 Empaque Primario">
        {W("Días inv. — Envase retornable","días","dias_inv_envret_v","dias_inv_envret_s")}
        {W("Días inv. — Envase no retornable","días","dias_inv_envnret_v","dias_inv_envnret_s")}
        {W("Lead time envase","días","lead_envase_v","lead_envase_s")}
        {W("Días inv. — Tapas","días","dias_inv_tapas_v","dias_inv_tapas_s")}
        {W("Lead time tapas","días","lead_tapas_v","lead_tapas_s")}
        {W("Días inv. — Etiquetas","días","dias_inv_etiq_v","dias_inv_etiq_s")}
        {W("Días inv. — Cartón / Film primario","días","dias_inv_carton_v","dias_inv_carton_s")}
      </WGroup>
      <WGroup title="📦 Embalaje Secundario & Terciario">
        {W("Días inv. — Film stretch","días","dias_inv_stretch_v","dias_inv_stretch_s")}
        {W("Días inv. — Pallets","días","dias_inv_pallets_v","dias_inv_pallets_s")}
        {W("Días inv. — Esquineros / Cantoneras","días","dias_inv_esquin_v","dias_inv_esquin_s")}
        {W("Lead time embalaje sec./terc.","días","lead_emb_sec_v","lead_emb_sec_s")}
      </WGroup>
    </div>
  );

  if (step==="financiero") return (
    <div>
      <WGroup title="💰 Precio & Márgenes">
        {W("Precio de venta","USD/caja","precio_v","precio_s")}
        {W("Materiales (% ingresos)","ratio 0-1","mat_pct_v","mat_pct_s",{isPct:true})}
        {W("SG&A (% ingresos)","ratio 0-1","sga_pct_v","sga_pct_s",{isPct:true})}
      </WGroup>
      <WGroup title="📊 Estructura de Capital & Valuación">
        {W("CAPEX","M USD/año","capex_v","capex_s")}
        {W("Tasa impositiva","ratio 0-1","tax_v","tax_s",{isPct:true})}
        {W("WACC","ratio 0-1","wacc_v","wacc_s",{isPct:true,hint:"Costo promedio ponderado de capital"})}
        {W("Tasa de crecimiento terminal (g)","ratio 0-1","g_v","g_s",{isPct:true})}
        {W("Días de capital de trabajo","días","wc_dias_v","wc_dias_s")}
      </WGroup>
    </div>
  );

  return null;
}

// ── TABS (results) ────────────────────────────────────────────────
const RESULT_TABS=[
  {k:"overview",    l:"📊 Overview"},
  {k:"demanda",     l:"📈 Demanda"},
  {k:"planta",      l:"🏭 Planta & Mant."},
  {k:"skuenergia",  l:"🔄 SKU & Energía"},
  {k:"ventas",      l:"🧑‍💼 Ventas"},
  {k:"marketing",   l:"📣 Marketing"},
  {k:"transporte",  l:"🚚 T1/T2"},
  {k:"distribucion",l:"🛻 Distribución"},
  {k:"almacen",     l:"🏪 Almacén CD"},
  {k:"inventarios", l:"📦 Inventarios"},
  {k:"financiero",  l:"💰 P&L / EV"},
  {k:"capacidad",   l:"⚖️ Capacidad"},
  {k:"goalseek",    l:"🎯 Goal Seek"},
];

// ═══════════════════════════════════════════════════════════════════
export default function SimuladorEmbotelladora() {
  const [wiz, setWiz]         = useState(DEF);
  const [step, setStep]       = useState(0);
  const [results, setResults] = useState(null);
  const [running, setRunning] = useState(false);
  const [iter, setIter]       = useState(3000);
  const [tab, setTab]         = useState("overview");
  const [showWiz, setShowWiz] = useState(true);
  const bp = useBreakpoint();
  const isMobile = bp === "xs" || bp === "sm";

  const upd = useCallback((k,v) => setWiz(prev=>({...prev,[k]:v})), []);
  const p   = useMemo(() => buildP(wiz), [wiz]);

  const S_ = useMemo(() => {
    if (!results) return null;
    const keys = [
      "disponibilidad","rendimiento","oee","vel_real",
      "mtto_prog_h","mtto_noprog_h","fallos_año","tiempo_paro_total","mtbf","mttr",
      "scrap_pct","overpack_pct","underpack_pct","cpk","dev_rate","lotes_rech",
      "vol_neto_total","cap_instalada","productividad","costo_mo","costo_energia",
      "tam_lote_prom","n_cambios_año","t_cambio_min","h_cambios_año","pct_tiempo_cambios",
      "kwh_x_hl","kwh_total","agua_x_hl","co2_x_hl","vol_hl_total",
      "visitas_dia","pdvs_x_vendedor","pct_cobertura","gap_cobertura","ticket_prom",
      "ingresos_venta","costo_fv","score_ventas",
      "costo_pop","costo_mktg_total","presup_mktg_pct",
      "drop_size","n_entregas_dia","pct_ocup_veh","pct_util_veh","pct_cap_dist",
      "gap_dist","costo_log_caja","costo_log","fill_rate","otif","inv_rot","dias_inv","temp_excur",
      "score_dist",
      "viajes_t1_dia","cap_t1_año","turnaround_t1","costo_comb_t1",
      "viajes_t2_dia","cap_t2_año","turnaround_t2","costo_comb_t2",
      "dias_inv_cedis","stock_cedis_cj",
      "pct_vol_transfer","vol_transfer_año","n_camiones_trans_req",
      "km_cedis_cedis","turnaround_trans","costo_transfer","viajes_trans_dia",
      "pallets_inventario","pct_ocup_cd_real","gap_almacen","pickers_requeridos",
      "gap_pickers","montacargas_req","gap_montacargas","t_prep_pedido_min","prod_montacargas","score_almacen",
      "dias_inv_concentrado","dias_inv_azucar","dias_inv_co2","lead_conc","lead_azucar",
      "dias_inv_envase_ret","dias_inv_envase_nret","lead_envase",
      "dias_inv_tapas","dias_inv_etiquetas","dias_inv_carton",
      "dias_inv_stretch","dias_inv_pallets","dias_inv_esquin","lead_emb_sec","pct_rotura_prov",
      "inv_total_mp","costo_fin_inv_mp",
      "revenue","cogs_total","gross_profit","gross_margin","sga","dist_total",
      "ventas_mktg","ebitda","ebitda_margin","nopat","fcff","ev",
      "op_score","score_planta",
      "desc_mod","desc_trad","desc_inst","p_neto_mod","p_neto_trad","p_neto_inst",
      "vol_demandado","vol_vendido","demanda_gap","pct_demanda_cubierta",
      "mix_moderno","mix_tradicional","mix_institucional",
      "precio_prom_canal","rev_canal","factor_crec",
      "ebit","utilidad_neta","capital_invertido","eva","wacc_val",
    ];
    const out={};
    keys.forEach(k=>{out[k]=stat(results,k);});
    return out;
  }, [results]);

  const run = () => {
    setRunning(true);
    setTimeout(()=>{
      setResults(runSimW(wiz, iter));
      setRunning(false);
      setShowWiz(false);
    }, 60);
  };

  const currentStep = WIZARD_STEPS[step];

  return (
    <div style={{minHeight:"100vh",background:"#F5F5F0",color:"#2A2A2A",fontFamily:"'Outfit','DM Sans',sans-serif",display:"flex",flexDirection:"column",overflowX:"hidden",maxWidth:"100vw"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&family=DM+Mono:wght@400;500&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        ::-webkit-scrollbar{width:4px;} ::-webkit-scrollbar-thumb{background:#C8C4BC;border-radius:3px;}
        input[type=number]{-moz-appearance:textfield;}
        input[type=number]::-webkit-inner-spin-button,input[type=number]::-webkit-outer-spin-button{-webkit-appearance:none;}
        input:focus{border-color:#4A7C2F!important;box-shadow:0 0 0 2px #4A7C2F22;outline:none;}
        input[type=text],input[type=number],select{font-size:16px!important;}
        @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
        @keyframes slideIn{from{opacity:0;transform:translateX(-12px)}to{opacity:1;transform:none}}
        /* Prevent iOS zoom on input focus */
        @media(max-width:768px){
          input,select,textarea{font-size:16px!important;}
          .wizard-grid{grid-template-columns:1fr!important;}
        }
        /* Scrollable tab bar */
        .tab-bar{display:flex;gap:4px;overflow-x:auto;-webkit-overflow-scrolling:touch;padding-bottom:4px;scrollbar-width:none;background:#F5F5F0;}
        .tab-bar::-webkit-scrollbar{display:none;}
        /* Result grid responsive */
        .rg-2{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
        .rg-3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;}
        .rg-4{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;}
        @media(max-width:900px){.rg-2{grid-template-columns:1fr!important;}.rg-3{grid-template-columns:1fr 1fr!important;}}
        @media(max-width:600px){.rg-2,.rg-3,.rg-4{grid-template-columns:1fr!important;}}
        /* Sidebar responsive */
        .sidebar-panel{width:260px;flex-shrink:0;}
        @media(max-width:768px){.sidebar-panel{width:100%;max-height:50vh;overflow-y:auto;}}
      `}</style>

      {/* HEADER */}
      <header style={{padding:"10px clamp(12px,4vw,28px)",borderBottom:"1px solid #0d1a27",background:"#FFFFFF",display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,flexWrap:"wrap"}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <div style={{width:38,height:38,borderRadius:9,background:"linear-gradient(135deg,#2D5016,#4A7C2F)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,fontWeight:900,color:"#FFFFFF"}}>⬡</div>
          <div>
            <div style={{fontSize:isMobile?13:16,fontWeight:800,color:"#1A1A1A",letterSpacing:"-0.02em"}}>{isMobile?"MC Embotelladora":"Simulador Monte Carlo · Embotelladora Integral"}</div>
            {!isMobile&&<div style={{fontSize:11,color:"#7A7A7A",letterSpacing:"0.07em",textTransform:"uppercase"}}>Producción · Cadena · Ventas · Almacén · Inventarios · P&L — Promundial Consulting</div>}
          </div>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          {results&&(
            <button onClick={()=>setShowWiz(!showWiz)} style={{background:"transparent",border:"1px solid #C8C4BC",color:"#3A6A3A",borderRadius:7,padding:"6px 14px",fontFamily:"inherit",fontSize:11,cursor:"pointer"}}>
              {showWiz?"▶ Ver resultados":"⚙ Editar supuestos"}
            </button>
          )}
          <select value={iter} onChange={e=>setIter(+e.target.value)}
            style={{background:"#E8EEE8",border:"1px solid #1a2c3d",color:"#4A6A5A",borderRadius:6,padding:"5px 9px",fontSize:10,cursor:"pointer",fontFamily:"inherit"}}>
            {[1000,2000,3000,5000].map(n=><option key={n} value={n}>{n.toLocaleString()} iter.</option>)}
          </select>
        </div>
      </header>

      {/* WIZARD */}
      {showWiz && (
        <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",animation:"fadeUp 0.3s"}}>
          {/* Progress bar */}
          <div style={{padding:"16px 28px 0",background:"#FFFFFF"}}>
            <div style={{display:"flex",gap:0,marginBottom:0,overflowX:"auto",WebkitOverflowScrolling:"touch",scrollbarWidth:"none"}}>
              {WIZARD_STEPS.map((s,i)=>{
                const done=i<step, active=i===step;
                return (
                  <div key={s.id} onClick={()=>setStep(i)}
                    style={{flex:1,cursor:"pointer",padding:"10px 6px",textAlign:"center",
                      borderBottom:`2px solid ${active?"#4A7C2F":done?"#69ff8755":"#E0DDD5"}`,
                      transition:"all 0.2s"}}>
                    <div style={{fontSize:14,marginBottom:3}}>{s.icon}</div>
                    <div style={{fontSize:"clamp(8px,2vw,11px)",color:active?"#2D5016":done?"#2D7A2D":"#7A7A7A",fontWeight:active?700:400,letterSpacing:"0.03em",whiteSpace:"nowrap"}}>{s.label}</div>
                    {done&&<div style={{fontSize:7,color:"#2D7A2D",marginTop:1,fontWeight:600}}>✓ listo</div>}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Step content */}
          <div style={{flex:1,overflowY:"auto",padding:"24px 28px 100px"}}>
            <div style={{maxWidth:900,margin:"0 auto"}}>
              <div style={{marginBottom:20}}>
                <div style={{fontSize:20,fontWeight:800,color:"#1A1A1A",marginBottom:4}}>
                  {currentStep.icon} {currentStep.label}
                </div>
                <div style={{fontSize:11,color:"#7A7A7A"}}>
                  Ingresa el <strong style={{color:"#3A6A3A"}}>valor base</strong> (media esperada) y la <strong style={{color:"#4A7C2F"}}>desviación estándar</strong> de cada supuesto. Si el dato es fijo, deja σ = 0.
                </div>
              </div>
              {/* 2-col grid for form */}
              <div className="wizard-grid" style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr",gap:isMobile?"0":"0 32px"}}>
                <WizardStep step={currentStep.id} vals={wiz} onChange={upd}/>
              </div>
            </div>
          </div>

          {/* Footer nav */}
          <div style={{
            position:"sticky",bottom:0,background:"linear-gradient(0deg,#F5F5F0 80%,transparent)",
            padding:"16px",display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,flexWrap:"wrap",
          }}>
            <button onClick={()=>setStep(s=>Math.max(0,s-1))} disabled={step===0}
              style={{background:"transparent",border:"1px solid #C8C4BC",color:step===0?"#7A8A7A":"#3A6A3A",borderRadius:8,padding:"9px 20px",fontFamily:"inherit",fontSize:12,cursor:step===0?"not-allowed":"pointer"}}>
              ← Anterior
            </button>
            <div style={{fontSize:10,color:"#7A8A7A"}}>Paso {step+1} de {WIZARD_STEPS.length}</div>
            {step < WIZARD_STEPS.length-1
              ? <button onClick={()=>setStep(s=>s+1)}
                  style={{background:"linear-gradient(135deg,#2D5016,#4A7C2F)",border:"none",color:"#FFFFFF",borderRadius:8,padding:"9px 22px",fontFamily:"inherit",fontWeight:700,fontSize:12,cursor:"pointer"}}>
                  Siguiente →
                </button>
              : <button onClick={run} disabled={running}
                  style={{background:running?"#E8EEF5":"linear-gradient(135deg,#2D5016,#4A7C2F)",border:"none",color:"#fff",borderRadius:8,padding:"9px 22px",fontFamily:"inherit",fontWeight:700,fontSize:12,cursor:running?"not-allowed":"pointer",opacity:running?0.6:1}}>
                  {running?"⟳ Simulando…":"▶ Ejecutar Simulación"}
                </button>
            }
          </div>
        </div>
      )}

      {/* RESULTS */}
      {!showWiz && results && S_ && (
        <div style={{flex:1,overflowY:"auto",padding:"clamp(10px,3vw,24px)",animation:"fadeUp 0.35s"}}>
          <div className="tab-bar" style={{marginBottom:14}}>
            {RESULT_TABS.map(t=>(
              <button key={t.k} onClick={()=>setTab(t.k)} style={{
                background:tab===t.k?"#E8F0E0":"transparent",
                border:`1px solid ${tab===t.k?"#4A7C2F":"#E0DDD5"}`,
                color:tab===t.k?COLS.cyan:"#7A7A7A",
                borderRadius:6,padding:"5px 12px",fontSize:10,cursor:"pointer",fontFamily:"inherit",fontWeight:tab===t.k?700:400,
              }}>{t.l}</button>
            ))}
            <button onClick={run} disabled={running}
              style={{marginLeft:"auto",background:running?"#E8EEF5":"linear-gradient(135deg,#2D5016,#4A7C2F)",border:"none",color:"#fff",borderRadius:6,padding:"5px 14px",fontFamily:"inherit",fontWeight:700,fontSize:10,cursor:running?"not-allowed":"pointer"}}>
              {running?"⟳":"↺ Re-simular"}
            </button>
          </div>

          {tab==="overview"    &&<OverviewTab      S_={S_} p={p} bp={bp}/>}
          {tab==="demanda"     &&<DemandaTab       S_={S_} p={p} wiz={wiz}/>}
          {tab==="planta"      &&<PlantaTab        S_={S_} p={p}/>}
          {tab==="skuenergia"  &&<SKUEnergiaTab    S_={S_} p={p}/>}
          {tab==="ventas"      &&<VentasTab        S_={S_} p={p}/>}
          {tab==="marketing"   &&<MarketingTab     S_={S_} p={p}/>}
          {tab==="transporte"  &&<TransporteTab    S_={S_} p={p}/>}
          {tab==="distribucion"&&<DistribucionTab  S_={S_} p={p}/>}
          {tab==="almacen"     &&<AlmacenTab       S_={S_} p={p}/>}
          {tab==="inventarios" &&<InventariosTab   S_={S_} p={p}/>}
          {tab==="financiero"  &&<FinancieroTab    S_={S_} results={results}/>}
          {tab==="capacidad"   &&<CapacidadTab     S_={S_} p={p}/>}
          {tab==="goalseek"    &&<GoalSeekTab      S_={S_} p={p} wiz={wiz} iter={iter}/>}
        </div>
      )}

      {!showWiz && !results && (
        <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",color:"#7A8A7A"}}>
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:48,opacity:0.3}}>◈</div>
            <div style={{marginTop:12,fontSize:13}}>Completa el wizard y ejecuta la simulación</div>
          </div>
        </div>
      )}

      <footer style={{padding:"7px 24px",borderTop:"1px solid #0d1a27",display:"flex",justifyContent:"space-between",fontSize:11,color:"#7A8A7A"}}>
        <span>Promundial Consulting Group · Simulador Integral Embotelladora v5.0</span>
        <span>{results?`${results.length.toLocaleString()} escenarios`:""}</span>
      </footer>
    </div>
  );
}

// ════════════════════════════════════════════════════════
// OVERVIEW
// ════════════════════════════════════════════════════════
function OverviewTab({S_, p}) {
  const radar=[
    {s:"OEE",         A:cl100(S_.oee.p50/0.85)},
    {s:"Cobertura PDV",A:cl100(S_.pct_cobertura.p50)},
    {s:"Cap. Dist.",  A:cl100(S_.pct_cap_dist.p50)},
    {s:"Fill Rate",   A:cl100(S_.fill_rate.p50/0.97)},
    {s:"Almacén",     A:cl100(1-S_.pct_ocup_cd_real.p50)},
    {s:"EBITDA",      A:cl100(S_.ebitda_margin.p50/0.14)},
  ];
  function cl100(v){return Math.min(100,Math.max(0,v*100));}

  return (
    <div style={{animation:"fadeUp 0.35s"}}>
      {/* Score strip */}
      <div style={{background:"linear-gradient(135deg,#F0F8E8,#EAF5EA)",border:"1px solid #0e2035",borderRadius:12,padding:"14px 20px",display:"flex",gap:20,alignItems:"center",marginBottom:16,flexWrap:"wrap"}}>
        <div style={{textAlign:"center",minWidth:80}}>
          <div style={{fontSize:44,fontWeight:900,color:COLS.cyan,fontFamily:"monospace",lineHeight:1}}>{fP(S_.op_score.p50,0)}</div>
          <div style={{fontSize:10,color:"#4A7C2F",textTransform:"uppercase",letterSpacing:"0.1em",marginTop:3}}>Score Op.</div>
        </div>
        <div style={{flex:1,minWidth:180}}>
          <ResponsiveContainer width="100%" height={130}>
            <RadarChart data={radar}>
              <PolarGrid stroke="#DFF0D8"/>
              <PolarAngleAxis dataKey="s" tick={{fill:"#4A7C2F",fontSize:11}}/>
              <PolarRadiusAxis domain={[0,100]} tick={false}/>
              <Radar dataKey="A" stroke={COLS.cyan} fill={COLS.cyan} fillOpacity={0.15}/>
            </RadarChart>
          </ResponsiveContainer>
        </div>
        {/* Scores por bloque */}
        {[
          ["🏭 Planta",   S_.score_planta.p50,   COLS.violet],
          ["🧑‍💼 Ventas", S_.score_ventas.p50,   COLS.green],
          ["🚛 Dist.",    S_.score_dist.p50,     COLS.orange],
          ["🏪 Almacén",  S_.score_almacen.p50,  COLS.teal],
        ].map(([l,v,c])=>(
          <div key={l} style={{textAlign:"center"}}>
            <div style={{fontSize:11,color:"#7A7A7A",marginBottom:3}}>{l}</div>
            <div style={{fontSize:22,fontWeight:800,color:c,fontFamily:"monospace"}}>{fP(v,0)}</div>
            <div style={{fontSize:10,color:"#7A8A7A"}}>/ 100</div>
          </div>
        ))}
      </div>

      {/* KPIs grid */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:9,marginBottom:14}}>
        <KCard label="EV (M USD)" p50={S_.ev.p50} p10={S_.ev.p10} p90={S_.ev.p90} color={COLS.cyan}/>
        <KCard label="Ingresos (M USD)" p50={S_.revenue.p50} p10={S_.revenue.p10} p90={S_.revenue.p90} color={COLS.green}/>
        <KCard label="EBITDA (M USD)" p50={S_.ebitda.p50} p10={S_.ebitda.p10} p90={S_.ebitda.p90} color={COLS.yellow}/>
        <KCard label="OEE" p50={S_.oee.p50} p10={S_.oee.p10} p90={S_.oee.p90} color={COLS.violet} fmt={fPct} semaforo={tl(S_.oee.p50,0.80,0.65)}/>
        <KCard label="Cobertura PDVs" p50={S_.pct_cobertura.p50} p10={S_.pct_cobertura.p10} p90={S_.pct_cobertura.p90} color={COLS.green} fmt={fPct} semaforo={tl(S_.pct_cobertura.p50,1.0,0.85)}/>
        <KCard label="Fill Rate" p50={S_.fill_rate.p50} p10={S_.fill_rate.p10} p90={S_.fill_rate.p90} color={COLS.teal} fmt={fPct} semaforo={tl(S_.fill_rate.p50,0.97,0.92)}/>
        <KCard label="OTIF" p50={S_.otif.p50} p10={S_.otif.p10} p90={S_.otif.p90} color={COLS.sky} fmt={fPct} semaforo={tl(S_.otif.p50,0.95,0.88)}/>
        <KCard label="Cap. Distribución" p50={S_.pct_cap_dist.p50} p10={S_.pct_cap_dist.p10} p90={S_.pct_cap_dist.p90} color={COLS.orange} fmt={fPct} semaforo={tl(S_.pct_cap_dist.p50,1.10,0.95)}/>
        <KCard label="% Ocup. Almacén" p50={S_.pct_ocup_cd_real.p50} p10={S_.pct_ocup_cd_real.p10} p90={S_.pct_ocup_cd_real.p90} color={COLS.pink} fmt={fPct} semaforo={tlInv(S_.pct_ocup_cd_real.p50,0.80,0.95)}/>
        <KCard label="Margen EBITDA" p50={S_.ebitda_margin.p50} p10={S_.ebitda_margin.p10} p90={S_.ebitda_margin.p90} color={COLS.yellow} fmt={fPct} semaforo={tl(S_.ebitda_margin.p50,0.14,0.08)}/>
      </div>

      {/* Semáforo rápido */}
      <Panel title="Semáforo de Capacidad (P50)">
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:8}}>
          {[
            {l:"Cobertura fuerza ventas",v:S_.pct_cobertura.p50,fmt:fPct,hi:1.0,md:0.85,inv:false,note:`${fN(S_.gap_cobertura.p50,0)} PDVs gap`},
            {l:"Capacidad de distribución",v:S_.pct_cap_dist.p50,fmt:fPct,hi:1.05,md:0.90,inv:false,note:`Gap: ${fN(S_.gap_dist.p50,2)}M cj`},
            {l:"Ocupación almacén CD",v:S_.pct_ocup_cd_real.p50,fmt:fPct,hi:0.80,md:0.92,inv:true,note:`Gap: ${fN(S_.gap_almacen.p50,0)} posiciones`},
            {l:"OEE vs. demanda",v:S_.oee.p50,fmt:fPct,hi:0.80,md:0.65,inv:false,note:`Vel. real ${fPct(S_.rendimiento.p50)} de teórica`},
            {l:"Pickers requeridos",v:S_.gap_pickers.p50,fmt:v=>v>=0?"Suficientes":"Déficit",hi:0,md:-2,inv:false,note:`Gap: ${fN(S_.gap_pickers.p50,0)} pickers`},
            {l:"Montacargas requeridos",v:S_.gap_montacargas.p50,fmt:v=>v>=0?"Suficientes":"Déficit",hi:0,md:-1,inv:false,note:`Gap: ${fN(S_.gap_montacargas.p50,0)} unidades`},
          ].map(({l,v,fmt,hi,md,inv,note})=>{
            const c=inv?(v<=hi?COLS.green:v<=md?COLS.yellow:COLS.red):(v>=hi?COLS.green:v>=md?COLS.yellow:COLS.red);
            return (
              <div key={l} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"9px 12px",background:"#F8F8F4",borderRadius:8,border:`1px solid ${c}22`}}>
                <div>
                  <div style={{fontSize:10,color:"#4A6A5A"}}>{l}</div>
                  <div style={{fontSize:11,color:"#7A8A7A",marginTop:2}}>{note}</div>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <div style={{width:8,height:8,borderRadius:"50%",background:c,boxShadow:`0 0 6px ${c}`}}/>
                  <span style={{fontFamily:"monospace",fontSize:12,fontWeight:700,color:c}}>{fmt(v)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}

// ════════════════════════════════════════════════════════
// PLANTA & MANTENIMIENTO
// ════════════════════════════════════════════════════════
function PlantaTab({S_, p}) {
  return (
    <div className="rg-2" style={{animation:"fadeUp 0.35s"}}>
      <Panel title="Mantenimiento & Disponibilidad" sub="Mtto. programado + no programado + fallos aleatorios (MTBF/MTTR)">
        {[
          ["Disponibilidad (D)", S_.disponibilidad, fPct, tl(S_.disponibilidad.p50,0.88,0.75), "Tiempo operativo / tiempo total"],
          ["Rendimiento (R)", S_.rendimiento, fPct, tl(S_.rendimiento.p50,0.87,0.72), "Vel. real / vel. teórica"],
          ["Calidad OEE (C)", {p10:p.oee_qual*0.93,p50:p.oee_qual,p90:Math.min(0.999,p.oee_qual*1.03)}, fPct, COLS.violet, "Unidades buenas / brutas"],
          ["OEE = D × R × C", S_.oee, fPct, tl(S_.oee.p50,0.80,0.65), "Eficiencia global del equipo"],
        ].map(([l,s,f,c,sub])=>(
          <div key={l} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 12px",background:"#F8F8F4",borderRadius:8,border:`1px solid ${c}22`,marginBottom:8}}>
            <div><div style={{fontSize:11,color:"#4A6A5A"}}>{l}</div><div style={{fontSize:11,color:"#7A8A7A"}}>{sub}</div></div>
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:20,fontWeight:800,color:c,fontFamily:"monospace"}}>{f(s.p50)}</div>
              <div style={{fontSize:11,color:"#7A8A7A"}}>P10:{f(s.p10)} P90:{f(s.p90)}</div>
            </div>
          </div>
        ))}
        <div style={{background:"#F0F0EA",borderRadius:8,padding:"10px 12px",border:"1px solid #0d2035",marginTop:4}}>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))",gap:8}}>
            {[
              ["Mtto. prog. (h/año)", S_.mtto_prog_h, COLS.sky],
              ["Mtto. no prog. (h/año)", S_.mtto_noprog_h, COLS.orange],
              ["Fallos/año", S_.fallos_año, COLS.red],
              ["Paro total (h/año)", S_.tiempo_paro_total, COLS.pink],
              ["MTBF (h)", S_.mtbf, COLS.teal],
              ["MTTR (h)", S_.mttr, COLS.yellow],
            ].map(([l,s,c])=>(
              <div key={l}>
                <div style={{fontSize:11,color:"#7A7A7A"}}>{l}</div>
                <div style={{fontSize:15,fontWeight:700,color:c,fontFamily:"monospace"}}>{fP(s.p50,1)}</div>
              </div>
            ))}
          </div>
        </div>
      </Panel>

      <Panel title="Capacidad Instalada vs Real">
        <div style={{marginBottom:12}}>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:6}}>
            <span style={{color:"#4A6A5A"}}>Velocidad teórica (cap. instalada)</span>
            <span style={{fontFamily:"monospace",color:COLS.violet}}>{fN(p.vel_teorica,0)} cj/h × {p.nLines} líneas</span>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:6}}>
            <span style={{color:"#4A6A5A"}}>Velocidad real operativa (P50)</span>
            <span style={{fontFamily:"monospace",color:COLS.cyan}}>{fN(S_.vel_real.p50,0)} cj/h</span>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:14}}>
            <span style={{color:"#4A6A5A"}}>Rendimiento vs teórico</span>
            <span style={{fontFamily:"monospace",color:tl(S_.rendimiento.p50,0.87,0.72)}}>{fPct(S_.rendimiento.p50)}</span>
          </div>
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={[
              {name:"Cap. instalada", val:+(S_.cap_instalada.p50).toFixed(2),fill:COLS.violet},
              {name:"Vol. neto real",  val:+(S_.vol_neto_total.p50).toFixed(2),fill:COLS.cyan},
            ]}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E0DDD5" vertical={false}/>
              <XAxis dataKey="name" tick={{fill:"#3A6A3A",fontSize:11}}/>
              <YAxis tick={{fill:"#7A7A7A",fontSize:10}} tickFormatter={v=>`${v}M`}/>
              <Tooltip contentStyle={{background:"#FFFFFF",border:"1px solid #111e2e",fontSize:10}} formatter={v=>[`${fP(v,2)}M cj`]}/>
              <Bar dataKey="val" radius={[4,4,0,0]}>
                {[COLS.violet,COLS.cyan].map((c,i)=><Cell key={i} fill={c} fillOpacity={0.85}/>)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))",gap:8,marginTop:4}}>
          {[
            ["Scrap %", S_.scrap_pct, fPct, COLS.red],
            ["Overpack %", S_.overpack_pct, fPct, COLS.orange],
            ["Productividad (cj/op-h)", S_.productividad, v=>fP(v,1), COLS.teal],
            ["Cpk", S_.cpk, v=>fP(v,2), COLS.violet],
          ].map(([l,s,f,c])=>(
            <div key={l} style={{background:"#F8F8F4",borderRadius:7,padding:"9px 10px",border:`1px solid ${c}22`}}>
              <div style={{fontSize:11,color:"#7A7A7A"}}>{l}</div>
              <div style={{fontSize:18,fontWeight:800,color:c,fontFamily:"monospace"}}>{f(s.p50)}</div>
              <div style={{fontSize:10,color:"#7A8A7A"}}>P10:{f(s.p10)} P90:{f(s.p90)}</div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

// ════════════════════════════════════════════════════════
// FUERZA DE VENTAS
// ════════════════════════════════════════════════════════
function VentasTab({S_, p}) {
  const cov=S_.pct_cobertura.p50;
  const covColor=tl(cov,1.0,0.85);
  return (
    <div className="rg-2" style={{animation:"fadeUp 0.35s"}}>
      <Panel title="Capacidad de Cobertura — PDVs" sub="¿Tenemos suficientes vendedores para atender todos los puntos de venta?">
        <CapBar label="Cobertura PDVs" req={p.n_pdvs} avail={Math.round(S_.cap_pdvs_total?.p50||S_.pdvs_x_vendedor.p50*p.n_vendedores)} unit=" PDVs"/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginTop:8}}>
          {[
            ["Visitas/vendedor/día", S_.visitas_dia, v=>fN(v,0), COLS.cyan],
            ["PDVs/vendedor", S_.pdvs_x_vendedor, v=>fN(v,0), COLS.green],
            ["% Cobertura", S_.pct_cobertura, fPct, covColor],
          ].map(([l,s,f,c])=>(
            <div key={l} style={{background:"#F8F8F4",borderRadius:7,padding:"9px 10px",border:`1px solid ${c}22`}}>
              <div style={{fontSize:11,color:"#7A7A7A"}}>{l}</div>
              <div style={{fontSize:18,fontWeight:800,color:c,fontFamily:"monospace"}}>{f(s.p50)}</div>
              <div style={{fontSize:10,color:"#7A8A7A"}}>P10:{f(s.p10)}</div>
            </div>
          ))}
        </div>
        <div style={{marginTop:12,padding:"10px 12px",background:"#F0F0EA",borderRadius:8,border:"1px solid #0d2035"}}>
          <div style={{fontSize:10,color:"#3A6A3A",marginBottom:4}}>Gap de cobertura (PDVs)</div>
          <GapBadge gap={S_.gap_cobertura.p50} unit=" PDVs"/>
          <div style={{fontSize:11,color:"#7A8A7A",marginTop:6}}>
            + gap = superávit de capacidad · - gap = PDVs sin cubrir
          </div>
        </div>
      </Panel>

      <Panel title="Productividad & Economía Vendedor">
        {[
          ["Ticket promedio (USD/visita)", S_.ticket_prom, v=>`$${fP(v,0)}`, COLS.yellow],
          ["Ingresos generados FV (M USD/año)", S_.ingresos_venta, fM, COLS.green],
          ["Costo total FV (M USD/año)", S_.costo_fv, fM, COLS.red],
        ].map(([l,s,f,c])=>(
          <div key={l} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 12px",background:"#F8F8F4",borderRadius:8,border:"1px solid #0e1e2e",marginBottom:8}}>
            <span style={{fontSize:10,color:"#4A6A5A"}}>{l}</span>
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:18,fontWeight:800,color:c,fontFamily:"monospace"}}>{f(s.p50)}</div>
              <div style={{fontSize:10,color:"#7A8A7A"}}>P10:{f(s.p10)} P90:{f(s.p90)}</div>
            </div>
          </div>
        ))}
        <div style={{background:"#F0F0EA",borderRadius:8,padding:"10px 12px",border:"1px solid #0d2035",fontSize:10}}>
          <div style={{color:"#4A7C2F",marginBottom:4}}>ROI Fuerza de Ventas</div>
          <div style={{fontFamily:"monospace",fontSize:16,fontWeight:700,color:COLS.lime}}>
            {fP(S_.ingresos_venta.p50/Math.max(S_.costo_fv.p50,0.01),1)}× ingresos / costo FV
          </div>
          <div style={{fontSize:11,color:"#888888",marginTop:3}}>P50 ingresos / P50 costo</div>
        </div>
      </Panel>
    </div>
  );
}

// ════════════════════════════════════════════════════════
// MARKETING
// ════════════════════════════════════════════════════════
function MarketingTab({S_, p}) {
  return (
    <div className="rg-2" style={{animation:"fadeUp 0.35s"}}>
      <Panel title="Presupuesto Marketing & POP">
        {[
          ["Costo POP total (M USD)", S_.costo_pop, fM, COLS.pink, `$${fP(p.costo_pop_pdv,0)}/PDV × ${fN(p.n_pdvs,0)} PDVs`],
          ["Presupuesto mktg total (M USD)", S_.costo_mktg_total, fM, COLS.violet, "Incluye POP, activaciones, trade"],
          ["% de ingresos (presupuesto)", S_.presup_mktg_pct, fPct, COLS.orange, "Ratio mktg spend / revenue"],
        ].map(([l,s,f,c,sub])=>(
          <div key={l} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 14px",background:"#F8F8F4",borderRadius:8,border:`1px solid ${c}22`,marginBottom:9}}>
            <div><div style={{fontSize:11,color:"#4A6A5A"}}>{l}</div><div style={{fontSize:11,color:"#7A8A7A",marginTop:2}}>{sub}</div></div>
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:20,fontWeight:800,color:c,fontFamily:"monospace"}}>{f(s.p50)}</div>
              <div style={{fontSize:10,color:"#7A8A7A"}}>P10:{f(s.p10)} P90:{f(s.p90)}</div>
            </div>
          </div>
        ))}
      </Panel>
      <Panel title="Impacto en P&L" sub="El gasto de marketing y fuerza de ventas se registra debajo del margen bruto">
        <div style={{padding:"12px 14px",background:"#F0F0EA",borderRadius:8,border:"1px solid #0d2035",marginBottom:10}}>
          <div style={{fontSize:10,color:"#4A7C2F",marginBottom:6}}>Costo total Ventas + Marketing (M USD)</div>
          <div style={{fontSize:26,fontWeight:900,color:COLS.pink,fontFamily:"monospace"}}>{fM(S_.ventas_mktg.p50)}</div>
          <div style={{fontSize:11,color:"#888888",marginTop:3}}>FV: {fM(S_.costo_fv.p50)} + Mktg: {fM(S_.costo_mktg_total.p50)}</div>
        </div>
        <div style={{fontSize:10,color:"#3A6A3A",marginBottom:6}}>Como % de ingresos:</div>
        <div style={{fontSize:20,fontWeight:800,color:COLS.orange,fontFamily:"monospace"}}>
          {fPct(S_.ventas_mktg.p50/Math.max(S_.revenue.p50,0.01))}
        </div>
        <div style={{fontSize:11,color:"#7A8A7A",marginTop:4}}>Benchmark embotelladora: 8–14% de ingresos</div>
      </Panel>
    </div>
  );
}

// ════════════════════════════════════════════════════════
// DISTRIBUCIÓN
// ════════════════════════════════════════════════════════
function DistribucionTab({S_, p}) {
  return (
    <div className="rg-2" style={{animation:"fadeUp 0.35s"}}>
      <Panel title="Capacidad de Distribución" sub="¿Tenemos vehículos suficientes para entregar todo el volumen?">
        <CapBar
          label="Vol. a distribuir vs capacidad flota"
          req={S_.vol_neto_total.p50}
          avail={+(S_.vol_neto_total.p50*(S_.pct_cap_dist.p50)).toFixed(2)}
          unit=" M cj"
          fmtFn={v=>fP(v,2)}
        />
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))",gap:8,marginTop:10}}>
          {[
            ["Drop size (cj/entrega)", S_.drop_size, v=>fN(v,0), COLS.orange],
            ["Entregas/vehículo/día", S_.n_entregas_dia, v=>fN(v,0), COLS.cyan],
            ["% Ocupación vehículo", S_.pct_ocup_veh, fPct, COLS.yellow],
            ["% Utilización flota", S_.pct_util_veh, fPct, COLS.green],
            ["Fill Rate", S_.fill_rate, fPct, tl(S_.fill_rate.p50,0.97,0.92)],
            ["OTIF", S_.otif, fPct, tl(S_.otif.p50,0.95,0.88)],
          ].map(([l,s,f,c])=>(
            <div key={l} style={{background:"#F8F8F4",borderRadius:7,padding:"9px 10px",border:`1px solid ${c}22`}}>
              <div style={{fontSize:11,color:"#7A7A7A"}}>{l}</div>
              <div style={{fontSize:16,fontWeight:800,color:c,fontFamily:"monospace"}}>{f(s.p50)}</div>
              <div style={{fontSize:10,color:"#7A8A7A"}}>P10:{f(s.p10)} P90:{f(s.p90)}</div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Costos Logísticos">
        {[
          ["Costo por caja entregada (USD)", S_.costo_log_caja, v=>`$${fP(v,3)}`, COLS.orange, "KPI de eficiencia logística"],
          ["Costo logístico total (M USD)", S_.costo_log, fM, COLS.red, "Flota + combustible + conductores"],
          ["Costo cadena fría (M USD)", {p10:S_.fill_rate.p10,p50:S_.vol_neto_total.p50*p.costo_cf_caja/1e6,p90:S_.fill_rate.p90}, fM, COLS.sky, "Almacenamiento refrigerado + transporte"],
          ["Rotación inventario (×/año)", S_.inv_rot, v=>fP(v,1), COLS.teal, ""],
          ["Días inventario", S_.dias_inv, v=>`${fP(v,0)}d`, COLS.violet, ""],
          ["Excursión temperatura %", S_.temp_excur, fPct, COLS.red, "% cajas con ruptura cadena fría"],
        ].map(([l,s,f,c,sub])=>(
          <div key={l} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 10px",background:"#F8F8F4",borderRadius:7,border:"1px solid #0e1e2e",marginBottom:7}}>
            <div><div style={{fontSize:10,color:"#4A6A5A"}}>{l}</div>{sub&&<div style={{fontSize:10,color:"#7A8A7A"}}>{sub}</div>}</div>
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:16,fontWeight:800,color:c,fontFamily:"monospace"}}>{f(s.p50)}</div>
            </div>
          </div>
        ))}
      </Panel>
    </div>
  );
}

// ════════════════════════════════════════════════════════
// ALMACÉN CD
// ════════════════════════════════════════════════════════
function AlmacenTab({S_, p}) {
  return (
    <div className="rg-2" style={{animation:"fadeUp 0.35s"}}>
      <Panel title="Capacidad de Almacenamiento" sub="Posiciones de rack vs pallets en inventario promedio">
        <CapBar
          label="Posiciones usadas vs disponibles"
          req={Math.round(S_.pallets_inventario.p50)}
          avail={p.posiciones_cd}
          unit=" posiciones"
        />
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))",gap:8,marginTop:10}}>
          {[
            ["Pallets en inventario", S_.pallets_inventario, v=>fN(v,0), COLS.orange],
            ["% Ocupación CD", S_.pct_ocup_cd_real, fPct, tlInv(S_.pct_ocup_cd_real.p50,0.80,0.95)],
            ["Gap posiciones", S_.gap_almacen, v=>fN(v,0), S_.gap_almacen.p50>=0?COLS.green:COLS.red],
            ["T° prep. pedido (min)", S_.t_prep_pedido_min, v=>fP(v,1), COLS.sky],
          ].map(([l,s,f,c])=>(
            <div key={l} style={{background:"#F8F8F4",borderRadius:7,padding:"9px 10px",border:`1px solid ${c}22`}}>
              <div style={{fontSize:11,color:"#7A7A7A"}}>{l}</div>
              <div style={{fontSize:17,fontWeight:800,color:c,fontFamily:"monospace"}}>{f(s.p50)}</div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Recursos Humanos & Equipos del CD">
        <CapBar label="Pickers: requeridos vs disponibles" req={Math.round(S_.pickers_requeridos.p50)} avail={p.n_pickers} unit=" pickers"/>
        <CapBar label="Montacargas: requeridos vs disponibles" req={Math.round(S_.montacargas_req.p50)} avail={p.n_montacargas} unit=" montacargas"/>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:8,marginTop:8}}>
          {[
            ["Pickers requeridos (P50)", S_.pickers_requeridos, v=>fN(v,0), COLS.cyan],
            ["Gap pickers", S_.gap_pickers, v=>(v>=0?"+":"")+fN(v,0), S_.gap_pickers.p50>=0?COLS.green:COLS.red],
            ["Montacargas requeridos", S_.montacargas_req, v=>fN(v,0), COLS.yellow],
            ["Gap montacargas", S_.gap_montacargas, v=>(v>=0?"+":"")+fN(v,0), S_.gap_montacargas.p50>=0?COLS.green:COLS.red],
            ["Prod. montacargas (pl/h)", S_.prod_montacargas, v=>fP(v,1), COLS.teal],
            ["T° carga vehículo (min)", {p50:p.t_carga_veh_min}, v=>fN(v,0), COLS.orange],
          ].map(([l,s,f,c])=>(
            <div key={l} style={{background:"#F8F8F4",borderRadius:7,padding:"9px 10px",border:`1px solid ${c}22`}}>
              <div style={{fontSize:11,color:"#7A7A7A"}}>{l}</div>
              <div style={{fontSize:15,fontWeight:800,color:c,fontFamily:"monospace"}}>{f(s.p50)}</div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

// ════════════════════════════════════════════════════════
// FINANCIERO
// ════════════════════════════════════════════════════════
function FinancieroTab({S_, results}) {
  const wf=[
    {name:"Ingresos",    val:S_.revenue.p50,        c:COLS.green},
    {name:"- COGS",      val:-S_.cogs_total.p50,    c:COLS.red},
    {name:"U. Bruta",    val:S_.gross_profit.p50,   c:COLS.teal},
    {name:"- SG&A",      val:-S_.sga.p50,           c:COLS.orange},
    {name:"- Dist./CF",  val:-S_.dist_total.p50,    c:COLS.orange},
    {name:"- FV+Mktg",   val:-S_.ventas_mktg.p50,   c:COLS.pink},
    {name:"EBITDA",      val:S_.ebitda.p50,         c:COLS.yellow},
    {name:"NOPAT",       val:S_.nopat.p50,          c:COLS.violet},
    {name:"FCFF",        val:S_.fcff.p50,           c:COLS.pink},
    {name:"EV",          val:S_.ev.p50,             c:COLS.cyan},
  ];
  return (
    <div style={{animation:"fadeUp 0.35s"}}>
      <Panel title="Cascada P&L Integral (M USD · P50)" sub="Incluye costos de planta, MO, energía, scrap, FV, marketing, distribución y cadena fría" style={{marginBottom:12}}>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={wf}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E0DDD5" vertical={false}/>
            <XAxis dataKey="name" tick={{fill:"#3A6A3A",fontSize:11}}/>
            <YAxis tick={{fill:"#7A7A7A",fontSize:10}} tickFormatter={v=>`$${fP(v,0)}M`}/>
            <Tooltip contentStyle={{background:"#FFFFFF",border:"1px solid #111e2e",fontSize:10}} formatter={v=>[`$${fP(Math.abs(v),1)}M`]}/>
            <Bar dataKey="val" radius={[4,4,0,0]}>
              {wf.map((e,i)=><Cell key={i} fill={e.val>=0?e.c:COLS.red} fillOpacity={0.85}/>)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Panel>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))",gap:9}}>
        {[
          ["Margen Bruto", S_.gross_margin, fPct, COLS.teal, tl(S_.gross_margin.p50,0.48,0.38)],
          ["Margen EBITDA", S_.ebitda_margin, fPct, COLS.yellow, tl(S_.ebitda_margin.p50,0.14,0.08)],
          ["EBITDA (M)", S_.ebitda, fM, COLS.yellow, null],
          ["NOPAT (M)", S_.nopat, fM, COLS.violet, null],
          ["FCFF (M)", S_.fcff, fM, COLS.pink, null],
          ["EV (M)", S_.ev, fM, COLS.cyan, null],
        ].map(([l,s,f,c,sem])=>(
          <KCard key={l} label={l} p50={s.p50} p10={s.p10} p90={s.p90} color={c} fmt={f} semaforo={sem}/>
        ))}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════
// SKU & ENERGÍA TAB
// ════════════════════════════════════════════════════════
function SKUEnergiaTab({S_, p}) {
  const cambiosData = [
    {name:"N° cambios/año",  val:fN(S_.n_cambios_año.p50,0), c:COLS.orange},
    {name:"T° cambio (min)", val:fP(S_.t_cambio_min.p50,0),  c:COLS.yellow},
    {name:"Horas perdidas",  val:fP(S_.h_cambios_año.p50,0)+"h", c:COLS.red},
    {name:"% tiempo cambios",val:fPct(S_.pct_tiempo_cambios.p50), c:COLS.pink},
    {name:"Tamaño lote (cj)",val:fN(S_.tam_lote_prom.p50,0), c:COLS.cyan},
    {name:"N° SKUs activos", val:fN(p.n_skus,0),              c:COLS.violet},
  ];
  const energiaData = [
    {name:"kWh/HL (P50)",    val:fP(S_.kwh_x_hl.p50,1),     c:COLS.yellow},
    {name:"Total GWh/año",   val:fP(S_.kwh_total.p50,2),     c:COLS.orange},
    {name:"Costo energía (M)",val:fM(S_.costo_energia.p50),  c:COLS.red},
    {name:"Agua L/L prod.",  val:fP(S_.agua_x_hl.p50,2),     c:COLS.sky},
    {name:"CO₂ g/L prod.",   val:fP(S_.co2_x_hl.p50,1),      c:COLS.teal},
    {name:"Vol. HL/año (k)", val:fN(S_.vol_hl_total.p50,0),  c:COLS.green},
  ];
  const benchKwh = [{name:"World class",val:10},{name:"Bueno",val:14},{name:"Promedio",val:18},{name:"Mejorar",val:25}];

  return (
    <div className="rg-2" style={{animation:"fadeUp 0.35s"}}>

      <Panel title="🔄 Cambios de Referencia — SKUs" sub={`${p.n_skus} SKUs · Tamaño lote impacta frecuencia de cambios y disponibilidad`}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))",gap:8,marginBottom:14}}>
          {cambiosData.map(({name,val,c})=>(
            <div key={name} style={{background:"#F8F8F4",borderRadius:7,padding:"10px 11px",border:`1px solid ${c}22`}}>
              <div style={{fontSize:11,color:"#7A7A7A"}}>{name}</div>
              <div style={{fontSize:17,fontWeight:800,color:c,fontFamily:"monospace",marginTop:2}}>{val}</div>
            </div>
          ))}
        </div>
        <div style={{background:"#F0F0EA",borderRadius:8,padding:"11px 14px",border:"1px solid #0d2035"}}>
          <div style={{fontSize:10,color:"#3A6A3A",marginBottom:6}}>Impacto de cambios en disponibilidad efectiva</div>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <div style={{flex:1}}>
              <div style={{fontSize:11,color:"#7A7A7A",marginBottom:3}}>OEE nominal</div>
              <div style={{background:"#EEF0EA",borderRadius:4,height:12,overflow:"hidden"}}>
                <div style={{width:`${S_.oee.p50*100}%`,height:"100%",background:COLS.violet,borderRadius:4}}/>
              </div>
            </div>
            <div style={{flex:1}}>
              <div style={{fontSize:11,color:"#7A7A7A",marginBottom:3}}>% tiempo en cambios</div>
              <div style={{background:"#EEF0EA",borderRadius:4,height:12,overflow:"hidden"}}>
                <div style={{width:`${Math.min(S_.pct_tiempo_cambios.p50*100*5,100)}%`,height:"100%",background:COLS.red,borderRadius:4}}/>
              </div>
            </div>
          </div>
          <div style={{fontSize:11,color:"#7A8A7A",marginTop:8}}>
            Reducir T° de cambio en 30% libera ~{fP(S_.h_cambios_año.p50*0.30,0)}h/año de producción adicional
          </div>
        </div>
      </Panel>

      <Panel title="⚡ Consumo Energético & Sostenibilidad" sub="kWh/HL es el KPI estándar de benchmark en la industria de bebidas">
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))",gap:8,marginBottom:14}}>
          {energiaData.map(({name,val,c})=>(
            <div key={name} style={{background:"#F8F8F4",borderRadius:7,padding:"10px 11px",border:`1px solid ${c}22`}}>
              <div style={{fontSize:11,color:"#7A7A7A"}}>{name}</div>
              <div style={{fontSize:17,fontWeight:800,color:c,fontFamily:"monospace",marginTop:2}}>{val}</div>
            </div>
          ))}
        </div>
        <div style={{fontSize:10,color:"#3A6A3A",marginBottom:8}}>Benchmarks kWh/HL — Industria bebidas</div>
        <ResponsiveContainer width="100%" height={130}>
          <BarChart data={benchKwh} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke="#E0DDD5" horizontal={false}/>
            <XAxis type="number" tick={{fill:"#7A7A7A",fontSize:11}} tickFormatter={v=>`${v} kWh`}/>
            <YAxis type="category" dataKey="name" tick={{fill:"#4A6A5A",fontSize:11}} width={72}/>
            <Tooltip contentStyle={{background:"#FFFFFF",border:"1px solid #0f1e2e",fontSize:10}} formatter={v=>[`${v} kWh/HL`]}/>
            <Bar dataKey="val" radius={[0,4,4,0]}>
              {benchKwh.map((_,i)=><Cell key={i} fill={[COLS.green,COLS.teal,COLS.yellow,COLS.red][i]} fillOpacity={0.8}/>)}
            </Bar>
            <ReferenceLine x={S_.kwh_x_hl.p50} stroke={COLS.cyan} strokeWidth={2} strokeDasharray="5 3"
              label={{value:`Tu P50: ${fP(S_.kwh_x_hl.p50,1)}`,fill:COLS.cyan,fontSize:11}}/>
          </BarChart>
        </ResponsiveContainer>
        <div style={{display:"flex",gap:12,marginTop:12,padding:"9px 12px",background:"#F0F0EA",borderRadius:8,border:"1px solid #0d2035",flexWrap:"wrap"}}>
          <div>
            <div style={{fontSize:11,color:"#7A7A7A"}}>Ratio agua/producto</div>
            <div style={{fontFamily:"monospace",fontSize:14,fontWeight:700,color:COLS.sky}}>{fP(S_.agua_x_hl.p50,2)} L/L</div>
            <div style={{fontSize:10,color:"#7A8A7A"}}>Benchmark &lt;2.0 world class</div>
          </div>
          <div>
            <div style={{fontSize:11,color:"#7A7A7A"}}>Huella carbono</div>
            <div style={{fontFamily:"monospace",fontSize:14,fontWeight:700,color:COLS.teal}}>{fP(S_.co2_x_hl.p50,1)} g/L</div>
            <div style={{fontSize:10,color:"#7A8A7A"}}>Benchmark &lt;5.0 g/L</div>
          </div>
        </div>
      </Panel>
    </div>
  );
}

// ════════════════════════════════════════════════════════
// TRANSPORTE T1 / T2 / TRANSFERENCIAS TAB
// ════════════════════════════════════════════════════════
function TransporteTab({S_, p}) {
  const t1Data = [
    {name:"Viajes/veh./día (P50)", val:fP(S_.viajes_t1_dia.p50,1), c:COLS.cyan},
    {name:"Cap. anual T1 (M cj)",  val:fP(S_.cap_t1_año.p50,2),   c:COLS.green},
    {name:"Turnaround T1 (h)",     val:fP(S_.turnaround_t1.p50,2), c:COLS.yellow},
    {name:"Costo combustible T1 (M)",val:fM(S_.costo_comb_t1.p50), c:COLS.red},
    {name:"N° camiones T1",        val:fN(p.n_camiones_t1,0),      c:COLS.violet},
    {name:"Rendimiento (km/gal)",   val:fP(p.rend_comb_t1,1)+" km/gal", c:COLS.lime},
    {name:"Km planta→CEDIS",       val:fN(p.km_t1,0)+" km",        c:COLS.orange},
  ];
  const t2Data = [
    {name:"Viajes/veh./día (P50)", val:fP(S_.viajes_t2_dia.p50,1), c:COLS.cyan},
    {name:"Cap. anual T2 (M cj)",  val:fP(S_.cap_t2_año.p50,2),   c:COLS.green},
    {name:"Turnaround T2 (h)",     val:fP(S_.turnaround_t2.p50,2), c:COLS.yellow},
    {name:"Costo combustible T2 (M)",val:fM(S_.costo_comb_t2.p50), c:COLS.red},
    {name:"N° vehículos T2",       val:fN(p.n_vehiculos,0),         c:COLS.violet},
    {name:"Rendimiento (km/gal)",   val:fP(p.rend_comb_t2,1)+" km/gal", c:COLS.lime},
    {name:"Drop size (cj/entrega)",val:fN(S_.drop_size.p50,0),     c:COLS.orange},
  ];
  const transData = [
    {name:"% vol. redistribuido",  val:fPct(S_.pct_vol_transfer.p50), c:COLS.sky},
    {name:"Vol. transferido (M cj)",val:fP(S_.vol_transfer_año.p50,2),c:COLS.teal},
    {name:"Camiones transfer req.", val:fN(S_.n_camiones_trans_req.p50,0), c:COLS.violet},
    {name:"Km prom. C→C",          val:fN(S_.km_cedis_cedis.p50,0)+" km",c:COLS.orange},
    {name:"Turnaround transfer (h)",val:fP(S_.turnaround_trans.p50,2),c:COLS.yellow},
    {name:"Costo transferencias (M)",val:fM(S_.costo_transfer.p50),   c:COLS.red},
  ];

  const chartData = [
    {name:"T1 Planta→CEDIS", costo:+(S_.costo_comb_t1.p50).toFixed(2), cap:+(S_.cap_t1_año.p50).toFixed(2), c:COLS.cyan},
    {name:"T2 CEDIS→PDV",    costo:+(S_.costo_comb_t2.p50).toFixed(2), cap:+(S_.cap_t2_año.p50).toFixed(2), c:COLS.green},
    {name:"Transferencias",  costo:+(S_.costo_transfer.p50).toFixed(2),cap:+(S_.vol_transfer_año.p50).toFixed(2),c:COLS.violet},
  ];

  function TierPanel({title, data, color}) {
    return (
      <Panel title={title}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:8,marginBottom:10}}>
          {data.map(({name,val,c})=>(
            <div key={name} style={{background:"#F8F8F4",borderRadius:7,padding:"9px 11px",border:`1px solid ${c}22`}}>
              <div style={{fontSize:11,color:"#7A7A7A"}}>{name}</div>
              <div style={{fontSize:15,fontWeight:800,color:c,fontFamily:"monospace",marginTop:2}}>{val}</div>
            </div>
          ))}
        </div>
      </Panel>
    );
  }

  return (
    <div className="rg-2" style={{animation:"fadeUp 0.35s"}}>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:12}}>
        <TierPanel title="🚚 T1 — Planta → CEDIS" data={t1Data} color={COLS.cyan}/>
        <TierPanel title="🛻 T2 — CEDIS → PDV" data={t2Data} color={COLS.green}/>
        <TierPanel title="🔁 Transferencias CEDIS↔CEDIS" data={transData} color={COLS.violet}/>
      </div>

      <Panel title="Comparativa de costos y capacidad por eslabón" sub="Costo combustible (M USD) y volumen manejado (M cj) — P50">
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E0DDD5" vertical={false}/>
            <XAxis dataKey="name" tick={{fill:"#4A6A5A",fontSize:10}}/>
            <YAxis yAxisId="costo" tick={{fill:"#7A7A7A",fontSize:11}} tickFormatter={v=>`$${v}M`}/>
            <YAxis yAxisId="cap" orientation="right" tick={{fill:"#7A7A7A",fontSize:11}} tickFormatter={v=>`${v}M cj`}/>
            <Tooltip contentStyle={{background:"#FFFFFF",border:"1px solid #0f1e2e",fontSize:10}}/>
            <Bar yAxisId="costo" dataKey="costo" name="Costo comb. (M USD)" radius={[4,4,0,0]}>
              {chartData.map((d,i)=><Cell key={i} fill={d.c} fillOpacity={0.85}/>)}
            </Bar>
            <Bar yAxisId="cap" dataKey="cap" name="Cap./Vol. (M cj)" radius={[4,4,0,0]} fillOpacity={0.35}>
              {chartData.map((d,i)=><Cell key={i} fill={d.c}/>)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Panel>

      <Panel title="Red de CEDIS — Vista estructural" sub={`${p.n_cedis} CEDIS · ${fPct(S_.pct_vol_transfer.p50)} del volumen se redistribuye lateralmente`}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,padding:"14px 0",flexWrap:"wrap"}}>
          {/* Planta */}
          <div style={{textAlign:"center"}}>
            <div style={{width:70,height:50,background:"linear-gradient(135deg,#2D5016,#4A7C2F)",borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,color:"#fff"}}>🏭 Planta</div>
            <div style={{fontSize:10,color:"#7A7A7A",marginTop:3}}>{fP(S_.vol_neto_total.p50,1)}M cj/año</div>
          </div>
          {/* T1 arrow */}
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:11,color:COLS.cyan,fontFamily:"monospace"}}>T1→</div>
            <div style={{fontSize:7,color:"#7A8A7A"}}>{fN(p.km_t1,0)}km</div>
            <div style={{fontSize:7,color:"#7A8A7A"}}>{fP(S_.viajes_t1_dia.p50,1)}v/d</div>
          </div>
          {/* CEDIS */}
          {Array.from({length:Math.min(p.n_cedis,5)},(_,i)=>(
            <div key={i} style={{textAlign:"center"}}>
              <div style={{width:60,height:44,background:"#E8F0E0",border:"1px solid #00e5ff44",borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:COLS.cyan}}>
                🏪 CD{i+1}
              </div>
              <div style={{fontSize:7,color:"#7A7A7A",marginTop:2}}>{fP(S_.dias_inv_cedis.p50,0)}d inv.</div>
              {i<Math.min(p.n_cedis,5)-1&&<div style={{fontSize:10,color:COLS.violet,marginTop:2}}>↔ {fN(S_.km_cedis_cedis.p50,0)}km</div>}
            </div>
          ))}
          {/* T2 arrow */}
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:11,color:COLS.green,fontFamily:"monospace"}}>→T2</div>
            <div style={{fontSize:7,color:"#7A8A7A"}}>{fN(p.km_entrega,0)}km</div>
          </div>
          {/* PDV */}
          <div style={{textAlign:"center"}}>
            <div style={{width:56,height:44,background:"#DFF0D8",border:"1px solid #69ff8744",borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:COLS.green}}>
              🏪 PDVs
            </div>
            <div style={{fontSize:7,color:"#7A7A7A",marginTop:2}}>{fN(p.n_pdvs,0)}</div>
          </div>
        </div>
        <div style={{display:"flex",gap:16,marginTop:8,fontSize:11,justifyContent:"center",flexWrap:"wrap"}}>
          {[[COLS.cyan,"T1 (Planta→CEDIS)"],[COLS.violet,"Transfer. CEDIS↔CEDIS"],[COLS.green,"T2 (CEDIS→PDV)"]].map(([c,l])=>(
            <span key={l} style={{display:"flex",alignItems:"center",gap:5,color:"#5A5A5A"}}>
              <span style={{width:10,height:10,borderRadius:2,background:c,display:"inline-block"}}/>
              {l}
            </span>
          ))}
        </div>
      </Panel>
    </div>
  );
}

// ════════════════════════════════════════════════════════
// INVENTARIOS MP & EMPAQUE TAB
// ════════════════════════════════════════════════════════
function InventariosTab({S_, p}) {
  const mpRows = [
    {mat:"Concentrado",    dias:S_.dias_inv_concentrado, lead:S_.lead_conc,   c:COLS.cyan,   icon:"🧪", bench:14},
    {mat:"Azúcar",         dias:S_.dias_inv_azucar,      lead:S_.lead_azucar, c:COLS.yellow, icon:"🍬", bench:21},
    {mat:"CO₂",            dias:S_.dias_inv_co2,         lead:S_.lead_co2,    c:COLS.sky,    icon:"💨", bench:7},
  ];
  const empRows = [
    {mat:"Envase retornable",   dias:S_.dias_inv_envase_ret,  lead:null,          c:COLS.green,  icon:"♻️", bench:15},
    {mat:"Envase no retornable",dias:S_.dias_inv_envase_nret, lead:S_.lead_envase,c:COLS.teal,   icon:"🍶", bench:20},
    {mat:"Tapas",               dias:S_.dias_inv_tapas,       lead:null,          c:COLS.violet, icon:"🔵", bench:20},
    {mat:"Etiquetas",           dias:S_.dias_inv_etiquetas,   lead:null,          c:COLS.pink,   icon:"🏷️", bench:15},
    {mat:"Cartón / Film",       dias:S_.dias_inv_carton,      lead:null,          c:COLS.orange, icon:"📦", bench:18},
  ];
  const secRows = [
    {mat:"Film stretch",   dias:S_.dias_inv_stretch, lead:S_.lead_emb_sec, c:COLS.lime,   icon:"🎞️", bench:7},
    {mat:"Pallets",        dias:S_.dias_inv_pallets, lead:null,            c:COLS.orange, icon:"🪵", bench:10},
    {mat:"Esquineros",     dias:S_.dias_inv_esquin,  lead:null,            c:COLS.yellow, icon:"📐", bench:5},
  ];

  function InvTable({title, rows, icon}) {
    return (
      <Panel title={`${icon} ${title}`} style={{marginBottom:0}}>
        <div style={{overflowX:"auto",WebkitOverflowScrolling:"touch"}}>
<table style={{width:"100%",borderCollapse:"collapse",fontSize:10}}>
          <thead>
            <tr style={{borderBottom:"1px solid #0e1e2e"}}>
              {["Material","Días inv. (P50)","Lead Time","Stock seg.","vs Bench","Estado"].map(h=>(
                <th key={h} style={{padding:"5px 8px",textAlign:h==="Material"?"left":"right",color:"#7A7A7A",fontWeight:600,fontSize:11}}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({mat,dias,lead,c,icon,bench},i)=>{
              const d = dias.p50;
              const leadVal = lead ? lead.p50 : "—";
              const ss = lead ? +(1.65 * (lead.p50||0) * 0.20).toFixed(1) : "—";
              const vs = d - bench;
              const stColor = d > bench*1.3 ? COLS.orange : d < bench*0.7 ? COLS.red : COLS.green;
              return (
                <tr key={mat} style={{background:i%2===0?"transparent":"#F8F8F4",borderBottom:"1px solid #0a1825"}}>
                  <td style={{padding:"6px 8px",color:"#2D5016"}}>{icon} {mat}</td>
                  <td style={{padding:"6px 8px",textAlign:"right",fontFamily:"monospace",fontWeight:700,color:c}}>{fP(d,0)}d</td>
                  <td style={{padding:"6px 8px",textAlign:"right",fontFamily:"monospace",color:"#4A6A5A"}}>{typeof leadVal==="number"?fP(leadVal,0)+"d":leadVal}</td>
                  <td style={{padding:"6px 8px",textAlign:"right",fontFamily:"monospace",color:"#3A6A3A"}}>{typeof ss==="number"?fP(ss,1)+"d":ss}</td>
                  <td style={{padding:"6px 8px",textAlign:"right",fontFamily:"monospace",color:vs>0?COLS.orange:COLS.green}}>
                    {vs>0?"+":""}{fP(vs,0)}d
                  </td>
                  <td style={{padding:"6px 8px",textAlign:"right"}}>
                    <span style={{background:`${stColor}18`,border:`1px solid ${stColor}44`,color:stColor,borderRadius:4,padding:"1px 6px",fontSize:10,fontWeight:700}}>
                      {d>bench*1.3?"EXCESO":d<bench*0.7?"BAJO":"OK"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
</div>
      </Panel>
    );
  }

  return (
    <div className="rg-2" style={{animation:"fadeUp 0.35s"}}>
      {/* Capital inmovilizado banner */}
      <div style={{background:"linear-gradient(135deg,#F0F8E8,#EAF5EA)",border:"1px solid #0e2035",borderRadius:12,padding:"14px 20px",display:"flex",gap:24,alignItems:"center",flexWrap:"wrap"}}>
        {[
          ["Capital inmovilizado MP+Empaque (M USD)",S_.inv_total_mp,fM,COLS.cyan],
          ["Costo financiero inv. (M USD/año)",S_.costo_fin_inv_mp,fM,COLS.red],
          ["% Roturas de proveedor",S_.pct_rotura_prov,fPct,COLS.orange],
        ].map(([l,s,f,c])=>(
          <div key={l}>
            <div style={{fontSize:11,color:"#7A7A7A"}}>{l}</div>
            <div style={{fontFamily:"monospace",fontSize:20,fontWeight:800,color:c,lineHeight:1.1}}>{f(s.p50)}</div>
            <div style={{fontSize:10,color:"#7A8A7A"}}>P10:{f(s.p10)} · P90:{f(s.p90)}</div>
          </div>
        ))}
      </div>

      <InvTable title="Materias Primas" rows={mpRows} icon="🧪"/>
      <InvTable title="Material de Empaque Primario" rows={empRows} icon="🗃"/>
      <InvTable title="Embalaje Secundario & Terciario" rows={secRows} icon="📦"/>

      {/* Risk heatmap */}
      <Panel title="🚨 Riesgo de Desabasto — Lead Time vs Días de Inventario" sub="Zona roja = días inventario < lead time (riesgo de paro de línea)">
        <ResponsiveContainer width="100%" height={200}>
          <BarChart layout="vertical" data={[
            ...mpRows.map(r=>({name:r.mat, dias:r.dias.p50, lead:r.lead?r.lead.p50:0, c:r.c})),
            ...empRows.filter(r=>r.lead).map(r=>({name:r.mat, dias:r.dias.p50, lead:r.lead?r.lead.p50:0, c:r.c})),
            {name:"Film stretch", dias:S_.dias_inv_stretch.p50, lead:S_.lead_emb_sec.p50, c:COLS.lime},
          ]}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E0DDD5" horizontal={false}/>
            <XAxis type="number" tick={{fill:"#7A7A7A",fontSize:11}} tickFormatter={v=>`${v}d`}/>
            <YAxis type="category" dataKey="name" tick={{fill:"#4A6A5A",fontSize:11}} width={120}/>
            <Tooltip contentStyle={{background:"#FFFFFF",border:"1px solid #0f1e2e",fontSize:10}} formatter={(v,n)=>[`${fP(v,0)} días`,n]}/>
            <Bar dataKey="lead" name="Lead Time proveedor" fill={COLS.red} fillOpacity={0.6} radius={[0,3,3,0]}/>
            <Bar dataKey="dias" name="Días de inventario" fill={COLS.cyan} fillOpacity={0.7} radius={[0,3,3,0]}/>
          </BarChart>
        </ResponsiveContainer>
        <div style={{fontSize:11,color:"#7A8A7A",marginTop:6}}>Barra azul debe superar siempre a la roja para evitar paro de producción</div>
      </Panel>
    </div>
  );
}

// ════════════════════════════════════════════════════════
// CAPACIDAD INTEGRADA — 3 formatos por eslabón
// ════════════════════════════════════════════════════════
function CapacidadTab({S_, p}) {

  // ── Build gap objects with P10/P50/P90 gap distributions ──
  const avail_pdvs   = S_.pdvs_x_vendedor.p50 * p.n_vendedores;
  const avail_pdvs10 = S_.pdvs_x_vendedor.p10 * p.n_vendedores;
  const avail_pdvs90 = S_.pdvs_x_vendedor.p90 * p.n_vendedores;

  const avail_dist   = S_.vol_neto_total.p50 * S_.pct_cap_dist.p50;
  const avail_dist10 = S_.vol_neto_total.p10 * S_.pct_cap_dist.p10;
  const avail_dist90 = S_.vol_neto_total.p90 * S_.pct_cap_dist.p90;

  const GAPS = [
    {
      id:"ventas", icon:"🧑‍💼", label:"Fuerza de Ventas → PDVs",
      kpi:"Cobertura de puntos de venta",
      req:p.n_pdvs, avail:avail_pdvs,
      avail10:avail_pdvs10, avail90:avail_pdvs90,
      unit:"PDVs", unitShort:"PDVs",
      gap50:avail_pdvs - p.n_pdvs,
      gap10:avail_pdvs10 - p.n_pdvs,
      gap90:avail_pdvs90 - p.n_pdvs,
      pct:avail_pdvs/p.n_pdvs,
      benchHi:1.10, benchLo:0.90,
      rows:[
        ["Vendedores disponibles",   fN(p.n_vendedores,0),        "personas"],
        ["PDVs/vendedor/semana (P50)",fN(S_.pdvs_x_vendedor.p50,0),"PDVs"],
        ["Visitas/día (P50)",         fN(S_.visitas_dia.p50,1),    "visitas"],
        ["T° atención + desplaz.",   `${p.t_atencion_min}+${p.t_desp_min}`,"min"],
        ["Frecuencia visita",         fP(p.frec_visita_sem,1),     "×/sem"],
        ["PDVs a cubrir",             fN(p.n_pdvs,0),              "PDVs"],
      ],
      detail:"Capacidad semanal de la FV vs universo de PDVs a atender",
    },
    {
      id:"dist", icon:"🚛", label:"Flota → Volumen a distribuir",
      kpi:"Capacidad de distribución",
      req:S_.vol_neto_total.p50, avail:avail_dist,
      avail10:avail_dist10, avail90:avail_dist90,
      unit:"M cj/año", unitShort:"M cj",
      gap50:avail_dist - S_.vol_neto_total.p50,
      gap10:avail_dist10 - S_.vol_neto_total.p10,
      gap90:avail_dist90 - S_.vol_neto_total.p90,
      pct:S_.pct_cap_dist.p50,
      benchHi:1.15, benchLo:0.95,
      rows:[
        ["Vehículos disponibles",    fN(p.n_vehiculos,0),              "unidades"],
        ["Capacidad carga",           fN(p.cap_carga_veh,0),            "cj/vehículo"],
        ["Drop size (P50)",           fN(S_.drop_size.p50,0),           "cj/entrega"],
        ["Entregas/vehículo/día (P50)",fN(S_.n_entregas_dia.p50,1),    "entregas"],
        ["% Ocupación (P50)",         fPct(S_.pct_ocup_veh.p50),        ""],
        ["% Utilización flota (P50)", fPct(S_.pct_util_veh.p50),        ""],
      ],
      detail:"Cajas que la flota puede mover vs cajas que produce la planta",
    },
    {
      id:"almacen", icon:"🏪", label:"Almacén → Inventario",
      kpi:"Ocupación del CD",
      req:S_.pallets_inventario.p50, avail:p.posiciones_cd,
      avail10:p.posiciones_cd, avail90:p.posiciones_cd,
      unit:"pallets", unitShort:"pal.",
      gap50:S_.gap_almacen.p50,
      gap10:p.posiciones_cd - S_.pallets_inventario.p90,
      gap90:p.posiciones_cd - S_.pallets_inventario.p10,
      pct:S_.pct_ocup_cd_real.p50,
      benchHi:0.85, benchLo:0.95, invertBench:true,
      rows:[
        ["Posiciones disponibles",    fN(p.posiciones_cd,0),            "posiciones"],
        ["Pallets en inventario (P50)",fN(S_.pallets_inventario.p50,0), "pallets"],
        ["Cajas/pallet",              fN(p.cj_x_pallet,0),             "cj"],
        ["Rotación inventario (P50)", fP(S_.inv_rot.p50,1),            "×/año"],
        ["Días inventario (P50)",     fP(S_.dias_inv.p50,0),           "días"],
        ["% Ocupación (P50)",         fPct(S_.pct_ocup_cd_real.p50),   ""],
      ],
      detail:"Posiciones de rack disponibles vs pallets de inventario promedio",
    },
    {
      id:"pickers", icon:"👷", label:"Pickers → Pedidos a preparar",
      kpi:"Capacidad de preparación de pedidos",
      req:S_.pickers_requeridos.p50, avail:p.n_pickers,
      avail10:p.n_pickers, avail90:p.n_pickers,
      unit:"pickers", unitShort:"picks.",
      gap50:S_.gap_pickers.p50,
      gap10:p.n_pickers - S_.pickers_requeridos.p90,
      gap90:p.n_pickers - S_.pickers_requeridos.p10,
      pct:p.n_pickers/Math.max(S_.pickers_requeridos.p50,1),
      benchHi:1.20, benchLo:0.95,
      rows:[
        ["Pickers disponibles",       fN(p.n_pickers,0),                  "personas"],
        ["Pickers requeridos (P50)",  fN(S_.pickers_requeridos.p50,0),    "personas"],
        ["T° prep. pedido (P50)",     fP(S_.t_prep_pedido_min.p50,0),     "min/pedido"],
        ["Pallets/picker/hora",       fN(p.pallets_x_picker_h,0),         "pallets"],
        ["Horas trabajo/día",         fP(p.h_trabajo_dia,0),              "h"],
        ["Gap (P50)",                 (S_.gap_pickers.p50>=0?"+":"")+fN(S_.gap_pickers.p50,0), "pickers"],
      ],
      detail:"Personas requeridas para preparar todos los pedidos del día",
    },
    {
      id:"montacargas", icon:"🏗", label:"Montacargas → Movimiento pallets",
      kpi:"Capacidad de movimiento en CD",
      req:S_.montacargas_req.p50, avail:p.n_montacargas,
      avail10:p.n_montacargas, avail90:p.n_montacargas,
      unit:"montacargas", unitShort:"MTC",
      gap50:S_.gap_montacargas.p50,
      gap10:p.n_montacargas - S_.montacargas_req.p90,
      gap90:p.n_montacargas - S_.montacargas_req.p10,
      pct:p.n_montacargas/Math.max(S_.montacargas_req.p50,1),
      benchHi:1.20, benchLo:0.95,
      rows:[
        ["Montacargas disponibles",   fN(p.n_montacargas,0),             "unidades"],
        ["Requeridos (P50)",          fN(S_.montacargas_req.p50,0),      "unidades"],
        ["Productividad (P50)",       fP(S_.prod_montacargas.p50,1),     "pal./h"],
        ["T° carga vehículo",         fN(p.t_carga_veh_min,0),           "min/veh."],
        ["T° descarga PDV",           fN(p.t_descarga_pdv_min,0),        "min/entrega"],
        ["Gap (P50)",                 (S_.gap_montacargas.p50>=0?"+":"")+fN(S_.gap_montacargas.p50,0),"unidades"],
      ],
      detail:"Equipos de movimiento vs carga de trabajo en el CD",
    },
    {
      id:"planta", icon:"🏭", label:"Planta → Volumen demandado",
      kpi:"Capacidad instalada vs producción real",
      req:S_.vol_neto_total.p50, avail:S_.cap_instalada.p50,
      avail10:S_.cap_instalada.p10, avail90:S_.cap_instalada.p90,
      unit:"M cj/año", unitShort:"M cj",
      gap50:(S_.cap_instalada.p50-S_.vol_neto_total.p50),
      gap10:(S_.cap_instalada.p10-S_.vol_neto_total.p90),
      gap90:(S_.cap_instalada.p90-S_.vol_neto_total.p10),
      pct:S_.vol_neto_total.p50/Math.max(S_.cap_instalada.p50,0.001),
      benchHi:0.85, benchLo:0.95, invertBench:true,
      rows:[
        ["Cap. instalada (teórica)",  `${fN(p.vel_teorica,0)} × ${p.nLines} × ${fN(p.horas_año,0)}h`, "cj/año"],
        ["Producción real (P50)",     fP(S_.vol_neto_total.p50,2),      "M cj"],
        ["OEE (P50)",                 fPct(S_.oee.p50),                 ""],
        ["Disponibilidad (P50)",      fPct(S_.disponibilidad.p50),      ""],
        ["Rendimiento (P50)",         fPct(S_.rendimiento.p50),         ""],
        ["Scrap (P50)",               fPct(S_.scrap_pct.p50,2),         ""],
      ],
      detail:"Capacidad teórica instalada (vel. nominal × horas × líneas) vs output real con OEE",
    },
  ];

  // ── Chart data: Requerido vs Disponible P10/P50/P90 ──
  const chartData = GAPS.map(g => ({
    name: g.icon+" "+g.label.split("→")[0].trim(),
    Requerido: +(g.req).toFixed(2),
    Disponible_P50: +(g.avail).toFixed(2),
    Disponible_P10: +(g.avail10).toFixed(2),
    Disponible_P90: +(g.avail90).toFixed(2),
    pct: +(g.pct*100).toFixed(1),
    color: g.gap50 >= 0 ? COLS.green : COLS.red,
  }));

  // normalise to % of required for the bar chart
  const chartDataNorm = GAPS.map(g => ({
    name: g.icon+" "+g.label.split(" →")[0].replace("Fuerza de ","FV "),
    "Disp/Req %": +(g.avail/Math.max(g.req,0.001)*100).toFixed(1),
    "P10 %": +(g.avail10/Math.max(g.req,0.001)*100).toFixed(1),
    "P90 %": +(g.avail90/Math.max(g.req,0.001)*100).toFixed(1),
    gap: g.gap50,
    color: g.gap50>=0 ? COLS.green : COLS.red,
  }));

  const [selected, setSelected] = useState(null);
  const sel = selected !== null ? GAPS[selected] : null;

  // traffic light
  const tlg = (g) => {
    if(g.invertBench) return g.pct <= g.benchHi ? COLS.green : g.pct <= g.benchLo ? COLS.yellow : COLS.red;
    return g.pct >= g.benchHi ? COLS.green : g.pct >= g.benchLo ? COLS.yellow : COLS.red;
  };

  return (
    <div style={{animation:"fadeUp 0.35s"}}>

      {/* ── TÍTULO ── */}
      <div style={{marginBottom:14}}>
        <div style={{fontSize:16,fontWeight:800,color:"#1A1A1A",marginBottom:3}}>⚖️ Análisis Integral de Capacidad</div>
        <div style={{fontSize:10,color:"#7A7A7A"}}>
          Semáforo · Tabla numérica (déficit/superávit) · Gráfico de brecha — todos los eslabones de la cadena
        </div>
      </div>

      {/* ══ FORMATO 1: SEMÁFORO EJECUTIVO ══════════════════════════════ */}
      <div style={{background:"#FFFFFF",border:"1px solid #0f1e2e",borderRadius:12,padding:"16px 18px",marginBottom:14}}>
        <div style={{fontSize:11,fontWeight:700,color:"#4A6A5A",marginBottom:12}}>
          🚦 Semáforo Ejecutivo — Estado de Capacidad por Eslabón
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))",gap:10}}>
          {GAPS.map((g,i)=>{
            const c = tlg(g);
            const surplus = g.gap50 >= 0;
            return (
              <div key={g.id}
                onClick={()=>setSelected(selected===i?null:i)}
                style={{
                  background: selected===i ? "#DFF0D8" : "#F8F8F4",
                  border:`2px solid ${selected===i ? c : c+"44"}`,
                  borderRadius:10, padding:"12px 14px", cursor:"pointer",
                  transition:"all 0.2s",
                }}>
                {/* light */}
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
                  <div style={{
                    width:14,height:14,borderRadius:"50%",background:c,
                    boxShadow:`0 0 8px ${c}, 0 0 20px ${c}55`, flexShrink:0,
                  }}/>
                  <div style={{fontSize:10,fontWeight:700,color:"#2D5016",lineHeight:1.2}}>{g.label}</div>
                </div>
                {/* big number */}
                <div style={{fontFamily:"monospace",fontSize:22,fontWeight:900,color:c,lineHeight:1}}>
                  {g.invertBench
                    ? fPct(g.pct)
                    : fPct(g.avail/Math.max(g.req,0.001))}
                </div>
                <div style={{fontSize:11,color:"#7A7A7A",marginTop:3}}>{g.kpi}</div>
                {/* gap badge */}
                <div style={{
                  marginTop:8, display:"inline-flex", alignItems:"center", gap:5,
                  background: surplus?"#69ff8712":"#ff525212",
                  border:`1px solid ${surplus?COLS.green:COLS.red}33`,
                  borderRadius:5, padding:"3px 8px",
                }}>
                  <span style={{fontSize:11,fontFamily:"monospace",fontWeight:700,color:surplus?COLS.green:COLS.red}}>
                    {surplus?"+":""}{fN(g.gap50,0)} {g.unitShort}
                  </span>
                  <span style={{fontSize:10,color:surplus?COLS.green+"88":COLS.red+"88"}}>
                    {surplus?"SUPERÁVIT":"DÉFICIT"}
                  </span>
                </div>
                {selected===i && <div style={{fontSize:11,color:"#4A7C2F",marginTop:6}}>▼ ver detalle abajo</div>}
              </div>
            );
          })}
        </div>
      </div>

      {/* ══ FORMATO 2: GRÁFICO DE BRECHA ══════════════════════════════ */}
      <div style={{background:"#FFFFFF",border:"1px solid #0f1e2e",borderRadius:12,padding:"16px 18px",marginBottom:14}}>
        <div style={{fontSize:11,fontWeight:700,color:"#4A6A5A",marginBottom:4}}>
          📊 Gráfico de Brecha — Capacidad Disponible como % de Requerida (P50)
        </div>
        <div style={{fontSize:11,color:"#7A8A7A",marginBottom:14}}>
          100% = exactamente suficiente · &gt;100% = superávit · &lt;100% = cuello de botella
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartDataNorm} layout="vertical" margin={{left:10,right:40}}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E0DDD5" horizontal={false}/>
            <XAxis type="number" tick={{fill:"#7A7A7A",fontSize:11}}
              tickFormatter={v=>`${v}%`} domain={[0,Math.max(150, ...chartDataNorm.map(d=>d["Disp/Req %"]*1.05))]}/>
            <YAxis type="category" dataKey="name" tick={{fill:"#4A6A5A",fontSize:11}} width={110}/>
            <Tooltip
              contentStyle={{background:"#FFFFFF",border:"1px solid #0f1e2e",fontSize:10}}
              formatter={(v,n)=>[`${fP(v,1)}%`,n]}/>
            <ReferenceLine x={100} stroke={COLS.yellow} strokeWidth={2} strokeDasharray="5 3"
              label={{value:"100% (equilibrio)",fill:COLS.yellow,fontSize:11,position:"top"}}/>
            <ReferenceLine x={85} stroke={COLS.red+"88"} strokeDasharray="3 3"/>
            <Bar dataKey="Disp/Req %" radius={[0,4,4,0]} minPointSize={3}>
              {chartDataNorm.map((d,i)=>(
                <Cell key={i}
                  fill={d["Disp/Req %"]>=100 ? COLS.green : d["Disp/Req %"]>=85 ? COLS.yellow : COLS.red}
                  fillOpacity={0.85}/>
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>

        {/* P10/P50/P90 waterfall for each gap */}
        <div style={{marginTop:14}}>
          <div style={{fontSize:10,color:"#3A6A3A",fontWeight:600,marginBottom:8}}>
            Rango de incertidumbre del gap (P10 / P50 / P90)
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={chartDataNorm} layout="vertical" margin={{left:10,right:40}}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E0DDD5" horizontal={false}/>
              <XAxis type="number" tick={{fill:"#7A7A7A",fontSize:11}} tickFormatter={v=>`${v}%`}/>
              <YAxis type="category" dataKey="name" tick={{fill:"#4A6A5A",fontSize:11}} width={110}/>
              <Tooltip contentStyle={{background:"#FFFFFF",border:"1px solid #0f1e2e",fontSize:10}}
                formatter={(v,n)=>[`${fP(v,1)}%`,n]}/>
              <ReferenceLine x={100} stroke={COLS.gold+"88"} strokeDasharray="4 3"/>
              <Bar dataKey="P10 %" fill={COLS.red} fillOpacity={0.4} radius={[0,3,3,0]} name="Escenario pesimista (P10)"/>
              <Bar dataKey="Disp/Req %" fill={COLS.cyan} fillOpacity={0.7} radius={[0,3,3,0]} name="Escenario base (P50)"/>
              <Bar dataKey="P90 %" fill={COLS.green} fillOpacity={0.4} radius={[0,3,3,0]} name="Escenario optimista (P90)"/>
            </BarChart>
          </ResponsiveContainer>
          <div style={{display:"flex",gap:16,marginTop:8,fontSize:11}}>
            {[[COLS.red,"Pesimista P10"],[COLS.cyan,"Base P50"],[COLS.green,"Optimista P90"]].map(([c,l])=>(
              <span key={l} style={{display:"flex",alignItems:"center",gap:5,color:"#5A5A5A"}}>
                <span style={{width:10,height:10,borderRadius:2,background:c,display:"inline-block"}}/>
                {l}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ══ FORMATO 3: TABLA NUMÉRICA COMPLETA ══════════════════════════ */}
      <div style={{background:"#FFFFFF",border:"1px solid #0f1e2e",borderRadius:12,padding:"16px 18px",marginBottom:14}}>
        <div style={{fontSize:11,fontWeight:700,color:"#4A6A5A",marginBottom:12}}>
          📋 Tabla Numérica — Déficit / Superávit por Eslabón
        </div>
        <div style={{overflowX:"auto",WebkitOverflowScrolling:"touch"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:10}}>
            <thead>
              <tr style={{borderBottom:"1px solid #0e1e2e"}}>
                {["Eslabón","Requerido","Disponible (P50)","Gap P10","Gap P50","Gap P90","% Uso","Estado"].map(h=>(
                  <th key={h} style={{padding:"7px 10px",textAlign:h==="Eslabón"?"left":"right",color:"#7A7A7A",fontWeight:600,whiteSpace:"nowrap"}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {GAPS.map((g,i)=>{
                const c = tlg(g);
                const usoPct = g.invertBench ? g.pct : g.avail/Math.max(g.req,0.001);
                return (
                  <tr key={g.id} style={{background:i%2===0?"transparent":"#F8F8F4",borderBottom:"1px solid #0a1825",
                    cursor:"pointer"}} onClick={()=>setSelected(selected===i?null:i)}>
                    <td style={{padding:"8px 10px"}}>
                      <div style={{display:"flex",alignItems:"center",gap:7}}>
                        <div style={{width:8,height:8,borderRadius:"50%",background:c,boxShadow:`0 0 5px ${c}`,flexShrink:0}}/>
                        <span style={{color:"#2D5016",fontWeight:600}}>{g.icon} {g.label}</span>
                      </div>
                    </td>
                    <td style={{padding:"8px 10px",textAlign:"right",fontFamily:"monospace",color:"#3A6A3A"}}>
                      {fN(g.req,1)} {g.unitShort}
                    </td>
                    <td style={{padding:"8px 10px",textAlign:"right",fontFamily:"monospace",color:"#3A6A3A"}}>
                      {fN(g.avail,1)} {g.unitShort}
                    </td>
                    {[g.gap10,g.gap50,g.gap90].map((gv,j)=>(
                      <td key={j} style={{padding:"8px 10px",textAlign:"right",fontFamily:"monospace",
                        color:gv>=0?COLS.green:COLS.red,fontWeight:j===1?700:400}}>
                        {gv>=0?"+":""}{fN(gv,1)}
                      </td>
                    ))}
                    <td style={{padding:"8px 10px",textAlign:"right",fontFamily:"monospace",color:c,fontWeight:700}}>
                      {fPct(g.invertBench ? usoPct : usoPct)}
                    </td>
                    <td style={{padding:"8px 10px",textAlign:"right"}}>
                      <span style={{
                        background:`${c}18`,border:`1px solid ${c}44`,
                        color:c,borderRadius:5,padding:"2px 8px",fontSize:11,fontWeight:700,
                        whiteSpace:"nowrap",
                      }}>
                        {c===COLS.green?"✓ OK":c===COLS.yellow?"⚠ TENSO":"✗ DÉFICIT"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ══ DETALLE EXPANDIBLE AL HACER CLICK EN TARJETA ══════════════ */}
      {sel && (
        <div style={{
          background:"#FFFFFF",border:`1px solid ${tlg(sel)}44`,
          borderRadius:12,padding:"16px 18px",animation:"fadeUp 0.25s",
        }}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <div>
              <div style={{fontSize:13,fontWeight:800,color:"#1A1A1A"}}>{sel.icon} {sel.label}</div>
              <div style={{fontSize:11,color:"#7A7A7A",marginTop:2}}>{sel.detail}</div>
            </div>
            <button onClick={()=>setSelected(null)}
              style={{background:"transparent",border:"1px solid #1a2c3d",color:"#5A5A5A",borderRadius:6,padding:"4px 10px",fontSize:10,cursor:"pointer",fontFamily:"inherit"}}>
              ✕ cerrar
            </button>
          </div>
          {/* KPIs del eslabón */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:8,marginBottom:14}}>
            {sel.rows.map(([l,v,u])=>(
              <div key={l} style={{background:"#F8F8F4",borderRadius:8,padding:"9px 12px",border:"1px solid #0e1e2e"}}>
                <div style={{fontSize:11,color:"#7A7A7A"}}>{l}</div>
                <div style={{fontSize:15,fontWeight:700,color:COLS.cyan,fontFamily:"monospace",marginTop:2}}>
                  {v} <span style={{fontSize:11,color:"#4A7C2F"}}>{u}</span>
                </div>
              </div>
            ))}
          </div>
          {/* Mini gap bar */}
          <div style={{marginTop:4}}>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:"#7A7A7A",marginBottom:4}}>
              <span>Escenario pesimista (P10)</span><span>Base (P50)</span><span>Optimista (P90)</span>
            </div>
            <div style={{display:"flex",gap:6,height:24}}>
              {[
                {v:sel.gap10, l:"P10"},
                {v:sel.gap50, l:"P50"},
                {v:sel.gap90, l:"P90"},
              ].map(({v,l})=>{
                const c = v>=0?COLS.green:COLS.red;
                return (
                  <div key={l} style={{flex:1,background:"#F8F8F4",borderRadius:6,display:"flex",alignItems:"center",justifyContent:"center",border:`1px solid ${c}33`}}>
                    <span style={{fontFamily:"monospace",fontSize:12,fontWeight:700,color:c}}>
                      {v>=0?"+":""}{fN(v,0)} {sel.unitShort}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

// ════════════════════════════════════════════════════════
// DEMANDA TAB
// ════════════════════════════════════════════════════════
function DemandaTab({S_, p, wiz}) {
  const totalDem = S_.vol_demandado?.p50 || 0;
  const totalVend = S_.vol_vendido?.p50 || 0;
  const gap = S_.demanda_gap?.p50 || 0;
  const pctCub = S_.pct_demanda_cubierta?.p50 || 0;
  const gapColor = gap <= 0 ? COLS.green : COLS.red;

  // Monthly seasonality bars
  const meses = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
  const keys  = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
  const estData = meses.map((m,i) => ({
    name: m,
    idx: wiz[`est_${keys[i]}_v`] || 1,
  }));

  // Canal mix
  const mixData = [
    { name:"Moderno",       vol: wiz.vol_moderno_v,       precio: wiz.precio_moderno_v*(1-(wiz.desc_moderno_v||0)),       desc: wiz.desc_moderno_v||0,       color: COLS.cyan },
    { name:"Tradicional",   vol: wiz.vol_tradicional_v,   precio: wiz.precio_tradicional_v*(1-(wiz.desc_tradicional_v||0)),desc: wiz.desc_tradicional_v||0,   color: COLS.green },
    { name:"Institucional", vol: wiz.vol_institucional_v, precio: wiz.precio_institucional_v*(1-(wiz.desc_institucional_v||0)),desc:wiz.desc_institucional_v||0,color: COLS.violet },
  ];
  const totalVol = mixData.reduce((s,d)=>s+d.vol,0);

  // Elasticity sensitivity: +10% price → % vol change
  const elastData = [
    { canal:"Moderno",       elast: wiz.elast_moderno_v,       vol_delta: wiz.vol_moderno_v * wiz.elast_moderno_v * 0.10 },
    { canal:"Tradicional",   elast: wiz.elast_tradicional_v,   vol_delta: wiz.vol_tradicional_v * wiz.elast_tradicional_v * 0.10 },
    { canal:"Institucional", elast: wiz.elast_institucional_v, vol_delta: wiz.vol_institucional_v * wiz.elast_institucional_v * 0.10 },
  ];

  return (
    <div style={{animation:"fadeUp 0.35s", display:"grid", gap:12}}>

      {/* Capacity vs demand banner */}
      <div style={{background:"linear-gradient(135deg,#F0F8E8,#EAF5EA)",border:"1px solid #0e2035",borderRadius:12,padding:"16px 22px",display:"flex",gap:24,alignItems:"center",flexWrap:"wrap"}}>
        {[
          ["Demanda total (M cj/año)", fP(totalDem,2), COLS.yellow, "P50"],
          ["Producción disponible (M cj)", fP(S_.vol_neto_total?.p50||0,2), COLS.cyan, "P50"],
          ["Demanda cubierta", fPct(pctCub), pctCub>=1?COLS.green:pctCub>=0.90?COLS.yellow:COLS.red, "P50"],
          ["Gap demanda/oferta (M cj)", (gap>=0?"+":"")+fP(gap,2), gapColor, gap<=0?"Sin restricción":"Demanda no satisfecha"],
          ["Precio prom. ponderado", "$"+fP(S_.precio_prom_canal?.p50||0,2)+"/cj", COLS.orange, "por canal"],
        ].map(([l,v,clr,sub])=>(
          <div key={l}>
            <div style={{fontSize:11,color:"#7A7A7A"}}>{l}</div>
            <div style={{fontSize:20,fontWeight:800,color:clr,fontFamily:"monospace",lineHeight:1.1}}>{v}</div>
            <div style={{fontSize:10,color:"#7A8A7A",marginTop:2}}>{sub}</div>
          </div>
        ))}
      </div>

      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:12}}>
        {/* Canal mix */}
        <Panel title="Mix de Canales — Volumen & Precio" sub="Distribución del volumen demandado por canal">
          {mixData.map(({name,vol,precio,color})=>{
            const pct = vol/Math.max(totalVol,0.001);
            return (
              <div key={name} style={{marginBottom:14}}>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:4}}>
                  <span style={{color:"#2D5016",fontWeight:600}}>{name}</span>
                  <div style={{textAlign:"right"}}>
                    <span style={{fontFamily:"monospace",color,fontSize:10}}>${fP(precio,2)}/cj neto</span>
                    {desc>0&&<span style={{fontFamily:"monospace",fontSize:11,color:COLS.orange,marginLeft:6}}>-{fPct(desc)} desc.</span>}
                  </div>
                </div>
                <div style={{background:"#F8F8F4",borderRadius:4,height:14,overflow:"hidden"}}>
                  <div style={{width:`${pct*100}%`,height:"100%",background:`linear-gradient(90deg,${color}55,${color})`,borderRadius:4}}/>
                </div>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginTop:2}}>
                  <span style={{color:"#7A7A7A"}}>{fPct(pct)} del volumen</span>
                  <span style={{color:"#7A7A7A"}}>Rev: ${fP(vol*precio,1)}M</span>
                </div>
              </div>
            );
          })}
          <div style={{background:"#F0F0EA",borderRadius:8,padding:"10px 12px",border:"1px solid #0d2035",marginTop:4}}>
            <div style={{fontSize:11,color:"#7A7A7A",marginBottom:4}}>Revenue neto total por canales (P50)</div>
            <div style={{fontFamily:"monospace",fontSize:18,fontWeight:800,color:COLS.yellow}}>
              ${fP(S_.rev_canal?.p50||0,1)}M USD/año
            </div>
            <div style={{display:"flex",gap:14,marginTop:6}}>
              {[["Moderno",S_.desc_mod,COLS.cyan],["Tradicional",S_.desc_trad,COLS.green],["Institucional",S_.desc_inst,COLS.violet]].map(([n,s,clr])=>(
                <div key={n}>
                  <div style={{fontSize:10,color:"#7A8A7A"}}>{n}</div>
                  <div style={{fontFamily:"monospace",fontSize:11,fontWeight:700,color:clr}}>{fPct(s?.p50||0)}</div>
                  <div style={{fontSize:7,color:"#7A8A7A"}}>desc. P50</div>
                </div>
              ))}
            </div>
          </div>
        </Panel>

        {/* Elasticity impact */}
        <Panel title="Impacto Elasticidad — +10% en Precio" sub="Variación de volumen esperada si se incrementa 10% el precio por canal">
          {elastData.map(({canal,elast,vol_delta})=>(
            <div key={canal} style={{padding:"10px 12px",background:"#F8F8F4",borderRadius:8,border:"1px solid #0e1e2e",marginBottom:8}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <div style={{fontSize:11,color:"#4A6A5A"}}>{canal}</div>
                  <div style={{fontSize:11,color:"#7A7A7A"}}>Elasticidad: {fP(elast,2)}</div>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{fontSize:16,fontWeight:700,color:COLS.red,fontFamily:"monospace"}}>{fP(vol_delta,2)}M cj</div>
                  <div style={{fontSize:11,color:"#7A7A7A"}}>cambio en volumen</div>
                </div>
              </div>
            </div>
          ))}
          <div style={{fontSize:11,color:"#7A8A7A",marginTop:6}}>Modelo usa elasticidad para proyectar impacto de cambios de precio en la demanda por canal.</div>
        </Panel>
      </div>

      {/* Seasonality */}
      <Panel title="📅 Estacionalidad Mensual" sub="Índice de demanda relativa por mes (1.0 = mes promedio)">
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={estData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E0DDD5" vertical={false}/>
            <XAxis dataKey="name" tick={{fill:"#4A6A5A",fontSize:10}}/>
            <YAxis tick={{fill:"#7A7A7A",fontSize:11}} domain={[0, Math.max(...estData.map(d=>d.idx))*1.15]}/>
            <Tooltip contentStyle={{background:"#FFFFFF",border:"1px solid #0f1e2e",fontSize:10}}
              formatter={v=>[fP(v,2),"Índice"]}/>
            <ReferenceLine y={1} stroke={COLS.gold+"88"} strokeDasharray="4 3"
              label={{value:"Base 1.0",fill:COLS.yellow,fontSize:11}}/>
            <Bar dataKey="idx" radius={[4,4,0,0]}>
              {estData.map((d,i)=>(
                <Cell key={i} fill={d.idx>=1.1?COLS.green:d.idx>=0.9?COLS.cyan:COLS.orange} fillOpacity={0.85}/>
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <div style={{display:"flex",gap:16,marginTop:8,fontSize:11}}>
          {[[COLS.green,"Alto (≥1.10)"],[COLS.cyan,"Normal (0.90-1.09)"],[COLS.orange,"Bajo (<0.90)"]].map(([clr,lbl])=>(
            <span key={lbl} style={{display:"flex",alignItems:"center",gap:5,color:"#5A5A5A"}}>
              <span style={{width:10,height:10,borderRadius:2,background:clr,display:"inline-block"}}/>
              {lbl}
            </span>
          ))}
        </div>
      </Panel>

      {/* Crecimiento */}
      <Panel title="📊 Proyección de Crecimiento" sub="Volumen demandado proyectado por año (tasa compuesta)">
        <ResponsiveContainer width="100%" height={160}>
          <LineChart data={Array.from({length:5},(_,i)=>({
            año:`Año ${i+1}`,
            vol: +((wiz.vol_moderno_v+wiz.vol_tradicional_v+wiz.vol_institucional_v)*Math.pow(1+wiz.crecimiento_anual_v,i)).toFixed(2),
            p10: +((wiz.vol_moderno_v+wiz.vol_tradicional_v+wiz.vol_institucional_v)*Math.pow(1+(wiz.crecimiento_anual_v-wiz.crecimiento_anual_s),i)).toFixed(2),
            p90: +((wiz.vol_moderno_v+wiz.vol_tradicional_v+wiz.vol_institucional_v)*Math.pow(1+(wiz.crecimiento_anual_v+wiz.crecimiento_anual_s),i)).toFixed(2),
          }))}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E0DDD5"/>
            <XAxis dataKey="año" tick={{fill:"#4A6A5A",fontSize:10}}/>
            <YAxis tick={{fill:"#7A7A7A",fontSize:11}} tickFormatter={v=>`${v}M`}/>
            <Tooltip contentStyle={{background:"#FFFFFF",border:"1px solid #0f1e2e",fontSize:10}} formatter={v=>[`${fP(v,2)}M cj`]}/>
            <Line type="monotone" dataKey="p90" stroke={COLS.green+"66"} strokeWidth={1} strokeDasharray="4 3" dot={false} name="P90"/>
            <Line type="monotone" dataKey="vol"  stroke={COLS.cyan}  strokeWidth={2.5} dot={{r:4,fill:COLS.cyan}} name="Base"/>
            <Line type="monotone" dataKey="p10" stroke={COLS.red+"66"}  strokeWidth={1} strokeDasharray="4 3" dot={false} name="P10"/>
          </LineChart>
        </ResponsiveContainer>
      </Panel>
    </div>
  );
}

// ════════════════════════════════════════════════════════
// GOAL SEEK TAB — single metric selector
// ════════════════════════════════════════════════════════
function GoalSeekTab({S_, p, wiz, iter}) {
  const [selectedMetric, setSelectedMetric] = useState("ebitda");
  const [targetVal, setTargetVal] = useState("");
  const [gsResult, setGsResult] = useState(null);
  const [running, setRunning] = useState(false);

  const METRICS = [
    { k:"ebitda",        label:"EBITDA",        color:COLS.yellow, icon:"📊" },
    { k:"ebit",          label:"EBIT",          color:COLS.orange, icon:"📈" },
    { k:"utilidad_neta", label:"Utilidad Neta", color:COLS.green,  icon:"💵" },
    { k:"eva",           label:"EVA",           color:COLS.cyan,   icon:"⭐" },
  ];

  const meta = METRICS.find(m => m.k === selectedMetric);

  const analyze = () => {
    const tgt = parseFloat(targetVal);
    if (isNaN(tgt) || !S_[selectedMetric]) return;
    setRunning(true);
    setTimeout(() => {
      const arr  = S_[selectedMetric].arr;
      const prob = arr.filter(v => v >= tgt).length / arr.length;
      const p50  = S_[selectedMetric].p50;
      const p10  = S_[selectedMetric].p10;
      const p90  = S_[selectedMetric].p90;
      const gap  = tgt - p50;

      // ── Palancas ────────────────────────────────────────────
      const levers = [];
      const rev    = S_.revenue?.p50    || 0;
      const cogs   = S_.cogs_total?.p50 || 0;
      const vol    = (S_.vol_vendido?.p50 || S_.vol_neto_total?.p50 || 1);
      const precioAct = (wiz.precio_moderno_v || p.precio || 8) *
                        (1 - (wiz.desc_moderno_v || 0));

      if (gap > 0) {
        // Palanca 1 — Precio
        const gm_pct    = (rev - cogs) / Math.max(rev, 0.001);
        const rev_need  = rev + gap / Math.max(gm_pct, 0.01);
        const precio_need = rev_need / Math.max(vol, 0.001);
        levers.push({
          lever:     "Precio promedio ponderado",
          actual:    `$${fP(precioAct, 2)}/cj`,
          requerido: `$${fP(precio_need, 2)}/cj`,
          delta:     `+${fP(precio_need - precioAct, 2)}/cj (+${fPct((precio_need - precioAct) / Math.max(precioAct, 0.001))})`,
          factible:  precio_need < precioAct * 1.20,
          icon: "💵",
        });
        // Palanca 2 — Volumen / OEE
        const vol_need  = (rev + gap / Math.max(gm_pct, 0.01)) / Math.max(precioAct, 0.001);
        const oee_need  = (S_.oee?.p50 || 0.75) * (vol_need / Math.max(vol, 0.001));
        levers.push({
          lever:     "OEE requerido",
          actual:    fPct(S_.oee?.p50 || 0),
          requerido: fPct(Math.min(oee_need, 0.98)),
          delta:     `+${fPct(Math.max(oee_need - (S_.oee?.p50 || 0), 0))}`,
          factible:  oee_need <= 0.88,
          icon: "🏭",
        });
        // Palanca 3 — Reducción COGS
        const cogs_target  = cogs - gap * 0.7;
        const cogs_pct_act = cogs / Math.max(rev, 0.001);
        const cogs_pct_tgt = cogs_target / Math.max(rev, 0.001);
        levers.push({
          lever:     "COGS % sobre ingresos",
          actual:    fPct(cogs_pct_act),
          requerido: fPct(cogs_pct_tgt),
          delta:     `${fPct(cogs_pct_tgt - cogs_pct_act)} pp`,
          factible:  cogs_pct_tgt > 0.28,
          icon: "🏭",
        });
        // Palanca 4 — Scrap
        const scrap_act = S_.scrap_pct?.p50 || 0.018;
        if (scrap_act > 0.005) {
          const saving_per_pp = rev * 0.006;
          const pp_need       = gap / Math.max(saving_per_pp, 0.001) / 100;
          const scrap_tgt     = Math.max(scrap_act - pp_need, 0.002);
          levers.push({
            lever:     "Scrap %",
            actual:    fPct(scrap_act, 2),
            requerido: fPct(scrap_tgt, 2),
            delta:     `${fPct(scrap_tgt - scrap_act, 2)} pp`,
            factible:  scrap_tgt >= 0.005,
            icon: "🗑",
          });
        }
        // Palanca 5 — Costo logístico
        const log_act = S_.costo_log?.p50 || 0;
        const log_tgt = Math.max(log_act - gap * 0.3, 0);
        levers.push({
          lever:     "Costo logístico (M USD)",
          actual:    fM(log_act),
          requerido: fM(log_tgt),
          delta:     `-${fM(log_act - log_tgt)}`,
          factible:  log_tgt > log_act * 0.70,
          icon: "🚛",
        });
      }

      setGsResult({ prob, p50, p10, p90, tgt, gap, levers });
      setRunning(false);
    }, 60);
  };

  // Probability donut
  const ProbGauge = ({prob}) => {
    const pct   = Math.min(prob * 100, 100);
    const r=38, cx=48, cy=48, circ = 2 * Math.PI * r;
    const clr   = pct >= 70 ? COLS.green : pct >= 40 ? COLS.yellow : COLS.red;
    const label = pct >= 70 ? "ALCANZABLE" : pct >= 40 ? "POSIBLE" : "DIFÍCIL";
    return (
      <div style={{textAlign:"center"}}>
        <svg width={96} height={96} viewBox="0 0 96 96">
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="#E0DDD5" strokeWidth={11}/>
          <circle cx={cx} cy={cy} r={r} fill="none" stroke={clr} strokeWidth={11}
            strokeDasharray={`${circ*pct/100} ${circ*(1-pct/100)}`}
            strokeLinecap="round" transform="rotate(-90 48 48)"/>
          <text x={cx} y={cy+1} textAnchor="middle" dominantBaseline="middle"
            fill={clr} fontSize="15" fontWeight="bold" fontFamily="monospace">{fP(pct,0)}%</text>
          <text x={cx} y={cy+15} textAnchor="middle" dominantBaseline="middle"
            fill="#5A5A5A" fontSize="8">probabilidad</text>
        </svg>
        <div style={{fontSize:11,fontWeight:700,color:clr,letterSpacing:"0.06em",marginTop:2}}>{label}</div>
      </div>
    );
  };

  return (
    <div style={{animation:"fadeUp 0.35s"}}>

      {/* ── STEP 1: Select metric ── */}
      <Panel title="🎯 Goal Seek — Selecciona la métrica objetivo" style={{marginBottom:12}}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(120px,1fr))",gap:10,marginBottom:20}}>
          {METRICS.map(({k,label,color,icon})=>{
            const active = selectedMetric === k;
            return (
              <div key={k} onClick={()=>{setSelectedMetric(k); setGsResult(null); setTargetVal("");}}
                style={{
                  background: active ? `${color}18` : "#F8F8F4",
                  border: `2px solid ${active ? color : "#E8E5DF"}`,
                  borderRadius:10, padding:"14px 10px", textAlign:"center",
                  cursor:"pointer", transition:"all 0.18s",
                }}>
                <div style={{fontSize:22,marginBottom:6}}>{icon}</div>
                <div style={{fontSize:11,fontWeight:700,color:active?color:"#4A6A5A"}}>{label}</div>
                {S_[k] && (
                  <div style={{fontSize:11,color:"#7A7A7A",marginTop:4,fontFamily:"monospace"}}>
                    Actual P50: {fM(S_[k].p50)}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* ── STEP 2: Enter target ── */}
        <div style={{background:"#F8F8F4",border:`1px solid ${meta?.color}33`,borderRadius:10,padding:"16px 18px"}}>
          <div style={{fontSize:11,color:"#4A6A5A",marginBottom:10,fontWeight:600}}>
            Objetivo para <span style={{color:meta?.color}}>{meta?.label}</span>
          </div>
          <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
            <div style={{position:"relative",flex:1,minWidth:180}}>
              <span style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",fontSize:14,color:"#4A7C2F",fontFamily:"monospace",fontWeight:700}}>$</span>
              <input type="number" step="0.1"
                placeholder={S_[selectedMetric] ? `P50 actual: ${fP(S_[selectedMetric].p50,1)}` : "Ingresa objetivo en M USD"}
                value={targetVal}
                onChange={e=>{setTargetVal(e.target.value); setGsResult(null);}}
                style={{width:"100%",background:"#FFFFFF",border:`1px solid ${meta?.color}88`,borderRadius:8,
                  padding:"12px 12px 12px 28px",color:meta?.color,fontFamily:"'DM Mono',monospace",
                  fontSize:18,fontWeight:800,outline:"none"}}
              />
            </div>
            <span style={{fontSize:11,color:"#7A7A7A",whiteSpace:"nowrap"}}>M USD / año</span>
            <button onClick={analyze}
              disabled={running || !targetVal}
              style={{background: (!targetVal||running)?"#E8EEF5":`linear-gradient(135deg,${meta?.color}88,${meta?.color})`,
                border:"none",color:"#fff",borderRadius:8,padding:"12px 24px",
                fontFamily:"inherit",fontWeight:700,fontSize:12,
                cursor:(!targetVal||running)?"not-allowed":"pointer",
                opacity:(!targetVal||running)?0.5:1,whiteSpace:"nowrap"}}>
              {running ? "⟳ Calculando…" : "🎯 Analizar"}
            </button>
          </div>
          {/* Quick reference */}
          {S_[selectedMetric] && (
            <div style={{display:"flex",gap:20,marginTop:12,flexWrap:"wrap"}}>
              {[["P10 (pesimista)",S_[selectedMetric].p10,COLS.red],
                ["P50 (base)",S_[selectedMetric].p50,meta?.color||COLS.cyan],
                ["P90 (optimista)",S_[selectedMetric].p90,COLS.green]].map(([l,v,c])=>(
                <div key={l}>
                  <div style={{fontSize:10,color:"#7A8A7A"}}>{l}</div>
                  <div style={{fontFamily:"monospace",fontSize:13,fontWeight:700,color:c}}>{fM(v)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Panel>

      {/* ── RESULTS ── */}
      {gsResult && (
        <div style={{animation:"fadeUp 0.3s"}}>
          <Panel style={{border:`1px solid ${(gsResult.prob>=0.70?COLS.green:gsResult.prob>=0.40?COLS.yellow:COLS.red)}44`,marginBottom:12}}>

            {/* Header row */}
            <div style={{display:"flex",gap:20,alignItems:"flex-start",flexWrap:"wrap",marginBottom:16}}>
              <ProbGauge prob={gsResult.prob}/>
              <div style={{flex:1,minWidth:200}}>
                <div style={{fontSize:16,fontWeight:800,color:meta?.color,marginBottom:10}}>
                  {meta?.icon} {meta?.label} → ${fP(gsResult.tgt,1)}M
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))",gap:10}}>
                  {[["Actual P50", fM(gsResult.p50), COLS.cyan],
                    ["Objetivo",   fM(gsResult.tgt),  meta?.color||COLS.yellow],
                    ["Brecha",     `${gsResult.gap>=0?"+":""}${fM(gsResult.gap)}`, gsResult.gap<=0?COLS.green:COLS.red],
                    ["P(logro)",   fPct(gsResult.prob), gsResult.prob>=0.70?COLS.green:gsResult.prob>=0.40?COLS.yellow:COLS.red],
                  ].map(([l,v,clr])=>(
                    <div key={l} style={{background:"#F8F8F4",borderRadius:7,padding:"9px 12px",border:"1px solid #0e1e2e"}}>
                      <div style={{fontSize:11,color:"#7A7A7A"}}>{l}</div>
                      <div style={{fontFamily:"monospace",fontSize:15,fontWeight:700,color:clr,marginTop:2}}>{v}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Distribution bar */}
            <div style={{marginBottom:16}}>
              <div style={{fontSize:10,color:"#3A6A3A",marginBottom:6,fontWeight:600}}>
                Distribución de resultados vs objetivo
              </div>
              <div style={{position:"relative",background:"#F8F8F4",borderRadius:8,height:28,overflow:"hidden"}}>
                <div style={{position:"absolute",left:0,top:0,height:"100%",
                  width:`${Math.min(gsResult.p10/Math.max(gsResult.tgt*1.4,0.001)*100,100)}%`,
                  background:COLS.red+"33"}}/>
                <div style={{position:"absolute",left:0,top:0,height:"100%",
                  width:`${Math.min(gsResult.p50/Math.max(gsResult.tgt*1.4,0.001)*100,100)}%`,
                  background:COLS.cyan+"55"}}/>
                <div style={{position:"absolute",left:0,top:0,height:"100%",
                  width:`${Math.min(gsResult.p90/Math.max(gsResult.tgt*1.4,0.001)*100,100)}%`,
                  background:COLS.green+"22"}}/>
                {/* Target line */}
                <div style={{position:"absolute",
                  left:`${Math.min(gsResult.tgt/Math.max(gsResult.tgt*1.4,0.001)*100,97)}%`,
                  top:0,height:"100%",width:3,background:meta?.color||COLS.yellow,
                  boxShadow:`0 0 8px ${meta?.color||COLS.yellow}`}}/>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginTop:4,color:"#7A8A7A"}}>
                <span style={{color:COLS.red+"aa"}}>P10: {fM(gsResult.p10)}</span>
                <span style={{color:COLS.cyan+"aa"}}>P50: {fM(gsResult.p50)}</span>
                <span style={{color:COLS.green+"aa"}}>P90: {fM(gsResult.p90)}</span>
                <span style={{color:meta?.color,fontWeight:700}}>▲ Obj: {fM(gsResult.tgt)}</span>
              </div>
            </div>

            {/* Levers table */}
            {gsResult.gap > 0 && gsResult.levers.length > 0 && (
              <div>
                <div style={{fontSize:11,color:"#4A6A5A",fontWeight:700,marginBottom:10}}>
                  Palancas operativas para cerrar la brecha de {fM(gsResult.gap)}
                </div>
                <div style={{display:"grid",gap:8}}>
                  {gsResult.levers.map((lv,i)=>(
                    <div key={i} style={{
                      background:"#F8F8F4",borderRadius:8,padding:"10px 14px",
                      border:`1px solid ${lv.factible?"#69ff8722":"#ff525222"}`,
                      display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8,
                    }}>
                      <div style={{minWidth:150}}>
                        <div style={{fontSize:10,color:"#4A6A5A",fontWeight:600}}>{lv.icon} {lv.lever}</div>
                        <div style={{fontSize:11,color:"#7A7A7A",marginTop:2}}>
                          Actual: <span style={{color:"#3A6A3A",fontFamily:"monospace"}}>{lv.actual}</span>
                          <span style={{color:"#7A8A7A",margin:"0 6px"}}>→</span>
                          Requerido: <span style={{color:COLS.cyan,fontFamily:"monospace",fontWeight:700}}>{lv.requerido}</span>
                        </div>
                      </div>
                      <div style={{display:"flex",alignItems:"center",gap:10}}>
                        <span style={{fontFamily:"monospace",fontSize:11,color:COLS.orange}}>{lv.delta}</span>
                        <span style={{
                          background:lv.factible?"#69ff8715":"#ff525215",
                          border:`1px solid ${lv.factible?COLS.green:COLS.red}44`,
                          color:lv.factible?COLS.green:COLS.red,
                          borderRadius:5,padding:"2px 9px",fontSize:11,fontWeight:700,whiteSpace:"nowrap",
                        }}>{lv.factible?"✓ Factible":"⚠ Difícil"}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{fontSize:11,color:"#7A8A7A",marginTop:10,padding:"8px 12px",background:"#F0F0EA",borderRadius:7,border:"1px solid #0d1a27"}}>
                  Las palancas son estimaciones basadas en la distribución de {S_[selectedMetric]?.arr?.length||0} escenarios simulados.
                  Cada palanca asume que las demás permanecen constantes (ceteris paribus).
                </div>
              </div>
            )}

            {/* Already achieved */}
            {gsResult.gap <= 0 && (
              <div style={{textAlign:"center",padding:"16px",background:"#DFF0D8",borderRadius:8,border:"1px solid #69ff8733"}}>
                <div style={{fontSize:24,marginBottom:6}}>✅</div>
                <div style={{fontSize:13,fontWeight:700,color:COLS.green}}>
                  El objetivo ya está dentro del rango alcanzable
                </div>
                <div style={{fontSize:10,color:"#2D7A2D",marginTop:4}}>
                  El P50 actual ({fM(gsResult.p50)}) supera el objetivo ({fM(gsResult.tgt)}) — probabilidad de logro: {fPct(gsResult.prob)}
                </div>
              </div>
            )}
          </Panel>
        </div>
      )}

      {!gsResult && (
        <div style={{textAlign:"center",padding:"40px 0",color:"#7A8A7A"}}>
          <div style={{fontSize:40,opacity:0.25,marginBottom:12}}>🎯</div>
          <div style={{fontSize:12,color:"#7A7A7A"}}>Selecciona una métrica, ingresa el objetivo y presiona Analizar</div>
          <div style={{fontSize:10,marginTop:6,color:"#D5D0C8"}}>
            Usa la distribución de {S_[selectedMetric]?.arr?.length||0} escenarios ya simulados
          </div>
        </div>
      )}
    </div>
  );
}

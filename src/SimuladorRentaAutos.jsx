import { useState, useCallback, useRef } from "react";

// ═══════════════════════════════════════════════════════════════════
// SIMULADOR MONTE CARLO — RENTA DE AUTOS  v7
// Auditoría completa — bugs corregidos:
// 1. Y_pond: fórmula corregida → Y = Vc / (flota×días×ocup×D×tarifa_list)
// 2. Pe: convertir tarifa corp de $/mes a $/día usando /30.44 (no /30)
// 3. rev_d_cap / rev_c_cap: D ya está en U implícitamente — no multiplicar dos veces
// 4. P&L: EBT = EBIT - intereses (calculado desde stats, no desde p50-p50)
// 5. NOPAT: se calcula sobre EBIT (no sobre EBT) — correcto, pero mostrar en P&L en orden correcto
// 6. EVA = NOPAT - Capital×WACC donde Capital = val_total_flota (activo bruto)
// 7. P&L display: línea "Rev. Diaria" mostraba cálculo incorrecto — ahora usa S_.Vc y S_.Ve
// 8. Histo: valores sintéticos inseguros para distribuciones bimodales — usar clamp
// Promundial Consulting Group · Najas (2026)
// ═══════════════════════════════════════════════════════════════════

const C = {
  deep:"#0F3521", green:"#1A5C38", gold:"#C8922A", light:"#F7F5F0",
  card:"#FFFFFF", border:"#E2DDD5", text:"#2C2C2C", muted:"#7A7267",
  red:"#B34040", blue:"#2E5E8E", teal:"#1A7A6D", orange:"#D4772C",
  navy:"#1A4060", purple:"#5B3A8A",
};
const mono = "'IBM Plex Mono','Courier New',monospace";
const sans = "'Segoe UI',system-ui,sans-serif";

// ─── Monte Carlo ───────────────────────────────────────────────────
function randn(){let u=0,v=0;while(!u)u=Math.random();while(!v)v=Math.random();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);}
function S(d){return Math.max(d.min,Math.min(d.max,d.mean+randn()*d.std));}
function pct(v,d=1){return(v*100).toFixed(d)+"%";}
function fmt$(n){if(isNaN(n)||n===undefined)return"—";const s=n<0?"−$":"$",a=Math.abs(n);if(a>=1e6)return s+(a/1e6).toFixed(2)+"M";if(a>=1e3)return s+(a/1e3).toFixed(1)+"K";return s+a.toFixed(0);}
function fmtF(n){return new Intl.NumberFormat("en-US",{maximumFractionDigits:0}).format(n);}
function percentile(arr,p){const s=[...arr].sort((a,b)=>a-b);return s[Math.floor(p/100*(s.length-1))];}
function stats(arr){return{p10:percentile(arr,10),p50:percentile(arr,50),p90:percentile(arr,90)};}

// ─── Mix helpers ───────────────────────────────────────────────────
function tarifaMixMedia(mix){const t=mix.reduce((s,c)=>s+c.mix_pct,0)||1;return mix.reduce((s,c)=>s+(c.mix_pct/t)*c.tarifa_mean,0);}
function tarifaMixStd(mix){const t=mix.reduce((s,c)=>s+c.mix_pct,0)||1;return Math.sqrt(mix.reduce((s,c)=>s+(c.mix_pct/t)*c.tarifa_std**2,0));}
function descMixMedio(mix){const t=mix.reduce((s,c)=>s+c.mix_pct,0)||1;return mix.reduce((s,c)=>s+(c.mix_pct/t)*(c.desc_pct||0),0);}
function valorMixMedio(mix){const t=mix.reduce((s,c)=>s+c.mix_pct,0)||1;return mix.reduce((s,c)=>s+(c.mix_pct/t)*(c.valor||0),0);}
function vidaMixMedia(mix){const t=mix.reduce((s,c)=>s+c.mix_pct,0)||1;return mix.reduce((s,c)=>s+(c.mix_pct/t)*(c.vida||4),0);}
function residualMixMedio(mix){const t=mix.reduce((s,c)=>s+c.mix_pct,0)||1;return mix.reduce((s,c)=>s+(c.mix_pct/t)*(c.residual||35),0);}
function sampleMix(mix){
  const raw=mix.map(c=>Math.max(0,c.mix_pct+randn()*c.mix_std));
  const total=raw.reduce((s,v)=>s+v,0)||1;
  const w=raw.map(v=>v/total);
  const tarifa=mix.reduce((s,c,i)=>s+w[i]*Math.max(0,c.tarifa_mean+randn()*c.tarifa_std),0);
  const desc=mix.reduce((s,c,i)=>s+w[i]*Math.max(0,Math.min((c.desc_pct||0)+randn()*(c.desc_std||0),30))/100,0);
  const valor=mix.reduce((s,c,i)=>s+w[i]*(c.valor||0),0);
  const vida=mix.reduce((s,c,i)=>s+w[i]*(c.vida||4),0);
  const residual=mix.reduce((s,c,i)=>s+w[i]*(c.residual||35),0)/100;
  return{tarifa,desc,valor,vida,residual};
}

// ─── Default mix data ──────────────────────────────────────────────
const DEFAULT_MIX_DIARIA = [
  {cat:"Economy",          mix_pct:18,mix_std:2,tarifa_mean:35, tarifa_std:5, desc_pct:5, desc_std:1,valor:12000,vida:4,residual:30},
  {cat:"Compact",          mix_pct:16,mix_std:2,tarifa_mean:42, tarifa_std:6, desc_pct:5, desc_std:1,valor:15000,vida:4,residual:30},
  {cat:"Intermediate",     mix_pct:14,mix_std:2,tarifa_mean:52, tarifa_std:7, desc_pct:4, desc_std:1,valor:18000,vida:4,residual:32},
  {cat:"Full Size",        mix_pct:12,mix_std:2,tarifa_mean:65, tarifa_std:8, desc_pct:4, desc_std:1,valor:22000,vida:4,residual:33},
  {cat:"Premium",          mix_pct:8, mix_std:2,tarifa_mean:90, tarifa_std:12,desc_pct:3, desc_std:1,valor:32000,vida:3,residual:35},
  {cat:"Luxury",           mix_pct:5, mix_std:1,tarifa_mean:150,tarifa_std:20,desc_pct:2, desc_std:1,valor:65000,vida:3,residual:40},
  {cat:"Compact SUV",      mix_pct:10,mix_std:2,tarifa_mean:60, tarifa_std:8, desc_pct:4, desc_std:1,valor:25000,vida:4,residual:33},
  {cat:"Intermediate SUV", mix_pct:8, mix_std:2,tarifa_mean:75, tarifa_std:10,desc_pct:4, desc_std:1,valor:32000,vida:4,residual:35},
  {cat:"Full Size SUV",    mix_pct:4, mix_std:1,tarifa_mean:110,tarifa_std:15,desc_pct:3, desc_std:1,valor:45000,vida:4,residual:38},
  {cat:"Pickup",           mix_pct:2, mix_std:1,tarifa_mean:85, tarifa_std:10,desc_pct:3, desc_std:1,valor:35000,vida:5,residual:40},
  {cat:"Minivan",          mix_pct:2, mix_std:1,tarifa_mean:70, tarifa_std:10,desc_pct:4, desc_std:1,valor:28000,vida:4,residual:32},
  {cat:"Specialty",        mix_pct:1, mix_std:1,tarifa_mean:200,tarifa_std:30,desc_pct:2, desc_std:1,valor:80000,vida:3,residual:45},
];
const DEFAULT_MIX_CORP = [
  {cat:"Economy",          mix_pct:10,mix_std:2,tarifa_mean:650, tarifa_std:80, desc_pct:12,desc_std:2,valor:12000,vida:5,residual:30},
  {cat:"Compact",          mix_pct:12,mix_std:2,tarifa_mean:780, tarifa_std:90, desc_pct:12,desc_std:2,valor:15000,vida:5,residual:30},
  {cat:"Intermediate",     mix_pct:15,mix_std:2,tarifa_mean:950, tarifa_std:100,desc_pct:10,desc_std:2,valor:18000,vida:5,residual:32},
  {cat:"Full Size",        mix_pct:14,mix_std:2,tarifa_mean:1100,tarifa_std:120,desc_pct:10,desc_std:2,valor:22000,vida:5,residual:33},
  {cat:"Premium",          mix_pct:10,mix_std:2,tarifa_mean:1500,tarifa_std:180,desc_pct:8, desc_std:2,valor:32000,vida:4,residual:35},
  {cat:"Luxury",           mix_pct:5, mix_std:1,tarifa_mean:2200,tarifa_std:300,desc_pct:5, desc_std:1,valor:65000,vida:4,residual:40},
  {cat:"Compact SUV",      mix_pct:12,mix_std:2,tarifa_mean:1050,tarifa_std:120,desc_pct:10,desc_std:2,valor:25000,vida:5,residual:33},
  {cat:"Intermediate SUV", mix_pct:10,mix_std:2,tarifa_mean:1250,tarifa_std:150,desc_pct:8, desc_std:2,valor:32000,vida:5,residual:35},
  {cat:"Full Size SUV",    mix_pct:5, mix_std:1,tarifa_mean:1600,tarifa_std:200,desc_pct:7, desc_std:1,valor:45000,vida:5,residual:38},
  {cat:"Pickup",           mix_pct:4, mix_std:1,tarifa_mean:1200,tarifa_std:150,desc_pct:8, desc_std:1,valor:35000,vida:6,residual:40},
  {cat:"Minivan",          mix_pct:2, mix_std:1,tarifa_mean:1100,tarifa_std:130,desc_pct:8, desc_std:1,valor:28000,vida:5,residual:32},
  {cat:"Specialty",        mix_pct:1, mix_std:1,tarifa_mean:3000,tarifa_std:400,desc_pct:3, desc_std:1,valor:80000,vida:4,residual:45},
];

const DAYS_PER_MONTH = 30.44; // promedio exacto días/mes

// ─── Parameter groups ──────────────────────────────────────────────
const GROUPS = [
  { id:"flota", label:"🚗 Flota", params:{
    flota_diaria:        {mean:80,  std:0,   min:1,   max:5000,  label:"Flota renta diaria (unidades)",        unit:"u"},
    flota_corp:          {mean:40,  std:0,   min:0,   max:5000,  label:"Flota contratos corporativos",          unit:"u"},
  }},
  { id:"oae_disp", label:"📐 OAE — Disponibilidad", params:{
    // Contexto operativo
    horas_jornada:       {mean:10,  std:0,   min:6,   max:24,    label:"Horas jornada operativa por día",          unit:"h"},
    dias_mes:            {mean:26,  std:0,   min:20,  max:31,    label:"Días operativos por mes",                  unit:"d"},
    // Alistamiento (por contrato/rotación)
    h_alistamiento:      {mean:3,   std:0.5, min:0.5, max:12,    label:"Tiempo alistamiento por contrato (h)",     unit:"h"},
    contratos_mes_auto:  {mean:8,   std:1,   min:1,   max:30,    label:"Contratos promedio/vehículo diaria/mes",   unit:"u"},
    // Mantenimiento preventivo
    h_mant_prev:         {mean:4,   std:1,   min:0,   max:24,    label:"Tiempo mantenimiento preventivo/veh. (h/mes)", unit:"h"},
    // Reparación correctiva
    h_reparacion:        {mean:8,   std:2,   min:0,   max:72,    label:"Tiempo reparación correctiva por evento (h)", unit:"h"},
    frec_reparacion:     {mean:0.3, std:0.1, min:0,   max:3,     label:"Frecuencia reparaciones/veh./mes",         unit:"u"},
    // Siniestros
    dias_siniestro:      {mean:12,  std:3,   min:0,   max:60,    label:"Días inmovilización por siniestro",        unit:"d"},
    tasa_siniestros:     {mean:0.15,std:0.05,min:0,   max:2,     label:"Siniestros/vehículo/año",                  unit:"u"},
  }},
  { id:"oae_util", label:"📐 OAE — Utilización", params:{
    ocupacion_diaria:    {mean:72,  std:6,   min:20,  max:98,    label:"Ocupación base flota diaria (%)",       unit:"%"},
    ocupacion_corp:      {mean:88,  std:4,   min:50,  max:100,   label:"Ocupación flota corporativa (%)",       unit:"%"},
    noshow_pct:          {mean:3,   std:1,   min:0,   max:15,    label:"No-shows / cancelaciones tardías (%)",  unit:"%"},
    turnaround_pct:      {mean:2,   std:0.5, min:0,   max:10,    label:"Tiempo muerto entre contratos (%)",     unit:"%"},
    estacionalidad_pct:  {mean:5,   std:2,   min:0,   max:25,    label:"Impacto estacionalidad baja (%)",       unit:"%"},
  }},
  { id:"oae_yield", label:"📐 OAE — Yield", params:{
    upgrade_gratuito_pct:{mean:2,   std:0.5, min:0,   max:10,    label:"Upgrades gratuitos forzados (%)",       unit:"%"},
    tarifa_negociada_pct:{mean:3,   std:1,   min:0,   max:15,    label:"Brecha tarifa negociada vs. rack (%)",  unit:"%"},
  }},
  { id:"oae_cal", label:"📐 OAE — Calidad", params:{
    danos_no_cobrados:   {mean:2,   std:0.5, min:0,   max:10,    label:"Daños no cobrados al cliente (%)",      unit:"%"},
    noshow_sin_cargo:    {mean:1,   std:0.5, min:0,   max:8,     label:"No-shows sin cargo aplicado (%)",       unit:"%"},
    reclamos_seguro:     {mean:1.5, std:0.5, min:0,   max:10,    label:"Reclamos de seguro pendientes (%)",     unit:"%"},
    compensaciones:      {mean:0.5, std:0.2, min:0,   max:5,     label:"Créditos/compensaciones por quejas (%)",unit:"%"},
  }},
  { id:"costos", label:"🔧 Costos Operativos", params:{
    mant_pct_valor:      {mean:1.2, std:0.2, min:0,   max:5,     label:"Mantenimiento (% valor auto/año)",      unit:"%"},
    seguro_pct_valor:    {mean:3.5, std:0.5, min:0.5, max:10,    label:"Seguro (% valor auto/año)",             unit:"%"},
    lavado_mes:          {mean:25,  std:5,   min:0,   max:200,   label:"Lavado & limpieza/auto ($/mes)",        unit:"$"},
    combustible_mes:     {mean:40,  std:8,   min:0,   max:300,   label:"Combustible/auto diaria ($/mes)",       unit:"$"},
  }},
  { id:"rrhh", label:"👥 Personal", params:{
    agentes_diaria:      {mean:6,   std:0,   min:1,   max:200,   label:"Agentes renta diaria",                  unit:"u"},
    sueldo_agente:       {mean:900, std:100, min:300, max:5000,  label:"Sueldo agente ($/mes)",                 unit:"$"},
    ejecutivos_corp:     {mean:3,   std:0,   min:1,   max:50,    label:"Ejecutivos cuenta corporativa",         unit:"u"},
    sueldo_ejecutivo:    {mean:1800,std:200, min:500, max:10000, label:"Sueldo ejecutivo ($/mes)",              unit:"$"},
    personal_ops:        {mean:8,   std:0,   min:1,   max:200,   label:"Personal operativo",                    unit:"u"},
    sueldo_ops:          {mean:700, std:80,  min:200, max:5000,  label:"Sueldo personal ops ($/mes)",           unit:"$"},
    admin_personal:      {mean:4,   std:0,   min:1,   max:100,   label:"Personal administrativo",               unit:"u"},
    sueldo_admin:        {mean:1200,std:150, min:300, max:8000,  label:"Sueldo admin ($/mes)",                  unit:"$"},
  }},
  { id:"gastos", label:"🏠 Gastos Fijos", params:{
    alquiler_oficinas:   {mean:4000,std:500, min:0,   max:50000, label:"Alquiler oficinas/sucursales ($/mes)",  unit:"$"},
    alquiler_parqueo:    {mean:3000,std:400, min:0,   max:30000, label:"Alquiler parqueo flota ($/mes)",        unit:"$"},
    sistemas_crm:        {mean:1500,std:200, min:0,   max:15000, label:"Sistemas CRM & GPS ($/mes)",            unit:"$"},
    marketing_mes:       {mean:5000,std:1000,min:0,   max:100000,label:"Marketing & publicidad ($/mes)",        unit:"$"},
    servicios_basicos:   {mean:2000,std:300, min:0,   max:20000, label:"Servicios básicos ($/mes)",             unit:"$"},
  }},
  { id:"fin", label:"💰 Financiero", params:{
    ir:                  {mean:25,  std:0,   min:0,   max:40,    label:"Impuesto a la renta (%)",               unit:"%"},
    wacc:                {mean:12,  std:0,   min:5,   max:30,    label:"WACC (%)",                              unit:"%"},
    deuda_pct:           {mean:60,  std:0,   min:0,   max:100,   label:"Deuda sobre valor flota (%)",           unit:"%"},
    tasa_deuda:          {mean:9,   std:1,   min:3,   max:20,    label:"Tasa de interés deuda (%)",             unit:"%"},
  }},
];

function flatParams(){const p={};GROUPS.forEach(g=>Object.entries(g.params).forEach(([k,v])=>p[k]={...v}));return p;}

// ─── Simulation core (auditada) ────────────────────────────────────
function simOne(p,mixD,mixC){
  const flota_d = Math.max(0, S(p.flota_diaria));
  const flota_c = Math.max(0, S(p.flota_corp));
  const flota_total = flota_d + flota_c || 1;

  // ── OAE D: Disponibilidad ──────────────────────────────────────────
  // D se calcula desde KPIs operativos reales, no % abstractos
  // Contexto
  const horas_dia   = Math.max(1, S(p.horas_jornada));
  const dias_mes_op = Math.max(1, S(p.dias_mes));
  const horas_mes   = horas_dia * dias_mes_op;  // horas-activo disponibles por mes/veh

  // Pérdida 1: Alistamiento (limpieza, inspección, papeles por cada rotación)
  const h_alist    = Math.max(0, S(p.h_alistamiento));
  const contratos  = Math.max(0, S(p.contratos_mes_auto));
  const pct_alist  = Math.min(0.5, (h_alist * contratos) / horas_mes);

  // Pérdida 2: Mantenimiento preventivo
  const h_prev     = Math.max(0, S(p.h_mant_prev));
  const pct_prev   = Math.min(0.4, h_prev / horas_mes);

  // Pérdida 3: Reparación correctiva (frecuencia × horas por evento)
  const h_rep      = Math.max(0, S(p.h_reparacion));
  const frec_rep   = Math.max(0, S(p.frec_reparacion));
  const pct_rep    = Math.min(0.4, (h_rep * frec_rep) / horas_mes);

  // Pérdida 4: Siniestros (tasa anual × días inmovilizado → % días mes)
  const dias_sin   = Math.max(0, S(p.dias_siniestro));
  const tasa_sin   = Math.max(0, S(p.tasa_siniestros));
  const pct_sin    = Math.min(0.3, (tasa_sin * dias_sin) / (12 * dias_mes_op));

  const disp_loss  = Math.min(0.95, pct_alist + pct_prev + pct_rep + pct_sin);
  const D          = Math.max(0.05, 1 - disp_loss);

  // Guardar los componentes para diagnóstico
  const _disp_components = { pct_alist, pct_prev, pct_rep, pct_sin, horas_mes };

  // ── OAE U: Utilización ─────────────────────────────────────────────
  // U = Cu / Cd (capacidad utilizada / capacidad disponible)
  // IMPORTANTE: U debe ponderarse por capacidad económica (no por número de vehículos)
  // para que se cumpla la identidad algebraica: OAE = D × U × Y × Q = Ve / Cp
  const ocup_d_base = Math.max(0, Math.min(1, S(p.ocupacion_diaria)/100));
  const ocup_c_base = Math.max(0, Math.min(1, S(p.ocupacion_corp)/100));
  const util_adj = Math.min(ocup_d_base,
    S(p.noshow_pct)/100 + S(p.turnaround_pct)/100 + S(p.estacionalidad_pct)/100);
  const ocup_d = Math.max(0, ocup_d_base - util_adj);
  const ocup_c = Math.max(0, ocup_c_base - util_adj * 0.5); // corp: contratos más estables

  // ── Mix samples ────────────────────────────────────────────────────
  const {tarifa:tarifa_d_rack, desc:desc_d_mix, valor:val_d_base, vida:vida_d, residual:resid_d} = sampleMix(mixD);
  const {tarifa:tarifa_c_rack, desc:desc_c_mix, valor:val_c_base, vida:vida_c, residual:resid_c} = sampleMix(mixC);

  // Valor de vehículo (sin variabilidad σ separada — viene del mix directamente)
  const val_d = Math.max(1000, val_d_base);
  const val_c = Math.max(1000, val_c_base);

  // ── OAE Y: Yield ───────────────────────────────────────────────────
  const yield_extra_d = S(p.upgrade_gratuito_pct)/100 + S(p.tarifa_negociada_pct)/100;
  const yield_extra_c = S(p.tarifa_negociada_pct)/100;
  const desc_d_total = Math.min(0.95, desc_d_mix + yield_extra_d);
  const desc_c_total = Math.min(0.95, desc_c_mix + yield_extra_c);
  const Y_d = 1 - desc_d_total;
  const Y_c = 1 - desc_c_total;

  // ── Capacidad potencial Cp ─────────────────────────────────────────
  const tarifa_c_dia = tarifa_c_rack / DAYS_PER_MONTH; // $/mes → $/día equiv.
  const Cp_d = flota_d * 365 * tarifa_d_rack;
  const Cp_c = flota_c * 365 * tarifa_c_dia;
  const Cp   = Cp_d + Cp_c;

  // ── Cascada OAE ────────────────────────────────────────────────────
  // Cd (disponible) = Cp × D
  const Cd_d = Cp_d * D;
  const Cd_c = Cp_c * D;

  // Cu (utilizada) = Cd × ocup_canal
  const Cu_d = Cd_d * ocup_d;
  const Cu_c = Cd_c * ocup_c;
  const Cu_total = Cu_d + Cu_c;

  // U ponderado por capacidad económica para satisfacer OAE = D×U×Y×Q = Ve/Cp
  // U = Cu_total / (Cd_d + Cd_c)  (no por número de vehículos — eso rompe la identidad)
  const U = Cu_total > 0 ? Cu_total / (Cd_d + Cd_c) : 0;

  // Vc (capturado) = Cu × Y
  const Vc_d = Cu_d * Y_d;
  const Vc_c = Cu_c * Y_c;
  const Vc   = Vc_d + Vc_c;

  // Y ponderado = Vc / Cu_total
  const Y_pond = Cu_total > 0 ? Vc / Cu_total : 1;

  // ── OAE Q: Calidad ─────────────────────────────────────────────────
  const cal_loss = Math.min(1,
    S(p.danos_no_cobrados)/100 + S(p.noshow_sin_cargo)/100
    + S(p.reclamos_seguro)/100 + S(p.compensaciones)/100);
  const Q  = Math.max(0, 1 - cal_loss);
  const Ve = Vc * Q;

  // ── OAE index y brechas ────────────────────────────────────────────
  // OAE = D × U × Y × Q = Ve / Cp  (identidad algebraica garantizada)
  const OAE = D * U * Y_pond * Q;

  // Brechas en cascada — suman exactamente Cp − Ve
  const brecha_disp  = Cp * (1 - D);
  const brecha_util  = Cp * D * (1 - U);
  const brecha_yield = Cp * D * U * (1 - Y_pond);
  const brecha_cal   = Cp * D * U * Y_pond * (1 - Q);
  const Pe_capturado = Ve; // = Cp × OAE

  // Verificación interna: brecha_total debe = Cp - Pe_capturado
  // brecha_disp + brecha_util + brecha_yield + brecha_cal = Cp - Ve ✓

  // ── P&L financiero ─────────────────────────────────────────────────
  const rev_total = Ve;
  const val_flota_d = flota_d * val_d;
  const val_flota_c = flota_c * val_c;
  const val_total_flota = val_flota_d + val_flota_c;
  // Depreciación ponderada por canal — cada categoría tiene su propia vida útil y residual
  const dep_anual = val_flota_d * (1 - resid_d) / Math.max(0.1, vida_d)
                  + val_flota_c * (1 - resid_c) / Math.max(0.1, vida_c);

  const mant_pct = S(p.mant_pct_valor) / 100;
  const seg_pct  = S(p.seguro_pct_valor) / 100;
  const costo_flota =
    val_total_flota * (mant_pct + seg_pct)          // mant + seguro como % del valor
    + (flota_d + flota_c) * S(p.lavado_mes) * 12    // lavado anual
    + flota_d * S(p.combustible_mes) * 12;           // combustible solo diaria

  const costo_personal = (
    S(p.agentes_diaria)   * S(p.sueldo_agente)    +
    S(p.ejecutivos_corp)  * S(p.sueldo_ejecutivo) +
    S(p.personal_ops)     * S(p.sueldo_ops)       +
    S(p.admin_personal)   * S(p.sueldo_admin)
  ) * 12;

  const gastos_fijos = (
    S(p.alquiler_oficinas) + S(p.alquiler_parqueo) +
    S(p.sistemas_crm) + S(p.marketing_mes) + S(p.servicios_basicos)
  ) * 12;

  const ebitda = rev_total - costo_flota - costo_personal - gastos_fijos;
  const ebit   = ebitda - dep_anual;

  const deuda     = val_total_flota * S(p.deuda_pct) / 100;
  const intereses = deuda * S(p.tasa_deuda) / 100;
  const ebt       = ebit - intereses;

  const ir       = Math.max(0, Math.min(1, S(p.ir) / 100));
  const impuesto = Math.max(0, ebt * ir);     // IR sobre EBT (base imponible)
  const util_neta = ebt - impuesto;

  // NOPAT = EBIT × (1 - IR)  — earnings operativos after tax, sin efecto de deuda
  const wacc  = S(p.wacc) / 100;
  const nopat = ebit * (1 - ir);

  // EVA = NOPAT − Capital Invertido × WACC
  // Capital Invertido = val_total_flota (activo principal del negocio)
  const eva = nopat - val_total_flota * wacc;

  // ROIC = NOPAT / Capital Invertido
  const roic = val_total_flota > 0 ? nopat / val_total_flota : 0;

  // DPU — Depreciation Per Unit per month (estándar Hertz/Avis)
  // = depreciación anual / (total autos × 12 meses)
  // Incluye el efecto del valor residual — neto de lo que se recupera al vender
  const dpu = flota_total > 0 ? dep_anual / (flota_total * 12) : 0;

  // Revenue per available car per month (RevPAC) — para comparar con DPU
  const revpac = flota_total > 0 ? rev_total / (flota_total * 12) : 0;

  // Margen DPU: cuánto del RevPAC se consume solo en depreciación
  const dpu_coverage = revpac > 0 ? dpu / revpac : 0;

  // ── Costo de oportunidad del mix corporativo ───────────────────────
  // ¿Cuánto deja de ganar la empresa por tener flota_c en corporativo
  // vs. ponerla toda en renta diaria al precio rack?
  // CO = flota_c × 365 × ocup_c × (tarifa_d_rack − tarifa_c_dia_equiv_neta)
  // Solo es "costo" si tarifa diaria > tarifa corp equivalente
  const tarifa_c_dia_neta = tarifa_c_rack * Y_c / DAYS_PER_MONTH; // $/día neto corp
  const tarifa_d_neta = tarifa_d_rack * Y_d;                        // $/día neto diaria
  const gap_por_dia = tarifa_d_neta - tarifa_c_dia_neta;            // diferencia $/día
  // Días efectivamente rentados en flota corp por año
  const dias_corp_rentados = flota_c * 365 * ocup_c * D;
  const costo_oportunidad = Math.max(0, gap_por_dia * dias_corp_rentados);
  // También calculamos el beneficio de estabilidad: ingresos garantizados del corporativo
  const ingresos_corp_garantizados = Vc_c * Q; // Ve del canal corporativo
  // Ratio: por cada $ de costo de oportunidad, cuánto se garantiza en revenue estable
  const ratio_estabilidad = costo_oportunidad > 0 ? ingresos_corp_garantizados / costo_oportunidad : 0;

  return {
    // P&L
    rev_total, ebitda, ebit, ebt, util_neta, eva,
    dep_anual, intereses, impuesto, nopat,
    costo_flota, costo_personal, gastos_fijos,
    val_total_flota, deuda,
    margen_ebitda: rev_total > 0 ? ebitda / rev_total : 0,
    margen_neto:   rev_total > 0 ? util_neta / rev_total : 0,
    roic, rev_por_auto: rev_total / flota_total,
    dpu, revpac, dpu_coverage,
    costo_oportunidad, ingresos_corp_garantizados, ratio_estabilidad,
    tarifa_c_dia_neta, tarifa_d_neta, gap_por_dia,
    // OAE
    D, U, Y: Y_pond, Q, OAE,
    Pe: Cp, Pe_capturado,
    brecha_disp, brecha_util, brecha_yield, brecha_cal,
    Vc, Ve,
    // Tarifas netas para display
    tarifa_d_net: tarifa_d_rack * Y_d,
    tarifa_c_net: tarifa_c_rack * Y_c,
    val_d, val_c,
    // Componentes D para diagnóstico
    pct_alist: _disp_components.pct_alist,
    pct_prev:  _disp_components.pct_prev,
    pct_rep:   _disp_components.pct_rep,
    pct_sin:   _disp_components.pct_sin,
  };
}

function runSim(params, mixD, mixC, N=3000){
  const keys = [
    "rev_total","ebitda","ebit","ebt","util_neta","eva","dep_anual","intereses","impuesto","nopat",
    "costo_flota","costo_personal","gastos_fijos","val_total_flota","deuda",
    "margen_ebitda","margen_neto","roic","rev_por_auto","dpu","revpac","dpu_coverage",
    "costo_oportunidad","ingresos_corp_garantizados","ratio_estabilidad",
    "tarifa_c_dia_neta","tarifa_d_neta","gap_por_dia",
    "D","U","Y","Q","OAE","Pe","Pe_capturado",
    "brecha_disp","brecha_util","brecha_yield","brecha_cal",
    "Vc","Ve","tarifa_d_net","tarifa_c_net","val_d","val_c",
    "pct_alist","pct_prev","pct_rep","pct_sin",
  ];
  const b = {}; keys.forEach(k => b[k] = []);
  for(let i = 0; i < N; i++){
    const r = simOne(params, mixD, mixC);
    keys.forEach(k => b[k].push(r[k]));
  }
  const out = {}; keys.forEach(k => out[k] = stats(b[k]));

  // ── Sensibilidad tornado: impacto individual de cada variable en EVA ──
  const sensN = 300;
  const sensItems = [];
  GROUPS.forEach(g => Object.entries(g.params).forEach(([k, v]) => {
    if((params[k]?.std || 0) === 0) return;
    const evaVals = [];
    for(let i = 0; i < sensN; i++){
      // Solo esta variable es estocástica; el resto determinístico (std=0)
      const pIso = {};
      Object.entries(params).forEach(([pk, pv]) =>
        pIso[pk] = {...pv, std: pk === k ? pv.std : 0});
      evaVals.push(simOne(pIso, mixD, mixC).eva);
    }
    const sorted = [...evaVals].sort((a, b) => a - b);
    const impact = Math.abs(sorted[Math.floor(0.90 * sensN)] - sorted[Math.floor(0.10 * sensN)]);
    if(impact > 0) sensItems.push({label: v.label, impact, group: g.id});
  }));
  sensItems.sort((a, b) => b.impact - a.impact);
  out._sensitivity = sensItems;
  return out;
}

// ─── UI Components ─────────────────────────────────────────────────
function Histo({p10, p50, p90, color, label, h=72}){
  // Genera distribución sintética Normal con los percentiles dados
  const sigma = Math.max(1, (p90 - p10) / 2.563);
  const N = 400;
  const vals = Array.from({length:N}, () => {
    let u=0,v=0; while(!u)u=Math.random(); while(!v)v=Math.random();
    return Math.max(p10 - sigma*2, Math.min(p90 + sigma*2, p50 + sigma * Math.sqrt(-2*Math.log(u)) * Math.cos(2*Math.PI*v)));
  });
  const mn=Math.min(...vals), mx=Math.max(...vals), rng=mx-mn||1;
  const bins=26, cts=new Array(bins).fill(0);
  vals.forEach(v=>{let i=Math.floor((v-mn)/rng*bins);if(i>=bins)i=bins-1;cts[i]++;});
  const maxC=Math.max(...cts)||1;
  const W=500, toX=v=>Math.max(0,Math.min(W,((v-mn)/rng)*W));
  return(
    <div style={{marginBottom:16,width:"100%"}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:2}}>
        <span style={{fontSize:13,fontWeight:700,color:C.deep}}>{label}</span>
        <span style={{fontFamily:mono,fontSize:11,color:C.muted}}>P50 {fmt$(p50)}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${h+24}`} style={{width:"100%",display:"block"}}>
        {cts.map((c,i)=><rect key={i} x={i*W/bins} y={h-(c/maxC)*h} width={W/bins-.5} height={(c/maxC)*h} fill={color} opacity={.4} rx={1}/>)}
        {[[p10,"#D06838","P10"],[p50,C.deep,"P50"],[p90,C.blue,"P90"]].map(([v,cl,lb])=>(
          <g key={lb}>
            <line x1={toX(v)} x2={toX(v)} y1={0} y2={h} stroke={cl} strokeWidth={lb==="P50"?2:1.5} strokeDasharray={lb==="P50"?"0":"4,3"}/>
            <text x={toX(v)} y={h+19} fill={cl} fontSize="9" fontFamily={mono} textAnchor="middle">{lb} {fmt$(v)}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function HistoPanel({S_}){
  return(
    <div style={{background:C.card,borderRadius:10,border:`1px solid ${C.border}`,padding:"18px 20px"}}>
      <div style={{fontSize:13,fontWeight:700,color:C.deep,marginBottom:14}}>📈 Distribución de Resultados (Monte Carlo)</div>
      <Histo p10={S_.ebitda.p10}    p50={S_.ebitda.p50}    p90={S_.ebitda.p90}    color={C.green}  label="EBITDA"/>
      <Histo p10={S_.util_neta.p10} p50={S_.util_neta.p50} p90={S_.util_neta.p90} color={C.blue}   label="Utilidad Neta"/>
      <Histo p10={S_.eva.p10}       p50={S_.eva.p50}       p90={S_.eva.p90}       color={C.gold}   label="EVA"/>
    </div>
  );
}

function Section({title,open,onToggle,children}){
  return(
    <div style={{border:`1px solid ${C.border}`,borderRadius:8,marginBottom:10,overflow:"hidden"}}>
      <button onClick={onToggle} style={{width:"100%",textAlign:"left",padding:"10px 14px",
        background:open?C.deep:C.card,color:open?"#fff":C.text,border:"none",cursor:"pointer",
        fontSize:13,fontWeight:700,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        {title}<span style={{fontSize:11,opacity:0.7}}>{open?"▲":"▼"}</span>
      </button>
      {open&&<div style={{padding:"12px 14px",background:C.card}}>{children}</div>}
    </div>
  );
}

function ParamRow({k,p,val,onChange}){
  return(
    <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:6,padding:"3px 4px",borderRadius:3}}>
      <label style={{flex:1,fontSize:12,color:C.text}}>{p.label}</label>
      {["mean","std"].map(f=>(
        <div key={f} style={{display:"flex",flexDirection:"column",alignItems:"center"}}>
          <span style={{fontSize:10,color:C.muted,letterSpacing:1,marginBottom:2}}>{f==="mean"?"μ":"σ"}</span>
          <input type="number" value={val[f]} onChange={e=>onChange(k,f,parseFloat(e.target.value)||0)}
            style={{width:70,padding:"3px 5px",fontSize:12,fontFamily:mono,
              border:`1px solid ${C.border}`,borderRadius:3,background:C.light,textAlign:"right"}}/>
        </div>
      ))}
      <span style={{fontSize:11,color:C.muted,width:20,flexShrink:0}}>{p.unit}</span>
    </div>
  );
}

function MixTable({mix,setMix,tarifaUnit}){
  const total=mix.reduce((s,c)=>s+c.mix_pct,0);
  const ok=Math.abs(total-100)<1;
  const esD=tarifaUnit==="$/día";
  const tMed=tarifaMixMedia(mix), tSd=tarifaMixStd(mix), dMed=descMixMedio(mix), vMed=valorMixMedio(mix);
  const tNeta=tMed*(1-dMed/100);
  const upd=(i,f,v)=>setMix(prev=>{const n=[...prev];n[i]={...n[i],[f]:isNaN(v)?0:v};return n;});
  const inp={width:"100%",padding:"2px 4px",fontSize:11,fontFamily:mono,border:`1px solid ${C.border}`,borderRadius:2,background:C.light,textAlign:"right"};
  return(
    <div style={{marginTop:8}}>
      <div style={{display:"flex",gap:14,flexWrap:"wrap",marginBottom:10,padding:"10px 14px",background:`${C.green}10`,borderRadius:6,border:`1px solid ${C.green}30`}}>
        {[["Tarifa ponderada μ",esD?"$"+tMed.toFixed(2):"$"+fmtF(Math.round(tMed)),C.green],
          ["Desviación σ","±$"+fmtF(Math.round(tSd)),C.blue],
          ["Desc. pond. μ",dMed.toFixed(1)+"%",dMed>8?C.red:dMed>5?C.orange:C.teal],
          ["Tarifa neta μ",esD?"$"+tNeta.toFixed(2):"$"+fmtF(Math.round(tNeta)),C.deep],
          ["Valor flota pond. μ","$"+fmtF(Math.round(vMed)),C.navy],
          ["Vida útil pond.","$"+vidaMixMedia(mix).toFixed(1)+" yr",C.teal],
          ["Residual pond.",residualMixMedio(mix).toFixed(1)+"%",C.orange],
          ...(!esD?[["Tarifa neta/día equiv.","$"+(tNeta/30.44).toFixed(2)+"/día",C.teal]]:[])
        ].map(([l,v,col])=>(
          <div key={l}><div style={{fontSize:10,color:C.muted}}>{l}</div><div style={{fontSize:15,fontWeight:700,color:col,fontFamily:mono}}>{v}</div></div>
        ))}
        <div style={{marginLeft:"auto",display:"flex",alignItems:"center"}}>
          <span style={{fontSize:12,fontWeight:700,padding:"4px 10px",borderRadius:4,background:ok?"#1A5C3820":"#B3404020",color:ok?C.green:C.red,border:`1px solid ${ok?C.green:C.red}50`}}>Σ = {total.toFixed(1)}% {ok?"✓":"⚠"}</span>
        </div>
      </div>
      <div style={{overflowX:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
          <thead><tr style={{background:C.deep,color:"#fff"}}>
            {["Categoría","% Mix μ","% Mix σ",`Tarifa μ (${tarifaUnit})`,`Tarifa σ`,"Desc % μ","Desc % σ","Valor ($)","Vida (yr)","Residual (%)","Tarifa Neta μ","$/día equiv."].map(h=>(
              <th key={h} style={{padding:"6px 8px",textAlign:"left",fontFamily:mono,fontWeight:600,whiteSpace:"nowrap"}}>{h}</th>
            ))}</tr></thead>
          <tbody>{mix.map((c,i)=>{
            const w=c.mix_pct/(total||1),dp=c.desc_pct||0,neta=c.tarifa_mean*(1-dp/100);
            return(<tr key={i} style={{background:i%2===0?C.light:C.card,borderBottom:`1px solid ${C.border}`}}>
              <td style={{padding:"4px 8px"}}><input value={c.cat} onChange={e=>upd(i,"cat",e.target.value)} style={{width:"100%",border:"none",background:"transparent",fontSize:11,fontFamily:mono,color:C.text}}/></td>
              <td style={{padding:"3px 4px"}}><input type="number" value={c.mix_pct} onChange={e=>upd(i,"mix_pct",parseFloat(e.target.value))} style={inp}/></td>
              <td style={{padding:"3px 4px"}}><input type="number" value={c.mix_std} onChange={e=>upd(i,"mix_std",parseFloat(e.target.value))} style={inp}/></td>
              <td style={{padding:"3px 4px"}}><input type="number" value={c.tarifa_mean} onChange={e=>upd(i,"tarifa_mean",parseFloat(e.target.value))} style={inp}/></td>
              <td style={{padding:"3px 4px"}}><input type="number" value={c.tarifa_std} onChange={e=>upd(i,"tarifa_std",parseFloat(e.target.value))} style={inp}/></td>
              <td style={{padding:"3px 4px"}}><input type="number" value={dp} min={0} max={30} step={0.5} onChange={e=>upd(i,"desc_pct",parseFloat(e.target.value))} style={{...inp,border:`1px solid ${dp>10?C.red:dp>7?C.orange:C.border}`,color:dp>10?C.red:dp>7?C.orange:C.text}}/></td>
              <td style={{padding:"3px 4px"}}><input type="number" value={c.desc_std||0} min={0} max={5} step={0.25} onChange={e=>upd(i,"desc_std",parseFloat(e.target.value))} style={inp}/></td>
              <td style={{padding:"3px 4px"}}><input type="number" value={c.valor||0} onChange={e=>upd(i,"valor",parseFloat(e.target.value))} style={{...inp,border:`1px solid ${C.navy}55`,color:C.navy,fontWeight:600}}/></td>
              <td style={{padding:"3px 4px"}}><input type="number" value={c.vida||4} min={1} max={15} step={0.5} onChange={e=>upd(i,"vida",parseFloat(e.target.value))} style={{...inp,color:C.teal,fontWeight:600}}/></td>
              <td style={{padding:"3px 4px"}}><input type="number" value={c.residual||35} min={0} max={80} step={1} onChange={e=>upd(i,"residual",parseFloat(e.target.value))} style={{...inp,color:C.orange,fontWeight:600}}/></td>
              <td style={{padding:"4px 8px",fontFamily:mono,textAlign:"right"}}>
                <span style={{color:C.deep,fontWeight:600}}>{esD?"$"+neta.toFixed(2):"$"+fmtF(Math.round(neta))}</span>
                <span style={{color:dp>10?C.red:C.muted,fontSize:10,marginLeft:4}}>−{dp.toFixed(1)}% ({(w*100).toFixed(1)}%)</span>
              </td>
              <td style={{padding:"4px 8px",fontFamily:mono,textAlign:"right",color:C.teal,fontWeight:600}}>
                {esD ? <span style={{color:C.muted,fontSize:10}}>—</span> : "$"+(c.tarifa_mean/30.44).toFixed(2)}
              </td>
            </tr>);
          })}</tbody>
        </table>
      </div>
    </div>
  );
}

function KpiCard({label,val,p10,p90,color,sub,icon}){
  return(
    <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"14px 16px",borderTop:`3px solid ${color||C.deep}`}}>
      <div style={{fontSize:10,color:C.muted,textTransform:"uppercase",letterSpacing:1}}>{icon} {label}</div>
      <div style={{fontSize:20,fontWeight:800,color:color||C.deep,fontFamily:mono,margin:"5px 0 3px"}}>{val}</div>
      <div style={{fontSize:10,color:C.muted}}>P10 {p10} · P90 {p90}</div>
      {sub&&<div style={{fontSize:10,color:C.orange,marginTop:4}}>{sub}</div>}
    </div>
  );
}

function OAEBar({label,value,color,brecha,Pe,icon}){
  const w=Math.min(100,value*100);
  const bw=Math.min(100-w,(Pe>0?brecha/Pe*100:0));
  return(
    <div style={{marginBottom:14}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
        <span style={{fontSize:12,color:C.text,fontWeight:600}}>{icon} {label}</span>
        <div style={{display:"flex",gap:12,alignItems:"center"}}>
          <span style={{fontFamily:mono,fontSize:13,fontWeight:700,color}}>{pct(value)}</span>
          <span style={{fontFamily:mono,fontSize:11,color:C.red}}>−{fmt$(brecha)}</span>
        </div>
      </div>
      <div style={{background:C.light,borderRadius:6,height:14,overflow:"hidden",position:"relative"}}>
        <div style={{width:`${w}%`,height:"100%",background:color,borderRadius:6}}/>
        <div style={{position:"absolute",top:0,left:`${w}%`,width:`${bw}%`,height:"100%",background:`${C.red}44`,borderRadius:"0 4px 4px 0"}}/>
      </div>
    </div>
  );
}

const TABS=[
  {id:"params",    label:"📋 Supuestos"},
  {id:"resultados",label:"📊 Resultados"},
  {id:"oae",       label:"📐 OAE"},
  {id:"waterfall", label:"💧 Cascada P&L"},
  {id:"tornado",   label:"🌪️ Tornado"},
];

export default function SimuladorRentaAutos(){
  const [params,setParams]=useState(flatParams);
  const [mixDiaria,setMixDiaria]=useState(DEFAULT_MIX_DIARIA);
  const [mixCorp,setMixCorp]=useState(DEFAULT_MIX_CORP);
  const [openSec,setOpenSec]=useState({flota:true,oae_disp:true,oae_util:true,oae_yield:true,oae_cal:true,diaria:true,corp:true});
  const [activeTab,setActiveTab]=useState("params");
  const [S_,setS_]=useState(null);
  const [running,setRunning]=useState(false);
  const [N,setN]=useState(3000);
  const paramsRef=useRef(params);
  const mixDRef=useRef(mixDiaria);
  const mixCRef=useRef(mixCorp);

  const handleChange=useCallback((k,field,val)=>{
    setParams(prev=>{const n={...prev,[k]:{...prev[k],[field]:val}};paramsRef.current=n;return n;});
  },[]);
  const handleMixD=useCallback(fn=>{setMixDiaria(prev=>{const n=typeof fn==="function"?fn(prev):fn;mixDRef.current=n;return n;});},[]);
  const handleMixC=useCallback(fn=>{setMixCorp(prev=>{const n=typeof fn==="function"?fn(prev):fn;mixCRef.current=n;return n;});},[]);
  const toggleSec=id=>setOpenSec(prev=>({...prev,[id]:!prev[id]}));

  const handleRun=useCallback(()=>{
    setRunning(true);
    setTimeout(()=>{
      setS_(runSim(paramsRef.current,mixDRef.current,mixCRef.current,N));
      setRunning(false);
      setActiveTab("resultados");
    },30);
  },[N]);

  const resetSigma=()=>{
    const z={};Object.entries(paramsRef.current).forEach(([k,v])=>z[k]={...v,std:0});
    setParams(z);paramsRef.current=z;
  };

  return(
    <div style={{fontFamily:sans,background:C.light,minHeight:"100vh",color:C.text}}>

      {/* HEADER */}
      <div style={{background:C.deep,color:"#fff",padding:"12px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",borderBottom:`3px solid ${C.gold}`,flexWrap:"wrap",gap:8}}>
        <div>
          <div style={{fontSize:10,letterSpacing:3,textTransform:"uppercase",color:C.gold,fontWeight:600}}>PROMUNDIAL CONSULTING GROUP</div>
          <div style={{fontSize:17,fontWeight:800}}>🚗 Simulador Monte Carlo · Renta de Autos</div>
          <div style={{fontSize:11,color:"#9ab8a0",marginTop:1}}>OAE = D × U × Y × Q · 12 categorías · N={N.toLocaleString()} iter.</div>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
          <button onClick={resetSigma} style={{background:"transparent",color:C.gold,border:`1.5px solid ${C.gold}`,padding:"7px 12px",borderRadius:6,fontSize:11,cursor:"pointer",fontWeight:600}}>σ = 0</button>
          <select value={N} onChange={e=>setN(+e.target.value)} style={{background:"#1a3a2a",color:C.gold,border:`1px solid ${C.gold}55`,borderRadius:6,padding:"6px 10px",fontSize:12,cursor:"pointer"}}>
            {[1000,3000,5000,10000].map(n=><option key={n} value={n}>{n.toLocaleString()} iter.</option>)}
          </select>
          <button onClick={handleRun} disabled={running} style={{background:running?"#555":C.gold,color:"#fff",border:"none",padding:"9px 22px",borderRadius:6,fontWeight:700,fontSize:13,cursor:running?"not-allowed":"pointer"}}>
            {running?"⏳ Simulando...":"▶ Simular"}
          </button>
        </div>
      </div>

      {/* TABS */}
      <div style={{display:"flex",background:C.card,borderBottom:`1px solid ${C.border}`,padding:"0 20px",overflowX:"auto"}}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setActiveTab(t.id)}
            style={{padding:"11px 16px",border:"none",background:"transparent",cursor:"pointer",fontSize:13,
              fontWeight:activeTab===t.id?700:400,color:activeTab===t.id?C.deep:C.muted,
              borderBottom:activeTab===t.id?`2px solid ${C.deep}`:"2px solid transparent",whiteSpace:"nowrap"}}>
            {t.label}
          </button>
        ))}
      </div>

      <div style={{padding:"16px 20px",maxWidth:1300,margin:"0 auto"}}>

        {/* ══ SUPUESTOS ══ */}
        {activeTab==="params"&&(
          <div>
            <div style={{fontSize:11,color:C.muted,marginBottom:12}}>
              μ = valor base · σ = desviación estándar (0 = determinístico). OAE = D × U × Y × Q donde cada dimensión reduce el Potencial Económico (Pe) en cascada.
            </div>

            <Section title="🚗 Flota" open={!!openSec.flota} onToggle={()=>toggleSec("flota")}>
              {Object.entries(GROUPS.find(g=>g.id==="flota").params).map(([k,v])=>(
                <ParamRow key={k} k={k} p={v} val={params[k]||v} onChange={handleChange}/>
              ))}
              <div style={{marginTop:12,padding:"10px 14px",background:`${C.navy}10`,borderRadius:6,border:`1px solid ${C.navy}30`,display:"flex",gap:24,flexWrap:"wrap"}}>
                <div><div style={{fontSize:10,color:C.muted}}>Valor pond. flota diaria (del mix)</div><div style={{fontSize:15,fontWeight:700,color:C.navy,fontFamily:mono}}>${fmtF(Math.round(valorMixMedio(mixDiaria)))}</div></div>
                <div><div style={{fontSize:10,color:C.muted}}>Valor pond. flota corporativa (del mix)</div><div style={{fontSize:15,fontWeight:700,color:C.navy,fontFamily:mono}}>${fmtF(Math.round(valorMixMedio(mixCorp)))}</div></div>
                <div><div style={{fontSize:10,color:C.muted}}>Valor total estimado flota</div><div style={{fontSize:15,fontWeight:700,color:C.deep,fontFamily:mono}}>${fmtF(Math.round(valorMixMedio(mixDiaria)*params.flota_diaria.mean+valorMixMedio(mixCorp)*params.flota_corp.mean))}</div></div>
                <div><div style={{fontSize:10,color:C.muted}}>Dep. anual estimada (del mix)</div><div style={{fontSize:15,fontWeight:700,color:C.teal,fontFamily:mono}}>${fmtF(Math.round(
                  valorMixMedio(mixDiaria)*params.flota_diaria.mean*(1-residualMixMedio(mixDiaria)/100)/vidaMixMedia(mixDiaria)+
                  valorMixMedio(mixCorp)*params.flota_corp.mean*(1-residualMixMedio(mixCorp)/100)/vidaMixMedia(mixCorp)
                ))}/año</div></div>
              </div>
            </Section>

            {["oae_disp","oae_util","oae_yield","oae_cal"].map(id=>{
              const g=GROUPS.find(g=>g.id===id);
              const hint={
                oae_disp:"D se calcula automáticamente desde los tiempos operativos reales. Fórmula: % pérdida por causa = horas perdidas / (horas jornada × días mes). La suma de las 4 pérdidas determina D = 1 − Σ.",
                oae_util:"Factores que reducen la ocupación efectiva sobre los días disponibles. U = ocupación ajustada.",
                oae_yield:"Descuento adicional sobre el precio rack (lista), más allá del descuento por categoría del mix. Y = 1 − desc_total.",
                oae_cal:"% del ingreso cobrado (Vc) que no llega como ingreso neto entregado (Ve). Q = 1 − Σ pérdidas de calidad.",
              }[id];
              return(
                <Section key={id} title={g.label} open={!!openSec[id]} onToggle={()=>toggleSec(id)}>
                  <div style={{fontSize:11,color:C.muted,marginBottom:10,padding:"6px 10px",background:`${C.purple}08`,borderRadius:4,border:`1px solid ${C.purple}20`}}>{hint}</div>
                  {Object.entries(g.params).map(([k,v])=>(<ParamRow key={k} k={k} p={v} val={params[k]||v} onChange={handleChange}/>))}
                  {/* Live D preview for oae_disp */}
                  {id==="oae_disp"&&(()=>{
                    const p=params;
                    const hj=p.horas_jornada.mean, dm=p.dias_mes.mean, hm=hj*dm;
                    const pA=Math.min(0.5,(p.h_alistamiento.mean*p.contratos_mes_auto.mean)/hm);
                    const pP=Math.min(0.4,p.h_mant_prev.mean/hm);
                    const pR=Math.min(0.4,(p.h_reparacion.mean*p.frec_reparacion.mean)/hm);
                    const pS=Math.min(0.3,(p.tasa_siniestros.mean*p.dias_siniestro.mean)/(12*dm));
                    const dLoss=Math.min(0.95,pA+pP+pR+pS);
                    const dVal=Math.max(0.05,1-dLoss);
                    return(
                      <div style={{marginTop:12,padding:"12px 14px",background:`${C.teal}10`,borderRadius:8,border:`1px solid ${C.teal}30`}}>
                        <div style={{fontSize:11,fontWeight:600,color:C.teal,marginBottom:8}}>⚙️ D calculado automáticamente (determinístico, con μ actuales)</div>
                        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:8,marginBottom:10}}>
                          {[
                            ["Alistamiento",pA,"% días"],
                            ["Mant. preventivo",pP,"% días"],
                            ["Reparaciones",pR,"% días"],
                            ["Siniestros",pS,"% días"],
                          ].map(([l,v,u])=>(
                            <div key={l} style={{background:C.card,borderRadius:6,padding:"8px 10px",border:`1px solid ${C.border}`}}>
                              <div style={{fontSize:10,color:C.muted}}>{l}</div>
                              <div style={{fontFamily:mono,fontSize:14,fontWeight:700,color:v>0.08?C.red:v>0.04?C.orange:C.teal}}>{pct(v)}</div>
                              <div style={{background:C.light,borderRadius:2,height:4,marginTop:4,overflow:"hidden"}}>
                                <div style={{width:`${Math.min(100,v*500)}%`,height:"100%",background:v>0.08?C.red:v>0.04?C.orange:C.teal}}/>
                              </div>
                            </div>
                          ))}
                        </div>
                        <div style={{display:"flex",gap:20,alignItems:"center"}}>
                          <div>
                            <div style={{fontSize:10,color:C.muted}}>Pérdida total</div>
                            <div style={{fontFamily:mono,fontSize:16,fontWeight:700,color:C.red}}>{pct(dLoss)}</div>
                          </div>
                          <div style={{fontSize:20,color:C.muted}}>→</div>
                          <div>
                            <div style={{fontSize:10,color:C.muted}}>D = 1 − pérdida</div>
                            <div style={{fontFamily:mono,fontSize:22,fontWeight:800,color:dVal>0.9?C.green:dVal>0.8?C.teal:dVal>0.7?C.orange:C.red}}>{pct(dVal)}</div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </Section>
              );
            })}

            <Section title="📅 Renta Diaria — Mix de Categorías, Tarifas & Valores ($/día)" open={!!openSec.diaria} onToggle={()=>toggleSec("diaria")}>
              <div style={{fontSize:11,color:C.muted,margin:"0 0 8px"}}>Ocup. base y factores de utilización se configuran en <strong>OAE — Utilización</strong>. Aquí define el mix de categorías y tarifas.</div>
              <div style={{fontSize:11,color:C.muted,margin:"10px 0 4px"}}>Tarifa y valor ponderados calculados automáticamente desde el mix.</div>
              <MixTable mix={mixDiaria} setMix={handleMixD} tarifaUnit="$/día"/>
            </Section>

            <Section title="🏢 Corporativa — Mix de Categorías, Tarifas & Valores ($/mes)" open={!!openSec.corp} onToggle={()=>toggleSec("corp")}>
              <div style={{fontSize:11,color:C.muted,margin:"0 0 8px"}}>Ocup. base corporativa se configura en <strong>OAE — Utilización</strong>. Aquí define el mix de categorías y tarifas mensuales.</div>
              <div style={{fontSize:11,color:C.muted,margin:"10px 0 4px"}}>La tarifa mensual se convierte a $/día equivalente (÷ 30.44) para el cálculo del Potencial Económico.</div>
              <MixTable mix={mixCorp} setMix={handleMixC} tarifaUnit="$/mes"/>
            </Section>

            {GROUPS.filter(g=>!["flota","oae_disp","oae_util","oae_yield","oae_cal"].includes(g.id)).map(g=>(
              <Section key={g.id} title={g.label} open={!!openSec[g.id]} onToggle={()=>toggleSec(g.id)}>
                {Object.entries(g.params).map(([k,v])=>(<ParamRow key={k} k={k} p={v} val={params[k]||v} onChange={handleChange}/>))}
              </Section>
            ))}
          </div>
        )}

        {/* ══ RESULTADOS ══ */}
        {activeTab==="resultados"&&S_&&(
          <div>
            {/* Panel Potencial Económico */}
            <div style={{background:`linear-gradient(135deg,${C.deep},${C.navy})`,borderRadius:12,padding:"20px 24px",marginBottom:16,color:"#fff"}}>
              <div style={{fontSize:11,letterSpacing:2,textTransform:"uppercase",color:C.gold,marginBottom:12,fontWeight:600}}>📐 Potencial Económico — OAE = D × U × Y × Q</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:16}}>
                {[
                  ["Potencial Económico (Pe)","100% D·U·Y·Q",fmt$(S_.Pe.p50),fmt$(S_.Pe.p10),fmt$(S_.Pe.p90),"#fff"],
                  ["Pe Capturado (Ve)","OAE real",fmt$(S_.Pe_capturado.p50),fmt$(S_.Pe_capturado.p10),fmt$(S_.Pe_capturado.p90),C.gold],
                  ["OAE Index","D × U × Y × Q",pct(S_.OAE.p50),pct(S_.OAE.p10),pct(S_.OAE.p90),S_.OAE.p50>0.7?"#4ae88a":S_.OAE.p50>0.5?C.gold:C.red],
                  ["Pe No Capturado","brecha total",fmt$(S_.Pe.p50-S_.Pe_capturado.p50),"—","—",C.red],
                ].map(([l,s,v,lo,hi,col])=>(
                  <div key={l}>
                    <div style={{fontSize:10,color:"#9ab8cc"}}>{l}</div>
                    <div style={{fontSize:9,color:"#7a9ab0",marginBottom:4}}>{s}</div>
                    <div style={{fontSize:22,fontWeight:800,color:col,fontFamily:mono}}>{v}</div>
                    {lo!=="—"&&<div style={{fontSize:10,color:"#7a9ab0"}}>P10 {lo} · P90 {hi}</div>}
                  </div>
                ))}
              </div>
              {/* Desglose brechas */}
              <div style={{marginTop:18,paddingTop:16,borderTop:"1px solid rgba(255,255,255,0.15)"}}>
                <div style={{fontSize:10,letterSpacing:2,textTransform:"uppercase",color:"#9ab8cc",marginBottom:12}}>Desglose de brecha por dimensión (Pe no capturado)</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:10}}>
                  {[
                    {label:"Por Disponibilidad", val:S_.brecha_disp.p50,  dim:S_.D.p50, color:"#e07060", icon:"⚙️"},
                    {label:"Por Utilización",    val:S_.brecha_util.p50,  dim:S_.U.p50, color:"#e0a040", icon:"📅"},
                    {label:"Por Yield",          val:S_.brecha_yield.p50, dim:S_.Y.p50, color:"#60a0e0", icon:"💲"},
                    {label:"Por Calidad",        val:S_.brecha_cal.p50,   dim:S_.Q.p50, color:"#a060e0", icon:"⭐"},
                  ].map(({label,val,dim,color,icon})=>(
                    <div key={label} style={{background:"rgba(255,255,255,0.06)",borderRadius:8,padding:"12px 14px",borderLeft:`3px solid ${color}`}}>
                      <div style={{fontSize:10,color:"#9ab8cc",marginBottom:4}}>{icon} {label}</div>
                      <div style={{fontSize:18,fontWeight:700,color,fontFamily:mono}}>{fmt$(val)}</div>
                      <div style={{fontSize:10,color:"#7a9ab0",marginTop:2}}>Índice: {pct(dim)}</div>
                      <div style={{fontSize:10,color:"#7a9ab0"}}>{pct(val/Math.max(S_.Pe.p50,1))} del Pe</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* KPIs financieros */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:10,marginBottom:16}}>
              <KpiCard label="Revenue (Ve)" icon="💰" val={fmt$(S_.rev_total.p50)} p10={fmt$(S_.rev_total.p10)} p90={fmt$(S_.rev_total.p90)} color={C.blue}/>
              <KpiCard label="EBITDA" icon="📈" val={fmt$(S_.ebitda.p50)} p10={fmt$(S_.ebitda.p10)} p90={fmt$(S_.ebitda.p90)} color={C.teal} sub={`Margen: ${pct(S_.margen_ebitda.p50)}`}/>
              <KpiCard label="Utilidad Neta" icon="🏆" val={fmt$(S_.util_neta.p50)} p10={fmt$(S_.util_neta.p10)} p90={fmt$(S_.util_neta.p90)} color={S_.util_neta.p50>=0?C.green:C.red} sub={`Margen neto: ${pct(S_.margen_neto.p50)}`}/>
              <KpiCard label="EVA" icon="⚡" val={fmt$(S_.eva.p50)} p10={fmt$(S_.eva.p10)} p90={fmt$(S_.eva.p90)} color={S_.eva.p50>=0?C.green:C.red} sub={S_.eva.p50>=0?"Valor creado ✓":"Valor destruido ✗"}/>
              <KpiCard label="ROIC" icon="📐" val={pct(S_.roic.p50)} p10={pct(S_.roic.p10)} p90={pct(S_.roic.p90)} color={S_.roic.p50>params.wacc.mean/100?C.green:C.red} sub={`WACC: ${params.wacc.mean}%`}/>
              <KpiCard label="Rev./auto/año" icon="🚗" val={fmt$(S_.rev_por_auto.p50)} p10={fmt$(S_.rev_por_auto.p10)} p90={fmt$(S_.rev_por_auto.p90)} color={C.orange}/>
              <KpiCard label="Tarifa Diaria Neta" icon="📅" val={"$"+S_.tarifa_d_net.p50.toFixed(2)+"/d"} p10={"$"+S_.tarifa_d_net.p10.toFixed(2)} p90={"$"+S_.tarifa_d_net.p90.toFixed(2)} color={C.deep}/>
              <KpiCard label="Valor Flota Total" icon="🚙" val={fmt$(S_.val_total_flota.p50)} p10={fmt$(S_.val_total_flota.p10)} p90={fmt$(S_.val_total_flota.p90)} color={C.navy}/>
            </div>

            {/* DPU Panel — estándar Hertz/Avis */}
            <div style={{background:C.card,borderRadius:10,border:`1px solid ${C.border}`,padding:"18px 20px",marginBottom:14,borderTop:`3px solid ${C.teal}`}}>
              <div style={{fontSize:13,fontWeight:700,color:C.deep,marginBottom:4}}>🏷️ DPU — Depreciation Per Unit (estándar Hertz / Avis)</div>
              <div style={{fontSize:11,color:C.muted,marginBottom:14}}>
                Costo neto de depreciación por vehículo por mes, ya descontado el valor residual al momento de la venta. Compara con el RevPAC para ver cuánto del ingreso se consume solo en depreciar la flota.
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:12}}>
                {/* DPU */}
                <div style={{background:C.light,borderRadius:8,padding:"14px 16px",border:`1px solid ${C.border}`}}>
                  <div style={{fontSize:10,color:C.muted,textTransform:"uppercase",letterSpacing:1}}>DPU ($/auto/mes)</div>
                  <div style={{fontSize:26,fontWeight:800,color:C.teal,fontFamily:mono,margin:"6px 0 3px"}}>{fmt$(S_.dpu.p50)}</div>
                  <div style={{fontSize:10,color:C.muted}}>P10 {fmt$(S_.dpu.p10)} · P90 {fmt$(S_.dpu.p90)}</div>
                  <div style={{fontSize:10,color:C.muted,marginTop:4}}>Dep. anual / (flota × 12)</div>
                </div>
                {/* RevPAC */}
                <div style={{background:C.light,borderRadius:8,padding:"14px 16px",border:`1px solid ${C.border}`}}>
                  <div style={{fontSize:10,color:C.muted,textTransform:"uppercase",letterSpacing:1}}>RevPAC ($/auto/mes)</div>
                  <div style={{fontSize:26,fontWeight:800,color:C.blue,fontFamily:mono,margin:"6px 0 3px"}}>{fmt$(S_.revpac.p50)}</div>
                  <div style={{fontSize:10,color:C.muted}}>P10 {fmt$(S_.revpac.p10)} · P90 {fmt$(S_.revpac.p90)}</div>
                  <div style={{fontSize:10,color:C.muted,marginTop:4}}>Revenue neto / (flota × 12)</div>
                </div>
                {/* DPU/RevPAC ratio */}
                <div style={{background:C.light,borderRadius:8,padding:"14px 16px",border:`1px solid ${C.border}`}}>
                  <div style={{fontSize:10,color:C.muted,textTransform:"uppercase",letterSpacing:1}}>DPU como % del RevPAC</div>
                  <div style={{fontSize:26,fontWeight:800,
                    color:S_.dpu_coverage.p50<0.15?C.green:S_.dpu_coverage.p50<0.25?C.orange:C.red,
                    fontFamily:mono,margin:"6px 0 3px"}}>{pct(S_.dpu_coverage.p50)}</div>
                  <div style={{fontSize:10,color:C.muted}}>P10 {pct(S_.dpu_coverage.p10)} · P90 {pct(S_.dpu_coverage.p90)}</div>
                  <div style={{fontSize:10,color:C.muted,marginTop:4,fontStyle:"italic"}}>
                    {S_.dpu_coverage.p50<0.15?"✓ Flota bien amortizada":S_.dpu_coverage.p50<0.25?"⚠ Deprec. consume ¼ del ingreso":"✗ Deprec. excesiva vs. revenue"}
                  </div>
                </div>
                {/* Días mínimos para cubrir DPU */}
                <div style={{background:C.light,borderRadius:8,padding:"14px 16px",border:`1px solid ${C.border}`}}>
                  <div style={{fontSize:10,color:C.muted,textTransform:"uppercase",letterSpacing:1}}>Días/mes para cubrir DPU</div>
                  <div style={{fontSize:26,fontWeight:800,color:C.navy,fontFamily:mono,margin:"6px 0 3px"}}>
                    {S_.tarifa_d_net.p50>0 ? (S_.dpu.p50/S_.tarifa_d_net.p50).toFixed(1) : "—"} d
                  </div>
                  <div style={{fontSize:10,color:C.muted}}>DPU ÷ tarifa diaria neta</div>
                  <div style={{fontSize:10,color:C.muted,marginTop:4,fontStyle:"italic"}}>
                    Días mínimos rentado/mes solo para pagar la depreciación
                  </div>
                </div>
              </div>
            </div>

            {/* Costo de Oportunidad del Mix Corporativo */}
            <div style={{background:C.card,borderRadius:10,border:`1px solid ${C.border}`,padding:"18px 20px",marginBottom:14,borderTop:`3px solid ${C.orange}`}}>
              <div style={{fontSize:13,fontWeight:700,color:C.deep,marginBottom:4}}>⚖️ Costo de Oportunidad — Mix Corporativo vs. Renta Diaria</div>
              <div style={{fontSize:11,color:C.muted,marginBottom:14}}>
                Cuánto deja de ganar la empresa por destinar flota al canal corporativo (tarifa/día menor) en lugar de renta diaria. No es ineficiencia — es el precio de la estabilidad contractual.
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(190px,1fr))",gap:12,marginBottom:16}}>
                {[
                  ["Tarifa diaria neta",       "$"+S_.tarifa_d_neta.p50.toFixed(2)+"/día",       C.blue,   "Canal diario (rack − descuentos)"],
                  ["Tarifa corp. neta/día",     "$"+S_.tarifa_c_dia_neta.p50.toFixed(2)+"/día",   C.orange, "Tarifa mensual neta ÷ 30.44"],
                  ["Gap por día rentado",       (S_.gap_por_dia.p50>0?"−$":"$")+Math.abs(S_.gap_por_dia.p50).toFixed(2)+"/día",
                                                S_.gap_por_dia.p50>0?C.red:C.green,              "Diaria − corp equiv."],
                  ["Costo oportunidad anual",   fmt$(S_.costo_oportunidad.p50),                   S_.costo_oportunidad.p50>0?C.red:C.green, `P10 ${fmt$(S_.costo_oportunidad.p10)} · P90 ${fmt$(S_.costo_oportunidad.p90)}`],
                ].map(([l,v,col,sub])=>(
                  <div key={l} style={{background:C.light,borderRadius:8,padding:"14px 16px",border:`1px solid ${C.border}`}}>
                    <div style={{fontSize:10,color:C.muted,textTransform:"uppercase",letterSpacing:1}}>{l}</div>
                    <div style={{fontSize:20,fontWeight:800,color:col,fontFamily:mono,margin:"6px 0 3px"}}>{v}</div>
                    <div style={{fontSize:10,color:C.muted}}>{sub}</div>
                  </div>
                ))}
              </div>

              {/* Veredicto */}
              <div style={{background:`${C.navy}08`,borderRadius:8,padding:"14px 16px",border:`1px solid ${C.navy}20`}}>
                <div style={{fontSize:12,fontWeight:700,color:C.deep,marginBottom:10}}>📊 ¿Vale la pena el canal corporativo?</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(190px,1fr))",gap:12}}>
                  <div>
                    <div style={{fontSize:10,color:C.muted}}>Revenue garantizado corp. (anual)</div>
                    <div style={{fontSize:18,fontWeight:700,color:C.green,fontFamily:mono}}>{fmt$(S_.ingresos_corp_garantizados.p50)}</div>
                    <div style={{fontSize:10,color:C.muted,marginTop:2}}>Ingreso neto entregado canal corp.</div>
                  </div>
                  <div>
                    <div style={{fontSize:10,color:C.muted}}>Costo de oportunidad cedido</div>
                    <div style={{fontSize:18,fontWeight:700,color:C.red,fontFamily:mono}}>{fmt$(S_.costo_oportunidad.p50)}</div>
                    <div style={{fontSize:10,color:C.muted,marginTop:2}}>Vs. todo en renta diaria</div>
                  </div>
                  <div>
                    <div style={{fontSize:10,color:C.muted}}>Ratio estabilidad</div>
                    <div style={{fontSize:18,fontWeight:700,fontFamily:mono,
                      color:S_.ratio_estabilidad.p50>3?C.green:S_.ratio_estabilidad.p50>1.5?C.orange:C.red}}>
                      {S_.ratio_estabilidad.p50.toFixed(1)}x
                    </div>
                    <div style={{fontSize:10,color:C.muted,marginTop:2}}>Revenue corp. / costo oportunidad</div>
                  </div>
                  <div style={{padding:"10px 12px",background:C.card,borderRadius:6,border:`1px solid ${C.border}`}}>
                    <div style={{fontSize:11,fontWeight:700,color:C.deep,marginBottom:4}}>
                      {S_.ratio_estabilidad.p50>3?"✅ Canal corporativo justificado":
                       S_.ratio_estabilidad.p50>1.5?"⚠️ Aceptable — revisar mix de flota":
                       "❌ Canal corp. destruye valor vs. diario"}
                    </div>
                    <div style={{fontSize:10,color:C.muted,lineHeight:1.5}}>
                      {S_.ratio_estabilidad.p50>3?
                        `Por cada ${fmt$(S_.costo_oportunidad.p50)} cedido, se garantizan ${fmt$(S_.ingresos_corp_garantizados.p50)} en revenue estable.`:
                       S_.ratio_estabilidad.p50>1.5?
                        "El corporativo genera más de lo que cede, pero el margen es estrecho. Considera renegociar tarifas o reducir la flota corp.":
                        "El canal diario generaría más revenue. Evalúa reducir la flota corporativa o subir tarifas de contrato."}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Estructura de costos */}
            <div style={{background:C.card,borderRadius:10,border:`1px solid ${C.border}`,padding:"18px 20px",marginBottom:14}}>
              <div style={{fontSize:13,fontWeight:700,color:C.deep,marginBottom:14}}>📊 Estructura de Costos (P50 anual)</div>
              {[
                ["Costos flota (mant.+seguro+lavado+combustible)", S_.costo_flota.p50,    C.orange],
                ["Personal",                                        S_.costo_personal.p50, C.blue],
                ["Gastos fijos",                                    S_.gastos_fijos.p50,   C.muted],
                ["Depreciación",                                    S_.dep_anual.p50,      C.teal],
                ["Intereses (deuda flota)",                         S_.intereses.p50,      C.red],
                ["Impuesto a la renta",                             S_.impuesto.p50,       "#7A5A2A"],
              ].map(([l,v,col])=>(
                <div key={l} style={{marginBottom:10}}>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:3}}>
                    <span style={{color:C.muted}}>{l}</span>
                    <span style={{fontFamily:mono,fontWeight:600,color:col}}>{fmt$(v)}</span>
                  </div>
                  <div style={{background:C.light,borderRadius:3,height:6,overflow:"hidden"}}>
                    <div style={{width:`${Math.min(100,(v/Math.max(S_.rev_total.p50,1))*100)}%`,height:"100%",background:col,borderRadius:3}}/>
                  </div>
                </div>
              ))}
            </div>

            {/* P&L Statement */}
            <div style={{background:C.card,borderRadius:10,border:`1px solid ${C.border}`,padding:"18px 20px",marginBottom:14}}>
              <div style={{fontSize:13,fontWeight:700,color:C.deep,marginBottom:14}}>📋 P&L Renta de Autos — Mediana Anual (P50)</div>
              {[
                {l:"POTENCIAL ECONÓMICO (Pe)",              v: S_.Pe.p50,                                       b:1, c:C.navy},
                {l:"  (−) Brecha Disponibilidad",           v:-S_.brecha_disp.p50,                              c:C.purple, indent:true},
                {l:"  (−) Brecha Utilización",              v:-S_.brecha_util.p50,                              c:C.purple, indent:true},
                {l:"  (−) Brecha Yield",                    v:-S_.brecha_yield.p50,                             c:C.purple, indent:true},
                {l:"  (−) Brecha Calidad",                  v:-S_.brecha_cal.p50,                               c:C.purple, indent:true},
                {l:"= REVENUE NETO (Ve)",                   v: S_.rev_total.p50,                                b:1, c:C.deep, t:1},
                {l:"(−) Costos de Flota",                   v:-S_.costo_flota.p50,                              c:C.orange},
                {l:"(−) Personal",                          v:-S_.costo_personal.p50,                           c:C.red},
                {l:"(−) Gastos Fijos",                      v:-S_.gastos_fijos.p50,                             c:C.red},
                {l:"= EBITDA",                              v: S_.ebitda.p50,                                   b:1, c:S_.ebitda.p50>=0?C.green:C.red, t:1},
                {l:"    Margen EBITDA",                     extra: pct(S_.margen_ebitda.p50),                   c:C.muted, indent:true},
                {l:"(−) Depreciación",                      v:-S_.dep_anual.p50,                                c:C.muted},
                {l:"= EBIT",                                v: S_.ebit.p50,                                     b:1, c:C.blue, t:1},
                {l:"(−) Intereses (deuda flota)",           v:-S_.intereses.p50,                                c:C.orange},
                {l:"= EBT (base imponible)",                v: S_.ebt.p50,                                      b:1, c:C.blue, t:1},
                {l:`(−) IR ${params.ir.mean}%`,             v:-S_.impuesto.p50,                                 c:C.muted},
                {l:"= UTILIDAD NETA",                       v: S_.util_neta.p50,                                b:1, c:S_.util_neta.p50>=0?C.deep:C.red, t:1},
                {l:"    Margen neto",                       extra: pct(S_.margen_neto.p50),                     c:C.muted, indent:true},
                {l:"    NOPAT (EBIT × (1−IR))",             v: S_.nopat.p50,                                    c:C.muted, indent:true},
                {l:"(−) Cargo capital (Flota × WACC)",      v:-(S_.val_total_flota.p50*(params.wacc.mean/100)), c:C.red},
                {l:"    Capital invertido (flota)",          v: S_.val_total_flota.p50,                         c:C.muted, indent:true},
                {l:"= EVA [NOPAT − Capital×WACC]",          v: S_.eva.p50,                                      b:1, c:S_.eva.p50>=0?C.gold:C.red, t:1},
              ].map((r,i)=>(
                <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"3px 0",
                  fontFamily:mono, fontSize:r.indent?11:12, fontWeight:r.b?700:400,
                  borderTop:r.t?`1px solid ${C.border}`:"none",
                  marginLeft:r.indent?14:0, opacity:r.indent?0.8:1}}>
                  <span style={{color:r.indent?C.muted:C.text}}>{r.l}</span>
                  <span style={{color:r.c, fontWeight:r.b?700:500}}>
                    {r.extra ? r.extra : `$${fmtF(Math.round(r.v||0))}`}
                  </span>
                </div>
              ))}
            </div>

            {/* Histogramas */}
            <HistoPanel S_={S_}/>
          </div>
        )}

        {/* ══ OAE ══ */}
        {activeTab==="oae"&&S_&&(
          <div>
            <div style={{background:C.card,borderRadius:10,border:`1px solid ${C.border}`,padding:"20px 24px",marginBottom:14}}>
              <div style={{fontSize:14,fontWeight:700,color:C.deep,marginBottom:4}}>📐 OAE — Overall Asset Effectiveness</div>
              <div style={{fontSize:11,color:C.muted,marginBottom:16}}>OAE = D × U × Y × Q = Ve / Cp · Promundial Consulting Group · Najas (2026)</div>
              <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:20}}>
                {[["D — Disponibilidad",S_.D,C.teal,"⚙️"],["U — Utilización",S_.U,C.blue,"📅"],
                  ["Y — Yield",S_.Y,C.orange,"💲"],["Q — Calidad",S_.Q,C.purple,"⭐"],
                  ["OAE = D×U×Y×Q",S_.OAE,S_.OAE.p50>0.7?C.green:S_.OAE.p50>0.5?C.orange:C.red,"🎯"]
                ].map(([label,val,col,icon])=>(
                  <div key={label} style={{background:C.light,borderRadius:8,padding:"12px 16px",border:`2px solid ${col}44`,flex:"1 1 140px",textAlign:"center"}}>
                    <div style={{fontSize:10,color:C.muted,marginBottom:4}}>{icon} {label}</div>
                    <div style={{fontSize:26,fontWeight:800,color:col,fontFamily:mono}}>{pct(val.p50)}</div>
                    <div style={{fontSize:9,color:C.muted,marginTop:2}}>P10 {pct(val.p10)} · P90 {pct(val.p90)}</div>
                  </div>
                ))}
              </div>
              <div style={{marginBottom:8,fontSize:12,fontWeight:600,color:C.deep}}>Potencial Económico — cascada de captura (P50)</div>
              <OAEBar label="Disponibilidad (D)" value={S_.D.p50} color={C.teal}   brecha={S_.brecha_disp.p50}  Pe={S_.Pe.p50} icon="⚙️"/>
              <OAEBar label="Utilización (U)"    value={S_.U.p50} color={C.blue}   brecha={S_.brecha_util.p50}  Pe={S_.Pe.p50} icon="📅"/>
              <OAEBar label="Yield (Y)"          value={S_.Y.p50} color={C.orange} brecha={S_.brecha_yield.p50} Pe={S_.Pe.p50} icon="💲"/>
              <OAEBar label="Calidad (Q)"        value={S_.Q.p50} color={C.purple} brecha={S_.brecha_cal.p50}   Pe={S_.Pe.p50} icon="⭐"/>
            </div>

            {/* Diagnóstico por dimensión */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",gap:14}}>
              {[
                {title:"⚙️ Disponibilidad",color:C.teal,val:S_.D.p50,brecha:S_.brecha_disp.p50,
                  factores:[
                    ["Alistamiento/rotación",  pct(S_.pct_alist.p50), `(${params.h_alistamiento.mean}h × ${params.contratos_mes_auto.mean} contratos/mes)`],
                    ["Mant. preventivo",        pct(S_.pct_prev.p50),  `(${params.h_mant_prev.mean}h/mes)`],
                    ["Reparación correctiva",   pct(S_.pct_rep.p50),   `(${params.h_reparacion.mean}h × ${params.frec_reparacion.mean} eventos/mes)`],
                    ["Siniestros",              pct(S_.pct_sin.p50),   `(${params.tasa_siniestros.mean} sin/año × ${params.dias_siniestro.mean}d)`],
                    ["Jornada base",            params.horas_jornada.mean+"h/día", `${params.dias_mes.mean} días/mes`],
                  ],
                  lectura:"Cp → Cd: tiempo que el vehículo no puede ser rentado por causas internas, calculado desde KPIs operativos reales."},
                {title:"📅 Utilización",color:C.blue,val:S_.U.p50,brecha:S_.brecha_util.p50,
                  factores:[
                    ["No-shows/cancelaciones",  pct(params.noshow_pct.mean/100),         `(${params.noshow_pct.mean}% de contratos)`],
                    ["Turnaround entre contratos",pct(params.turnaround_pct.mean/100),    `(${params.turnaround_pct.mean}% días disponibles)`],
                    ["Estacionalidad baja",      pct(params.estacionalidad_pct.mean/100), `(${params.estacionalidad_pct.mean}% reducción promedio)`],
                  ],
                  lectura:"Cd → Cu: días disponibles que no generan renta por causas comerciales."},
                {title:"💲 Yield",color:C.orange,val:S_.Y.p50,brecha:S_.brecha_yield.p50,
                  factores:[
                    ["Upgrades gratuitos",        pct(params.upgrade_gratuito_pct.mean/100), `(${params.upgrade_gratuito_pct.mean}% de contratos diarios)`],
                    ["Brecha tarifa negociada",   pct(params.tarifa_negociada_pct.mean/100), `(vs. tarifa rack)`],
                    ["Desc. mix pond. (diaria)",  pct(descMixMedio(mixDiaria)/100),          `(promedio ponderado por categoría)`],
                  ],
                  lectura:"Cu → Vc: diferencia entre tarifa rack y precio efectivamente cobrado."},
                {title:"⭐ Calidad",color:C.purple,val:S_.Q.p50,brecha:S_.brecha_cal.p50,
                  factores:[
                    ["Daños no cobrados",         pct(params.danos_no_cobrados.mean/100),  `(% del ingreso cobrado)`],
                    ["No-shows sin cargo",         pct(params.noshow_sin_cargo.mean/100),   `(% del ingreso cobrado)`],
                    ["Reclamos seguro pendientes", pct(params.reclamos_seguro.mean/100),    `(% del ingreso cobrado)`],
                    ["Compensaciones/quejas",      pct(params.compensaciones.mean/100),     `(% del ingreso cobrado)`],
                  ],
                  lectura:"Vc → Ve: ingreso cobrado que no llega como valor entregado neto."},
              ].map(({title,color,val,brecha,factores,lectura})=>(
                <div key={title} style={{background:C.card,borderRadius:10,border:`1px solid ${C.border}`,padding:"16px 18px",borderTop:`3px solid ${color}`}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                    <div style={{fontSize:13,fontWeight:700,color:C.deep}}>{title}</div>
                    <div style={{fontFamily:mono,fontSize:18,fontWeight:800,color}}>{pct(val)}</div>
                  </div>
                  <div style={{fontSize:10,color:C.muted,marginBottom:10,fontStyle:"italic"}}>{lectura}</div>
                  {factores.map(([l,v,note])=>(
                    <div key={l} style={{padding:"5px 0",borderBottom:`1px solid ${C.border}`}}>
                      <div style={{display:"flex",justifyContent:"space-between",fontSize:11}}>
                        <span style={{color:C.muted}}>{l}</span>
                        <span style={{fontFamily:mono,fontWeight:600,color:C.text}}>{v}</span>
                      </div>
                      {note&&<div style={{fontSize:10,color:C.muted,marginTop:1}}>{note}</div>}
                    </div>
                  ))}
                  <div style={{marginTop:10,padding:"8px 10px",background:`${color}10`,borderRadius:6}}>
                    <div style={{fontSize:10,color:C.muted}}>Brecha monetaria (P50 anual)</div>
                    <div style={{fontFamily:mono,fontSize:15,fontWeight:700,color:C.red}}>{fmt$(brecha)}</div>
                    <div style={{fontSize:10,color:C.muted}}>{pct(brecha/Math.max(S_.Pe.p50,1))} del Potencial Económico</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ══ WATERFALL ══ */}
        {activeTab==="waterfall"&&S_&&(
          <div style={{background:C.card,borderRadius:10,border:`1px solid ${C.border}`,padding:"20px 24px"}}>
            <div style={{fontSize:14,fontWeight:700,color:C.deep,marginBottom:20}}>💧 Cascada P&L — Valores P50 anuales</div>
            {[
              {label:"Potencial Económico (Pe)",  val: S_.Pe.p50,             type:"ref"},
              {label:"− Brecha Disponibilidad",   val:-S_.brecha_disp.p50,   type:"oae"},
              {label:"− Brecha Utilización",      val:-S_.brecha_util.p50,   type:"oae"},
              {label:"− Brecha Yield",            val:-S_.brecha_yield.p50,  type:"oae"},
              {label:"− Brecha Calidad",          val:-S_.brecha_cal.p50,    type:"oae"},
              {label:"= Revenue Neto (Ve)",       val: S_.rev_total.p50,     type:"total"},
              {label:"− Costos de Flota",         val:-S_.costo_flota.p50,   type:"neg"},
              {label:"− Personal",                val:-S_.costo_personal.p50,type:"neg"},
              {label:"− Gastos Fijos",            val:-S_.gastos_fijos.p50,  type:"neg"},
              {label:"= EBITDA",                  val: S_.ebitda.p50,        type:"total"},
              {label:"− Depreciación",            val:-S_.dep_anual.p50,     type:"neg"},
              {label:"= EBIT",                    val: S_.ebit.p50,          type:"total"},
              {label:"− Intereses",               val:-S_.intereses.p50,     type:"neg"},
              {label:"= EBT (base imponible)",    val: S_.ebt.p50,           type:"total"},
              {label:"− Impuestos",               val:-S_.impuesto.p50,      type:"neg"},
              {label:"= Utilidad Neta",           val: S_.util_neta.p50,     type:"total"},
            ].map(({label,val,type})=>{
              const isT=type==="total",isOae=type==="oae",isRef=type==="ref";
              const col=isRef?C.navy:isT?C.deep:isOae?C.purple:C.red;
              const barW=Math.min(100,Math.abs(val)/Math.max(S_.Pe.p50,1)*100);
              return(
                <div key={label} style={{display:"flex",alignItems:"center",gap:10,marginBottom:isT?14:6,paddingTop:isT?10:0,borderTop:isT?`1px solid ${C.border}`:"none"}}>
                  <div style={{width:240,fontSize:isT||isRef?13:12,fontWeight:isT||isRef?700:400,color:isT?C.deep:isRef?C.navy:isOae?C.purple:C.muted,flexShrink:0}}>{label}</div>
                  <div style={{flex:1,background:C.light,borderRadius:4,height:isT||isRef?18:10,overflow:"hidden"}}>
                    <div style={{width:`${barW}%`,height:"100%",background:col,borderRadius:4,opacity:isT||isRef?1:0.7}}/>
                  </div>
                  <div style={{width:100,textAlign:"right",fontFamily:mono,fontSize:isT||isRef?14:12,fontWeight:isT||isRef?800:500,color:val>=0?col:C.red,flexShrink:0}}>{fmt$(val)}</div>
                </div>
              );
            })}
          </div>
        )}

        {/* ══ TORNADO ══ */}
        {activeTab==="tornado"&&S_&&(
          <div style={{background:C.card,borderRadius:10,border:`1px solid ${C.border}`,padding:"20px 24px"}}>
            <div style={{fontSize:14,fontWeight:700,color:C.deep,marginBottom:6}}>🌪️ Sensibilidad — Impacto individual en EVA (P10→P90)</div>
            <div style={{fontSize:11,color:C.muted,marginBottom:16}}>
              Cada barra muestra el rango P10/P90 del EVA cuando <em>solo esa variable</em> es estocástica (las demás determinísticas). Variables con σ = 0 no aparecen.
            </div>
            {(()=>{
              const items=(S_._sensitivity||[]).slice(0,12);
              if(!items.length) return <div style={{color:C.muted,fontSize:12,padding:"20px 0"}}>Todas las variables tienen σ = 0. Ajusta las desviaciones estándar en Supuestos para ver el tornado.</div>;
              const maxI=items[0]?.impact||1;
              const groupColors={oae_disp:C.teal,oae_util:C.blue,oae_yield:C.orange,oae_cal:C.purple};
              return items.map(({label,impact,group})=>{
                const col=groupColors[group]||C.green;
                return(
                  <div key={label} style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
                    <div style={{width:240,fontSize:11,color:C.muted,textAlign:"right",flexShrink:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{label}</div>
                    <div style={{flex:1,background:C.light,borderRadius:4,height:18,overflow:"hidden"}}>
                      <div style={{width:`${impact/maxI*100}%`,height:"100%",background:`linear-gradient(90deg,${col}88,${col})`,borderRadius:4}}/>
                    </div>
                    <div style={{width:90,textAlign:"right",fontFamily:mono,fontSize:12,fontWeight:600,color:C.deep,flexShrink:0}}>{fmt$(impact)}</div>
                  </div>
                );
              });
            })()}
            <div style={{marginTop:16,fontSize:11,color:C.muted}}>
              Colores: <span style={{color:C.teal}}>■</span> Disponibilidad &nbsp;
              <span style={{color:C.blue}}>■</span> Utilización &nbsp;
              <span style={{color:C.orange}}>■</span> Yield &nbsp;
              <span style={{color:C.purple}}>■</span> Calidad &nbsp;
              <span style={{color:C.green}}>■</span> Otros
            </div>
          </div>
        )}

        {!S_&&activeTab!=="params"&&(
          <div style={{textAlign:"center",padding:"60px 20px",color:C.muted}}>
            <div style={{fontSize:40,marginBottom:12}}>🚗</div>
            <div style={{fontSize:16,fontWeight:600,marginBottom:8}}>Sin resultados aún</div>
            <div style={{fontSize:13}}>Ajusta los supuestos y presiona <strong>▶ Simular</strong></div>
          </div>
        )}
      </div>

      <div style={{textAlign:"center",padding:"20px",fontSize:11,color:C.muted}}>
        Promundial Consulting Group · Simulador Renta de Autos v7 · OAE = D × U × Y × Q · Najas (2026)
      </div>
    </div>
  );
}

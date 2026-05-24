import { useState, useCallback, useRef, useEffect } from "react";

// ═══════════════════════════════════════════════════════════════════
// SIMULADOR MONTE CARLO — HOSPITAL / CLÍNICA  v3
// Promundial Consulting Group
// Fix: simulación en Web Worker (no bloquea UI)
// Goal-Seek: EVA + EBITDA + Utilidad Neta con diagnóstico alcanzabilidad
// ═══════════════════════════════════════════════════════════════════

const PM_GREEN  = "#1A5C38";
const PM_DEEP   = "#0F3521";
const PM_GOLD   = "#C8922A";
const PM_LIGHT  = "#F7F5F0";
const PM_CARD   = "#FFFFFF";
const PM_BORDER = "#D8D3CA";
const PM_TEXT   = "#1E1E1E";
const PM_MUTED  = "#6B6458";
const PM_RED    = "#B03A3A";
const PM_BLUE   = "#2B5580";
const PM_TEAL   = "#1A6B5C";
const PM_ORANGE = "#C06820";
const IR_RATE   = 0.25;

// ─── Helpers ──────────────────────────────────────────────────────
function randNormal(mean, std) {
  if (std <= 0) return mean;
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return mean + std * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function SP(p, key) { const d = p[key]; return clamp(randNormal(d.mean, d.std), d.min, d.max); }
function fmtFull(n) {
  if (n === undefined || isNaN(n)) return "—";
  return (n >= 0 ? "" : "−") + "$" + Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 0 });
}
function fmtK(n) {
  if (n === undefined || isNaN(n)) return "—";
  const a = Math.abs(n);
  const s = n < 0 ? "−$" : "$";
  if (a >= 1e6) return s + (a/1e6).toFixed(2) + "M";
  if (a >= 1e3) return s + (a/1e3).toFixed(1) + "K";
  return s + a.toFixed(0);
}
function pct(n) { return isNaN(n) ? "—" : (n * 100).toFixed(1) + "%"; }

// ─── PARAM GROUPS ─────────────────────────────────────────────────
const PARAM_GROUPS = [
  { id:"qx", label:"Quirófanos", icon:"🔬", params:{
    qx_salas:           {mean:4,    std:0,    min:1,   max:20,       label:"Salas quirúrgicas activas",               unit:"u",   lever:false},
    qx_horas_dia:       {mean:8,    std:0.5,  min:4,   max:14,       label:"Horas útiles/sala/día",                   unit:"h",   lever:true },
    qx_utilizacion:     {mean:72,   std:5,    min:30,  max:95,       label:"Utilización horaria sala (%)",            unit:"%",   lever:true },
    qx_duracion_caso:   {mean:90,   std:15,   min:20,  max:360,      label:"Duración promedio caso (min)",            unit:"min", lever:false},
    qx_rotacion_min:    {mean:35,   std:8,    min:5,   max:90,       label:"Tiempo rotación entre casos (min)",       unit:"min", lever:true },
    qx_dias_mes:        {mean:22,   std:1,    min:18,  max:26,       label:"Días operativos/mes",                     unit:"d",   lever:false},
    qx_ticket_prom:     {mean:3200, std:500,  min:800, max:12000,    label:"Ticket promedio cirugía ($)",             unit:"$",   lever:false},
    qx_margen_bruto:    {mean:55,   std:5,    min:30,  max:75,       label:"Margen bruto quirúrgico (%)",             unit:"%",   lever:true },
    qx_cancelaciones:   {mean:8,    std:2,    min:0,   max:25,       label:"Tasa cancelación (%)",                    unit:"%",   lever:true },
    qx_complicaciones:  {mean:3,    std:1,    min:0,   max:15,       label:"Tasa complicaciones/reintervención (%)",  unit:"%",   lever:true },
  }},
  { id:"em", label:"Emergencias", icon:"🚑", params:{
    em_atenciones_dia:  {mean:120,  std:15,   min:40,  max:400,      label:"Pacientes que llegan/día",                unit:"u",   lever:false},
    em_triage_espera:   {mean:28,   std:8,    min:5,   max:120,      label:"Espera triage → atención (min)",          unit:"min", lever:true },
    em_umbral_abandono: {mean:45,   std:0,    min:15,  max:120,      label:"Umbral abandono sin atención (min)",      unit:"min", lever:false},
    em_dias_mes:        {mean:30,   std:0,    min:28,  max:31,       label:"Días/mes",                                unit:"d",   lever:false},
    em_ticket_prom:     {mean:420,  std:60,   min:150, max:1200,     label:"Ticket promedio ($)",                     unit:"$",   lever:false},
    em_margen_bruto:    {mean:42,   std:5,    min:20,  max:65,       label:"Margen bruto (%)",                        unit:"%",   lever:true },
    em_tasa_hospital:   {mean:15,   std:3,    min:5,   max:40,       label:"Tasa hospitalización desde EM (%)",       unit:"%",   lever:true },
    em_reconsulta_72h:  {mean:8,    std:2,    min:0,   max:25,       label:"Tasa re-consulta 72 hrs (%)",             unit:"%",   lever:true },
  }},
  { id:"rx",  label:"Rayos X / Ecografía", icon:"📡", params:{
    rx_equipos:         {mean:4,    std:0,    min:0,   max:20,       label:"Equipos activos (RX + Ecografía)",        unit:"u",   lever:false},
    rx_estudios_dia:    {mean:22,   std:3,    min:5,   max:80,       label:"Estudios realizados/equipo/día",          unit:"u",   lever:true },
    rx_capacidad_hora:  {mean:6,    std:0,    min:1,   max:20,       label:"Capacidad teórica (estudios/hr)",         unit:"u",   lever:false},
    rx_horas_prog:      {mean:10,   std:0,    min:4,   max:24,       label:"Horas programadas/día",                   unit:"h",   lever:false},
    rx_dias_mes:        {mean:26,   std:1,    min:22,  max:28,       label:"Días operativos/mes",                     unit:"d",   lever:false},
    rx_disponibilidad:  {mean:92,   std:3,    min:50,  max:99,       label:"OEE — Disponibilidad (%)",                unit:"%",   lever:true },
    rx_ticket_prom:     {mean:85,   std:15,   min:30,  max:250,      label:"Ticket promedio ($)",                     unit:"$",   lever:false},
    rx_margen_bruto:    {mean:62,   std:5,    min:35,  max:80,       label:"Margen bruto (%)",                        unit:"%",   lever:true },
    rx_estudios_rep:    {mean:3,    std:1,    min:0,   max:15,       label:"OEE — Calidad inversa: estudios rep. (%)",unit:"%",   lever:true },
    rx_mant_pct_valor:  {mean:6,    std:1,    min:1,   max:15,       label:"Mantenimiento anual (% valor equipo)",    unit:"%",   lever:false},
    rx_valor_equipo:    {mean:80000,std:0,    min:5000,max:500000,   label:"Valor promedio por equipo ($)",           unit:"$",   lever:false},
  }},
  { id:"ct",  label:"Tomografía (CT)", icon:"🔵", params:{
    ct_equipos:         {mean:1,    std:0,    min:0,   max:6,        label:"Equipos TAC activos",                     unit:"u",   lever:false},
    ct_estudios_dia:    {mean:18,   std:3,    min:3,   max:50,       label:"Estudios realizados/equipo/día",          unit:"u",   lever:true },
    ct_capacidad_hora:  {mean:4,    std:0,    min:1,   max:12,       label:"Capacidad teórica (estudios/hr)",         unit:"u",   lever:false},
    ct_horas_prog:      {mean:12,   std:0,    min:4,   max:24,       label:"Horas programadas/día",                   unit:"h",   lever:false},
    ct_dias_mes:        {mean:26,   std:1,    min:22,  max:28,       label:"Días operativos/mes",                     unit:"d",   lever:false},
    ct_disponibilidad:  {mean:88,   std:4,    min:50,  max:99,       label:"OEE — Disponibilidad (%)",                unit:"%",   lever:true },
    ct_ticket_prom:     {mean:320,  std:50,   min:100, max:900,      label:"Ticket promedio ($)",                     unit:"$",   lever:false},
    ct_margen_bruto:    {mean:58,   std:6,    min:30,  max:78,       label:"Margen bruto (%)",                        unit:"%",   lever:true },
    ct_estudios_rep:    {mean:2,    std:1,    min:0,   max:10,       label:"OEE — Calidad inversa: estudios rep. (%)",unit:"%",   lever:true },
    ct_entrega_hrs:     {mean:2,    std:0.5,  min:0.5, max:12,       label:"Tiempo entrega resultados (hrs)",         unit:"h",   lever:true },
    ct_mant_pct_valor:  {mean:10,   std:1,    min:3,   max:18,       label:"Mantenimiento anual (% valor equipo)",    unit:"%",   lever:false},
    ct_valor_equipo:    {mean:800000,std:0,   min:100000,max:3000000,label:"Valor promedio por equipo ($)",           unit:"$",   lever:false},
  }},
  { id:"mri", label:"Resonancia (MRI)", icon:"🟣", params:{
    mri_equipos:        {mean:1,    std:0,    min:0,   max:6,        label:"Equipos RMN activos",                     unit:"u",   lever:false},
    mri_estudios_dia:   {mean:10,   std:2,    min:2,   max:30,       label:"Estudios realizados/equipo/día",          unit:"u",   lever:true },
    mri_capacidad_hora: {mean:2,    std:0,    min:0.5, max:6,        label:"Capacidad teórica (estudios/hr)",         unit:"u",   lever:false},
    mri_horas_prog:     {mean:14,   std:0,    min:6,   max:24,       label:"Horas programadas/día",                   unit:"h",   lever:false},
    mri_dias_mes:       {mean:26,   std:1,    min:22,  max:28,       label:"Días operativos/mes",                     unit:"d",   lever:false},
    mri_disponibilidad: {mean:85,   std:4,    min:50,  max:99,       label:"OEE — Disponibilidad (%)",                unit:"%",   lever:true },
    mri_ticket_prom:    {mean:620,  std:80,   min:200, max:1800,     label:"Ticket promedio ($)",                     unit:"$",   lever:false},
    mri_margen_bruto:   {mean:55,   std:6,    min:30,  max:75,       label:"Margen bruto (%)",                        unit:"%",   lever:true },
    mri_estudios_rep:   {mean:2,    std:1,    min:0,   max:8,        label:"OEE — Calidad inversa: estudios rep. (%)",unit:"%",   lever:true },
    mri_entrega_hrs:    {mean:4,    std:1,    min:1,   max:24,       label:"Tiempo entrega resultados (hrs)",         unit:"h",   lever:true },
    mri_mant_pct_valor: {mean:11,   std:1,    min:3,   max:18,       label:"Mantenimiento anual (% valor equipo)",    unit:"%",   lever:false},
    mri_valor_equipo:   {mean:1200000,std:0,  min:200000,max:5000000,label:"Valor promedio por equipo ($)",           unit:"$",   lever:false},
  }},
  { id:"nuc", label:"Nuclear / Mamografía", icon:"☢️", params:{
    nuc_equipos:        {mean:1,    std:0,    min:0,   max:4,        label:"Equipos activos (PET/SPECT/Mamo)",        unit:"u",   lever:false},
    nuc_estudios_dia:   {mean:6,    std:1,    min:1,   max:20,       label:"Estudios realizados/equipo/día",          unit:"u",   lever:true },
    nuc_capacidad_hora: {mean:1.5,  std:0,    min:0.5, max:4,        label:"Capacidad teórica (estudios/hr)",         unit:"u",   lever:false},
    nuc_horas_prog:     {mean:10,   std:0,    min:4,   max:16,       label:"Horas programadas/día",                   unit:"h",   lever:false},
    nuc_dias_mes:       {mean:22,   std:1,    min:18,  max:26,       label:"Días operativos/mes",                     unit:"d",   lever:false},
    nuc_disponibilidad: {mean:82,   std:5,    min:50,  max:99,       label:"OEE — Disponibilidad (%)",                unit:"%",   lever:true },
    nuc_ticket_prom:    {mean:950,  std:120,  min:300, max:3000,     label:"Ticket promedio ($)",                     unit:"$",   lever:false},
    nuc_margen_bruto:   {mean:50,   std:6,    min:25,  max:72,       label:"Margen bruto (%)",                        unit:"%",   lever:true },
    nuc_estudios_rep:   {mean:1,    std:0.5,  min:0,   max:5,        label:"OEE — Calidad inversa: estudios rep. (%)",unit:"%",   lever:true },
    nuc_entrega_hrs:    {mean:6,    std:2,    min:1,   max:48,       label:"Tiempo entrega resultados (hrs)",         unit:"h",   lever:true },
    nuc_mant_pct_valor: {mean:12,   std:1,    min:3,   max:20,       label:"Mantenimiento anual (% valor equipo)",    unit:"%",   lever:false},
    nuc_valor_equipo:   {mean:1500000,std:0,  min:300000,max:6000000,label:"Valor promedio por equipo ($)",           unit:"$",   lever:false},
  }},
  { id:"lab", label:"Laboratorio", icon:"🧪", params:{
    lab_analizadores:   {mean:3,    std:0,    min:1,   max:20,       label:"Analizadores activos",                    unit:"u",   lever:false},
    lab_ordenes_dia:    {mean:350,  std:40,   min:80,  max:1200,     label:"Órdenes procesadas/día (real)",           unit:"u",   lever:true },
    lab_cap_hora:       {mean:60,   std:0,    min:10,  max:400,      label:"Capacidad teórica (muestras/hr/analizador)",unit:"u",  lever:false},
    lab_horas_prog:     {mean:16,   std:0,    min:8,   max:24,       label:"Horas programadas/día",                   unit:"h",   lever:false},
    lab_dias_mes:       {mean:28,   std:1,    min:25,  max:31,       label:"Días operativos/mes",                     unit:"d",   lever:false},
    lab_disponibilidad: {mean:90,   std:3,    min:50,  max:99,       label:"OEE — Disponibilidad analizador (%)",     unit:"%",   lever:true },
    lab_ticket_prom:    {mean:95,   std:15,   min:30,  max:300,      label:"Ticket promedio orden ($)",               unit:"$",   lever:false},
    lab_margen_bruto:   {mean:50,   std:5,    min:25,  max:70,       label:"Margen bruto (%)",                        unit:"%",   lever:true },
    lab_tiempo_result:  {mean:4,    std:1,    min:0.5, max:24,       label:"Tiempo resultado crítico (hrs)",          unit:"h",   lever:true },
    lab_muestras_rec:   {mean:5,    std:1.5,  min:0,   max:20,       label:"OEE — Calidad inversa: muestras rec. (%)",unit:"%",   lever:true },
    lab_mant_pct_valor: {mean:8,    std:1,    min:2,   max:15,       label:"Mantenimiento anual (% valor analizador)", unit:"%",  lever:false},
    lab_valor_equipo:   {mean:120000,std:0,   min:20000,max:1000000, label:"Valor promedio por analizador ($)",        unit:"$",  lever:false},
  }},
  { id:"hosp", label:"Hospitalización", icon:"🛏️", params:{
    hosp_camas:         {mean:80,   std:0,    min:10,  max:500,      label:"Camas disponibles",                       unit:"u",   lever:false},
    hosp_ocupacion:     {mean:72,   std:7,    min:30,  max:95,       label:"Tasa ocupación bruta (%)",                unit:"%",   lever:true },
    hosp_estancia_dias: {mean:3.8,  std:0.5,  min:1,   max:15,       label:"Estancia promedio (días)",                unit:"d",   lever:true },
    hosp_descarga_hrs:  {mean:6,    std:2,    min:0.5, max:24,       label:"Tiempo orden alta → salida física (hrs)", unit:"h",   lever:true },
    hosp_tarifa_dia:    {mean:850,  std:80,   min:200, max:3000,     label:"Tarifa/día-cama ($)",                     unit:"$",   lever:false},
    hosp_margen_bruto:  {mean:48,   std:5,    min:20,  max:70,       label:"Margen bruto (%)",                        unit:"%",   lever:true },
    hosp_readmision_30: {mean:9,    std:2,    min:0,   max:25,       label:"Tasa readmisión 30 días (%)",             unit:"%",   lever:true },
    hosp_altas_fds:     {mean:20,   std:5,    min:0,   max:50,       label:"% altas en fin de semana",                unit:"%",   lever:true },
  }},
  { id:"cx", label:"Consulta Externa", icon:"👨‍⚕️", params:{
    cx_consultorios:    {mean:20,   std:0,    min:2,   max:100,      label:"Consultorios activos",                    unit:"u",   lever:false},
    cx_consultas_dia:   {mean:8,    std:1,    min:3,   max:20,       label:"Consultas/consultorio/día",               unit:"u",   lever:true },
    cx_dias_mes:        {mean:24,   std:1,    min:18,  max:26,       label:"Días/mes",                                unit:"d",   lever:false},
    cx_ticket_prom:     {mean:85,   std:12,   min:30,  max:250,      label:"Ticket consulta ($)",                     unit:"$",   lever:false},
    cx_margen_bruto:    {mean:55,   std:5,    min:30,  max:75,       label:"Margen bruto (%)",                        unit:"%",   lever:true },
    cx_no_show:         {mean:12,   std:3,    min:0,   max:35,       label:"Tasa no-show (%)",                        unit:"%",   lever:true },
    cx_espera_sala:     {mean:22,   std:8,    min:0,   max:90,       label:"Tiempo espera en sala (min)",             unit:"min", lever:true },
    cx_derivacion_hosp: {mean:8,    std:2,    min:0,   max:30,       label:"Tasa derivación a hosp/QX (%)",           unit:"%",   lever:true },
  }},
  { id:"seg", label:"Cobros & Seguros", icon:"💳", params:{
    // ── Mix seguro por BU ──────────────────────────────────────────
    seg_mix_qx:         {mean:82,   std:5,    min:0,   max:100,      label:"🔬 Quirófanos — % con seguro",            unit:"%",   lever:true },
    seg_mix_em:         {mean:58,   std:5,    min:0,   max:100,      label:"🚑 Emergencias — % con seguro",           unit:"%",   lever:false},
    seg_mix_rx:         {mean:55,   std:5,    min:0,   max:100,      label:"📡 RX/Eco — % con seguro",                unit:"%",   lever:false},
    seg_mix_ct:         {mean:75,   std:5,    min:0,   max:100,      label:"🔵 TAC — % con seguro",                   unit:"%",   lever:false},
    seg_mix_mri:        {mean:80,   std:5,    min:0,   max:100,      label:"🟣 RMN — % con seguro",                   unit:"%",   lever:false},
    seg_mix_nuc:        {mean:70,   std:5,    min:0,   max:100,      label:"☢️ Nuclear/Mamo — % con seguro",          unit:"%",   lever:false},
    seg_mix_lab:        {mean:55,   std:5,    min:0,   max:100,      label:"🧪 Laboratorio — % con seguro",           unit:"%",   lever:false},
    seg_mix_hosp:       {mean:85,   std:5,    min:0,   max:100,      label:"🛏️ Hospitalización — % con seguro",       unit:"%",   lever:true },
    seg_mix_cx:         {mean:40,   std:5,    min:0,   max:100,      label:"👨‍⚕️ Consulta Externa — % con seguro",     unit:"%",   lever:false},
    // ── Parámetros de cobro (aplican a toda cartera de seguros) ───
    seg_rechazo_1ra:    {mean:18,   std:4,    min:0,   max:50,       label:"Rechazo en primera presentación (%)",     unit:"%",   lever:true },
    seg_recuperacion:   {mean:72,   std:8,    min:30,  max:95,       label:"Tasa recuperación tras apelar (%)",       unit:"%",   lever:true },
    seg_incobrable:     {mean:5,    std:1.5,  min:0,   max:20,       label:"Cuentas incobrables (%)",                 unit:"%",   lever:true },
    seg_dso:            {mean:52,   std:10,   min:15,  max:180,      label:"DSO — días promedio de cobro",            unit:"d",   lever:true },
    seg_sin_respaldo:   {mean:8,    std:2,    min:0,   max:25,       label:"Facturas sin respaldo documental (%)",    unit:"%",   lever:true },
  }},
  { id:"fin", label:"Financiero / EVA", icon:"📊", params:{
    gastos_admin_mes:   {mean:280000,std:20000,min:50000,max:2000000,label:"Gastos administrativos/mes ($)",          unit:"$",   lever:true },
    gastos_personal_mes:{mean:420000,std:30000,min:100000,max:5000000,label:"Gastos personal/mes ($)",               unit:"$",   lever:true },
    gastos_financieros: {mean:45000, std:5000, min:0,    max:500000, label:"Gastos financieros/mes ($)",             unit:"$",   lever:false},
    depreciacion_mes:   {mean:85000, std:5000, min:10000,max:800000, label:"Depreciación/mes ($)",                   unit:"$",   lever:false},
    capital_invertido:  {mean:12000000,std:0,  min:500000,max:200000000,label:"Capital invertido ($)",               unit:"$",   lever:false},
    wacc:               {mean:12,   std:0,    min:6,   max:20,       label:"WACC (%)",                               unit:"%",   lever:false},
    // ── Costos de calidad (% del ticket aplicado como costo extra) ─
    costo_complic_pct:  {mean:40,   std:0,    min:0,   max:150,      label:"🔬 QX: costo complicación (% del ticket)",unit:"%",   lever:true },
    costo_reconsulta_pct:{mean:30,  std:0,    min:0,   max:100,      label:"🚑 EM: costo re-consulta (% del ticket)", unit:"%",   lever:true },
    costo_muestra_pct:  {mean:50,   std:0,    min:0,   max:100,      label:"🧪 LAB: costo muestra rechazada (% tick)",unit:"%",   lever:true },
    costo_readm_pct:    {mean:40,   std:0,    min:0,   max:150,      label:"🛏️ HOSP: costo readmisión (% tarifa/día)",unit:"%",   lever:true },
    costo_img_rep_pct:  {mean:100,  std:0,    min:0,   max:150,      label:"🩻 IMG: costo estudio repetido (% CMV)",  unit:"%",   lever:true },
  }}
];

function buildDefaultParams() {
  const all = {};
  PARAM_GROUPS.forEach(g => Object.entries(g.params).forEach(([k,v]) => { all[k] = {...v}; }));
  return all;
}

// ─── Responsive hook ─────────────────────────────────────────────
function useWindowSize() {
  const [w, setW] = useState(typeof window !== "undefined" ? window.innerWidth : 1024);
  useEffect(() => {
    const handler = () => setW(window.innerWidth);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  return w;
}

// ─── CORE SIMULATION ─────────────────────────────────────────────
function runOneIteration(p) {
  // ── Costos de calidad configurables ──
  const costo_complic  = SP(p,"costo_complic_pct")   / 100;
  const costo_recons   = SP(p,"costo_reconsulta_pct") / 100;
  const costo_muestra  = SP(p,"costo_muestra_pct")    / 100;
  const costo_readm    = SP(p,"costo_readm_pct")      / 100;
  const costo_img_rep  = SP(p,"costo_img_rep_pct")    / 100;

  // ── Mix seguro por BU (individual) ──
  const seg_mix_qx   = SP(p,"seg_mix_qx")   / 100;
  const seg_mix_em   = SP(p,"seg_mix_em")   / 100;
  // seg_mix per imaging modality read inside calcImg calls above
  const seg_mix_lab  = SP(p,"seg_mix_lab")  / 100;
  const seg_mix_hosp = SP(p,"seg_mix_hosp") / 100;
  const seg_mix_cx   = SP(p,"seg_mix_cx")   / 100;

  // ── Factor de cobro (único, aplica a toda cartera de seguros) ──
  const seg_rechazo  = SP(p,"seg_rechazo_1ra")  / 100;
  const seg_recup    = SP(p,"seg_recuperacion") / 100;
  const seg_incobr   = SP(p,"seg_incobrable")   / 100;
  const seg_sin      = SP(p,"seg_sin_respaldo") / 100;
  const factor_cobro = clamp(1 - seg_rechazo*(1-seg_recup) - seg_incobr - seg_sin*0.7, 0.3, 1);

  // Helper: ajusta ingreso de una BU según su mix de seguros
  // ing_neto = ing × (pct_particular + pct_seguro × factor_cobro)
  const ajustar = (ing, mix_seg) => ing * ((1 - mix_seg) + mix_seg * factor_cobro);

  // ── QUIRÓFANOS ──
  const qx_salas          = SP(p,"qx_salas");
  const qx_horas          = SP(p,"qx_horas_dia") * 60;
  const qx_util           = SP(p,"qx_utilizacion") / 100;
  const qx_dur            = SP(p,"qx_duracion_caso");
  const qx_rot            = SP(p,"qx_rotacion_min");
  const qx_dias           = SP(p,"qx_dias_mes");
  const qx_cancel         = SP(p,"qx_cancelaciones") / 100;
  const qx_complic        = SP(p,"qx_complicaciones") / 100;
  const qx_ticket         = SP(p,"qx_ticket_prom");
  const qx_margen         = SP(p,"qx_margen_bruto") / 100;
  const qx_casos_sala_dia = (qx_horas * qx_util) / Math.max(qx_dur + qx_rot, 1);
  const qx_casos_mes      = qx_salas * qx_casos_sala_dia * qx_dias * (1 - qx_cancel);
  const qx_ingreso_bruto  = qx_casos_mes * qx_ticket;
  const qx_ingreso        = ajustar(qx_ingreso_bruto, seg_mix_qx);
  // MB: ingreso neto × margen − costo extra por complicaciones (sobre ingreso BRUTO × margen)
  const qx_mb             = qx_ingreso * qx_margen - qx_casos_mes * qx_complic * qx_ticket * costo_complic;

  // ── EMERGENCIAS ──
  const em_llegadas   = SP(p,"em_atenciones_dia");
  const em_espera     = SP(p,"em_triage_espera");
  const em_umbral     = SP(p,"em_umbral_abandono");
  const em_dias       = SP(p,"em_dias_mes");
  const em_ticket     = SP(p,"em_ticket_prom");
  const em_margen     = SP(p,"em_margen_bruto") / 100;
  const em_reconsulta = SP(p,"em_reconsulta_72h") / 100;
  const em_abandono   = clamp((em_espera - em_umbral) / Math.max(em_umbral,1) * 0.4, 0, 0.5);
  const em_atend_mes  = em_llegadas * em_dias * (1 - em_abandono);
  const em_ingreso_bruto = em_atend_mes * em_ticket;
  const em_ingreso    = ajustar(em_ingreso_bruto, seg_mix_em);
  const em_mb         = em_ingreso * em_margen - em_atend_mes * em_reconsulta * em_ticket * costo_recons;

  // ── IMÁGENES — 4 sub-unidades ──
  const seg_mix_rx  = SP(p,"seg_mix_rx")  / 100;
  const seg_mix_ct  = SP(p,"seg_mix_ct")  / 100;
  const seg_mix_mri = SP(p,"seg_mix_mri") / 100;
  const seg_mix_nuc = SP(p,"seg_mix_nuc") / 100;

  // ── OEE helper for imaging modalities ──────────────────────────
  // OEE = Disponibilidad × Rendimiento × Calidad
  //   Disponibilidad = % uptime (param)
  //   Rendimiento    = estudios_reales / (cap_hora × horas_prog × disp)
  //   Calidad        = 1 − tasa_repetición
  // Capacidad instalada = cap_hora × horas_prog × dias × disp  (max con equipos buenos)
  // Demanda actual      = estudios_dia × dias  (lo que realmente entra)
  // Headroom            = capacidad − demanda  (estudios que caben sin nuevo equipo)

  const calcImg = (equip, estud_dia, cap_hora, horas_prog, dias, disp_pct, ticket, margen,
                   rep_pct, seg_mix, mant_pct, valor_equip) => {
    const disp          = disp_pct / 100;
    const calidad       = 1 - rep_pct / 100;
    // Capacidad instalada por equipo por día (horas útiles × throughput teórico)
    const cap_dia_equip = cap_hora * horas_prog * disp;          // estudios posibles/equipo/día
    const cap_total_mes = equip * cap_dia_equip * dias;          // capacidad instalada/mes
    const demanda_mes   = equip * estud_dia * dias;              // demanda real/mes
    // Rendimiento = realizado / posible
    const rendimiento   = cap_dia_equip > 0 ? clamp(estud_dia / cap_dia_equip, 0, 1) : 0;
    const oee           = disp * rendimiento * calidad;          // OEE consolidado
    const headroom_mes  = Math.max(0, cap_total_mes - demanda_mes); // estudios adicionales posibles
    const headroom_pct  = cap_total_mes > 0 ? headroom_mes / cap_total_mes : 0;
    // Ingresos
    const est_mes       = demanda_mes * calidad;                 // estudios válidos facturables
    const ing_bruto     = est_mes * ticket;
    const ing_neto      = ajustar(ing_bruto, seg_mix);
    // Costos: calidad (repeticiones) + mantenimiento mensual
    const costo_rep     = demanda_mes * (rep_pct/100) * ticket * (1 - margen) * costo_img_rep;
    const costo_mant    = equip * valor_equip * (mant_pct/100) / 12;  // mensualizado
    const mb            = ing_neto * margen - costo_rep - costo_mant;
    return { est_mes, ing_bruto, ing_neto, mb, oee, disp, rendimiento, calidad,
             cap_total_mes, demanda_mes, headroom_mes, headroom_pct, costo_mant };
  };

  const rx  = calcImg(
    SP(p,"rx_equipos"),  SP(p,"rx_estudios_dia"),  SP(p,"rx_capacidad_hora"), SP(p,"rx_horas_prog"),
    SP(p,"rx_dias_mes"), SP(p,"rx_disponibilidad"), SP(p,"rx_ticket_prom"),   SP(p,"rx_margen_bruto")/100,
    SP(p,"rx_estudios_rep"), seg_mix_rx, SP(p,"rx_mant_pct_valor"), SP(p,"rx_valor_equipo"));
  const ct  = calcImg(
    SP(p,"ct_equipos"),  SP(p,"ct_estudios_dia"),  SP(p,"ct_capacidad_hora"), SP(p,"ct_horas_prog"),
    SP(p,"ct_dias_mes"), SP(p,"ct_disponibilidad"), SP(p,"ct_ticket_prom"),   SP(p,"ct_margen_bruto")/100,
    SP(p,"ct_estudios_rep"), seg_mix_ct, SP(p,"ct_mant_pct_valor"), SP(p,"ct_valor_equipo"));
  const mri = calcImg(
    SP(p,"mri_equipos"), SP(p,"mri_estudios_dia"), SP(p,"mri_capacidad_hora"), SP(p,"mri_horas_prog"),
    SP(p,"mri_dias_mes"),SP(p,"mri_disponibilidad"),SP(p,"mri_ticket_prom"),  SP(p,"mri_margen_bruto")/100,
    SP(p,"mri_estudios_rep"), seg_mix_mri, SP(p,"mri_mant_pct_valor"), SP(p,"mri_valor_equipo"));
  const nuc = calcImg(
    SP(p,"nuc_equipos"), SP(p,"nuc_estudios_dia"), SP(p,"nuc_capacidad_hora"), SP(p,"nuc_horas_prog"),
    SP(p,"nuc_dias_mes"),SP(p,"nuc_disponibilidad"),SP(p,"nuc_ticket_prom"),  SP(p,"nuc_margen_bruto")/100,
    SP(p,"nuc_estudios_rep"), seg_mix_nuc, SP(p,"nuc_mant_pct_valor"), SP(p,"nuc_valor_equipo"));

  // Consolidated imaging
  const img_est_mes       = rx.est_mes + ct.est_mes + mri.est_mes + nuc.est_mes;
  const img_ingreso_bruto = rx.ing_bruto + ct.ing_bruto + mri.ing_bruto + nuc.ing_bruto;
  const img_ingreso       = rx.ing_neto  + ct.ing_neto  + mri.ing_neto  + nuc.ing_neto;
  const img_mb            = rx.mb + ct.mb + mri.mb + nuc.mb;

  // ── LABORATORIO — OEE ──────────────────────────────────────────
  const lab_analizadores = SP(p,"lab_analizadores");
  const lab_ord_dia   = SP(p,"lab_ordenes_dia");
  const lab_cap_hora  = SP(p,"lab_cap_hora");
  const lab_horas_prog= SP(p,"lab_horas_prog");
  const lab_dias      = SP(p,"lab_dias_mes");
  const lab_disp      = SP(p,"lab_disponibilidad") / 100;
  const lab_ticket    = SP(p,"lab_ticket_prom");
  const lab_margen    = SP(p,"lab_margen_bruto") / 100;
  const lab_rep       = SP(p,"lab_muestras_rec") / 100;
  const lab_mant_pct  = SP(p,"lab_mant_pct_valor") / 100;
  const lab_val_equip = SP(p,"lab_valor_equipo");

  // OEE components
  const lab_cap_dia        = lab_analizadores * lab_cap_hora * lab_horas_prog * lab_disp;
  const lab_cap_mes        = lab_cap_dia * lab_dias;                         // capacidad instalada/mes
  const lab_demanda_mes    = lab_ord_dia * lab_dias;                         // demanda real
  const lab_rendimiento    = lab_cap_dia > 0 ? clamp(lab_ord_dia / lab_cap_dia, 0, 1) : 0;
  const lab_calidad        = 1 - lab_rep;
  const lab_oee            = lab_disp * lab_rendimiento * lab_calidad;
  const lab_headroom_mes   = Math.max(0, lab_cap_mes - lab_demanda_mes);
  const lab_headroom_pct   = lab_cap_mes > 0 ? lab_headroom_mes / lab_cap_mes : 0;

  const lab_ord_mes        = lab_demanda_mes * lab_calidad;                  // órdenes válidas
  const lab_ingreso_bruto  = lab_ord_mes * lab_ticket;
  const lab_ingreso        = ajustar(lab_ingreso_bruto, seg_mix_lab);
  const lab_costo_mant     = lab_analizadores * lab_val_equip * lab_mant_pct / 12;
  const lab_mb             = lab_ingreso * lab_margen
                             - lab_demanda_mes * lab_rep * lab_ticket * costo_muestra
                             - lab_costo_mant;

  // ── HOSPITALIZACIÓN ──
  const hosp_camas    = SP(p,"hosp_camas");
  const hosp_ocup     = SP(p,"hosp_ocupacion") / 100;
  const hosp_est      = SP(p,"hosp_estancia_dias");
  const hosp_desc     = SP(p,"hosp_descarga_hrs");
  const hosp_tarifa   = SP(p,"hosp_tarifa_dia");
  const hosp_margen   = SP(p,"hosp_margen_bruto") / 100;
  const hosp_readm    = SP(p,"hosp_readmision_30") / 100;
  const hosp_pct_bloq = clamp(hosp_desc / Math.max(hosp_est * 24, 1), 0, 0.4);
  const hosp_ocup_ef  = hosp_ocup * (1 - hosp_pct_bloq);
  const hosp_dias_mes = hosp_camas * hosp_ocup_ef * 30;
  const hosp_ingreso_bruto = hosp_dias_mes * hosp_tarifa;
  const hosp_ingreso  = ajustar(hosp_ingreso_bruto, seg_mix_hosp);
  const hosp_mb       = hosp_ingreso * hosp_margen - hosp_dias_mes * hosp_readm * hosp_tarifa * costo_readm;

  // ── CONSULTA EXTERNA ──
  const cx_consul     = SP(p,"cx_consultorios");
  const cx_cons_d     = SP(p,"cx_consultas_dia");
  const cx_dias       = SP(p,"cx_dias_mes");
  const cx_ticket     = SP(p,"cx_ticket_prom");
  const cx_margen     = SP(p,"cx_margen_bruto") / 100;
  const cx_noshow     = SP(p,"cx_no_show") / 100;
  const cx_espera     = SP(p,"cx_espera_sala");
  const cx_ns_ef      = clamp(cx_noshow + Math.max(0, cx_espera - 30) * 0.005, 0, 0.6);
  const cx_cons_mes   = cx_consul * cx_cons_d * cx_dias * (1 - cx_ns_ef);
  const cx_ingreso_bruto = cx_cons_mes * cx_ticket;
  const cx_ingreso    = ajustar(cx_ingreso_bruto, seg_mix_cx);
  const cx_mb         = cx_ingreso * cx_margen;

  // ── CONSOLIDADO ──
  // Ingresos brutos (antes de ajuste seguros) y netos (después) por separado
  const ing_bruto  = qx_ingreso_bruto + em_ingreso_bruto + img_ingreso_bruto +
                     lab_ingreso_bruto + hosp_ingreso_bruto + cx_ingreso_bruto;
  // Per-modality ingreso for P&L display (already in return below)
  const ing_total  = qx_ingreso + em_ingreso + img_ingreso + lab_ingreso + hosp_ingreso + cx_ingreso;
  const mb_total   = qx_mb + em_mb + img_mb + lab_mb + hosp_mb + cx_mb;

  // ── P&L ──
  const g_admin    = SP(p,"gastos_admin_mes");
  const g_pers     = SP(p,"gastos_personal_mes");
  const g_fin      = SP(p,"gastos_financieros");
  const dep        = SP(p,"depreciacion_mes");
  const ebitda     = mb_total - g_admin - g_pers;
  const ebit       = ebitda - dep;
  const uai        = ebit - g_fin;
  const utilidad_neta = uai - (uai > 0 ? uai * IR_RATE : 0);

  // ── EVA ──
  const cap        = p["capital_invertido"].mean;
  const wacc       = SP(p,"wacc") / 100;
  const nopat      = ebit > 0 ? ebit*(1-IR_RATE) : ebit;
  const cargo_cap  = cap * wacc / 12;
  const eva        = nopat - cargo_cap;

  return {
    ingreso_total: ing_total, ingreso_bruto: ing_bruto, margen_bruto: mb_total,
    ebitda, ebit, uai, utilidad_neta, eva, nopat, cargo_capital: cargo_cap,
    qx_ingreso: qx_ingreso_bruto, em_ingreso: em_ingreso_bruto,
    img_ingreso: img_ingreso_bruto,
    rx_ingreso: rx.ing_bruto,   ct_ingreso: ct.ing_bruto,   mri_ingreso: mri.ing_bruto,   nuc_ingreso: nuc.ing_bruto,
    rx_est_mes: rx.est_mes,     ct_est_mes: ct.est_mes,     mri_est_mes: mri.est_mes,     nuc_est_mes: nuc.est_mes,
    // OEE imaging
    rx_oee: rx.oee,   rx_disp: rx.disp,   rx_rend: rx.rendimiento,   rx_cal: rx.calidad,
    rx_cap: rx.cap_total_mes,   rx_dem: rx.demanda_mes,   rx_head: rx.headroom_mes,   rx_head_pct: rx.headroom_pct,
    ct_oee: ct.oee,   ct_disp: ct.disp,   ct_rend: ct.rendimiento,   ct_cal: ct.calidad,
    ct_cap: ct.cap_total_mes,   ct_dem: ct.demanda_mes,   ct_head: ct.headroom_mes,   ct_head_pct: ct.headroom_pct,
    mri_oee:mri.oee,  mri_disp:mri.disp,  mri_rend:mri.rendimiento,  mri_cal:mri.calidad,
    mri_cap:mri.cap_total_mes,  mri_dem:mri.demanda_mes,  mri_head:mri.headroom_mes,  mri_head_pct:mri.headroom_pct,
    nuc_oee:nuc.oee,  nuc_disp:nuc.disp,  nuc_rend:nuc.rendimiento,  nuc_cal:nuc.calidad,
    nuc_cap:nuc.cap_total_mes,  nuc_dem:nuc.demanda_mes,  nuc_head:nuc.headroom_mes,  nuc_head_pct:nuc.headroom_pct,
    // OEE lab
    lab_oee: lab_oee, lab_disp: lab_disp, lab_rend: lab_rendimiento, lab_cal: lab_calidad,
    lab_cap: lab_cap_mes, lab_dem: lab_demanda_mes, lab_head: lab_headroom_mes, lab_head_pct: lab_headroom_pct,
    lab_ingreso: lab_ingreso_bruto,
    hosp_ingreso: hosp_ingreso_bruto, cx_ingreso: cx_ingreso_bruto,
    qx_mb, em_mb, img_mb, lab_mb, hosp_mb, cx_mb,
    qx_casos_mes, qx_casos_sala_dia, em_atend_mes,
    em_walkaway_mes: em_llegadas*em_dias*em_abandono,
    img_estudios_mes: img_est_mes, lab_ordenes_mes: lab_ord_mes, lab_demanda_mes: lab_demanda_mes,
    hosp_dias_pte_mes: hosp_dias_mes,
    hosp_camas_bloq: hosp_camas*hosp_ocup*hosp_pct_bloq,
    hosp_ingreso_perdido: hosp_camas*hosp_ocup*hosp_pct_bloq*30*hosp_tarifa,
    hosp_pct_bloq, cx_consultas_mes: cx_cons_mes, factor_cobro_seg: factor_cobro,
  };
}

function computeStats(results) {
  const keys = Object.keys(results[0]);
  const out = {};
  keys.forEach(k => {
    const sorted = results.map(r => r[k]).sort((a,b)=>a-b);
    const n = sorted.length;
    out[k] = {
      p10: sorted[Math.floor(n*0.10)],
      p50: sorted[Math.floor(n*0.50)],
      p90: sorted[Math.floor(n*0.90)],
      mean: sorted.reduce((s,v)=>s+v,0)/n,
    };
  });
  return out;
}

function simulateSync(params, N=2000) {
  const results = [];
  for (let i=0; i<N; i++) results.push(runOneIteration(params));
  return { stats: computeStats(results), raw: results };
}

// ─── TORNADO ─────────────────────────────────────────────────────
function tornado(baseParams, N=400) {
  const levers = [];
  // Include group label so "Margen bruto (%)" shows as "Quirófanos · Margen bruto (%)"
  PARAM_GROUPS.forEach(g => Object.entries(g.params).forEach(([k,v]) => {
    if(v.lever) levers.push([k, v, g.label, g.icon]);
  }));
  return levers.map(([key, v, groupLabel, groupIcon]) => {
    const d = baseParams[key];
    const delta = Math.max(d.mean*0.10, 0.5);
    const pUp = {...baseParams, [key]:{...d, mean:clamp(d.mean+delta,d.min,d.max), std:0}};
    const pDn = {...baseParams, [key]:{...d, mean:clamp(d.mean-delta,d.min,d.max), std:0}};
    const evUp = simulateSync(pUp,N).stats.eva.mean;
    const evDn = simulateSync(pDn,N).stats.eva.mean;
    // Qualified label: "🔬 Quirófanos · Margen bruto (%)"
    const fullLabel = `${groupIcon} ${groupLabel} · ${v.label}`;
    return { key, label: fullLabel, impact: evUp-evDn, upEVA:evUp, dnEVA:evDn };
  }).sort((a,b)=>Math.abs(b.impact)-Math.abs(a.impact)).slice(0,12);
}

// ─── GOAL-SEEK MULTI-OBJETIVO ─────────────────────────────────────
// "Waste" KPIs: lower = better (reducing them improves EVA/EBITDA/UN)
// "Good"  KPIs: higher = better
function isWasteKPI(k) {
  // Returns true when LOWER value = better outcome (waste, cost, delay, failure rate)
  return k.includes("cancelac")    || k.includes("complic")      || k.includes("rechazo") ||
         k.includes("no_show")     || k.includes("reconsulta")   || k.includes("muestras_rep") ||
         k.includes("muestras_rec")|| k.includes("incobr")       || k.includes("sin_resp") ||
         k.includes("descarga")    || k.includes("espera")       || k.includes("readmision") ||
         k.includes("rotacion_min")|| k.includes("gastos")       ||
         k.includes("costo_complic") || k.includes("costo_recons") ||
         k.includes("costo_muestra") || k.includes("costo_readm")  || k.includes("costo_img") ||
         k.includes("estudios_rep");  // all modality repetition rates
}

function goalSeekMulti(baseParams, targets, N=400, maxIter=20) {
  const levers = [];
  PARAM_GROUPS.forEach(g => Object.entries(g.params).forEach(([k,v]) => { if(v.lever) levers.push(k); }));

  // ── Theoretical maximum: every lever at its optimal value ──
  const bestParams = {...baseParams};
  levers.forEach(k => {
    const d = baseParams[k];
    bestParams[k] = {...d, mean: isWasteKPI(k) ? d.min : d.max, std:0};
  });
  const maxSim = simulateSync(bestParams, N);

  // ── Feasibility check ──
  const feasibility = {};
  if (targets.eva      !== undefined) feasibility.eva      = targets.eva      <= maxSim.stats.eva.mean;
  if (targets.ebitda   !== undefined) feasibility.ebitda   = targets.ebitda   <= maxSim.stats.ebitda.mean;
  if (targets.utilidad !== undefined) feasibility.utilidad = targets.utilidad <= maxSim.stats.utilidad_neta.mean;
  const allFeasible = Object.values(feasibility).every(Boolean);

  // ── Iterative convergence ──
  // Move all levers proportionally toward their optimal values.
  // Stop when target is met (gap ≤ 0) or all levers exhausted.
  // Never backtrack: once we reach or exceed the target, lock the result.
  let p = {...baseParams};
  for (let iter = 0; iter < maxIter; iter++) {
    const sim = simulateSync(p, N);

    // Compute aggregate normalized gap (positive = still below target)
    let totalGap = 0, count = 0;
    if (targets.eva      !== undefined) { totalGap += (targets.eva - sim.stats.eva.mean)                / Math.max(Math.abs(targets.eva), 1);      count++; }
    if (targets.ebitda   !== undefined) { totalGap += (targets.ebitda - sim.stats.ebitda.mean)          / Math.max(Math.abs(targets.ebitda), 1);   count++; }
    if (targets.utilidad !== undefined) { totalGap += (targets.utilidad - sim.stats.utilidad_neta.mean) / Math.max(Math.abs(targets.utilidad), 1); count++; }
    const normGap = count > 0 ? totalGap / count : 0;

    // Stop: converged (close enough) or already above target (do NOT backtrack)
    if (normGap <= 0.01) break;

    // Step size: larger when far, smaller when close
    const stepFraction = clamp(normGap * 0.5, 0.03, 0.20);

    levers.forEach(k => {
      const d = p[k];
      // Best = optimal direction for this lever
      const best = isWasteKPI(k) ? d.min : d.max;
      const newMean = d.mean + (best - d.mean) * stepFraction;
      p = {...p, [k]: {...d, mean: clamp(newMean, d.min, d.max)}};
    });
  }

  const finalSim = simulateSync(p, N);
  return { adjustedParams: p, finalStats: finalSim.stats, feasibility, maxStats: maxSim.stats, allFeasible };
}

// ─── UI Components ────────────────────────────────────────────────
function Slider({ param, pkey, value, onChange }) {
  const v   = value?.mean ?? param.mean;
  const std = value?.std  ?? param.std;
  const isLarge = param.max > 10000;
  const step = isLarge ? 1000 : param.max > 100 ? 1 : 0.5;
  return (
    <div style={{marginBottom:14}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:3}}>
        <span style={{fontSize:12,color:param.lever?PM_TEXT:PM_MUTED,fontFamily:"'IBM Plex Sans',sans-serif"}}>
          {param.lever?"⚡ ":""}{param.label}
        </span>
        <span style={{fontSize:13,fontWeight:700,color:PM_GREEN,fontFamily:"monospace",minWidth:80,textAlign:"right"}}>
          {param.unit==="$"?"$":""}{v.toLocaleString("en-US",{maximumFractionDigits:1})}{param.unit!=="$"?" "+param.unit:""}
        </span>
      </div>
      <input type="range" min={param.min} max={param.max} step={step} value={v}
        onChange={e=>onChange(pkey,"mean",+e.target.value)}
        style={{width:"100%",accentColor:param.lever?PM_GREEN:PM_MUTED,height:4}}/>
      <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:PM_MUTED}}>
        <span style={{fontFamily:"monospace"}}>{param.min}{param.unit!=="$"?param.unit:""}</span>
        <span>σ <input type="number" min={0} max={param.max*0.5} step={step/2} value={std}
          onChange={e=>onChange(pkey,"std",+e.target.value)}
          style={{width:58,marginLeft:3,border:"1px solid "+PM_BORDER,borderRadius:3,fontSize:10,padding:"1px 4px",fontFamily:"monospace"}}/></span>
        <span style={{fontFamily:"monospace"}}>{param.max}{param.unit!=="$"?param.unit:""}</span>
      </div>
    </div>
  );
}

function KpiCard({ label, p50, p10, p90, color, icon, sub }) {
  return (
    <div style={{background:PM_CARD,border:`1px solid ${PM_BORDER}`,borderRadius:10,padding:"14px 16px",borderTop:`3px solid ${color||PM_GREEN}`}}>
      <div style={{fontSize:10,color:PM_MUTED,textTransform:"uppercase",letterSpacing:1}}>{icon} {label}</div>
      <div style={{fontSize:22,fontWeight:800,color:p50>=0?(color||PM_GREEN):PM_RED,fontFamily:"monospace",margin:"5px 0 3px"}}>{fmtFull(p50)}</div>
      <div style={{fontSize:10,color:PM_MUTED}}>P10 {fmtFull(p10)} · P90 {fmtFull(p90)}</div>
      {sub && <div style={{fontSize:10,color:PM_ORANGE,marginTop:4}}>{sub}</div>}
    </div>
  );
}

function HistChart({ raw }) {
  const vals = raw.map(r=>r.eva).sort((a,b)=>a-b);
  const mn=vals[0], mx=vals[vals.length-1];
  const bins=32, bw=Math.max((mx-mn)/bins,1);
  const buckets=Array.from({length:bins},(_,i)=>({x:mn+i*bw,count:0}));
  vals.forEach(v=>{const i=clamp(Math.floor((v-mn)/bw),0,bins-1);buckets[i].count++;});
  const maxC=Math.max(...buckets.map(b=>b.count));
  const p10=vals[Math.floor(vals.length*0.1)];
  const p50=vals[Math.floor(vals.length*0.5)];
  const p90=vals[Math.floor(vals.length*0.9)];
  const W=480,H=150;
  const sx=v=>((v-mn)/Math.max(mx-mn,1))*(W-40)+20;
  const sy=c=>H-24-(c/maxC)*(H-34);
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`}>
      {buckets.map((b,i)=>{
        const inR=b.x>=p10&&b.x<=p90;
        return <rect key={i} x={sx(b.x)} y={sy(b.count)} width={Math.max(1,(W-40)/bins-1)} height={H-24-sy(b.count)} fill={inR?PM_GREEN:"#ccc"} rx={1} opacity={0.85}/>;
      })}
      {[[p10,"P10",PM_MUTED],[p50,"P50",PM_GOLD],[p90,"P90",PM_MUTED]].map(([v,lbl,col],i)=>(
        <g key={i}>
          <line x1={sx(v)} y1={8} x2={sx(v)} y2={H-24} stroke={col} strokeWidth={i===1?2:1} strokeDasharray={i===1?"0":"4,3"}/>
          <text x={sx(v)} y={i===1?7:20} textAnchor="middle" fontSize={9} fill={col} fontFamily="monospace">{lbl}</text>
        </g>
      ))}
      {mn<0&&mx>0&&<line x1={sx(0)} y1={8} x2={sx(0)} y2={H-24} stroke={PM_RED} strokeWidth={1.5} strokeDasharray="2,2"/>}
      <text x={20} y={H-8} fontSize={9} fill={PM_MUTED} fontFamily="monospace">{fmtFull(mn)}</text>
      <text x={W-20} y={H-8} fontSize={9} fill={PM_MUTED} fontFamily="monospace" textAnchor="end">{fmtFull(mx)}</text>
    </svg>
  );
}

function TornadoChart({ items, isMobile }) {
  if (!items?.length) return null;
  const maxAbs=Math.max(...items.map(t=>Math.abs(t.impact)));
  const labelW = isMobile ? 160 : 300;
  return (
    <div>
      {/* Legend */}
      <div style={{display:"flex",gap:12,marginBottom:12,fontSize:11,color:PM_MUTED,flexWrap:"wrap"}}>
        <span><span style={{color:PM_GREEN,fontWeight:700}}>■</span> Aumentar para mejorar EVA</span>
        <span><span style={{color:PM_RED,fontWeight:700}}>■</span> Reducir para mejorar EVA</span>
      </div>
      {items.map((item,i)=>{
        const bw=Math.abs(item.impact)/maxAbs*44;
        const pos=item.impact>0;
        const goodDir = pos ? !item.waste : item.waste;
        const barColor = goodDir ? PM_GREEN : PM_RED;
        const actionLabel = pos ? (item.waste ? "⚠ subir" : "↑ subir") : (item.waste ? "↓ bajar" : "⚠ bajar");
        const actionColor = goodDir ? PM_GREEN : PM_RED;
        return (
          <div key={i} style={{marginBottom:isMobile?11:9}}>
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <span style={{fontSize:isMobile?10:11,color:PM_TEXT,width:labelW,flexShrink:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.label}</span>
              <span style={{fontSize:isMobile?9:10,color:actionColor,fontWeight:700,width:isMobile?44:52,flexShrink:0,textAlign:"right"}}>{actionLabel}</span>
              <span style={{fontSize:isMobile?10:11,fontFamily:"monospace",color:barColor,width:isMobile?68:80,textAlign:"right",flexShrink:0}}>
                {pos?"+":""}{fmtFull(item.impact)}
              </span>
            </div>
            <div style={{position:"relative",height:10,marginTop:3}}>
              <div style={{position:"absolute",top:0,height:10,borderRadius:3,left:pos?"50%":`${50-bw}%`,width:bw+"%",background:barColor,opacity:0.82}}/>
              <div style={{position:"absolute",top:0,left:"50%",width:1,height:10,background:PM_BORDER}}/>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────
export default function SimuladorHospital() {
  const [params, setParams]           = useState(buildDefaultParams);
  const [results, setResults]         = useState(null);
  const [running, setRunning]         = useState(false);
  const [runMsg, setRunMsg]           = useState("");
  const [activeTab, setActiveTab]     = useState("params");
  const [activeGroup, setActiveGroup] = useState("qx");
  const [tornadoData, setTornadoData] = useState(null);
  const [gsTargets, setGsTargets]     = useState({ eva:150000, ebitda:300000, utilidad:100000 });
  const [gsEnabled, setGsEnabled]     = useState({ eva:true, ebitda:false, utilidad:false });
  const [gsResult, setGsResult]       = useState(null);
  const [gsRunning, setGsRunning]     = useState(false);
  const paramsRef = useRef(params);

  const handleChange = useCallback((key, field, val) => {
    setParams(prev => {
      const next = {...prev, [key]:{...prev[key],[field]:val}};
      paramsRef.current = next;
      return next;
    });
  }, []);

  // Chunked simulation — yields control every 200 iterations so UI stays responsive
  const handleRun = useCallback(async () => {
    setRunning(true);
    setRunMsg("Inicializando…");
    await new Promise(r => setTimeout(r, 10));

    const N = 2000;
    const chunkSize = 200;
    const allResults = [];
    const p = paramsRef.current;

    for (let i = 0; i < N; i += chunkSize) {
      const end = Math.min(i + chunkSize, N);
      for (let j = i; j < end; j++) allResults.push(runOneIteration(p));
      const pctDone = Math.round((end / N) * 100);
      setRunMsg(`Simulando… ${pctDone}%`);
      await new Promise(r => setTimeout(r, 0)); // yield to browser
    }

    setResults({ stats: computeStats(allResults), raw: allResults });
    setRunning(false);
    setRunMsg("");
    setActiveTab("results");
    setTornadoData(null);
  }, []);

  const handleTornado = useCallback(async () => {
    setRunning(true);
    setRunMsg("Calculando sensibilidad\u2026");
    await new Promise(r => setTimeout(r, 10));
    const levers = [];
    PARAM_GROUPS.forEach(g => Object.entries(g.params).forEach(([k,v]) => {
      if(v.lever) levers.push([k, v, g.label, g.icon]);
    }));
    const items = [];
    for (let i = 0; i < levers.length; i++) {
      const [key, v, groupLabel, groupIcon] = levers[i];
      const d = paramsRef.current[key];
      const delta = Math.max(d.mean*0.10, 0.5);
      const pUp = {...paramsRef.current, [key]:{...d, mean:clamp(d.mean+delta,d.min,d.max), std:0}};
      const pDn = {...paramsRef.current, [key]:{...d, mean:clamp(d.mean-delta,d.min,d.max), std:0}};
      const evUp = simulateSync(pUp,300).stats.eva.mean;
      const evDn = simulateSync(pDn,300).stats.eva.mean;
      const fullLabel = groupIcon + " " + groupLabel + " \u00b7 " + v.label;
      items.push({ key, label: fullLabel, impact: evUp-evDn, upEVA:evUp, dnEVA:evDn, waste: isWasteKPI(key) });
      setRunMsg("Tornado " + (i+1) + "/" + levers.length + "\u2026");
      await new Promise(r => setTimeout(r, 0));
    }
    setTornadoData(items.sort((a,b)=>Math.abs(b.impact)-Math.abs(a.impact)).slice(0,12));
    setRunning(false);
    setRunMsg("");
    setActiveTab("tornado");
  }, []);

  const handleGoalSeek = useCallback(async () => {
    setGsRunning(true);
    setRunMsg("Calculando factibilidad y ajuste…");
    await new Promise(r => setTimeout(r, 10));
    const targets = {};
    if (gsEnabled.eva)      targets.eva      = gsTargets.eva;
    if (gsEnabled.ebitda)   targets.ebitda   = gsTargets.ebitda;
    if (gsEnabled.utilidad) targets.utilidad = gsTargets.utilidad;
    const res = goalSeekMulti(paramsRef.current, targets, 300, 20);
    setGsResult(res);
    setGsRunning(false);
    setRunMsg("");
    setActiveTab("goalseek");
  }, [gsTargets, gsEnabled]);

  const s = results?.stats;

  const w = useWindowSize();
  const isMobile  = w < 640;
  const isTablet  = w < 960;

  // ── Responsive helpers ──
  const col2 = isTablet ? "1fr" : "1fr 1fr";
  const px   = isMobile ? "12px" : "22px";
  const cardPad = isMobile ? "12px 12px" : "14px 18px";

  const buLabels = [
    {id:"qx",  icon:"🔬",label:"Quirófanos"},
    {id:"em",  icon:"🚑",label:"Emergencias"},
    {id:"rx",  icon:"📡",label:"RX / Ecografía"},
    {id:"ct",  icon:"🔵",label:"Tomografía (CT)"},
    {id:"mri", icon:"🟣",label:"Resonancia (MRI)"},
    {id:"nuc", icon:"☢️",label:"Nuclear / Mamografía"},
    {id:"lab", icon:"🧪",label:"Laboratorio"},
    {id:"hosp",icon:"🛏️",label:"Hospitalización"},
    {id:"cx",  icon:"👨‍⚕️",label:"Consulta Externa"},
  ];

  const plRows = s ? [
    {label:"Ingresos Facturados",         val:s.ingreso_bruto.p50,                              bold:false},
    {label:"  − Pérdidas Cobro/Seguros",  val:-(s.ingreso_bruto.p50-s.ingreso_total.p50),        bold:false, indent:true, color:PM_RED},
    {label:"Ingresos Netos",              val:s.ingreso_total.p50,                              bold:true,  border:true},
    {label:"Margen Bruto",                val:s.margen_bruto.p50,                               bold:true,  border:true, pct_of:s.ingreso_total.p50},
    {label:"  − Gastos Personal",         val:-params.gastos_personal_mes.mean,                  indent:true},
    {label:"  − Gastos Admin",            val:-params.gastos_admin_mes.mean,                     indent:true},
    {label:"EBITDA",                      val:s.ebitda.p50,                                     bold:true,  border:true, pct_of:s.ingreso_total.p50},
    {label:"  − Depreciación",            val:-params.depreciacion_mes.mean,                     indent:true},
    {label:"EBIT",                        val:s.ebit.p50,                                       bold:true,  border:true, pct_of:s.ingreso_total.p50},
    {label:"  − Gastos Financieros",      val:-params.gastos_financieros.mean,                   indent:true},
    {label:"UAI",                         val:s.uai.p50,                                        bold:false},
    {label:"  − Impuesto Renta (25%)",    val:s.uai.p50>0?-s.uai.p50*IR_RATE:0,                 indent:true},
    {label:"Utilidad Neta",               val:s.utilidad_neta.p50,                              bold:true,  border:true, pct_of:s.ingreso_total.p50},
    {label:"NOPAT",                       val:s.nopat.p50,                                      bold:false},
    {label:"  − Cargo Capital (WACC)",    val:-s.cargo_capital.p50,                              indent:true},
    {label:"EVA",                         val:s.eva.p50,                                        bold:true,  border:true, color:s.eva.p50>=0?PM_GREEN:PM_RED},
  ] : [];

  const tabs = ["params","results","oee","tornado","goalseek"];
  const tabLabels = {
    params:   isMobile ? "⚙️" : "Parámetros",
    results:  isMobile ? "📊" : "Resultados",
    oee:      isMobile ? "🔧" : "OEE / Capacidad",
    tornado:  isMobile ? "🌪" : "Tornado",
    goalseek: isMobile ? "🎯" : "Goal-Seek",
  };

  return (
    <div style={{fontFamily:"'IBM Plex Sans',sans-serif",background:PM_LIGHT,minHeight:"100vh",color:PM_TEXT}}>

      {/* ── HEADER ── */}
      <div style={{background:PM_DEEP,color:"#fff",padding:`12px ${px}`,display:"flex",alignItems:"center",justifyContent:"space-between",borderBottom:`3px solid ${PM_GOLD}`,flexWrap:"wrap",gap:8}}>
        <div style={{minWidth:0}}>
          {!isMobile && <div style={{fontSize:10,letterSpacing:3,textTransform:"uppercase",color:PM_GOLD,fontWeight:600}}>PROMUNDIAL CONSULTING GROUP</div>}
          <div style={{fontSize:isMobile?14:17,fontWeight:800,marginTop:2,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
            🏥 {isMobile ? "Simulador Hospital" : "Simulador Monte Carlo · Hospital / Clínica"}
            <span style={{fontSize:10,opacity:0.5,fontWeight:400}}> v4</span>
          </div>
          {!isMobile && <div style={{fontSize:11,color:"#9fb8a8",marginTop:1}}>8 módulos · Lógica causal throughput · N=2,000</div>}
        </div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center",flexShrink:0}}>
          {running && <span style={{fontSize:11,color:PM_GOLD,fontFamily:"monospace"}}>{runMsg}</span>}
          {results && !running && (
            <button onClick={handleTornado}
              style={{background:"transparent",color:PM_GOLD,border:`1.5px solid ${PM_GOLD}`,padding:isMobile?"7px 10px":"8px 14px",borderRadius:6,fontWeight:600,fontSize:isMobile?11:12,cursor:"pointer",whiteSpace:"nowrap"}}>
              🌪{!isMobile && " Tornado"}</button>
          )}
          <button onClick={handleRun} disabled={running}
            style={{background:running?"#555":PM_GOLD,color:"#fff",border:"none",padding:isMobile?"8px 14px":"9px 20px",borderRadius:6,fontWeight:700,fontSize:isMobile?12:13,cursor:running?"not-allowed":"pointer",whiteSpace:"nowrap"}}>
            {running ? (isMobile?"…":runMsg||"Simulando…") : (isMobile?"▶ Simular":"▶ Correr Simulación")}
          </button>
        </div>
      </div>

      {/* ── TABS ── */}
      <div style={{display:"flex",background:PM_CARD,borderBottom:`1px solid ${PM_BORDER}`,padding:`0 ${px}`,overflowX:"auto"}}>
        {tabs.map(t=>(
          <button key={t} onClick={()=>setActiveTab(t)}
            style={{padding:isMobile?"10px 14px":"11px 18px",border:"none",background:"transparent",cursor:"pointer",
              fontWeight:activeTab===t?700:400,fontSize:isMobile?16:13,whiteSpace:"nowrap",flexShrink:0,
              color:activeTab===t?PM_GREEN:PM_MUTED,
              borderBottom:activeTab===t?`2.5px solid ${PM_GREEN}`:"2.5px solid transparent"}}>
            {tabLabels[t]}</button>
        ))}
      </div>

      <div style={{padding:`16px ${px}`,maxWidth:1200,margin:"0 auto"}}>

        {/* ══ PARÁMETROS ══ */}
        {activeTab==="params" && (
          <div>
            {/* Mobile: horizontal scroll chip selector */}
            {isMobile ? (
              <div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:8,marginBottom:12}}>
                {PARAM_GROUPS.map(g=>(
                  <button key={g.id} onClick={()=>setActiveGroup(g.id)}
                    style={{flexShrink:0,padding:"7px 12px",borderRadius:20,border:"none",cursor:"pointer",
                      background:activeGroup===g.id?PM_GREEN:PM_CARD,
                      color:activeGroup===g.id?"#fff":PM_TEXT,
                      fontWeight:activeGroup===g.id?700:400,fontSize:12,
                      boxShadow:"0 1px 3px rgba(0,0,0,0.08)"}}>
                    {g.icon} {g.label}
                  </button>
                ))}
              </div>
            ) : (
              <div style={{display:"grid",gridTemplateColumns:"200px 1fr",gap:14,alignItems:"start"}}>
                <div>
                  <div style={{fontSize:10,color:PM_MUTED,textTransform:"uppercase",letterSpacing:1,marginBottom:8,fontWeight:600}}>Módulo</div>
                  {PARAM_GROUPS.map(g=>(
                    <button key={g.id} onClick={()=>setActiveGroup(g.id)}
                      style={{display:"block",width:"100%",textAlign:"left",padding:"8px 12px",marginBottom:4,borderRadius:7,border:"none",cursor:"pointer",
                        background:activeGroup===g.id?PM_GREEN:PM_CARD,color:activeGroup===g.id?"#fff":PM_TEXT,
                        fontWeight:activeGroup===g.id?700:400,fontSize:13}}>
                      {g.icon} {g.label}</button>
                  ))}
                  <div style={{marginTop:10,padding:"10px 12px",background:PM_CARD,borderRadius:8,border:`1px solid ${PM_BORDER}`}}>
                    <div style={{fontSize:10,color:PM_MUTED,marginBottom:6}}>⚡ = KPI palanca · IR: 25%</div>
                    <button onClick={()=>{
                      const z={};Object.entries(paramsRef.current).forEach(([k,v])=>{z[k]={...v,std:0};});
                      setParams(z);paramsRef.current=z;
                    }} style={{width:"100%",padding:"6px 0",background:PM_BORDER,border:"none",borderRadius:5,fontSize:11,cursor:"pointer",color:PM_MUTED}}>
                      σ = 0 (determinístico)</button>
                  </div>
                </div>
                <div style={{background:PM_CARD,borderRadius:10,border:`1px solid ${PM_BORDER}`,padding:"18px 20px"}}>
                  {PARAM_GROUPS.filter(g=>g.id===activeGroup).map(g=>(
                    <div key={g.id}>
                      <div style={{fontSize:15,fontWeight:700,color:PM_GREEN,marginBottom:16}}>{g.icon} {g.label}</div>
                      {Object.entries(g.params).map(([k,v])=>(
                        <Slider key={k} param={v} pkey={k} value={params[k]} onChange={handleChange}/>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══ RESULTADOS ══ */}
        {activeTab==="results" && s && (
          <div>
            {/* KPI cards */}
            <div style={{display:"grid",gridTemplateColumns:`repeat(auto-fit,minmax(${isMobile?"140px":"170px"},1fr))`,gap:10,marginBottom:16}}>
              <KpiCard label="Ingresos Netos" p50={s.ingreso_total.p50} p10={s.ingreso_total.p10} p90={s.ingreso_total.p90} color={PM_BLUE} icon="💰"/>
              <KpiCard label="Margen Bruto"   p50={s.margen_bruto.p50} p10={s.margen_bruto.p10} p90={s.margen_bruto.p90} color={PM_TEAL} icon="📐"
                sub={`${pct(s.margen_bruto.p50/s.ingreso_total.p50)} s/ingresos`}/>
              <KpiCard label="EBITDA"         p50={s.ebitda.p50} p10={s.ebitda.p10} p90={s.ebitda.p90} color={PM_GREEN} icon="📊"/>
              <KpiCard label="EBIT"           p50={s.ebit.p50}   p10={s.ebit.p10}   p90={s.ebit.p90}   color={PM_GREEN} icon="📈"/>
              <KpiCard label="Utilidad Neta"  p50={s.utilidad_neta.p50} p10={s.utilidad_neta.p10} p90={s.utilidad_neta.p90} color={PM_BLUE} icon="🏦"/>
              <KpiCard label="EVA"            p50={s.eva.p50} p10={s.eva.p10} p90={s.eva.p90} color={s.eva.p50>=0?PM_GREEN:PM_RED} icon="⭐"
                sub={`Prob EVA≥0: ${pct(results.raw.filter(r=>r.eva>=0).length/results.raw.length)}`}/>
            </div>

            {/* P&L + EVA chart */}
            <div style={{display:"grid",gridTemplateColumns:col2,gap:12,marginBottom:12}}>
              <div style={{background:PM_CARD,borderRadius:10,border:`1px solid ${PM_BORDER}`,padding:cardPad}}>
                <div style={{fontSize:13,fontWeight:700,color:PM_GREEN,marginBottom:10}}>📋 P&L Mensual (P50)</div>
                {plRows.map((row,i)=>(
                  <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"4px 0",
                    borderTop:row.border?`1px solid ${PM_BORDER}`:"none",
                    fontWeight:row.bold?700:400,fontSize:row.indent?10:11.5,
                    color:row.color||(row.indent?PM_MUTED:PM_TEXT)}}>
                    <span style={{flex:1,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",paddingRight:4}}>{row.label}</span>
                    <div style={{display:"flex",gap:6,flexShrink:0}}>
                      {row.pct_of!==undefined && !isMobile && <span style={{fontSize:9,color:PM_MUTED}}>{pct(row.val/row.pct_of)}</span>}
                      <span style={{fontFamily:"monospace",color:row.color||(row.val<0?PM_RED:"inherit"),fontSize:isMobile?10:11}}>{fmtFull(row.val)}</span>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{display:"flex",flexDirection:"column",gap:12}}>
                <div style={{background:PM_CARD,borderRadius:10,border:`1px solid ${PM_BORDER}`,padding:cardPad}}>
                  <div style={{fontSize:13,fontWeight:700,color:PM_GREEN,marginBottom:8}}>📉 Distribución EVA</div>
                  <HistChart raw={results.raw}/>
                </div>
                <div style={{background:PM_CARD,borderRadius:10,border:`1px solid ${PM_BORDER}`,padding:cardPad}}>
                  <div style={{fontSize:13,fontWeight:700,color:PM_ORANGE,marginBottom:8}}>⚠️ Alertas de Throughput</div>
                  {[
                    {label:"Walkaways EM/mes",           val:`${Math.round(s.em_walkaway_mes.p50).toLocaleString()} pac.`,        bad:s.em_walkaway_mes.p50>50},
                    {label:"Camas bloqueadas (descarga)", val:`${Math.round(s.hosp_camas_bloq.p50)} camas (${pct(s.hosp_pct_bloq.p50)})`,bad:s.hosp_pct_bloq.p50>0.05},
                    {label:"Ingreso perdido por bloqueo", val:fmtFull(s.hosp_ingreso_perdido.p50), bad:s.hosp_ingreso_perdido.p50>5000},
                    {label:"Factor cobro seguros",        val:pct(s.factor_cobro_seg.p50),          bad:s.factor_cobro_seg.p50<0.82},
                    {label:"Pérdida neta seguros/mes",    val:fmtFull(s.ingreso_bruto.p50-s.ingreso_total.p50), bad:true},
                  ].map((a,i)=>(
                    <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"5px 0",borderBottom:i<4?`1px solid ${PM_BORDER}`:"none",gap:8}}>
                      <span style={{fontSize:11,flex:1,minWidth:0}}>{a.label}</span>
                      <span style={{fontFamily:"monospace",fontWeight:700,color:a.bad?PM_RED:PM_GREEN,fontSize:11,flexShrink:0}}>{a.val}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Mix + KPIs operacionales */}
            <div style={{display:"grid",gridTemplateColumns:col2,gap:12}}>
              <div style={{background:PM_CARD,borderRadius:10,border:`1px solid ${PM_BORDER}`,padding:cardPad}}>
                <div style={{fontSize:13,fontWeight:700,color:PM_GREEN,marginBottom:10}}>🏥 Mix de Ingresos (P50)</div>
                {buLabels.map(bu=>{
                  const ing=s[bu.id+"_ingreso"]?.p50||0;
                  const fr=s.ingreso_bruto.p50>0?ing/s.ingreso_bruto.p50:0;
                  return (
                    <div key={bu.id} style={{marginBottom:8}}>
                      <div style={{display:"flex",justifyContent:"space-between",fontSize:11,gap:4}}>
                        <span style={{flex:1,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{bu.icon} {bu.label}</span>
                        <span style={{fontFamily:"monospace",flexShrink:0}}>{fmtFull(ing)} <span style={{color:PM_MUTED}}>({pct(fr)})</span></span>
                      </div>
                      <div style={{height:5,borderRadius:3,background:PM_BORDER,marginTop:3}}>
                        <div style={{height:5,borderRadius:3,background:PM_GREEN,width:pct(fr)}}/>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div style={{background:PM_CARD,borderRadius:10,border:`1px solid ${PM_BORDER}`,padding:cardPad}}>
                <div style={{fontSize:13,fontWeight:700,color:PM_GREEN,marginBottom:10}}>⚙️ KPIs Operacionales (P50)</div>
                {[
                  {label:"Casos QX/mes",       val:Math.round(s.qx_casos_mes.p50).toLocaleString(),      u:"cirugías",icon:"🔬"},
                  {label:"Casos/sala/día",      val:s.qx_casos_sala_dia.p50.toFixed(1),                  u:"casos",   icon:"🔬"},
                  {label:"Atenciones EM/mes",   val:Math.round(s.em_atend_mes.p50).toLocaleString(),      u:"pac.",    icon:"🚑"},
                  {label:"RX/Eco estudios/mes", val:Math.round(s.rx_est_mes?.p50||0).toLocaleString(),      u:"estudios",icon:"📡"},
                  {label:"CT estudios/mes",     val:Math.round(s.ct_est_mes?.p50||0).toLocaleString(),      u:"estudios",icon:"🔵"},
                  {label:"MRI estudios/mes",    val:Math.round(s.mri_est_mes?.p50||0).toLocaleString(),     u:"estudios",icon:"🟣"},
                  {label:"Nuclear/Mamo/mes",    val:Math.round(s.nuc_est_mes?.p50||0).toLocaleString(),     u:"estudios",icon:"☢️"},
                  {label:"Órdenes Lab./mes",    val:Math.round(s.lab_ordenes_mes.p50).toLocaleString(),   u:"órdenes", icon:"🧪"},
                  {label:"Días-cama fact.",     val:Math.round(s.hosp_dias_pte_mes.p50).toLocaleString(), u:"días",    icon:"🛏️"},
                  {label:"Consultas Ext./mes",  val:Math.round(s.cx_consultas_mes.p50).toLocaleString(),  u:"consult.",icon:"👨‍⚕️"},
                ].map((k,i)=>(
                  <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"5px 0",borderBottom:i<6?`1px solid ${PM_BORDER}`:"none",gap:4}}>
                    <span style={{fontSize:11,flex:1,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{k.icon} {k.label}</span>
                    <span style={{fontFamily:"monospace",fontWeight:700,fontSize:11,flexShrink:0}}>{k.val} <span style={{color:PM_MUTED,fontWeight:400}}>{k.u}</span></span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab==="results" && !s && (
          <div style={{textAlign:"center",padding:isMobile?40:60,color:PM_MUTED}}>
            <div style={{fontSize:42,marginBottom:12}}>🏥</div>
            <div style={{fontSize:16,fontWeight:600,marginBottom:8}}>Configura los parámetros y corre la simulación</div>
            <div style={{fontSize:12}}>Ajusta los KPIs en Parámetros y presiona ▶</div>
          </div>
        )}

        {/* ══ OEE / CAPACIDAD ══ */}
        {activeTab==="oee" && (
          <div>
            {!s ? (
              <div style={{textAlign:"center",padding:50,color:PM_MUTED}}>
                <div style={{fontSize:36,marginBottom:12}}>🔧</div>
                <div style={{fontSize:15,fontWeight:600}}>Corre la simulación primero para ver el OEE</div>
              </div>
            ) : (
              <div>
                {/* Intro */}
                <div style={{background:PM_CARD,borderRadius:10,border:`1px solid ${PM_BORDER}`,padding:cardPad,marginBottom:14}}>
                  <div style={{fontSize:13,fontWeight:700,color:PM_GREEN,marginBottom:6}}>🔧 OEE — Overall Equipment Effectiveness</div>
                  <div style={{fontSize:11,color:PM_MUTED,lineHeight:1.6}}>
                    <strong>OEE = Disponibilidad × Rendimiento × Calidad</strong> &nbsp;·&nbsp;
                    Clase mundial: ≥85% &nbsp;·&nbsp; Típico LATAM hospitales: 45–65%<br/>
                    <strong>Headroom</strong> = estudios adicionales que caben en la capacidad instalada sin nueva inversión.
                  </div>
                </div>

                {/* OEE cards per modality */}
                {[
                  {id:"rx",  icon:"📡", label:"RX / Ecografía",       color:"#2B5580"},
                  {id:"ct",  icon:"🔵", label:"Tomografía (CT)",       color:"#1A6B5C"},
                  {id:"mri", icon:"🟣", label:"Resonancia (MRI)",      color:"#6B3A9E"},
                  {id:"nuc", icon:"☢️", label:"Nuclear / Mamografía",  color:"#8B4513"},
                ].map(mod => {
                  const oee   = s[mod.id+"_oee"]?.p50;
                  const disp  = s[mod.id+"_disp"]?.p50;
                  const rend  = s[mod.id+"_rend"]?.p50;
                  const cal   = s[mod.id+"_cal"]?.p50;
                  const cap   = s[mod.id+"_cap"]?.p50;
                  const dem   = s[mod.id+"_dem"]?.p50;
                  const head  = s[mod.id+"_head"]?.p50;
                  const headP = s[mod.id+"_head_pct"]?.p50;
                  if (oee === undefined) return null;
                  const oeeColor = oee >= 0.85 ? PM_GREEN : oee >= 0.65 ? PM_GOLD : PM_RED;
                  const oeeLabel = oee >= 0.85 ? "Clase Mundial" : oee >= 0.65 ? "Aceptable" : "Crítico";
                  return (
                    <div key={mod.id} style={{background:PM_CARD,borderRadius:10,border:`1px solid ${PM_BORDER}`,
                      borderLeft:`4px solid ${mod.color}`,padding:cardPad,marginBottom:12}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:8,marginBottom:12}}>
                        <div style={{fontSize:14,fontWeight:700,color:mod.color}}>{mod.icon} {mod.label}</div>
                        <div style={{display:"flex",alignItems:"center",gap:8}}>
                          <div style={{fontSize:24,fontWeight:900,color:oeeColor,fontFamily:"monospace"}}>{(oee*100).toFixed(1)}%</div>
                          <div style={{padding:"3px 8px",borderRadius:5,background:oeeColor,color:"#fff",fontSize:10,fontWeight:700}}>{oeeLabel}</div>
                        </div>
                      </div>

                      {/* OEE decomposition bar */}
                      <div style={{marginBottom:12}}>
                        <div style={{display:"flex",gap:2,height:18,borderRadius:4,overflow:"hidden",marginBottom:4}}>
                          <div style={{width:pct(disp),background:"#1A5C38",display:"flex",alignItems:"center",justifyContent:"center"}}>
                            {disp>0.1&&<span style={{fontSize:9,color:"#fff",fontWeight:700}}>{(disp*100).toFixed(0)}%</span>}
                          </div>
                          <div style={{width:pct(rend*(1-disp)),background:"#2B7A56",display:"flex",alignItems:"center",justifyContent:"center"}}>
                            {rend*(1-disp)>0.05&&<span style={{fontSize:9,color:"#fff",fontWeight:700}}>{(rend*100).toFixed(0)}%</span>}
                          </div>
                          <div style={{flex:1,background:"#e0e0e0"}}/>
                        </div>
                        <div style={{display:"flex",gap:12,fontSize:10,color:PM_MUTED,flexWrap:"wrap"}}>
                          <span>🟢 Disponibilidad: <b style={{color:disp>=0.90?PM_GREEN:PM_ORANGE}}>{(disp*100).toFixed(1)}%</b></span>
                          <span>🔵 Rendimiento: <b style={{color:rend>=0.80?PM_GREEN:PM_ORANGE}}>{(rend*100).toFixed(1)}%</b></span>
                          <span>⭐ Calidad: <b style={{color:cal>=0.97?PM_GREEN:PM_ORANGE}}>{(cal*100).toFixed(1)}%</b></span>
                        </div>
                      </div>

                      {/* Capacity vs Demand */}
                      <div style={{background:PM_LIGHT,borderRadius:7,padding:"10px 12px"}}>
                        <div style={{fontSize:11,fontWeight:700,color:PM_TEXT,marginBottom:8}}>📊 Capacidad Instalada vs Demanda (mensual)</div>
                        <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"1fr 1fr 1fr 1fr",gap:8,marginBottom:8}}>
                          {[
                            {label:"Capacidad instalada", val:Math.round(cap).toLocaleString(), unit:"est.", color:PM_BLUE},
                            {label:"Demanda actual",       val:Math.round(dem).toLocaleString(), unit:"est.", color:PM_TEXT},
                            {label:"Headroom disponible",  val:Math.round(head).toLocaleString(),unit:"est.", color:head>0?PM_GREEN:PM_RED},
                            {label:"% headroom",           val:(headP*100).toFixed(1)+"%",       unit:"",     color:headP>0.20?PM_GREEN:headP>0.05?PM_GOLD:PM_RED},
                          ].map((item,i)=>(
                            <div key={i} style={{textAlign:"center",padding:"6px 4px",background:PM_CARD,borderRadius:6,border:`1px solid ${PM_BORDER}`}}>
                              <div style={{fontSize:9,color:PM_MUTED,marginBottom:2}}>{item.label}</div>
                              <div style={{fontSize:isMobile?13:16,fontWeight:800,color:item.color,fontFamily:"monospace"}}>{item.val}</div>
                              {item.unit&&<div style={{fontSize:9,color:PM_MUTED}}>{item.unit}</div>}
                            </div>
                          ))}
                        </div>
                        {/* Capacity bar */}
                        <div style={{height:8,borderRadius:4,background:PM_BORDER,overflow:"hidden"}}>
                          <div style={{height:8,borderRadius:4,
                            background: headP>0.20?PM_GREEN:headP>0.05?PM_GOLD:PM_RED,
                            width:pct(Math.min(1, dem/Math.max(cap,1)))}}/>
                        </div>
                        <div style={{display:"flex",justifyContent:"space-between",fontSize:9,color:PM_MUTED,marginTop:2}}>
                          <span>Utilización: {(dem/Math.max(cap,1)*100).toFixed(1)}%</span>
                          <span>Capacidad total</span>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* LAB OEE */}
                {(() => {
                  const oee   = s.lab_oee?.p50;
                  const disp  = s.lab_disp?.p50;
                  const rend  = s.lab_rend?.p50;
                  const cal   = s.lab_cal?.p50;
                  const cap   = s.lab_cap?.p50;
                  const dem   = s.lab_dem?.p50;
                  const head  = s.lab_head?.p50;
                  const headP = s.lab_head_pct?.p50;
                  if (oee === undefined) return null;
                  const oeeColor = oee >= 0.85 ? PM_GREEN : oee >= 0.65 ? PM_GOLD : PM_RED;
                  const oeeLabel = oee >= 0.85 ? "Clase Mundial" : oee >= 0.65 ? "Aceptable" : "Crítico";
                  return (
                    <div style={{background:PM_CARD,borderRadius:10,border:`1px solid ${PM_BORDER}`,
                      borderLeft:`4px solid #7B4F00`,padding:cardPad}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:8,marginBottom:12}}>
                        <div style={{fontSize:14,fontWeight:700,color:"#7B4F00"}}>🧪 Laboratorio</div>
                        <div style={{display:"flex",alignItems:"center",gap:8}}>
                          <div style={{fontSize:24,fontWeight:900,color:oeeColor,fontFamily:"monospace"}}>{(oee*100).toFixed(1)}%</div>
                          <div style={{padding:"3px 8px",borderRadius:5,background:oeeColor,color:"#fff",fontSize:10,fontWeight:700}}>{oeeLabel}</div>
                        </div>
                      </div>
                      <div style={{display:"flex",gap:12,fontSize:11,color:PM_MUTED,marginBottom:12,flexWrap:"wrap"}}>
                        <span>🟢 Disponibilidad: <b style={{color:disp>=0.90?PM_GREEN:PM_ORANGE}}>{(disp*100).toFixed(1)}%</b></span>
                        <span>🔵 Rendimiento: <b style={{color:rend>=0.80?PM_GREEN:PM_ORANGE}}>{(rend*100).toFixed(1)}%</b></span>
                        <span>⭐ Calidad: <b style={{color:cal>=0.95?PM_GREEN:PM_ORANGE}}>{(cal*100).toFixed(1)}%</b></span>
                      </div>
                      <div style={{background:PM_LIGHT,borderRadius:7,padding:"10px 12px"}}>
                        <div style={{fontSize:11,fontWeight:700,color:PM_TEXT,marginBottom:8}}>📊 Capacidad Instalada vs Demanda (mensual)</div>
                        <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"1fr 1fr 1fr 1fr",gap:8,marginBottom:8}}>
                          {[
                            {label:"Capacidad instalada", val:Math.round(cap).toLocaleString(), unit:"muestras", color:PM_BLUE},
                            {label:"Demanda actual",       val:Math.round(dem).toLocaleString(), unit:"muestras", color:PM_TEXT},
                            {label:"Headroom disponible",  val:Math.round(head).toLocaleString(),unit:"muestras", color:head>0?PM_GREEN:PM_RED},
                            {label:"% headroom",           val:(headP*100).toFixed(1)+"%",       unit:"",         color:headP>0.20?PM_GREEN:headP>0.05?PM_GOLD:PM_RED},
                          ].map((item,i)=>(
                            <div key={i} style={{textAlign:"center",padding:"6px 4px",background:PM_CARD,borderRadius:6,border:`1px solid ${PM_BORDER}`}}>
                              <div style={{fontSize:9,color:PM_MUTED,marginBottom:2}}>{item.label}</div>
                              <div style={{fontSize:isMobile?13:16,fontWeight:800,color:item.color,fontFamily:"monospace"}}>{item.val}</div>
                              {item.unit&&<div style={{fontSize:9,color:PM_MUTED}}>{item.unit}</div>}
                            </div>
                          ))}
                        </div>
                        <div style={{height:8,borderRadius:4,background:PM_BORDER,overflow:"hidden"}}>
                          <div style={{height:8,borderRadius:4,
                            background:headP>0.20?PM_GREEN:headP>0.05?PM_GOLD:PM_RED,
                            width:pct(Math.min(1,dem/Math.max(cap,1)))}}/>
                        </div>
                        <div style={{display:"flex",justifyContent:"space-between",fontSize:9,color:PM_MUTED,marginTop:2}}>
                          <span>Utilización: {(dem/Math.max(cap,1)*100).toFixed(1)}%</span>
                          <span>Capacidad total</span>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        )}

        {/* ══ TORNADO ══ */}
        {activeTab==="tornado" && (
          <div style={{background:PM_CARD,borderRadius:10,border:`1px solid ${PM_BORDER}`,padding:isMobile?"14px":"20px"}}>
            <div style={{fontSize:15,fontWeight:700,color:PM_GREEN,marginBottom:4}}>🌪 Análisis de Sensibilidad — Tornado</div>
            <div style={{fontSize:12,color:PM_MUTED,marginBottom:16}}>Impacto en EVA mensual al mover cada KPI palanca ±10% · Top 12</div>
            {tornadoData
              ? <TornadoChart items={tornadoData} isMobile={isMobile}/>
              : <div style={{textAlign:"center",padding:40,color:PM_MUTED}}>Presiona "🌪 Tornado" para calcular.</div>}
          </div>
        )}

        {/* ══ GOAL-SEEK ══ */}
        {activeTab==="goalseek" && (
          <div style={{display:"grid",gridTemplateColumns:isTablet?"1fr":"340px 1fr",gap:14}}>
            {/* Inputs */}
            <div style={{background:PM_CARD,borderRadius:10,border:`1px solid ${PM_BORDER}`,padding:cardPad}}>
              <div style={{fontSize:15,fontWeight:700,color:PM_GREEN,marginBottom:4}}>🎯 Goal-Seek Inverso</div>
              <div style={{fontSize:12,color:PM_MUTED,marginBottom:14}}>Activa los objetivos que quieres alcanzar.</div>
              {[
                {key:"eva",      label:"Meta EVA mensual",          icon:"⭐"},
                {key:"ebitda",   label:"Meta EBITDA mensual",       icon:"📊"},
                {key:"utilidad", label:"Meta Utilidad Neta mensual",icon:"🏦"},
              ].map(obj=>(
                <div key={obj.key} style={{marginBottom:12,padding:"10px 12px",borderRadius:8,
                  border:`1.5px solid ${gsEnabled[obj.key]?PM_GREEN:PM_BORDER}`,
                  background:gsEnabled[obj.key]?"#f0f8f4":"#fafaf8"}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:gsEnabled[obj.key]?8:0}}>
                    <input type="checkbox" checked={gsEnabled[obj.key]}
                      onChange={e=>setGsEnabled(prev=>({...prev,[obj.key]:e.target.checked}))}
                      style={{width:16,height:16,accentColor:PM_GREEN}}/>
                    <span style={{fontSize:13,fontWeight:600,color:gsEnabled[obj.key]?PM_GREEN:PM_MUTED}}>{obj.icon} {obj.label}</span>
                  </div>
                  {gsEnabled[obj.key] && (
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      <span style={{fontSize:12,color:PM_MUTED}}>$</span>
                      <input type="number" value={gsTargets[obj.key]}
                        onChange={e=>setGsTargets(prev=>({...prev,[obj.key]:+e.target.value}))}
                        style={{flex:1,padding:"7px 10px",border:`1px solid ${PM_BORDER}`,borderRadius:6,fontSize:14,fontFamily:"monospace",minWidth:0}}/>
                    </div>
                  )}
                </div>
              ))}
              <button onClick={handleGoalSeek} disabled={gsRunning||!Object.values(gsEnabled).some(Boolean)}
                style={{width:"100%",background:PM_GREEN,color:"#fff",border:"none",padding:"11px 0",borderRadius:7,
                  fontWeight:700,fontSize:14,cursor:gsRunning?"not-allowed":"pointer",opacity:gsRunning?0.7:1,marginTop:4}}>
                {gsRunning?"Calculando…":"🎯 Calcular KPIs Óptimos"}
              </button>
            </div>

            {/* Results */}
            {gsResult ? (
              <div style={{display:"flex",flexDirection:"column",gap:12}}>
                {/* Feasibility */}
                <div style={{padding:cardPad,borderRadius:10,border:`2px solid ${gsResult.allFeasible?PM_GREEN:PM_RED}`,
                  background:gsResult.allFeasible?"#f0f8f4":"#fdf4f4"}}>
                  <div style={{fontSize:15,fontWeight:800,color:gsResult.allFeasible?PM_GREEN:PM_RED,marginBottom:8}}>
                    {gsResult.allFeasible ? "✅ Objetivos ALCANZABLES" : "⚠️ Uno o más objetivos NO son alcanzables"}
                  </div>
                  <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
                    {Object.entries(gsResult.feasibility).map(([k,ok])=>{
                      const labels={eva:"EVA",ebitda:"EBITDA",utilidad:"Utilidad Neta"};
                      const targets={eva:gsTargets.eva,ebitda:gsTargets.ebitda,utilidad:gsTargets.utilidad};
                      const maxVals={eva:gsResult.maxStats.eva.mean,ebitda:gsResult.maxStats.ebitda.mean,utilidad:gsResult.maxStats.utilidad_neta.mean};
                      return (
                        <div key={k} style={{padding:"8px 12px",borderRadius:7,background:ok?"#e0f2e8":"#fde8e8",border:`1px solid ${ok?PM_GREEN:PM_RED}`,flex:1,minWidth:120}}>
                          <div style={{fontSize:12,fontWeight:700,color:ok?PM_GREEN:PM_RED}}>{ok?"✓":"✗"} {labels[k]}</div>
                          <div style={{fontSize:10,color:PM_MUTED,marginTop:2}}>Meta: {fmtFull(targets[k])}</div>
                          <div style={{fontSize:10,color:ok?PM_GREEN:PM_RED}}>Máx: {fmtFull(maxVals[k])}</div>
                        </div>
                      );
                    })}
                  </div>
                  {!gsResult.allFeasible && (
                    <div style={{fontSize:11,color:PM_RED,marginTop:8}}>
                      💡 Los objetivos ✗ superan el máximo teórico. Revisa las metas o los parámetros estructurales.
                    </div>
                  )}
                </div>

                {/* Projection cards */}
                <div style={{background:PM_CARD,borderRadius:10,border:`1px solid ${PM_BORDER}`,padding:cardPad}}>
                  <div style={{fontSize:13,fontWeight:700,color:PM_GREEN,marginBottom:10}}>📊 Proyección con KPIs ajustados</div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
                    {[
                      {label:"EVA",          val:gsResult.finalStats.eva.mean,          meta:gsEnabled.eva?gsTargets.eva:null,        color:PM_GREEN},
                      {label:"EBITDA",       val:gsResult.finalStats.ebitda.mean,       meta:gsEnabled.ebitda?gsTargets.ebitda:null,  color:PM_TEAL},
                      {label:"Utilidad Neta",val:gsResult.finalStats.utilidad_neta.mean,meta:gsEnabled.utilidad?gsTargets.utilidad:null,color:PM_BLUE},
                    ].map((item,i)=>{
                      const gap = item.meta !== null ? item.val - item.meta : null;
                      return (
                        <div key={i} style={{padding:"10px 10px",borderRadius:8,border:`1px solid ${PM_BORDER}`,background:PM_LIGHT}}>
                          <div style={{fontSize:10,color:PM_MUTED}}>{item.label}</div>
                          <div style={{fontSize:isMobile?14:17,fontWeight:800,color:item.color,fontFamily:"monospace"}}>{fmtFull(Math.round(item.val))}</div>
                          {item.meta!==null && (
                            <div style={{fontSize:10,color:gap>=0?PM_GREEN:PM_RED,marginTop:2}}>
                              {gap>=0?"✓ +":`✗ ${fmtFull(Math.round(gap))}`} vs meta
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* KPI table */}
                <div style={{background:PM_CARD,borderRadius:10,border:`1px solid ${PM_BORDER}`,padding:cardPad}}>
                  <div style={{fontSize:13,fontWeight:700,color:PM_GREEN,marginBottom:6}}>📌 KPIs requeridos para alcanzar el objetivo</div>
                  <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 70px 70px 55px":"1fr 90px 90px 80px",gap:4,
                    padding:"4px 0 6px",borderBottom:`2px solid ${PM_BORDER}`,
                    fontSize:10,color:PM_MUTED,fontWeight:600,textTransform:"uppercase",letterSpacing:0.5}}>
                    <span>KPI</span>
                    <span style={{textAlign:"right"}}>Actual</span>
                    <span style={{textAlign:"right"}}>Requerido</span>
                    <span style={{textAlign:"right"}}>Cambio</span>
                  </div>
                  <div style={{overflowY:"auto",maxHeight:isMobile?300:400}}>
                    {PARAM_GROUPS.map(g=>{
                      const leverRows = Object.entries(g.params).filter(([,v])=>v.lever);
                      if(!leverRows.length) return null;
                      return (
                        <div key={g.id}>
                          <div style={{fontSize:11,fontWeight:700,color:PM_MUTED,padding:"7px 0 3px",borderBottom:`1px solid ${PM_BORDER}`}}>
                            {g.icon} {g.label}
                          </div>
                          {leverRows.map(([k,v])=>{
                            const cur=params[k].mean;
                            const sug=gsResult.adjustedParams[k].mean;
                            const diff=sug-cur;
                            const diffPct=((diff/Math.abs(cur||1))*100).toFixed(1);
                            const goodChange = isWasteKPI(k) ? diff <= 0 : diff >= 0;
                            const noChange = Math.abs(diffPct) < 0.5;
                            const fmt1 = n => n.toLocaleString("en-US",{maximumFractionDigits:1});
                            return (
                              <div key={k} style={{display:"grid",
                                gridTemplateColumns:isMobile?"1fr 70px 70px 55px":"1fr 90px 90px 80px",
                                gap:4,alignItems:"center",padding:"5px 0",borderBottom:`1px solid #f0ede8`,fontSize:isMobile?10:11}}>
                                <span style={{color:PM_TEXT,paddingLeft:6,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{v.label}</span>
                                <span style={{fontFamily:"monospace",color:PM_MUTED,textAlign:"right"}}>{fmt1(cur)}</span>
                                <span style={{fontFamily:"monospace",fontWeight:700,color:noChange?PM_MUTED:(goodChange?PM_GREEN:PM_RED),textAlign:"right"}}>{fmt1(sug)}</span>
                                <span style={{fontFamily:"monospace",fontWeight:700,color:noChange?PM_MUTED:(goodChange?PM_GREEN:PM_RED),textAlign:"right",fontSize:isMobile?9:10}}>
                                  {noChange ? "—" : (diff>0?"+":"")+diffPct+"%"}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <div style={{display:"flex",alignItems:"center",justifyContent:"center",background:PM_CARD,
                borderRadius:10,border:`1px solid ${PM_BORDER}`,minHeight:220}}>
                <div style={{textAlign:"center",color:PM_MUTED}}>
                  <div style={{fontSize:32,marginBottom:10}}>🎯</div>
                  <div style={{fontSize:13,fontWeight:600}}>Activa un objetivo y presiona calcular</div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{background:PM_DEEP,color:"#9fb8a8",fontSize:10,textAlign:"center",padding:"11px 0",
        marginTop:24,borderTop:`2px solid ${PM_GOLD}`}}>
        © {new Date().getFullYear()} Promundial Consulting Group · Simulador Monte Carlo Hospital v4 · www.promundial.com
      </div>
    </div>
  );
}


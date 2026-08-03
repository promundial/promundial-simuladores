import { useState, useCallback, useRef } from "react";

// ═══════════════════════════════════════════════════════════════════
// SIMULADOR MONTE CARLO — RENTA DE AUTOS  v1
// Modelo mixto: Renta Diaria (turismo/aeropuerto) + Corporativa
// Métricas: EVA · EBITDA · Utilidad Neta
// Promundial Consulting Group
// ═══════════════════════════════════════════════════════════════════

const C = {
  deep:   "#0F2A3F",
  navy:   "#1A4060",
  teal:   "#1A7A6D",
  gold:   "#C8922A",
  light:  "#F4F7F9",
  card:   "#FFFFFF",
  border: "#DDE4EA",
  text:   "#1E2A35",
  muted:  "#6B7A8A",
  red:    "#B03A3A",
  green:  "#1A6B3A",
  blue:   "#2B5C8E",
  orange: "#C86820",
};

// ─── Monte Carlo helpers ───────────────────────────────────────────
function randNorm(mean, std) {
  if (std <= 0) return mean;
  let u = 0, v = 0;
  while (!u) u = Math.random();
  while (!v) v = Math.random();
  return mean + std * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
function cl(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function S(p, k) { const d = p[k]; return cl(randNorm(d.mean, d.std), d.min, d.max); }
function pct(v, d=1) { return (v*100).toFixed(d) + "%"; }
function fmt$(n, d=0) {
  if (isNaN(n)) return "—";
  const s = n < 0 ? "−$" : "$";
  const a = Math.abs(n);
  if (a >= 1e6) return s + (a/1e6).toFixed(2) + "M";
  if (a >= 1e3) return s + (a/1e3).toFixed(1) + "K";
  return s + a.toFixed(d);
}
function percentile(arr, p) {
  const s = [...arr].sort((a,b)=>a-b);
  return s[Math.floor(p/100*(s.length-1))];
}
function stats(arr) {
  return { p10: percentile(arr,10), p50: percentile(arr,50), p90: percentile(arr,90) };
}

// ─── Parameter definitions ─────────────────────────────────────────
const PD = {
  // FLOTA
  flota_diaria:        {mean:80,  std:0,   min:1,    max:5000, label:"Flota renta diaria (unidades)",        unit:"u",  group:"flota", lever:true,  dir:1},
  flota_corp:          {mean:40,  std:0,   min:0,    max:5000, label:"Flota contratos corporativos",          unit:"u",  group:"flota", lever:true,  dir:1},
  valor_flota_diaria:  {mean:18000,std:0,  min:5000, max:200000,label:"Valor promedio auto flota diaria ($)", unit:"$",  group:"flota", lever:false},
  valor_flota_corp:    {mean:22000,std:0,  min:5000, max:200000,label:"Valor promedio auto flota corp ($)",   unit:"$",  group:"flota", lever:false},
  vida_util:           {mean:4,   std:0,   min:1,    max:10,   label:"Vida útil flota (años)",                unit:"yr", group:"flota", lever:false},
  valor_residual_pct:  {mean:35,  std:3,   min:5,    max:70,   label:"Valor residual al cierre (%)",          unit:"%",  group:"flota", lever:false},

  // OCUPACIÓN & TARIFA — DIARIA
  ocupacion_diaria:    {mean:72,  std:6,   min:20,   max:98,   label:"Ocupación flota diaria (%)",            unit:"%",  group:"diaria", lever:true,  dir:1},
  tarifa_diaria:       {mean:55,  std:8,   min:10,   max:500,  label:"Tarifa promedio renta diaria ($/día)",  unit:"$",  group:"diaria", lever:true,  dir:1},
  dias_promedio_renta: {mean:3.5, std:0.5, min:1,    max:30,   label:"Días promedio por contrato diario",     unit:"d",  group:"diaria", lever:false},
  descuento_diaria:    {mean:8,   std:2,   min:0,    max:30,   label:"Descuento promedio flota diaria (%)",   unit:"%",  group:"diaria", lever:true,  dir:-1},

  // OCUPACIÓN & TARIFA — CORPORATIVA
  ocupacion_corp:      {mean:88,  std:4,   min:50,   max:100,  label:"Ocupación flota corporativa (%)",       unit:"%",  group:"corp",   lever:true,  dir:1},
  tarifa_corp_mes:     {mean:900, std:100, min:200,  max:5000, label:"Tarifa mensual contrato corporativo ($)",unit:"$", group:"corp",   lever:true,  dir:1},
  plazo_contrato_corp: {mean:12,  std:2,   min:1,    max:60,   label:"Plazo promedio contrato corp (meses)",  unit:"m",  group:"corp",   lever:false},
  descuento_corp:      {mean:12,  std:3,   min:0,    max:35,   label:"Descuento flota corporativa (%)",       unit:"%",  group:"corp",   lever:true,  dir:-1},

  // COSTOS OPERATIVOS
  mant_diaria_mes:     {mean:180, std:30,  min:0,    max:2000, label:"Mantenimiento/auto diaria ($/mes)",     unit:"$",  group:"costos", lever:true,  dir:-1},
  mant_corp_mes:       {mean:150, std:25,  min:0,    max:2000, label:"Mantenimiento/auto corp ($/mes)",       unit:"$",  group:"costos", lever:true,  dir:-1},
  seguro_mes:          {mean:120, std:15,  min:30,   max:1000, label:"Seguro promedio/auto ($/mes)",          unit:"$",  group:"costos", lever:true,  dir:-1},
  lavado_limpieza:     {mean:25,  std:5,   min:0,    max:200,  label:"Lavado & limpieza/auto ($/mes)",        unit:"$",  group:"costos", lever:false},
  combustible_diaria:  {mean:40,  std:8,   min:0,    max:300,  label:"Combustible/auto diaria ($/mes)",       unit:"$",  group:"costos", lever:false},
  siniestros_pct:      {mean:3,   std:1,   min:0,    max:15,   label:"Siniestros (% ingresos diaria)",        unit:"%",  group:"costos", lever:true,  dir:-1},

  // PERSONAL
  agentes_diaria:      {mean:6,   std:0,   min:1,    max:200,  label:"Agentes renta diaria",                  unit:"u",  group:"rrhh",   lever:false},
  sueldo_agente:       {mean:900, std:100, min:300,  max:5000, label:"Sueldo agente ($/mes)",                 unit:"$",  group:"rrhh",   lever:false},
  ejecutivos_corp:     {mean:3,   std:0,   min:1,    max:50,   label:"Ejecutivos cuenta corporativa",         unit:"u",  group:"rrhh",   lever:false},
  sueldo_ejecutivo:    {mean:1800,std:200, min:500,  max:10000,label:"Sueldo ejecutivo cuenta ($/mes)",       unit:"$",  group:"rrhh",   lever:false},
  personal_ops:        {mean:8,   std:0,   min:1,    max:200,  label:"Personal operativo (mecánicos, logística)",unit:"u",group:"rrhh", lever:false},
  sueldo_ops:          {mean:700, std:80,  min:200,  max:5000, label:"Sueldo personal ops ($/mes)",           unit:"$",  group:"rrhh",   lever:false},
  admin_personal:      {mean:4,   std:0,   min:1,    max:100,  label:"Personal administrativo",               unit:"u",  group:"rrhh",   lever:false},
  sueldo_admin:        {mean:1200,std:150, min:300,  max:8000, label:"Sueldo admin ($/mes)",                  unit:"$",  group:"rrhh",   lever:false},

  // GASTOS FIJOS
  alquiler_oficinas:   {mean:4000,std:500, min:0,    max:50000,label:"Alquiler oficinas/sucursales ($/mes)",  unit:"$",  group:"gastos", lever:true,  dir:-1},
  alquiler_parqueo:    {mean:3000,std:400, min:0,    max:30000,label:"Alquiler parqueo flota ($/mes)",        unit:"$",  group:"gastos", lever:true,  dir:-1},
  sistemas_crm:        {mean:1500,std:200, min:0,    max:15000,label:"Sistemas CRM & GPS ($/mes)",            unit:"$",  group:"gastos", lever:false},
  marketing_mes:       {mean:5000,std:1000,min:0,    max:100000,label:"Marketing & publicidad ($/mes)",       unit:"$",  group:"gastos", lever:true,  dir:-1},
  servicios_basicos:   {mean:2000,std:300, min:0,    max:20000,label:"Servicios básicos ($/mes)",             unit:"$",  group:"gastos", lever:false},

  // FINANCIEROS
  ir:                  {mean:25,  std:0,   min:0,    max:40,   label:"Impuesto a la renta (%)",               unit:"%",  group:"fin",    lever:false},
  wacc:                {mean:12,  std:0,   min:5,    max:30,   label:"WACC (%)",                              unit:"%",  group:"fin",    lever:false},
  deuda_pct:           {mean:60,  std:0,   min:0,    max:100,  label:"Deuda sobre valor flota (%)",           unit:"%",  group:"fin",    lever:true,  dir:-1},
  tasa_deuda:          {mean:9,   std:1,   min:3,    max:20,   label:"Tasa de interés deuda (%)",             unit:"%",  group:"fin",    lever:true,  dir:-1},
};

// ─── Simulation engine ─────────────────────────────────────────────
function simOne(p) {
  const flota_d   = S(p,"flota_diaria");
  const flota_c   = S(p,"flota_corp");
  const val_d     = S(p,"valor_flota_diaria");
  const val_c     = S(p,"valor_flota_corp");
  const vida      = S(p,"vida_util");
  const resid     = S(p,"valor_residual_pct")/100;

  // ── Revenue diaria ──
  const ocup_d    = S(p,"ocupacion_diaria")/100;
  const tarifa_d  = S(p,"tarifa_diaria");
  const desc_d    = S(p,"descuento_diaria")/100;
  const dias_yr   = 365 * ocup_d;
  const rev_diaria = flota_d * dias_yr * tarifa_d * (1 - desc_d);

  // ── Revenue corporativa ──
  const ocup_c    = S(p,"ocupacion_corp")/100;
  const tarifa_c  = S(p,"tarifa_corp_mes");
  const desc_c    = S(p,"descuento_corp")/100;
  const rev_corp  = flota_c * 12 * tarifa_c * (1 - desc_c) * ocup_c;

  const rev_total = rev_diaria + rev_corp;

  // ── Depreciación ──
  const val_total_flota = flota_d * val_d + flota_c * val_c;
  const dep_anual = val_total_flota * (1 - resid) / vida;

  // ── Costos operativos ──
  const mant_d    = flota_d * S(p,"mant_diaria_mes") * 12;
  const mant_c    = flota_c * S(p,"mant_corp_mes") * 12;
  const seguro    = (flota_d + flota_c) * S(p,"seguro_mes") * 12;
  const lavado    = (flota_d + flota_c) * S(p,"lavado_limpieza") * 12;
  const combust   = flota_d * S(p,"combustible_diaria") * 12;
  const siniestro = rev_diaria * S(p,"siniestros_pct")/100;
  const costo_flota = mant_d + mant_c + seguro + lavado + combust + siniestro;

  // ── Personal ──
  const cost_agentes  = S(p,"agentes_diaria") * S(p,"sueldo_agente") * 12;
  const cost_ejec     = S(p,"ejecutivos_corp") * S(p,"sueldo_ejecutivo") * 12;
  const cost_ops      = S(p,"personal_ops") * S(p,"sueldo_ops") * 12;
  const cost_admin    = S(p,"admin_personal") * S(p,"sueldo_admin") * 12;
  const costo_personal = cost_agentes + cost_ejec + cost_ops + cost_admin;

  // ── Gastos fijos ──
  const gf_alq_of  = S(p,"alquiler_oficinas") * 12;
  const gf_alq_pk  = S(p,"alquiler_parqueo") * 12;
  const gf_sistemas= S(p,"sistemas_crm") * 12;
  const gf_mktg    = S(p,"marketing_mes") * 12;
  const gf_serv    = S(p,"servicios_basicos") * 12;
  const gastos_fijos = gf_alq_of + gf_alq_pk + gf_sistemas + gf_mktg + gf_serv;

  // ── P&L ──
  const costo_total_sin_dep = costo_flota + costo_personal + gastos_fijos;
  const ebitda = rev_total - costo_total_sin_dep;
  const ebit   = ebitda - dep_anual;

  // Intereses
  const deuda = val_total_flota * S(p,"deuda_pct")/100;
  const intereses = deuda * S(p,"tasa_deuda")/100;

  const uai  = ebit - intereses;
  const ir   = S(p,"ir")/100;
  const impuesto = Math.max(0, uai * ir);
  const util_neta = uai - impuesto;

  // ── WACC & EVA ──
  const wacc = S(p,"wacc")/100;
  const capital_invertido = val_total_flota; // activo principal
  const nopat = ebit * (1 - ir);
  const cargo_capital = capital_invertido * wacc;
  const eva = nopat - cargo_capital;

  // ── Ratios ──
  const margen_ebitda = rev_total > 0 ? ebitda / rev_total : 0;
  const margen_neto   = rev_total > 0 ? util_neta / rev_total : 0;
  const rev_por_auto  = rev_total / (flota_d + flota_c);
  const roic = capital_invertido > 0 ? nopat / capital_invertido : 0;

  return {
    rev_total, rev_diaria, rev_corp,
    ebitda, ebit, util_neta, eva,
    dep_anual, intereses, impuesto,
    costo_flota, costo_personal, gastos_fijos,
    margen_ebitda, margen_neto,
    val_total_flota, deuda, capital_invertido,
    rev_por_auto, roic, nopat,
    flota_total: flota_d + flota_c,
    ocup_d, ocup_c,
  };
}

function runSim(params, N=3000) {
  const keys = ["rev_total","rev_diaria","rev_corp","ebitda","ebit","util_neta","eva",
    "dep_anual","intereses","impuesto","costo_flota","costo_personal","gastos_fijos",
    "margen_ebitda","margen_neto","val_total_flota","deuda","rev_por_auto","roic","nopat","ocup_d","ocup_c"];
  const buckets = {};
  keys.forEach(k => buckets[k] = []);
  for (let i=0; i<N; i++) {
    const r = simOne(params);
    keys.forEach(k => buckets[k].push(r[k]));
  }
  const out = {};
  keys.forEach(k => out[k] = stats(buckets[k]));
  return out;
}

// ─── UI Components ─────────────────────────────────────────────────
const px = "20px";

function Slider({param, pkey, value, onChange}) {
  const v = value || param;
  const handleMean = e => onChange(pkey, {...v, mean: parseFloat(e.target.value)});
  const handleStd  = e => onChange(pkey, {...v, std:  parseFloat(e.target.value)});
  const range = v.max - v.min;
  const filled = ((v.mean - v.min) / range * 100).toFixed(1);

  return (
    <div style={{marginBottom:18}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:4}}>
        <span style={{fontSize:12,color: v.lever ? C.text : C.muted}}>
          {v.lever ? "⚡ " : ""}{v.label}
        </span>
        <span style={{fontSize:13,fontWeight:700,color:C.navy,fontFamily:"monospace",minWidth:72,textAlign:"right"}}>
          {v.unit==="$" ? "$" : ""}{v.mean.toLocaleString()}{v.unit!=="$" ? " "+v.unit : ""}
        </span>
      </div>
      <input type="range" min={v.min} max={v.max}
        step={v.max > 1000 ? 100 : v.max > 100 ? 10 : v.max > 10 ? 0.5 : 0.1}
        value={v.mean} onChange={handleMean}
        style={{width:"100%", accentColor: v.lever ? C.navy : C.muted, height:4}}
      />
      <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:C.muted,marginTop:2}}>
        <span>{v.min}{v.unit==="$"?"":" "+v.unit}</span>
        <span style={{color:C.muted,fontSize:10}}>σ: <input type="number" value={v.std} min={0} max={v.max/2}
          onChange={handleStd}
          style={{width:44,border:"none",borderBottom:`1px solid ${C.border}`,background:"transparent",fontSize:10,color:C.muted,textAlign:"center"}}
        /></span>
        <span>{v.max}{v.unit==="$"?"":" "+v.unit}</span>
      </div>
    </div>
  );
}

function KpiCard({label, val, p10, p90, color, sub, icon}) {
  const positive = val >= 0;
  return (
    <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"14px 16px",borderTop:`3px solid ${color||C.navy}`}}>
      <div style={{fontSize:10,color:C.muted,textTransform:"uppercase",letterSpacing:1}}>{icon} {label}</div>
      <div style={{fontSize:20,fontWeight:800,color:positive?(color||C.navy):C.red,fontFamily:"monospace",margin:"5px 0 3px"}}>{val}</div>
      <div style={{fontSize:10,color:C.muted}}>P10 {p10} · P90 {p90}</div>
      {sub && <div style={{fontSize:10,color:C.orange,marginTop:4}}>{sub}</div>}
    </div>
  );
}

const GROUPS = [
  {id:"flota",  label:"Flota",        icon:"🚗"},
  {id:"diaria", label:"Renta Diaria", icon:"📅"},
  {id:"corp",   label:"Corporativa",  icon:"🏢"},
  {id:"costos", label:"Costos Op.",   icon:"🔧"},
  {id:"rrhh",   label:"Personal",     icon:"👥"},
  {id:"gastos", label:"Gastos Fijos", icon:"🏠"},
  {id:"fin",    label:"Financiero",   icon:"💰"},
];

const TABS = ["params","resultados","waterfall","tornado"];

export default function SimuladorRentaAutos() {
  const initParams = () => {
    const p = {};
    Object.entries(PD).forEach(([k,v]) => p[k] = {...v});
    return p;
  };
  const [params, setParams] = useState(initParams);
  const [activeGroup, setActiveGroup] = useState("flota");
  const [activeTab, setActiveTab] = useState("params");
  const [S_, setS_] = useState(null);
  const [running, setRunning] = useState(false);
  const [N, setN] = useState(3000);
  const paramsRef = useRef(params);

  const handleChange = useCallback((k, v) => {
    setParams(prev => { const n={...prev,[k]:v}; paramsRef.current=n; return n; });
  }, []);

  const handleRun = useCallback(() => {
    setRunning(true);
    setTimeout(() => {
      const result = runSim(paramsRef.current, N);
      setS_(result);
      setRunning(false);
      setActiveTab("resultados");
    }, 30);
  }, [N]);

  const isMobile = typeof window !== "undefined" && window.innerWidth < 700;

  const tabLabel = {params:"⚙️ Parámetros", resultados:"📊 Resultados", waterfall:"💧 Cascada P&L", tornado:"🌪️ Tornado"};

  return (
    <div style={{fontFamily:"'Segoe UI',system-ui,sans-serif",background:C.light,minHeight:"100vh",color:C.text}}>

      {/* ── HEADER ── */}
      <div style={{background:C.deep,color:"#fff",padding:`12px ${px}`,display:"flex",alignItems:"center",justifyContent:"space-between",borderBottom:`3px solid ${C.gold}`,flexWrap:"wrap",gap:8}}>
        <div>
          <div style={{fontSize:10,letterSpacing:3,textTransform:"uppercase",color:C.gold,fontWeight:600}}>PROMUNDIAL CONSULTING GROUP</div>
          <div style={{fontSize:18,fontWeight:800,letterSpacing:0.5}}>🚗 Simulador Monte Carlo · Renta de Autos</div>
          <div style={{fontSize:11,color:"#9ab8cc",marginTop:1}}>Modelo mixto: Renta Diaria + Corporativa · N={N.toLocaleString()} iter.</div>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
          <select value={N} onChange={e=>setN(+e.target.value)}
            style={{background:"#1a3a55",color:C.gold,border:`1px solid ${C.gold}55`,borderRadius:6,padding:"6px 10px",fontSize:12,cursor:"pointer"}}>
            {[1000,3000,5000,10000].map(n=><option key={n} value={n}>{n.toLocaleString()} iter.</option>)}
          </select>
          <button onClick={handleRun} disabled={running}
            style={{background:running?"#555":C.gold,color:"#fff",border:"none",padding:"9px 22px",borderRadius:6,fontWeight:700,fontSize:13,cursor:running?"not-allowed":"pointer"}}>
            {running ? "⏳ Simulando..." : "▶ Correr Simulación"}
          </button>
        </div>
      </div>

      {/* ── TABS ── */}
      <div style={{display:"flex",background:C.card,borderBottom:`1px solid ${C.border}`,padding:`0 ${px}`,overflowX:"auto"}}>
        {TABS.map(t=>(
          <button key={t} onClick={()=>setActiveTab(t)}
            style={{padding:"11px 18px",border:"none",background:"transparent",cursor:"pointer",fontSize:13,fontWeight:activeTab===t?700:400,
              color:activeTab===t?C.navy:C.muted,borderBottom:activeTab===t?`2px solid ${C.navy}`:"2px solid transparent",whiteSpace:"nowrap"}}>
            {tabLabel[t]}
          </button>
        ))}
      </div>

      <div style={{padding:`16px ${px}`,maxWidth:1200,margin:"0 auto"}}>

        {/* ══ PARÁMETROS ══ */}
        {activeTab==="params" && (
          <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"200px 1fr",gap:14,alignItems:"start"}}>
            <div>
              <div style={{fontSize:10,color:C.muted,textTransform:"uppercase",letterSpacing:1,marginBottom:8,fontWeight:600}}>Módulo</div>
              {GROUPS.map(g=>(
                <button key={g.id} onClick={()=>setActiveGroup(g.id)}
                  style={{display:"block",width:"100%",textAlign:"left",padding:"8px 12px",marginBottom:4,borderRadius:7,border:"none",cursor:"pointer",
                    background:activeGroup===g.id?C.navy:C.card,color:activeGroup===g.id?"#fff":C.text,
                    fontWeight:activeGroup===g.id?700:400,fontSize:13}}>
                  {g.icon} {g.label}
                </button>
              ))}
              <div style={{marginTop:10,padding:"10px 12px",background:C.card,borderRadius:8,border:`1px solid ${C.border}`}}>
                <div style={{fontSize:10,color:C.muted,marginBottom:6}}>⚡ = KPI palanca</div>
                <button onClick={()=>{
                  const z={};Object.entries(paramsRef.current).forEach(([k,v])=>{z[k]={...v,std:0};});
                  setParams(z);paramsRef.current=z;
                }} style={{width:"100%",padding:"6px 0",background:C.border,border:"none",borderRadius:5,fontSize:11,cursor:"pointer",color:C.muted}}>
                  σ = 0 (determinístico)
                </button>
              </div>
            </div>
            <div style={{background:C.card,borderRadius:10,border:`1px solid ${C.border}`,padding:"18px 20px"}}>
              {GROUPS.filter(g=>g.id===activeGroup).map(g=>(
                <div key={g.id}>
                  <div style={{fontSize:15,fontWeight:700,color:C.navy,marginBottom:16}}>{g.icon} {g.label}</div>
                  {Object.entries(PD).filter(([,v])=>v.group===g.id).map(([k,v])=>(
                    <Slider key={k} param={v} pkey={k} value={params[k]} onChange={handleChange}/>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ══ RESULTADOS ══ */}
        {activeTab==="resultados" && S_ && (
          <div>
            {/* Resumen flota */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:10,marginBottom:16}}>
              <KpiCard label="Revenue Total" icon="💰"
                val={fmt$(S_.rev_total.p50)} p10={fmt$(S_.rev_total.p10)} p90={fmt$(S_.rev_total.p90)} color={C.blue}/>
              <KpiCard label="EBITDA" icon="📈"
                val={fmt$(S_.ebitda.p50)} p10={fmt$(S_.ebitda.p10)} p90={fmt$(S_.ebitda.p90)} color={C.teal}
                sub={`Margen: ${pct(S_.margen_ebitda.p50)}`}/>
              <KpiCard label="Utilidad Neta" icon="🏆"
                val={fmt$(S_.util_neta.p50)} p10={fmt$(S_.util_neta.p10)} p90={fmt$(S_.util_neta.p90)}
                color={S_.util_neta.p50>=0?C.green:C.red}
                sub={`Margen neto: ${pct(S_.margen_neto.p50)}`}/>
              <KpiCard label="EVA" icon="⚡"
                val={fmt$(S_.eva.p50)} p10={fmt$(S_.eva.p10)} p90={fmt$(S_.eva.p90)}
                color={S_.eva.p50>=0?C.green:C.red}
                sub={S_.eva.p50>=0?"Valor creado ✓":"Valor destruido ✗"}/>
              <KpiCard label="Rev. Diaria" icon="📅"
                val={fmt$(S_.rev_diaria.p50)} p10={fmt$(S_.rev_diaria.p10)} p90={fmt$(S_.rev_diaria.p90)} color={C.navy}/>
              <KpiCard label="Rev. Corporativa" icon="🏢"
                val={fmt$(S_.rev_corp.p50)} p10={fmt$(S_.rev_corp.p10)} p90={fmt$(S_.rev_corp.p90)} color={C.blue}/>
              <KpiCard label="Rev./Auto/Año" icon="🚗"
                val={fmt$(S_.rev_por_auto.p50)} p10={fmt$(S_.rev_por_auto.p10)} p90={fmt$(S_.rev_por_auto.p90)} color={C.orange}/>
              <KpiCard label="ROIC" icon="📐"
                val={pct(S_.roic.p50)} p10={pct(S_.roic.p10)} p90={pct(S_.roic.p90)}
                color={S_.roic.p50 > params.wacc.mean/100 ? C.green : C.red}
                sub={`WACC: ${params.wacc.mean}%`}/>
            </div>

            {/* Desglose de costos */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",gap:14}}>
              <div style={{background:C.card,borderRadius:10,border:`1px solid ${C.border}`,padding:"18px 20px"}}>
                <div style={{fontSize:13,fontWeight:700,color:C.navy,marginBottom:14}}>📊 Estructura de Costos (P50 anual)</div>
                {[
                  ["Costos flota (mant+seguro+siniestros)", S_.costo_flota.p50, C.orange],
                  ["Personal", S_.costo_personal.p50, C.blue],
                  ["Gastos fijos", S_.gastos_fijos.p50, C.muted],
                  ["Depreciación", S_.dep_anual.p50, C.teal],
                  ["Intereses", S_.intereses.p50, C.red],
                  ["Impuestos", S_.impuesto.p50, "#7A5A2A"],
                ].map(([label, val, color])=>(
                  <div key={label} style={{marginBottom:10}}>
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:3}}>
                      <span style={{color:C.muted}}>{label}</span>
                      <span style={{fontFamily:"monospace",fontWeight:600,color}}>{fmt$(val)}</span>
                    </div>
                    <div style={{background:C.light,borderRadius:3,height:6,overflow:"hidden"}}>
                      <div style={{width:`${Math.min(100,(val/S_.rev_total.p50)*100)}%`,height:"100%",background:color,borderRadius:3}}/>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{background:C.card,borderRadius:10,border:`1px solid ${C.border}`,padding:"18px 20px"}}>
                <div style={{fontSize:13,fontWeight:700,color:C.navy,marginBottom:14}}>🚗 Indicadores de Flota</div>
                {[
                  ["Ocupación diaria (P50)", pct(S_.ocup_d.p50), pct(S_.ocup_d.p10), pct(S_.ocup_d.p90), C.blue],
                  ["Ocupación corporativa (P50)", pct(S_.ocup_c.p50), pct(S_.ocup_c.p10), pct(S_.ocup_c.p90), C.teal],
                  ["Valor flota total", fmt$(S_.val_total_flota.p50), "—","—", C.navy],
                  ["Deuda sobre flota", fmt$(S_.deuda.p50), "—","—", C.red],
                  ["NOPAT", fmt$(S_.nopat.p50), fmt$(S_.nopat.p10), fmt$(S_.nopat.p90), C.green],
                ].map(([label,v,lo,hi,color])=>(
                  <div key={label} style={{padding:"10px 0",borderBottom:`1px solid ${C.border}`}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <span style={{fontSize:12,color:C.muted}}>{label}</span>
                      <div style={{textAlign:"right"}}>
                        <div style={{fontFamily:"monospace",fontWeight:700,color,fontSize:14}}>{v}</div>
                        {lo!=="—"&&<div style={{fontSize:10,color:C.muted}}>P10 {lo} · P90 {hi}</div>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ══ WATERFALL ══ */}
        {activeTab==="waterfall" && S_ && (
          <div style={{background:C.card,borderRadius:10,border:`1px solid ${C.border}`,padding:"20px 24px"}}>
            <div style={{fontSize:14,fontWeight:700,color:C.navy,marginBottom:20}}>💧 Cascada P&L — Valores P50 anuales</div>
            {[
              {label:"Revenue Renta Diaria",   val: S_.rev_diaria.p50,      type:"pos", cumul: S_.rev_diaria.p50},
              {label:"Revenue Corporativa",     val: S_.rev_corp.p50,        type:"pos", cumul: S_.rev_total.p50},
              {label:"− Costos de Flota",       val: -S_.costo_flota.p50,   type:"neg", cumul: S_.rev_total.p50 - S_.costo_flota.p50},
              {label:"− Personal",              val: -S_.costo_personal.p50, type:"neg", cumul: S_.rev_total.p50 - S_.costo_flota.p50 - S_.costo_personal.p50},
              {label:"− Gastos Fijos",          val: -S_.gastos_fijos.p50,  type:"neg", cumul: S_.ebitda.p50},
              {label:"= EBITDA",                val: S_.ebitda.p50,          type:"total"},
              {label:"− Depreciación",          val: -S_.dep_anual.p50,     type:"neg", cumul: S_.ebit.p50},
              {label:"= EBIT",                  val: S_.ebit.p50,            type:"total"},
              {label:"− Intereses",             val: -S_.intereses.p50,     type:"neg"},
              {label:"− Impuestos",             val: -S_.impuesto.p50,      type:"neg"},
              {label:"= Utilidad Neta",         val: S_.util_neta.p50,       type:"total"},
            ].map(({label,val,type})=>{
              const isTotal = type==="total";
              const isNeg   = type==="neg";
              const barColor = isTotal ? C.navy : isNeg ? C.red : C.teal;
              const maxVal = S_.rev_total.p50;
              const barW = Math.min(100, Math.abs(val)/Math.max(maxVal,1)*100);
              return (
                <div key={label} style={{display:"flex",alignItems:"center",gap:10,marginBottom:isTotal?16:8,
                  paddingTop:isTotal?12:0,borderTop:isTotal?`1px solid ${C.border}`:"none"}}>
                  <div style={{width:220,fontSize:isTotal?13:12,fontWeight:isTotal?700:400,color:isTotal?C.navy:C.muted,flexShrink:0}}>{label}</div>
                  <div style={{flex:1,background:C.light,borderRadius:4,height:isTotal?18:12,overflow:"hidden"}}>
                    <div style={{width:`${barW}%`,height:"100%",background:barColor,borderRadius:4,opacity:isTotal?1:0.8}}/>
                  </div>
                  <div style={{width:100,textAlign:"right",fontFamily:"monospace",fontSize:isTotal?14:12,fontWeight:isTotal?800:500,
                    color:val>=0?barColor:C.red,flexShrink:0}}>{fmt$(val)}</div>
                </div>
              );
            })}
          </div>
        )}

        {/* ══ TORNADO ══ */}
        {activeTab==="tornado" && S_ && (
          <div style={{background:C.card,borderRadius:10,border:`1px solid ${C.border}`,padding:"20px 24px"}}>
            <div style={{fontSize:14,fontWeight:700,color:C.navy,marginBottom:6}}>🌪️ Análisis de Sensibilidad — Impacto en EVA</div>
            <div style={{fontSize:11,color:C.muted,marginBottom:16}}>Variables ordenadas por impacto en EVA (P90 − P10)</div>
            {(() => {
              const levers = Object.entries(PD).filter(([,v])=>v.lever && v.std>0);
              const impacts = levers.map(([k,v])=>{
                const base = S_.eva;
                return {
                  label: v.label,
                  impact: Math.abs(base.p90 - base.p10),
                  dir: v.dir || 1,
                };
              }).sort((a,b)=>b.impact-a.impact).slice(0,10);
              const maxImpact = impacts[0]?.impact || 1;
              return impacts.map(({label,impact,dir},i)=>(
                <div key={label} style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
                  <div style={{width:200,fontSize:11,color:C.muted,textAlign:"right",flexShrink:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{label}</div>
                  <div style={{flex:1,background:C.light,borderRadius:4,height:20,overflow:"hidden"}}>
                    <div style={{width:`${impact/maxImpact*100}%`,height:"100%",
                      background:`linear-gradient(90deg,${dir>0?C.teal:C.red}88,${dir>0?C.teal:C.red})`,borderRadius:4}}/>
                  </div>
                  <div style={{width:90,textAlign:"right",fontFamily:"monospace",fontSize:12,fontWeight:600,color:C.navy,flexShrink:0}}>{fmt$(impact)}</div>
                </div>
              ));
            })()}
            <div style={{marginTop:16,display:"flex",gap:20,fontSize:11,color:C.muted}}>
              <span><span style={{color:C.teal,fontWeight:700}}>■</span> Aumentar mejora EVA</span>
              <span><span style={{color:C.red,fontWeight:700}}>■</span> Reducir mejora EVA</span>
            </div>
          </div>
        )}

        {!S_ && activeTab !== "params" && (
          <div style={{textAlign:"center",padding:"60px 20px",color:C.muted}}>
            <div style={{fontSize:40,marginBottom:12}}>🚗</div>
            <div style={{fontSize:16,fontWeight:600,marginBottom:8}}>Sin resultados aún</div>
            <div style={{fontSize:13}}>Ajusta los parámetros y presiona <strong>Correr Simulación</strong></div>
          </div>
        )}

      </div>

      <div style={{textAlign:"center",padding:"20px",fontSize:11,color:C.muted}}>
        Promundial Consulting Group · Simulador Renta de Autos v1 · IR y WACC configurables
      </div>
    </div>
  );
}

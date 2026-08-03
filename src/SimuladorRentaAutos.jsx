import { useState, useCallback, useRef } from "react";

// ═══════════════════════════════════════════════════════════════════
// SIMULADOR MONTE CARLO — RENTA DE AUTOS  v4
// Valor por categoría integrado en tablas de mix
// Promundial Consulting Group
// ═══════════════════════════════════════════════════════════════════

const C = {
  deep:"#0F3521", green:"#1A5C38", gold:"#C8922A", light:"#F7F5F0",
  card:"#FFFFFF", border:"#E2DDD5", text:"#2C2C2C", muted:"#7A7267",
  red:"#B34040", blue:"#2E5E8E", teal:"#1A7A6D", orange:"#D4772C",
  navy:"#1A4060",
};
const mono = "'IBM Plex Mono','Courier New',monospace";
const sans = "'Segoe UI',system-ui,sans-serif";

// ─── Monte Carlo ───────────────────────────────────────────────────
function randn(){let u=0,v=0;while(!u)u=Math.random();while(!v)v=Math.random();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);}
function S(d){return Math.max(d.min,Math.min(d.max,d.mean+randn()*d.std));}
function pct(v,d=1){return(v*100).toFixed(d)+"%";}
function fmt$(n){if(isNaN(n))return"—";const s=n<0?"−$":"$",a=Math.abs(n);if(a>=1e6)return s+(a/1e6).toFixed(2)+"M";if(a>=1e3)return s+(a/1e3).toFixed(1)+"K";return s+a.toFixed(0);}
function fmtF(n){return new Intl.NumberFormat("en-US",{maximumFractionDigits:0}).format(n);}
function percentile(arr,p){const s=[...arr].sort((a,b)=>a-b);return s[Math.floor(p/100*(s.length-1))];}
function stats(arr){return{p10:percentile(arr,10),p50:percentile(arr,50),p90:percentile(arr,90)};}

// ─── Mix helpers ───────────────────────────────────────────────────
function tarifaMixMedia(mix){
  const total=mix.reduce((s,c)=>s+c.mix_pct,0)||1;
  return mix.reduce((s,c)=>s+(c.mix_pct/total)*c.tarifa_mean,0);
}
function tarifaMixStd(mix){
  const total=mix.reduce((s,c)=>s+c.mix_pct,0)||1;
  return Math.sqrt(mix.reduce((s,c)=>s+(c.mix_pct/total)*c.tarifa_std**2,0));
}
function descMixMedio(mix){
  const total=mix.reduce((s,c)=>s+c.mix_pct,0)||1;
  return mix.reduce((s,c)=>s+(c.mix_pct/total)*(c.desc_pct||0),0);
}
function valorMixMedio(mix){
  const total=mix.reduce((s,c)=>s+c.mix_pct,0)||1;
  return mix.reduce((s,c)=>s+(c.mix_pct/total)*(c.valor||0),0);
}
function sampleMix(mix){
  const raw=mix.map(c=>Math.max(0,c.mix_pct+randn()*c.mix_std));
  const total=raw.reduce((s,v)=>s+v,0)||1;
  const w=raw.map(v=>v/total);
  const tarifa=mix.reduce((s,c,i)=>s+w[i]*Math.max(0,c.tarifa_mean+randn()*c.tarifa_std),0);
  const desc=mix.reduce((s,c,i)=>s+w[i]*Math.max(0,Math.min((c.desc_pct||0)+randn()*(c.desc_std||0),30))/100,0);
  const valor=mix.reduce((s,c,i)=>s+w[i]*(c.valor||0),0);
  return{tarifa,desc,valor};
}

// ─── Default mix data — with vehicle values ────────────────────────
const DEFAULT_MIX_DIARIA = [
  {cat:"Economy",          mix_pct:18, mix_std:2, tarifa_mean:35,  tarifa_std:5,  desc_pct:5,  desc_std:1, valor:12000},
  {cat:"Compact",          mix_pct:16, mix_std:2, tarifa_mean:42,  tarifa_std:6,  desc_pct:5,  desc_std:1, valor:15000},
  {cat:"Intermediate",     mix_pct:14, mix_std:2, tarifa_mean:52,  tarifa_std:7,  desc_pct:4,  desc_std:1, valor:18000},
  {cat:"Full Size",        mix_pct:12, mix_std:2, tarifa_mean:65,  tarifa_std:8,  desc_pct:4,  desc_std:1, valor:22000},
  {cat:"Premium",          mix_pct:8,  mix_std:2, tarifa_mean:90,  tarifa_std:12, desc_pct:3,  desc_std:1, valor:32000},
  {cat:"Luxury",           mix_pct:5,  mix_std:1, tarifa_mean:150, tarifa_std:20, desc_pct:2,  desc_std:1, valor:65000},
  {cat:"Compact SUV",      mix_pct:10, mix_std:2, tarifa_mean:60,  tarifa_std:8,  desc_pct:4,  desc_std:1, valor:25000},
  {cat:"Intermediate SUV", mix_pct:8,  mix_std:2, tarifa_mean:75,  tarifa_std:10, desc_pct:4,  desc_std:1, valor:32000},
  {cat:"Full Size SUV",    mix_pct:4,  mix_std:1, tarifa_mean:110, tarifa_std:15, desc_pct:3,  desc_std:1, valor:45000},
  {cat:"Pickup",           mix_pct:2,  mix_std:1, tarifa_mean:85,  tarifa_std:10, desc_pct:3,  desc_std:1, valor:35000},
  {cat:"Minivan",          mix_pct:2,  mix_std:1, tarifa_mean:70,  tarifa_std:10, desc_pct:4,  desc_std:1, valor:28000},
  {cat:"Specialty",        mix_pct:1,  mix_std:1, tarifa_mean:200, tarifa_std:30, desc_pct:2,  desc_std:1, valor:80000},
];

const DEFAULT_MIX_CORP = [
  {cat:"Economy",          mix_pct:10, mix_std:2, tarifa_mean:650,  tarifa_std:80,  desc_pct:12, desc_std:2, valor:12000},
  {cat:"Compact",          mix_pct:12, mix_std:2, tarifa_mean:780,  tarifa_std:90,  desc_pct:12, desc_std:2, valor:15000},
  {cat:"Intermediate",     mix_pct:15, mix_std:2, tarifa_mean:950,  tarifa_std:100, desc_pct:10, desc_std:2, valor:18000},
  {cat:"Full Size",        mix_pct:14, mix_std:2, tarifa_mean:1100, tarifa_std:120, desc_pct:10, desc_std:2, valor:22000},
  {cat:"Premium",          mix_pct:10, mix_std:2, tarifa_mean:1500, tarifa_std:180, desc_pct:8,  desc_std:2, valor:32000},
  {cat:"Luxury",           mix_pct:5,  mix_std:1, tarifa_mean:2200, tarifa_std:300, desc_pct:5,  desc_std:1, valor:65000},
  {cat:"Compact SUV",      mix_pct:12, mix_std:2, tarifa_mean:1050, tarifa_std:120, desc_pct:10, desc_std:2, valor:25000},
  {cat:"Intermediate SUV", mix_pct:10, mix_std:2, tarifa_mean:1250, tarifa_std:150, desc_pct:8,  desc_std:2, valor:32000},
  {cat:"Full Size SUV",    mix_pct:5,  mix_std:1, tarifa_mean:1600, tarifa_std:200, desc_pct:7,  desc_std:1, valor:45000},
  {cat:"Pickup",           mix_pct:4,  mix_std:1, tarifa_mean:1200, tarifa_std:150, desc_pct:8,  desc_std:1, valor:35000},
  {cat:"Minivan",          mix_pct:2,  mix_std:1, tarifa_mean:1100, tarifa_std:130, desc_pct:8,  desc_std:1, valor:28000},
  {cat:"Specialty",        mix_pct:1,  mix_std:1, tarifa_mean:3000, tarifa_std:400, desc_pct:3,  desc_std:1, valor:80000},
];

// ─── Parameter groups (valor_flota_* removed) ─────────────────────
const GROUPS = [
  { id:"flota", label:"🚗 Flota", params:{
    flota_diaria:       {mean:80,   std:0,  min:1,    max:5000,  label:"Flota renta diaria (unidades)",       unit:"u"},
    flota_corp:         {mean:40,   std:0,  min:0,    max:5000,  label:"Flota contratos corporativos",         unit:"u"},
    valor_std_pct:      {mean:5,    std:0,  min:0,    max:20,    label:"Variabilidad valor vehículos σ (%)",   unit:"%"},
    vida_util:          {mean:4,    std:0,  min:1,    max:10,    label:"Vida útil flota (años)",               unit:"yr"},
    valor_residual_pct: {mean:35,   std:3,  min:5,    max:70,    label:"Valor residual al cierre (%)",         unit:"%"},
  }},
  { id:"diaria", label:"📅 Renta Diaria", params:{
    ocupacion_diaria:   {mean:72,   std:6,  min:20,   max:98,    label:"Ocupación flota diaria (%)",           unit:"%"},
  }},
  { id:"corp", label:"🏢 Corporativa", params:{
    ocupacion_corp:     {mean:88,   std:4,  min:50,   max:100,   label:"Ocupación flota corporativa (%)",      unit:"%"},
    plazo_contrato:     {mean:12,   std:2,  min:1,    max:60,    label:"Plazo promedio contrato (meses)",      unit:"m"},
  }},
  { id:"costos", label:"🔧 Costos Operativos", params:{
    mant_pct_valor:     {mean:1.2,  std:0.2,min:0,    max:5,     label:"Mantenimiento (% valor auto/año)",     unit:"%"},
    seguro_pct_valor:   {mean:3.5,  std:0.5,min:0.5,  max:10,    label:"Seguro (% valor auto/año)",            unit:"%"},
    lavado_mes:         {mean:25,   std:5,  min:0,    max:200,   label:"Lavado & limpieza/auto ($/mes)",       unit:"$"},
    combustible_mes:    {mean:40,   std:8,  min:0,    max:300,   label:"Combustible/auto diaria ($/mes)",      unit:"$"},
    siniestros_pct:     {mean:3,    std:1,  min:0,    max:15,    label:"Siniestros (% ingresos diaria)",       unit:"%"},
  }},
  { id:"rrhh", label:"👥 Personal", params:{
    agentes_diaria:     {mean:6,    std:0,  min:1,    max:200,   label:"Agentes renta diaria",                 unit:"u"},
    sueldo_agente:      {mean:900,  std:100,min:300,  max:5000,  label:"Sueldo agente ($/mes)",                unit:"$"},
    ejecutivos_corp:    {mean:3,    std:0,  min:1,    max:50,    label:"Ejecutivos cuenta corporativa",        unit:"u"},
    sueldo_ejecutivo:   {mean:1800, std:200,min:500,  max:10000, label:"Sueldo ejecutivo ($/mes)",             unit:"$"},
    personal_ops:       {mean:8,    std:0,  min:1,    max:200,   label:"Personal operativo",                   unit:"u"},
    sueldo_ops:         {mean:700,  std:80, min:200,  max:5000,  label:"Sueldo personal ops ($/mes)",          unit:"$"},
    admin_personal:     {mean:4,    std:0,  min:1,    max:100,   label:"Personal administrativo",              unit:"u"},
    sueldo_admin:       {mean:1200, std:150,min:300,  max:8000,  label:"Sueldo admin ($/mes)",                 unit:"$"},
  }},
  { id:"gastos", label:"🏠 Gastos Fijos", params:{
    alquiler_oficinas:  {mean:4000, std:500,min:0,    max:50000, label:"Alquiler oficinas/sucursales ($/mes)", unit:"$"},
    alquiler_parqueo:   {mean:3000, std:400,min:0,    max:30000, label:"Alquiler parqueo flota ($/mes)",       unit:"$"},
    sistemas_crm:       {mean:1500, std:200,min:0,    max:15000, label:"Sistemas CRM & GPS ($/mes)",           unit:"$"},
    marketing_mes:      {mean:5000, std:1000,min:0,   max:100000,label:"Marketing & publicidad ($/mes)",       unit:"$"},
    servicios_basicos:  {mean:2000, std:300,min:0,    max:20000, label:"Servicios básicos ($/mes)",            unit:"$"},
  }},
  { id:"fin", label:"💰 Financiero", params:{
    ir:                 {mean:25,   std:0,  min:0,    max:40,    label:"Impuesto a la renta (%)",              unit:"%"},
    wacc:               {mean:12,   std:0,  min:5,    max:30,    label:"WACC (%)",                             unit:"%"},
    deuda_pct:          {mean:60,   std:0,  min:0,    max:100,   label:"Deuda sobre valor flota (%)",          unit:"%"},
    tasa_deuda:         {mean:9,    std:1,  min:3,    max:20,    label:"Tasa de interés deuda (%)",            unit:"%"},
  }},
];

function flatParams(){
  const p={};
  GROUPS.forEach(g=>Object.entries(g.params).forEach(([k,v])=>p[k]={...v}));
  return p;
}

// ─── Simulation ────────────────────────────────────────────────────
function simOne(p,mixD,mixC){
  const flota_d=S(p.flota_diaria), flota_c=S(p.flota_corp);
  const vida=S(p.vida_util), resid=S(p.valor_residual_pct)/100;
  const val_std_pct=S(p.valor_std_pct)/100;

  const ocup_d=S(p.ocupacion_diaria)/100;
  const {tarifa:tarifa_d, desc:desc_d, valor:val_d_base}=sampleMix(mixD);
  const val_d=Math.max(1000, val_d_base*(1+randn()*val_std_pct));
  const rev_diaria=flota_d*365*ocup_d*tarifa_d*(1-desc_d);

  const ocup_c=S(p.ocupacion_corp)/100;
  const {tarifa:tarifa_c, desc:desc_c, valor:val_c_base}=sampleMix(mixC);
  const val_c=Math.max(1000, val_c_base*(1+randn()*val_std_pct));
  const rev_corp=flota_c*12*tarifa_c*(1-desc_c)*ocup_c;

  const rev_total=rev_diaria+rev_corp;
  const val_total_flota=flota_d*val_d+flota_c*val_c;
  const dep_anual=val_total_flota*(1-resid)/vida;

  // Costos como % del valor de flota
  const mant_pct=S(p.mant_pct_valor)/100;
  const seg_pct=S(p.seguro_pct_valor)/100;
  const costo_mant=val_total_flota*mant_pct;
  const costo_seg=val_total_flota*seg_pct;
  const lavado=(flota_d+flota_c)*S(p.lavado_mes)*12;
  const combust=flota_d*S(p.combustible_mes)*12;
  const siniestro=rev_diaria*S(p.siniestros_pct)/100;
  const costo_flota=costo_mant+costo_seg+lavado+combust+siniestro;

  const costo_personal=(S(p.agentes_diaria)*S(p.sueldo_agente)+S(p.ejecutivos_corp)*S(p.sueldo_ejecutivo)+S(p.personal_ops)*S(p.sueldo_ops)+S(p.admin_personal)*S(p.sueldo_admin))*12;
  const gastos_fijos=(S(p.alquiler_oficinas)+S(p.alquiler_parqueo)+S(p.sistemas_crm)+S(p.marketing_mes)+S(p.servicios_basicos))*12;

  const ebitda=rev_total-costo_flota-costo_personal-gastos_fijos;
  const ebit=ebitda-dep_anual;
  const deuda=val_total_flota*S(p.deuda_pct)/100;
  const intereses=deuda*S(p.tasa_deuda)/100;
  const uai=ebit-intereses;
  const ir=S(p.ir)/100;
  const impuesto=Math.max(0,uai*ir);
  const util_neta=uai-impuesto;
  const wacc=S(p.wacc)/100;
  const nopat=ebit*(1-ir);
  const eva=nopat-val_total_flota*wacc;

  return{rev_total,rev_diaria,rev_corp,ebitda,ebit,util_neta,eva,dep_anual,intereses,impuesto,
    costo_flota,costo_personal,gastos_fijos,val_total_flota,deuda,nopat,
    margen_ebitda:rev_total>0?ebitda/rev_total:0,
    margen_neto:rev_total>0?util_neta/rev_total:0,
    roic:val_total_flota>0?nopat/val_total_flota:0,
    rev_por_auto:rev_total/(flota_d+flota_c||1),
    ocup_d,ocup_c,
    tarifa_d_net:tarifa_d*(1-desc_d),
    tarifa_c_net:tarifa_c*(1-desc_c),
    val_d_prom:val_d, val_c_prom:val_c};
}

function runSim(params,mixD,mixC,N=3000){
  const keys=["rev_total","rev_diaria","rev_corp","ebitda","ebit","util_neta","eva","dep_anual",
    "intereses","impuesto","costo_flota","costo_personal","gastos_fijos","val_total_flota","deuda",
    "nopat","margen_ebitda","margen_neto","roic","rev_por_auto","ocup_d","ocup_c",
    "tarifa_d_net","tarifa_c_net","val_d_prom","val_c_prom"];
  const b={};keys.forEach(k=>b[k]=[]);
  for(let i=0;i<N;i++){const r=simOne(params,mixD,mixC);keys.forEach(k=>b[k].push(r[k]));}
  const out={};keys.forEach(k=>out[k]=stats(b[k]));
  return out;
}

// ─── Components ────────────────────────────────────────────────────
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
  const tarifaMed=tarifaMixMedia(mix);
  const tarifaSd=tarifaMixStd(mix);
  const descMed=descMixMedio(mix);
  const tarifaNeta=tarifaMed*(1-descMed/100);
  const valorMed=valorMixMedio(mix);
  const esDaily=tarifaUnit==="$/día";

  const upd=(i,field,val)=>setMix(prev=>{const n=[...prev];n[i]={...n[i],[field]:isNaN(val)?0:val};return n;});

  const inp={width:"100%",padding:"2px 4px",fontSize:11,fontFamily:mono,
    border:`1px solid ${C.border}`,borderRadius:2,background:C.light,textAlign:"right"};

  return(
    <div style={{marginTop:8}}>
      {/* Resumen */}
      <div style={{display:"flex",gap:16,flexWrap:"wrap",marginBottom:10,padding:"10px 14px",
        background:`${C.green}10`,borderRadius:6,border:`1px solid ${C.green}30`}}>
        <div>
          <div style={{fontSize:10,color:C.muted}}>Tarifa ponderada μ ({tarifaUnit})</div>
          <div style={{fontSize:18,fontWeight:700,color:C.green,fontFamily:mono}}>
            {esDaily?"$"+tarifaMed.toFixed(2):"$"+fmtF(Math.round(tarifaMed))}
          </div>
        </div>
        <div>
          <div style={{fontSize:10,color:C.muted}}>Desviación σ</div>
          <div style={{fontSize:18,fontWeight:700,color:C.blue,fontFamily:mono}}>±${fmtF(Math.round(tarifaSd))}</div>
        </div>
        <div>
          <div style={{fontSize:10,color:C.muted}}>Desc. ponderado μ</div>
          <div style={{fontSize:18,fontWeight:700,color:descMed>8?C.red:descMed>5?C.orange:C.teal,fontFamily:mono}}>{descMed.toFixed(1)}%</div>
        </div>
        <div>
          <div style={{fontSize:10,color:C.muted}}>Tarifa neta μ (post-desc)</div>
          <div style={{fontSize:18,fontWeight:700,color:C.deep,fontFamily:mono}}>
            {esDaily?"$"+tarifaNeta.toFixed(2):"$"+fmtF(Math.round(tarifaNeta))}
          </div>
        </div>
        <div>
          <div style={{fontSize:10,color:C.muted}}>Valor flota ponderado μ</div>
          <div style={{fontSize:18,fontWeight:700,color:C.navy,fontFamily:mono}}>${fmtF(Math.round(valorMed))}</div>
        </div>
        <div style={{marginLeft:"auto",display:"flex",alignItems:"center"}}>
          <span style={{fontSize:12,fontWeight:700,padding:"4px 10px",borderRadius:4,
            background:ok?"#1A5C3820":"#B3404020",color:ok?C.green:C.red,
            border:`1px solid ${ok?C.green:C.red}50`}}>
            Σ mix = {total.toFixed(1)}% {ok?"✓":"⚠ debe ser 100%"}
          </span>
        </div>
      </div>

      {/* Tabla */}
      <div style={{overflowX:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
          <thead>
            <tr style={{background:C.deep,color:"#fff"}}>
              {["Categoría","% Mix μ","% Mix σ",`Tarifa μ (${tarifaUnit})`,`Tarifa σ (${tarifaUnit})`,
                "Desc % μ","Desc % σ","Valor auto ($)","Tarifa Neta μ"].map(h=>(
                <th key={h} style={{padding:"6px 8px",textAlign:"left",fontFamily:mono,fontWeight:600,whiteSpace:"nowrap"}}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {mix.map((c,i)=>{
              const w=c.mix_pct/(total||1);
              const dp=c.desc_pct||0;
              const neta=c.tarifa_mean*(1-dp/100);
              return(
                <tr key={i} style={{background:i%2===0?C.light:C.card,borderBottom:`1px solid ${C.border}`}}>
                  <td style={{padding:"4px 8px"}}>
                    <input value={c.cat} onChange={e=>upd(i,"cat",e.target.value)}
                      style={{width:"100%",border:"none",background:"transparent",fontSize:11,fontFamily:mono,color:C.text}}/>
                  </td>
                  <td style={{padding:"3px 4px"}}><input type="number" value={c.mix_pct} onChange={e=>upd(i,"mix_pct",parseFloat(e.target.value))} style={inp}/></td>
                  <td style={{padding:"3px 4px"}}><input type="number" value={c.mix_std} onChange={e=>upd(i,"mix_std",parseFloat(e.target.value))} style={inp}/></td>
                  <td style={{padding:"3px 4px"}}><input type="number" value={c.tarifa_mean} onChange={e=>upd(i,"tarifa_mean",parseFloat(e.target.value))} style={inp}/></td>
                  <td style={{padding:"3px 4px"}}><input type="number" value={c.tarifa_std} onChange={e=>upd(i,"tarifa_std",parseFloat(e.target.value))} style={inp}/></td>
                  <td style={{padding:"3px 4px"}}>
                    <input type="number" value={dp} min={0} max={30} step={0.5} onChange={e=>upd(i,"desc_pct",parseFloat(e.target.value))}
                      style={{...inp,border:`1px solid ${dp>10?C.red:dp>7?C.orange:C.border}`,color:dp>10?C.red:dp>7?C.orange:C.text}}/>
                  </td>
                  <td style={{padding:"3px 4px"}}><input type="number" value={c.desc_std||0} min={0} max={5} step={0.25} onChange={e=>upd(i,"desc_std",parseFloat(e.target.value))} style={inp}/></td>
                  {/* Valor auto — nueva columna */}
                  <td style={{padding:"3px 4px"}}>
                    <input type="number" value={c.valor||0} onChange={e=>upd(i,"valor",parseFloat(e.target.value))}
                      style={{...inp,border:`1px solid ${C.navy}55`,color:C.navy,fontWeight:600}}/>
                  </td>
                  <td style={{padding:"4px 8px",fontFamily:mono,textAlign:"right"}}>
                    <span style={{color:C.deep,fontWeight:600}}>{esDaily?"$"+neta.toFixed(2):"$"+fmtF(Math.round(neta))}</span>
                    <span style={{color:dp>10?C.red:C.muted,fontSize:10,marginLeft:4}}>−{dp.toFixed(1)}% ({(w*100).toFixed(1)}%)</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
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

const TABS=[
  {id:"params",    label:"📋 Supuestos"},
  {id:"resultados",label:"📊 Resultados"},
  {id:"waterfall", label:"💧 Cascada P&L"},
  {id:"tornado",   label:"🌪️ Tornado"},
];

export default function SimuladorRentaAutos(){
  const [params,setParams]=useState(flatParams);
  const [mixDiaria,setMixDiaria]=useState(DEFAULT_MIX_DIARIA);
  const [mixCorp,setMixCorp]=useState(DEFAULT_MIX_CORP);
  const [openSec,setOpenSec]=useState({flota:true,diaria:true,corp:true});
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

  // Live mix summary for display
  const valorDiariaMed = valorMixMedio(mixDiaria);
  const valorCorpMed   = valorMixMedio(mixCorp);

  return(
    <div style={{fontFamily:sans,background:C.light,minHeight:"100vh",color:C.text}}>

      {/* HEADER */}
      <div style={{background:C.deep,color:"#fff",padding:"12px 20px",display:"flex",alignItems:"center",
        justifyContent:"space-between",borderBottom:`3px solid ${C.gold}`,flexWrap:"wrap",gap:8}}>
        <div>
          <div style={{fontSize:10,letterSpacing:3,textTransform:"uppercase",color:C.gold,fontWeight:600}}>PROMUNDIAL CONSULTING GROUP</div>
          <div style={{fontSize:17,fontWeight:800}}>🚗 Simulador Monte Carlo · Renta de Autos</div>
          <div style={{fontSize:11,color:"#9ab8a0",marginTop:1}}>Modelo mixto: Diaria + Corporativa · 12 categorías · N={N.toLocaleString()} iter.</div>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
          <button onClick={resetSigma}
            style={{background:"transparent",color:C.gold,border:`1.5px solid ${C.gold}`,padding:"7px 12px",borderRadius:6,fontSize:11,cursor:"pointer",fontWeight:600}}>
            σ = 0
          </button>
          <select value={N} onChange={e=>setN(+e.target.value)}
            style={{background:"#1a3a2a",color:C.gold,border:`1px solid ${C.gold}55`,borderRadius:6,padding:"6px 10px",fontSize:12,cursor:"pointer"}}>
            {[1000,3000,5000,10000].map(n=><option key={n} value={n}>{n.toLocaleString()} iter.</option>)}
          </select>
          <button onClick={handleRun} disabled={running}
            style={{background:running?"#555":C.gold,color:"#fff",border:"none",padding:"9px 22px",borderRadius:6,fontWeight:700,fontSize:13,cursor:running?"not-allowed":"pointer"}}>
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
              μ = valor base · σ = desviación estándar (0 = determinístico). Valor de flota se calcula automáticamente desde el mix de categorías.
            </div>

            {/* Flota — sin valor promedio */}
            <Section title="🚗 Flota" open={!!openSec.flota} onToggle={()=>toggleSec("flota")}>
              {Object.entries(GROUPS.find(g=>g.id==="flota").params).map(([k,v])=>(
                <ParamRow key={k} k={k} p={v} val={params[k]||v} onChange={handleChange}/>
              ))}
              {/* Resumen live de valor ponderado */}
              <div style={{marginTop:12,padding:"10px 14px",background:`${C.navy}10`,borderRadius:6,
                border:`1px solid ${C.navy}30`,display:"flex",gap:24,flexWrap:"wrap"}}>
                <div>
                  <div style={{fontSize:10,color:C.muted}}>Valor ponderado flota diaria (del mix)</div>
                  <div style={{fontSize:16,fontWeight:700,color:C.navy,fontFamily:mono}}>${fmtF(Math.round(valorDiariaMed))}</div>
                </div>
                <div>
                  <div style={{fontSize:10,color:C.muted}}>Valor ponderado flota corporativa (del mix)</div>
                  <div style={{fontSize:16,fontWeight:700,color:C.navy,fontFamily:mono}}>${fmtF(Math.round(valorCorpMed))}</div>
                </div>
                <div>
                  <div style={{fontSize:10,color:C.muted}}>Valor total estimado de flota</div>
                  <div style={{fontSize:16,fontWeight:700,color:C.deep,fontFamily:mono}}>
                    ${fmtF(Math.round(valorDiariaMed*params.flota_diaria.mean + valorCorpMed*params.flota_corp.mean))}
                  </div>
                </div>
              </div>
            </Section>

            {/* Mix Renta Diaria */}
            <Section title="📅 Renta Diaria — Mix de Categorías, Tarifas & Valores ($/día)" open={!!openSec.diaria} onToggle={()=>toggleSec("diaria")}>
              <ParamRow k="ocupacion_diaria" p={GROUPS.find(g=>g.id==="diaria").params.ocupacion_diaria}
                val={params.ocupacion_diaria} onChange={handleChange}/>
              <div style={{fontSize:11,color:C.muted,margin:"10px 0 4px"}}>
                Define el mix, tarifa diaria y valor por categoría. Tarifa y valor ponderados se calculan automáticamente.
              </div>
              <MixTable mix={mixDiaria} setMix={handleMixD} tarifaUnit="$/día"/>
            </Section>

            {/* Mix Corporativa */}
            <Section title="🏢 Corporativa — Mix de Categorías, Tarifas & Valores ($/mes)" open={!!openSec.corp} onToggle={()=>toggleSec("corp")}>
              {Object.entries(GROUPS.find(g=>g.id==="corp").params).map(([k,v])=>(
                <ParamRow key={k} k={k} p={v} val={params[k]||v} onChange={handleChange}/>
              ))}
              <div style={{fontSize:11,color:C.muted,margin:"10px 0 4px"}}>
                Define el mix, tarifa mensual y valor por categoría para contratos corporativos.
              </div>
              <MixTable mix={mixCorp} setMix={handleMixC} tarifaUnit="$/mes"/>
            </Section>

            {/* Resto de grupos */}
            {GROUPS.filter(g=>!["flota","diaria","corp"].includes(g.id)).map(g=>(
              <Section key={g.id} title={g.label} open={!!openSec[g.id]} onToggle={()=>toggleSec(g.id)}>
                {Object.entries(g.params).map(([k,v])=>(
                  <ParamRow key={k} k={k} p={v} val={params[k]||v} onChange={handleChange}/>
                ))}
              </Section>
            ))}
          </div>
        )}

        {/* ══ RESULTADOS ══ */}
        {activeTab==="resultados"&&S_&&(
          <div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(155px,1fr))",gap:10,marginBottom:16}}>
              <KpiCard label="Revenue Total" icon="💰" val={fmt$(S_.rev_total.p50)} p10={fmt$(S_.rev_total.p10)} p90={fmt$(S_.rev_total.p90)} color={C.blue}/>
              <KpiCard label="EBITDA" icon="📈" val={fmt$(S_.ebitda.p50)} p10={fmt$(S_.ebitda.p10)} p90={fmt$(S_.ebitda.p90)} color={C.teal}
                sub={`Margen: ${pct(S_.margen_ebitda.p50)}`}/>
              <KpiCard label="Utilidad Neta" icon="🏆" val={fmt$(S_.util_neta.p50)} p10={fmt$(S_.util_neta.p10)} p90={fmt$(S_.util_neta.p90)}
                color={S_.util_neta.p50>=0?C.green:C.red} sub={`Margen neto: ${pct(S_.margen_neto.p50)}`}/>
              <KpiCard label="EVA" icon="⚡" val={fmt$(S_.eva.p50)} p10={fmt$(S_.eva.p10)} p90={fmt$(S_.eva.p90)}
                color={S_.eva.p50>=0?C.green:C.red} sub={S_.eva.p50>=0?"Valor creado ✓":"Valor destruido ✗"}/>
              <KpiCard label="Rev. Diaria" icon="📅" val={fmt$(S_.rev_diaria.p50)} p10={fmt$(S_.rev_diaria.p10)} p90={fmt$(S_.rev_diaria.p90)} color={C.deep}/>
              <KpiCard label="Rev. Corporativa" icon="🏢" val={fmt$(S_.rev_corp.p50)} p10={fmt$(S_.rev_corp.p10)} p90={fmt$(S_.rev_corp.p90)} color={C.navy}/>
              <KpiCard label="Tarifa Diaria Neta" icon="💵" val={"$"+S_.tarifa_d_net.p50.toFixed(2)+"/día"} p10={"$"+S_.tarifa_d_net.p10.toFixed(2)} p90={"$"+S_.tarifa_d_net.p90.toFixed(2)} color={C.orange}/>
              <KpiCard label="Tarifa Corp. Neta" icon="🏢" val={fmt$(S_.tarifa_c_net.p50)+"/mes"} p10={fmt$(S_.tarifa_c_net.p10)} p90={fmt$(S_.tarifa_c_net.p90)} color={C.blue}/>
              <KpiCard label="Valor Flota Total" icon="🚗" val={fmt$(S_.val_total_flota.p50)} p10={fmt$(S_.val_total_flota.p10)} p90={fmt$(S_.val_total_flota.p90)} color={C.navy}/>
              <KpiCard label="ROIC" icon="📐" val={pct(S_.roic.p50)} p10={pct(S_.roic.p10)} p90={pct(S_.roic.p90)}
                color={S_.roic.p50>params.wacc.mean/100?C.green:C.red} sub={`WACC: ${params.wacc.mean}%`}/>
            </div>

            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",gap:14}}>
              <div style={{background:C.card,borderRadius:10,border:`1px solid ${C.border}`,padding:"18px 20px"}}>
                <div style={{fontSize:13,fontWeight:700,color:C.deep,marginBottom:14}}>📊 Estructura de Costos (P50 anual)</div>
                {[["Costos flota",S_.costo_flota.p50,C.orange],["Personal",S_.costo_personal.p50,C.blue],
                  ["Gastos fijos",S_.gastos_fijos.p50,C.muted],["Depreciación",S_.dep_anual.p50,C.teal],
                  ["Intereses",S_.intereses.p50,C.red],["Impuestos",S_.impuesto.p50,"#7A5A2A"]].map(([l,v,col])=>(
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

              <div style={{background:C.card,borderRadius:10,border:`1px solid ${C.border}`,padding:"18px 20px"}}>
                <div style={{fontSize:13,fontWeight:700,color:C.deep,marginBottom:14}}>🚗 Indicadores Clave</div>
                {[
                  ["Ocupación diaria (P50)",pct(S_.ocup_d.p50),pct(S_.ocup_d.p10),pct(S_.ocup_d.p90),C.blue],
                  ["Ocupación corporativa (P50)",pct(S_.ocup_c.p50),pct(S_.ocup_c.p10),pct(S_.ocup_c.p90),C.teal],
                  ["Valor auto diaria ponderado",fmt$(S_.val_d_prom.p50),fmt$(S_.val_d_prom.p10),fmt$(S_.val_d_prom.p90),C.navy],
                  ["Valor auto corp ponderado",fmt$(S_.val_c_prom.p50),fmt$(S_.val_c_prom.p10),fmt$(S_.val_c_prom.p90),C.navy],
                  ["Rev./auto/año",fmt$(S_.rev_por_auto.p50),fmt$(S_.rev_por_auto.p10),fmt$(S_.rev_por_auto.p90),C.orange],
                  ["NOPAT",fmt$(S_.nopat.p50),fmt$(S_.nopat.p10),fmt$(S_.nopat.p90),C.green],
                ].map(([l,v,lo,hi,col])=>(
                  <div key={l} style={{padding:"8px 0",borderBottom:`1px solid ${C.border}`}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <span style={{fontSize:12,color:C.muted}}>{l}</span>
                      <div style={{textAlign:"right"}}>
                        <div style={{fontFamily:mono,fontWeight:700,color:col,fontSize:13}}>{v}</div>
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
        {activeTab==="waterfall"&&S_&&(
          <div style={{background:C.card,borderRadius:10,border:`1px solid ${C.border}`,padding:"20px 24px"}}>
            <div style={{fontSize:14,fontWeight:700,color:C.deep,marginBottom:20}}>💧 Cascada P&L — Valores P50 anuales</div>
            {[
              {label:"Revenue Renta Diaria",  val:S_.rev_diaria.p50,      type:"pos"},
              {label:"Revenue Corporativa",    val:S_.rev_corp.p50,        type:"pos"},
              {label:"− Costos de Flota",      val:-S_.costo_flota.p50,   type:"neg"},
              {label:"− Personal",             val:-S_.costo_personal.p50, type:"neg"},
              {label:"− Gastos Fijos",         val:-S_.gastos_fijos.p50,  type:"neg"},
              {label:"= EBITDA",               val:S_.ebitda.p50,          type:"total"},
              {label:"− Depreciación",         val:-S_.dep_anual.p50,     type:"neg"},
              {label:"= EBIT",                 val:S_.ebit.p50,            type:"total"},
              {label:"− Intereses",            val:-S_.intereses.p50,     type:"neg"},
              {label:"− Impuestos",            val:-S_.impuesto.p50,      type:"neg"},
              {label:"= Utilidad Neta",        val:S_.util_neta.p50,       type:"total"},
            ].map(({label,val,type})=>{
              const isT=type==="total",isN=type==="neg";
              const col=isT?C.deep:isN?C.red:C.teal;
              const barW=Math.min(100,Math.abs(val)/Math.max(S_.rev_total.p50,1)*100);
              return(
                <div key={label} style={{display:"flex",alignItems:"center",gap:10,marginBottom:isT?16:8,
                  paddingTop:isT?12:0,borderTop:isT?`1px solid ${C.border}`:"none"}}>
                  <div style={{width:220,fontSize:isT?13:12,fontWeight:isT?700:400,color:isT?C.deep:C.muted,flexShrink:0}}>{label}</div>
                  <div style={{flex:1,background:C.light,borderRadius:4,height:isT?18:12,overflow:"hidden"}}>
                    <div style={{width:`${barW}%`,height:"100%",background:col,borderRadius:4,opacity:isT?1:0.75}}/>
                  </div>
                  <div style={{width:100,textAlign:"right",fontFamily:mono,fontSize:isT?14:12,
                    fontWeight:isT?800:500,color:val>=0?col:C.red,flexShrink:0}}>{fmt$(val)}</div>
                </div>
              );
            })}
          </div>
        )}

        {/* ══ TORNADO ══ */}
        {activeTab==="tornado"&&S_&&(
          <div style={{background:C.card,borderRadius:10,border:`1px solid ${C.border}`,padding:"20px 24px"}}>
            <div style={{fontSize:14,fontWeight:700,color:C.deep,marginBottom:6}}>🌪️ Sensibilidad — Rango P10/P90 en EVA</div>
            <div style={{fontSize:11,color:C.muted,marginBottom:16}}>Variables con σ &gt; 0, ordenadas por impacto en EVA</div>
            {(()=>{
              const items=[];
              GROUPS.forEach(g=>Object.entries(g.params).forEach(([k,v])=>{
                if((params[k]?.std||0)>0) items.push({label:v.label,impact:Math.abs(S_.eva.p90-S_.eva.p10)});
              }));
              const mixImpact=Math.abs(S_.tarifa_d_net.p90-S_.tarifa_d_net.p10)*365*(params.flota_diaria?.mean||80)*(params.ocupacion_diaria?.mean||72)/100;
              if(mixImpact>0) items.push({label:"Mix tarifas & valores diaria",impact:mixImpact});
              items.sort((a,b)=>b.impact-a.impact);
              const maxI=items[0]?.impact||1;
              return items.slice(0,12).map(({label,impact})=>(
                <div key={label} style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
                  <div style={{width:240,fontSize:11,color:C.muted,textAlign:"right",flexShrink:0,
                    overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{label}</div>
                  <div style={{flex:1,background:C.light,borderRadius:4,height:18,overflow:"hidden"}}>
                    <div style={{width:`${impact/maxI*100}%`,height:"100%",
                      background:`linear-gradient(90deg,${C.teal}88,${C.teal})`,borderRadius:4}}/>
                  </div>
                  <div style={{width:90,textAlign:"right",fontFamily:mono,fontSize:12,fontWeight:600,color:C.deep,flexShrink:0}}>{fmt$(impact)}</div>
                </div>
              ));
            })()}
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
        Promundial Consulting Group · Simulador Renta de Autos v4 · IR y WACC configurables por país
      </div>
    </div>
  );
}

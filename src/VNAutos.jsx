import { useState, useCallback, useMemo, useRef, useEffect } from "react";

// ═══════════════════════════════════════════════════════════════════════
// SIMULADOR MONTE CARLO — VENTA DE AUTOS NUEVOS
// Funnel comercial completo + Goal-Seeking inverso
// Promundial Consulting Group
// ═══════════════════════════════════════════════════════════════════════

const C = {
  deep:"#0F3521",green:"#1A5C38",gold:"#C8922A",light:"#F7F5F0",
  card:"#FFFFFF",border:"#E2DDD5",text:"#2C2C2C",muted:"#7A7267",
  red:"#B34040",blue:"#2E5E8E",teal:"#1A7A6D",purple:"#5B4A8A",
  orange:"#D4772C",
};

const PD = {
  // ╔═══════════════════════════════════════════════════════════╗
  // ║  FUNNEL COMERCIAL                                        ║
  // ╚═══════════════════════════════════════════════════════════╝
  leads_mes:            {mean:400,std:60,min:100,max:50000,label:"Leads / mes",unit:"u",group:"funnel",lever:true,dir:1},
  tasa_conversion:      {mean:11,std:2,min:4,max:50,label:"Tasa de conversión %",unit:"%",group:"funnel",lever:true,dir:1},
  devoluciones:         {mean:8,std:3,min:0,max:25,label:"% de devoluciones",unit:"%",group:"funnel",lever:true,dir:-1},

  // ╔═══════════════════════════════════════════════════════════╗
  // ║  PRECIO Y MARGEN                                         ║
  // ╚═══════════════════════════════════════════════════════════╝
  // precio_lista es calculado automáticamente desde el mix de categorías
  descuento_pct:        {mean:3,std:0.5,min:0,max:15,label:"% Descuento sobre precio de lista",unit:"%",group:"precio",lever:true,dir:-1},
  margen_bruto_pct:     {mean:8,std:1.5,min:3,max:35,label:"Margen bruto %",unit:"%",group:"precio",lever:true},

  // ╔═══════════════════════════════════════════════════════════╗
  // ║  PRODUCTIVIDAD COMERCIAL                                 ║
  // ╚═══════════════════════════════════════════════════════════╝
  vendedores_fte:        {mean:8,std:0,min:1,max:500,label:"Vendedores FTE (dotación actual)",unit:"u",group:"prod",lever:true,dir:1},
  productividad:         {mean:8,std:1.5,min:1,max:100,label:"Unidades / vendedor / mes (capacidad)",unit:"u",group:"prod",lever:true,dir:1},
  sueldo_base:           {mean:800,std:100,min:0,max:10000,label:"Sueldo base vendedor / mes",unit:"$",group:"prod",lever:false},
  comision_por_u:        {mean:200,std:50,min:0,max:5000,label:"Comisión por unidad vendida",unit:"$",group:"prod",lever:false},
  gerente_ventas:        {mean:3000,std:400,min:0,max:30000,label:"Sueldo gerente ventas / mes",unit:"$",group:"prod",lever:false},

  // ╔═══════════════════════════════════════════════════════════╗
  // ║  MARKETING                                               ║
  // ╚═══════════════════════════════════════════════════════════╝
  gasto_marketing:      {mean:12000,std:2000,min:0,max:500000,label:"Gasto marketing / mes",unit:"$",group:"mktg",lever:true,dir:-1},
  costo_por_lead:       {mean:30,std:8,min:0,max:1000,label:"Costo por lead",unit:"$",group:"mktg",lever:true,dir:-1},

  // ╔═══════════════════════════════════════════════════════════╗
  // ║  INVENTARIO Y FLOOR PLAN                                 ║
  // ╚═══════════════════════════════════════════════════════════╝
  dias_inventario:      {mean:60,std:12,min:10,max:180,label:"Días inventario en piso",unit:"d",group:"inv",lever:true,dir:-1},
  unidades_transito:    {mean:500,std:0,min:0,max:5000,label:"Unidades en tránsito",unit:"u",group:"inv",lever:false},
  unidades_bodega:      {mean:500,std:0,min:0,max:5000,label:"Unidades en bodega",unit:"u",group:"inv",lever:false},
  tasa_floorplan:       {mean:9,std:1,min:5,max:15,label:"Tasa floor plan % anual",unit:"%",group:"inv",lever:false},

  // ╔═══════════════════════════════════════════════════════════╗
  // ║  GASTOS FIJOS Y OVERHEAD                                 ║
  // ╚═══════════════════════════════════════════════════════════╝
  personal_admin_vn:    {mean:3,std:0.5,min:0,max:100,label:"Personal admin VN",unit:"u",group:"gastos",lever:false},
  sueldo_admin:         {mean:1000,std:150,min:0,max:20000,label:"Sueldo admin VN / mes",unit:"$",group:"gastos",lever:false},
  alquiler_showroom:    {mean:8000,std:1500,min:0,max:200000,label:"Alquiler showroom / mes",unit:"$",group:"gastos",lever:true,dir:-1},
  servicios_mes:        {mean:2500,std:500,min:0,max:50000,label:"Servicios básicos / mes",unit:"$",group:"gastos",lever:true,dir:-1},
  otros_gastos:         {mean:4000,std:800,min:0,max:2000000,label:"Otros gastos generales / mes",unit:"$",group:"gastos",lever:true,dir:-1},

  // ╔═══════════════════════════════════════════════════════════╗
  // ║  DEPRECIACIÓN Y AMORTIZACIÓN                             ║
  // ╚═══════════════════════════════════════════════════════════╝
  deprec_showroom:      {mean:3000,std:400,min:0,max:100000,label:"Depreciación showroom / mes",unit:"$",group:"dya",lever:false},
  deprec_vehiculos:     {mean:2000,std:300,min:0,max:50000,label:"Depreciación demos / utilitarios",unit:"$",group:"dya",lever:false},
  amort_software:       {mean:800,std:200,min:0,max:500000,label:"Amortización CRM/DMS / mes",unit:"$",group:"dya",lever:false},

  // ╔═══════════════════════════════════════════════════════════╗
  // ║  EVA                                                     ║
  // ╚═══════════════════════════════════════════════════════════╝
  tasa_imp:             {mean:32,std:0,min:28,max:35,label:"Tasa impositiva % (IR)",unit:"%",group:"eva_p",lever:false},
  capital_vn:           {mean:1800000,std:200000,min:0,max:300000000,label:"Capital invertido VN",unit:"$",group:"eva_p",lever:false},
  wacc:                 {mean:14,std:1.5,min:0,max:50,label:"WACC %",unit:"%",group:"eva_p",lever:false},
  downpayment_pct:      {mean:10,std:2,min:0,max:50,label:"Downpayment % del precio de lista",unit:"%",group:"eva_p",lever:true,dir:1},
  dias_entrega:         {mean:15,std:5,min:1,max:360,label:"Días promedio reserva → entrega",unit:"d",group:"eva_p",lever:false,dir:-1},
};

// ── Mix de categorías de vehículos ──────────────────────────────────────
// mix_pct: % promedio de ventas en esa categoría (deben sumar ~100)
// mix_std: desviación estándar del % (variabilidad mes a mes)
// precio_mean / precio_std: precio de lista promedio y σ dentro de la categoría
const MIX_DEFAULT = [
  {cat:"Sedan",      mix_pct:20, mix_std:3, precio_mean:22000, precio_std:2000, desc_pct:3.5, desc_std:0.5},
  {cat:"SUV",        mix_pct:25, mix_std:4, precio_mean:34000, precio_std:3500, desc_pct:2.0, desc_std:0.5},
  {cat:"Crossover",  mix_pct:20, mix_std:3, precio_mean:28000, precio_std:2500, desc_pct:2.5, desc_std:0.5},
  {cat:"Camioneta",  mix_pct:15, mix_std:3, precio_mean:40000, precio_std:4000, desc_pct:1.5, desc_std:0.5},
  {cat:"Hatchback",  mix_pct: 8, mix_std:2, precio_mean:16000, precio_std:1500, desc_pct:4.0, desc_std:1.0},
  {cat:"Minivan",    mix_pct: 5, mix_std:2, precio_mean:26000, precio_std:2000, desc_pct:3.0, desc_std:0.5},
  {cat:"Camiones",   mix_pct: 4, mix_std:2, precio_mean:55000, precio_std:6000, desc_pct:1.0, desc_std:0.5},
  {cat:"Otros",      mix_pct: 3, mix_std:1, precio_mean:25000, precio_std:3000, desc_pct:3.0, desc_std:1.0},
];

function randn(){let u=0,v=0;while(!u)u=Math.random();while(!v)v=Math.random();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);}
function S(p){return Math.max(p.min,Math.min(p.max,p.mean+randn()*p.std));}
function pctle(a,p){const s=[...a].sort((x,y)=>x-y);return s[Math.max(0,Math.ceil(s.length*p/100)-1)];}
function avg(a){return a.reduce((x,y)=>x+y,0)/a.length;}
const fmt=v=>{if(Math.abs(v)>=1e6)return(v/1e6).toFixed(2)+"M";if(Math.abs(v)>=1e3)return(v/1e3).toFixed(1)+"K";return v.toFixed(0);};
const fmtF=v=>new Intl.NumberFormat("en-US",{maximumFractionDigits:0}).format(v);

// Muestrea precio de lista ponderado desde el mix de categorías.
// 1) Muestrea % de cada categoría con Normal(mix_pct, mix_std), clamp ≥ 0
// 2) Normaliza para que sumen 100%
// 3) Muestrea precio de cada categoría con Normal(precio_mean, precio_std)
// 4) Retorna precio ponderado
// Returns { precioLista, descuentoPct } both weighted by sampled mix
function samplePrecioConDesc(mix){
  const raw=mix.map(c=>Math.max(0, c.mix_pct+randn()*c.mix_std));
  const total=raw.reduce((s,v)=>s+v,0)||1;
  const weights=raw.map(v=>v/total);
  const precioLista=mix.reduce((s,c,i)=>s+weights[i]*Math.max(0,c.precio_mean+randn()*c.precio_std),0);
  // Per-category discount: use desc_pct/desc_std if available, else 0
  const descuentoPct=mix.reduce((s,c,i)=>{
    const dp=c.desc_pct||0, ds=c.desc_std||0;
    return s+weights[i]*Math.max(0,Math.min(dp+randn()*ds,20))/100;
  },0);
  return{precioLista,descuentoPct};
}
// Keep legacy for display helpers
function samplePrecioLista(mix){return samplePrecioConDesc(mix).precioLista;}
// Precio ponderado determinístico (medias) — para display en tiempo real
function precioListaMedio(mix){
  const total=mix.reduce((s,c)=>s+c.mix_pct,0)||1;
  return mix.reduce((s,c)=>s+(c.mix_pct/total)*c.precio_mean,0);
}
// Descuento ponderado medio por categoría — display
function descuentoMixMedio(mix){
  const total=mix.reduce((s,c)=>s+c.mix_pct,0)||1;
  return mix.reduce((s,c)=>s+(c.mix_pct/total)*(c.desc_pct||0),0);
}
// Desviación estándar implícita ponderada del precio.
// Solo captura la variabilidad DENTRO de cada categoría (precio_std por categoría).
// La dispersión ENTRE categorías ya la captura el mix variable — no se duplica aquí.
// Con todos los σ = 0, el resultado es ±$0 como se espera.
function precioListaStd(mix){
  const total=mix.reduce((s,c)=>s+c.mix_pct,0)||1;
  return Math.sqrt(mix.reduce((s,c)=>s+(c.mix_pct/total)*c.precio_std**2,0));
}

// ═══ SIMULATION ═══
function simOnce(P, mix){
  let tIngVN=0,tCOGS=0,tUVN=0,tVend=0,tIngLista=0,tDescuento=0,tPrecioListaSum=0,tMeses=0;
  let tGVend=0,tGMktg=0,tGLeads=0,tFP=0,tGAdmin=0,tDA=0,tInvTotal=0,tUtilizacion=0,tProstPerd=0;

  for(let m=0;m<12;m++){
    // ── Funnel ──────────────────────────────────────────────────────────
    // Demanda potencial: leads → conversión → neto de devoluciones
    const leads        = Math.round(S(P.leads_mes));
    const conv         = S(P.tasa_conversion)/100;
    const caida        = S(P.devoluciones)/100;
    const demandaMes   = Math.round(leads * conv * (1 - caida));

    // Capacidad instalada: FTE × productividad individual
    // Fallback a 8 si vendedores_fte no existe en params (compatibilidad versiones anteriores)
    const vendFTEParam = P.vendedores_fte || {mean:8, std:0, min:1, max:100};
    const vendFTE      = Math.max(1, Math.round(S(vendFTEParam)));
    const prod         = Math.max(0.1, S(P.productividad));
    const capacidadMax = Math.floor(vendFTE * prod);

    // Unidades vendidas = mínimo entre demanda y capacidad
    const uVN          = Math.min(demandaMes, capacidadMax);

    // KPIs de utilización
    const utilizacion  = capacidadMax > 0 ? uVN / capacidadMax : 0;   // % capacidad usada
    const prospectosPerdidos = Math.max(0, demandaMes - capacidadMax); // demanda no atendida

    tUtilizacion  += utilizacion;
    tProstPerd    += prospectosPerdidos;
    const{precioLista,descuentoPct:descCatPct}=samplePrecioConDesc(mix);
    const mbBase=S(P.margen_bruto_pct)/100;      // margen negociado con el importador
    const costoAdqUnit=precioLista*(1-mbBase);    // costo fijo al importador — no cambia con el descuento
    // Descuento efectivo = mayor entre el global (param) y el ponderado por categoría
    // Esto permite que el gerente vea el descuento sistémico del mix vs. el táctico global
    const descGlobal=S(P.descuento_pct)/100;
    const descuento=Math.max(descGlobal,descCatPct);  // toma el más conservador (mayor costo)
    const precio=precioLista*(1-descuento);       // precio neto al cliente
    // margenReal = precio - costoAdq = precioLista×(mbBase - descuento%)
    // Si descuento > mbBase, margenReal es negativo — el dealer vende bajo costo

    tIngVN+=uVN*precio;
    tIngLista+=uVN*precioLista;
    tDescuento+=uVN*precioLista*descuento;
    tCOGS+=uVN*costoAdqUnit;  // COGS siempre sobre costo de adquisición, independiente del descuento
    tUVN+=uVN;
    tPrecioListaSum+=precioLista; tMeses++;

    // Nómina: se paga la dotación FTE completa independiente de si hay demanda
    // vendedores_necesarios es informativo — cuántos necesitarías para cubrir la demanda
    tVend += vendFTE;
    tGVend += vendFTE * S(P.sueldo_base) + uVN * S(P.comision_por_u) + S(P.gerente_ventas);

    // Marketing
    tGMktg+=S(P.gasto_marketing);
    tGLeads+=leads*S(P.costo_por_lead);

    // Floor plan — inventario total financiado:
    //   stock_piso    = dinámico (función de ventas × días inventario)
    //   stock_transito = fijo (unidades compradas, en camino)
    //   stock_bodega   = fijo (unidades recibidas, no en showroom)
    // El banco cobra desde que el dealer toma titularidad (despacho importador)
    const stockPiso     = (uVN * S(P.dias_inventario)) / 30;
    const stockTransito = S(P.unidades_transito);
    const stockBodega   = S(P.unidades_bodega);
    const invTotal      = stockPiso + stockTransito + stockBodega;
    tInvTotal += invTotal;
    tFP += invTotal * costoAdqUnit * S(P.tasa_floorplan) / 100 / 12;

    // Admin & gastos fijos
    const admN=Math.round(S(P.personal_admin_vn));
    tGAdmin+=admN*S(P.sueldo_admin)+S(P.alquiler_showroom)+S(P.servicios_mes)+S(P.otros_gastos);

    // D&A
    tDA+=S(P.deprec_showroom)+S(P.deprec_vehiculos)+S(P.amort_software);
  }

  const ingTotal=tIngVN;
  const margenBruto=tIngVN-tCOGS;
  const gastosComerciales=tGVend+tGMktg+tGLeads;
  // Floor plan excluido del EBITDA y EBIT — es costo financiero, no operativo
  const gastosOperativos=gastosComerciales+tGAdmin;
  const ebitda=margenBruto-gastosOperativos;
  const ebit=ebitda-tDA;
  const tx=S(P.tasa_imp)/100;
  // EBT = EBIT − Floor Plan (el costo financiero reduce la base imponible)
  const ebt=ebit-tFP;
  // IR se aplica sobre EBT, no sobre EBIT
  const irAnual=ebt>0?ebt*tx:0;
  // Utilidad neta: EBT − IR
  const un=ebt-irAnual;
  const cap=S(P.capital_vn),wacc=S(P.wacc)/100;

  // EVA = NOPAT - (Capital Invertido × WACC)
  // NOPAT = EBIT × (1 - tasa_imp) — base operativa; el costo financiero no entra aquí porque ya está en el cargo de capital del EVA
  const nopat = ebit > 0 ? ebit * (1 - tx) : ebit;
  // Downpayments en cartera reducen el capital invertido neto del dealer.
  const uVNMes = tUVN / 12;
  const precioListaProm = tMeses > 0 ? tPrecioListaSum / tMeses : 0;
  const unidadesConReserva = uVNMes * (S(P.dias_entrega) / 30);
  const downpaymentsCartera = unidadesConReserva * precioListaProm * S(P.downpayment_pct) / 100;
  const capitalNeto = Math.max(0, cap - downpaymentsCartera);

  // EVA = EBIT×(1−IR) − Capital Invertido×WACC  (cargo anual completo, no /12)
  const eva = nopat - capitalNeto * wacc;

  // Derived KPIs
  const costoAdq=tUVN>0?((tGMktg+tGLeads)/tUVN):0;
  const margenPorU=tUVN>0?(margenBruto/tUVN):0;
  // margenRealPct = margenBase% - descuento% (medias, para display)
  const margenRealPct=(P.margen_bruto_pct.mean - P.descuento_pct.mean);
  const rotInv=tUVN>0?(tUVN/(S(P.unidades_transito)+S(P.unidades_bodega)||1)):0;
  const invPromedio=tInvTotal/12;

  return{
    ingTotal,ingVN:tIngLista,descTotal:tDescuento,ingNeto:tIngVN,
    precioListaSim: tMeses>0 ? tPrecioListaSum/tMeses : 0,
    margenBruto,cogs:tCOGS,
    gastosComerciales,floorPlan:tFP,gastosAdmin:tGAdmin,gastosTotal:gastosOperativos,da:tDA,
    ebitda,ebit,ebt,irAnual,nopat,utilidadNeta:un,eva,
    downpaymentsCartera,capitalNeto,
    uVN:tUVN,vendProm:tVend/12,utilizacion:tUtilizacion/12,prospectosPerdidos:tProstPerd/12,
    costoAdq,margenPorU,margenRealPct,rotInv,invPromedio,
  };
}
function runSim(P,n,mix){const r=[];for(let i=0;i<n;i++)r.push(simOnce(P,mix));return r;}

function goalSeek({params,metric,target,conf,levers,maxIter=25,simN=600,mix,mixLevers}){
  let cur={};Object.entries(params).forEach(([k,v])=>{cur[k]={...v};});
  let curMix=mix.map(c=>({...c}));
  const log=[],checkP=100-conf;

  for(let it=0;it<maxIter;it++){
    const res=runSim(cur,simN,curMix);
    const vals=res.map(r=>r[metric]).sort((a,b)=>a-b);
    const cv=pctle(vals,checkP),gap=target-cv;
    log.push({it,val:cv,gap});
    if(Math.abs(gap)<Math.abs(target)*0.02||gap<=0)return{ok:true,params:cur,mix:curMix,log,final:cv,iters:it+1};

    // Sensitivity for PD levers
    const sens={};let totS=0;
    levers.forEach(k=>{
      const up={...cur,[k]:{...cur[k],mean:cur[k].mean*1.05}};
      const dn={...cur,[k]:{...cur[k],mean:cur[k].mean*0.95}};
      const vu=pctle(runSim(up,Math.min(400,simN),curMix).map(r=>r[metric]).sort((a,b)=>a-b),checkP);
      const vd=pctle(runSim(dn,Math.min(400,simN),curMix).map(r=>r[metric]).sort((a,b)=>a-b),checkP);
      sens[k]=(vu-vd)/0.10; totS+=Math.abs(sens[k]);
    });

    // Sensitivity for mix levers — perturb mix_pct ±5pp, renormalize
    const mixSens={};
    mixLevers.forEach(idx=>{
      const mUp=curMix.map((c,i)=>i===idx?{...c,mix_pct:c.mix_pct*1.20}:{...c});
      const mDn=curMix.map((c,i)=>i===idx?{...c,mix_pct:Math.max(0,c.mix_pct*0.80)}:{...c});
      const vu=pctle(runSim(cur,Math.min(400,simN),mUp).map(r=>r[metric]).sort((a,b)=>a-b),checkP);
      const vd=pctle(runSim(cur,Math.min(400,simN),mDn).map(r=>r[metric]).sort((a,b)=>a-b),checkP);
      mixSens[idx]=(vu-vd)/0.40; totS+=Math.abs(mixSens[idx]);
    });

    if(!totS)return{ok:false,params:cur,mix:curMix,log,final:cv,iters:it+1};

    // Update PD levers — respecting direction constraints
    levers.forEach(k=>{
      if(Math.abs(sens[k])<totS*0.01)return;
      const w=Math.abs(sens[k])/totS;
      let delta=Math.max(-0.12,Math.min(0.12,(gap/(sens[k]||1))*w*0.35));
      // dir:-1 means this lever should ONLY decrease (e.g. días inventario, devoluciones, descuento)
      if(PD[k]?.dir===-1) delta=Math.min(0,delta);
      // dir:+1 means this lever should ONLY increase (future use)
      if(PD[k]?.dir===1)  delta=Math.max(0,delta);
      let nm=cur[k].mean*(1+delta);
      cur[k]={...cur[k],mean:Math.max(cur[k].min,Math.min(cur[k].max,nm))};
    });

    // Update mix levers — shift pcts, then renormalize
    mixLevers.forEach(idx=>{
      if(!mixSens[idx]||Math.abs(mixSens[idx])<totS*0.01)return;
      const w=Math.abs(mixSens[idx])/totS;
      const delta=Math.max(-0.15,Math.min(0.15,(gap/(mixSens[idx]||1))*w*0.30));
      curMix[idx]={...curMix[idx],mix_pct:Math.max(0,curMix[idx].mix_pct*(1+delta))};
    });
    // Renormalize mix to sum to 100
    const mixTotal=curMix.reduce((s,c)=>s+c.mix_pct,0)||1;
    curMix=curMix.map(c=>({...c,mix_pct:c.mix_pct/mixTotal*100}));
  }
  const fR=runSim(cur,simN,curMix);
  return{ok:false,params:cur,mix:curMix,log,final:pctle(fR.map(r=>r[metric]).sort((a,b)=>a-b),checkP),iters:maxIter};
}

// ─── UI ───
function Histo({values,color,label,target,h=72}){
  const ref=useRef(null);
  const[w,setW]=useState(320);
  useEffect(()=>{
    if(!ref.current)return;
    const ro=new ResizeObserver(e=>setW(e[0].contentRect.width||320));
    ro.observe(ref.current);
    return()=>ro.disconnect();
  },[]);
  const sorted=[...values].sort((a,b)=>a-b);
  const bins=28,mn=sorted[0],mx=sorted[sorted.length-1],rng=mx-mn||1,bw=rng/bins;
  const cts=new Array(bins).fill(0);
  sorted.forEach(v=>{let i=Math.floor((v-mn)/bw);if(i>=bins)i=bins-1;cts[i]++;});
  const maxC=Math.max(...cts),barW=w/bins,toX=v=>Math.max(0,Math.min(w,((v-mn)/rng)*w));
  const p10=pctle(sorted,10),p50=pctle(sorted,50),p90=pctle(sorted,90);
  return(
    <div ref={ref} style={{marginBottom:8,width:"100%"}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:1}}>
        <span style={{fontFamily:"var(--serif)",fontSize:"var(--fs-md)",fontWeight:700,color:C.deep}}>{label}</span>
        <span style={{fontFamily:"var(--mono)",fontSize:"var(--fs-xs)",color:C.muted}}>μ ${fmt(avg(values))}</span>
      </div>
      <svg width={w} height={h+20} style={{display:"block",width:"100%"}}>
        {cts.map((c,i)=><rect key={i} x={i*barW} y={h-(c/maxC)*h} width={barW-.5} height={(c/maxC)*h} fill={color} opacity={.45} rx={1}/>)}
        {target!==undefined&&<><line x1={toX(target)} x2={toX(target)} y1={0} y2={h} stroke={C.red} strokeWidth={2} strokeDasharray="4,3"/><text x={toX(target)} y={h+10} fill={C.red} fontSize="9" fontFamily="var(--mono)" textAnchor="middle">META</text></>}
        {[[p10,"#D06838","P10"],[p50,C.deep,"P50"],[p90,C.blue,"P90"]].map(([v,cl,lb])=>(
          <g key={lb}><line x1={toX(v)} x2={toX(v)} y1={0} y2={h} stroke={cl} strokeWidth={1.2} strokeDasharray={lb==="P50"?"0":"3,2"}/><text x={toX(v)} y={h+18} fill={cl} fontSize="9" fontFamily="var(--mono)" textAnchor="middle">{lb} ${fmt(v)}</text></g>
        ))}
      </svg>
    </div>
  );
}

function Section({title,icon,color,children,defaultOpen=false}){
  const[open,setOpen]=useState(defaultOpen);
  return(
    <div style={{background:C.card,borderRadius:"var(--radius)",marginBottom:6,border:`1px solid ${C.border}`,borderTop:`3px solid ${color}`,overflow:"hidden"}}>
      <button onClick={()=>setOpen(!open)} style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"space-between",padding:"var(--pad-y) var(--pad-x)",background:"none",border:"none",cursor:"pointer",textAlign:"left"}}>
        <span style={{fontFamily:"var(--serif)",fontSize:"var(--fs-md)",fontWeight:700,color}}>{icon} {title}</span>
        <span style={{fontSize:"var(--fs-lg)",color:C.muted,transition:"transform .2s",transform:open?"rotate(180deg)":"rotate(0)"}}>{open?"▾":"▸"}</span>
      </button>
      {open&&<div style={{padding:`0 var(--pad-x) var(--pad-y)`}}>{children}</div>}
    </div>
  );
}

function PI({k,p,val,onChange,hl}){
  return(
    <div style={{display:"flex",alignItems:"center",gap:4,marginBottom:3,background:hl?`${C.gold}12`:"transparent",padding:"2px 4px",borderRadius:3}}>
      <label style={{width:"var(--lbl-w)",fontSize:"var(--fs-xs)",fontFamily:"var(--mono)",color:C.text,flexShrink:0,lineHeight:1.3}}>{p.label}</label>
      {["mean","std"].map(f=>(
        <div key={f} style={{display:"flex",flexDirection:"column",alignItems:"center"}}>
          <span style={{fontSize:"var(--fs-xs)",color:C.muted,letterSpacing:1}}>{f==="mean"?"μ":"σ"}</span>
          <input type="number" value={val[f]} onChange={e=>onChange(k,f,parseFloat(e.target.value)||0)}
            style={{width:"var(--inp-w)",padding:"3px 4px",fontSize:"var(--fs-sm)",fontFamily:"var(--mono)",border:`1px solid ${hl?C.gold:C.border}`,borderRadius:2,background:C.light,textAlign:"right"}}/>
        </div>
      ))}
      <span style={{fontSize:"var(--fs-xs)",color:C.muted,width:14,flexShrink:0}}>{p.unit}</span>
    </div>
  );
}

// ── Mix de Categorías — tabla editable ────────────────────────────────────
function MixTable({mix, setMix}){
  const totalPct = mix.reduce((s,c)=>s+c.mix_pct,0);
  const precioMed = precioListaMedio(mix);
  const precioSd  = precioListaStd(mix);
  const descMed   = descuentoMixMedio(mix);
  const ok = Math.abs(totalPct-100)<1;

  const upd=(i,field,val)=>setMix(prev=>{
    const n=[...prev]; n[i]={...n[i],[field]:isNaN(val)?0:val}; return n;
  });

  const cols=[
    {label:"Categoría",      w:"18%"},
    {label:"% Mix μ",        w:"8%"},
    {label:"% Mix σ",        w:"8%"},
    {label:"Precio μ ($)",   w:"13%"},
    {label:"Precio σ ($)",   w:"13%"},
    {label:"Desc % μ",       w:"9%"},
    {label:"Desc % σ",       w:"9%"},
    {label:"P.Neto μ",       w:"22%"},
  ];

  return(
    <div style={{marginTop:8}}>
      {/* Resumen calculado */}
      <div style={{display:"flex",gap:12,flexWrap:"wrap",marginBottom:8,padding:"8px 10px",
        background:`${C.green}12`,borderRadius:6,border:`1px solid ${C.green}30`}}>
        <div>
          <div style={{fontSize:"var(--fs-xs)",color:C.muted}}>Precio lista ponderado μ</div>
          <div style={{fontSize:"var(--fs-lg)",fontWeight:700,color:C.green,fontFamily:"var(--mono)"}}>
            ${fmtF(Math.round(precioMed))}
          </div>
        </div>
        <div>
          <div style={{fontSize:"var(--fs-xs)",color:C.muted}}>Desviación implícita σ</div>
          <div style={{fontSize:"var(--fs-lg)",fontWeight:700,color:C.blue,fontFamily:"var(--mono)"}}>
            ±${fmtF(Math.round(precioSd))}
          </div>
        </div>
        <div>
          <div style={{fontSize:"var(--fs-xs)",color:C.muted}}>Desc. ponderado mix μ</div>
          <div style={{fontSize:"var(--fs-lg)",fontWeight:700,
            color:descMed>3?C.red:descMed>2?C.orange:C.teal,fontFamily:"var(--mono)"}}>
            {descMed.toFixed(2)}%
          </div>
        </div>
        <div>
          <div style={{fontSize:"var(--fs-xs)",color:C.muted}}>Precio neto μ (post-desc)</div>
          <div style={{fontSize:"var(--fs-lg)",fontWeight:700,color:C.deep,fontFamily:"var(--mono)"}}>
            ${fmtF(Math.round(precioMed*(1-descMed/100)))}
          </div>
        </div>
        <div style={{marginLeft:"auto",display:"flex",alignItems:"center"}}>
          <span style={{fontSize:"var(--fs-sm)",fontWeight:700,padding:"3px 10px",borderRadius:4,
            background:ok?"#1A5C3820":"#B3404020",
            color:ok?C.green:C.red,border:`1px solid ${ok?C.green:C.red}50`}}>
            Σ mix = {totalPct.toFixed(1)}% {ok?"✓":"⚠ debe ser 100%"}
          </span>
        </div>
      </div>

      {/* Tabla */}
      <div style={{overflowX:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:"var(--fs-xs)"}}>
          <thead>
            <tr style={{background:C.deep,color:"#fff"}}>
              {cols.map(c=>(
                <th key={c.label} style={{padding:"6px 8px",textAlign:"left",
                  fontFamily:"var(--mono)",fontWeight:600,width:c.w,whiteSpace:"nowrap"}}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {mix.map((c,i)=>{
              const w=c.mix_pct/(totalPct||1);
              const dp=c.desc_pct||0;
              const precioNeto=c.precio_mean*(1-dp/100);
              const inp={width:"100%",padding:"2px 4px",fontSize:"var(--fs-xs)",
                fontFamily:"var(--mono)",border:`1px solid ${C.border}`,
                borderRadius:2,background:C.light,textAlign:"right"};
              return(
                <tr key={i} style={{background:i%2===0?C.light:C.card,
                  borderBottom:`1px solid ${C.border}`}}>
                  {/* Nombre categoría */}
                  <td style={{padding:"4px 8px"}}>
                    <input value={c.cat} onChange={e=>upd(i,"cat",e.target.value)}
                      style={{width:"100%",border:"none",background:"transparent",
                        fontSize:"var(--fs-xs)",fontFamily:"var(--mono)",color:C.text}}/>
                  </td>
                  {/* % Mix μ */}
                  <td style={{padding:"3px 4px"}}>
                    <input type="number" value={c.mix_pct}
                      onChange={e=>upd(i,"mix_pct",parseFloat(e.target.value))}
                      style={inp}/>
                  </td>
                  {/* % Mix σ */}
                  <td style={{padding:"3px 4px"}}>
                    <input type="number" value={c.mix_std}
                      onChange={e=>upd(i,"mix_std",parseFloat(e.target.value))}
                      style={inp}/>
                  </td>
                  {/* Precio μ */}
                  <td style={{padding:"3px 4px"}}>
                    <input type="number" value={c.precio_mean}
                      onChange={e=>upd(i,"precio_mean",parseFloat(e.target.value))}
                      style={inp}/>
                  </td>
                  {/* Precio σ */}
                  <td style={{padding:"3px 4px"}}>
                    <input type="number" value={c.precio_std}
                      onChange={e=>upd(i,"precio_std",parseFloat(e.target.value))}
                      style={inp}/>
                  </td>
                  {/* Desc % μ */}
                  <td style={{padding:"3px 4px"}}>
                    <input type="number" value={dp} min={0} max={20} step={0.5}
                      onChange={e=>upd(i,"desc_pct",parseFloat(e.target.value))}
                      style={{...inp,border:`1px solid ${dp>3?C.red:dp>2?C.orange:C.border}`,
                        color:dp>3?C.red:dp>2?C.orange:C.text}}/>
                  </td>
                  {/* Desc % σ */}
                  <td style={{padding:"3px 4px"}}>
                    <input type="number" value={c.desc_std||0} min={0} max={5} step={0.25}
                      onChange={e=>upd(i,"desc_std",parseFloat(e.target.value))}
                      style={inp}/>
                  </td>
                  {/* Precio neto = precio × (1 − desc%) */}
                  <td style={{padding:"4px 8px",fontFamily:"var(--mono)",textAlign:"right"}}>
                    <span style={{color:C.deep,fontWeight:600}}>${fmtF(Math.round(precioNeto))}</span>
                    <span style={{color:dp>3?C.red:C.muted,fontSize:"var(--fs-xs)",marginLeft:4}}>
                      −{dp.toFixed(1)}% ({(w*100).toFixed(1)}%)
                    </span>
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

// ═══ MAIN ═══

export default function VNMonteCarlo(){
  const[params,setParams]=useState(()=>{
    // Always initialize from PD — guarantees all keys exist including newly added ones
    const p={};
    Object.entries(PD).forEach(([k,v])=>{p[k]={...v};});
    return p;
  });
  const[mix,setMix]=useState(MIX_DEFAULT.map(c=>({...c})));
  const[numSims,setNumSims]=useState(3000);
  const[results,setResults]=useState(null);
  const[running,setRunning]=useState(false);
  const[tab,setTab]=useState("supuestos");
  const[sensData,setSensData]=useState(null);
  const[sensTarget,setSensTarget]=useState("eva");
  const[gsMetric,setGsMetric]=useState("eva");
  const[gsTarget,setGsTarget]=useState(100000);
  const[gsConf,setGsConf]=useState(60);
  const[gsLevers,setGsLevers]=useState(()=>{const l={};Object.entries(PD).forEach(([k,v])=>{if(v.lever)l[k]=true;});return l;});
  const[gsMixLevers,setGsMixLevers]=useState(()=>Object.fromEntries(MIX_DEFAULT.map(c=>[c.cat,false])));
  const[gsResult,setGsResult]=useState(null);
  const[gsRunning,setGsRunning]=useState(false);
  const[resultsStale,setResultsStale]=useState(false);
  const origRef=useRef(null);

  const chg=useCallback((k,f,v)=>{
    setParams(p=>{
      const updated={...p,[k]:{...p[k],[f]:v}};
      paramsRef.current=updated; // sync update so handleRun always has latest
      return updated;
    });
    setResultsStale(true);
  },[]);

  const syncSetMix = useCallback((updater) => {
    setMix(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      mixRef.current = next;
      return next;
    });
    setResultsStale(true);
  }, []);
  const paramsRef = useRef(params);
  const mixRef    = useRef(mix);
  useEffect(()=>{ paramsRef.current = params; }, [params]);
  useEffect(()=>{ mixRef.current    = mix;    }, [mix]);

  const handleRun=useCallback(()=>{
    setRunning(true);
    const currentParams = paramsRef.current;
    const currentMix    = mixRef.current;
    setTimeout(()=>{
      const safeParams={};
      Object.entries(PD).forEach(([k,v])=>{safeParams[k]={...v,...(currentParams[k]||{})};});
      const res=runSim(safeParams,numSims,currentMix);
      setResults([...res]);
      const metrics=["eva","ebitda","ebit","utilidadNeta"];
      const bv={};metrics.forEach(m=>{bv[m]=avg(res.map(r=>r[m]));});
      const se={};Object.keys(safeParams).filter(k=>k!=="tasa_imp").forEach(k=>{
        const tw={...safeParams,[k]:{...safeParams[k],mean:safeParams[k].mean*1.10}};
        const tr=runSim(tw,Math.min(500,numSims),currentMix);
        se[k]={};metrics.forEach(m=>{se[k][m]=avg(tr.map(r=>r[m]))-bv[m];});
      });
      setSensData(se);setRunning(false);setResultsStale(false);setTab("results");
    },50);
  },[numSims]);

  const handleGS=useCallback(()=>{
    setGsRunning(true);
    const currentParams = paramsRef.current;
    const currentMix    = mixRef.current;
    origRef.current={};Object.entries(currentParams).forEach(([k,v])=>{origRef.current[k]={...v};});
    origRef.current._mix=currentMix.map(c=>({...c}));
    setTimeout(()=>{
      const safeParams={};
      Object.entries(PD).forEach(([k,v])=>{safeParams[k]={...v,...(currentParams[k]||{})};});
      const lk=Object.keys(gsLevers).filter(k=>gsLevers[k]);
      const mixLeverIdxs=currentMix.map((c,i)=>gsMixLevers[c.cat]?i:-1).filter(i=>i>=0);
      const r=goalSeek({params:safeParams,metric:gsMetric,target:gsTarget,conf:gsConf,levers:lk,mix:currentMix,mixLevers:mixLeverIdxs});
      setGsResult(r);
      // Apply optimized mix if mix levers were active
      if(mixLeverIdxs.length>0 && r.mix) syncSetMix(r.mix);
      const optP=r.params;
      const fr=runSim(optP,numSims,r.mix||currentMix);setResults(fr);
      const metrics=["eva","ebitda","ebit","utilidadNeta"];
      const bv={};metrics.forEach(m=>{bv[m]=avg(fr.map(x=>x[m]));});
      const se={};Object.keys(optP).filter(k=>k!=="tasa_imp").forEach(k=>{
        const tw={...optP,[k]:{...optP[k],mean:optP[k].mean*1.10}};
        const tr=runSim(tw,Math.min(500,numSims),r.mix||currentMix);
        se[k]={};metrics.forEach(m=>{se[k][m]=avg(tr.map(x=>x[m]))-bv[m];});
      });
      setSensData(se);
      setParams(prev=>{const n={...prev};Object.entries(optP).forEach(([k,v])=>{n[k]={...v};});return n;});
      setGsRunning(false);setResultsStale(false);setTab("goalseeking");
    },80);
  },[gsMetric,gsTarget,gsConf,gsLevers,gsMixLevers,numSims]);

  const stats=useMemo(()=>{
    if(!results)return null;
    const ex=f=>{const v=results.map(r=>r[f]).sort((a,b)=>a-b);return{values:v,mean:avg(v),p10:pctle(v,10),p50:pctle(v,50),p90:pctle(v,90)};};
    return{
      ebitda:ex("ebitda"),ebit:ex("ebit"),ebt:ex("ebt"),irAnual:ex("irAnual"),utilidadNeta:ex("utilidadNeta"),eva:ex("eva"),
      ingTotal:ex("ingTotal"),ingVN:ex("ingVN"),descTotal:ex("descTotal"),ingNeto:ex("ingNeto"),
      cogs:ex("cogs"),
      precioListaSim:ex("precioListaSim"),
      margenBruto:ex("margenBruto"),
      gastosComerciales:ex("gastosComerciales"),floorPlan:ex("floorPlan"),gastosAdmin:ex("gastosAdmin"),gastosTotal:ex("gastosTotal"),da:ex("da"),
      downpaymentsCartera:ex("downpaymentsCartera"),capitalNeto:ex("capitalNeto"),
      uVN:ex("uVN"),vendProm:ex("vendProm"),utilizacion:ex("utilizacion"),prospectosPerdidos:ex("prospectosPerdidos"),
      costoAdq:ex("costoAdq"),margenPorU:ex("margenPorU"),margenRealPct:ex("margenRealPct"),invPromedio:ex("invPromedio"),
    };
  },[results]);

  const sortedSens=useMemo(()=>{
    if(!sensData)return[];
    return Object.entries(sensData).map(([k,v])=>[k,v[sensTarget]]).sort((a,b)=>Math.abs(b[1])-Math.abs(a[1])).slice(0,15);
  },[sensData,sensTarget]);

  const leverChanges=useMemo(()=>{
    if(!gsResult||!origRef.current)return[];
    const ch=[];
    // PD parameter changes
    Object.keys(gsResult.params).forEach(k=>{
      if(!PD[k]||!origRef.current[k])return;
      const o=origRef.current[k].mean,n=gsResult.params[k].mean,p=((n-o)/o)*100;
      if(Math.abs(p)>0.5)ch.push({k,label:PD[k].label,unit:PD[k].unit,o,n,p});
    });
    // Mix category changes
    if(gsResult.mix){
      gsResult.mix.forEach((c,i)=>{
        // Always compare against the mix that was live when GS started (origRef._mix),
        // NOT against MIX_DEFAULT which may differ from what the user had configured.
        const orig=origRef.current._mix?.[i];
        if(!orig)return;
        const o=orig.mix_pct,n=c.mix_pct,p=o>0?((n-o)/o)*100:0;
        if(Math.abs(p)>0.5)ch.push({k:`mix_${c.cat}`,label:`Mix ${c.cat}`,unit:"%",o,n,p,isMix:true});
      });
    }
    ch.sort((a,b)=>Math.abs(b.p)-Math.abs(a.p));return ch;
  },[gsResult]);

  const GC={
    funnel:{t:"Funnel Comercial",c:C.green,i:"🚗"},
    precio:{t:"Precio y Margen",c:C.green,i:"💵"},
    prod:{t:"Productividad Comercial",c:C.blue,i:"👥"},
    mktg:{t:"Marketing y Adquisición",c:C.orange,i:"📣"},
    inv:{t:"Inventario y Floor Plan",c:C.gold,i:"📦"},
    gastos:{t:"Gastos Fijos y Overhead",c:C.muted,i:"🏢"},
    dya:{t:"Depreciación y Amortización",c:C.purple,i:"📉"},
    eva_p:{t:"Parámetros EVA",c:C.purple,i:"📐"},
  };

  const tabs=[{k:"supuestos",l:"📝 Supuestos"},{k:"goalseeking",l:"🎯 Goal-Seek"},{k:"results",l:"📊 Resultados"},{k:"sensitivity",l:"🌪️ Tornado"}];
  const inpS={padding:"4px 7px",borderRadius:3,border:`1px solid ${C.border}`,fontSize:"var(--fs-sm)",fontFamily:"var(--mono)",background:C.light,textAlign:"right"};

  return(
    <div style={{"--serif":"'Cormorant Garamond',serif","--sans":"'Outfit',sans-serif","--mono":"'JetBrains Mono',monospace",
      minHeight:"100vh",background:`linear-gradient(170deg,${C.light} 0%,#EDE8E0 100%)`,fontFamily:"var(--sans)",color:C.text}}>
      <style>{`
        :root {
          --fs-xs:   clamp(8px,  1.1vw, 11px);
          --fs-sm:   clamp(10px, 1.3vw, 13px);
          --fs-md:   clamp(12px, 1.5vw, 15px);
          --fs-lg:   clamp(14px, 1.8vw, 18px);
          --fs-xl:   clamp(16px, 2.2vw, 22px);
          --fs-2xl:  clamp(20px, 2.8vw, 28px);
          --inp-w:   clamp(56px, 7vw,  80px);
          --lbl-w:   clamp(160px, 20vw, 220px);
          --pad-x:   clamp(8px,  2vw,  24px);
          --pad-y:   clamp(6px,  1.2vw, 14px);
          --radius:  clamp(4px,  0.5vw, 8px);
        }
        input[type=number] { font-size: var(--fs-sm) !important; }
        select             { font-size: var(--fs-sm) !important; }
        button             { font-size: var(--fs-sm) !important; }
      `}</style>
      <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600;700&family=Outfit:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet"/>

      <div style={{background:`linear-gradient(135deg,${C.deep} 0%,${C.green} 100%)`,padding:"var(--pad-y) var(--pad-x)",color:"#fff"}}>
        <svg width="150" height="22" viewBox="0 0 858 129" fill="none" xmlns="http://www.w3.org/2000/svg" style={{marginBottom:6,display:"block"}}>
          <path d="M118.195 54.8174L99.4083 36.0308L87.6003 48.4433L109.189 48.6508L101.063 60.1719L80.0357 59.9704L76.8303 59.9399L66.4815 59.8422V24.2839L77.453 16.7314V38.3448L89.8777 26.5002L71.1827 7.80524C66.1091 2.73159 57.8911 2.73159 52.8174 7.80524L34.0309 26.5918L46.4433 38.3998L46.6509 16.8108L58.1719 24.9372L57.9704 45.9644L57.9399 49.1698L57.8422 59.5186H22.2839L14.7314 48.547H36.3448L24.5002 36.1224L5.80524 54.8174C0.731587 59.891 0.731587 68.1151 5.80524 73.1826L24.5918 91.9692L36.3998 79.5567L14.8108 79.3492L22.9372 67.8281L43.9645 68.0296L47.1699 68.0601L57.5186 68.1578V103.716L46.5471 111.269V89.6552L34.1225 101.5L52.8174 120.195C57.8911 125.268 66.1091 125.268 71.1827 120.195L89.9692 101.408L77.5568 89.6002L77.3492 111.189L65.8282 103.063L66.0297 82.0356L66.0602 78.8302L66.1579 68.4814H101.716L109.269 79.453H87.6553L99.4999 91.8776L118.195 73.1826C123.269 68.109 123.269 59.891 118.195 54.8174Z" fill="white"/>
          <path d="M173.977 73.19C172.701 73.19 171.425 73.19 170.149 73.19C168.873 73.19 167.738 73.0482 166.604 72.9065V104.098H152V24.2759H175.111C178.939 24.2759 182.342 24.4177 185.178 24.843C188.014 25.2684 190.708 25.6937 192.976 26.4026C198.364 28.1039 202.618 30.7978 205.595 34.3423C208.573 38.0286 209.991 42.7073 209.991 48.3785C209.991 52.2066 209.14 55.7511 207.58 58.7284C206.021 61.8476 203.61 64.3996 200.633 66.5263C197.513 68.653 193.827 70.3544 189.432 71.4887C184.894 72.6229 179.79 73.19 173.977 73.19ZM166.604 60.5716C167.455 60.7134 168.447 60.7134 169.865 60.8551C171.141 60.8551 172.559 60.997 173.835 60.997C177.805 60.997 181.066 60.7134 183.76 60.0045C186.454 59.4374 188.581 58.4449 190.141 57.3106C191.842 56.1764 192.976 54.7586 193.685 53.1991C194.394 51.6395 194.819 49.7963 194.819 47.9532C194.819 45.5429 194.252 43.558 193.26 41.8567C192.126 40.1553 190.282 38.8793 187.588 37.8868C186.171 37.4615 184.469 37.0361 182.484 36.8943C180.499 36.6108 177.947 36.6108 174.969 36.6108H166.746V60.5716H166.604Z" fill="white"/>
          <path d="M277.197 48.237C277.197 53.7664 275.638 58.587 272.518 62.415C269.399 66.2431 264.72 69.2204 258.198 71.0636V71.3472L282.018 104.24H264.436L242.743 73.3321H232.676V104.24H218.072V24.418H242.318C246.288 24.418 250.116 24.7015 253.519 25.1269C256.922 25.5522 259.899 26.2611 262.451 27.2536C267.13 29.0967 270.817 31.6487 273.369 35.1932C275.921 38.4542 277.197 42.9912 277.197 48.237ZM239.907 60.9972C243.31 60.9972 246.146 60.8555 248.415 60.5719C250.683 60.2883 252.668 59.863 254.228 59.2959C257.205 58.1616 259.19 56.602 260.325 54.7589C261.459 52.7739 262.026 50.6472 262.026 48.0952C262.026 45.9685 261.601 43.9836 260.75 42.424C259.899 40.7226 258.34 39.4466 256.213 38.4542C254.795 37.7453 253.094 37.3199 250.967 37.0364C248.84 36.7528 246.288 36.611 243.168 36.611H232.676V61.139H239.907V60.9972Z" fill="white"/>
          <path d="M361.843 64.258C361.843 70.3545 360.992 75.8839 359.291 80.988C357.59 86.0921 355.037 90.4873 351.776 94.0318C348.515 97.7181 344.403 100.554 339.583 102.539C334.762 104.524 329.232 105.516 323.135 105.516C316.897 105.516 311.509 104.524 306.688 102.539C301.867 100.554 297.756 97.7181 294.495 94.0318C291.233 90.3455 288.681 85.9503 286.98 80.988C285.278 75.8839 284.428 70.3545 284.428 64.258C284.428 58.1614 285.278 52.632 286.98 47.5279C288.681 42.4239 291.233 38.0287 294.495 34.4842C297.756 30.7979 301.867 27.9623 306.688 25.9773C311.509 23.9924 317.039 23 323.135 23C329.374 23 334.762 23.9924 339.583 25.9773C344.403 27.9623 348.515 30.7979 351.776 34.4842C355.037 38.1704 357.59 42.5656 359.291 47.5279C360.992 52.4903 361.843 58.1614 361.843 64.258ZM346.672 64.258C346.672 59.4375 346.105 55.1841 344.829 51.4978C343.695 47.8115 341.993 44.8341 339.866 42.4238C337.739 40.0135 335.187 38.1704 332.352 37.0362C329.374 35.9019 326.255 35.1931 322.852 35.1931C319.449 35.1931 316.188 35.7602 313.352 37.0362C310.375 38.1704 307.964 40.0135 305.838 42.4238C303.711 44.8341 302.009 47.9533 300.875 51.4978C299.741 55.1841 299.032 59.4375 299.032 64.258C299.032 69.0785 299.599 73.3319 300.875 77.0182C302.009 80.7045 303.711 83.6819 305.838 86.0922C307.964 88.5024 310.516 90.3456 313.352 91.4798C316.188 92.7558 319.449 93.3229 322.852 93.3229C326.255 93.3229 329.516 92.7558 332.352 91.4798C335.187 90.2038 337.739 88.5024 339.866 86.0922C341.993 83.6819 343.695 80.7045 344.829 77.0182C346.105 73.3319 346.672 69.0785 346.672 64.258Z" fill="white"/>
          <path d="M411.043 82.6892C412.745 76.4509 415.013 69.6455 417.565 62.4147L431.319 24.134H451.878V103.956H437.274V63.4071C437.274 57.4524 437.557 50.6469 437.983 42.7072H437.415C436.706 44.9757 435.998 47.5277 435.005 50.3633C434.154 53.199 433.162 56.0345 432.169 58.7283L415.58 103.814H406.081L389.492 58.7283C388.499 56.0345 387.507 53.199 386.656 50.3633C385.805 47.5277 384.954 44.9757 384.245 42.7072H383.678C384.104 50.0798 384.387 56.8852 384.387 63.2653V103.814H369.783V23.9922H390.2L403.954 61.9893C406.222 68.3694 408.491 75.1748 410.476 82.4056H411.043V82.6892Z" fill="white"/>
          <path d="M496.683 105.658C492.571 105.658 488.743 105.232 485.34 104.382C481.937 103.531 479.102 102.397 476.549 100.837C473.997 99.2777 471.87 97.4346 470.027 95.1661C468.184 92.8976 466.766 90.4874 465.774 87.6518C464.923 85.3833 464.214 82.973 463.93 80.2792C463.505 77.5854 463.363 74.608 463.363 71.2053V24.1343H477.967V69.9293C477.967 75.6005 478.676 79.9956 479.952 83.1148C481.512 86.6593 483.639 89.2114 486.616 90.771C489.452 92.3305 492.997 93.1812 496.825 93.1812C500.795 93.1812 504.198 92.3305 507.034 90.771C509.869 89.2114 512.138 86.6593 513.697 83.1148C515.115 79.9956 515.683 75.4587 515.683 69.9293V24.1343H530.287V71.2053C530.287 74.608 530.145 77.5854 529.719 80.2792C529.294 82.973 528.727 85.5251 527.876 87.6518C526.742 90.4874 525.324 92.8976 523.481 95.1661C521.638 97.4346 519.511 99.2777 516.817 100.837C514.265 102.397 511.145 103.531 507.884 104.382C504.623 105.232 500.937 105.658 496.683 105.658Z" fill="white"/>
          <path d="M583.597 61.4223C589.269 69.6455 593.948 76.8763 597.634 83.1146H598.06C597.634 72.7647 597.351 65.1086 597.351 60.4298V24.2759H611.955V104.098H596.642L570.553 67.3771C566.016 60.997 561.195 53.6244 556.374 45.2593H555.807C556.233 55.0422 556.516 62.6983 556.516 67.9441V104.098H541.912V24.2759H557.225L583.597 61.4223Z" fill="white"/>
          <path d="M623.582 104.098V24.2759H644.708C646.551 24.2759 648.536 24.2759 650.38 24.4177C652.365 24.5595 654.208 24.7012 656.051 24.9848C657.894 25.2683 659.596 25.552 661.297 25.8355C662.999 26.1191 664.558 26.5444 665.976 27.1115C670.23 28.5293 674.058 30.2307 677.319 32.6409C680.58 34.9094 683.274 37.745 685.543 40.8642C687.811 43.9833 689.371 47.5279 690.505 51.3559C691.64 55.184 692.207 59.4374 692.207 63.9743C692.207 68.2277 691.781 72.3394 690.789 76.0256C689.796 79.8537 688.378 83.2564 686.393 86.3756C684.408 89.4947 681.998 92.1886 679.021 94.5989C676.043 97.0092 672.498 98.8523 668.528 100.412C665.125 101.688 661.297 102.68 657.044 103.247C652.79 103.956 647.969 104.24 642.581 104.24H623.582V104.098ZM644.283 91.905C652.79 91.905 659.596 90.7708 664.417 88.3605C668.67 86.2338 671.931 83.2564 674.058 79.1448C676.185 75.175 677.319 69.9291 677.319 63.6907C677.319 60.4298 676.894 57.4525 676.185 54.9004C675.476 52.2066 674.483 49.9381 673.066 47.9532C671.648 45.9683 670.088 44.1251 668.103 42.7073C666.118 41.2895 663.991 40.0135 661.581 39.0211C659.312 38.1704 656.76 37.4615 654.066 37.1779C651.23 36.7526 648.111 36.6108 644.708 36.6108H638.328V91.905H644.283Z" fill="white"/>
          <path d="M700.43 104.098V24.2759H715.034V104.098H700.43Z" fill="white"/>
          <path d="M772.6 83.8238H742.541L734.743 104.24H719.146L750.907 24.418H764.235L795.995 104.24H780.54L772.6 83.8238ZM757.429 43.4165C754.593 51.7815 752.183 58.7287 749.914 64.3999L747.22 71.4889H767.921L765.227 64.3999C763.1 58.7287 760.548 51.7815 757.712 43.4165H757.429Z" fill="white"/>
          <path d="M814.569 24.2759V91.905H852.001V104.098H799.965V24.2759H814.569Z" fill="white"/>
        </svg>
        <div style={{fontFamily:"var(--serif)",fontSize:"var(--fs-lg)",fontWeight:700}}>Simulador Monte Carlo — Venta Autos Nuevos</div>
        <div style={{fontSize:"var(--fs-xs)",opacity:.7,letterSpacing:1.5,textTransform:"uppercase"}}>Funnel Comercial · Inventario · Goal-Seeking</div>
      </div>

      <div style={{padding:"var(--pad-y) var(--pad-x) 36px",maxWidth:960,margin:"0 auto"}}>
        <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:8,flexWrap:"wrap"}}>
          <button onClick={handleRun} disabled={running} style={{padding:"8px 18px",borderRadius:4,border:"none",cursor:"pointer",background:running?C.muted:`linear-gradient(135deg,${C.green},${C.deep})`,color:"#fff",fontSize:"var(--fs-sm)",fontWeight:600}}>{running?"⏳...":"▶ Simular"}</button>
          <button onClick={handleGS} disabled={gsRunning} style={{padding:"8px 18px",borderRadius:4,border:"none",cursor:"pointer",background:gsRunning?C.muted:`linear-gradient(135deg,${C.gold},${C.orange})`,color:"#fff",fontSize:"var(--fs-sm)",fontWeight:600}}>{gsRunning?"⏳...":"🎯 Goal-Seek"}</button>
          <select value={numSims} onChange={e=>setNumSims(+e.target.value)} style={{...inpS,width:70}}>{[1000,3000,5000].map(n=><option key={n} value={n}>{n}</option>)}</select>
          <button onClick={()=>{
            setParams(p=>{const n={};Object.entries(p).forEach(([k,v])=>{n[k]={...v,std:0};});paramsRef.current=n;return n;});
            syncSetMix(prev=>prev.map(c=>({...c,mix_std:0,desc_std:0})));
          }} style={{padding:"8px 12px",borderRadius:4,border:`1px solid ${C.border}`,cursor:"pointer",background:C.light,color:C.muted,fontSize:"var(--fs-sm)",fontWeight:500}} title="Pone todas las desviaciones estándar en 0 — modo determinístico para validar fórmulas">
            σ = 0
          </button>
        </div>

        <div style={{display:"flex",gap:0,marginBottom:8}}>
          {tabs.map((t,i)=>(<button key={t.k} onClick={()=>setTab(t.k)} style={{flex:1,padding:"8px 2px",fontSize:"var(--fs-xs)",fontWeight:tab===t.k?600:400,background:tab===t.k?C.card:"transparent",color:tab===t.k?C.deep:C.muted,border:`1px solid ${C.border}`,borderBottom:tab===t.k?`2px solid ${C.gold}`:`1px solid ${C.border}`,borderRadius:i===0?"5px 0 0 0":i===tabs.length-1?"0 5px 0 0":0,cursor:"pointer"}}>{t.l}</button>))}
        </div>

        {/* ═══ SUPUESTOS ═══ */}
        {tab==="supuestos"&&(<div>
          {Object.entries(GC).map(([gk,gc])=>{
            const keys=Object.entries(PD).filter(([,v])=>v.group===gk).map(([k])=>k);
            if(!keys.length)return null;
            return(<Section key={gk} title={gc.t} icon={gc.i} color={gc.c} defaultOpen={["funnel","precio","prod"].includes(gk)}>
              {keys.map(k=><PI key={k} k={k} p={PD[k]} val={params[k]} onChange={chg} hl={gsLevers[k]}/>)}
              {gk==="prod"&&(()=>{
                const demanda = Math.round((params.leads_mes?.mean||400) * (params.tasa_conversion?.mean||11)/100 * (1 - (params.devoluciones?.mean||8)/100));
                const capacidad = Math.round((params.vendedores_fte?.mean||8) * (params.productividad?.mean||8));
                const cuello = demanda > capacidad;
                const utilizacion = capacidad > 0 ? Math.min(100, (demanda/capacidad)*100) : 0;
                return(
                  <div style={{marginTop:6,padding:"7px 10px",borderRadius:4,
                    background:cuello?`${C.red}12`:`${C.green}12`,
                    border:`1px solid ${cuello?C.red:C.green}40`}}>
                    <div style={{display:"flex",gap:16,flexWrap:"wrap",marginBottom:4}}>
                      {[
                        {l:"Demanda potencial/mes",   v:demanda,    u:"u"},
                        {l:"Capacidad máx/mes",       v:capacidad,  u:"u"},
                        {l:"Utilización F.V.",        v:utilizacion.toFixed(0), u:"%"},
                      ].map(x=>(
                        <div key={x.l}>
                          <div style={{fontSize:"var(--fs-xs)",color:C.muted}}>{x.l}</div>
                          <div style={{fontSize:"var(--fs-sm)",fontWeight:700,fontFamily:"var(--mono)",
                            color:x.u==="%"?(utilizacion>=90?C.red:utilizacion>=70?C.gold:C.green):C.deep}}>
                            {x.v}{x.u}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div style={{fontSize:"var(--fs-xs)",color:cuello?C.red:C.green,fontWeight:600}}>
                      {cuello
                        ? `⚠ Cuello de botella: se pierden ~${demanda-capacidad} prospectos/mes por falta de capacidad`
                        : `✓ Capacidad suficiente — ${(capacidad-demanda)} unidades de holgura/mes`}
                    </div>
                  </div>
                );
              })()}
              {gk==="precio"&&(
                <>
                  <MixTable mix={mix} setMix={syncSetMix}/>
                  {(()=>{
                    const mb=params.margen_bruto_pct?.mean||0;
                    const descGlobal=params.descuento_pct?.mean||0;
                    const descMix=descuentoMixMedio(mix);
                    const descEfectivo=Math.max(descGlobal,descMix);
                    const real=mb-descEfectivo;
                    return(
                      <div style={{marginTop:6,padding:"7px 10px",borderRadius:4,
                        background:real<0?"#B3404020":real<3?"#D4772C20":"#1A5C3820",
                        border:`1px solid ${real<0?C.red:real<3?C.orange:C.green}50`}}>
                        <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                          <span style={{fontSize:"var(--fs-xs)",color:C.muted,fontFamily:"var(--mono)"}}>
                            Margen bruto = {mb.toFixed(1)}%
                          </span>
                          <span style={{fontSize:"var(--fs-xs)",color:C.muted}}>−</span>
                          <span style={{fontSize:"var(--fs-xs)",color:C.orange,fontFamily:"var(--mono)"}}>
                            {descEfectivo.toFixed(2)}% desc. efectivo
                          </span>
                          <span style={{fontSize:"var(--fs-xs)",color:C.muted}}>=</span>
                          <span style={{fontSize:"var(--fs-sm)",fontWeight:700,fontFamily:"var(--mono)",
                            color:real<0?C.red:real<3?C.orange:C.green}}>
                            {real.toFixed(2)}% {real<0?"⚠ VENTA BAJO COSTO":real<3?"⚠ margen ajustado":"✓ margen OK"}
                          </span>
                        </div>
                        <div style={{fontSize:"var(--fs-xs)",color:C.muted,marginTop:3,fontFamily:"var(--mono)"}}>
                          Desc. global param: {descGlobal.toFixed(1)}% · Desc. ponderado mix: {descMix.toFixed(2)}% · Efectivo: max({descGlobal.toFixed(1)}%, {descMix.toFixed(2)}%) = {descEfectivo.toFixed(2)}%
                        </div>
                      </div>
                    );
                  })()}
                </>
              )}
            </Section>);
          })}
        </div>)}

        {/* ═══ GOAL-SEEKING ═══ */}
        {tab==="goalseeking"&&(<div>
          <div style={{background:C.card,borderRadius:6,padding:10,border:`1px solid ${C.border}`,marginBottom:8,borderTop:`3px solid ${C.gold}`}}>
            <div style={{fontFamily:"var(--serif)",fontSize:"var(--fs-md)",fontWeight:700,color:C.deep,marginBottom:6}}>🎯 Meta de Ventas</div>
            <div style={{display:"flex",gap:6,marginBottom:6,flexWrap:"wrap",alignItems:"flex-end"}}>
              <div>
                <div style={{fontSize:"var(--fs-xs)",color:C.muted,textTransform:"uppercase",letterSpacing:1,marginBottom:1}}>Métrica</div>
                <select value={gsMetric} onChange={e=>setGsMetric(e.target.value)} style={{...inpS,width:100}}>
                  <option value="eva">EVA</option><option value="ebitda">EBITDA</option><option value="ebit">EBIT</option><option value="utilidadNeta">Ut. Neta</option>
                </select>
              </div>
              <div>
                <div style={{fontSize:"var(--fs-xs)",color:C.muted,textTransform:"uppercase",letterSpacing:1,marginBottom:1}}>Meta USD/año</div>
                <input type="number" value={gsTarget} onChange={e=>setGsTarget(parseFloat(e.target.value)||0)} style={{...inpS,width:95}}/>
              </div>
              <div>
                <div style={{fontSize:"var(--fs-xs)",color:C.muted,textTransform:"uppercase",letterSpacing:1,marginBottom:1}}>Confianza</div>
                <select value={gsConf} onChange={e=>setGsConf(+e.target.value)} style={{...inpS,width:55}}>{[50,60,70,80,90].map(n=><option key={n} value={n}>{n}%</option>)}</select>
              </div>
            </div>
            <div style={{fontSize:"var(--fs-sm)",fontWeight:600,color:C.deep,marginBottom:4}}>Palancas</div>
            {Object.entries(GC).filter(([gk])=>Object.keys(PD).some(k=>PD[k].group===gk&&PD[k].lever)).map(([gk,gc])=>{
              const keys=Object.entries(PD).filter(([,v])=>v.group===gk&&v.lever).map(([k])=>k);
              if(!keys.length)return null;
              return(<div key={gk} style={{marginBottom:3}}>
                <div style={{fontSize:"var(--fs-xs)",fontWeight:600,color:gc.c}}>{gc.i} {gc.t}</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:2}}>
                  {keys.map(k=>(<button key={k} onClick={()=>setGsLevers(p=>({...p,[k]:!p[k]}))} style={{padding:"2px 5px",borderRadius:3,fontSize:"var(--fs-xs)",fontFamily:"var(--mono)",border:`1px solid ${gsLevers[k]?C.gold:C.border}`,cursor:"pointer",background:gsLevers[k]?`${C.gold}20`:"transparent",color:gsLevers[k]?C.deep:C.muted}}>
                    {PD[k].dir===1?"↑ ":PD[k].dir===-1?"↓ ":""}{PD[k].label}
                  </button>))}
                </div>
              </div>);
            })}
            {/* Mix de categorías como palancas */}
            <div style={{marginBottom:3}}>
              <div style={{fontSize:"var(--fs-xs)",fontWeight:600,color:C.green}}>🚗 Mix de Categorías (% participación)</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:2,marginTop:2}}>
                {mix.map(c=>(
                  <button key={c.cat} onClick={()=>setGsMixLevers(p=>({...p,[c.cat]:!p[c.cat]}))}
                    style={{padding:"2px 5px",borderRadius:3,fontSize:"var(--fs-xs)",fontFamily:"var(--mono)",
                      border:`1px solid ${gsMixLevers[c.cat]?C.green:C.border}`,cursor:"pointer",
                      background:gsMixLevers[c.cat]?`${C.green}20`:"transparent",
                      color:gsMixLevers[c.cat]?C.deep:C.muted}}>
                    {c.cat} ({c.mix_pct.toFixed(0)}%)
                  </button>
                ))}
              </div>
              <div style={{fontSize:"var(--fs-xs)",color:C.muted,marginTop:3}}>
                El algoritmo ajustará el % de estas categorías para maximizar el precio ponderado hacia la meta.
              </div>
            </div>
          </div>
          {gsResult&&(
            <div style={{background:C.card,borderRadius:6,border:`1px solid ${C.border}`,marginBottom:8,overflow:"hidden"}}>
              <div style={{padding:"10px 12px",background:gsResult.ok?`linear-gradient(135deg,${C.green},${C.deep})`:`linear-gradient(135deg,${C.orange},${C.red})`,color:"#fff"}}>
                <div style={{fontSize:"var(--fs-md)",fontWeight:700}}>{gsResult.ok?"✅ Meta Alcanzable":"⚠️ Meta Difícil"}</div>
                <div style={{fontSize:"var(--fs-sm)",fontFamily:"var(--mono)",opacity:.9,marginTop:2}}>{gsMetric.toUpperCase()} objetivo: ${fmtF(gsTarget)} → Logrado: ${fmtF(Math.round(gsResult.final))} ({gsConf}% confianza)</div>
              </div>
              <div style={{padding:"10px"}}>
                <div style={{fontFamily:"var(--serif)",fontSize:"var(--fs-lg)",fontWeight:700,color:C.deep,marginBottom:6}}>Objetivos KPI</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 65px 65px 50px",gap:2,padding:"5px 6px",background:C.deep,borderRadius:"4px 4px 0 0",color:"#fff",fontFamily:"var(--mono)",fontSize:"var(--fs-xs)",fontWeight:600}}>
                  <div>KPI</div><div style={{textAlign:"center"}}>ACTUAL</div><div style={{textAlign:"center"}}>OBJETIVO</div><div style={{textAlign:"center"}}>DELTA</div>
                </div>
                {leverChanges.map((ch,idx)=>{
                  const up=ch.p>0;const good=up;
                  const fmtVal=(v,u)=>{if(u==="%")return v.toFixed(1)+"%";if(u==="$")return"$"+fmtF(Math.round(v));return Math.round(v)+(u?" "+u:"");};
                  return(
                    <div key={ch.k} style={{display:"grid",gridTemplateColumns:"1fr 65px 65px 50px",gap:2,padding:"6px",alignItems:"center",background:idx%2===0?C.light:C.card,borderBottom:`1px solid ${C.border}`}}>
                      <div style={{fontSize:"var(--fs-sm)",fontWeight:500}}>{ch.label}</div>
                      <div style={{textAlign:"center",fontFamily:"var(--mono)",fontSize:"var(--fs-sm)",color:C.muted}}>{fmtVal(ch.o,ch.unit)}</div>
                      <div style={{textAlign:"center",fontFamily:"var(--mono)",fontSize:"var(--fs-sm)",fontWeight:700,color:good?C.green:C.orange,background:good?`${C.green}12`:`${C.orange}12`,borderRadius:3,padding:"2px 4px"}}>{fmtVal(ch.n,ch.unit)}</div>
                      <div style={{textAlign:"center",fontFamily:"var(--mono)",fontSize:"var(--fs-xs)",fontWeight:600,color:good?C.green:C.orange}}>{up?"▲":"▼"} {Math.abs(ch.p).toFixed(1)}%</div>
                    </div>);
                })}
              </div>
            </div>
          )}
          {stats&&(
            <div style={{background:C.card,borderRadius:6,padding:10,border:`1px solid ${C.border}`}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:5,marginBottom:6}}>
                {[{l:"EBITDA",s:stats.ebitda,c:C.green},{l:"EVA",s:stats.eva,c:stats.eva.p50>=0?C.gold:C.red},{l:"UNID/AÑO",s:stats.uVN,c:C.blue,noD:true},{l:"COSTO ADQ/U",s:stats.costoAdq,c:C.orange}].map(x=>(
                  <div key={x.l} style={{background:C.light,borderRadius:4,padding:"5px 7px",borderLeft:`3px solid ${x.c}`}}>
                    <div style={{fontSize:"var(--fs-xs)",textTransform:"uppercase",letterSpacing:1.5,color:C.muted}}>{x.l}</div>
                    <div style={{fontFamily:"var(--mono)",fontSize:"var(--fs-md)",fontWeight:500,color:x.c}}>{x.noD?Math.round(x.s.p50).toLocaleString():"$"+fmt(x.s.p50)}</div>
                  </div>
                ))}
              </div>
              <Histo values={stats.eva.values} color={C.gold} label="EVA" target={gsMetric==="eva"?gsTarget:undefined}/>
              <Histo values={stats.ebitda.values} color={C.green} label="EBITDA" target={gsMetric==="ebitda"?gsTarget:undefined}/>
            </div>
          )}
        </div>)}

        {/* ═══ RESULTS ═══ */}
        {tab==="results"&&stats&&(<div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:5,marginBottom:6}}>
            {[{l:"EBITDA",s:stats.ebitda,c:C.green},{l:"EBIT",s:stats.ebit,c:C.blue},{l:"UT.NETA",s:stats.utilidadNeta,c:C.deep},{l:"EVA",s:stats.eva,c:stats.eva.p50>=0?C.gold:C.red}].map(x=>(
              <div key={x.l} style={{background:C.card,borderRadius:5,padding:"7px",border:`1px solid ${C.border}`,borderLeft:`3px solid ${x.c}`}}>
                <div style={{fontSize:"var(--fs-xs)",textTransform:"uppercase",letterSpacing:1.5,color:C.muted}}>{x.l}</div>
                <div style={{fontFamily:"var(--mono)",fontSize:"var(--fs-lg)",fontWeight:500,color:x.c}}>${fmt(x.s.p50)}</div>
                <div style={{fontSize:"var(--fs-xs)",fontFamily:"var(--mono)",color:C.muted}}>P10 ${fmt(x.s.p10)} · P90 ${fmt(x.s.p90)}</div>
              </div>
            ))}
          </div>

          {/* Operational KPIs */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4,marginBottom:6}}>
            {[
              {l:"UNIDADES/AÑO",      v:Math.round(stats.uVN.p50).toLocaleString(),                        c:C.green},
              {l:"PRECIO POND. P50",  v:"$"+fmt(stats.precioListaSim?.p50||precioListaMedio(mix)),         c:C.deep},
              {l:"MARGEN REAL %",     v:(stats.margenRealPct?.p50||0).toFixed(1)+"%",                      c:stats.margenRealPct?.p50>=0?C.green:C.red},
              {l:"UTILIZACIÓN F.V.",  v:((stats.utilizacion?.p50||0)*100).toFixed(1)+"%",                  c:(stats.utilizacion?.p50||0)>=0.9?C.red:(stats.utilizacion?.p50||0)>=0.7?C.gold:C.green},
              {l:"PROSP. PERDIDOS/M", v:Math.round(stats.prospectosPerdidos?.p50||0).toLocaleString(),     c:(stats.prospectosPerdidos?.p50||0)>0?C.red:C.green},
              {l:"INV. PROM/MES",     v:Math.round(stats.invPromedio.p50).toLocaleString()+"u",            c:C.gold},
              {l:"COSTO ADQ/U",       v:"$"+fmt(stats.costoAdq.p50),                                      c:C.orange},
            ].map(x=>(
              <div key={x.l} style={{background:C.card,borderRadius:4,padding:"5px 6px",border:`1px solid ${C.border}`,borderTop:`2px solid ${x.c}`}}>
                <div style={{fontSize:"var(--fs-xs)",textTransform:"uppercase",letterSpacing:1,color:C.muted}}>{x.l}</div>
                <div style={{fontFamily:"var(--mono)",fontSize:"var(--fs-md)",fontWeight:500,color:x.c}}>{x.v}</div>
              </div>
            ))}
          </div>

          {/* P&L */}
          <div style={{background:C.card,borderRadius:6,padding:10,border:`1px solid ${C.border}`,marginBottom:6}}>
            {resultsStale&&(
            <div style={{background:`${C.orange}18`,border:`1px solid ${C.orange}60`,borderRadius:5,padding:"7px 10px",marginBottom:8,display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:"var(--fs-md)"}}>⚠️</span>
              <span style={{fontSize:"var(--fs-xs)",fontFamily:"var(--mono)",color:C.orange,fontWeight:600}}>
                Los supuestos cambiaron desde la última simulación. Presiona ▶ Simular para actualizar los resultados.
              </span>
            </div>
          )}
          {resultsStale&&(
            <div style={{background:"#D4772C18",border:"1px solid #D4772C60",borderRadius:5,padding:"7px 10px",marginBottom:8,display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:"var(--fs-md)"}}>⚠️</span>
              <span style={{fontSize:"var(--fs-xs)",fontFamily:"var(--mono)",color:"#D4772C",fontWeight:600}}>
                Los supuestos cambiaron desde la última simulación. Presiona ▶ Simular para actualizar los resultados.
              </span>
            </div>
          )}
          <div style={{fontFamily:"var(--serif)",fontSize:"var(--fs-md)",fontWeight:700,color:C.deep,marginBottom:4}}>P&L VN — Mediana Anual</div>
            {[
              {l:"INGRESOS BRUTOS",             v:stats.ingVN.p50,                                    b:1,c:C.deep},
              {l:"  Precio lista × unidades",   v:stats.ingVN.p50,                                    c:C.muted, indent:true},
              {l:"(-) Descuentos",              v:stats.descTotal?-stats.descTotal.p50:0,              c:C.red},
              {l:"= INGRESOS NETOS",            v:stats.ingTotal.p50,                                 b:1,c:C.deep,t:1},
              {l:"(-) COGS",                    v:-(stats.cogs?.p50||0),                              c:C.muted},
              {l:"= MARGEN BRUTO",              v:stats.margenBruto.p50,                              b:1,c:C.green,t:1},
              {l:"(-) GASTOS COMERCIALES",      v:-stats.gastosComerciales.p50,                       b:1,c:C.red,t:1},
              {l:"(-) GASTOS ADMIN/G&A",        v:-stats.gastosAdmin.p50,                             c:C.red},
              {l:"= EBITDA",                    v:stats.ebitda.p50,                                   b:1,c:C.green,t:1},
              {l:"(-) D&A",                     v:-stats.da.p50,                                      c:C.muted},
              {l:"= EBIT",                      v:stats.ebit.p50,                                     b:1,c:C.blue,t:1},
              {l:"(-) Floor Plan (costo financiero inventario)", v:-stats.floorPlan.p50,              c:C.orange},
              {l:"= EBT  (base imponible)",      v:(stats.ebt?.p50||0),                               b:1,c:C.blue,t:1},
              {l:`(-) IR ${params.tasa_imp.mean}%`, v:-(stats.irAnual?.p50||0),                        c:C.muted},
              {l:"= UTILIDAD NETA",             v:stats.utilidadNeta.p50,                             b:1,c:C.deep,t:1},
              {l:"(-) Cargo capital (Capital × WACC)", v:-(stats.capitalNeto?.p50||0)*(params.wacc.mean/100), c:C.red},
              {l:"(+) Downpayments en cartera", v:stats.downpaymentsCartera?.p50||0,                  c:C.teal},
              {l:"  Capital neto (base WACC)",  v:stats.capitalNeto?.p50||0,                          c:C.muted,indent:true},
              {l:"= EVA  [NOPAT − Capital×WACC]",v:stats.eva.p50,                                    b:1,c:stats.eva.p50>=0?C.gold:C.red,t:1},
            ].map((r,i)=>(
              <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"2px 0",fontFamily:"var(--mono)",fontSize:r.indent?"var(--fs-xs)":"var(--fs-sm)",fontWeight:r.b?600:400,borderTop:r.t?`1px solid ${C.border}`:"none",marginLeft:r.indent?12:0,opacity:r.indent?0.75:1}}>
                <span style={{color:r.indent?C.muted:C.text}}>{r.l}</span><span style={{color:r.c}}>${fmtF(Math.round(r.v))}</span>
              </div>
            ))}
          </div>

          <div style={{background:C.card,borderRadius:6,padding:10,border:`1px solid ${C.border}`}}>
            <Histo values={stats.ebitda.values} color={C.green} label="EBITDA"/>
            <Histo values={stats.eva.values} color={C.gold} label="EVA"/>
            <Histo values={stats.uVN.values} color={C.blue} label="Unidades VN / año"/>
          </div>
        </div>)}
        {tab==="results"&&!stats&&(
          <div style={{background:C.card,borderRadius:6,padding:"24px 12px",textAlign:"center",border:`1px solid ${C.border}`,color:C.muted,fontSize:"var(--fs-sm)"}}>Presiona ▶ Simular o 🎯 Goal-Seek.</div>
        )}

        {/* ═══ TORNADO ═══ */}
        {tab==="sensitivity"&&(
          <div style={{background:C.card,borderRadius:6,padding:10,border:`1px solid ${C.border}`}}>
            <div style={{fontFamily:"var(--serif)",fontSize:"var(--fs-md)",fontWeight:700,color:C.deep,marginBottom:4}}>Tornado — Sensibilidad +10%</div>
            <div style={{display:"flex",gap:3,marginBottom:8,flexWrap:"wrap"}}>
              {["eva","ebitda","ebit","utilidadNeta"].map(t=>(
                <button key={t} onClick={()=>setSensTarget(t)} style={{padding:"2px 7px",borderRadius:3,fontSize:"var(--fs-xs)",fontFamily:"var(--mono)",border:`1px solid ${sensTarget===t?C.gold:C.border}`,background:sensTarget===t?`${C.gold}20`:"transparent",color:sensTarget===t?C.deep:C.muted,cursor:"pointer"}}>{t==="utilidadNeta"?"Ut.Neta":t.toUpperCase()}</button>
              ))}
            </div>
            {sortedSens.length>0?sortedSens.map(([k,val])=>{
              const mx=Math.max(...sortedSens.map(s=>Math.abs(s[1])));
              const pw=Math.abs(val)/mx*100;const ps=val>=0;
              return(
                <div key={k} style={{display:"flex",alignItems:"center",gap:4,marginBottom:3}}>
                  <div style={{width:"clamp(120px,18vw,180px)",fontSize:"var(--fs-xs)",fontFamily:"var(--mono)",color:C.text,textAlign:"right",flexShrink:0,lineHeight:1.1}}>{params[k]?.label||k}</div>
                  <div style={{flex:1,height:10,background:"#F0ECE6",borderRadius:2,position:"relative"}}>
                    <div style={{position:"absolute",left:ps?"50%":`${50-pw/2}%`,width:`${pw/2}%`,height:"100%",background:ps?C.green:C.red,borderRadius:2,opacity:.6}}/>
                    <div style={{position:"absolute",left:"50%",top:0,bottom:0,width:1,background:C.muted,opacity:.25}}/>
                  </div>
                  <div style={{width:"clamp(40px,6vw,60px)",fontSize:"var(--fs-xs)",fontFamily:"var(--mono)",color:ps?C.green:C.red,flexShrink:0}}>{ps?"+":""}{fmt(val)}</div>
                </div>);
            }):(
              <div style={{textAlign:"center",padding:14,fontSize:"var(--fs-sm)",color:C.muted}}>Ejecuta simulación primero.</div>
            )}
          </div>
        )}


        <div style={{marginTop:12,textAlign:"center",fontSize:"var(--fs-xs)",color:C.muted}}>© Promundial Consulting Group · Monte Carlo VN · EVA = NOPAT − Capital×WACC</div>
      </div>
    </div>
  );
}

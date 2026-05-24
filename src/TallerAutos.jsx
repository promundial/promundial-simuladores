import { useState, useCallback, useMemo, useRef } from "react";

// ═══════════════════════════════════════════════════════════════════════
// SIMULADOR MONTE CARLO — TALLER DE SERVICIOS Y REPUESTOS
// Modelo causal completo + Goal-Seeking inverso
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
  // ║  CAPACIDAD — Bahías, Asesores, Tiempos                   ║
  // ╚═══════════════════════════════════════════════════════════╝
  bahias:           {mean:12,std:1,min:4,max:25,label:"Bahías disponibles",unit:"u",group:"cap",lever:false},
  dias_op:          {mean:24,std:1,min:20,max:26,label:"Días operativos / mes",unit:"d",group:"cap",lever:false},
  util_pct:         {mean:75,std:8,min:40,max:95,label:"Utilización bahías %",unit:"%",group:"cap",lever:true},
  hrs_std_ot:       {mean:2.5,std:0.4,min:1,max:6,label:"Hrs estándar por OT",unit:"h",group:"cap",lever:false},
  tiempo_muerto:    {mean:20,std:5,min:5,max:45,label:"Tiempo muerto bahía %",unit:"%",group:"cap",lever:true},
  asesores:         {mean:3,std:0.5,min:1,max:6,label:"Asesores de servicio",unit:"u",group:"cap",lever:false},
  ot_por_asesor:    {mean:8,std:1,min:4,max:14,label:"OTs por asesor por día",unit:"u",group:"cap",lever:true},
  no_show:          {mean:12,std:3,min:2,max:30,label:"No-show / cancelación %",unit:"%",group:"cap",lever:true},

  // ╔═══════════════════════════════════════════════════════════╗
  // ║  PRODUCTIVIDAD TÉCNICOS                                  ║
  // ╚═══════════════════════════════════════════════════════════╝
  tecnicos:         {mean:15,std:2,min:5,max:30,label:"Técnicos (planilla)",unit:"u",group:"tech",lever:false},
  hrs_disp:         {mean:8,std:0.3,min:7,max:9,label:"Hrs disponibles / técnico / día",unit:"h",group:"tech",lever:false},
  eficiencia:       {mean:85,std:6,min:60,max:110,label:"Eficiencia % (hrs fact / disp)",unit:"%",group:"tech",lever:true},
  productividad:    {mean:92,std:5,min:70,max:105,label:"Productividad % (rapidez vs estándar)",unit:"%",group:"tech",lever:true},
  tarifa_hr:        {mean:35,std:5,min:18,max:65,label:"Tarifa hora MO",unit:"$",group:"tech",lever:true},

  // ╔═══════════════════════════════════════════════════════════╗
  // ║  REPUESTOS Y VENTA ADICIONAL                             ║
  // ╚═══════════════════════════════════════════════════════════╝
  ratio_rep:        {mean:0.85,std:0.1,min:0.4,max:1.5,label:"Ratio repuestos / MO ($)",unit:"x",group:"margen",lever:true},
  margen_mo:        {mean:65,std:5,min:45,max:80,label:"Margen mano de obra %",unit:"%",group:"margen",lever:false},
  margen_rep:       {mean:35,std:4,min:20,max:50,label:"Margen repuestos %",unit:"%",group:"margen",lever:false},
  venta_adic_pct:   {mean:25,std:6,min:5,max:55,label:"% OTs con venta adicional",unit:"%",group:"margen",lever:true},
  ticket_adic:      {mean:120,std:30,min:40,max:350,label:"Ticket promedio venta adicional",unit:"$",group:"margen",lever:true},

  // ╔═══════════════════════════════════════════════════════════╗
  // ║  RETENCIÓN Y DEMANDA                                     ║
  // ╚═══════════════════════════════════════════════════════════╝
  retencion:        {mean:45,std:8,min:20,max:75,label:"Retención clientes %",unit:"%",group:"demanda",lever:true},
  clientes_ext:     {mean:300,std:50,min:100,max:600,label:"Clientes externos nuevos / mes",unit:"u",group:"demanda",lever:true},
  clientes_parque:  {mean:200,std:30,min:50,max:500,label:"Clientes del parque (VN previos) / mes",unit:"u",group:"demanda",lever:true},

  // ╔═══════════════════════════════════════════════════════════╗
  // ║  COSTOS DE PERSONAL Y FIJOS                              ║
  // ╚═══════════════════════════════════════════════════════════╝
  sueldo_tec:       {mean:900,std:100,min:500,max:1600,label:"Sueldo técnico / mes",unit:"$",group:"costos",lever:false},
  sueldo_asesor:    {mean:1000,std:150,min:600,max:1800,label:"Sueldo asesor / mes",unit:"$",group:"costos",lever:false},
  jefe_taller:      {mean:2500,std:300,min:1500,max:5000,label:"Sueldo jefe taller / mes",unit:"$",group:"costos",lever:false},
  gastos_fijos:     {mean:8000,std:1500,min:3000,max:20000,label:"Otros gastos fijos / mes",unit:"$",group:"costos",lever:false},

  // ╔═══════════════════════════════════════════════════════════╗
  // ║  OVERHEAD ASIGNADO Y D&A                                 ║
  // ╚═══════════════════════════════════════════════════════════╝
  overhead_asignado:{mean:25000,std:3000,min:10000,max:50000,label:"Overhead asignado al taller / mes",unit:"$",group:"overhead",lever:false},
  deprec_equipos:   {mean:3000,std:500,min:500,max:8000,label:"Depreciación equipos taller / mes",unit:"$",group:"overhead",lever:false},
  amort_software:   {mean:800,std:200,min:0,max:3000,label:"Amortización DMS/software / mes",unit:"$",group:"overhead",lever:false},

  // ╔═══════════════════════════════════════════════════════════╗
  // ║  EVA                                                     ║
  // ╚═══════════════════════════════════════════════════════════╝
  tasa_imp:         {mean:30,std:0,min:30,max:30,label:"Tasa impositiva % (IR)",unit:"%",group:"eva_p",lever:false},
  capital_taller:   {mean:500000,std:50000,min:200000,max:1200000,label:"Capital invertido taller",unit:"$",group:"eva_p",lever:false},
  wacc:             {mean:12,std:1.5,min:8,max:18,label:"WACC %",unit:"%",group:"eva_p",lever:false},
};

function randn(){let u=0,v=0;while(!u)u=Math.random();while(!v)v=Math.random();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);}
function S(p){return Math.max(p.min,Math.min(p.max,p.mean+randn()*p.std));}
function pctle(a,p){const s=[...a].sort((x,y)=>x-y);return s[Math.max(0,Math.ceil(s.length*p/100)-1)];}
function avg(a){return a.reduce((x,y)=>x+y,0)/a.length;}
const fmt=v=>{if(Math.abs(v)>=1e6)return(v/1e6).toFixed(2)+"M";if(Math.abs(v)>=1e3)return(v/1e3).toFixed(1)+"K";return v.toFixed(0);};
const fmtF=v=>new Intl.NumberFormat("en-US",{maximumFractionDigits:0}).format(v);

// ═══ SIMULATION ═══
function simOnce(P){
  let tIngMO=0,tIngRep=0,tIngAdic=0,tMgMO=0,tMgRep=0;
  let tGTec=0,tGAses=0,tGJefe=0,tGFijo=0,tOverhead=0,tDA=0;
  let tOTs=0,tHrsFact=0,tRotBahia=0;

  for(let m=0;m<12;m++){
    const bahias=Math.round(S(P.bahias));
    const diasOp=Math.round(S(P.dias_op));
    const utilB=S(P.util_pct)/100;
    const hrsStdOT=S(P.hrs_std_ot);
    const tiempoMuerto=S(P.tiempo_muerto)/100;
    const tecs=Math.round(S(P.tecnicos));
    const hrsD=S(P.hrs_disp);
    const efic=S(P.eficiencia)/100;
    const prodTec=S(P.productividad)/100;

    // Rotación bahía derivada de productividad técnico
    const hrsTrabajoReal=hrsStdOT/prodTec;
    const hrsTotalEnBahia=hrsTrabajoReal/(1-tiempoMuerto);
    const rotBahia=hrsD/hrsTotalEnBahia;
    tRotBahia+=rotBahia;

    // 3 cuellos de botella
    const OTsCap=Math.round(bahias*utilB*rotBahia*diasOp);
    const hrsFactMes=tecs*hrsD*diasOp*efic;
    tHrsFact+=hrsFactMes;
    const OTsTec=Math.floor(hrsFactMes/hrsStdOT);
    const asesores=Math.round(S(P.asesores));
    const otPorAsesor=S(P.ot_por_asesor);
    const OTsAsesor=Math.round(asesores*otPorAsesor*diasOp);

    const OTsBrutos=Math.min(OTsCap,OTsTec,OTsAsesor);
    const noShow=S(P.no_show)/100;
    const OTs=Math.round(OTsBrutos*(1-noShow));
    tOTs+=OTs;

    // Ingresos
    const tarifa=S(P.tarifa_hr);
    const hrsFactReales=OTs*hrsStdOT;
    const ingMO=hrsFactReales*tarifa;
    const ratioR=S(P.ratio_rep);
    const ingRep=ingMO*ratioR;
    const ventaAdicPct=S(P.venta_adic_pct)/100;
    const ticketAdic=S(P.ticket_adic);
    const ingAdic=Math.round(OTs*ventaAdicPct)*ticketAdic;

    tIngMO+=ingMO; tIngRep+=ingRep; tIngAdic+=ingAdic;
    tMgMO+=ingMO*S(P.margen_mo)/100;
    tMgRep+=(ingRep+ingAdic)*S(P.margen_rep)/100;

    // Costos
    tGTec+=tecs*S(P.sueldo_tec);
    tGAses+=asesores*S(P.sueldo_asesor);
    tGJefe+=S(P.jefe_taller);
    tGFijo+=S(P.gastos_fijos);
    tOverhead+=S(P.overhead_asignado);
    tDA+=S(P.deprec_equipos)+S(P.amort_software);
  }

  const ingTotal=tIngMO+tIngRep+tIngAdic;
  const margenBruto=tMgMO+tMgRep;
  const gastosTaller=tGTec+tGAses+tGJefe+tGFijo;
  const gastosTotal=gastosTaller+tOverhead;
  const ebitda=margenBruto-gastosTotal;
  const ebit=ebitda-tDA;
  const tx=P.tasa_imp.mean/100;
  const un=ebit>0?ebit*(1-tx):ebit;
  const cap=S(P.capital_taller),wacc=S(P.wacc)/100;
  const eva=un-cap*wacc;
  const absorcion=margenBruto>0?margenBruto/gastosTotal*100:0;

  return{
    ingTotal,ingMO:tIngMO,ingRep:tIngRep,ingAdic:tIngAdic,
    margenBruto,mgMO:tMgMO,mgRep:tMgRep,
    gastosTaller,gastosTotal,overhead:tOverhead,da:tDA,
    ebitda,ebit,utilidadNeta:un,eva,absorcion,
    ots:tOTs,hrsFact:tHrsFact,rotBahia:tRotBahia/12,
  };
}
function runSim(P,n){const r=[];for(let i=0;i<n;i++)r.push(simOnce(P));return r;}

function goalSeek({params,metric,target,conf,levers,maxIter=25,simN=600}){
  let cur={};Object.entries(params).forEach(([k,v])=>{cur[k]={...v};});
  const log=[],checkP=100-conf;
  for(let it=0;it<maxIter;it++){
    const res=runSim(cur,simN);
    const vals=res.map(r=>r[metric]).sort((a,b)=>a-b);
    const cv=pctle(vals,checkP),gap=target-cv;
    log.push({it,val:cv,gap});
    if(Math.abs(gap)<Math.abs(target)*0.02||gap<=0)return{ok:true,params:cur,log,final:cv,iters:it+1};
    const sens={};let totS=0;
    levers.forEach(k=>{
      const up={...cur,[k]:{...cur[k],mean:cur[k].mean*1.05}};
      const dn={...cur,[k]:{...cur[k],mean:cur[k].mean*0.95}};
      const ru=runSim(up,Math.min(400,simN));
      const rd=runSim(dn,Math.min(400,simN));
      const vu=pctle(ru.map(r=>r[metric]).sort((a,b)=>a-b),checkP);
      const vd=pctle(rd.map(r=>r[metric]).sort((a,b)=>a-b),checkP);
      sens[k]=(vu-vd)/0.10;totS+=Math.abs(sens[k]);
    });
    if(!totS)return{ok:false,params:cur,log,final:cv,iters:it+1};
    levers.forEach(k=>{
      if(Math.abs(sens[k])<totS*0.01)return;
      const w=Math.abs(sens[k])/totS;
      let nm=cur[k].mean*(1+Math.max(-0.12,Math.min(0.12,(gap/(sens[k]||1))*w*0.35)));
      cur[k]={...cur[k],mean:Math.max(cur[k].min,Math.min(cur[k].max,nm))};
    });
  }
  const fR=runSim(cur,simN);
  return{ok:false,params:cur,log,final:pctle(fR.map(r=>r[metric]).sort((a,b)=>a-b),checkP),iters:maxIter};
}

// ─── UI ───
function Histo({values,color,label,target,w=286,h=72,isPct=false}){
  const sorted=[...values].sort((a,b)=>a-b);
  const bins=28,mn=sorted[0],mx=sorted[sorted.length-1],rng=mx-mn||1,bw=rng/bins;
  const cts=new Array(bins).fill(0);
  sorted.forEach(v=>{let i=Math.floor((v-mn)/bw);if(i>=bins)i=bins-1;cts[i]++;});
  const maxC=Math.max(...cts),barW=w/bins,toX=v=>Math.max(0,Math.min(w,((v-mn)/rng)*w));
  const p10=pctle(sorted,10),p50=pctle(sorted,50),p90=pctle(sorted,90);
  const fmtV=v=>isPct?v.toFixed(1)+"%":"$"+fmt(v);
  return(
    <div style={{marginBottom:8}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:1}}>
        <span style={{fontFamily:"var(--serif)",fontSize:11,fontWeight:700,color:C.deep}}>{label}</span>
        <span style={{fontFamily:"var(--mono)",fontSize:8,color:C.muted}}>μ {fmtV(avg(values))}</span>
      </div>
      <svg width={w} height={h+18} style={{display:"block"}}>
        {cts.map((c,i)=><rect key={i} x={i*barW} y={h-(c/maxC)*h} width={barW-.5} height={(c/maxC)*h} fill={color} opacity={.45} rx={1}/>)}
        {target!==undefined&&<><line x1={toX(target)} x2={toX(target)} y1={0} y2={h} stroke={C.red} strokeWidth={2} strokeDasharray="4,3"/><text x={toX(target)} y={h+10} fill={C.red} fontSize={7} fontFamily="var(--mono)" textAnchor="middle">META</text></>}
        {[[p10,"#D06838","P10"],[p50,C.deep,"P50"],[p90,C.blue,"P90"]].map(([v,cl,lb])=>(
          <g key={lb}><line x1={toX(v)} x2={toX(v)} y1={0} y2={h} stroke={cl} strokeWidth={1.2} strokeDasharray={lb==="P50"?"0":"3,2"}/><text x={toX(v)} y={h+16} fill={cl} fontSize={7} fontFamily="var(--mono)" textAnchor="middle">{lb} {fmtV(v)}</text></g>
        ))}
      </svg>
    </div>
  );
}

function Section({title,icon,color,children,defaultOpen=false}){
  const[open,setOpen]=useState(defaultOpen);
  return(
    <div style={{background:C.card,borderRadius:6,marginBottom:6,border:`1px solid ${C.border}`,borderTop:`3px solid ${color}`,overflow:"hidden"}}>
      <button onClick={()=>setOpen(!open)} style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 10px",background:"none",border:"none",cursor:"pointer",textAlign:"left"}}>
        <span style={{fontFamily:"var(--serif)",fontSize:12,fontWeight:700,color}}>{icon} {title}</span>
        <span style={{fontSize:14,color:C.muted,transition:"transform .2s",transform:open?"rotate(180deg)":"rotate(0)"}}>{open?"▾":"▸"}</span>
      </button>
      {open&&<div style={{padding:"0 8px 6px"}}>{children}</div>}
    </div>
  );
}

function PI({k,p,val,onChange,hl}){
  return(
    <div style={{display:"flex",alignItems:"center",gap:3,marginBottom:2,background:hl?`${C.gold}12`:"transparent",padding:"1px 3px",borderRadius:3}}>
      <label style={{width:175,fontSize:9.5,fontFamily:"var(--mono)",color:C.text,flexShrink:0,lineHeight:1.15}}>{p.label}</label>
      {["mean","std"].map(f=>(
        <div key={f} style={{display:"flex",flexDirection:"column",alignItems:"center"}}>
          <span style={{fontSize:6,color:C.muted,letterSpacing:1}}>{f==="mean"?"μ":"σ"}</span>
          <input type="number" value={val[f]} onChange={e=>onChange(k,f,parseFloat(e.target.value)||0)}
            style={{width:56,padding:"2px 3px",fontSize:10,fontFamily:"var(--mono)",border:`1px solid ${hl?C.gold:C.border}`,borderRadius:2,background:C.light,textAlign:"right"}}/>
        </div>
      ))}
      <span style={{fontSize:7,color:C.muted,width:12}}>{p.unit}</span>
    </div>
  );
}

// ═══ MAIN ═══
export default function TallerMonteCarlo(){
  const[params,setParams]=useState(()=>{const p={};Object.entries(PD).forEach(([k,v])=>{p[k]={...v};});return p;});
  const[numSims,setNumSims]=useState(3000);
  const[results,setResults]=useState(null);
  const[running,setRunning]=useState(false);
  const[tab,setTab]=useState("supuestos");
  const[sensData,setSensData]=useState(null);
  const[sensTarget,setSensTarget]=useState("eva");

  const[gsMetric,setGsMetric]=useState("absorcion");
  const[gsTarget,setGsTarget]=useState(80);
  const[gsConf,setGsConf]=useState(60);
  const[gsLevers,setGsLevers]=useState(()=>{const l={};Object.entries(PD).forEach(([k,v])=>{if(v.lever)l[k]=true;});return l;});
  const[gsResult,setGsResult]=useState(null);
  const[gsRunning,setGsRunning]=useState(false);
  const origRef=useRef(null);

  const chg=useCallback((k,f,v)=>{setParams(p=>({...p,[k]:{...p[k],[f]:v}}));},[]);

  const handleRun=useCallback(()=>{
    setRunning(true);
    setTimeout(()=>{
      const res=runSim(params,numSims);setResults(res);
      const bv={};["eva","ebitda","ebit","utilidadNeta","absorcion"].forEach(m=>{bv[m]=avg(res.map(r=>r[m]));});
      const se={};Object.keys(params).filter(k=>k!=="tasa_imp").forEach(k=>{
        const tw={...params,[k]:{...params[k],mean:params[k].mean*1.10}};
        const tr=runSim(tw,Math.min(500,numSims));
        se[k]={};["eva","ebitda","ebit","utilidadNeta","absorcion"].forEach(m=>{se[k][m]=avg(tr.map(r=>r[m]))-bv[m];});
      });
      setSensData(se);setRunning(false);setTab("results");
    },50);
  },[params,numSims]);

  const handleGS=useCallback(()=>{
    setGsRunning(true);
    origRef.current={};Object.entries(params).forEach(([k,v])=>{origRef.current[k]={...v};});
    setTimeout(()=>{
      const lk=Object.keys(gsLevers).filter(k=>gsLevers[k]);
      const r=goalSeek({params,metric:gsMetric,target:gsTarget,conf:gsConf,levers:lk});
      setGsResult(r);
      const optP=r.params;
      const fr=runSim(optP,numSims);setResults(fr);
      const bv={};["eva","ebitda","ebit","utilidadNeta","absorcion"].forEach(m=>{bv[m]=avg(fr.map(x=>x[m]));});
      const se={};Object.keys(optP).filter(k=>k!=="tasa_imp").forEach(k=>{
        const tw={...optP,[k]:{...optP[k],mean:optP[k].mean*1.10}};
        const tr=runSim(tw,Math.min(500,numSims));
        se[k]={};["eva","ebitda","ebit","utilidadNeta","absorcion"].forEach(m=>{se[k][m]=avg(tr.map(x=>x[m]))-bv[m];});
      });
      setSensData(se);
      setParams(prev=>{const n={...prev};Object.entries(optP).forEach(([k,v])=>{n[k]={...v};});return n;});
      setGsRunning(false);setTab("goalseeking");
    },80);
  },[params,gsMetric,gsTarget,gsConf,gsLevers,numSims]);

  const stats=useMemo(()=>{
    if(!results)return null;
    const ex=f=>{const v=results.map(r=>r[f]).sort((a,b)=>a-b);return{values:v,mean:avg(v),p10:pctle(v,10),p50:pctle(v,50),p90:pctle(v,90)};};
    return{
      ebitda:ex("ebitda"),ebit:ex("ebit"),utilidadNeta:ex("utilidadNeta"),eva:ex("eva"),
      ingTotal:ex("ingTotal"),ingMO:ex("ingMO"),ingRep:ex("ingRep"),ingAdic:ex("ingAdic"),
      margenBruto:ex("margenBruto"),mgMO:ex("mgMO"),mgRep:ex("mgRep"),
      gastosTaller:ex("gastosTaller"),gastosTotal:ex("gastosTotal"),overhead:ex("overhead"),da:ex("da"),
      ots:ex("ots"),hrsFact:ex("hrsFact"),absorcion:ex("absorcion"),rotBahia:ex("rotBahia"),
    };
  },[results]);

  const probEVA=results?(results.filter(r=>r.eva>0).length/results.length*100).toFixed(1):"—";
  const sortedSens=useMemo(()=>{
    if(!sensData)return[];
    return Object.entries(sensData).map(([k,v])=>[k,v[sensTarget]]).sort((a,b)=>Math.abs(b[1])-Math.abs(a[1])).slice(0,15);
  },[sensData,sensTarget]);

  const leverChanges=useMemo(()=>{
    if(!gsResult||!origRef.current)return[];
    const ch=[];
    Object.keys(gsResult.params).forEach(k=>{
      if(!PD[k]||!origRef.current[k])return;
      const o=origRef.current[k].mean,n=gsResult.params[k].mean,p=((n-o)/o)*100;
      if(Math.abs(p)>0.5)ch.push({k,label:PD[k].label,unit:PD[k].unit,o,n,p});
    });
    ch.sort((a,b)=>Math.abs(b.p)-Math.abs(a.p));return ch;
  },[gsResult]);

  const GC={
    cap:{t:"Bahías, Asesores y Tiempos",c:C.blue,i:"🔧"},
    tech:{t:"Productividad Técnicos → Rotación",c:C.blue,i:"⚡"},
    margen:{t:"Repuestos y Venta Adicional",c:C.teal,i:"💰"},
    demanda:{t:"Retención y Demanda",c:C.green,i:"🔄"},
    costos:{t:"Costos de Personal y Fijos",c:C.orange,i:"📋"},
    overhead:{t:"Overhead Asignado y D&A",c:C.muted,i:"🏢"},
    eva_p:{t:"Parámetros EVA",c:C.purple,i:"📐"},
  };

  const tabs=[
    {k:"supuestos",l:"📝 Supuestos"},
    {k:"goalseeking",l:"🎯 Goal-Seek"},
    {k:"results",l:"📊 Resultados"},
    {k:"sensitivity",l:"🌪️ Tornado"},
  ];

  const inpS={padding:"4px 7px",borderRadius:3,border:`1px solid ${C.border}`,fontSize:10,fontFamily:"var(--mono)",background:C.light,textAlign:"right"};
  const isAbsorcion=gsMetric==="absorcion";

  return(
    <div style={{"--serif":"'Cormorant Garamond',serif","--sans":"'Outfit',sans-serif","--mono":"'JetBrains Mono',monospace",
      minHeight:"100vh",background:`linear-gradient(170deg,${C.light} 0%,#EDE8E0 100%)`,fontFamily:"var(--sans)",color:C.text}}>
      <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600;700&family=Outfit:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet"/>

      {/* HEADER */}
      <div style={{background:`linear-gradient(135deg,${C.deep} 0%,${C.green} 100%)`,padding:"14px 12px 10px",color:"#fff"}}>
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
        <div style={{fontFamily:"var(--serif)",fontSize:15,fontWeight:700}}>Simulador Monte Carlo — Taller</div>
        <div style={{fontSize:7,opacity:.7,letterSpacing:1.5,textTransform:"uppercase"}}>Servicios y Repuestos · Modelo Causal + Goal-Seeking</div>
      </div>

      <div style={{padding:"8px 8px 36px"}}>
        <div style={{display:"flex",gap:4,alignItems:"center",marginBottom:8,flexWrap:"wrap"}}>
          <button onClick={handleRun} disabled={running} style={{padding:"7px 16px",borderRadius:4,border:"none",cursor:"pointer",background:running?C.muted:`linear-gradient(135deg,${C.green},${C.deep})`,color:"#fff",fontSize:10,fontWeight:600}}>{running?"⏳...":"▶ Simular"}</button>
          <button onClick={handleGS} disabled={gsRunning} style={{padding:"7px 16px",borderRadius:4,border:"none",cursor:"pointer",background:gsRunning?C.muted:`linear-gradient(135deg,${C.gold},${C.orange})`,color:"#fff",fontSize:10,fontWeight:600}}>{gsRunning?"⏳...":"🎯 Goal-Seek"}</button>
          <select value={numSims} onChange={e=>setNumSims(+e.target.value)} style={{...inpS,width:55,fontSize:9}}>{[1000,3000,5000].map(n=><option key={n} value={n}>{n}</option>)}</select>
        </div>

        <div style={{display:"flex",gap:0,marginBottom:8}}>
          {tabs.map((t,i)=>(
            <button key={t.k} onClick={()=>setTab(t.k)} style={{flex:1,padding:"6px 2px",fontSize:8.5,fontWeight:tab===t.k?600:400,background:tab===t.k?C.card:"transparent",color:tab===t.k?C.deep:C.muted,border:`1px solid ${C.border}`,borderBottom:tab===t.k?`2px solid ${C.gold}`:`1px solid ${C.border}`,borderRadius:i===0?"5px 0 0 0":i===tabs.length-1?"0 5px 0 0":0,cursor:"pointer"}}>{t.l}</button>
          ))}
        </div>

        {/* ═══ SUPUESTOS ═══ */}
        {tab==="supuestos"&&(
          <div>
            {Object.entries(GC).map(([gk,gc])=>{
              const keys=Object.entries(PD).filter(([,v])=>v.group===gk).map(([k])=>k);
              if(!keys.length)return null;
              const isImportant=["cap","tech","margen"].includes(gk);
              return(<Section key={gk} title={gc.t} icon={gc.i} color={gc.c} defaultOpen={isImportant}>
                {keys.map(k=><PI key={k} k={k} p={PD[k]} val={params[k]} onChange={chg} hl={gsLevers[k]}/>)}
              </Section>);
            })}
          </div>
        )}

        {/* ═══ GOAL-SEEKING ═══ */}
        {tab==="goalseeking"&&(
          <div>
            <div style={{background:C.card,borderRadius:6,padding:10,border:`1px solid ${C.border}`,marginBottom:8,borderTop:`3px solid ${C.gold}`}}>
              <div style={{fontFamily:"var(--serif)",fontSize:13,fontWeight:700,color:C.deep,marginBottom:6}}>🎯 Meta del Taller</div>
              <div style={{display:"flex",gap:6,marginBottom:6,flexWrap:"wrap",alignItems:"flex-end"}}>
                <div>
                  <div style={{fontSize:7,color:C.muted,textTransform:"uppercase",letterSpacing:1,marginBottom:1}}>Métrica</div>
                  <select value={gsMetric} onChange={e=>setGsMetric(e.target.value)} style={{...inpS,width:100}}>
                    <option value="absorcion">Absorción %</option><option value="eva">EVA</option><option value="ebitda">EBITDA</option><option value="ebit">EBIT</option><option value="utilidadNeta">Ut. Neta</option>
                  </select>
                </div>
                <div>
                  <div style={{fontSize:7,color:C.muted,textTransform:"uppercase",letterSpacing:1,marginBottom:1}}>{isAbsorcion?"Meta %":"Meta USD/año"}</div>
                  <input type="number" value={gsTarget} onChange={e=>setGsTarget(parseFloat(e.target.value)||0)} style={{...inpS,width:95}}/>
                </div>
                <div>
                  <div style={{fontSize:7,color:C.muted,textTransform:"uppercase",letterSpacing:1,marginBottom:1}}>Confianza</div>
                  <select value={gsConf} onChange={e=>setGsConf(+e.target.value)} style={{...inpS,width:55}}>{[50,60,70,80,90].map(n=><option key={n} value={n}>{n}%</option>)}</select>
                </div>
              </div>
              <div style={{fontSize:10,fontWeight:600,color:C.deep,marginBottom:4}}>Palancas</div>
              {Object.entries(GC).filter(([gk])=>Object.keys(PD).some(k=>PD[k].group===gk&&PD[k].lever)).map(([gk,gc])=>{
                const keys=Object.entries(PD).filter(([,v])=>v.group===gk&&v.lever).map(([k])=>k);
                if(!keys.length)return null;
                return(<div key={gk} style={{marginBottom:3}}>
                  <div style={{fontSize:7,fontWeight:600,color:gc.c}}>{gc.i} {gc.t}</div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:2}}>
                    {keys.map(k=>(<button key={k} onClick={()=>setGsLevers(p=>({...p,[k]:!p[k]}))} style={{padding:"2px 5px",borderRadius:3,fontSize:7.5,fontFamily:"var(--mono)",border:`1px solid ${gsLevers[k]?C.gold:C.border}`,cursor:"pointer",background:gsLevers[k]?`${C.gold}20`:"transparent",color:gsLevers[k]?C.deep:C.muted}}>{PD[k].label}</button>))}
                  </div>
                </div>);
              })}
            </div>
            {/* GS Results */}
            {gsResult&&(
              <div style={{background:C.card,borderRadius:6,border:`1px solid ${C.border}`,marginBottom:8,overflow:"hidden"}}>
                <div style={{padding:"10px 12px",background:gsResult.ok?`linear-gradient(135deg,${C.green},${C.deep})`:`linear-gradient(135deg,${C.orange},${C.red})`,color:"#fff"}}>
                  <div style={{fontSize:12,fontWeight:700}}>{gsResult.ok?"✅ Meta Alcanzable":"⚠️ Meta Difícil"}</div>
                  <div style={{fontSize:10,fontFamily:"var(--mono)",opacity:.9,marginTop:2}}>
                    {isAbsorcion?"ABSORCIÓN":gsMetric.toUpperCase()} objetivo: {isAbsorcion?gsTarget+"%":"$"+fmtF(gsTarget)} → Logrado: {isAbsorcion?gsResult.final.toFixed(1)+"%":"$"+fmtF(Math.round(gsResult.final))} ({gsConf}% confianza)
                  </div>
                </div>
                <div style={{padding:"10px"}}>
                  <div style={{fontFamily:"var(--serif)",fontSize:14,fontWeight:700,color:C.deep,marginBottom:6}}>Objetivos KPI para Alcanzar la Meta</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 65px 65px 50px",gap:2,padding:"5px 6px",background:C.deep,borderRadius:"4px 4px 0 0",color:"#fff",fontFamily:"var(--mono)",fontSize:8,fontWeight:600}}>
                    <div>KPI</div><div style={{textAlign:"center"}}>ACTUAL</div><div style={{textAlign:"center"}}>OBJETIVO</div><div style={{textAlign:"center"}}>DELTA</div>
                  </div>
                  {leverChanges.map((ch,idx)=>{
                    const up=ch.p>0;const good=up;
                    const fmtVal=(v,u)=>{if(u==="%")return v.toFixed(1)+"%";if(u==="$")return"$"+fmtF(Math.round(v));if(u==="x")return v.toFixed(2);return Math.round(v)+(u?" "+u:"");};
                    return(
                      <div key={ch.k} style={{display:"grid",gridTemplateColumns:"1fr 65px 65px 50px",gap:2,padding:"6px",alignItems:"center",background:idx%2===0?C.light:C.card,borderBottom:`1px solid ${C.border}`}}>
                        <div style={{fontSize:9.5,fontWeight:500,color:C.text}}>{ch.label}</div>
                        <div style={{textAlign:"center",fontFamily:"var(--mono)",fontSize:10,color:C.muted}}>{fmtVal(ch.o,ch.unit)}</div>
                        <div style={{textAlign:"center",fontFamily:"var(--mono)",fontSize:11,fontWeight:700,color:good?C.green:C.orange,background:good?`${C.green}12`:`${C.orange}12`,borderRadius:3,padding:"2px 4px"}}>{fmtVal(ch.n,ch.unit)}</div>
                        <div style={{textAlign:"center",fontFamily:"var(--mono)",fontSize:9,fontWeight:600,color:good?C.green:C.orange}}>{up?"▲":"▼"} {Math.abs(ch.p).toFixed(1)}%</div>
                      </div>);
                  })}
                  {leverChanges.length===0&&<div style={{padding:12,textAlign:"center",fontSize:11,color:C.green}}>✅ La meta ya se cumple.</div>}
                </div>
              </div>
            )}
            {stats&&(
              <div style={{background:C.card,borderRadius:6,padding:10,border:`1px solid ${C.border}`}}>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:5,marginBottom:6}}>
                  {[{l:"ABSORCIÓN",s:stats.absorcion,c:stats.absorcion.p50>=80?C.green:stats.absorcion.p50>=60?C.gold:C.red,pct:true},{l:"EBITDA",s:stats.ebitda,c:C.green},{l:"EVA",s:stats.eva,c:stats.eva.p50>=0?C.gold:C.red},{l:"OTs/AÑO",s:stats.ots,c:C.blue}].map(x=>(
                    <div key={x.l} style={{background:C.light,borderRadius:4,padding:"5px 7px",borderLeft:`3px solid ${x.c}`}}>
                      <div style={{fontSize:7,textTransform:"uppercase",letterSpacing:1.5,color:C.muted}}>{x.l}</div>
                      <div style={{fontFamily:"var(--mono)",fontSize:13,fontWeight:500,color:x.c}}>{x.pct?x.s.p50.toFixed(0)+"%":"$"+fmt(x.s.p50)}</div>
                      <div style={{fontSize:7,fontFamily:"var(--mono)",color:C.muted}}>P10 {x.pct?x.s.p10.toFixed(0)+"%":"$"+fmt(x.s.p10)} · P90 {x.pct?x.s.p90.toFixed(0)+"%":"$"+fmt(x.s.p90)}</div>
                    </div>
                  ))}
                </div>
                <Histo values={stats.absorcion.values} color={C.teal} label="Absorción %" target={isAbsorcion?gsTarget:undefined} isPct/>
                <Histo values={stats.eva.values} color={C.gold} label="EVA" target={gsMetric==="eva"?gsTarget:undefined}/>
              </div>
            )}
          </div>
        )}

        {/* ═══ RESULTS ═══ */}
        {tab==="results"&&stats&&(
          <div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:5,marginBottom:6}}>
              {[{l:"EBITDA",s:stats.ebitda,c:C.green},{l:"EBIT",s:stats.ebit,c:C.blue},{l:"UT.NETA",s:stats.utilidadNeta,c:C.deep},{l:"EVA",s:stats.eva,c:stats.eva.p50>=0?C.gold:C.red}].map(x=>(
                <div key={x.l} style={{background:C.card,borderRadius:5,padding:"7px",border:`1px solid ${C.border}`,borderLeft:`3px solid ${x.c}`}}>
                  <div style={{fontSize:7,textTransform:"uppercase",letterSpacing:1.5,color:C.muted}}>{x.l}</div>
                  <div style={{fontFamily:"var(--mono)",fontSize:14,fontWeight:500,color:x.c}}>${fmt(x.s.p50)}</div>
                  <div style={{fontSize:7,fontFamily:"var(--mono)",color:C.muted}}>P10 ${fmt(x.s.p10)} · P90 ${fmt(x.s.p90)}</div>
                </div>
              ))}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:5,marginBottom:6}}>
              <div style={{background:`linear-gradient(135deg,${C.deep},${C.green})`,borderRadius:5,padding:"7px 9px",color:"#fff"}}>
                <div style={{fontSize:7,textTransform:"uppercase",letterSpacing:1.5,opacity:.7}}>ABSORCIÓN</div>
                <div style={{fontFamily:"var(--mono)",fontSize:18,fontWeight:500}}>{stats.absorcion.p50.toFixed(0)}%</div>
              </div>
              <div style={{background:C.card,borderRadius:5,padding:"7px 9px",border:`1px solid ${C.border}`,borderLeft:`3px solid ${C.blue}`}}>
                <div style={{fontSize:7,color:C.muted}}>OTs / AÑO</div>
                <div style={{fontFamily:"var(--mono)",fontSize:16,fontWeight:500,color:C.blue}}>{Math.round(stats.ots.p50).toLocaleString()}</div>
              </div>
              <div style={{background:C.card,borderRadius:5,padding:"7px 9px",border:`1px solid ${C.border}`}}>
                <div style={{fontSize:7,color:C.muted}}>ROT. BAHÍA/DÍA</div>
                <div style={{fontFamily:"var(--mono)",fontSize:16,fontWeight:500,color:C.teal}}>{stats.rotBahia.p50.toFixed(1)}</div>
              </div>
            </div>

            {/* P&L */}
            <div style={{background:C.card,borderRadius:6,padding:10,border:`1px solid ${C.border}`,marginBottom:6}}>
              <div style={{fontFamily:"var(--serif)",fontSize:12,fontWeight:700,color:C.deep,marginBottom:4}}>P&L Taller — Mediana Anual</div>
              {[
                {l:"INGRESOS TALLER",v:stats.ingTotal.p50,b:1,c:C.deep},
                {l:"  Mano de obra",v:stats.ingMO.p50,c:C.blue},
                {l:"  Repuestos",v:stats.ingRep.p50,c:C.teal},
                {l:"  Venta adicional",v:stats.ingAdic.p50,c:C.green},
                {l:"MARGEN BRUTO",v:stats.margenBruto.p50,b:1,c:C.green,t:1},
                {l:"  Margen MO",v:stats.mgMO.p50,c:C.blue},
                {l:"  Margen repuestos",v:stats.mgRep.p50,c:C.teal},
                {l:"(-) GASTOS TALLER",v:-stats.gastosTaller.p50,b:1,c:C.red,t:1},
                {l:"(-) OVERHEAD ASIGNADO",v:-stats.overhead.p50,c:C.red},
                {l:"= EBITDA",v:stats.ebitda.p50,b:1,c:C.green,t:1},
                {l:"(-) D&A",v:-stats.da.p50,c:C.muted},
                {l:"= EBIT",v:stats.ebit.p50,b:1,c:C.blue,t:1},
                {l:"(-) IR 30%",v:stats.ebit.p50>0?-stats.ebit.p50*0.30:0,c:C.muted},
                {l:"= UTILIDAD NETA",v:stats.utilidadNeta.p50,b:1,c:C.deep,t:1},
                {l:"(-) Cargo capital",v:-(params.capital_taller.mean*params.wacc.mean/100),c:C.red},
                {l:"= EVA",v:stats.eva.p50,b:1,c:stats.eva.p50>=0?C.gold:C.red,t:1},
              ].map((r,i)=>(
                <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"2px 0",fontFamily:"var(--mono)",fontSize:8.5,fontWeight:r.b?600:400,borderTop:r.t?`1px solid ${C.border}`:"none"}}>
                  <span>{r.l}</span><span style={{color:r.c}}>${fmtF(Math.round(r.v))}</span>
                </div>
              ))}
            </div>

            <div style={{background:C.card,borderRadius:6,padding:10,border:`1px solid ${C.border}`}}>
              <Histo values={stats.ebitda.values} color={C.green} label="EBITDA"/>
              <Histo values={stats.eva.values} color={C.gold} label="EVA"/>
              <Histo values={stats.absorcion.values} color={C.teal} label="Absorción %" isPct/>
            </div>
          </div>
        )}
        {tab==="results"&&!stats&&(
          <div style={{background:C.card,borderRadius:6,padding:"24px 12px",textAlign:"center",border:`1px solid ${C.border}`,color:C.muted,fontSize:11}}>Presiona ▶ Simular o 🎯 Goal-Seek para ver resultados.</div>
        )}

        {/* ═══ TORNADO ═══ */}
        {tab==="sensitivity"&&(
          <div style={{background:C.card,borderRadius:6,padding:10,border:`1px solid ${C.border}`}}>
            <div style={{fontFamily:"var(--serif)",fontSize:12,fontWeight:700,color:C.deep,marginBottom:4}}>Tornado — Sensibilidad +10%</div>
            <div style={{display:"flex",gap:3,marginBottom:8,flexWrap:"wrap"}}>
              {["absorcion","eva","ebitda","ebit","utilidadNeta"].map(t=>(
                <button key={t} onClick={()=>setSensTarget(t)} style={{padding:"2px 7px",borderRadius:3,fontSize:8,fontFamily:"var(--mono)",border:`1px solid ${sensTarget===t?C.gold:C.border}`,background:sensTarget===t?`${C.gold}20`:"transparent",color:sensTarget===t?C.deep:C.muted,cursor:"pointer"}}>{t==="utilidadNeta"?"Ut.Neta":t==="absorcion"?"Absorción":t.toUpperCase()}</button>
              ))}
            </div>
            {sortedSens.length>0?sortedSens.map(([k,val])=>{
              const mx=Math.max(...sortedSens.map(s=>Math.abs(s[1])));
              const pw=Math.abs(val)/mx*100;const ps=val>=0;
              return(
                <div key={k} style={{display:"flex",alignItems:"center",gap:4,marginBottom:3}}>
                  <div style={{width:155,fontSize:8,fontFamily:"var(--mono)",color:C.text,textAlign:"right",flexShrink:0,lineHeight:1.1}}>{params[k]?.label||k}</div>
                  <div style={{flex:1,height:10,background:"#F0ECE6",borderRadius:2,position:"relative"}}>
                    <div style={{position:"absolute",left:ps?"50%":`${50-pw/2}%`,width:`${pw/2}%`,height:"100%",background:ps?C.green:C.red,borderRadius:2,opacity:.6}}/>
                    <div style={{position:"absolute",left:"50%",top:0,bottom:0,width:1,background:C.muted,opacity:.25}}/>
                  </div>
                  <div style={{width:48,fontSize:8,fontFamily:"var(--mono)",color:ps?C.green:C.red,flexShrink:0}}>{ps?"+":""}{sensTarget==="absorcion"?val.toFixed(1)+"pp":fmt(val)}</div>
                </div>
              );
            }):(
              <div style={{textAlign:"center",padding:14,fontSize:10,color:C.muted}}>Ejecuta simulación primero.</div>
            )}
          </div>
        )}

        <div style={{marginTop:12,textAlign:"center",fontSize:7,color:C.muted}}>© Promundial Consulting Group · Monte Carlo Taller · Nicaragua IR 30%</div>
      </div>
    </div>
  );
}

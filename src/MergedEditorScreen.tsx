import React, { useState } from 'react'
import { ArrowLeft, ArrowRight, CircleDot, FileImage, FileText, Palette, RotateCw, ZoomIn, ZoomOut } from 'lucide-react'
import { CustomerBg, Card, Btn, Badge, Divider, StepHeader, Stepper } from './ui'
import { O, T } from './tokens'
import { calcFilePrice, PRICING, type ColorMode, type PaperSize, type PrintOpts, type Sides, type UpFile } from './CustomerPortal'

export function MergedEditorScreen({ onNext, onBack, files, setFiles, opts, setOpts }: { onNext:()=>void; onBack:()=>void; files:UpFile[]; setFiles:(files:UpFile[])=>void; opts:PrintOpts; setOpts:(opts:PrintOpts)=>void }) {
  const [currentFileIdx, setCurrentFileIdx] = useState(0)
  const [zoom, setZoom] = useState(100)
  const [rotate, setRotate] = useState(0)
  const file = files[currentFileIdx]
  const color = file?.color || opts.color
  const paper = file?.paper || opts.paper
  const sides = file?.sides || opts.sides
  const copies = file?.copies || 1
  const isImage = Boolean(file?.type?.startsWith('image/'))
  const formatSize = (bytes:number) => bytes > 1e6 ? `${(bytes / 1e6).toFixed(1)} MB` : `${Math.round(bytes / 1e3)} KB`
  const updateFile = (patch:Partial<UpFile>) => {
    if (!file) return
    setFiles(files.map((item,index)=>index===currentFileIdx ? { ...item, ...patch } : item))
    setOpts({ ...opts, color: patch.color || color, paper: patch.paper || paper, sides: patch.sides || sides, copies: patch.copies || copies })
  }
  const filePrice = file ? calcFilePrice({ color, paper, sides, copies }, file) : 0
  const optionButton = (selected:boolean, onClick:()=>void, children:React.ReactNode, tall=false) => <button onClick={onClick} style={{ minHeight:tall?106:44, padding:tall?'16px 12px':'10px 12px', borderRadius:tall?T.r.card:T.r.md, cursor:'pointer', textAlign:tall?'center':'center', background:selected?O.a14:'rgba(255,255,255,0.03)', border:`1px solid ${selected?O.border:'rgba(255,255,255,0.07)'}`, color:selected?O.accent:T.text.secondary, fontFamily:'inherit', transition:'all .2s', boxShadow:selected?`0 0 0 1px ${O.a20}`:'none' }}>{children}</button>
  const toolButton = (label:string, icon:React.ReactNode, onClick:()=>void) => <button onClick={onClick} style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 14px', borderRadius:T.r.md, background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.08)', color:T.text.secondary, fontSize:12, fontWeight:500, cursor:'pointer', fontFamily:'inherit' }}>{icon}{label}</button>

  return <div style={{ position:'relative', zIndex:1, minHeight:'100vh' }}>
    <CustomerBg/>
    <div style={{ position:'relative', zIndex:1, maxWidth:480, margin:'0 auto', padding:'48px 24px 100px', display:'flex', flexDirection:'column' }}>
      <StepHeader step={4} total={5} title="Print Options" subtitle="Choose how your files will be printed." />
      {!isImage && <div style={{ fontSize:12, color:T.text.muted, marginTop:-16, marginBottom:16 }}>Image editing tools are hidden for this document.</div>}
      {files.length>1 && <div style={{ display:'flex', gap:6, marginBottom:12, overflowX:'auto', paddingBottom:4 }}>{files.map((item,index)=><button key={item.id} onClick={()=>{setCurrentFileIdx(index);setZoom(100);setRotate(0)}} style={{ flexShrink:0, display:'flex', alignItems:'center', gap:6, padding:'6px 12px', borderRadius:T.r.md, cursor:'pointer', background:currentFileIdx===index?O.a14:'rgba(255,255,255,0.05)', border:`1px solid ${currentFileIdx===index?O.border:'rgba(255,255,255,0.08)'}`, color:currentFileIdx===index?O.accent:T.text.muted, fontSize:12, fontWeight:500, fontFamily:'inherit' }}>{item.preview?<FileImage size={12}/>:<FileText size={12}/>} {item.name.length>14?item.name.slice(0,14)+'…':item.name}</button>)}</div>}

      <div style={{ marginBottom:16 }}><Card pad={0} style={{ overflow:'hidden' }}><div style={{ background:'repeating-conic-gradient(rgba(255,255,255,0.025) 0% 25%,transparent 0% 50%) 0 0 / 18px 18px', minHeight:260, display:'flex', alignItems:'center', justifyContent:'center', position:'relative' }}>{file?.preview?<img src={file.preview} alt={file.name} style={{ maxWidth:'85%', maxHeight:250, objectFit:'contain', transform:`scale(${zoom/100}) rotate(${rotate}deg)`, filter:color==='bw'?'grayscale(100%)':'none', transition:'transform .25s' }}/>:<FileText size={48} strokeWidth={1.2} color={O.accent}/>} {file&&<div style={{ position:'absolute', bottom:10, left:10, display:'flex', alignItems:'center', gap:5, background:'rgba(0,0,0,.6)', backdropFilter:'blur(8px)', borderRadius:T.r.pill, padding:'4px 10px', border:'1px solid rgba(255,255,255,.08)' }}><span style={{ fontSize:11, color:T.text.secondary, maxWidth:170, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{file.name}</span><span style={{ fontSize:10, color:T.text.muted }}>· {formatSize(file.size)}</span></div>}</div></Card></div>

      <div style={{ marginBottom:16 }}><Card><div style={{ fontSize:11, fontWeight:700, color:T.text.muted, letterSpacing:'.08em', textTransform:'uppercase', marginBottom:14 }}>Print Mode</div><div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
        {optionButton(color==='bw',()=>updateFile({color:'bw'}),<><div style={{ fontSize:24, marginBottom:8 }}><CircleDot size={23}/></div><div style={{ fontSize:13, fontWeight:600, marginBottom:4 }}>Black & White</div><div style={{ fontSize:11, color:T.text.muted }}>₹{PRICING.document[paper].bw[sides==='single'?'single':'double']} per {sides==='single'?'page':'sheet'}</div></>,true)}
        {optionButton(color==='color',()=>updateFile({color:'color'}),<><div style={{ fontSize:24, marginBottom:8 }}><Palette size={23}/></div><div style={{ fontSize:13, fontWeight:600, marginBottom:4 }}>Color</div><div style={{ fontSize:11, color:T.text.muted }}>₹{PRICING.document[paper].color[sides==='single'?'single':'double']} per {sides==='single'?'page':'sheet'}</div></>,true)}
      </div></Card></div>

      <div style={{ marginBottom:16 }}><Card><div style={{ fontSize:11, fontWeight:700, color:T.text.muted, letterSpacing:'.08em', textTransform:'uppercase', marginBottom:14 }}>Paper Size</div><div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>{(['A4','A3'] as PaperSize[]).map(value=>optionButton(paper===value,()=>updateFile({paper:value}),value))}</div></Card></div>

      <div style={{ marginBottom:16 }}><Card><div style={{ display:'flex', flexDirection:'column', gap:20 }}>
        <div>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
            <div>
              <div style={{ fontWeight:600, fontSize:14, marginBottom:2 }}>Number of Copies</div>
              <div style={{ fontSize:11, color:T.text.muted }}>Per document file</div>
            </div>
            <Stepper value={copies} onChange={value=>updateFile({copies:value})} min={1} max={100} theme="orange"/>
          </div>
          <div style={{ fontSize:11, color:T.text.muted }}>{file?.pages || 1} {(file?.pages || 1)===1?'page':'pages'} · {files.length} {files.length===1?'document':'documents'}</div>
        </div>
        <Divider/>
        <div><div style={{ fontWeight:600, fontSize:14, marginBottom:12 }}>Printing Sides</div><div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>{(['single','double'] as Sides[]).map(value=>optionButton(sides===value,()=>updateFile({sides:value}),<><div style={{ fontSize:13, fontWeight:600, marginBottom:3 }}>{value==='single'?'Single Sided':'Double Sided'}</div><div style={{ fontSize:11, color:T.text.muted }}>{value==='single'?'One side per page':'Front & back'}</div></>))}</div></div>
        <Divider/>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}><span style={{ fontSize:11, fontWeight:700, color:T.text.muted, letterSpacing:'.08em', textTransform:'uppercase' }}>File Total</span><Badge label={`₹${filePrice}`} color="orange"/></div>
      </div></Card></div>

      {isImage && <div style={{ marginBottom:12 }}><Card pad={16}><div style={{ fontSize:10, fontWeight:700, color:T.text.muted, letterSpacing:'.08em', textTransform:'uppercase', marginBottom:10 }}>Editing Tools</div><div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>{toolButton('Rotate',<RotateCw size={15}/>,()=>setRotate(value=>(value+90)%360))}{toolButton('Zoom In',<ZoomIn size={15}/>,()=>setZoom(value=>Math.min(200,value+15)))}{toolButton('Zoom Out',<ZoomOut size={15}/>,()=>setZoom(value=>Math.max(50,value-15)))}</div></Card></div>}
    </div>
    <div className="customer-mobile-action-bar" style={{ position:'fixed', bottom:0, left:0, right:0, padding:'16px 24px', background:'rgba(7,7,17,.85)', backdropFilter:'blur(24px)', borderTop:'1px solid rgba(255,255,255,.06)', zIndex:10 }}><div className="customer-mobile-action-buttons" style={{ maxWidth:480, margin:'0 auto', display:'flex', gap:10 }}><Btn onClick={onBack} variant="ghost" size="lg" icon={<ArrowLeft size={16}/>}>Back</Btn><Btn onClick={onNext} theme="orange" full size="lg" iconRight={<ArrowRight size={17}/>}>See Estimated Price</Btn></div></div>
  </div>
}
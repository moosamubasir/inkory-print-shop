import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Check, X, ChevronRight, AlertCircle, Info } from 'lucide-react'
import { O, G, T, S } from './tokens'

// ── CSSProperties shorthand ──────────────────────────────────────────
type CSS = React.CSSProperties

// ── Animated background orbs ─────────────────────────────────────────

export function CustomerBg() {
  return (
    <div style={{ position:'fixed', inset:0, zIndex:0, background:T.bg, overflow:'hidden', pointerEvents:'none' }}>
      <div style={{
        position:'absolute', top:'-18%', left:'-12%',
        width:'min(70vw,880px)', height:'min(70vw,880px)', borderRadius:'50%',
        background:`radial-gradient(ellipse at center, ${O.a20} 0%, ${O.a6} 45%, transparent 70%)`,
        filter:'blur(48px)', animation:'orb-1 22s ease-in-out infinite',
      }}/>
      <div style={{
        position:'absolute', bottom:'-22%', right:'-12%',
        width:'min(55vw,700px)', height:'min(55vw,700px)', borderRadius:'50%',
        background:`radial-gradient(ellipse at center, ${O.a14} 0%, transparent 68%)`,
        filter:'blur(64px)', animation:'orb-2 28s ease-in-out infinite',
      }}/>
      <div style={{
        position:'absolute', top:'45%', left:'58%',
        width:'min(28vw,360px)', height:'min(28vw,360px)', borderRadius:'50%',
        background:`radial-gradient(ellipse at center, rgba(234,88,12,0.09) 0%, transparent 70%)`,
        filter:'blur(80px)', animation:'orb-3 38s ease-in-out infinite',
      }}/>
      <div style={{
        position:'absolute', inset:0,
        backgroundImage:'radial-gradient(circle, rgba(255,255,255,0.022) 1px, transparent 1px)',
        backgroundSize:'30px 30px', opacity:0.9,
      }}/>
    </div>
  )
}

export function AdminBg() {
  return (
    <div style={{ position:'fixed', inset:0, zIndex:0, background:T.bg, overflow:'hidden', pointerEvents:'none' }}>
      <div style={{
        position:'absolute', top:'-18%', right:'-12%',
        width:'min(70vw,880px)', height:'min(70vw,880px)', borderRadius:'50%',
        background:`radial-gradient(ellipse at center, ${G.a14} 0%, ${G.a6} 45%, transparent 70%)`,
        filter:'blur(48px)', animation:'orb-2 24s ease-in-out infinite',
      }}/>
      <div style={{
        position:'absolute', bottom:'-22%', left:'-12%',
        width:'min(55vw,700px)', height:'min(55vw,700px)', borderRadius:'50%',
        background:`radial-gradient(ellipse at center, ${G.a10} 0%, transparent 68%)`,
        filter:'blur(64px)', animation:'orb-1 32s ease-in-out infinite',
      }}/>
      <div style={{
        position:'absolute', top:'50%', left:'45%',
        width:'min(25vw,320px)', height:'min(25vw,320px)', borderRadius:'50%',
        background:`radial-gradient(ellipse at center, rgba(22,163,74,0.07) 0%, transparent 70%)`,
        filter:'blur(90px)', animation:'orb-3 42s ease-in-out infinite',
      }}/>
      <div style={{
        position:'absolute', inset:0,
        backgroundImage:'radial-gradient(circle, rgba(255,255,255,0.018) 1px, transparent 1px)',
        backgroundSize:'30px 30px',
      }}/>
    </div>
  )
}

// ── Card ─────────────────────────────────────────────────────────────

interface CardProps {
  children: React.ReactNode
  style?: CSS
  className?: string
  accent?: 'orange' | 'green' | 'none'
  hover?: boolean
  onClick?: () => void
  pad?: number | string
}

export function Card({ children, style, className='', accent='none', hover=false, onClick, pad=24 }: CardProps) {
  const [ov, setOv] = useState(false)
  const acc = accent==='orange'
    ? { borderColor:O.border, boxShadow:`0 8px 40px rgba(0,0,0,0.50), 0 0 0 1px ${O.border}, inset 0 1px 0 rgba(255,255,255,0.14)` }
    : accent==='green'
    ? { borderColor:G.border, boxShadow:`0 8px 40px rgba(0,0,0,0.50), 0 0 0 1px ${G.border}, inset 0 1px 0 rgba(255,255,255,0.14)` }
    : {}
  return (
    <div
      onClick={onClick}
      onMouseEnter={()=>setOv(true)}
      onMouseLeave={()=>setOv(false)}
      className={`glass ${className}`}
      style={{
        borderRadius: T.r.card,
        padding: pad,
        cursor: onClick ? 'pointer' : 'default',
        transition:'all 0.25s cubic-bezier(0.22,1,0.36,1)',
        transform: hover && ov && onClick ? 'translateY(-2px)' : 'translateY(0)',
        ...(hover && ov && accent==='none' ? { borderColor:'rgba(255,255,255,0.16)' } : {}),
        ...acc,
        ...style,
      }}
    >{children}</div>
  )
}

// ── Button ───────────────────────────────────────────────────────────

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
type BtnSize    = 'sm' | 'md' | 'lg'
type BtnTheme   = 'orange' | 'green'

interface BtnProps {
  children: React.ReactNode
  onClick?: () => void
  variant?: BtnVariant
  theme?: BtnTheme
  size?: BtnSize
  disabled?: boolean
  full?: boolean
  icon?: React.ReactNode
  iconRight?: React.ReactNode
  loading?: boolean
}

export function Btn({
  children, onClick, variant='primary', theme='orange',
  size='md', disabled=false, full=false, icon, iconRight, loading=false,
}: BtnProps) {
  const [ov, setOv] = useState(false)
  const [active, setActive] = useState(false)
  const c = theme==='orange' ? O : G
  const pad = size==='sm' ? '8px 16px' : size==='lg' ? '15px 32px' : '11px 22px'
  const fs  = size==='sm' ? 12 : size==='lg' ? 15 : 13
  const h   = size==='sm' ? 34 : size==='lg' ? 52 : 42

  const styles: Record<BtnVariant, CSS> = {
    primary: {
      background: `linear-gradient(140deg, ${c.accent} 0%, ${c.primary} 50%, ${c.deep} 100%)`,
      color: '#fff',
      border: 'none',
      boxShadow: ov ? `${c.shadowBtn}, inset 0 1px 0 rgba(255,255,255,0.20)` : `${c.shadowBtn}`,
    },
    secondary: {
      background: c.a10,
      color: c.accent,
      border: `1px solid ${c.border}`,
      boxShadow: ov ? `0 0 0 1px ${c.border}` : 'none',
    },
    ghost: {
      background: ov ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.04)',
      color: T.text.secondary,
      border: '1px solid rgba(255,255,255,0.10)',
    },
    danger: {
      background: ov ? 'rgba(239,68,68,0.18)' : 'rgba(239,68,68,0.12)',
      color: '#fca5a5',
      border: '1px solid rgba(239,68,68,0.28)',
    },
  }

  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      onMouseEnter={()=>setOv(true)}
      onMouseLeave={()=>{ setOv(false); setActive(false) }}
      onMouseDown={()=>setActive(true)}
      onMouseUp={()=>setActive(false)}
      style={{
        ...styles[variant],
        padding: pad,
        height: h,
        fontSize: fs,
        fontWeight: 600,
        fontFamily: 'inherit',
        borderRadius: T.r.card,
        cursor: disabled || loading ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 7,
        width: full ? '100%' : undefined,
        minWidth: 0,
        transition: 'all 0.18s ease',
        transform: active ? 'scale(0.975)' : ov ? 'translateY(-1px)' : 'none',
        letterSpacing: '-0.01em',
        whiteSpace: 'nowrap',
      }}
    >
      {loading
        ? <Spinner size={14} color={variant==='primary' ? '#fff' : c.accent} />
        : icon
      }
      {children}
      {iconRight}
    </button>
  )
}

// ── Input ────────────────────────────────────────────────────────────

interface InputProps {
  label?: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
  theme?: BtnTheme
  hint?: string
  rows?: number
  disabled?: boolean
  prefix?: React.ReactNode
  autoFocus?: boolean
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void
  rightElement?: React.ReactNode
}
export function Input({
  label,
  value,
  onChange,
  placeholder,
  type='text',
  theme='orange',
  hint,
  disabled,
  prefix,
  autoFocus,
  onKeyDown,
  rightElement,
}: InputProps) {
  const [focused, setFocused] = useState(false)
  const c = theme === 'orange' ? O : G

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
      {label && (
        <label
          style={{
            fontSize:12,
            fontWeight:600,
            color:T.text.secondary,
            letterSpacing:'0.04em',
            textTransform:'uppercase'
          }}
        >
          {label}
        </label>
      )}

      <div
        style={{
          position:'relative',
          display:'flex',
          alignItems:'center'
        }}
      >
        {prefix && (
          <div
            style={{
              position:'absolute',
              left:14,
              color:T.text.muted,
              display:'flex',
              alignItems:'center',
              zIndex:1
            }}
          >
            {prefix}
          </div>
        )}

        <input
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          autoFocus={autoFocus}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{
            width:'100%',
            height:48,
            padding: prefix
              ? rightElement
                ? '0 48px 0 40px'
                : '0 16px 0 40px'
              : rightElement
                ? '0 48px 0 16px'
                : '0 16px',
            background:focused
              ? 'rgba(255,255,255,0.06)'
              : 'rgba(255,255,255,0.04)',
            border:`1px solid ${
              focused
                ? c.border
                : 'rgba(255,255,255,0.10)'
            }`,
            borderRadius:T.r.input,
            color:T.text.primary,
            fontSize:14,
            fontFamily:'inherit',
            outline:'none',
            transition:'all 0.2s ease',
            boxShadow:focused
              ? `0 0 0 3px ${c.a10}, inset 0 1px 0 rgba(255,255,255,0.06)`
              : 'inset 0 1px 0 rgba(255,255,255,0.06)',
            opacity:disabled ? 0.5 : 1,
          }}
        />

        {rightElement && (
          <div
            style={{
              position:'absolute',
              right:10,
              display:'flex',
              alignItems:'center',
              justifyContent:'center',
            }}
          >
            {rightElement}
          </div>
        )}
      </div>

      {hint && (
        <p style={{ fontSize:11, color:T.text.muted }}>
          {hint}
        </p>
      )}
    </div>
  )
}
// ── Textarea ──────────────────────────────────────────────────────────

export function Textarea({ label, value, onChange, placeholder, theme='orange', rows=3 }: InputProps & { rows?: number }) {
  const [focused, setFocused] = useState(false)
  const c = theme==='orange' ? O : G
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
      {label && <label style={{ fontSize:12, fontWeight:600, color:T.text.secondary, letterSpacing:'0.04em', textTransform:'uppercase' }}>{label}</label>}
      <textarea
        value={value} rows={rows}
        onChange={e=>onChange(e.target.value)}
        placeholder={placeholder}
        onFocus={()=>setFocused(true)}
        onBlur={()=>setFocused(false)}
        style={{
          width:'100%', padding:'12px 16px', resize:'vertical',
          background: focused ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.04)',
          border:`1px solid ${focused ? c.border : 'rgba(255,255,255,0.10)'}`,
          borderRadius: T.r.input, color:T.text.primary, fontSize:14,
          fontFamily:'inherit', outline:'none', transition:'all 0.2s ease',
          boxShadow: focused ? `0 0 0 3px ${c.a10}` : 'none',
        }}
      />
    </div>
  )
}

// ── Option chip (toggle group item) ──────────────────────────────────

export function Chip({
  children, selected, onClick, theme='orange', icon,
}: { children: React.ReactNode; selected: boolean; onClick: () => void; theme?: BtnTheme; icon?: React.ReactNode }) {
  const c = theme==='orange' ? O : G
  return (
    <button
      onClick={onClick}
      style={{
        display:'flex', alignItems:'center', justifyContent:'center', gap:7,
        padding:'10px 16px', borderRadius: T.r.card,
        background: selected ? c.a14 : 'rgba(255,255,255,0.04)',
        border: `1px solid ${selected ? c.border : 'rgba(255,255,255,0.08)'}`,
        color: selected ? c.accent : T.text.secondary,
        fontSize:13, fontWeight: selected ? 600 : 400,
        cursor:'pointer', transition:'all 0.18s ease',
        fontFamily:'inherit',
        boxShadow: selected ? `0 0 0 1px ${c.a20}` : 'none',
      }}
    >
      {icon && <span style={{ color: selected ? c.accent : T.text.muted }}>{icon}</span>}
      {children}
    </button>
  )
}

// ── Badge ─────────────────────────────────────────────────────────────

type BadgeColor = keyof typeof S | 'default'

export function Badge({ label, color='default', dot=false }: { label: string; color?: BadgeColor; dot?: boolean }) {
  const c = color==='default'
    ? { bg:'rgba(255,255,255,0.08)', text:T.text.secondary, border:'rgba(255,255,255,0.10)' }
    : S[color as keyof typeof S]
  return (
    <span style={{
      display:'inline-flex', alignItems:'center', gap:5,
      padding:'3px 10px', borderRadius:T.r.pill,
      background:c.bg, color:c.text,
      border:`1px solid ${c.border}`,
      fontSize:11, fontWeight:600, letterSpacing:'0.03em',
      whiteSpace:'nowrap',
    }}>
      {dot && (
        <span style={{
          width:5, height:5, borderRadius:'50%',
          background:c.text, boxShadow:`0 0 5px ${c.text}`,
          display:'inline-block', flexShrink:0,
          animation:'pulse-glow 2s ease-in-out infinite',
        }}/>
      )}
      {label}
    </span>
  )
}
type OrderStatus =
  | 'received'
  | 'reviewing'
  | 'payment'
  | 'paid'
  | 'printing'
  | 'ready'
  | 'completed'
  | 'cancelled'

export function StatusBadge({ status }: { status: OrderStatus }) {
  const map: Record<OrderStatus, { label: string; color: BadgeColor; dot?: boolean }> = {
    received:  { label: 'Received',         color: 'blue' },
    reviewing: { label: 'Reviewing',        color: 'yellow', dot: true },
    payment:   { label: 'Awaiting Payment', color: 'orange', dot: true },
    paid:      { label: 'Paid',             color: 'green' },
    printing:  { label: 'Printing',         color: 'blue', dot: true },
    ready:     { label: 'Ready to Collect', color: 'green', dot: true },
    completed: { label: 'Completed',        color: 'green' },
    cancelled: { label: 'Cancelled',        color: 'red' },
  }

  const m = map[status]

  return <Badge label={m.label} color={m.color} dot={m.dot} />
}

// ── ProgressBar ───────────────────────────────────────────────────────

export function ProgressBar({ value, theme='orange', thin=false }: { value: number; theme?: BtnTheme; thin?: boolean }) {
  const c = theme==='orange' ? O : G
  return (
    <div style={{ height:thin?3:4, background:'rgba(255,255,255,0.07)', borderRadius:99, overflow:'hidden' }}>
      <div style={{
        height:'100%', width:`${value}%`,
        background:`linear-gradient(90deg, ${c.primary}, ${c.accent})`,
        borderRadius:99,
        boxShadow:`0 0 10px ${c.glow}`,
        transition:'width 0.6s cubic-bezier(0.22,1,0.36,1)',
      }}/>
    </div>
  )
}

// ── Spinner ───────────────────────────────────────────────────────────

export function Spinner({ size=20, color='#f97316' }: { size?: number; color?: string }) {
  return (
    <div style={{
      width:size, height:size, borderRadius:'50%',
      border:`${Math.max(2,size/8)}px solid rgba(255,255,255,0.12)`,
      borderTopColor: color,
      animation:'spin 0.75s linear infinite',
      flexShrink:0,
    }}/>
  )
}

// ── Step header (customer flow) ──────────────────────────────────────

export function StepHeader({ step, total, title, subtitle, theme='orange' }: { step: number; total: number; title: string; subtitle?: string; theme?: BtnTheme }) {
  const c = theme==='orange' ? O : G
  const pct = (step / total) * 100
  return (
    <div className="penter d0" style={{ marginBottom:32 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
        <span style={{ fontSize:11, fontWeight:700, color:c.accent, letterSpacing:'0.08em', textTransform:'uppercase' }}>
          Step {step} of {total}
        </span>
        <span style={{ fontSize:11, color:T.text.muted }}>{Math.round(pct)}%</span>
      </div>
      <ProgressBar value={pct} theme={theme} thin />
      <h2 style={{ fontSize:26, fontWeight:750, letterSpacing:'-0.03em', marginTop:24, lineHeight:1.15 }}>{title}</h2>
      {subtitle && <p style={{ fontSize:14, color:T.text.secondary, marginTop:6, lineHeight:1.55 }}>{subtitle}</p>}
    </div>
  )
}

// ── Divider ───────────────────────────────────────────────────────────

export function Divider({ label, style }: { label?: string; style?: CSS }) {
  if (label) return (
    <div style={{ display:'flex', alignItems:'center', gap:12, ...style }}>
      <div style={{ flex:1, height:1, background:'rgba(255,255,255,0.07)' }}/>
      <span style={{ fontSize:11, color:T.text.muted, fontWeight:500 }}>{label}</span>
      <div style={{ flex:1, height:1, background:'rgba(255,255,255,0.07)' }}/>
    </div>
  )
  return <div style={{ height:1, background:'rgba(255,255,255,0.07)', ...style }}/>
}

// ── Avatar ───────────────────────────────────────────────────────────

export function Avatar({ name, size=36, theme='green' }: { name: string; size?: number; theme?: BtnTheme }) {
  const c = theme==='green' ? G : O
  const initials = name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()
  return (
    <div style={{
      width:size, height:size, borderRadius:'50%',
      background:`linear-gradient(135deg, ${c.a20}, ${c.a10})`,
      border:`1px solid ${c.border}`,
      display:'flex', alignItems:'center', justifyContent:'center',
      fontSize:size*0.36, fontWeight:700, color:c.accent, flexShrink:0,
    }}>{initials}</div>
  )
}

// ── Skeleton block ────────────────────────────────────────────────────

export function Skel({ h=20, w, r=8, style }: { h?: number; w?: number|string; r?: number; style?: CSS }) {
  return <div className="skel" style={{ height:h, width:w ?? '100%', borderRadius:r, ...style }}/>
}

// ── Icon chip ────────────────────────────────────────────────────────

export function IconChip({
  icon, theme='orange', size=44,
}: { icon: React.ReactNode; theme?: BtnTheme; size?: number }) {
  const c = theme==='orange' ? O : G
  return (
    <div style={{
      width:size, height:size, borderRadius:T.r.md, flexShrink:0,
      background:c.a10, border:`1px solid ${c.border}`,
      display:'flex', alignItems:'center', justifyContent:'center',
      color:c.accent,
    }}>{icon}</div>
  )
}

// ── Modal ────────────────────────────────────────────────────────────

export function Modal({ open, onClose, title, children, width=500 }: {
  open: boolean; onClose: () => void; title: string;
  children: React.ReactNode; width?: number
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key==='Escape') onClose() }
    document.addEventListener('keydown', handler)
    return ()=>document.removeEventListener('keydown', handler)
  }, [onClose])

  if (!open) return null
  return (
    <div
      onClick={onClose}
      style={{
        position:'fixed', inset:0, zIndex:1000,
        background:'rgba(0,0,0,0.65)', backdropFilter:'blur(8px)',
        display:'flex', alignItems:'center', justifyContent:'center', padding:24,
        animation:'fade-in 0.2s ease',
      }}
    >
      <div
        onClick={e=>e.stopPropagation()}
        className="glass"
        style={{
          width:'100%', maxWidth:width, borderRadius:T.r.modal,
          animation:'scale-in 0.24s cubic-bezier(0.22,1,0.36,1)',
        }}
      >
        <div style={{ padding:'20px 24px', borderBottom:'1px solid rgba(255,255,255,0.08)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <h3 style={{ fontSize:16, fontWeight:700 }}>{title}</h3>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:T.text.muted, display:'flex', padding:4 }}>
            <X size={18}/>
          </button>
        </div>
        <div style={{ padding:24 }}>{children}</div>
      </div>
    </div>
  )
}

// ── Drag & drop file zone ────────────────────────────────────────────

interface DZProps {
  onFiles: (files: FileList) => void
  children: React.ReactNode
  style?: CSS
  theme?: BtnTheme
}

export function DropZone({ onFiles, children, style, theme='orange' }: DZProps) {
  const [drag, setDrag] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handle = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type==='dragenter'||e.type==='dragover') setDrag(true)
    else if (e.type==='dragleave'||e.type==='drop') { setDrag(false) }
    if (e.type==='drop' && e.dataTransfer.files.length) onFiles(e.dataTransfer.files)
  }, [onFiles])

  return (
    <div
      onDragEnter={handle} onDragOver={handle}
      onDragLeave={handle} onDrop={handle}
      onClick={()=>inputRef.current?.click()}
      className={drag ? 'dz-active' : ''}
      style={{
        cursor:'pointer', borderRadius:T.r.card,
        border:`2px dashed ${drag ? (theme==='orange' ? O.borderStrong : G.borderStrong) : 'rgba(255,255,255,0.12)'}`,
        transition:'all 0.22s ease',
        ...style,
      }}
    >
      {children}
      <input
        ref={inputRef} type="file" multiple style={{ display:'none' }}
        accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xlsx,.pptx"
        onChange={e=>e.target.files&&onFiles(e.target.files)}
      />
    </div>
  )
}

// ── Info alert ───────────────────────────────────────────────────────

export function InfoAlert({ children, color='blue' }: { children: React.ReactNode; color?: BadgeColor }) {
  const c = color==='default' ? S.blue : S[color as keyof typeof S] ?? S.blue
  return (
    <div style={{
      display:'flex', gap:10, alignItems:'flex-start',
      background:c.bg, border:`1px solid ${c.border}`,
      borderRadius:T.r.card, padding:'12px 16px',
    }}>
      <Info size={14} color={c.text} style={{ flexShrink:0, marginTop:1 }}/>
      <p style={{ fontSize:13, color:c.text, lineHeight:1.55 }}>{children}</p>
    </div>
  )
}

// ── Toggle switch ────────────────────────────────────────────────────

export function Toggle({ on, onChange, theme='green' }: { on: boolean; onChange: (v:boolean)=>void; theme?: BtnTheme }) {
  const c = theme==='green' ? G : O
  return (
    <button
      onClick={()=>onChange(!on)}
      style={{
        width:44, height:24, borderRadius:999,
        background: on ? c.primary : 'rgba(255,255,255,0.10)',
        border:'none', cursor:'pointer', position:'relative',
        transition:'background 0.2s ease', flexShrink:0,
        boxShadow: on ? `0 0 12px ${c.glow}` : 'none',
      }}
    >
      <div style={{
        position:'absolute', top:3, left: on ? 23 : 3,
        width:18, height:18, borderRadius:'50%', background:'#fff',
        transition:'left 0.2s cubic-bezier(0.22,1,0.36,1)',
        boxShadow:'0 1px 4px rgba(0,0,0,0.35)',
      }}/>
    </button>
  )
}

// ── Number stepper ───────────────────────────────────────────────────

export function Stepper({ 
  value, onChange, min=1, max=99, theme='orange', size='md' 
}: { 
  value:number; onChange:(v:number)=>void; min?:number; max?:number; theme?: BtnTheme; size?: 'sm' | 'md' 
}) {
  const c = theme==='orange' ? O : G
  const isSm = size === 'sm'
  const btnS = isSm ? 24 : 36
  const fs = isSm ? 14 : 18
  const w = isSm ? 32 : 44

  return (
    <div style={{ display:'flex', alignItems:'center', gap:isSm ? 2 : 4 }}>
      <button
        type="button"
        onClick={(e)=>{ e.stopPropagation(); onChange(Math.max(min,value-1)) }}
        style={{ width:btnS, height:btnS, borderRadius:isSm ? 6 : T.r.md, background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.10)', color:T.text.secondary, fontSize:fs, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', transition:'all 0.15s', fontFamily:'inherit' }}
      >−</button>
      <span style={{ width:w, textAlign:'center', fontSize:isSm ? 13 : 18, fontWeight:700, fontFamily:'inherit' }}>{value}</span>
      <button
        type="button"
        onClick={(e)=>{ e.stopPropagation(); onChange(Math.min(max,value+1)) }}
        style={{ width:btnS, height:btnS, borderRadius:isSm ? 6 : T.r.md, background:c.a10, border:`1px solid ${c.border}`, color:c.accent, fontSize:fs, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', transition:'all 0.15s', fontFamily:'inherit' }}
      >+</button>
    </div>
  )
}

// ── Table ────────────────────────────────────────────────────────────

interface Col<T> { key: string; label: React.ReactNode; render?: (row: T) => React.ReactNode; width?: number|string; align?: 'left'|'right'|'center' }

export function Table<T extends Record<string,unknown>>({
  rows, cols, onRow, emptyState, loading=false,
}: { rows: T[]; cols: Col<T>[]; onRow?: (row: T) => void; emptyState?: React.ReactNode; loading?: boolean }) {
  return (
    <div style={{ width:'100%' }}>
      {/* Header */}
      <div style={{
        display:'grid', gridTemplateColumns: cols.map(c=>c.width ?? '1fr').join(' '),
        gap:16, padding:'10px 20px',
        borderBottom:'1px solid rgba(255,255,255,0.07)',
      }}>
        {cols.map(c=>(
          <div key={c.key} style={{ fontSize:10, fontWeight:700, color:T.text.muted, letterSpacing:'0.08em', textTransform:'uppercase', textAlign:c.align }}>
            {c.label}
          </div>
        ))}
      </div>
      {/* Rows */}
      {loading ? (
        Array.from({length:4}).map((_,i)=>(
          <div key={i} style={{ padding:'14px 20px', display:'grid', gridTemplateColumns: cols.map(c=>c.width ?? '1fr').join(' '), gap:16 }}>
            {cols.map((_c,j)=><Skel key={j} h={18}/>)}
          </div>
        ))
      ) : rows.length===0 ? (
        <div style={{ padding:'48px 20px', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:8 }}>
          {emptyState}
        </div>
      ) : rows.map((row,i)=>(
        <div
          key={i}
          onClick={()=>onRow?.(row)}
          style={{
            display:'grid', gridTemplateColumns: cols.map(c=>c.width ?? '1fr').join(' '),
            gap:16, padding:'13px 20px',
            borderBottom: i < rows.length-1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
            cursor: onRow ? 'pointer' : 'default',
            transition:'background 0.15s',
            alignItems:'center',
          }}
          onMouseEnter={e=>{if(onRow)(e.currentTarget as HTMLElement).style.background='rgba(255,255,255,0.03)'}}
          onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background='transparent'}}
        >
          {cols.map(c=>(
            <div key={c.key} style={{ textAlign:c.align, minWidth:0 }}>
              {c.render ? c.render(row) : String(row[c.key] ?? '')}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

// ── SVG Bar chart ─────────────────────────────────────────────────────

export function BarChart({ data, theme='green', height=120 }: {
  data: { label: string; value: number; highlight?: boolean }[]
  theme?: BtnTheme
  height?: number
}) {
  const c = theme==='green' ? G : O
  const max = Math.max(...data.map(d=>d.value), 1)
  return (
    <div style={{ display:'flex', alignItems:'flex-end', gap:6, height }}>
      {data.map((d,i)=>{
        const pct = (d.value / max) * 100
        return (
          <div key={i} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:6 }}>
            <div style={{ position:'relative', width:'100%', height:height-28, display:'flex', alignItems:'flex-end' }}>
              <div
                className="bar-animate"
                style={{
                  animationDelay:`${i*0.05}s`,
                  width:'100%',
                  height:`${pct}%`,
                  background: d.highlight
                    ? `linear-gradient(180deg, ${c.accent} 0%, ${c.primary} 100%)`
                    : `linear-gradient(180deg, ${c.a20} 0%, ${c.a10} 100%)`,
                  borderRadius:'5px 5px 0 0',
                  boxShadow: d.highlight ? `0 0 16px ${c.glow}` : 'none',
                  border: `1px solid ${d.highlight ? c.border : 'rgba(255,255,255,0.06)'}`,
                  transition:'height 0.4s cubic-bezier(0.22,1,0.36,1)',
                }}
              />
            </div>
            <span style={{ fontSize:10, color:T.text.muted, fontWeight:500, letterSpacing:'0.02em' }}>{d.label}</span>
          </div>
        )
      })}
    </div>
  )
}

// ── Stat card ────────────────────────────────────────────────────────

export function StatCard({
  label, value, sub, icon, color, loading=false,
}: { label:string; value:string; sub?:string; icon:React.ReactNode; color:'orange'|'green'|'blue'|'purple'|'red'|'yellow'; loading?:boolean }) {
  const colorMap = {
    orange: { bg:O.a10, border:O.border, text:O.accent, glow:O.shadowCard },
    green:  { bg:G.a10, border:G.border, text:G.accent, glow:G.shadowCard },
    blue:   { bg:S.blue.bg, border:S.blue.border, text:S.blue.text, glow:'0 0 20px rgba(59,130,246,0.10)' },
    purple: { bg:S.purple.bg, border:S.purple.border, text:S.purple.text, glow:'0 0 20px rgba(168,85,247,0.10)' },
    red:    { bg:S.red.bg, border:S.red.border, text:S.red.text, glow:'0 0 20px rgba(239,68,68,0.10)' },
    yellow: { bg:S.yellow.bg, border:S.yellow.border, text:S.yellow.text, glow:'0 0 20px rgba(234,179,8,0.10)' },
  }
  const c = colorMap[color]

  return (
    <div className="glass" style={{ borderRadius:T.r.card, padding:'20px 22px' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:16 }}>
        <div style={{ width:40, height:40, borderRadius:T.r.md, background:c.bg, border:`1px solid ${c.border}`, display:'flex', alignItems:'center', justifyContent:'center', color:c.text }}>
          {icon}
        </div>
        {sub && !loading && <span style={{ fontSize:11, fontWeight:600, color: sub.startsWith('+') ? G.accent : T.text.muted }}>{sub}</span>}
        {sub && loading && <Skel h={14} w={40}/>}
      </div>
      {loading
        ? <><Skel h={28} w="60%" style={{ marginBottom:6 }}/><Skel h={14} w="50%"/></>
        : <>
            <div style={{ fontSize:26, fontWeight:800, letterSpacing:'-0.04em', marginBottom:4 }}>{value}</div>
            <div style={{ fontSize:12, color:T.text.secondary, fontWeight:500 }}>{label}</div>
          </>
      }
    </div>
  )
}

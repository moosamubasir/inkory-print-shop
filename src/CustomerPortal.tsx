import React, { useState, useEffect, useRef, useCallback } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
// Vite-specific worker import so pdfjs-dist can actually parse PDFs in the
// browser. Without this, getDocument() fails silently / throws in most
// Vite + pdfjs-dist setups because no worker script is registered.
// @ts-ignore - '?url' import handled by Vite, not by the TS type checker
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import {
  Printer, Upload, FileText, Camera, ArrowRight, ArrowLeft,
  Check, Star, ChevronRight, X, Plus, RotateCw, ZoomIn, ZoomOut,
  Crop, Maximize2, Grid3X3, AlertCircle, QrCode, Sparkles,
  Image, FileImage, Clock, Banknote, Package2, CheckCircle2,
  RefreshCw, ScanLine, FilePlus, LayoutGrid, Columns,
  Tag, MessageCircle, Mail,
} from 'lucide-react'
import {
  CustomerBg, Card, Btn, Input, Chip, Badge, StatusBadge,
  ProgressBar, Spinner, StepHeader, Divider, DropZone, InfoAlert,
  Stepper, Avatar, IconChip, Skel,
} from './ui'
import { O, T } from './tokens'
import { MergedEditorScreen } from './MergedEditorScreen'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl

// ─── Office Document Helpers ─────────────────────────────────────────

/** Loads JSZip from CDN if not already available. */
async function loadJSZip(): Promise<any> {
  if ((window as any).JSZip) return (window as any).JSZip;
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
    script.onload = () => resolve((window as any).JSZip);
    script.onerror = () => reject(new Error('Failed to load JSZip'));
    document.head.appendChild(script);
  });
}

/** Best-effort page/slide detection for Office files (.docx, .pptx) using metadata. */
async function detectOfficePages(file: File): Promise<number> {
  try {
    const JSZip = await loadJSZip();
    const zip = await JSZip.loadAsync(file);
    
    // For Word (.docx)
    const appXml = await zip.file("docProps/app.xml")?.async("text");
    if (appXml) {
      // <Pages>128</Pages> for Word, or <Slides>10</Slides> for PPTX
      const pageMatch = appXml.match(/<Pages>(\d+)<\/Pages>/);
      const slideMatch = appXml.match(/<Slides>(\d+)<\/Slides>/);
      
      if (pageMatch) return Math.max(1, parseInt(pageMatch[1], 10));
      if (slideMatch) return Math.max(1, parseInt(slideMatch[1], 10));
    }
  } catch (e) {
    console.error("Error detecting Office pages:", e);
  }
  return 1;
}

// ─── Types ───────────────────────────────────────────────────────────

type CScreen =
  'splash' | 'welcome' | 'name' | 'service' |
  'upload' | 'print-opts' | 'image-edit' |
  'passport-upload' | 'passport-edit' |
  'price' | 'waiting' | 'live-status' | 'bill' | 'done'

export type Service = 'document' | 'passport'
export type ColorMode = 'bw' | 'color'
export type PaperSize = 'A4' | 'A3'
export type Sides = 'single' | 'double'
export type PassportOrientation = 'portrait' | 'landscape'
export type OrderStatus =
  | 'received' | 'files_reviewed' | 'printing'
  | 'ready_for_collection' | 'completed'

export interface UpFile {
  id: string
  name: string
  size: number
  type: string
  preview?: string
  pages: number
  copies: number
  color: ColorMode
  paper: PaperSize
  sides: Sides
  file:File
}

export interface PrintOpts {
  color: ColorMode; paper: PaperSize; copies: number; sides: Sides
}

export interface CustomerOrder {
  id: string
  name: string
  service: Service
  files: UpFile[]
  totalPages: number
  opts: PrintOpts
  passportCopies?: number
  passportOrientation?: PassportOrientation
  amount: number
  status: OrderStatus

}

// ─── Helpers ─────────────────────────────────────────────────────────

function fmtSize(b: number) {
  return b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.round(b / 1e3)} KB`
}

// ─── Centralized Pricing Configuration ────────────────────────────────
// Single source of truth for every price shown or calculated anywhere in
// the customer app. Every screen below (Print Options, the real-time
// Estimated Amount, the Estimated Price screen, and the Bill) reads
// through the helpers below instead of hard-coding its own formula.
// When the Admin Settings page is built, it can simply write into this
// object (or replace it with a fetched config) and every customer screen
// updates automatically — no other code needs to change.
// ─── Backend API Configuration ────────────────────────────────────────
// Change the IP here if the computer's local network IP changes.
// All frontend API requests should use this value.

export const API_BASE_URL = 'http://192.168.221.245:5000'
export const PRICING = {
  document: {
    A4: {
      bw: { single: 3, double: 4 },
      color: { single: 10, double: 18 },
    },
    A3: {
      bw: { single: 3, double: 4 }, 
      color: { single: 10, double: 18 },
    },
  },
  passport: {
    // Two official tiers for now. This will be replaced with proper
    // per-sheet logic when the Passport flow is redesigned.
    tier1: { photos: 5, price: 60 },
    tier2: { photos: 8, price: 90 },
  },
} as const

// ─── Centralized Shop Contact Configuration ───────────────────────────
// Single source of truth for Inkory's contact details. Inkory is
// the digital ordering system used BY Inkory — this config is what
// every contact button (WhatsApp Us / Email Us) and the Services & Prices
// popup reads from, so the number/email/name only ever needs to be updated
// in ONE place if it ever changes.
export const SHOP_CONFIG = {
  shopName: "Inkory",
  whatsapp: '918494892213',
  displayPhone: '+91 84948 92213',
  email: 'moosa.sstore.24@gmail.com',
} as const

/** Real total page count across every uploaded file (images = 1 page each,
 * PDFs = actual pdf.numPages detected on upload). This is the ONLY place
 * total pages should ever be derived from — never recompute it locally. */
export function totalPagesOf(files: UpFile[]): number {
  return files.reduce((sum, file) => sum + (file.pages || 1), 0)
}

function getDocUnitPrice(paper: PaperSize, color: ColorMode, sides: Sides): number {
  return PRICING.document[paper][color][sides]
}

/** Calculates one file independently so each uploaded document can have
 * its own copy count. Double-sided printing is charged per physical sheet. */
export function calcFilePrice(opts: PrintOpts, file: UpFile): number {
  const unit = getDocUnitPrice(opts.paper, opts.color, opts.sides)
  const units = opts.sides === 'single' ? (file.pages || 1) : Math.ceil((file.pages || 1) / 2)
  return units * unit * Math.max(1, file.copies || 1)
}

/** Total document price: sum of every file's independent copy quantity. */
export function calcDocumentPrice(opts: PrintOpts, files: UpFile[]): number {
  return files.reduce((sum, file) => sum + calcFilePrice(opts, file), 0)
}

/** Passport pricing: 5 photos = ₹60, 8 photos = ₹90. */
export function calcPassportPrice(photoCount: number): number {
  return photoCount <= PRICING.passport.tier1.photos
    ? PRICING.passport.tier1.price
    : PRICING.passport.tier2.price
}

/** One shared entry point used everywhere an order total is needed:
 * Print Options, Estimated Price, the Bill, and order submission. */
export function calcOrderPrice(
  service: Service,
  opts: PrintOpts,
  files: UpFile[],
  passportCopies: number = 6,
): number {
  return service === 'passport'
    ? calcPassportPrice(passportCopies)
    : calcDocumentPrice(opts, files)
}

/** Human-readable calculation string, e.g. "4 pages × ₹3 × 1 copy = ₹12"
 * or, for double-sided, "5 pages → 3 sheets × ₹4 × 2 copies = ₹24". */
function formatPriceBreakdown(opts: PrintOpts, files: UpFile[]): string {
  const amount = calcDocumentPrice(opts, files)
  return files.map(file => {
    const units = opts.sides === 'single' ? (file.pages || 1) : Math.ceil((file.pages || 1) / 2)
    const unitLabel = opts.sides === 'single' ? 'pages' : 'sheets'
    return `${file.name}: ${units} ${unitLabel} × ${file.copies} ${file.copies === 1 ? 'copy' : 'copies'}`
  }).join(' · ') + ` = ₹${amount}`
}

// ─── QR code SVG (mock) ──────────────────────────────────────────────

function QrMock() {
  return (
    <svg width="160" height="160" viewBox="0 0 160 160" fill="none">
      <rect width="160" height="160" rx="12" fill="rgba(255,255,255,0.04)" stroke="rgba(249,115,22,0.25)" strokeWidth="1"/>
      {/* Finder patterns */}
      {[[8,8],[104,8],[8,104]].map(([x,y],i)=>(
        <g key={i}>
          <rect x={x} y={y} width="44" height="44" rx="6" fill="none" stroke="rgba(249,115,22,0.6)" strokeWidth="3"/>
          <rect x={x+8} y={y+8} width="28" height="28" rx="3" fill={O.a20}/>
          <rect x={x+14} y={y+14} width="16" height="16" rx="2" fill={O.primary}/>
        </g>
      ))}
      {/* Data modules (mock) */}
      {Array.from({length:48}).map((_,i)=>{
        const col = (i % 8) * 10 + 60
        const row = Math.floor(i / 8) * 10 + 24
        if (col > 140 || row > 140) return null
        return Math.random() > 0.5
          ? <rect key={i} x={col} y={row} width="7" height="7" rx="1.5" fill={`rgba(249,115,22,${0.3 + Math.random()*0.5})`}/>
          : null
      })}
      {/* Logo center */}
      <rect x="68" y="68" width="24" height="24" rx="6" fill={O.primary}/>
      <text x="80" y="84" textAnchor="middle" fill="white" fontSize="13" fontWeight="700">P</text>
    </svg>
  )
}

// ─── Splash ───────────────────────────────────────────────────────────

function SplashScreen({ onNext }: { onNext: () => void }) {
  useEffect(() => { const t = setTimeout(onNext, 3000); return ()=>clearTimeout(t) }, [onNext])
  return (
    <div style={{ position:'relative', zIndex:1, minHeight:'100vh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:0, padding:24 }}>
      <CustomerBg />
      <div className="penter" style={{ position:'relative', zIndex:1, textAlign:'center' }}>
        {/* Animated rings */}
        <div style={{ position:'relative', width:120, height:120, margin:'0 auto 32px' }}>
          {[0,1,2].map(i=>(
            <div key={i} style={{
              position:'absolute', inset:0, borderRadius:'50%',
              border:`1px solid ${O.border}`,
              animation:`ring-expand 2.4s ease-out ${i*0.8}s infinite`,
            }}/>
          ))}
          <div style={{
            position:'absolute', inset:10,
            background:`linear-gradient(135deg, ${O.accent} 0%, ${O.primary} 60%, ${O.deep} 100%)`,
            borderRadius:'50%',
            display:'flex', alignItems:'center', justifyContent:'center',
            boxShadow:`0 0 60px ${O.glow}, 0 0 20px ${O.glow}`,
          }}>
            <Printer size={44} color="#fff" strokeWidth={1.8}/>
          </div>
        </div>

        <h1 style={{ fontSize:44, fontWeight:800, letterSpacing:'-0.04em', marginBottom:8, lineHeight:1 }}>
          {SHOP_CONFIG.shopName}
        </h1>
        <p style={{ fontSize:15, color:O.accent, fontWeight:500, marginBottom:40 }}>Premium Print Services</p>

        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:6, color:T.text.muted, fontSize:13 }}>
          <ScanLine size={14}/>
          <span>Scan to continue</span>
        </div>
        <div style={{ display:'flex', gap:6, justifyContent:'center', marginTop:32 }}>
          {[0,1,2].map(i=>(
            <div key={i} style={{
              width:7, height:7, borderRadius:'50%',
              background: i===0 ? O.primary : 'rgba(255,255,255,0.15)',
              animation:`bounce-dot 1.4s ease-in-out ${i*0.2}s infinite`,
            }}/>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Services & Prices Popup ───────────────────────────────────────────
// Informational only — nothing in here is clickable-to-order.
// The menu design is intentionally data-driven so the same structure
// can later be connected directly to the Admin Menu Sync system.

// ─── Services & Prices Popup ───────────────────────────────────────────
// Customer-facing menu.
// Menu data is loaded from the backend database through /api/menu.

function ServicesPricesModal({ onClose }: { onClose: () => void }) {

  const [categories, setCategories] = useState<any[]>([])
  const [menuLoading, setMenuLoading] = useState(true)
  const [menuError, setMenuError] = useState<string | null>(null)

  const overlayRef = useRef<HTMLDivElement>(null)

  // ─────────────────────────────────────────────
  // LOAD MENU FROM BACKEND
  // ─────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false

    const loadMenu = async () => {
      try {
        setMenuLoading(true)
        setMenuError(null)

        const response = await fetch(
          `${API_BASE_URL}/api/menu`
        )

        const data = await response.json()

        if (!response.ok || !data.success) {
          throw new Error(
            data.message || 'Unable to load menu.'
          )
        }

        if (!cancelled) {
          setCategories(data.categories || [])
        }

      } catch (error) {
        console.error('Menu loading failed:', error)

        if (!cancelled) {
          setMenuError(
            'Unable to load the menu. Please try again.'
          )
        }

      } finally {
        if (!cancelled) {
          setMenuLoading(false)
        }
      }
    }

    loadMenu()

    return () => {
      cancelled = true
    }
  }, [])


  // ─────────────────────────────────────────────
  // CLOSE ON BACKDROP
  // ─────────────────────────────────────────────

  const handleOverlayMouseDown = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) {
      onClose()
    }
  }


  // ─────────────────────────────────────────────
  // ESC TO CLOSE
  // ─────────────────────────────────────────────

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', onKey)

    return () => {
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])


  // ─────────────────────────────────────────────
  // PRICE FORMATTER
  // ─────────────────────────────────────────────

  const formatPrice = (price: number) => {
    return `₹${Number(price).toLocaleString('en-IN')}`
  }


  // ─────────────────────────────────────────────
  // UNIT FORMATTER
  // ─────────────────────────────────────────────

  const formatUnit = (unit?: string | null) => {
    if (!unit) return ''

    const units: Record<string, string> = {
      page: 'Per page',
      sheet: 'Per sheet',
      card: 'Per card',
      set: 'Per set',
      document: 'Per document',
      photo: 'Per photo',
      piece: 'Per piece',
    }

    return units[unit.toLowerCase()] || `Per ${unit}`
  }


  return (
    <div
      ref={overlayRef}
      onMouseDown={handleOverlayMouseDown}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        background: 'rgba(6,4,10,0.76)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        padding: 0,
      }}
    >

      {/* Main menu panel */}
      <div
        className="penter"
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 520,
          maxHeight: '90vh',
          margin: '0 auto',

          background:
            'linear-gradient(180deg, rgba(25,16,10,0.99), rgba(9,7,13,0.99))',

          border: `1px solid ${O.border}`,
          borderBottom: 'none',

          borderRadius: '24px 24px 0 0',

          boxShadow:
            `0 -14px 70px rgba(0,0,0,0.65),
             inset 0 1px 0 rgba(255,255,255,0.08),
             0 0 50px ${O.glowLg}`,

          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >

        {/* Grabber */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            paddingTop: 10,
            paddingBottom: 4,
            flexShrink: 0,
          }}
        >
          <div
            style={{
              width: 38,
              height: 4,
              borderRadius: 999,
              background: 'rgba(255,255,255,0.18)',
            }}
          />
        </div>


        {/* Header */}
        <div
          style={{
            padding: '14px 20px 18px',
            borderBottom: '1px solid rgba(255,255,255,0.07)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
          }}
        >

          <div
            style={{
              minWidth: 0,
              paddingRight: 12,
            }}
          >
            <div
              style={{
                fontSize: 19,
                fontWeight: 800,
                letterSpacing: '-0.025em',
                color: T.text.primary,
              }}
            >
              {SHOP_CONFIG.shopName}
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                marginTop: 4,
              }}
            >
              <div
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: O.primary,
                  boxShadow: `0 0 8px ${O.glow}`,
                }}
              />

              <div
                style={{
                  fontSize: 13,
                  color: O.accent,
                  fontWeight: 650,
                }}
              >
                Services & Prices
              </div>
            </div>

            <div
              style={{
                fontSize: 10,
                color: T.text.muted,
                marginTop: 5,
              }}
            >
              Powered by Inkory
            </div>
          </div>


          {/* Close */}
          <button
            onClick={onClose}
            aria-label="Close services and prices"
            style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              flexShrink: 0,

              background: O.a10,
              border: `1px solid ${O.border}`,

              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',

              color: T.text.secondary,
              cursor: 'pointer',

              transition: 'all 0.18s ease',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = O.a18
              e.currentTarget.style.color = T.text.primary
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = O.a10
              e.currentTarget.style.color = T.text.secondary
            }}
          >
            <X size={17} />
          </button>

        </div>


        {/* ─────────────────────────────────────
            MENU CONTENT
        ───────────────────────────────────── */}

        <div
          style={{
            padding: '18px 18px 30px',
            overflowY: 'auto',
            WebkitOverflowScrolling: 'touch',
          }}
        >

          {/* Loading */}
          {menuLoading && (
            <div
              style={{
                minHeight: 220,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 12,
              }}
            >
              <RefreshCw
                size={22}
                color={O.accent}
                style={{
                  animation: 'spin 1s linear infinite',
                }}
              />

              <div
                style={{
                  fontSize: 13,
                  color: T.text.secondary,
                }}
              >
                Loading services...
              </div>
            </div>
          )}


          {/* Error */}
          {!menuLoading && menuError && (
            <div
              style={{
                minHeight: 220,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                textAlign: 'center',
                padding: 20,
              }}
            >
              <AlertCircle
                size={24}
                color="#fca5a5"
              />

              <div
                style={{
                  fontSize: 13,
                  color: '#fca5a5',
                }}
              >
                {menuError}
              </div>

              <button
                onClick={() => window.location.reload()}
                style={{
                  marginTop: 4,
                  padding: '9px 14px',
                  borderRadius: 10,
                  border: `1px solid ${O.border}`,
                  background: O.a10,
                  color: O.accent,
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: 650,
                }}
              >
                Retry
              </button>
            </div>
          )}


          {/* Empty menu */}
          {!menuLoading &&
            !menuError &&
            categories.length === 0 && (
              <div
                style={{
                  minHeight: 220,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  textAlign: 'center',
                  color: T.text.muted,
                  fontSize: 13,
                }}
              >
                No services are currently available.
              </div>
            )}


          {/* Categories */}
          {!menuLoading &&
            !menuError &&
            categories.map((category: any, categoryIndex: number) => (

              <div
                key={category.id ?? category.name}
                style={{
                  marginBottom:
                    categoryIndex === categories.length - 1
                      ? 0
                      : 22,
                }}
              >

                {/* Category heading */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 9,
                    marginBottom: 9,
                    paddingLeft: 2,
                  }}
                >

                  <div
                    style={{
                      width: 3,
                      height: 16,
                      borderRadius: 999,
                      background: O.primary,
                      boxShadow: `0 0 10px ${O.glow}`,
                      flexShrink: 0,
                    }}
                  />

                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 750,
                      color: O.accent,
                      letterSpacing: '0.055em',
                      textTransform: 'uppercase',
                    }}
                  >
                    {category.name}
                  </div>

                </div>


                {/* Category card */}
                <div
                  style={{
                    background:
                      'linear-gradient(180deg, rgba(255,255,255,0.055), rgba(255,255,255,0.025))',

                    border:
                      '1px solid rgba(255,255,255,0.085)',

                    borderRadius: 16,

                    overflow: 'hidden',

                    boxShadow:
                      'inset 0 1px 0 rgba(255,255,255,0.045)',
                  }}
                >

                  {(category.items || []).map(
                    (item: any, itemIndex: number) => (

                      <div
                        key={item.id ?? item.name}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 14,
                          padding: '13px 14px',

                          borderBottom:
                            itemIndex ===
                            category.items.length - 1
                              ? 'none'
                              : '1px solid rgba(255,255,255,0.055)',
                        }}
                      >

                        {/* Service name */}
                        <div
                          style={{
                            minWidth: 0,
                            flex: 1,
                          }}
                        >
                          <div
                            style={{
                              fontSize: 13,
                              fontWeight: 550,
                              color: T.text.primary,
                              lineHeight: 1.35,
                            }}
                          >
                            {item.name}
                          </div>

                          {item.description && (
                            <div
                              style={{
                                fontSize: 10,
                                color: T.text.muted,
                                marginTop: 3,
                              }}
                            >
                              {item.description}
                            </div>
                          )}

                          {item.unit && (
                            <div
                              style={{
                                fontSize: 10,
                                color: T.text.muted,
                                marginTop: 3,
                              }}
                            >
                              {formatUnit(item.unit)}
                            </div>
                          )}
                        </div>


                        {/* Price */}
                        <div
                          style={{
                            flexShrink: 0,
                            textAlign: 'right',
                          }}
                        >
                          <div
                            style={{
                              fontSize: 14,
                              fontWeight: 800,
                              color: O.accent,
                              letterSpacing: '-0.01em',
                            }}
                          >
                            {formatPrice(item.price)}
                          </div>
                        </div>

                      </div>

                    )
                  )}

                </div>

              </div>

            ))}

        </div>

      </div>
    </div>
  )
}
// ─── Welcome ──────────────────────────────────────────────────────────
function WelcomeScreen({ onNext }: { onNext: () => void }) {
  const [showServices, setShowServices] = useState(false)

  const openWhatsApp = () => {
    const message = encodeURIComponent(
      `Hi, I need help with ${SHOP_CONFIG.shopName}.`
    )
    // wa.me works correctly on both mobile (opens the WhatsApp app) and
    // desktop (opens WhatsApp Web) — no raw technical URL is ever shown
    // to the customer, it's only used internally as the link target.
    window.open(`https://wa.me/${SHOP_CONFIG.whatsapp}?text=${message}`, '_blank')
  }

  const openEmail = () => {
    const subject = encodeURIComponent(`${SHOP_CONFIG.shopName} Support`)
    const body = encodeURIComponent(`Hi, I need help with ${SHOP_CONFIG.shopName}.`)
    window.location.href = `mailto:${SHOP_CONFIG.email}?subject=${subject}&body=${body}`
  }

  return (
    <div
      style={{
        position: 'relative',
        zIndex: 1,
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <CustomerBg />

      <div
        style={{
          position: 'relative',
          zIndex: 1,
          width: '100%',
          maxWidth: 520,
          margin: '0 auto',
          padding: '32px 20px 24px',
          minHeight: '100dvh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* HEADER */}
        <div
          className="penter d0"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 11,
            marginBottom: 42,
          }}
        >
          <div
            style={{
              width: 42,
              height: 42,
              borderRadius: 13,
              background: `linear-gradient(135deg, ${O.accent}, ${O.deep})`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: `0 0 24px ${O.glow}`,
            }}
          >
            <Printer
              size={21}
              color="#fff"
              strokeWidth={2}
            />
          </div>

          <div>
            <div
              style={{
                fontSize: 18,
                fontWeight: 800,
                letterSpacing: '-0.03em',
              }}
            >
              {SHOP_CONFIG.shopName}
            </div>

            <div
              style={{
                fontSize: 10,
                color: T.text.muted,
                marginTop: 1,
              }}
            >
              Smart Print Service
            </div>
          </div>
        </div>

        {/* HERO */}
        <div
          className="penter d1"
          style={{
            marginBottom: 30,
          }}
        >
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '5px 11px',
              borderRadius: T.r.pill,
              background: O.a10,
              border: `1px solid ${O.border}`,
              marginBottom: 17,
            }}
          >
            <Sparkles
              size={11}
              color={O.accent}
            />

            <span
              style={{
                color: O.accent,
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              Quick & easy printing
            </span>
          </div>

          <h1
            style={{
              fontSize: 34,
              lineHeight: 1.08,
              fontWeight: 800,
              letterSpacing: '-0.045em',
              marginBottom: 13,
            }}
          >
            What would you
            <br />
            like to{' '}
            <span
              style={{
                color: O.accent,
              }}
            >
              print?
            </span>
          </h1>

          <p
            style={{
              fontSize: 13,
              lineHeight: 1.65,
              color: T.text.secondary,
              maxWidth: 380,
            }}
          >
            Upload your files, choose your print settings and submit your
            order directly to the print counter.
          </p>
        </div>

        {/* SERVICES */}
        <div
          className="penter d2"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            marginBottom: 26,
          }}
        >
          {/* DOCUMENT PRINTING */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              padding: '14px 16px',
              borderRadius: T.r.card,
              background: 'rgba(255,255,255,0.045)',
              border: '1px solid rgba(255,255,255,0.09)',
            }}
          >
            <IconChip
              icon={<FileText size={18} />}
              theme="orange"
              size={40}
            />

            <div
              style={{
                flex: 1,
              }}
            >
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 650,
                  marginBottom: 3,
                }}
              >
                Document Printing
              </div>

              <div
                style={{
                  fontSize: 11,
                  color: T.text.secondary,
                }}
              >
                PDF, Word, images & more
              </div>
            </div>

            <ChevronRight
              size={16}
              color={T.text.muted}
            />
          </div>

          {/* PASSPORT PHOTOS */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              padding: '14px 16px',
              borderRadius: T.r.card,
              background: 'rgba(255,255,255,0.045)',
              border: '1px solid rgba(255,255,255,0.09)',
            }}
          >
            <IconChip
              icon={<Camera size={18} />}
              theme="orange"
              size={40}
            />

            <div
              style={{
                flex: 1,
              }}
            >
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 650,
                  marginBottom: 3,
                }}
              >
                Passport Photos
              </div>

              <div
                style={{
                  fontSize: 11,
                  color: T.text.secondary,
                }}
              >
                35×45mm passport photo printing
              </div>
            </div>

            <ChevronRight
              size={16}
              color={T.text.muted}
            />
          </div>
        </div>

        {/* START BUTTON */}
        <div
          className="penter d3"
          style={{
            marginTop: 'auto',
            paddingTop: 20,
          }}
        >
          <Btn
            onClick={onNext}
            theme="orange"
            size="lg"
            full
            iconRight={<ArrowRight size={17} />}
          >
            Start My Order
          </Btn>

          {/* SERVICES & PRICES — opens as a same-page popup, never
              navigates away and is never part of the ordering steps */}
          <button
            onClick={() => setShowServices(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              width: '100%',
              marginTop: 10,
              padding: '13px 16px',
              borderRadius: T.r.card,
              cursor: 'pointer',
              background: O.a10,
              border: `1px solid ${O.border}`,
              color: O.accent,
              fontSize: 13,
              fontWeight: 600,
              fontFamily: 'inherit',
              transition: 'all 0.2s',
            }}
          >
            <Tag size={15} />
            Services & Prices
          </button>

          <p
            style={{
              textAlign: 'center',
              fontSize: 10,
              color: T.text.muted,
              marginTop: 13,
            }}
          >
            No account needed
          </p>

          {/* NEED HELP — WhatsApp Us / Email Us */}
          <div style={{ marginTop: 22 }}>
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: T.text.muted,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                textAlign: 'center',
                marginBottom: 10,
              }}
            >
              Need help?
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <button
                onClick={openWhatsApp}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  padding: '13px 10px',
                  borderRadius: T.r.card,
                  cursor: 'pointer',
                  background: 'rgba(255,255,255,0.045)',
                  border: '1px solid rgba(255,255,255,0.09)',
                  color: T.text.primary,
                  fontFamily: 'inherit',
                  transition: 'all 0.2s',
                }}
              >
                <MessageCircle size={17} color={O.accent} />
                <span style={{ fontSize: 12, fontWeight: 600 }}>WhatsApp Us</span>
              </button>

              <button
                onClick={openEmail}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  padding: '13px 10px',
                  borderRadius: T.r.card,
                  cursor: 'pointer',
                  background: 'rgba(255,255,255,0.045)',
                  border: '1px solid rgba(255,255,255,0.09)',
                  color: T.text.primary,
                  fontFamily: 'inherit',
                  transition: 'all 0.2s',
                }}
              >
                <Mail size={17} color={O.accent} />
                <span style={{ fontSize: 12, fontWeight: 600 }}>Email Us</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Same-page overlay — homepage stays mounted and visible behind it */}
      {showServices && <ServicesPricesModal onClose={() => setShowServices(false)} />}
    </div>
  )
}
// ─── Enter Name ───────────────────────────────────────────────────────

function NameScreen({ onNext, onBack, name, setName }: { onNext:()=>void; onBack:()=>void; name:string; setName:(v:string)=>void }) {
  return (
    <div style={{ position:'relative', zIndex:1, minHeight:'100vh' }}>
      <CustomerBg/>
      <div style={{ position:'relative', zIndex:1, maxWidth:480, margin:'0 auto', padding:'48px 24px 32px', display:'flex', flexDirection:'column' }}>
        <StepHeader step={1} total={5} title="What's your name?" subtitle="We'll use this to identify your order at the counter."/>

        <div className="penter d1" style={{ marginBottom:24 }}>
          <Input
            label="Your Name"
            value={name}
            onChange={setName}
            placeholder="e.g. Rahul Kumar"
            autoFocus
          />
        </div>

        {name.trim() && (
          <div className="penter d2" style={{ marginBottom:24 }}>
            <Card style={{ padding:16, display:'flex', alignItems:'center', gap:12 }}>
              <Avatar name={name} size={40} theme="orange"/>
              <div>
                <div style={{ fontSize:14, fontWeight:600 }}>{name.trim()}</div>
                <div style={{ fontSize:12, color:T.text.muted }}>Your order will be filed under this name</div>
              </div>
            </Card>
          </div>
        )}

        <div className="penter d3" style={{ display:'flex', gap:10, marginTop:'auto' }}>
          <Btn onClick={onBack} variant="ghost" size="lg" icon={<ArrowLeft size={16}/>}>Back</Btn>
          <Btn onClick={onNext} disabled={!name.trim()} theme="orange" full size="lg" iconRight={<ArrowRight size={17}/>}>Continue</Btn>
        </div>
      </div>
    </div>
  )
}

// ─── Service Select ───────────────────────────────────────────────────
function ServiceScreen({
  onSelect,
  onBack,
}: {
  onSelect: (s: Service) => void
  onBack: () => void
}) {
  const [hover, setHover] = useState<Service | null>(null)

  const svcs: Array<{
    id: Service
    icon: React.ReactNode
    title: string
    desc: string
    features: string[]
    price: string
  }> = [
    {
      id: 'document',
      icon: <FileText size={26} />,
      title: 'Document Printing',
      desc: 'Print any document file with precision and quality.',
      features: [
        'PDF, DOCX, XLSX, PPTX',
        'Color or Black & White',
        'A4, A3',
        'Single or double sided',
      ],
      price: `From ₹${PRICING.document.A4.bw.single} per page`,
    },
    {
      id: 'passport',
      icon: <Camera size={26} />,
      title: 'Passport Photos',
      desc: 'Official-size passport photos, automatically arranged.',
      features: [
        '35×45mm standard size',
        'Auto-arrangement on A4',
        '4 to 8 copies per sheet',
        'White background preferred',
      ],
      price: `From ₹${PRICING.passport.tier1.price} per sheet`,
    },
  ]

  return (
    <div
      style={{
        position: 'relative',
        zIndex: 1,
        minHeight: '100vh',
      }}
    >
      <div
        className="service-screen-container"
        style={{
          position: 'relative',
          zIndex: 1,
          maxWidth: 480,
          margin: '0 auto',
          padding: '48px 24px 32px',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
            marginBottom: 28,
          }}
        >
          {svcs.map((svc, i) => (
            <div
              key={svc.id}
              className="glass penter service-card"
              style={{
                animationDelay: `${i * 0.08}s`,
                borderRadius: T.r.card,
                padding: 22,
                cursor: 'pointer',
                transition: 'all 0.28s cubic-bezier(0.22,1,0.36,1)',
                borderColor:
                  hover === svc.id
                    ? O.border
                    : 'rgba(255,255,255,0.10)',
                boxShadow:
                  hover === svc.id
                    ? `0 8px 40px rgba(0,0,0,0.48), 0 0 0 1px ${O.border}, inset 0 1px 0 rgba(255,255,255,0.14), 0 0 32px ${O.glowLg}`
                    : undefined,
                transform:
                  hover === svc.id ? 'translateY(-3px)' : 'none',
              }}
              onMouseEnter={() => setHover(svc.id)}
              onMouseLeave={() => setHover(null)}
              onClick={() => onSelect(svc.id)}
            >
              <div
                className="service-card-content"
                style={{
                  display: 'flex',
                  gap: 16,
                  alignItems: 'flex-start',
                }}
              >
                {/* Icon */}
                <div
                  className="service-card-icon"
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 16,
                    background:
                      hover === svc.id ? O.a20 : O.a10,
                    border: `1px solid ${O.border}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: O.accent,
                    flexShrink: 0,
                    transition: 'all 0.2s',
                  }}
                >
                  {svc.icon}
                </div>

                {/* Main content */}
                <div
                  className="service-card-main"
                  style={{
                    flex: 1,
                    minWidth: 0,
                  }}
                >
                  <div
                    className="service-card-title"
                    style={{
                      fontWeight: 700,
                      fontSize: 16,
                      marginBottom: 5,
                    }}
                  >
                    {svc.title}
                  </div>

                  <div
                    className="service-card-description"
                    style={{
                      fontSize: 13,
                      color: T.text.secondary,
                      marginBottom: 12,
                      lineHeight: 1.5,
                    }}
                  >
                    {svc.desc}
                  </div>

                  {/* Feature chips */}
                  <div
                    className="service-card-features"
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 5,
                    }}
                  >
                    {svc.features.map((f) => (
                      <span
                        key={f}
                        className="service-feature-chip"
                        style={{
                          fontSize: 11,
                          padding: '3px 9px',
                          borderRadius: T.r.pill,
                          background:
                            'rgba(255,255,255,0.05)',
                          border:
                            '1px solid rgba(255,255,255,0.08)',
                          color: T.text.secondary,
                          lineHeight: 1.3,
                        }}
                      >
                        {f}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Price / arrow */}
                <div
                  className="service-card-price"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-end',
                    gap: 8,
                    flexShrink: 0,
                  }}
                >
                  <ChevronRight
                    size={16}
                    color={
                      hover === svc.id
                        ? O.accent
                        : T.text.muted
                    }
                  />

                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: O.accent,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {svc.price}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        <Btn
          onClick={onBack}
          variant="ghost"
          icon={<ArrowLeft size={16} />}
          style={{ alignSelf: 'flex-start' }}
        >
          Back
        </Btn>
      </div>
    </div>
  )
}
// ─── File Upload ──────────────────────────────────────────────────────
function UploadScreen({
  onNext,
  onBack,
  files,
  setFiles
}: {
  onNext: () => void
  onBack: () => void
  files: UpFile[]
  setFiles: (f: UpFile[]) => void
}) {
  const [detecting, setDetecting] = useState(false)

  // ─────────────────────────────────────────────
  // ADD FILES + DETECT PAGE COUNT
  // ─────────────────────────────────────────────

  const addFiles = useCallback(async (flist: FileList) => {
    setDetecting(true)
    const added: UpFile[] = []

    for (const f of Array.from(flist)) {
      const isPdf = f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
      const isDoc = f.name.toLowerCase().match(/\.(docx?|xlsx?|pptx?)$/)
      const isImage = f.type.startsWith('image/')

      // Only allow PDF, images, and office docs
      if (!isPdf && !isDoc && !isImage) {
        alert(`File type not supported: ${f.name}. Please upload PDF, Word, Excel, or images.`)
        continue
      }

      // Default:
      // Images = 1 page
      // Other files = 1 page unless detected otherwise
      let pages = 1

      // ─────────────────────────────────────────
      // PDF PAGE COUNT
      // ─────────────────────────────────────────

      if (isPdf) {
        try {
          const arrayBuffer = await f.arrayBuffer()
          const pdf = await pdfjsLib.getDocument({
            data: new Uint8Array(arrayBuffer)
          }).promise
          pages = pdf.numPages
        } catch (error) {
          console.error(`Could not detect pages for ${f.name}:`, error)
          pages = 1
        }
      } else if (f.name.toLowerCase().match(/\.(docx?|pptx?)$/)) {
        // Automatic detection for modern Word/PPTX docs
        pages = await detectOfficePages(f)
      }

      // ─────────────────────────────────────────
      // CREATE UPLOADED FILE
      // ─────────────────────────────────────────

      const uploadedFile: UpFile = {
        id: Math.random().toString(36).slice(2),

        name: f.name,

        size: f.size,

        type: f.type,

        preview: f.type.startsWith('image/')
          ? URL.createObjectURL(f)
          : undefined,

        pages: pages,

        // Copies are selected independently for every uploaded document.
        copies: 1,
        color: 'bw',
        paper: 'A4',
        sides: 'single',

        file: f
      }

      added.push(uploadedFile)
    }

    setFiles([
      ...files,
      ...added
    ])
    setDetecting(false)
  }, [files, setFiles])


  // ─────────────────────────────────────────────
  // REMOVE FILE
  // ─────────────────────────────────────────────

  const remove = (id: string) =>
    setFiles(
      files.filter(f => f.id !== id)
    )


  return (
    <div
      style={{
        position: 'relative',
        zIndex: 1,
        minHeight: '100vh'
      }}
    >

      <CustomerBg />


      <div
        style={{
          position: 'relative',
          zIndex: 1,
          maxWidth: 480,
          margin: '0 auto',
          padding: '48px 24px 100px',
          display: 'flex',
          flexDirection: 'column'
        }}
      >

        <StepHeader
          step={3}
          total={5}
          title="Upload your files"
          subtitle="Drag and drop or tap to browse. PDF, Office docs, and images supported."
        />


        {/* ───────────────────────────── */}
        {/* MAIN DROP ZONE */}
        {/* ───────────────────────────── */}

        <div
          className="penter d1"
          style={{
            marginBottom: 16
          }}
        >

          <DropZone
            onFiles={addFiles}
            theme="orange"
            style={{
              padding: '40px 24px',
              textAlign: 'center',
              marginBottom: 0
            }}
          >

            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 16,
                background: O.a10,
                border: `1px solid ${O.border}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px',
                color: O.accent
              }}
            >

              <Upload
                size={24}
                strokeWidth={1.8}
              />

            </div>


            <div
              style={{
                fontWeight: 600,
                fontSize: 15,
                marginBottom: 6
              }}
            >
              Drop files here
            </div>


            <div
              style={{
                fontSize: 13,
                color: T.text.secondary
              }}
            >
              or{' '}

              <span
                style={{
                  color: O.accent,
                  fontWeight: 500
                }}
              >
                browse to upload
              </span>
            </div>


            <div
              style={{
                fontSize: 11,
                color: T.text.muted,
                marginTop: 10
              }}
            >
              {detecting ? (
                <span style={{ color: O.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  <Spinner size={12} color={O.accent} /> Detecting pages...
                </span>
              ) : (
                'PDF · DOCX · XLSX · PPTX · JPG · PNG · max 25 MB'
              )}
            </div>

          </DropZone>

        </div>


        {/* ───────────────────────────── */}
        {/* UPLOADED FILE LIST */}
        {/* ───────────────────────────── */}

        {files.length > 0 && (

          <div
            className="penter d2"
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              marginBottom: 16
            }}
          >

            {files.map((f, i) => (

              <div
                key={f.id}
                className="penter"
                style={{
                  animationDelay: `${i * 0.04}s`
                }}
              >

                <Card
                  pad={14}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12
                  }}
                >

                  {/* FILE ICON / IMAGE PREVIEW */}

                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 10,
                      overflow: 'hidden',
                      flexShrink: 0,
                      background: O.a10,
                      border: `1px solid ${O.border}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >

                    {f.preview ? (

                      <img
                        src={f.preview}
                        alt={f.name}
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover'
                        }}
                      />

                    ) : (

                      <FileText
                        size={18}
                        color={O.accent}
                      />

                    )}

                  </div>


                  {/* FILE INFORMATION */}

                  <div
                    style={{
                      flex: 1,
                      minWidth: 0
                    }}
                  >

                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 500,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {f.name}
                    </div>


                    {/* PAGE COUNT (Fully Automatic) */}

                    <div
                      style={{
                        fontSize: 11,
                        color: T.text.muted,
                        marginTop: 2
                      }}
                    >
                      {f.pages} {f.pages === 1 ? 'page' : 'pages'}
                      {' · '}
                      {fmtSize(f.size)}
                      {' · '}
                      {f.copies} {f.copies === 1 ? 'copy' : 'copies'}
                    </div>

                  </div>


                  {/* READY + REMOVE */}

                  <div
                    style={{
                      display: 'flex',
                      gap: 6,
                      alignItems: 'center',
                      flexShrink: 0
                    }}
                  >

                    <Badge
                      label="Ready"
                      color="green"
                    />


                    <button
                      onClick={() =>
                        remove(f.id)
                      }
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: T.text.muted,
                        display: 'flex',
                        padding: 4,
                        borderRadius: 6,
                        transition: 'color 0.15s'
                      }}
                      onMouseEnter={e =>
                        (
                          e.currentTarget as HTMLElement
                        ).style.color = '#f87171'
                      }
                      onMouseLeave={e =>
                        (
                          e.currentTarget as HTMLElement
                        ).style.color =
                          T.text.muted
                      }
                    >

                      <X size={15} />

                    </button>

                  </div>

                </Card>

              </div>

            ))}


            {/* ───────────────────────────── */}
            {/* ADD MORE FILES */}
            {/* ───────────────────────────── */}

            <DropZone
              onFiles={addFiles}
              theme="orange"
              style={{
                padding: '12px 16px'
              }}
            >

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  justifyContent: 'center',
                  color: O.accent
                }}
              >

                <FilePlus size={15} />

                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 500
                  }}
                >
                  Add more files
                </span>

              </div>

            </DropZone>

          </div>

        )}


        {/* ───────────────────────────── */}
        {/* BOTTOM ACTIONS */}
        {/* ───────────────────────────── */}

        <div
          className="customer-mobile-action-bar"
          style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            padding: '16px 24px',
            background: 'rgba(7,7,17,0.85)',
            backdropFilter: 'blur(24px)',
            borderTop:
              '1px solid rgba(255,255,255,0.06)',
            zIndex: 10
          }}
        >

          <div
            className="customer-mobile-action-buttons"
            style={{
              maxWidth: 480,
              margin: '0 auto',
              display: 'flex',
              gap: 10
            }}
          >

            <Btn
              onClick={onBack}
              variant="ghost"
              size="lg"
              icon={
                <ArrowLeft size={16} />
              }
            >
              Back
            </Btn>


            <Btn
              onClick={onNext}
              disabled={files.length === 0}
              theme="orange"
              full
              size="lg"
              iconRight={
                <ArrowRight size={17} />
              }
            >

              {files.length === 0
                ? 'Upload files to continue'
                : `Continue with ${files.length} file${
                    files.length > 1
                      ? 's'
                      : ''
                  }`
              }

            </Btn>

          </div>

        </div>

      </div>

    </div>
  )
}
// ─── Print Options ────────────────────────────────────────────────────
function PrintOptsScreen({
  onNext,
  onBack,
  opts,
  setOpts,
  files,
  setFiles
}: {
  onNext: () => void
  onBack: () => void
  opts: PrintOpts
  setOpts: (o: PrintOpts) => void
  files: UpFile[]
  setFiles: (f: UpFile[]) => void
}) {
  // Only paper sizes currently supported by Inkory
  const papers: PaperSize[] = ['A4', 'A3']

  const totalPages = totalPagesOf(files)

  // Real, centralized calculation — same function used on the Estimated
  // Price screen, so the two always match exactly.
  const estimatedAmount = calcDocumentPrice(opts, files)
  const priceBreakdown = formatPriceBreakdown(opts, files)

  const priceUnit =
    opts.sides === 'double'
      ? 'sheet'
      : 'page'

  return (
    <div
      style={{
        position: 'relative',
        zIndex: 1,
        minHeight: '100vh'
      }}
    >
      <CustomerBg />

      <div
        style={{
          position: 'relative',
          zIndex: 1,
          maxWidth: 480,
          margin: '0 auto',
          padding: '48px 24px 100px',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        <StepHeader
          step={4}
          total={5}
          title="Print options"
          subtitle="Customize how your documents will be printed."
        />

        {/* COLOR MODE */}
        <div
          className="penter d1"
          style={{
            marginBottom: 16
          }}
        >
          <Card>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: T.text.muted,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                marginBottom: 14
              }}
            >
              Print Mode
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 10
              }}
            >
              {[
                {
                  id: 'bw' as ColorMode,
                  label: 'Black & White',
                  sub:
                    opts.sides === 'single'
                      ? `₹${PRICING.document[opts.paper].bw.single} per page`
                      : `₹${PRICING.document[opts.paper].bw.double} per sheet`,
                  icon: '◐'
                },
                {
                  id: 'color' as ColorMode,
                  label: 'Color',
                  sub:
                    opts.sides === 'single'
                      ? `₹${PRICING.document[opts.paper].color.single} per page`
                      : `₹${PRICING.document[opts.paper].color.double} per sheet`,
                  icon: '🎨'
                }
              ].map(m => (
                <button
                  key={m.id}
                  onClick={() =>
                    setOpts({
                      ...opts,
                      color: m.id
                    })
                  }
                  style={{
                    padding: '16px 12px',
                    borderRadius: T.r.card,
                    cursor: 'pointer',
                    textAlign: 'center',
                    background:
                      opts.color === m.id
                        ? O.a14
                        : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${
                      opts.color === m.id
                        ? O.border
                        : 'rgba(255,255,255,0.07)'
                    }`,
                    transition: 'all 0.2s',
                    fontFamily: 'inherit',
                    boxShadow:
                      opts.color === m.id
                        ? `0 0 0 1px ${O.a20}`
                        : 'none'
                  }}
                >
                  <div
                    style={{
                      fontSize: 22,
                      marginBottom: 8
                    }}
                  >
                    {m.icon}
                  </div>

                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color:
                        opts.color === m.id
                          ? O.accent
                          : T.text.primary,
                      marginBottom: 4
                    }}
                  >
                    {m.label}
                  </div>

                  <div
                    style={{
                      fontSize: 11,
                      color: T.text.muted
                    }}
                  >
                    {m.sub}
                  </div>
                </button>
              ))}
            </div>
          </Card>
        </div>

        {/* PAPER SIZE */}
        <div
          className="penter d2"
          style={{
            marginBottom: 16
          }}
        >
          <Card>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: T.text.muted,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                marginBottom: 14
              }}
            >
              Paper Size
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 8
              }}
            >
              {papers.map(p => (
                <button
                  key={p}
                  onClick={() =>
                    setOpts({
                      ...opts,
                      paper: p
                    })
                  }
                  style={{
                    height: 44,
                    borderRadius: T.r.md,
                    cursor: 'pointer',
                    background:
                      opts.paper === p
                        ? O.a14
                        : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${
                      opts.paper === p
                        ? O.border
                        : 'rgba(255,255,255,0.07)'
                    }`,
                    color:
                      opts.paper === p
                        ? O.accent
                        : T.text.secondary,
                    fontSize: 13,
                    fontWeight: 600,
                    transition: 'all 0.18s',
                    fontFamily: 'inherit'
                  }}
                >
                  {p}
                </button>
              ))}
            </div>
          </Card>
        </div>

        {/* COPIES & SIDES */}
        <div
          className="penter d3"
          style={{
            marginBottom: 16
          }}
        >
          <Card>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 20
              }}
            >
              {/* COPIES — selected independently for each uploaded file */}
              <div>
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>Copies per document</div>
                <div style={{ fontSize: 12, color: T.text.muted, marginBottom: 12 }}>Choose a different quantity for each uploaded file.</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {files.map(file => (
                    <div key={file.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '10px 12px', borderRadius: T.r.md, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={file.name}>{file.name}</div>
                        <div style={{ fontSize: 11, color: T.text.muted }}>{file.pages} {file.pages === 1 ? 'page' : 'pages'}</div>
                      </div>
                      <Stepper
                        value={file.copies}
                        onChange={v => setFiles(files.map(item => item.id === file.id ? { ...item, copies: v } : item))}
                        min={1}
                        max={100}
                        theme="orange"
                      />
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: 12, color: T.text.muted, marginTop: 10 }}>{totalPages} total page{totalPages === 1 ? '' : 's'} · {files.length} document{files.length === 1 ? '' : 's'}</div>
              </div>

              <Divider />

              {/* PRINTING SIDES */}
              <div>
                <div
                  style={{
                    fontWeight: 600,
                    fontSize: 14,
                    marginBottom: 12
                  }}
                >
                  Printing Sides
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 10
                  }}
                >
                  {[
                    {
                      id: 'single' as Sides,
                      label: 'Single Sided',
                      sub: 'One side per page'
                    },
                    {
                      id: 'double' as Sides,
                      label: 'Double Sided',
                      sub: 'Front & back'
                    }
                  ].map(s => (
                    <button
                      key={s.id}
                      onClick={() =>
                        setOpts({
                          ...opts,
                          sides: s.id
                        })
                      }
                      style={{
                        padding: '12px',
                        borderRadius: T.r.card,
                        cursor: 'pointer',
                        textAlign: 'left',
                        background:
                          opts.sides === s.id
                            ? O.a14
                            : 'rgba(255,255,255,0.03)',
                        border: `1px solid ${
                          opts.sides === s.id
                            ? O.border
                            : 'rgba(255,255,255,0.07)'
                        }`,
                        fontFamily: 'inherit',
                        transition: 'all 0.18s'
                      }}
                    >
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color:
                            opts.sides === s.id
                              ? O.accent
                              : T.text.primary,
                          marginBottom: 3
                        }}
                      >
                        {s.label}
                      </div>

                      <div
                        style={{
                          fontSize: 11,
                          color: T.text.muted
                        }}
                      >
                        {s.sub}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <Divider />

              {/* LIVE ESTIMATED AMOUNT */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: T.text.muted,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      marginBottom: 4
                    }}
                  >
                    Estimated Amount
                  </div>

                  <div
                    style={{
                      fontSize: 11,
                      color: T.text.muted
                    }}
                  >
                    {priceBreakdown}
                  </div>
                </div>

                <div
                  style={{
                    fontSize: 24,
                    fontWeight: 800,
                    color: O.accent,
                    letterSpacing: '-0.03em'
                  }}
                >
                  ₹{estimatedAmount}
                </div>
              </div>
            </div>
          </Card>
        </div>

        {/* BOTTOM NAVIGATION */}
        <div
          className="customer-mobile-action-bar"
          style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            padding: '16px 24px',
            background: 'rgba(7,7,17,0.85)',
            backdropFilter: 'blur(24px)',
            borderTop: '1px solid rgba(255,255,255,0.06)',
            zIndex: 10
          }}
        >
          <div
            className="customer-mobile-action-buttons"
            style={{
              maxWidth: 480,
              margin: '0 auto',
              display: 'flex',
              gap: 10
            }}
          >
            <Btn
              onClick={onBack}
              variant="ghost"
              size="lg"
              icon={<ArrowLeft size={16} />}
            >
              Back
            </Btn>

            <Btn
              onClick={onNext}
              theme="orange"
              full
              size="lg"
              iconRight={<ArrowRight size={17} />}
            >
              Edit & Preview Images
            </Btn>
          </div>
        </div>
      </div>
    </div>
  )
}
// ─── Image Editor ─────────────────────────────────────────────────────

function ImageEditScreen({
  onNext,
  onBack,
  files,
  opts
}: {
  onNext: () => void
  onBack: () => void
  files: UpFile[]
  opts?: PrintOpts
}) {
  const [zoom, setZoom] = useState(100)
  const [rotate, setRotate] = useState(0)
  const [activeTool, setActiveTool] = useState<string | null>(null)
  const [currentFileIdx, setCurrentFileIdx] = useState(0)

  const currentFile = files[currentFileIdx]
  const hasPreview = currentFile?.preview != null

  // Editing tools
  // Crop has been intentionally removed — cropping is handled by Admin.
  // Images Per Page has been intentionally removed and must not return.
  const tools = [
    {
      id: 'rotate',
      icon: <RotateCw size={15} />,
      label: 'Rotate',
      action: () => setRotate(r => (r + 90) % 360)
    },
    {
      id: 'zoom-in',
      icon: <ZoomIn size={15} />,
      label: 'Zoom In',
      action: () => setZoom(z => Math.min(z + 15, 200))
    },
    {
      id: 'zoom-out',
      icon: <ZoomOut size={15} />,
      label: 'Zoom Out',
      action: () => setZoom(z => Math.max(z - 15, 50))
    },
    {
      id: 'fit',
      icon: <Maximize2 size={15} />,
      label: 'Reset',
      action: () => {
        setZoom(100)
        setRotate(0)
        setActiveTool(null)
      }
    }
  ]

  // Canvas content
  const canvasContent = (() => {
    if (!currentFile) {
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 10
          }}
        >
          <FileImage
            size={48}
            strokeWidth={1.2}
            color={O.accent}
          />

          <span
            style={{
              fontSize: 13,
              color: T.text.muted
            }}
          >
            No file selected
          </span>
        </div>
      )
    }

    return (
      <div
        style={{
          transform: `scale(${zoom / 100}) rotate(${rotate}deg)`,
          transition:
            'transform 0.4s cubic-bezier(0.22,1,0.36,1)',
          transformOrigin: 'center',
          maxWidth: 220,
          maxHeight: 280,
          borderRadius: 8,
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: hasPreview ? 'transparent' : O.a14,
          border: hasPreview
            ? 'none'
            : `1px solid ${O.border}`,
          width: hasPreview ? 'auto' : 160,
          height: hasPreview ? 'auto' : 220
        }}
      >
        {hasPreview ? (
          <img
            src={currentFile.preview}
            alt={currentFile.name}
            style={{
              maxWidth: 220,
              maxHeight: 280,
              objectFit: 'contain',
              borderRadius: 8,
              display: 'block',
              filter: opts?.color === 'bw' ? 'grayscale(100%)' : 'none'
            }}
          />
        ) : (
          <FileText
            size={40}
            color={O.accent}
            strokeWidth={1.5}
          />
        )}
      </div>
    )
  })()

  return (
    <div
      style={{
        position: 'relative',
        zIndex: 1,
        minHeight: '100vh'
      }}
    >
      <CustomerBg />

      <div
        style={{
          position: 'relative',
          zIndex: 1,
          maxWidth: 560,
          margin: '0 auto',
          padding: '24px 16px 100px'
        }}
      >
        {/* Header */}
        <div
          className="penter d0"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            marginBottom: 20
          }}
        >
          <div>
            <h2
              style={{
                fontSize: 20,
                fontWeight: 700,
                letterSpacing: '-0.02em'
              }}
            >
              Image Editor
            </h2>

            <p
              style={{
                fontSize: 12,
                color: T.text.muted
              }}
            >
              Adjust rotation and zoom before printing
            </p>
          </div>

          <div
            style={{
              marginLeft: 'auto'
            }}
          >
            <Badge
              label={`${zoom}% · ${rotate}°`}
              color="orange"
            />
          </div>
        </div>

        {/* File tabs if multiple files */}
        {files.length > 1 && (
          <div
            className="penter d0"
            style={{
              display: 'flex',
              gap: 6,
              marginBottom: 12,
              overflowX: 'auto',
              paddingBottom: 4
            }}
          >
            {files.map((f, i) => (
              <button
                key={f.id}
                onClick={() => {
                  setCurrentFileIdx(i)
                  setZoom(100)
                  setRotate(0)
                  setActiveTool(null)
                }}
                style={{
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 12px',
                  borderRadius: T.r.md,
                  cursor: 'pointer',
                  background:
                    currentFileIdx === i
                      ? O.a14
                      : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${
                    currentFileIdx === i
                      ? O.border
                      : 'rgba(255,255,255,0.08)'
                  }`,
                  color:
                    currentFileIdx === i
                      ? O.accent
                      : T.text.muted,
                  fontSize: 12,
                  fontWeight: 500,
                  fontFamily: 'inherit',
                  transition: 'all 0.15s'
                }}
              >
                {f.preview ? (
                  <FileImage size={12} />
                ) : (
                  <FileText size={12} />
                )}

                {f.name.length > 14
                  ? f.name.slice(0, 14) + '…'
                  : f.name}
              </button>
            ))}
          </div>
        )}

        {/* Canvas */}
        <div
          className="penter d1"
          style={{
            marginBottom: 14
          }}
        >
          <Card
            pad={0}
            style={{
              overflow: 'hidden'
            }}
          >
            <div
              style={{
                background:
                  'repeating-conic-gradient(rgba(255,255,255,0.025) 0% 25%, transparent 0% 50%) 0 0 / 18px 18px',
                minHeight: 280,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative'
              }}
            >
              {canvasContent}

              {/* File info chip */}
              {currentFile && (
                <div
                  style={{
                    position: 'absolute',
                    bottom: 10,
                    left: 10,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    background: 'rgba(0,0,0,0.60)',
                    backdropFilter: 'blur(8px)',
                    borderRadius: T.r.pill,
                    padding: '4px 10px',
                    border:
                      '1px solid rgba(255,255,255,0.08)'
                  }}
                >
                  <span
                    style={{
                      fontSize: 11,
                      color: T.text.secondary,
                      maxWidth: 160,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {currentFile.name}
                  </span>

                  <span
                    style={{
                      fontSize: 10,
                      color: T.text.muted
                    }}
                  >
                    · {fmtSize(currentFile.size)}
                  </span>
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* Editing Tools */}
        <div
          className="penter d2"
          style={{
            marginBottom: 12
          }}
        >
          <Card pad={16}>
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: T.text.muted,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                marginBottom: 10
              }}
            >
              Editing Tools
            </div>

            <div
              style={{
                display: 'flex',
                gap: 8,
                flexWrap: 'wrap'
              }}
            >
              {tools.map(t => (
                <button
                  key={t.id}
                  onClick={() => {
                    t.action?.()

                    setActiveTool(prev =>
                      t.id === 'fit'
                        ? null
                        : prev === t.id
                          ? null
                          : t.id
                    )
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '8px 14px',
                    borderRadius: T.r.md,
                    background:
                      activeTool === t.id
                        ? O.a14
                        : 'rgba(255,255,255,0.05)',
                    border: `1px solid ${
                      activeTool === t.id
                        ? O.border
                        : 'rgba(255,255,255,0.08)'
                    }`,
                    color:
                      activeTool === t.id
                        ? O.accent
                        : T.text.secondary,
                    fontSize: 12,
                    fontWeight: 500,
                    cursor: 'pointer',
                    transition: 'all 0.18s',
                    fontFamily: 'inherit'
                  }}
                >
                  {t.icon}
                  {t.label}
                </button>
              ))}
            </div>
          </Card>
        </div>

        {/* Bottom Navigation */}
        <div
          className="customer-mobile-action-bar"
          style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            padding: '16px 24px',
            background: 'rgba(7,7,17,0.85)',
            backdropFilter: 'blur(24px)',
            borderTop:
              '1px solid rgba(255,255,255,0.06)',
            zIndex: 10
          }}
        >
          <div
            className="customer-mobile-action-buttons"
            style={{
              maxWidth: 560,
              margin: '0 auto',
              display: 'flex',
              gap: 10
            }}
          >
            <Btn
              onClick={onBack}
              variant="ghost"
              size="lg"
              icon={<ArrowLeft size={16} />}
            >
              Back
            </Btn>

            <Btn
              onClick={onNext}
              theme="orange"
              full
              size="lg"
              iconRight={<ArrowRight size={17} />}
            >
              Apply & See Price
            </Btn>
          </div>
        </div>
      </div>
    </div>
  )
}
// ─── Passport Upload ──────────────────────────────────────────────────

function PassportUploadScreen({
  onNext,
  onBack,
  copies,
  setCopies,
  orientation,
  setOrientation,
  photoUrl,
  setPhotoUrl,
  rotate,
  setRotate,
  zoom,
  setZoom
}: {
  onNext: () => void
  onBack: () => void
  copies: number
  setCopies: (v: number) => void
  orientation: PassportOrientation
  setOrientation: (v: PassportOrientation) => void
  photoUrl: string | null
  setPhotoUrl: (v: string | null) => void
  rotate: number
  setRotate: (v: number) => void
  zoom: number
  setZoom: (v: number) => void
}) {
  const [activeTool, setActiveTool] = useState<string|null>(null)

  const handleFiles = (files: FileList) => {
    const f = files[0]
    if (!f) return
    if (photoUrl) URL.revokeObjectURL(photoUrl)
    setPhotoUrl(URL.createObjectURL(f))
    setRotate(0)
    setZoom(100)
    setActiveTool(null)
  }

  const uploaded = photoUrl !== null

  // Official passport packages — reads straight from the same centralized
  // PRICING config used everywhere else, so there is only ONE place these
  // numbers ever live.
  const packages = [
    { count: PRICING.passport.tier1.photos, price: PRICING.passport.tier1.price },
    { count: PRICING.passport.tier2.photos, price: PRICING.passport.tier2.price },
  ]

  // Live price — updates immediately the moment a package is selected,
  // using the same calcPassportPrice() the Estimated Price and Bill
  // screens read from, so every screen always agrees on the total.
  const livePrice = calcPassportPrice(copies)

  // Simple editing tools only — no crop (intentionally removed app-wide),
  // no advanced editor. Just enough to help the customer straighten/frame
  // their own photo before it goes to the counter.
  const tools = [
    { id:'rotate', icon:<RotateCw size={14}/>, label:'Rotate', action:()=>setRotate((rotate+90)%360) },
    { id:'zoom-in', icon:<ZoomIn size={14}/>, label:'Zoom In', action:()=>setZoom(Math.min(zoom+15,200)) },
    { id:'zoom-out', icon:<ZoomOut size={14}/>, label:'Zoom Out', action:()=>setZoom(Math.max(zoom-15,50)) },
    { id:'reset', icon:<Maximize2 size={14}/>, label:'Reset', action:()=>{ setRotate(0); setZoom(100); setActiveTool(null) } },
  ]

  return (
    <div style={{ position:'relative', zIndex:1, minHeight:'100vh' }}>
      <CustomerBg/>
      <div style={{ position:'relative', zIndex:1, maxWidth:480, margin:'0 auto', padding:'48px 24px 100px', display:'flex', flexDirection:'column' }}>
        <StepHeader step={3} total={4} title="Passport photo" subtitle="Upload your photo and choose how you'd like it printed."/>

        {/* Upload */}
        <div className="penter d1" style={{ marginBottom:16 }}>
          <Card>
            <div style={{ fontSize:11, fontWeight:700, color:T.text.muted, letterSpacing:'0.08em', textTransform:'uppercase', marginBottom:14 }}>Upload Photo</div>
            {!uploaded ? (
              <DropZone onFiles={handleFiles} theme="orange" style={{ padding:'32px 20px', textAlign:'center' }}>
                <div style={{ width:70, height:90, borderRadius:10, border:`2px dashed ${O.border}`, background:O.a6, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', margin:'0 auto 16px', gap:8, color:O.accent }}>
                  <Camera size={24} strokeWidth={1.8}/>
                </div>
                <div style={{ fontWeight:600, fontSize:14, marginBottom:4 }}>Upload passport photo</div>
                <div style={{ fontSize:12, color:T.text.muted }}>Clear face, plain background · JPG or PNG</div>
              </DropZone>
            ) : (
              <div style={{ display:'flex', alignItems:'center', gap:14 }}>
                {/* Small confirmation thumbnail — the real inspection view is the Single Photo Preview below */}
                <div style={{ width:44, height:56, borderRadius:8, border:`1px solid ${O.border}`, flexShrink:0, overflow:'hidden', background:O.a10 }}>
                  <img src={photoUrl!} alt="passport" style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }}/>
                </div>
                <div>
                  <div style={{ fontWeight:600, marginBottom:4 }}>Photo uploaded</div>
                  <Badge label="Ready to edit" color="green" dot/>
                </div>
                <button onClick={()=>{ if(photoUrl) URL.revokeObjectURL(photoUrl); setPhotoUrl(null); setRotate(0); setZoom(100); setActiveTool(null) }} style={{ marginLeft:'auto', background:'none', border:'none', cursor:'pointer', color:T.text.muted, padding:4 }}>
                  <X size={16}/>
                </button>
              </div>
            )}
          </Card>
        </div>

        {/* SINGLE PHOTO PREVIEW / EDITOR — a clear, larger look at the
            customer's actual uploaded photo, separate from the repeated
            A4 sheet arrangement further down the page. */}
        {uploaded && (
          <div className="penter d2" style={{ marginBottom:16 }}>
            <Card pad={0} style={{ overflow:'hidden' }}>
              <div style={{ padding:'14px 16px 0' }}>
                <div style={{ fontSize:11, fontWeight:700, color:T.text.muted, letterSpacing:'0.08em', textTransform:'uppercase' }}>
                  Your Photo
                </div>
              </div>

              <div style={{
                background: 'repeating-conic-gradient(rgba(255,255,255,0.025) 0% 25%, transparent 0% 50%) 0 0 / 18px 18px',
                minHeight: 260,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '20px 0',
              }}>
                <div style={{
                  width: 168,
                  height: 216,
                  borderRadius: 10,
                  overflow: 'hidden',
                  border: `1px solid ${O.border}`,
                  boxShadow: '0 10px 34px rgba(0,0,0,0.40)',
                  transform: `rotate(${rotate}deg) scale(${zoom/100})`,
                  transition: 'transform 0.35s cubic-bezier(0.22,1,0.36,1)',
                  flexShrink: 0,
                }}>
                  <img src={photoUrl!} alt="Uploaded passport photo" style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }}/>
                </div>
              </div>

              <div style={{ padding:'4px 16px 16px', display:'flex', alignItems:'center', justifyContent:'space-between', gap:10, flexWrap:'wrap' }}>
                <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                  {tools.map(t=>(
                    <button
                      key={t.id}
                      onClick={()=>{ t.action?.(); setActiveTool(prev => t.id==='reset' ? null : (prev===t.id ? null : t.id)) }}
                      style={{
                        display:'flex', alignItems:'center', gap:6, padding:'7px 13px', borderRadius:T.r.md,
                        background: activeTool===t.id ? O.a14 : 'rgba(255,255,255,0.05)',
                        border:`1px solid ${activeTool===t.id ? O.border : 'rgba(255,255,255,0.09)'}`,
                        color: activeTool===t.id ? O.accent : T.text.secondary,
                        fontSize:12, cursor:'pointer', fontFamily:'inherit', transition:'all 0.18s',
                      }}
                    >
                      {t.icon} {t.label}
                    </button>
                  ))}
                </div>
                <Badge label={`${zoom}% · ${rotate}°`} color="orange"/>
              </div>
            </Card>
          </div>
        )}

        {/* PACKAGE SELECTION — official prices only: 5 Photos = ₹60,
            8 Photos = ₹90. Reads/writes the same `copies` value used by
            Estimated Price, order submission and the Bill. */}
        <div className="penter d3" style={{ marginBottom:16 }}>
          <Card>
            <div style={{ fontSize:11, fontWeight:700, color:T.text.muted, letterSpacing:'0.08em', textTransform:'uppercase', marginBottom:14 }}>
              Choose Your Package
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              {packages.map(pkg => {
                const selected = copies === pkg.count
                return (
                  <button
                    key={pkg.count}
                    onClick={()=>setCopies(pkg.count)}
                    style={{
                      padding:'16px 12px', borderRadius:T.r.card, cursor:'pointer', textAlign:'center',
                      background: selected ? O.a14 : 'rgba(255,255,255,0.03)',
                      border:`1px solid ${selected ? O.border : 'rgba(255,255,255,0.07)'}`,
                      transition:'all 0.2s', fontFamily:'inherit',
                      boxShadow: selected ? `0 0 0 1px ${O.a20}` : 'none',
                    }}
                  >
                    <div style={{ fontSize:22, marginBottom:8 }}>📸</div>
                    <div style={{ fontSize:13, fontWeight:600, color: selected ? O.accent : T.text.primary, marginBottom:4 }}>
                      {pkg.count} Photos
                    </div>
                    <div style={{ fontSize:12, fontWeight:700, color:O.accent }}>₹{pkg.price}</div>
                  </button>
                )
              })}
            </div>

            {/* LIVE PASSPORT PRICE — updates the instant a package is picked */}
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:16, paddingTop:16, borderTop:'1px solid rgba(255,255,255,0.07)' }}>
              <div>
                <div style={{ fontSize:11, fontWeight:700, color:T.text.muted, letterSpacing:'0.08em', textTransform:'uppercase', marginBottom:4 }}>
                  Estimated Amount
                </div>
                <div style={{ fontSize:11, color:T.text.muted }}>{copies} photos on one A4 sheet</div>
              </div>
              <div style={{ fontSize:24, fontWeight:800, color:O.accent, letterSpacing:'-0.03em' }}>
                ₹{livePrice}
              </div>
            </div>
          </Card>
        </div>

        {/* A4 SHEET PREVIEW — separate from the single photo preview above.
            Shows how the selected quantity will actually be arranged for
            printing, with a Portrait/Landscape toggle for the sheet itself. */}
        <div className="penter d4" style={{ marginBottom:16 }}>
          <Card>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14, flexWrap:'wrap', gap:8 }}>
              <div style={{ fontSize:11, fontWeight:700, color:T.text.muted, letterSpacing:'0.08em', textTransform:'uppercase' }}>A4 Sheet Preview</div>

              <div style={{ display:'flex', gap:6 }}>
                {(['portrait', 'landscape'] as const).map(o => {
                  const selected = orientation === o
                  return (
                    <button
                      key={o}
                      onClick={()=>setOrientation(o)}
                      style={{
                        padding:'6px 13px', borderRadius:T.r.pill, cursor:'pointer',
                        background: selected ? O.a14 : 'rgba(255,255,255,0.05)',
                        border:`1px solid ${selected ? O.border : 'rgba(255,255,255,0.09)'}`,
                        color: selected ? O.accent : T.text.secondary,
                        fontSize:11, fontWeight:600, fontFamily:'inherit', transition:'all 0.18s',
                      }}
                    >
                      {o === 'portrait' ? 'Portrait' : 'Landscape'}
                    </button>
                  )
                })}
              </div>
            </div>

            <div style={{
              background:'#fff', borderRadius:10, padding:12, margin:'0 auto',
              width: orientation === 'portrait' ? '58%' : '100%',
              aspectRatio: orientation === 'portrait' ? '210 / 297' : '297 / 210',
              display:'grid',
              gridTemplateColumns: orientation === 'portrait' ? 'repeat(4,1fr)' : 'repeat(6,1fr)',
              gridAutoRows:'min-content',
              alignContent:'start',
              gap:6,
              transition:'all 0.3s cubic-bezier(0.22,1,0.36,1)',
            }}>
              {Array.from({length:copies}).map((_,i)=>(
                <div key={i} style={{ aspectRatio:'35/45', borderRadius:3, background:'#f3f4f6', border:'1px solid #d1d5db', overflow:'hidden', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  {photoUrl
                    ? <img src={photoUrl} alt="" style={{ width:'100%', height:'100%', objectFit:'cover', display:'block', transform:`rotate(${rotate}deg) scale(${zoom/100})` }}/>
                    : <Camera size={12} color="#9ca3af"/>
                  }
                </div>
              ))}
            </div>
            <p style={{ fontSize:11, color:T.text.muted, marginTop:10, textAlign:'center' }}>
              {copies} × 35×45mm on A4 · {orientation === 'portrait' ? 'Portrait' : 'Landscape'} · Printed at 300 DPI · ₹{livePrice}
            </p>
          </Card>
        </div>

        <InfoAlert color="blue">Clear, front-facing photo on a plain white or off-white background gives best results.</InfoAlert>

        <div className="customer-mobile-action-bar" style={{ position:'fixed', bottom:0, left:0, right:0, padding:'16px 24px', background:'rgba(7,7,17,0.85)', backdropFilter:'blur(24px)', borderTop:'1px solid rgba(255,255,255,0.06)', zIndex:10 }}>
          <div className="customer-mobile-action-buttons" style={{ maxWidth:480, margin:'0 auto', display:'flex', gap:10 }}>
            <Btn onClick={onBack} variant="ghost" size="lg" icon={<ArrowLeft size={16}/>}>Back</Btn>
            <Btn onClick={onNext} disabled={!uploaded} theme="orange" full size="lg" iconRight={<ArrowRight size={17}/>}>Confirm & See Price</Btn>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Estimated Price ──────────────────────────────────────────────────
function PriceScreen({
  onNext,
  onBack,
  name,
  opts,
  files,
  service,
  passportCopies,
  passportOrientation
}: {
  onNext: () => void
  onBack: () => void
  name: string
  opts: PrintOpts
  files: UpFile[]
  service: Service
  passportCopies: number
  passportOrientation: PassportOrientation
}) {
  // Real page count from the actual uploaded files — every image counts
  // as 1 page, every PDF uses its real pdf.numPages.
  const pages = totalPagesOf(files)

  // Centralized calculation — identical function used on Print Options,
  // so the two screens can never disagree.
  const documentTotal = calcDocumentPrice(opts, files)
  const passportTotal = calcPassportPrice(passportCopies)

  const total = service === 'passport' ? passportTotal : documentTotal

  const lineItems =
    service === 'passport'
      ? [
          {
            label: `Passport photos (${passportCopies} × A4, ${passportOrientation === 'portrait' ? 'Portrait' : 'Landscape'})`,
            value: `₹${passportTotal}`
          }
        ]
      : [
          {
            label: `${opts.color === 'color' ? 'Color' : 'B&W'} printing`,
            value: `₹${documentTotal}`
          },

          {
            label: 'Pages',
            value: `${pages} page${pages === 1 ? '' : 's'}`
          }
        ]

  return (
    <div
      style={{
        position: 'relative',
        zIndex: 1,
        minHeight: '100vh'
      }}
    >
      <CustomerBg />

      <div
        style={{
          position: 'relative',
          zIndex: 1,
          maxWidth: 480,
          margin: '0 auto',
          padding: '48px 24px 100px',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        <StepHeader
          step={5}
          total={5}
          title="Estimated price"
          subtitle="Review your order before submitting. Final price confirmed at counter."
        />

        {/* Summary card */}
        <div
          className="penter d1"
          style={{
            marginBottom: 14
          }}
        >
          <Card accent="orange">
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                marginBottom: 20,
                paddingBottom: 16,
                borderBottom:
                  '1px solid rgba(255,255,255,0.07)'
              }}
            >
              <Avatar
                name={name}
                size={44}
                theme="orange"
              />

              <div>
                <div
                  style={{
                    fontWeight: 700,
                    fontSize: 16
                  }}
                >
                  {name}
                </div>

                <div
                  style={{
                    fontSize: 12,
                    color: T.text.secondary
                  }}
                >
                  {service === 'passport'
                    ? 'Passport Photo'
                    : 'Document Printing'}{' '}
                  · {opts.paper}
                </div>
              </div>

              <div
                style={{
                  marginLeft: 'auto'
                }}
              >
                <Badge
                  label="Order Ready"
                  color="orange"
                  dot
                />
              </div>
            </div>

            {/* Order details */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                marginBottom: 20
              }}
            >
              {service === 'document' &&
                [
                  {
                    k: 'Color Mode',
                    v:
                      opts.color === 'color'
                        ? 'Color'
                        : 'Black & White'
                  },
                  {
                    k: 'Paper Size',
                    v: opts.paper
                  },
                  {
                    k: 'Copies',
                    v: files.map(file => `${file.name}: ${file.copies}`).join(' · ')
                  },
                  {
                    k: 'Sides',
                    v:
                      opts.sides === 'double'
                        ? 'Double Sided'
                        : 'Single Sided'
                  },
                  {
                    k: 'Files',
                    v: `${files.length} file${
                      files.length > 1 ? 's' : ''
                    }`
                  }
                ].map(({ k, v }) => (
                  <div
                    key={k}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}
                  >
                    <span
                      style={{
                        fontSize: 13,
                        color: T.text.secondary
                      }}
                    >
                      {k}
                    </span>

                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 500
                      }}
                    >
                      {v}
                    </span>
                  </div>
                ))}

              {service === 'passport' && (
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                >
                  <span
                    style={{
                      fontSize: 13,
                      color: T.text.secondary
                    }}
                  >
                    Photos
                  </span>

                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 500
                    }}
                  >
                    {passportCopies} × 35×45mm on A4
                  </span>
                </div>
              )}

              {service === 'passport' && (
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                >
                  <span
                    style={{
                      fontSize: 13,
                      color: T.text.secondary
                    }}
                  >
                    Sheet Orientation
                  </span>

                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 500
                    }}
                  >
                    {passportOrientation === 'portrait' ? 'Portrait' : 'Landscape'}
                  </span>
                </div>
              )}
            </div>

            {/* Price breakdown */}
            <div
              style={{
                background: 'rgba(255,255,255,0.04)',
                borderRadius: T.r.md,
                padding: '14px 16px'
              }}
            >
              {lineItems.map(li => (
                <div
                  key={li.label}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '5px 0'
                  }}
                >
                  <span
                    style={{
                      fontSize: 12,
                      color: T.text.secondary
                    }}
                  >
                    {li.label}
                  </span>

                  <span
                    style={{
                      fontSize: 12
                    }}
                  >
                    {li.value}
                  </span>
                </div>
              ))}

              <Divider
                style={{
                  margin: '10px 0'
                }}
              />

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <span
                  style={{
                    fontSize: 16,
                    fontWeight: 700
                  }}
                >
                  Total (estimated)
                </span>

                <span
                  style={{
                    fontSize: 32,
                    fontWeight: 800,
                    letterSpacing: '-0.04em',
                    color: O.accent
                  }}
                >
                  ₹{total}
                </span>
              </div>
            </div>
          </Card>
        </div>

        <div
          className="penter d2"
          style={{
            marginBottom: 14
          }}
        >
          <InfoAlert color="yellow">
            This is an estimate. Staff will confirm the final price before
            printing. Payment is collected at the counter.
          </InfoAlert>
        </div>

        {/* Bottom navigation */}
        <div
          className="customer-mobile-action-bar"
          style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            padding: '16px 24px',
            background: 'rgba(7,7,17,0.85)',
            backdropFilter: 'blur(24px)',
            borderTop:
              '1px solid rgba(255,255,255,0.06)',
            zIndex: 10
          }}
        >
          <div
            className="customer-mobile-action-buttons"
            style={{
              maxWidth: 480,
              margin: '0 auto',
              display: 'flex',
              gap: 10
            }}
          >
            <Btn
              onClick={onBack}
              variant="ghost"
              size="lg"
              icon={<ArrowLeft size={16} />}
            >
              Back
            </Btn>

            <Btn
              onClick={onNext}
              theme="orange"
              full
              size="lg"
              icon={<Check size={17} />}
            >
              Submit Order
            </Btn>
          </div>
        </div>
      </div>
    </div>
  )
}
// ─── Waiting Screen ───────────────────────────────────────────────────

function WaitingScreen({ orderId, onNext }: { orderId: string; onNext: () => void }) {
  const [step, setStep] = useState(0)
  const steps = [
    { emoji:'👀', label:'Reviewing Files', desc:'Staff is checking your uploaded documents' },
    { emoji:'💰', label:'Confirming Price', desc:'Calculating the exact cost for your order' },
    { emoji:'🖨️', label:'Preparing Print', desc:'Setting up the printer and paper queue' },
    { emoji:'✅', label:'Ready for Printing', desc:'Your order is queued — please proceed to counter' },
  ]

  useEffect(() => {
    if (step < steps.length - 1) {
      const t = setTimeout(()=>setStep(s=>s+1), 2800)
      return ()=>clearTimeout(t)
    } else {
      const t = setTimeout(onNext, 2200)
      return ()=>clearTimeout(t)
    }
  }, [step])

  return (
    <div style={{ position:'relative', zIndex:1, minHeight:'100vh', display:'flex', flexDirection:'column' }}>
      <CustomerBg/>
      <div style={{ position:'relative', zIndex:1, maxWidth:480, margin:'0 auto', width:'100%', padding:'48px 24px', display:'flex', flexDirection:'column', alignItems:'center', gap:0 }}>

        {/* Order ID pill */}
        <div className="penter d0" style={{ marginBottom:40 }}>
          <div style={{ display:'inline-flex', alignItems:'center', gap:8, background:O.a10, border:`1px solid ${O.border}`, borderRadius:T.r.pill, padding:'8px 18px' }}>
            <Package2 size={14} color={O.accent}/>
            <span className="mono" style={{ fontSize:13, fontWeight:600, color:O.accent, letterSpacing:'0.06em' }}>ORDER #{orderId}</span>
          </div>
        </div>

        {/* Animated loader */}
        <div className="penter d1" style={{ position:'relative', width:140, height:140, marginBottom:36 }}>
          {/* Pulsing rings */}
          {[0,1].map(i=>(
            <div key={i} style={{
              position:'absolute', inset:0, borderRadius:'50%',
              border:`1px solid ${O.border}`,
              animation:`ring-expand 2.4s ease-out ${i*1.2}s infinite`,
            }}/>
          ))}
          {/* Spinning arc */}
          <div style={{
            position:'absolute', inset:10, borderRadius:'50%',
            border:'3px solid transparent',
            borderTopColor: O.primary,
            borderRightColor: O.a30,
            animation:'spin 1.2s linear infinite',
          }}/>
          <div style={{
            position:'absolute', inset:20, borderRadius:'50%',
            border:'2px solid transparent',
            borderTopColor: O.accent,
            animation:'spin-reverse 1.8s linear infinite',
          }}/>
          {/* Center */}
          <div style={{
            position:'absolute', inset:28, borderRadius:'50%',
            background:`radial-gradient(circle, ${O.a20}, ${O.a6})`,
            border:`1px solid ${O.border}`,
            display:'flex', alignItems:'center', justifyContent:'center',
            fontSize:28,
          }}>
            {steps[step].emoji}
          </div>
        </div>

        {/* Active step label */}
        <div className="penter d2" style={{ textAlign:'center', marginBottom:40 }}>
          <h2 style={{ fontSize:24, fontWeight:700, letterSpacing:'-0.03em', marginBottom:8, transition:'all 0.4s ease' }}>
            {steps[step].label}
          </h2>
          <p style={{ fontSize:14, color:T.text.secondary, lineHeight:1.55 }}>{steps[step].desc}</p>
        </div>

        {/* Step list */}
        <div className="penter d3" style={{ width:'100%', display:'flex', flexDirection:'column', gap:10 }}>
          {steps.map((s,i)=>(
            <div
              key={i}
              style={{
                display:'flex', alignItems:'center', gap:14,
                padding:'12px 16px', borderRadius:T.r.card,
                background: i===step ? O.a10 : 'rgba(255,255,255,0.03)',
                border:`1px solid ${i===step ? O.border : 'rgba(255,255,255,0.06)'}`,
                opacity: i > step ? 0.35 : 1,
                transition:'all 0.4s cubic-bezier(0.22,1,0.36,1)',
                transform: i===step ? 'scale(1.01)' : 'scale(1)',
              }}
            >
              <div style={{
                width:36, height:36, borderRadius:'50%', flexShrink:0,
                background: i < step ? 'rgba(34,197,94,0.15)' : i===step ? O.a14 : 'rgba(255,255,255,0.05)',
                border:`1px solid ${i<step ? 'rgba(34,197,94,0.3)' : i===step ? O.border : 'rgba(255,255,255,0.08)'}`,
                display:'flex', alignItems:'center', justifyContent:'center',
                fontSize:16, transition:'all 0.4s',
                boxShadow: i===step ? `0 0 16px ${O.glow}` : 'none',
              }}>
                {i < step ? <Check size={15} color="#4ade80"/> : s.emoji}
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, fontWeight:600, marginBottom:1 }}>{s.label}</div>
                <div style={{ fontSize:11, color:T.text.muted }}>{s.desc}</div>
              </div>
              {i === step && (
                <div style={{ display:'flex', gap:3 }}>
                  {[0,1,2].map(j=>(
                    <div key={j} style={{ width:5, height:5, borderRadius:'50%', background:O.accent, animation:`bounce-dot 1.4s ease-in-out ${j*0.2}s infinite` }}/>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Live Status ──────────────────────────────────────────────────────
// Inkory has no online payment system, so this timeline intentionally
// never contains "Awaiting Payment", "Payment Confirmed", or "Payment
// Required" — payment always happens physically at the shop counter.
function LiveStatusScreen({ orderId, onNext }: { orderId: string; onNext: () => void }) {
  type ServerStatus = 'received' | 'reviewing' | 'printing' | 'ready' | 'completed' | 'cancelled'

  const [status, setStatus] = useState<ServerStatus>('received')
  const [order, setOrder] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)

  const statuses: Array<{ key: Exclude<ServerStatus, 'cancelled'>; label: string; desc: string; icon: React.ReactNode }> = [
    { key: 'received', label: 'Order Received', desc: 'Your files were submitted successfully', icon: <Package2 size={14} /> },
    { key: 'reviewing', label: 'Files Reviewed', desc: 'Documents checked by the shop', icon: <Check size={14} /> },
    { key: 'printing', label: 'Printing in Progress', desc: 'Your job is being printed', icon: <Printer size={14} /> },
    { key: 'ready', label: 'Ready for Collection', desc: 'Collect your prints at the counter', icon: <CheckCircle2 size={14} /> },
    { key: 'completed', label: 'Order Completed', desc: `Thank you for visiting ${SHOP_CONFIG.shopName}`, icon: <Star size={14} /> },
  ]

  useEffect(() => {
    let disposed = false

    const loadStatus = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/orders/${encodeURIComponent(orderId)}`)
        const data = await response.json()
        if (!response.ok || !data.success) throw new Error(data.message || 'Unable to load order status.')
        if (disposed) return
        const serverOrder = data.order || data
        setOrder(serverOrder)
        setStatus((serverOrder.status || 'received') as ServerStatus)
        setUpdatedAt(new Date())
        setError(null)
      } catch (err) {
        if (!disposed) setError(err instanceof Error ? err.message : 'Unable to load order status.')
      } finally {
        if (!disposed) setLoading(false)
      }
    }

    void loadStatus()
    const timer = window.setInterval(loadStatus, 5000)
    return () => {
      disposed = true
      window.clearInterval(timer)
    }
  }, [orderId])

  const cancelled = status === 'cancelled'
  const activeIdx = cancelled ? -1 : Math.max(0, statuses.findIndex((item) => item.key === status))

  return (
    <div style={{ position: 'relative', zIndex: 1, minHeight: '100vh' }}>
      <CustomerBg />
      <div style={{ position: 'relative', zIndex: 1, maxWidth: 480, margin: '0 auto', padding: '40px 24px 100px', display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div className="penter d0" style={{ textAlign: 'center' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: O.a10, border: `1px solid ${O.border}`, borderRadius: T.r.pill, padding: '6px 16px', marginBottom: 16 }}><RefreshCw size={12} color={O.accent} /><span style={{ fontSize: 12, color: O.accent, fontWeight: 600 }}>Live tracking</span></div>
          <div className="mono" style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 6 }}>#{orderId}</div>
          <p style={{ fontSize: 14, color: T.text.secondary }}>{loading ? 'Loading order status…' : updatedAt ? `Updated ${updatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Your order status'}</p>
        </div>

        {cancelled ? (
          <Card><div style={{ textAlign: 'center', padding: 20 }}><X size={34} color="#f87171" style={{ margin: '0 auto 12px' }} /><div style={{ fontSize: 16, fontWeight: 700, color: '#fca5a5' }}>Order Cancelled</div><div style={{ fontSize: 12, color: T.text.muted, marginTop: 7 }}>Please contact {SHOP_CONFIG.shopName} if you need help.</div></div></Card>
        ) : (
          <Card>
            <div style={{ position: 'relative' }}>
              <div style={{ position: 'absolute', left: 15, top: 36, bottom: 36, width: 2, background: 'rgba(255,255,255,0.07)', borderRadius: 1 }} />
              <div style={{ position: 'absolute', left: 15, top: 36, width: 2, height: activeIdx > 0 ? `calc(${(activeIdx / (statuses.length - 1)) * 100}% - 72px)` : 0, background: `linear-gradient(180deg, ${O.primary}, ${O.accent})`, boxShadow: `0 0 12px ${O.glow}`, borderRadius: 1, transition: 'height 0.6s ease' }} />
              <div>{statuses.map((item, index) => { const done = index < activeIdx; const active = index === activeIdx; return <div key={item.key} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 4px', opacity: active || done ? 1 : 0.32, position: 'relative' }}><div style={{ width: 24, height: 24, borderRadius: '50%', flexShrink: 0, background: done ? '#22c55e' : active ? O.primary : 'rgba(255,255,255,0.10)', border: `2px solid ${done ? '#22c55e' : active ? O.accent : 'rgba(255,255,255,0.15)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: active ? `0 0 16px ${O.glow}` : 'none', zIndex: 1 }}>{done ? <Check size={13} color="#fff" /> : item.icon}</div><div style={{ flex: 1 }}><div style={{ fontSize: 14, fontWeight: active ? 700 : done ? 600 : 400, color: active ? O.accent : T.text.primary }}>{item.label}</div><div style={{ fontSize: 11, color: T.text.muted }}>{item.desc}</div></div>{active && <Badge label="Now" color="orange" dot />}{done && <Badge label="Done" color="green" />}</div> })}</div>
            </div>
          </Card>
        )}

        {error && <div style={{ fontSize: 12, color: '#fca5a5', textAlign: 'center' }}>{error}</div>}
        {order?.status === 'completed' && <Btn onClick={onNext} theme="orange" full size="lg" iconRight={<ArrowRight size={17} />}>View Bill Summary</Btn>}
      </div>
    </div>
  )
}

// ─── Bill Summary ─────────────────────────────────────────────────────
// NOTE: Inkory has NO GST — no GST line, no 18% multiplier, anywhere.
// The total shown here is exactly the same centralized calculation used
// on Print Options and the Estimated Price screen.
function BillScreen({
  orderId,
  name,
  opts,
  files,
  service,
  passportCopies,
  passportOrientation,
  onComplete
}: {
  orderId: string
  name: string
  opts: PrintOpts
  files: UpFile[]
  service: Service
  passportCopies: number
  passportOrientation: PassportOrientation
  onComplete: () => void
}) {
  const total = calcOrderPrice(service, opts, files, passportCopies)

  return (
    <div style={{ position:'relative', zIndex:1, minHeight:'100vh' }}>
      <CustomerBg/>
      <div style={{ position:'relative', zIndex:1, maxWidth:480, margin:'0 auto', padding:'40px 24px 100px', display:'flex', flexDirection:'column', gap:20 }}>

        <div className="penter d0" style={{ textAlign:'center', marginBottom:8 }}>
          <div style={{ width:64, height:64, borderRadius:'50%', background:'rgba(34,197,94,0.15)', border:'1px solid rgba(34,197,94,0.30)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px', boxShadow:'0 0 32px rgba(34,197,94,0.20)' }}>
            <Check size={28} color="#4ade80" strokeWidth={2.5}/>
          </div>
          <h2 style={{ fontSize:28, fontWeight:800, letterSpacing:'-0.04em', marginBottom:6 }}>Bill Summary</h2>
          <p style={{ fontSize:13, color:T.text.muted }}>Order #{orderId}</p>
        </div>

        {/* Receipt card */}
        <div className="penter d1">
          <Card accent="orange">
            {/* Dashed top border (receipt style) */}
            <div style={{ borderTop:`2px dashed ${O.border}`, marginBottom:20, paddingTop:20 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <div style={{ width:36, height:36, borderRadius:10, background:`linear-gradient(135deg, ${O.accent}, ${O.deep})`, display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <Printer size={18} color="#fff"/>
                  </div>
                  <div>
                    <div style={{ fontWeight:700, fontSize:15 }}>{SHOP_CONFIG.shopName}</div>
                    <div style={{ fontSize:11, color:T.text.muted }}>Receipt</div>
                  </div>
                </div>
                <div className="mono" style={{ fontSize:12, color:O.accent, fontWeight:600 }}>#{orderId}</div>
              </div>

              {/* Line items */}
              {[
                { k:'Customer Name', v: name },
                { k:'Service',       v: service==='passport' ? 'Passport Photos' : 'Document Printing' },
                ...(service==='document' ? [
                  { k:'Print Mode',  v: opts.color==='color' ? 'Color' : 'Black & White' },
                  { k:'Paper',       v: opts.paper },
                  { k:'Copies',      v: files.map(file => `${file.name}: ${file.copies}`).join(' · ') },
                  { k:'Sides',       v: opts.sides==='double' ? 'Double Sided' : 'Single Sided' },
                  { k:'Pages',       v: `${totalPagesOf(files)} page${totalPagesOf(files)===1?'':'s'}` },
                ] : [
                  { k:'Photos',      v: `${passportCopies} × 35×45mm on A4` },
                  { k:'Sheet Orientation', v: passportOrientation === 'portrait' ? 'Portrait' : 'Landscape' },
                ]),
                { k:'Payment',       v: 'Cash at counter' },
              ].map(({ k,v })=>(
                <div key={k} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 0', borderBottom:'1px solid rgba(255,255,255,0.05)' }}>
                  <span style={{ fontSize:13, color:T.text.secondary }}>{k}</span>
                  <span style={{ fontSize:13, fontWeight:500 }}>{v}</span>
                </div>
              ))}

              {/* Totals — no GST */}
              <div style={{ marginTop:16 }}>
                <div style={{ borderTop:`2px dashed ${O.border}`, paddingTop:14, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <span style={{ fontSize:18, fontWeight:700 }}>Total Paid</span>
                  <span style={{ fontSize:36, fontWeight:800, letterSpacing:'-0.04em', color:O.accent }}>₹{total}</span>
                </div>
              </div>

              <div style={{ marginTop:16, textAlign:'center' }}>
                <Badge label="✓ Payment Received" color="green"/>
              </div>
            </div>
          </Card>
        </div>

        <Btn onClick={onComplete} theme="orange" full size="lg" icon={<Check size={17}/>}>
          Done
        </Btn>
      </div>
    </div>
  )
}

// ─── Order Complete ───────────────────────────────────────────────────

function DoneScreen({ onRestart, name }: { onRestart: () => void; name: string }) {
  // Reuses the customer name captured at the start of the order (NameScreen)
  // — no new state, no re-asking, no hard-coded name. Falls back gracefully
  // if somehow empty so the layout never breaks.
  const firstName = name.trim().split(' ')[0] || name.trim()

  return (
    <div style={{ position:'relative', zIndex:1, minHeight:'100vh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:24 }}>
      <CustomerBg/>
      <div className="penter" style={{ position:'relative', zIndex:1, maxWidth:400, width:'100%', textAlign:'center', display:'flex', flexDirection:'column', alignItems:'center', gap:0 }}>

        {/* Checkmark */}
        <div style={{ position:'relative', width:120, height:120, marginBottom:32 }}>
          <div style={{ position:'absolute', inset:0, borderRadius:'50%', background:'rgba(34,197,94,0.12)', border:'1px solid rgba(34,197,94,0.25)', boxShadow:'0 0 60px rgba(34,197,94,0.20)' }}/>
          <svg width="120" height="120" viewBox="0 0 120 120" fill="none" style={{ position:'absolute', inset:0 }}>
            <circle cx="60" cy="60" r="46" fill="rgba(34,197,94,0.10)" stroke="rgba(34,197,94,0.35)" strokeWidth="1.5"/>
            <path d="M38 60l16 16 28-32" stroke="#4ade80" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"
              strokeDasharray="64" strokeDashoffset="64"
              style={{ animation:'check-draw 0.7s 0.3s cubic-bezier(0.22,1,0.36,1) forwards' }}/>
          </svg>
        </div>

        <h1 style={{ fontSize:36, fontWeight:800, letterSpacing:'-0.04em', marginBottom:12 }}>Order Complete!</h1>

        {firstName && (
          <p style={{ fontSize:19, fontWeight:700, color:O.accent, letterSpacing:'-0.01em', marginBottom:10 }}>
            Thank you, {firstName}!
          </p>
        )}

        <p style={{ fontSize:15, color:T.text.secondary, lineHeight:1.65, marginBottom:32 }}>
          Your prints are ready to collect at the counter.<br/>
          Thank you for choosing {SHOP_CONFIG.shopName}.
        </p>

        <div style={{ display:'flex', gap:10, marginBottom:20, alignItems:'center', background:O.a10, border:`1px solid ${O.border}`, borderRadius:T.r.pill, padding:'8px 20px' }}>
          <Star size={14} color={O.accent} fill={O.accent}/>
          <span style={{ fontSize:13, color:O.accent, fontWeight:600 }}>Enjoy your premium prints!</span>
        </div>

        <Btn onClick={onRestart} variant="ghost" icon={<RefreshCw size={16}/>}>Start a new order</Btn>
      </div>
    </div>
  )
}

// ─── Portal root ──────────────────────────────────────────────────────

const DEFAULT_OPTS: PrintOpts = { color:'bw', paper:'A4', copies:1, sides:'single' }

export function CustomerPortal() {
  const [screen, setScreen] = useState<CScreen>('splash')
  const [name, setName] = useState('')
  const [service, setService] = useState<Service>('document')
  const [files, setFiles] = useState<UpFile[]>([])
  const [opts, setOpts] = useState<PrintOpts>(DEFAULT_OPTS)
  // Official passport packages are 5 or 8 photos only — default to the
  // smaller package so the price shown is always correct from the start.
  const [passportCopies, setPassportCopies] = useState<number>(PRICING.passport.tier1.photos)
  const [passportOrientation, setPassportOrientation] = useState<PassportOrientation>('portrait')
  // Lifted up (instead of living inside PassportUploadScreen) so the
  // uploaded photo and its rotate/zoom adjustments survive the customer
  // pressing Back from Estimated Price — they no longer have to re-upload.
  const [passportPhotoUrl, setPassportPhotoUrl] = useState<string | null>(null)
  const [passportRotate, setPassportRotate] = useState(0)
  const [passportZoom, setPassportZoom] = useState(100)
  // Preserves everything the Admin dashboard will eventually need:
  // customer name, files + per-file page counts, total pages, paper size,
  // color mode, copies, sides, the calculated amount, and order status.
  const [order, setOrder] = useState<CustomerOrder | null>(null)

const [orderId, setOrderId] = useState(
  `PF-${Date.now()}`
)

const go = (s: CScreen) => setScreen(s)
const submitOrder = async () => {
  try {
    const amount = calcOrderPrice(
      service,
      opts,
      files,
      passportCopies
    )

    const customerOrder: CustomerOrder = {
      id: orderId,
      name,
      service,
      files,
      totalPages: totalPagesOf(files),
      opts,
      passportCopies:
        service === 'passport'
          ? passportCopies
          : undefined,
      passportOrientation:
        service === 'passport'
          ? passportOrientation
          : undefined,
      amount,
      status: 'received',
    }

    // ─────────────────────────────────────
    // CREATE FORM DATA
    // ─────────────────────────────────────

    const formData = new FormData()

    formData.append('id', orderId)
    formData.append('customer', name)
    formData.append('service', service)

    formData.append(
      'color',
      service === 'passport'
        ? 'color'
        : opts.color
    )

    formData.append(
      'paper',
      service === 'passport'
        ? 'A4'
        : opts.paper
    )

    formData.append(
      'copies',
      String(
        service === 'passport'
          ? passportCopies
          : Math.max(...files.map(file => file.copies || 1), 1)
      )
    )

    if (service === 'document') {
      formData.append('fileCopies', JSON.stringify(files.map(file => file.copies || 1)))
      formData.append('filePages', JSON.stringify(files.map(file => file.pages || 1)))
    }

    formData.append(
      'sides',
      service === 'passport'
        ? passportOrientation
        : opts.sides
    )

    formData.append(
      'estimatedAmount',
      String(amount)
    )

    formData.append('notes', '')

    // ─────────────────────────────────────
    // ATTACH DOCUMENT FILES
    // ─────────────────────────────────────

    if (service === 'document') {
      files.forEach((uploadedFile) => {
        if (uploadedFile.file) {
          formData.append(
            'files',
            uploadedFile.file
          )
        }
      })
    }

    // ─────────────────────────────────────
    // ATTACH PASSPORT PHOTO
    // ─────────────────────────────────────

    if (
      service === 'passport' &&
      passportPhotoUrl
    ) {
      const photoResponse =
        await fetch(passportPhotoUrl)

      const photoBlob =
        await photoResponse.blob()

      formData.append(
        'files',
        photoBlob,
        'passport-photo.jpg'
      )
    }

    // DEBUG — shows exactly what is being sent
    console.log(
      'FORM DATA:',
      Array.from(formData.entries())
    )

    // ─────────────────────────────────────
    // SEND TO BACKEND
    // ─────────────────────────────────────

const response = await fetch(
  `${API_BASE_URL}/api/orders`,
  {
    method: 'POST',
    body: formData,
  }
)
    const data = await response.json()

    if (!response.ok || !data.success) {
      console.error(
        'Order submission failed:',
        data
      )

      alert(
        data.message ||
        'Unable to submit your order.'
      )

      return
    }

    const realOrderId = data.order.id

    setOrderId(realOrderId)

    setOrder({
      ...customerOrder,
      id: realOrderId,
    })

    console.log(
      'ORDER CREATED:',
      data.order
    )

    go('waiting')
  } catch (error) {
    console.error(
      'Order submission error:',
      error
    )

    alert(
      "Unable to connect to Inkory. Please make sure the backend is running."
    )
  }
}
return ( 
    <div key={screen}>
      {screen==='splash'   && <SplashScreen onNext={()=>go('welcome')}/>}
      {screen==='welcome'  && <WelcomeScreen onNext={()=>go('name')}/>}
      {screen==='name'     && <NameScreen name={name} setName={setName} onNext={()=>go('service')} onBack={()=>go('welcome')}/>}
      {screen==='service'  && <ServiceScreen onSelect={s=>{ setService(s); go(s==='passport' ? 'passport-upload' : 'upload') }} onBack={()=>go('name')}/>}
      {screen==='upload'   && <UploadScreen files={files} setFiles={setFiles} onNext={()=>go('print-opts')} onBack={()=>go('service')}/>}
      {screen==='print-opts' && <MergedEditorScreen files={files} setFiles={setFiles} opts={opts} setOpts={setOpts} onNext={()=>go('price')} onBack={()=>go('upload')}/>}
      {screen==='passport-upload' && <PassportUploadScreen copies={passportCopies} setCopies={setPassportCopies} orientation={passportOrientation} setOrientation={setPassportOrientation} photoUrl={passportPhotoUrl} setPhotoUrl={setPassportPhotoUrl} rotate={passportRotate} setRotate={setPassportRotate} zoom={passportZoom} setZoom={setPassportZoom} onNext={()=>go('price')} onBack={()=>go('service')}/>}
      {screen==='price'    && <PriceScreen name={name} opts={opts} files={files} service={service} passportCopies={passportCopies} passportOrientation={passportOrientation} onNext={submitOrder} onBack={()=>go(service==='passport' ? 'passport-upload' : 'image-edit')}/>}
      {screen==='waiting'  && <WaitingScreen orderId={orderId} onNext={()=>go('live-status')}/>}
      {screen==='live-status' && <LiveStatusScreen orderId={orderId} onNext={()=>go('bill')}/>}
      {screen==='bill'     && <BillScreen orderId={orderId} name={name} opts={opts} files={files} service={service} passportCopies={passportCopies} passportOrientation={passportOrientation} onComplete={()=>go('done')}/>}
      {screen==='done'     && <DoneScreen name={name} onRestart={()=>{ setName(''); setFiles([]); setOpts(DEFAULT_OPTS); setPassportCopies(PRICING.passport.tier1.photos); setPassportOrientation('portrait'); if (passportPhotoUrl) URL.revokeObjectURL(passportPhotoUrl); setPassportPhotoUrl(null); setPassportRotate(0); setPassportZoom(100); setOrder(null); setOrderId(`PF-${Date.now()}`); go('welcome') }}/>}
    </div>
  )
}  

// ── Orange palette (Customer Portal) ────────────────────────────────
export const O = {
  primary: '#f97316',
  accent:  '#fb923c',
  deep:    '#ea580c',

  a6:  'rgba(249,115,22,0.06)',
  a10: 'rgba(249,115,22,0.10)',
  a14: 'rgba(249,115,22,0.14)',
  a20: 'rgba(249,115,22,0.20)',
  a30: 'rgba(249,115,22,0.30)',

  border:       'rgba(249,115,22,0.22)',
  borderStrong: 'rgba(249,115,22,0.44)',

  glow:     'rgba(249,115,22,0.36)',
  glowMd:   'rgba(249,115,22,0.22)',
  glowLg:   'rgba(249,115,22,0.14)',

  shadowBtn: '0 4px 28px rgba(249,115,22,0.48), 0 1px 3px rgba(0,0,0,0.28)',
  shadowCard:'0 0 0 1px rgba(249,115,22,0.20), 0 0 32px rgba(249,115,22,0.12)',
} as const

// ── Green palette (Admin Dashboard) ─────────────────────────────────
export const G = {
  primary: '#22c55e',
  accent:  '#4ade80',
  deep:    '#16a34a',

  a6:  'rgba(34,197,94,0.06)',
  a10: 'rgba(34,197,94,0.10)',
  a14: 'rgba(34,197,94,0.14)',
  a20: 'rgba(34,197,94,0.20)',
  a30: 'rgba(34,197,94,0.30)',

  border:       'rgba(34,197,94,0.22)',
  borderStrong: 'rgba(34,197,94,0.44)',

  glow:     'rgba(34,197,94,0.30)',
  glowMd:   'rgba(34,197,94,0.18)',
  glowLg:   'rgba(34,197,94,0.10)',

  shadowBtn: '0 4px 28px rgba(34,197,94,0.42), 0 1px 3px rgba(0,0,0,0.28)',
  shadowCard:'0 0 0 1px rgba(34,197,94,0.20), 0 0 32px rgba(34,197,94,0.10)',
} as const

// ── Semantic status ──────────────────────────────────────────────────
export const S = {
  blue:    { bg:'rgba(59,130,246,0.14)', text:'#93c5fd', border:'rgba(59,130,246,0.22)' },
  yellow:  { bg:'rgba(234,179,8,0.14)',  text:'#fde047', border:'rgba(234,179,8,0.22)' },
  orange:  { bg:'rgba(249,115,22,0.14)', text:'#fb923c', border:'rgba(249,115,22,0.22)' },
  green:   { bg:'rgba(34,197,94,0.14)',  text:'#4ade80', border:'rgba(34,197,94,0.22)' },
  red:     { bg:'rgba(239,68,68,0.14)',  text:'#fca5a5', border:'rgba(239,68,68,0.22)' },
  purple:  { bg:'rgba(168,85,247,0.14)', text:'#d8b4fe', border:'rgba(168,85,247,0.22)' },
} as const

// ── Shared ───────────────────────────────────────────────────────────
export const T = {
  bg: '#070711',

  text: {
    primary:   '#f8fafc',
    secondary: '#94a3b8',
    muted:     '#4b5563',
  },

  glass: {
    border:  'rgba(255,255,255,0.10)',
    hover:   'rgba(255,255,255,0.05)',
    surface: 'rgba(255,255,255,0.04)',
  },

  r: {
    sm:    8,
    md:    12,
    card:  18,
    input: 14,
    modal: 24,
    pill:  999,
  },

  ease: 'cubic-bezier(0.22, 1, 0.36, 1)',
} as const

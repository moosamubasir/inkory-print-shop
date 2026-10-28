import { useState, useEffect, useRef } from 'react'
import {
  ChevronLeft,
  RotateCw,
  RotateCcw,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Crop,
  Sliders,
  Sun,
  Contrast as ContrastIcon,
  Palette,
  Printer,
  Save,
  RotateCcw as ResetIcon,
  Undo2,
  Redo2,
  Trash2,
  ArrowUp,
  ArrowDown,
  LayoutGrid,
  FileText,
  Check,
  Layers,
  Sparkles,
  Move,
  FlipHorizontal,
  Wand2,
  X
} from 'lucide-react'
import { T, G, S } from './tokens'
import { PDFDocument, degrees } from 'pdf-lib'
import * as pdfjsLib from 'pdfjs-dist'

// Set worker src for pdfjs-dist
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`

export interface UploadedFile {
  id: number | string
  orderId?: string
  originalName: string
  storedName: string
  mimeType: string
  size: number
  createdAt?: string
}

export interface Order {
  id: string
  customer: string
  phone?: string
  service: string
  color: string
  paper: string
  copies: number
  sides: string
  files: number
  uploadedFiles?: UploadedFile[]
}

interface ImageState {
  brightness: number // 50 - 150
  contrast: number // 50 - 150
  saturation: number // 0 - 200
  sharpness: number // 0 - 10
  colorMode: 'color' | 'bw'
  rotation: number // 0, 90, 180, 270
  cropRect: { x: number; y: number; width: number; height: number } | null // relative 0-1
  cropAspect: 'free' | '1:1' | '4:3' | '16:9' | 'passport'
  targetSize: 'original' | 'A4' | 'A3'
  maintainAspect: boolean
  passportActive: boolean
  passportCount: 5 | 8
  passportOrientation: 'portrait' | 'landscape'
  presetFilter: 'none' | 'auto' | 'high_bw' | 'vivid'
}

interface PdfPageState {
  id: string
  originalIndex: number
  rotation: number // 0, 90, 180, 270
  deleted: boolean
  thumbnailUrl?: string
}

interface PrintPrepState {
  paperSize: string
  orientation: 'portrait' | 'landscape'
  margins: 'normal' | 'narrow' | 'none'
  copies: number
  sides: 'single' | 'double'
  color: 'color' | 'bw'
}

const DEFAULT_IMAGE_STATE: ImageState = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
  sharpness: 0,
  colorMode: 'color',
  rotation: 0,
  cropRect: null,
  cropAspect: 'free',
  targetSize: 'original',
  maintainAspect: true,
  passportActive: false,
  passportCount: 8,
  passportOrientation: 'portrait',
  presetFilter: 'none'
}

const DEFAULT_PRINT_PREP: PrintPrepState = {
  paperSize: 'A4',
  orientation: 'portrait',
  margins: 'normal',
  copies: 1,
  sides: 'single',
  color: 'color'
}

type ToolMode = 'move' | 'crop' | 'rotate' | 'resize' | 'adjust' | 'pages' | 'passport' | 'print'

export function FileEditorWorkspace({
  file,
  order,
  onBack,
  onSaveSuccess
}: {
  file: UploadedFile
  order: Order
  onBack: () => void
  onSaveSuccess?: () => void
}) {
  const isPdf = file.mimeType === 'application/pdf' || file.storedName.endsWith('.pdf')
  const isPassportOrder = order.service === 'passport' || file.originalName.toLowerCase().includes('passport')
  const fileUrl = `http://localhost:5000/uploads/${file.storedName}`

  const initialColorMode: 'color' | 'bw' = order.color === 'bw' ? 'bw' : 'color'

  // ── Image State & History Stack ──────────────────────────────────────
  const [imgState, setImgState] = useState<ImageState>({
    ...DEFAULT_IMAGE_STATE,
    colorMode: initialColorMode,
    passportActive: isPassportOrder
  })
  const [imgHistory, setImgHistory] = useState<ImageState[]>([])
  const [historyIndex, setHistoryIndex] = useState<number>(-1)

  // ── Canva-Style Active Tool Mode & Sub-Drawer State ──────────────────
  const [activeTool, setActiveTool] = useState<ToolMode | null>('crop')

  // ── Interactive Crop Handles Drag State ──────────────────────────────
  const [cropInsets, setCropInsets] = useState<{ top: number; left: number; right: number; bottom: number }>({
    top: 10,
    left: 10,
    right: 10,
    bottom: 10
  })
  const draggingHandleRef = useRef<string | null>(null)
  const dragStartPosRef = useRef<{ x: number; y: number; initialInsets: typeof cropInsets }>({
    x: 0,
    y: 0,
    initialInsets: { top: 10, left: 10, right: 10, bottom: 10 }
  })

  // Synchronize cropInsets to imgState.cropRect
  const applyCropInsets = (insets: typeof cropInsets) => {
    setCropInsets(insets)
    const x = insets.left / 100
    const y = insets.top / 100
    const width = Math.max(0.05, (100 - insets.left - insets.right) / 100)
    const height = Math.max(0.05, (100 - insets.top - insets.bottom) / 100)
    updateImgState({ cropRect: { x, y, width, height } })
  }

  const handleCropDragStart = (e: React.MouseEvent, handle: string) => {
    e.preventDefault()
    draggingHandleRef.current = handle
    dragStartPosRef.current = {
      x: e.clientX,
      y: e.clientY,
      initialInsets: { ...cropInsets }
    }
  }

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!draggingHandleRef.current || !canvasRef.current) return
      const handle = draggingHandleRef.current
      const rect = canvasRef.current.getBoundingClientRect()
      const deltaX = ((e.clientX - dragStartPosRef.current.x) / rect.width) * 100
      const deltaY = ((e.clientY - dragStartPosRef.current.y) / rect.height) * 100

      const init = dragStartPosRef.current.initialInsets
      let next = { ...init }

      if (handle === 'center') {
        const w = 100 - init.left - init.right
        const h = 100 - init.top - init.bottom
        let newLeft = Math.max(0, Math.min(100 - w, init.left + deltaX))
        let newTop = Math.max(0, Math.min(100 - h, init.top + deltaY))
        next = {
          left: newLeft,
          top: newTop,
          right: 100 - newLeft - w,
          bottom: 100 - newTop - h
        }
      } else {
        if (handle.includes('t')) next.top = Math.max(0, Math.min(100 - init.bottom - 5, init.top + deltaY))
        if (handle.includes('b')) next.bottom = Math.max(0, Math.min(100 - init.top - 5, init.bottom - deltaY))
        if (handle.includes('l')) next.left = Math.max(0, Math.min(100 - init.right - 5, init.left + deltaX))
        if (handle.includes('r')) next.right = Math.max(0, Math.min(100 - init.left - 5, init.right - deltaX))
      }

      applyCropInsets(next)
    }

    const handleMouseUp = () => {
      draggingHandleRef.current = null
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [cropInsets])

  // Push new image state to history
  const updateImgState = (newState: Partial<ImageState>) => {
    setImgState(prev => {
      const updated: ImageState = { ...prev, ...newState }
      const newHistory = imgHistory.slice(0, historyIndex + 1)
      newHistory.push(updated)
      setImgHistory(newHistory)
      setHistoryIndex(newHistory.length - 1)
      return updated
    })
  }

  const undoImg = () => {
    if (historyIndex > 0) {
      const prevIdx = historyIndex - 1
      setHistoryIndex(prevIdx)
      setImgState(imgHistory[prevIdx])
    }
  }

  const redoImg = () => {
    if (historyIndex < imgHistory.length - 1) {
      const nextIdx = historyIndex + 1
      setHistoryIndex(nextIdx)
      setImgState(imgHistory[nextIdx])
    }
  }

  const resetImg = () => {
    const reset: ImageState = {
      ...DEFAULT_IMAGE_STATE,
      colorMode: initialColorMode,
      passportActive: isPassportOrder
    }
    setImgState(reset)
    setImgHistory([reset])
    setHistoryIndex(0)
  }

  useEffect(() => {
    if (!isPdf && historyIndex === -1) {
      const init: ImageState = {
        ...DEFAULT_IMAGE_STATE,
        colorMode: initialColorMode,
        passportActive: isPassportOrder
      }
      setImgHistory([init])
      setHistoryIndex(0)
    }
  }, [isPdf, historyIndex, initialColorMode, isPassportOrder])

  // ── PDF State ────────────────────────────────────────────────────────
  const [pdfPages, setPdfPages] = useState<PdfPageState[]>([])
  const [pdfHistory, setPdfHistory] = useState<PdfPageState[][]>([])
  const [pdfHistoryIdx, setPdfHistoryIdx] = useState<number>(-1)
  const [pdfCurrentPage, setPdfCurrentPage] = useState<number>(1)
  const [pdfTotalPages, setPdfTotalPages] = useState<number>(0)

  const updatePdfPages = (newPages: PdfPageState[]) => {
    const newHist = pdfHistory.slice(0, pdfHistoryIdx + 1)
    newHist.push(newPages)
    setPdfHistory(newHist)
    setPdfHistoryIdx(newHist.length - 1)
    setPdfPages(newPages)
  }

  const undoPdf = () => {
    if (pdfHistoryIdx > 0) {
      const prev = pdfHistoryIdx - 1
      setPdfHistoryIdx(prev)
      setPdfPages(pdfHistory[prev])
    }
  }

  const redoPdf = () => {
    if (pdfHistoryIdx < pdfHistory.length - 1) {
      const next = pdfHistoryIdx + 1
      setPdfHistoryIdx(next)
      setPdfPages(pdfHistory[next])
    }
  }

  const resetPdf = () => {
    if (pdfHistory.length > 0) {
      setPdfHistoryIdx(0)
      setPdfPages(pdfHistory[0])
    }
  }

  // ── Print Prep & Workspace State ──────────────────────────────────────
  const [printPrep, setPrintPrep] = useState<PrintPrepState>({
    ...DEFAULT_PRINT_PREP,
    color: initialColorMode,
    copies: order.copies || 1,
    paperSize: order.paper || 'A4'
  })
  const [zoom, setZoom] = useState<number>(100)
  const [saving, setSaving] = useState<boolean>(false)

  // Canvas Refs
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const imageObjRef = useRef<HTMLImageElement | null>(null)
  const [imageLoaded, setImageLoaded] = useState<boolean>(false)

  // ── Load Image ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!isPdf) {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.src = fileUrl
      img.onload = () => {
        imageObjRef.current = img
        setImageLoaded(true)
      }
    }
  }, [fileUrl, isPdf])

  // Helper CSS Filter string generator
  const getCanvasFilterString = (state: ImageState) => {
    let b = state.brightness
    let c = state.contrast
    let s = state.saturation

    if (state.presetFilter === 'auto') {
      b = 110
      c = 115
      s = 105
    } else if (state.presetFilter === 'high_bw') {
      b = 105
      c = 130
    } else if (state.presetFilter === 'vivid') {
      b = 105
      c = 110
      s = 140
    }

    let filters = `brightness(${b}%) contrast(${c}%) saturate(${s}%)`
    if (state.colorMode === 'bw' || state.presetFilter === 'high_bw') {
      filters += ' grayscale(100%)'
    }
    return filters
  }

  // Sharpness Convolution Matrix Helper
  const applySharpness = (ctx: CanvasRenderingContext2D, width: number, height: number, amount: number) => {
    const imageData = ctx.getImageData(0, 0, width, height)
    const data = imageData.data
    const factor = amount * 0.1
    const kernel = [
      0, -factor, 0,
      -factor, 1 + 4 * factor, -factor,
      0, -factor, 0
    ]

    const copy = ctx.createImageData(width, height)
    const copyData = copy.data
    copyData.set(data)

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        for (let c = 0; c < 3; c++) {
          const i = (y * width + x) * 4 + c
          const val =
            kernel[0] * copyData[((y - 1) * width + (x - 1)) * 4 + c] +
            kernel[1] * copyData[((y - 1) * width + x) * 4 + c] +
            kernel[2] * copyData[((y - 1) * width + (x + 1)) * 4 + c] +
            kernel[3] * copyData[(y * width + (x - 1)) * 4 + c] +
            kernel[4] * copyData[(y * width + x) * 4 + c] +
            kernel[5] * copyData[(y * width + (x + 1)) * 4 + c] +
            kernel[6] * copyData[((y + 1) * width + (x - 1)) * 4 + c] +
            kernel[7] * copyData[((y + 1) * width + x) * 4 + c] +
            kernel[8] * copyData[((y + 1) * width + (x + 1)) * 4 + c]
          data[i] = Math.min(255, Math.max(0, val))
        }
      }
    }
    ctx.putImageData(imageData, 0, 0)
  }

  // ── Render Image to Canvas ──────────────────────────────────────────
  useEffect(() => {
    if (isPdf || !imageLoaded || !imageObjRef.current || !canvasRef.current) return

    const img = imageObjRef.current
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    if (imgState.passportActive) {
      const isPortrait = imgState.passportOrientation === 'portrait'
      canvas.width = isPortrait ? 2480 : 3508
      canvas.height = isPortrait ? 3508 : 2480

      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      const photoW = 413
      const photoH = 531

      const cols = imgState.passportCount === 5 ? 3 : 4
      const rows = Math.ceil(imgState.passportCount / cols)
      const startX = (canvas.width - (cols * photoW + (cols - 1) * 60)) / 2
      const startY = (canvas.height - (rows * photoH + (rows - 1) * 60)) / 2

      for (let i = 0; i < imgState.passportCount; i++) {
        const r = Math.floor(i / cols)
        const c = i % cols
        const x = startX + c * (photoW + 60)
        const y = startY + r * (photoH + 60)

        ctx.save()
        ctx.filter = getCanvasFilterString(imgState)
        ctx.drawImage(img, x, y, photoW, photoH)
        ctx.restore()

        ctx.strokeStyle = '#cccccc'
        ctx.lineWidth = 2
        ctx.strokeRect(x, y, photoW, photoH)
      }
    } else {
      const origW = img.naturalWidth || img.width
      const origH = img.naturalHeight || img.height

      let cropX = 0, cropY = 0, cropW = origW, cropH = origH
      if (imgState.cropRect) {
        cropX = imgState.cropRect.x * origW
        cropY = imgState.cropRect.y * origH
        cropW = imgState.cropRect.width * origW
        cropH = imgState.cropRect.height * origH
      }

      const isRotated = imgState.rotation === 90 || imgState.rotation === 270
      canvas.width = isRotated ? cropH : cropW
      canvas.height = isRotated ? cropW : cropH

      ctx.save()
      ctx.translate(canvas.width / 2, canvas.height / 2)
      ctx.rotate((imgState.rotation * Math.PI) / 180)

      ctx.filter = getCanvasFilterString(imgState)

      const drawW = isRotated ? canvas.height : canvas.width
      const drawH = isRotated ? canvas.width : canvas.height

      ctx.drawImage(img, cropX, cropY, cropW, cropH, -drawW / 2, -drawH / 2, drawW, drawH)
      ctx.restore()

      if (imgState.sharpness > 0) {
        applySharpness(ctx, canvas.width, canvas.height, imgState.sharpness)
      }
    }
  }, [imgState, imageLoaded, isPdf])

  // ── Load PDF Pages ──────────────────────────────────────────────────
  useEffect(() => {
    if (isPdf) {
      const loadPdf = async () => {
        try {
          const loadingTask = pdfjsLib.getDocument({ url: fileUrl })
          const pdf = await loadingTask.promise
          setPdfTotalPages(pdf.numPages)

          const pageStates: PdfPageState[] = []

          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i)
            const viewport = page.getViewport({ scale: 0.3 })

            const canvas = document.createElement('canvas')
            const ctx = canvas.getContext('2d')
            if (ctx) {
              canvas.width = viewport.width
              canvas.height = viewport.height
              await page.render({ canvasContext: ctx, viewport, canvas }).promise
              pageStates.push({
                id: `page_${i}`,
                originalIndex: i - 1,
                rotation: 0,
                deleted: false,
                thumbnailUrl: canvas.toDataURL('image/jpeg', 0.7)
              })
            }
          }

          setPdfPages(pageStates)
          setPdfHistory([pageStates])
          setPdfHistoryIdx(0)
        } catch (err) {
          console.error('Failed to render PDF pages:', err)
        }
      }
      loadPdf()
    }
  }, [fileUrl, isPdf])

  // ── PDF Actions ──────────────────────────────────────────────────────
  const rotatePdfPage = (idx: number, delta: number) => {
    const updated = pdfPages.map((p, i) => {
      if (i === idx) {
        const nextRot = (p.rotation + delta + 360) % 360
        return { ...p, rotation: nextRot }
      }
      return p
    })
    updatePdfPages(updated)
  }

  const deletePdfPage = (idx: number) => {
    const updated = pdfPages.map((p, i) => (i === idx ? { ...p, deleted: true } : p))
    updatePdfPages(updated)
  }

  const movePdfPage = (idx: number, dir: -1 | 1) => {
    const newIdx = idx + dir
    if (newIdx < 0 || newIdx >= pdfPages.length) return
    const updated = [...pdfPages]
    const temp = updated[idx]
    updated[idx] = updated[newIdx]
    updated[newIdx] = temp
    updatePdfPages(updated)
  }

  // ── Save Edited File ────────────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true)
    try {
      let blob: Blob
      let fileName = `edited_${file.originalName}`

      if (isPdf) {
        const existingPdfBytes = await fetch(fileUrl).then(res => res.arrayBuffer())
        const srcDoc = await PDFDocument.load(existingPdfBytes)
        const newDoc = await PDFDocument.create()

        const validPages = pdfPages.filter(p => !p.deleted)
        for (const pState of validPages) {
          const [copiedPage] = await newDoc.copyPages(srcDoc, [pState.originalIndex])
          if (pState.rotation > 0) {
            copiedPage.setRotation(degrees((copiedPage.getRotation().angle + pState.rotation) % 360))
          }
          newDoc.addPage(copiedPage)
        }

        const pdfBytes = await newDoc.save()
        blob = new Blob([pdfBytes as unknown as BlobPart], { type: 'application/pdf' })
        if (!fileName.endsWith('.pdf')) fileName += '.pdf'
      } else {
        if (!canvasRef.current) return
        blob = await new Promise<Blob>((resolve, reject) => {
          canvasRef.current?.toBlob(
            b => (b ? resolve(b) : reject(new Error('Canvas to Blob failed'))),
            file.mimeType || 'image/jpeg',
            0.92
          )
        })
      }

      const formData = new FormData()
      formData.append('file', blob, fileName)

      const res = await fetch(`http://localhost:5000/api/orders/${order.id}/edited-files`, {
        method: 'POST',
        body: formData
      })

      const data = await res.json()
      if (data.success) {
        alert('Edited copy saved successfully!')
        if (onSaveSuccess) onSaveSuccess()
        onBack()
      } else {
        alert('Failed to save file: ' + (data.message || 'Unknown error'))
      }
    } catch (err) {
      console.error('Error saving edited file:', err)
      alert('An error occurred while saving the edited copy.')
    } finally {
      setSaving(false)
    }
  }

  // ── Direct Print Action ──────────────────────────────────────────────
  const handlePrint = () => {
    const printWin = window.open('', '_blank')
    if (!printWin) return

    if (!isPdf && canvasRef.current) {
      const dataUrl = canvasRef.current.toDataURL()
      printWin.document.write(`
        <html>
          <head>
            <title>Print - ${file.originalName}</title>
            <style>
              @page { size: ${printPrep.paperSize} ${printPrep.orientation}; margin: 0; }
              body { margin: 0; display: flex; align-items: center; justify-content: center; height: 100vh; background: #fff; }
              img { max-width: 100%; max-height: 100%; object-fit: contain; filter: ${printPrep.color === 'bw' ? 'grayscale(100%)' : 'none'}; }
            </style>
          </head>
          <body>
            <img src="${dataUrl}" />
            <script>
              window.onload = () => { window.print(); window.close(); };
            </script>
          </body>
        </html>
      `)
      printWin.document.close()
    } else {
      printWin.location.href = fileUrl
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#05050b', color: '#fff', fontFamily: 'Inter, sans-serif', overflow: 'hidden' }}>

      {/* ── 1. Top Header Bar (Canva Style) ─────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 20px', background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.08)', flexShrink: 0, zIndex: 20 }}>
        {/* Left: Back & File Title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button
            onClick={onBack}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: T.text.secondary, borderRadius: T.r.md, padding: '6px 12px', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}
          >
            <ChevronLeft size={16} /> Back to Order
          </button>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 280 }}>{file.originalName}</div>
            <div style={{ fontSize: 11, color: T.text.muted }}>Order #{order.id} · {order.customer}</div>
          </div>
        </div>

        {/* Center: History Pill Controls (Undo / Redo / Reset) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.04)', padding: '4px 10px', borderRadius: T.r.pill, border: '1px solid rgba(255,255,255,0.08)' }}>
          <button
            onClick={isPdf ? undoPdf : undoImg}
            disabled={isPdf ? pdfHistoryIdx <= 0 : historyIndex <= 0}
            title="Undo"
            style={{ background: 'none', border: 'none', color: (isPdf ? pdfHistoryIdx > 0 : historyIndex > 0) ? '#fff' : 'rgba(255,255,255,0.2)', padding: '4px 8px', cursor: (isPdf ? pdfHistoryIdx > 0 : historyIndex > 0) ? 'pointer' : 'default', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}
          >
            <Undo2 size={14} /> Undo
          </button>
          <div style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.1)' }} />
          <button
            onClick={isPdf ? redoPdf : redoImg}
            disabled={isPdf ? pdfHistoryIdx >= pdfHistory.length - 1 : historyIndex >= imgHistory.length - 1}
            title="Redo"
            style={{ background: 'none', border: 'none', color: (isPdf ? pdfHistoryIdx < pdfHistory.length - 1 : historyIndex < imgHistory.length - 1) ? '#fff' : 'rgba(255,255,255,0.2)', padding: '4px 8px', cursor: (isPdf ? pdfHistoryIdx < pdfHistory.length - 1 : historyIndex < imgHistory.length - 1) ? 'pointer' : 'default', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}
          >
            <Redo2 size={14} /> Redo
          </button>
          <div style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.1)' }} />
          <button
            onClick={isPdf ? resetPdf : resetImg}
            title="Reset to Original"
            style={{ background: 'none', border: 'none', color: S.red.text, padding: '4px 8px', cursor: 'pointer', fontSize: 12, borderRadius: 4, display: 'flex', alignItems: 'center', gap: 4 }}
          >
            <ResetIcon size={14} /> Reset
          </button>
        </div>

        {/* Right: Print & Save Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={handlePrint}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', padding: '7px 16px', borderRadius: T.r.md, cursor: 'pointer', fontSize: 13, fontWeight: 500 }}
          >
            <Printer size={15} /> Print
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: G.primary, border: 'none', color: '#fff', padding: '7px 18px', borderRadius: T.r.md, cursor: 'pointer', fontSize: 13, fontWeight: 600, boxShadow: G.shadowBtn }}
          >
            <Save size={15} /> {saving ? 'Saving Copy...' : 'Save Edited Copy'}
          </button>
        </div>
      </div>

      {/* ── 2. Main Studio Workspace (Left Tool Rail + Sub-Drawer + Canvas) */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>

        {/* Canva-Style Vertical Left Tool Icon Rail (Width 72px) */}
        <div style={{ width: 72, background: '#0a0a14', borderRight: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '16px 0', gap: 14, flexShrink: 0, zIndex: 15 }}>
          {/* Tool: Select / Pan */}
          <button
            onClick={() => setActiveTool(activeTool === 'move' ? null : 'move')}
            title="Select & Pan"
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, background: activeTool === 'move' ? G.a14 : 'none', border: 'none', color: activeTool === 'move' ? G.accent : T.text.secondary, width: 56, padding: '8px 0', borderRadius: T.r.md, cursor: 'pointer' }}
          >
            <Move size={18} />
            <span style={{ fontSize: 10, fontWeight: 500 }}>Select</span>
          </button>

          {!isPdf && (
            <>
              {/* Tool: Crop (PROMINENT PRIMARY EDIT TOOL) */}
              <button
                onClick={() => setActiveTool(activeTool === 'crop' ? null : 'crop')}
                title="Crop Tool"
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, background: activeTool === 'crop' ? G.a14 : 'none', border: `1px solid ${activeTool === 'crop' ? G.primary : 'transparent'}`, color: activeTool === 'crop' ? G.accent : T.text.secondary, width: 56, padding: '8px 0', borderRadius: T.r.md, cursor: 'pointer' }}
              >
                <Crop size={18} color={activeTool === 'crop' ? G.primary : undefined} />
                <span style={{ fontSize: 10, fontWeight: activeTool === 'crop' ? 700 : 500 }}>Crop</span>
              </button>

              {/* Tool: Rotate */}
              <button
                onClick={() => setActiveTool(activeTool === 'rotate' ? null : 'rotate')}
                title="Rotate Tool"
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, background: activeTool === 'rotate' ? G.a14 : 'none', border: 'none', color: activeTool === 'rotate' ? G.accent : T.text.secondary, width: 56, padding: '8px 0', borderRadius: T.r.md, cursor: 'pointer' }}
              >
                <RotateCw size={18} />
                <span style={{ fontSize: 10, fontWeight: 500 }}>Rotate</span>
              </button>

              {/* Tool: Resize */}
              <button
                onClick={() => setActiveTool(activeTool === 'resize' ? null : 'resize')}
                title="Resize & Fit Sheet"
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, background: activeTool === 'resize' ? G.a14 : 'none', border: 'none', color: activeTool === 'resize' ? G.accent : T.text.secondary, width: 56, padding: '8px 0', borderRadius: T.r.md, cursor: 'pointer' }}
              >
                <Maximize2 size={18} />
                <span style={{ fontSize: 10, fontWeight: 500 }}>Resize</span>
              </button>

              {/* Tool: Adjust */}
              <button
                onClick={() => setActiveTool(activeTool === 'adjust' ? null : 'adjust')}
                title="Color & Filters"
                style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center', background: activeTool === 'adjust' ? G.a14 : 'none', border: 'none', color: activeTool === 'adjust' ? G.accent : T.text.secondary, width: 56, padding: '8px 0', borderRadius: T.r.md, cursor: 'pointer' }}
              >
                <Sliders size={18} />
                <span style={{ fontSize: 10, fontWeight: 500 }}>Adjust</span>
              </button>
            </>
          )}

          {/* Tool: PDF Pages (PDF Only) */}
          {isPdf && (
            <button
              onClick={() => setActiveTool(activeTool === 'pages' ? null : 'pages')}
              title="PDF Page Manager"
              style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center', background: activeTool === 'pages' ? G.a14 : 'none', border: 'none', color: activeTool === 'pages' ? G.accent : T.text.secondary, width: 56, padding: '8px 0', borderRadius: T.r.md, cursor: 'pointer' }}
            >
              <Layers size={18} />
              <span style={{ fontSize: 10, fontWeight: 500 }}>Pages</span>
            </button>
          )}

          {/* Tool: Passport (Passport Orders Only) */}
          {isPassportOrder && !isPdf && (
            <button
              onClick={() => setActiveTool(activeTool === 'passport' ? null : 'passport')}
              title="Passport Sheet Layout"
              style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center', background: activeTool === 'passport' ? G.a14 : 'none', border: 'none', color: activeTool === 'passport' ? G.accent : T.text.secondary, width: 56, padding: '8px 0', borderRadius: T.r.md, cursor: 'pointer' }}
            >
              <LayoutGrid size={18} />
              <span style={{ fontSize: 10, fontWeight: 500 }}>Passport</span>
            </button>
          )}

          {/* Tool: Print Settings */}
          <button
            onClick={() => setActiveTool(activeTool === 'print' ? null : 'print')}
            title="Print Settings"
            style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center', background: activeTool === 'print' ? G.a14 : 'none', border: 'none', color: activeTool === 'print' ? G.accent : T.text.secondary, width: 56, padding: '8px 0', borderRadius: T.r.md, cursor: 'pointer', marginTop: 'auto' }}
          >
            <Printer size={18} />
            <span style={{ fontSize: 10, fontWeight: 500 }}>Print</span>
          </button>
        </div>

        {/* Canva-Style Sliding Inspector Drawer (Width 280px) */}
        {activeTool !== null && (
          <div style={{ width: 280, background: '#0e0e1a', borderRight: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', zIndex: 12, overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <span style={{ fontSize: 13, fontWeight: 700, textTransform: 'capitalize', color: G.primary }}>
                {activeTool === 'move' && 'Select & Pan'}
                {activeTool === 'crop' && 'Crop Image'}
                {activeTool === 'rotate' && 'Rotate & Flip'}
                {activeTool === 'resize' && 'Resize & Sheet Size'}
                {activeTool === 'adjust' && 'Adjust Filters'}
                {activeTool === 'pages' && 'PDF Page Manager'}
                {activeTool === 'passport' && 'Passport A4 Layout'}
                {activeTool === 'print' && 'Print Preparation'}
              </span>
              <button onClick={() => setActiveTool(null)} style={{ background: 'none', border: 'none', color: T.text.muted, cursor: 'pointer' }}><X size={16} /></button>
            </div>

            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 18 }}>

              {/* DRAWER: CROP TOOL */}
              {activeTool === 'crop' && (
                <>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: T.text.muted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8, display: 'block' }}>Aspect Ratio Presets</label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      {[
                        { id: 'free', label: 'Free Crop', insets: { top: 10, left: 10, right: 10, bottom: 10 } },
                        { id: '1:1', label: 'Square (1:1)', insets: { top: 15, left: 15, right: 15, bottom: 15 } },
                        { id: '4:3', label: 'Standard (4:3)', insets: { top: 10, left: 5, right: 5, bottom: 10 } },
                        { id: '16:9', label: 'Widescreen (16:9)', insets: { top: 20, left: 5, right: 5, bottom: 20 } },
                        { id: 'passport', label: 'Passport (2x2)', insets: { top: 10, left: 20, right: 20, bottom: 10 } }
                      ].map(preset => (
                        <button
                          key={preset.id}
                          onClick={() => {
                            updateImgState({ cropAspect: preset.id as any })
                            applyCropInsets(preset.insets)
                          }}
                          style={{ padding: '8px 10px', borderRadius: T.r.md, background: imgState.cropAspect === preset.id ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.03)', border: `1px solid ${imgState.cropAspect === preset.id ? G.primary : 'rgba(255,255,255,0.08)'}`, color: imgState.cropAspect === preset.id ? G.primary : T.text.secondary, cursor: 'pointer', fontSize: 11, fontWeight: 500 }}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Fine Crop Inset Sliders */}
                  <div style={{ background: 'rgba(255,255,255,0.02)', padding: 14, borderRadius: T.r.md, border: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: G.primary }}>Interactive Crop Insets</div>

                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4, color: T.text.secondary }}>
                        <span>Top Crop</span>
                        <span>{cropInsets.top}%</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="40"
                        value={cropInsets.top}
                        onChange={e => applyCropInsets({ ...cropInsets, top: Number(e.target.value) })}
                        style={{ width: '100%', accentColor: G.primary, cursor: 'pointer' }}
                      />
                    </div>

                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4, color: T.text.secondary }}>
                        <span>Bottom Crop</span>
                        <span>{cropInsets.bottom}%</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="40"
                        value={cropInsets.bottom}
                        onChange={e => applyCropInsets({ ...cropInsets, bottom: Number(e.target.value) })}
                        style={{ width: '100%', accentColor: G.primary, cursor: 'pointer' }}
                      />
                    </div>

                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4, color: T.text.secondary }}>
                        <span>Left Crop</span>
                        <span>{cropInsets.left}%</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="40"
                        value={cropInsets.left}
                        onChange={e => applyCropInsets({ ...cropInsets, left: Number(e.target.value) })}
                        style={{ width: '100%', accentColor: G.primary, cursor: 'pointer' }}
                      />
                    </div>

                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4, color: T.text.secondary }}>
                        <span>Right Crop</span>
                        <span>{cropInsets.right}%</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="40"
                        value={cropInsets.right}
                        onChange={e => applyCropInsets({ ...cropInsets, right: Number(e.target.value) })}
                        style={{ width: '100%', accentColor: G.primary, cursor: 'pointer' }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <button
                      onClick={() => setActiveTool(null)}
                      style={{ padding: 10, background: G.primary, border: 'none', color: '#fff', borderRadius: T.r.md, fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                    >
                      <Check size={14} /> Apply Crop
                    </button>
                    <button
                      onClick={() => {
                        applyCropInsets({ top: 0, left: 0, right: 0, bottom: 0 })
                        updateImgState({ cropRect: null })
                      }}
                      style={{ padding: 10, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: S.red.text, borderRadius: T.r.md, fontSize: 12, fontWeight: 500, cursor: 'pointer' }}
                    >
                      Reset Crop
                    </button>
                  </div>
                </>
              )}

              {/* DRAWER: ROTATE TOOL */}
              {activeTool === 'rotate' && (
                <>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: T.text.muted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8, display: 'block' }}>90° Rotation</label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <button onClick={() => updateImgState({ rotation: (imgState.rotation - 90 + 360) % 360 })} style={{ padding: 10, borderRadius: T.r.md, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: T.text.secondary, cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><RotateCcw size={15} /> Rotate Left</button>
                      <button onClick={() => updateImgState({ rotation: (imgState.rotation + 90) % 360 })} style={{ padding: 10, borderRadius: T.r.md, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: T.text.secondary, cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><RotateCw size={15} /> Rotate Right</button>
                    </div>
                  </div>

                  <div>
                    <button onClick={() => updateImgState({ rotation: (imgState.rotation + 180) % 360 })} style={{ width: '100%', padding: 10, borderRadius: T.r.md, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: T.text.secondary, cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                      <FlipHorizontal size={15} /> 180° Flip Image
                    </button>
                  </div>
                </>
              )}

              {/* DRAWER: RESIZE TOOL */}
              {activeTool === 'resize' && (
                <>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: T.text.muted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8, display: 'block' }}>Target Paper Scaling</label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {(['original', 'A4', 'A3'] as const).map(size => (
                        <button
                          key={size}
                          onClick={() => updateImgState({ targetSize: size })}
                          style={{ padding: 10, borderRadius: T.r.md, background: imgState.targetSize === size ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.03)', border: `1px solid ${imgState.targetSize === size ? G.primary : 'rgba(255,255,255,0.08)'}`, color: imgState.targetSize === size ? G.primary : T.text.secondary, cursor: 'pointer', fontSize: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                        >
                          <span>Fit to {size} Sheet</span>
                          {imgState.targetSize === size && <Check size={14} color={G.primary} />}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* DRAWER: ADJUST FILTERS TOOL */}
              {activeTool === 'adjust' && (
                <>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: T.text.muted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8, display: 'block' }}>Color Mode</label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <button onClick={() => updateImgState({ colorMode: 'color', presetFilter: 'none' })} style={{ padding: 8, borderRadius: T.r.md, background: imgState.colorMode === 'color' ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.03)', border: `1px solid ${imgState.colorMode === 'color' ? G.primary : 'rgba(255,255,255,0.08)'}`, color: imgState.colorMode === 'color' ? G.primary : T.text.secondary, cursor: 'pointer', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><Palette size={13} /> Full Color</button>
                      <button onClick={() => updateImgState({ colorMode: 'bw' })} style={{ padding: 8, borderRadius: T.r.md, background: imgState.colorMode === 'bw' ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.03)', border: `1px solid ${imgState.colorMode === 'bw' ? G.primary : 'rgba(255,255,255,0.08)'}`, color: imgState.colorMode === 'bw' ? G.primary : T.text.secondary, cursor: 'pointer', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><FileText size={13} /> Grayscale</button>
                    </div>
                  </div>

                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: T.text.muted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8, display: 'block' }}>Preset Enhancement</label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                      {[
                        { id: 'none', label: 'Normal' },
                        { id: 'auto', label: 'Auto Enhance' },
                        { id: 'high_bw', label: 'High Contrast B&W' },
                        { id: 'vivid', label: 'Vivid Print' }
                      ].map(f => (
                        <button
                          key={f.id}
                          onClick={() => updateImgState({ presetFilter: f.id as any })}
                          style={{ padding: '6px 8px', borderRadius: T.r.md, background: imgState.presetFilter === f.id ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.03)', border: `1px solid ${imgState.presetFilter === f.id ? G.primary : 'rgba(255,255,255,0.08)'}`, color: imgState.presetFilter === f.id ? G.primary : T.text.secondary, cursor: 'pointer', fontSize: 10 }}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4, color: T.text.secondary }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Sun size={13} /> Brightness</span>
                      <span style={{ fontWeight: 600, color: G.primary }}>{imgState.brightness}%</span>
                    </div>
                    <input type="range" min="50" max="150" value={imgState.brightness} onChange={e => updateImgState({ brightness: Number(e.target.value) })} style={{ width: '100%', accentColor: G.primary, cursor: 'pointer' }} />
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4, color: T.text.secondary }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><ContrastIcon size={13} /> Contrast</span>
                      <span style={{ fontWeight: 600, color: G.primary }}>{imgState.contrast}%</span>
                    </div>
                    <input type="range" min="50" max="150" value={imgState.contrast} onChange={e => updateImgState({ contrast: Number(e.target.value) })} style={{ width: '100%', accentColor: G.primary, cursor: 'pointer' }} />
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4, color: T.text.secondary }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Palette size={13} /> Saturation</span>
                      <span style={{ fontWeight: 600, color: G.primary }}>{imgState.saturation}%</span>
                    </div>
                    <input type="range" min="0" max="200" value={imgState.saturation} onChange={e => updateImgState({ saturation: Number(e.target.value) })} style={{ width: '100%', accentColor: G.primary, cursor: 'pointer' }} />
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4, color: T.text.secondary }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Sparkles size={13} /> Sharpness</span>
                      <span style={{ fontWeight: 600, color: G.primary }}>{imgState.sharpness}</span>
                    </div>
                    <input type="range" min="0" max="10" value={imgState.sharpness} onChange={e => updateImgState({ sharpness: Number(e.target.value) })} style={{ width: '100%', accentColor: G.primary, cursor: 'pointer' }} />
                  </div>
                </>
              )}

              {/* DRAWER: PDF PAGES MANAGER (PDF Only) */}
              {activeTool === 'pages' && isPdf && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ fontSize: 11, color: T.text.muted }}>
                    Reorder, rotate, or delete pages before printing.
                  </div>
                  {pdfPages.map((page, idx) => (
                    <div
                      key={page.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: 8,
                        borderRadius: T.r.md,
                        background: page.deleted ? 'rgba(239,68,68,0.08)' : pdfCurrentPage === idx + 1 ? 'rgba(34,197,94,0.12)' : 'rgba(255,255,255,0.03)',
                        border: `1px solid ${page.deleted ? 'rgba(239,68,68,0.2)' : pdfCurrentPage === idx + 1 ? G.primary : 'rgba(255,255,255,0.06)'}`,
                        opacity: page.deleted ? 0.5 : 1,
                        cursor: 'pointer'
                      }}
                      onClick={() => !page.deleted && setPdfCurrentPage(idx + 1)}
                    >
                      <div style={{ width: 36, height: 46, background: '#fff', borderRadius: 4, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {page.thumbnailUrl ? (
                          <img src={page.thumbnailUrl} alt={`Page ${idx + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `rotate(${page.rotation}deg)` }} />
                        ) : (
                          <FileText size={16} color="#666" />
                        )}
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, textDecoration: page.deleted ? 'line-through' : 'none' }}>
                          Page {idx + 1}
                        </div>
                        <div style={{ fontSize: 10, color: T.text.muted }}>
                          {page.deleted ? 'Deleted' : `${page.rotation}°`}
                        </div>
                      </div>

                      {!page.deleted ? (
                        <div style={{ display: 'flex', gap: 2 }}>
                          <button onClick={(e) => { e.stopPropagation(); movePdfPage(idx, -1) }} disabled={idx === 0} title="Move Up" style={{ padding: 3, background: 'none', border: 'none', color: T.text.secondary, cursor: 'pointer' }}><ArrowUp size={12} /></button>
                          <button onClick={(e) => { e.stopPropagation(); movePdfPage(idx, 1) }} disabled={idx === pdfPages.length - 1} title="Move Down" style={{ padding: 3, background: 'none', border: 'none', color: T.text.secondary, cursor: 'pointer' }}><ArrowDown size={12} /></button>
                          <button onClick={(e) => { e.stopPropagation(); rotatePdfPage(idx, 90) }} title="Rotate 90°" style={{ padding: 3, background: 'none', border: 'none', color: T.text.secondary, cursor: 'pointer' }}><RotateCw size={12} /></button>
                          <button onClick={(e) => { e.stopPropagation(); deletePdfPage(idx) }} title="Delete Page" style={{ padding: 3, background: 'none', border: 'none', color: S.red.text, cursor: 'pointer' }}><Trash2 size={12} /></button>
                        </div>
                      ) : (
                        <button onClick={(e) => { e.stopPropagation(); updatePdfPages(pdfPages.map((p, i) => i === idx ? { ...p, deleted: false } : p)) }} style={{ padding: '2px 6px', background: 'none', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: 4, cursor: 'pointer', fontSize: 10 }}>Restore</button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* DRAWER: PASSPORT PHOTO (Passport Orders Only) */}
              {activeTool === 'passport' && isPassportOrder && !isPdf && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <button
                    onClick={() => updateImgState({ passportActive: !imgState.passportActive })}
                    style={{ width: '100%', padding: 10, borderRadius: T.r.md, background: imgState.passportActive ? G.primary : 'rgba(255,255,255,0.05)', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
                  >
                    {imgState.passportActive ? 'Disable Passport Layout' : 'Enable A4 Passport Sheet'}
                  </button>

                  {imgState.passportActive && (
                    <>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: T.text.muted, marginBottom: 6 }}>Photo Grid Count</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                          <button onClick={() => updateImgState({ passportCount: 5 })} style={{ padding: 8, borderRadius: T.r.md, background: imgState.passportCount === 5 ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.03)', border: `1px solid ${imgState.passportCount === 5 ? G.primary : 'rgba(255,255,255,0.08)'}`, color: imgState.passportCount === 5 ? G.primary : T.text.secondary, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>5 Photos</button>
                          <button onClick={() => updateImgState({ passportCount: 8 })} style={{ padding: 8, borderRadius: T.r.md, background: imgState.passportCount === 8 ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.03)', border: `1px solid ${imgState.passportCount === 8 ? G.primary : 'rgba(255,255,255,0.08)'}`, color: imgState.passportCount === 8 ? G.primary : T.text.secondary, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>8 Photos</button>
                        </div>
                      </div>

                      <div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: T.text.muted, marginBottom: 6 }}>Sheet Orientation</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                          <button onClick={() => updateImgState({ passportOrientation: 'portrait' })} style={{ padding: 8, borderRadius: T.r.md, background: imgState.passportOrientation === 'portrait' ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.03)', border: `1px solid ${imgState.passportOrientation === 'portrait' ? G.primary : 'rgba(255,255,255,0.08)'}`, color: imgState.passportOrientation === 'portrait' ? G.primary : T.text.secondary, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Portrait</button>
                          <button onClick={() => updateImgState({ passportOrientation: 'landscape' })} style={{ padding: 8, borderRadius: T.r.md, background: imgState.passportOrientation === 'landscape' ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.03)', border: `1px solid ${imgState.passportOrientation === 'landscape' ? G.primary : 'rgba(255,255,255,0.08)'}`, color: imgState.passportOrientation === 'landscape' ? G.primary : T.text.secondary, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Landscape</button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* DRAWER: PRINT PREPARATION */}
              {activeTool === 'print' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: T.text.muted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6, display: 'block' }}>Paper Size</label>
                    <select
                      value={printPrep.paperSize}
                      onChange={e => setPrintPrep({ ...printPrep, paperSize: e.target.value })}
                      style={{ width: '100%', padding: 8, borderRadius: T.r.md, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: 12, cursor: 'pointer' }}
                    >
                      <option value="A4" style={{ background: '#111' }}>A4 (Standard 210 x 297 mm)</option>
                      <option value="A3" style={{ background: '#111' }}>A3 (Large 297 x 420 mm)</option>
                      <option value="Letter" style={{ background: '#111' }}>Letter (8.5 x 11 in)</option>
                      <option value="4x6" style={{ background: '#111' }}>4 x 6 Photo Paper</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: T.text.muted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6, display: 'block' }}>Orientation</label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <button onClick={() => setPrintPrep({ ...printPrep, orientation: 'portrait' })} style={{ padding: 8, borderRadius: T.r.md, background: printPrep.orientation === 'portrait' ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.03)', border: `1px solid ${printPrep.orientation === 'portrait' ? G.primary : 'rgba(255,255,255,0.08)'}`, color: printPrep.orientation === 'portrait' ? G.primary : T.text.secondary, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Portrait</button>
                      <button onClick={() => setPrintPrep({ ...printPrep, orientation: 'landscape' })} style={{ padding: 8, borderRadius: T.r.md, background: printPrep.orientation === 'landscape' ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.03)', border: `1px solid ${printPrep.orientation === 'landscape' ? G.primary : 'rgba(255,255,255,0.08)'}`, color: printPrep.orientation === 'landscape' ? G.primary : T.text.secondary, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Landscape</button>
                    </div>
                  </div>

                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: T.text.muted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6, display: 'block' }}>Print Color</label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <button onClick={() => setPrintPrep({ ...printPrep, color: 'color' })} style={{ padding: 8, borderRadius: T.r.md, background: printPrep.color === 'color' ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.03)', border: `1px solid ${printPrep.color === 'color' ? G.primary : 'rgba(255,255,255,0.08)'}`, color: printPrep.color === 'color' ? G.primary : T.text.secondary, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Full Color</button>
                      <button onClick={() => setPrintPrep({ ...printPrep, color: 'bw' })} style={{ padding: 8, borderRadius: T.r.md, background: printPrep.color === 'bw' ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.03)', border: `1px solid ${printPrep.color === 'bw' ? G.primary : 'rgba(255,255,255,0.08)'}`, color: printPrep.color === 'bw' ? G.primary : T.text.secondary, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Grayscale</button>
                    </div>
                  </div>

                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: T.text.muted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6, display: 'block' }}>Sides</label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <button onClick={() => setPrintPrep({ ...printPrep, sides: 'single' })} style={{ padding: 8, borderRadius: T.r.md, background: printPrep.sides === 'single' ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.03)', border: `1px solid ${printPrep.sides === 'single' ? G.primary : 'rgba(255,255,255,0.08)'}`, color: printPrep.sides === 'single' ? G.primary : T.text.secondary, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Single-sided</button>
                      <button onClick={() => setPrintPrep({ ...printPrep, sides: 'double' })} style={{ padding: 8, borderRadius: T.r.md, background: printPrep.sides === 'double' ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.03)', border: `1px solid ${printPrep.sides === 'double' ? G.primary : 'rgba(255,255,255,0.08)'}`, color: printPrep.sides === 'double' ? G.primary : T.text.secondary, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Double-sided</button>
                    </div>
                  </div>
                </div>
              )}

            </div>
          </div>
        )}

        {/* ── 3. Central Canva-Style Canvas Studio ─────────────────────── */}
        <div style={{ flex: 1, background: '#05050b', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'auto', padding: 30 }}>

          {/* Interactive Crop Handles Overlay on Canvas when Crop Tool is Active */}
          <div style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'center center', transition: 'transform 0.15s ease-out', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
            {!isPdf ? (
              <div style={{ position: 'relative', display: 'inline-block' }}>
                <canvas
                  ref={canvasRef}
                  style={{
                    boxShadow: '0 20px 60px rgba(0,0,0,0.85)',
                    borderRadius: 4,
                    maxWidth: '85vw',
                    maxHeight: '78vh',
                    display: 'block'
                  }}
                />

                {/* Canva Interactive Crop Overlay Guide with Drag Handles */}
                {activeTool === 'crop' && (
                  <div
                    onMouseDown={(e) => handleCropDragStart(e, 'center')}
                    style={{
                      position: 'absolute',
                      top: `${cropInsets.top}%`,
                      left: `${cropInsets.left}%`,
                      right: `${cropInsets.right}%`,
                      bottom: `${cropInsets.bottom}%`,
                      border: `2px dashed ${G.primary}`,
                      boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.55)',
                      cursor: 'move',
                      zIndex: 30,
                      borderRadius: 2
                    }}
                  >
                    {/* Grid Lines inside Crop Box */}
                    <div style={{ position: 'absolute', inset: 0, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gridTemplateRows: '1fr 1fr 1fr', pointerEvents: 'none' }}>
                      <div style={{ borderRight: '1px solid rgba(255,255,255,0.25)', borderBottom: '1px solid rgba(255,255,255,0.25)' }} />
                      <div style={{ borderRight: '1px solid rgba(255,255,255,0.25)', borderBottom: '1px solid rgba(255,255,255,0.25)' }} />
                      <div style={{ borderBottom: '1px solid rgba(255,255,255,0.25)' }} />
                      <div style={{ borderRight: '1px solid rgba(255,255,255,0.25)', borderBottom: '1px solid rgba(255,255,255,0.25)' }} />
                      <div style={{ borderRight: '1px solid rgba(255,255,255,0.25)', borderBottom: '1px solid rgba(255,255,255,0.25)' }} />
                      <div style={{ borderBottom: '1px solid rgba(255,255,255,0.25)' }} />
                      <div style={{ borderRight: '1px solid rgba(255,255,255,0.25)' }} />
                      <div style={{ borderRight: '1px solid rgba(255,255,255,0.25)' }} />
                      <div />
                    </div>

                    {/* Corner Drag Handles */}
                    <div
                      onMouseDown={(e) => { e.stopPropagation(); handleCropDragStart(e, 'tl'); }}
                      style={{ position: 'absolute', top: -8, left: -8, width: 16, height: 16, background: G.primary, border: '2px solid #fff', borderRadius: 3, cursor: 'nwse-resize', zIndex: 35 }}
                    />
                    <div
                      onMouseDown={(e) => { e.stopPropagation(); handleCropDragStart(e, 'tr'); }}
                      style={{ position: 'absolute', top: -8, right: -8, width: 16, height: 16, background: G.primary, border: '2px solid #fff', borderRadius: 3, cursor: 'nesw-resize', zIndex: 35 }}
                    />
                    <div
                      onMouseDown={(e) => { e.stopPropagation(); handleCropDragStart(e, 'bl'); }}
                      style={{ position: 'absolute', bottom: -8, left: -8, width: 16, height: 16, background: G.primary, border: '2px solid #fff', borderRadius: 3, cursor: 'nesw-resize', zIndex: 35 }}
                    />
                    <div
                      onMouseDown={(e) => { e.stopPropagation(); handleCropDragStart(e, 'br'); }}
                      style={{ position: 'absolute', bottom: -8, right: -8, width: 16, height: 16, background: G.primary, border: '2px solid #fff', borderRadius: 3, cursor: 'nwse-resize', zIndex: 35 }}
                    />
                  </div>
                )}
              </div>
            ) : (
              <div style={{ background: '#fff', width: 640, height: 840, borderRadius: 4, boxShadow: '0 20px 60px rgba(0,0,0,0.85)', overflow: 'hidden' }}>
                <iframe
                  src={fileUrl}
                  title={file.originalName}
                  style={{ width: '100%', height: '100%', border: 'none', filter: printPrep.color === 'bw' ? 'grayscale(100%)' : 'none' }}
                />
              </div>
            )}
          </div>

          {/* Floating Bottom Zoom & Pan Bar */}
          <div style={{ position: 'absolute', bottom: 20, display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(15,15,25,0.92)', padding: '6px 16px', borderRadius: 30, border: '1px solid rgba(255,255,255,0.12)', backdropFilter: 'blur(10px)', zIndex: 20, boxShadow: '0 8px 30px rgba(0,0,0,0.5)' }}>
            <button onClick={() => setZoom(z => Math.max(25, z - 15))} title="Zoom Out" style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><ZoomOut size={15} /></button>
            <span style={{ fontSize: 12, fontWeight: 600, minWidth: 42, textAlign: 'center' }}>{zoom}%</span>
            <button onClick={() => setZoom(z => Math.min(300, z + 15))} title="Zoom In" style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><ZoomIn size={15} /></button>
            <div style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.15)' }} />
            <button onClick={() => setZoom(100)} title="Fit to Screen" style={{ background: 'none', border: 'none', color: T.text.muted, cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
              <Maximize2 size={13} /> Fit
            </button>
          </div>

        </div>

      </div>

    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import { Camera, Keyboard } from 'lucide-react'
import Modal from '../Modal'
import { useToast } from './ToastProvider'

interface BarcodeScannerModalProps {
  isOpen: boolean
  onClose: () => void
  onScan: (code: string) => void
  title?: string
}

export default function BarcodeScannerModal({
  isOpen,
  onClose,
  onScan,
  title = 'Scan Barcode or QR Code',
}: BarcodeScannerModalProps) {
  const { showToast } = useToast()
  const videoRef = useRef<HTMLVideoElement>(null)
  const [manualCode, setManualCode] = useState('')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [isScanning, setIsScanning] = useState(false)
  const [useManualFallback, setUseManualFallback] = useState(false)
  const [scannerEngine, setScannerEngine] = useState<'native' | 'zxing' | 'manual'>('native')
  const streamRef = useRef<MediaStream | null>(null)
  const zxingReaderRef = useRef<any>(null)
  const isMountedRef = useRef(true)

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      stopCamera()
    }
  }, [])

  const stopCamera = () => {
    if (zxingReaderRef.current) {
      try {
        zxingReaderRef.current.reset()
      } catch {}
      zxingReaderRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
    setIsScanning(false)
  }

  const handleScanSuccess = (code: string) => {
    const trimmed = code.trim()
    if (!trimmed) return
    stopCamera()
    showToast(`Scanned: ${trimmed}`, 'success')
    onScan(trimmed)
    onClose()
  }

  const startScanner = async () => {
    setErrorMsg(null)
    setIsScanning(true)

    // Check mediaDevices support
    if (!navigator?.mediaDevices?.getUserMedia) {
      setErrorMsg('Camera access is not supported on this device/browser.')
      setUseManualFallback(true)
      setScannerEngine('manual')
      setIsScanning(false)
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      })
      if (!isMountedRef.current) {
        stream.getTracks().forEach(t => t.stop())
        return
      }
      streamRef.current = stream

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play().catch(() => {})
      }

      // 1. Try native BarcodeDetector API (Chrome/Edge on Android/Desktop)
      if ('BarcodeDetector' in window) {
        try {
          const detector = new (window as any).BarcodeDetector({
            formats: ['qr_code', 'code_128', 'code_39', 'ean_13', 'ean_8'],
          })
          setScannerEngine('native')

          const detectFrame = async () => {
            if (!isMountedRef.current || !streamRef.current || !videoRef.current) return
            try {
              if (videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
                const barcodes = await detector.detect(videoRef.current)
                if (barcodes && barcodes.length > 0) {
                  handleScanSuccess(barcodes[0].rawValue)
                  return
                }
              }
            } catch {}
            requestAnimationFrame(detectFrame)
          }

          requestAnimationFrame(detectFrame)
          return
        } catch {
          // Native detector init failed, fallback to ZXing
        }
      }

      // 2. Fallback to @zxing/browser (both 1D and 2D support)
      setScannerEngine('zxing')
      const { BrowserMultiFormatReader } = await import('@zxing/browser')
      const codeReader = new BrowserMultiFormatReader()
      zxingReaderRef.current = codeReader

      codeReader.decodeFromVideoElement(videoRef.current!, (result) => {
        if (result && isMountedRef.current) {
          handleScanSuccess(result.getText())
        }
      })
    } catch (err: any) {
      if (!isMountedRef.current) return
      setErrorMsg(`Camera error: ${err.message || 'Permission denied'}`)
      setUseManualFallback(true)
      setScannerEngine('manual')
      setIsScanning(false)
    }
  }

  useEffect(() => {
    if (isOpen) {
      setManualCode('')
      setErrorMsg(null)
      startScanner()
    } else {
      stopCamera()
    }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <Modal title={title} onClose={onClose}>
      <div className="barcode-scanner-modal" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        {/* Viewfinder / Video Canvas */}
        {!useManualFallback && (
          <div
            style={{
              position: 'relative',
              width: '100%',
              height: '260px',
              background: '#000',
              borderRadius: 'var(--r-md)',
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <video
              ref={videoRef}
              playsInline
              muted
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
              }}
            />

            {/* Viewfinder Target Box overlay */}
            <div
              style={{
                position: 'absolute',
                width: '75%',
                height: '60%',
                border: '2px solid var(--brand-300)',
                borderRadius: 'var(--r-md)',
                boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.45)',
                pointerEvents: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <div
                style={{
                  width: '100%',
                  height: '2px',
                  background: 'var(--brand-400)',
                  boxShadow: '0 0 8px var(--brand-400)',
                  animation: 'pulse 1.5s infinite',
                }}
              />
            </div>

            <div
              style={{
                position: 'absolute',
                bottom: 8,
                left: 8,
                right: 8,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                pointerEvents: 'none',
              }}
            >
              <span className="badge badge-gray text-xs" style={{ background: 'rgba(0,0,0,0.7)', color: '#fff' }}>
                Mode: {scannerEngine === 'native' ? '1D/2D Hardware Scanner' : 'ZXing Multi-Format (1D & QR)'} {isScanning ? '● Active' : ''}
              </span>
            </div>
          </div>
        )}

        {errorMsg && (
          <div className="alert alert-warning text-xs">
            <span>⚠</span>
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Manual Code Entry & Fallback */}
        <div className="card" style={{ padding: 'var(--space-3)' }}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase text-muted">
              Manual Barcode / QR Value Entry
            </span>
            <span className="text-xs text-muted">1D Code 128 / QR Code</span>
          </div>

          <form
            onSubmit={e => {
              e.preventDefault()
              handleScanSuccess(manualCode)
            }}
            className="flex gap-2"
          >
            <input
              id="manual-barcode-input"
              type="text"
              className="form-input text-sm"
              placeholder="e.g. WB24-0142, PLOT-104, LOT-2024-001"
              value={manualCode}
              onChange={e => setManualCode(e.target.value)}
              autoFocus={useManualFallback}
            />
            <button
              id="submit-manual-barcode-btn"
              type="submit"
              className="btn btn-primary btn-sm"
              disabled={!manualCode.trim()}
            >
              Apply
            </button>
          </form>
        </div>

        <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button
            type="button"
            className="btn btn-ghost btn-sm flex items-center gap-1.5"
            onClick={() => {
              if (useManualFallback) {
                setUseManualFallback(false)
                startScanner()
              } else {
                stopCamera()
                setUseManualFallback(true)
              }
            }}
          >
            {useManualFallback ? <Camera size={14} /> : <Keyboard size={14} />}
            <span>{useManualFallback ? 'Switch to Camera' : 'Manual Entry Only'}</span>
          </button>

          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  )
}

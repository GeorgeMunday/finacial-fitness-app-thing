import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'

type Detector = { detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]> }
export type ScannerStatus = 'idle' | 'starting' | 'scanning' | 'denied' | 'unsupported'

/** Uses the BarcodeDetector ponyfill (zxing-wasm), with the .wasm served from our own origin so scanning works offline. */
async function defaultDetector(): Promise<Detector> {
  const [{ BarcodeDetector, prepareZXingModule }, { default: wasmUrl }] = await Promise.all([
    import('barcode-detector/ponyfill'),
    import('zxing-wasm/reader/zxing_reader.wasm?url'),
  ])
  prepareZXingModule({ overrides: { locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasmUrl : prefix + path) } })
  return new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] })
}

export function useBarcodeScanner(
  video: RefObject<HTMLVideoElement | null>,
  onCode: (code: string) => void,
  opts: { createDetector?: () => Promise<Detector> } = {},
): { status: ScannerStatus; start(): Promise<void>; stop(): void } {
  const [status, setStatus] = useState<ScannerStatus>('idle')
  const stream = useRef<MediaStream | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const active = useRef(false)
  const onCodeRef = useRef(onCode)
  onCodeRef.current = onCode
  const createDetector = opts.createDetector ?? defaultDetector

  const stop = useCallback(() => {
    active.current = false
    clearTimeout(timer.current)
    stream.current?.getTracks().forEach((t) => t.stop())
    stream.current = null
  }, [])

  const start = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) return setStatus('unsupported')
    setStatus('starting')
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
    } catch (e) {
      return setStatus(e instanceof DOMException && (e.name === 'NotAllowedError' || e.name === 'SecurityError') ? 'denied' : 'unsupported')
    }
    let detector: Detector
    try {
      detector = await createDetector()
    } catch {
      stop()
      return setStatus('unsupported')
    }
    const v = video.current
    if (v) {
      v.srcObject = stream.current
      await v.play().catch(() => {})
    }
    active.current = true
    setStatus('scanning')
    const tick = async () => {
      if (!active.current || !video.current) return
      try {
        const found = await detector.detect(video.current)
        if (found[0]?.rawValue && active.current) {
          stop()
          onCodeRef.current(found[0].rawValue)
          return
        }
      } catch {
        /* frame not ready yet */
      }
      if (active.current) timer.current = setTimeout(tick, 200)
    }
    void tick()
  }, [createDetector, stop, video])

  useEffect(() => stop, [stop])
  return { status, start, stop }
}

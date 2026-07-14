import { useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

const REGION_ID = 'qr-scanner-region';

export default function QrScanner({ onScan, onError }) {
  const scannerRef = useRef(null);

  useEffect(() => {
    const scanner = new Html5Qrcode(REGION_ID);
    scannerRef.current = scanner;

    scanner
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: 250 },
        (decodedText) => onScan(decodedText),
        () => {} // per-frame "no QR in view" callbacks are expected noise; ignore them
      )
      .catch((err) => onError?.(err));

    return () => {
      const safeClear = () => {
        try {
          scanner.clear();
        } catch {
          // clear() can throw synchronously if the camera never
          // successfully started — safe to ignore.
        }
      };
      try {
        // stop() itself can throw synchronously (not just reject) if the
        // scanner never reached a running state — e.g. no camera device,
        // or the component unmounted before start() resolved (React
        // StrictMode's double effect-invocation in dev triggers this).
        scanner.stop().then(safeClear).catch(safeClear);
      } catch {
        safeClear();
      }
    };
  }, [onScan, onError]);

  return <div id={REGION_ID} style={{ width: 300 }} />;
}

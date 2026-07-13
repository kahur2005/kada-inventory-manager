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
      scanner
        .stop()
        .catch(() => {})
        .finally(() => scanner.clear());
    };
  }, [onScan, onError]);

  return <div id={REGION_ID} style={{ width: 300 }} />;
}

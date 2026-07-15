import { useEffect, useRef, useId } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

export default function QrScanner({ onScan, onError }) {
  const scannerRef = useRef(null);
  const onScanRef = useRef(onScan);
  const onErrorRef = useRef(onError);
  const regionId = useId();

  onScanRef.current = onScan;
  onErrorRef.current = onError;

  useEffect(() => {
    const scanner = new Html5Qrcode(regionId);
    scannerRef.current = scanner;

    scanner
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: 250 },
        (decodedText) => onScanRef.current(decodedText),
        () => {}
      )
      .catch((err) => onErrorRef.current?.(err));

    return () => {
      const safeClear = () => {
        try {
          scanner.clear();
        } catch {}
      };
      try {
        scanner.stop().then(safeClear).catch(safeClear);
      } catch {
        safeClear();
      }
    };
  }, [regionId]);

  return <div id={regionId} style={{ width: 300 }} />;
}

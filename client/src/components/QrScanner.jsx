import { useEffect, useRef, useId } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

const FAIL_TIMEOUT_MS = 10000;

/**
 * QrScanner
 *
 * onScan(decodedText): async. Return a truthy value on success — the scanner
 *   stops immediately. Throw (or return falsy) to signal a failed attempt; the
 *   scanner keeps trying without surfacing anything to the user.
 * onFail(lastError): called once if no successful scan happens within
 *   `failTimeoutMs` of the first failed attempt. The scanner stops.
 * onError(err): camera / start-up failure.
 */
export default function QrScanner({ onScan, onError, onFail, failTimeoutMs = FAIL_TIMEOUT_MS }) {
  const onScanRef = useRef(onScan);
  const onErrorRef = useRef(onError);
  const onFailRef = useRef(onFail);
  const regionId = useId();

  onScanRef.current = onScan;
  onErrorRef.current = onError;
  onFailRef.current = onFail;

  useEffect(() => {
    const scanner = new Html5Qrcode(regionId);
    let done = false;
    let processing = false;
    let failTimer = null;
    let lastError = null;

    const stopScanner = () => {
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

    const startFailTimer = () => {
      if (done || failTimer) return;
      failTimer = setTimeout(() => {
        failTimer = null;
        if (done) return;
        done = true;
        stopScanner();
        onFailRef.current?.(lastError);
      }, failTimeoutMs);
    };

    const handleDecode = async (decodedText) => {
      if (done || processing) return;
      processing = true;
      try {
        const ok = await onScanRef.current?.(decodedText);
        if (ok) {
          done = true;
          if (failTimer) {
            clearTimeout(failTimer);
            failTimer = null;
          }
          stopScanner();
          return;
        }
        startFailTimer();
      } catch (err) {
        lastError = err;
        startFailTimer();
      } finally {
        processing = false;
      }
    };

    scanner
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: 250 },
        handleDecode,
        () => {}
      )
      .catch((err) => onErrorRef.current?.(err));

    return () => {
      done = true;
      if (failTimer) {
        clearTimeout(failTimer);
        failTimer = null;
      }
      stopScanner();
    };
  }, [regionId, failTimeoutMs]);

  return <div id={regionId} style={{ width: 300 }} />;
}

import { useState } from 'react';
import Swal from 'sweetalert2';
import apiClient from '../../api/client';
import QrScanner from '../../components/QrScanner';

export default function ScanPage() {
  const [manualCode, setManualCode] = useState('');
  const [scanning, setScanning] = useState(true);

  async function deliverBox(payload) {
    const res = await apiClient.post('/scan/box', payload);
    const itemsList = res.data.items.map((i) => `${i.qty}× ${i.name}`).join(', ') || 'no items';
    await Swal.fire({ icon: 'success', title: 'Box delivered', text: itemsList });
  }

  // Returns true on success (stops the scanner); throws on a failed attempt so the
  // scanner keeps trying for up to 10s before showing a single failure popup.
  async function handleScan(decodedText) {
    let parsed;
    try {
      parsed = JSON.parse(decodedText);
    } catch {
      throw new Error('Unrecognized QR code');
    }
    if (parsed.type !== 'box') {
      throw new Error('That QR is not a recognized code');
    }
    try {
      await deliverBox({ token: parsed.token });
    } catch (err) {
      throw new Error(err.response?.data?.message || 'Something went wrong');
    }
    setScanning(false);
    return true;
  }

  function handleFail(err) {
    setScanning(false);
    Swal.fire({ icon: 'error', title: 'Scan failed', text: err?.message || 'Could not read a valid QR code' });
  }

  async function handleManualSubmit(e) {
    e.preventDefault();
    try {
      await deliverBox({ code: manualCode });
    } catch (err) {
      await Swal.fire({ icon: 'error', title: 'Scan failed', text: err.response?.data?.message || 'Something went wrong' });
    }
    setManualCode('');
  }

  return (
    <div>
      <h1>Scan Incoming Box</h1>
      <div className="card mb-lg">
        <div className="card-header">
          <h3>Camera Scanner</h3>
        </div>
        {scanning ? (
          <QrScanner onScan={handleScan} onFail={handleFail} onError={() => {}} />
        ) : (
          <button type="button" onClick={() => setScanning(true)}>Scan again</button>
        )}
      </div>

      <div className="form-card">
        <form onSubmit={handleManualSubmit}>
          <label htmlFor="manual-box-code">Box code (camera fallback)</label>
          <input id="manual-box-code" value={manualCode} onChange={(e) => setManualCode(e.target.value)} required />
          <div className="form-actions">
            <button type="submit">Submit code</button>
          </div>
        </form>
      </div>
    </div>
  );
}

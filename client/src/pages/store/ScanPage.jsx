import { useState } from 'react';
import Swal from 'sweetalert2';
import apiClient from '../../api/client';
import QrScanner from '../../components/QrScanner';

export default function ScanPage() {
  const [manualCode, setManualCode] = useState('');

  async function deliverBox(token) {
    try {
      const res = await apiClient.post('/scan/box', { token });
      const itemsList = res.data.items.map((i) => `${i.qty}× ${i.name}`).join(', ') || 'no items';
      await Swal.fire({ icon: 'success', title: 'Box delivered', text: itemsList });
    } catch (err) {
      await Swal.fire({ icon: 'error', title: 'Scan failed', text: err.response?.data?.message || 'Something went wrong' });
    }
  }

  async function deliverShipment(code) {
    try {
      const res = await apiClient.post('/shipments/scan', { code });
      const itemsList = res.data.items.map((i) => `${i.qty}× ${i.name}`).join(', ') || 'no items';
      await Swal.fire({ icon: 'success', title: 'Shipment received', text: itemsList });
    } catch (err) {
      await Swal.fire({ icon: 'error', title: 'Scan failed', text: err.response?.data?.message || 'Something went wrong' });
    }
  }

  async function handleScan(decodedText) {
    let parsed;
    try {
      parsed = JSON.parse(decodedText);
    } catch {
      await Swal.fire({ icon: 'error', title: 'Unrecognized QR code' });
      return;
    }
    if (parsed.type === 'box') {
      deliverBox(parsed.token);
    } else if (parsed.type === 'shipment') {
      deliverShipment(parsed.code);
    } else {
      await Swal.fire({ icon: 'error', title: 'That QR is not a recognized code' });
    }
  }

  function handleManualSubmit(e) {
    e.preventDefault();
    deliverShipment(manualCode);
    setManualCode('');
  }

  return (
    <div>
      <h1>Scan Incoming Box</h1>
      <div className="card mb-lg">
        <div className="card-header">
          <h3>Camera Scanner</h3>
        </div>
        <QrScanner onScan={handleScan} onError={() => {}} />
      </div>

      <div className="form-card">
        <form onSubmit={handleManualSubmit}>
          <label htmlFor="manual-box-code">Shipment code (camera fallback)</label>
          <input id="manual-box-code" value={manualCode} onChange={(e) => setManualCode(e.target.value)} required />
          <div className="form-actions">
            <button type="submit">Submit code</button>
          </div>
        </form>
      </div>
    </div>
  );
}

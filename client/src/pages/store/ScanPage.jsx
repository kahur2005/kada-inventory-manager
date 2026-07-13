import { useState } from 'react';
import Swal from 'sweetalert2';
import apiClient from '../../api/client';
import QrScanner from '../../components/QrScanner';

export default function ScanPage() {
  const [manualCode, setManualCode] = useState('');

  async function deliver(payload) {
    try {
      const res = await apiClient.post('/scan/box', payload);
      const itemsList = res.data.items.map((i) => `${i.qty}× ${i.name}`).join(', ') || 'no items';
      await Swal.fire({ icon: 'success', title: 'Box delivered', text: itemsList });
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
    if (parsed.type !== 'box') {
      await Swal.fire({ icon: 'error', title: 'That QR is not a box code' });
      return;
    }
    deliver({ token: parsed.token });
  }

  function handleManualSubmit(e) {
    e.preventDefault();
    deliver({ code: manualCode });
    setManualCode('');
  }

  return (
    <div>
      <h1>Scan Incoming Box</h1>
      <QrScanner onScan={handleScan} onError={() => {}} />

      <form onSubmit={handleManualSubmit}>
        <label htmlFor="manual-box-code">Box code (camera fallback)</label>
        <input id="manual-box-code" value={manualCode} onChange={(e) => setManualCode(e.target.value)} required />
        <button type="submit">Submit code</button>
      </form>
    </div>
  );
}

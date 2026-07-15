import { useState, useEffect, useCallback } from 'react';
import apiClient from '../../api/client';
import QrScanner from '../../components/QrScanner';

export default function AssignPage() {
  const [boxes, setBoxes] = useState([]);
  const [checked, setChecked] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [manualDriverId, setManualDriverId] = useState('');
  const [message, setMessage] = useState('');

  const loadBoxes = useCallback(async () => {
    const res = await apiClient.get('/boxes', { params: { status: 'PACKED', search: '', page: 1, limit: 50 } });
    setBoxes(res.data.boxes);
  }, []);

  useEffect(() => {
    loadBoxes();
    apiClient.get('/drivers').then((res) => setDrivers(res.data.drivers));
  }, [loadBoxes]);

  function toggle(boxId) {
    setChecked((prev) => (prev.includes(boxId) ? prev.filter((id) => id !== boxId) : [...prev, boxId]));
  }

  async function handleDriverScan(decodedText) {
    let payload;
    try {
      payload = JSON.parse(decodedText);
    } catch {
      setMessage('Unrecognized QR code');
      return;
    }
    if (payload.type !== 'driver') {
      setMessage('That QR is not a driver code');
      return;
    }
    const res = await apiClient.post('/scan/driver', { token: payload.token, boxIds: checked });
    setMessage(res.data.message);
    setChecked([]);
    loadBoxes();
  }

  async function handleManualAssign() {
    for (const boxId of checked) {
      await apiClient.post(`/boxes/${boxId}/assign`, { driverId: manualDriverId });
    }
    setChecked([]);
    loadBoxes();
  }

  return (
    <div>
      <h1>Assign Boxes to Driver</h1>

      <div className="card mb-lg">
        <div className="card-header">
          <h3>Select boxes to assign</h3>
          {checked.length > 0 && <span className="badge badge-blue">{checked.length} selected</span>}
        </div>
        {boxes.length === 0 ? (
          <p className="text-muted text-center" style={{ padding: '32px 0' }}>No packed boxes available.</p>
        ) : (
          <div className="box-checklist">
            {boxes.map((box) => (
              <label key={box._id} className="box-checklist-item">
                <input type="checkbox" aria-label={box.code} checked={checked.includes(box._id)} onChange={() => toggle(box._id)} />
                <span className="font-mono font-bold">{box.code}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="form-card">
        <h2>Scan driver QR</h2>
        <QrScanner onScan={handleDriverScan} onError={() => setMessage('Camera unavailable — use the manual dropdown below')} />

        <h2>Manual fallback</h2>
        <label htmlFor="manual-driver">Manual driver</label>
        <select id="manual-driver" value={manualDriverId} onChange={(e) => setManualDriverId(e.target.value)}>
          <option value="">Select a driver</option>
          {drivers.map((driver) => (
            <option key={driver.id} value={driver.id}>
              {driver.name}
            </option>
          ))}
        </select>
        <div className="form-actions">
          <button className="btn-primary" onClick={handleManualAssign} disabled={!manualDriverId || checked.length === 0}>
            Assign selected
          </button>
        </div>

        {message && <div className="alert alert-success mt-md">{message}</div>}
      </div>
    </div>
  );
}

import { useState, useEffect, useCallback } from 'react';
import Swal from 'sweetalert2';
import apiClient from '../../api/client';
import QrScanner from '../../components/QrScanner';

export default function AssignPage() {
  const [boxes, setBoxes] = useState([]);
  const [checked, setChecked] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [manualDriverId, setManualDriverId] = useState('');
  const [expectedArrival, setExpectedArrival] = useState('');
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [scanning, setScanning] = useState(true);

  const loadBoxes = useCallback(async () => {
    const res = await apiClient.get('/boxes', { params: { status: 'PACKED', search, page: 1, limit: 50 } });
    setBoxes(res.data.boxes);
  }, [search]);

  useEffect(() => {
    loadBoxes();
    apiClient.get('/drivers').then((res) => setDrivers(res.data.drivers));
  }, [loadBoxes]);

  function toggle(boxId) {
    setChecked((prev) => (prev.includes(boxId) ? prev.filter((id) => id !== boxId) : [...prev, boxId]));
  }

  function toggleAll() {
    if (checked.length === boxes.length) {
      setChecked([]);
    } else {
      setChecked(boxes.map((b) => b._id));
    }
  }

  // Returns true on success (stops the scanner); throws on a failed attempt so the
  // scanner keeps trying for up to 10s before showing a single failure popup.
  const handleDriverScan = useCallback(async (decodedText) => {
    let payload;
    try {
      payload = JSON.parse(decodedText);
    } catch {
      throw new Error('Unrecognized QR code');
    }
    if (payload.type !== 'driver') {
      throw new Error('That QR is not a driver code');
    }
    if (checked.length === 0) {
      throw new Error('Select at least one box first');
    }
    let res;
    try {
      res = await apiClient.post('/scan/driver', {
        token: payload.token,
        boxIds: checked,
        expectedArrival: expectedArrival || undefined,
      });
    } catch (err) {
      throw new Error(err.response?.data?.message || 'Scan failed');
    }
    setChecked([]);
    setScanning(false);
    setMessage(res.data.message);
    loadBoxes();
    await Swal.fire({ icon: 'success', title: 'Driver assigned', text: res.data.message });
    return true;
  }, [checked, expectedArrival, loadBoxes]);

  function handleScanFail(err) {
    setScanning(false);
    Swal.fire({ icon: 'error', title: 'Scan failed', text: err?.message || 'Could not read a valid QR code' });
  }

  async function handleManualAssign() {
    for (const boxId of checked) {
      await apiClient.post(`/boxes/${boxId}/assign`, {
        driverId: manualDriverId,
        expectedArrival: expectedArrival || undefined,
      });
    }
    setChecked([]);
    loadBoxes();
    setMessage('Boxes assigned');
  }

  return (
    <div>
      <h1>Assign Boxes to Driver</h1>

      <div className="card mb-lg">
        <div className="card-header">
          <h3>Select boxes to assign</h3>
          {checked.length > 0 && <span className="badge badge-blue">{checked.length} selected</span>}
        </div>

        <div className="filter-bar">
          <div>
            <label htmlFor="assign-search">Search code</label>
            <input id="assign-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Kode box..." />
          </div>
        </div>

        {boxes.length === 0 ? (
          <p className="text-muted text-center" style={{ padding: '32px 0' }}>No packed boxes available.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th style={{ width: 40 }}>
                  <input
                    type="checkbox"
                    checked={checked.length === boxes.length}
                    onChange={toggleAll}
                    aria-label="Select all boxes"
                  />
                </th>
                <th>Kode</th>
                <th>Toko</th>
                <th>Items</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {boxes.map((box) => (
                <tr key={box._id}>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={box.code}
                      checked={checked.includes(box._id)}
                      onChange={() => toggle(box._id)}
                    />
                  </td>
                  <td className="font-mono font-bold">{box.code}</td>
                  <td>{box.destinationStore?.name}</td>
                  <td>
                    {box.items?.map((i) => `${i.qty}x ${i.item?.name}`).join(', ') || '-'}
                  </td>
                  <td>
                    <span className="badge badge-gray">{box.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="form-card">
        <label htmlFor="expected-arrival">Expected arrival (optional)</label>
        <input
          id="expected-arrival"
          type="datetime-local"
          value={expectedArrival}
          onChange={(e) => setExpectedArrival(e.target.value)}
        />

        <h2>Scan driver QR</h2>
        {scanning ? (
          <QrScanner
            onScan={handleDriverScan}
            onFail={handleScanFail}
            onError={() => setMessage('Camera unavailable — use the manual dropdown below')}
          />
        ) : (
          <button type="button" onClick={() => setScanning(true)}>Scan again</button>
        )}

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

import { useState, useEffect, useCallback } from 'react';
import QRCode from 'qrcode';
import apiClient from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import QrDisplay from '../../components/QrDisplay';

const POLL_INTERVAL_MS = 15000;

export default function DriverQrPage() {
  const { user } = useAuth();
  const [dataUrl, setDataUrl] = useState('');
  const [boxes, setBoxes] = useState([]);

  useEffect(() => {
    if (!user?.driverQrToken) return;
    const payload = JSON.stringify({ type: 'driver', token: user.driverQrToken });
    QRCode.toDataURL(payload, { width: 200, margin: 2 }).then(setDataUrl);
  }, [user?.driverQrToken]);

  const loadBoxes = useCallback(async () => {
    const res = await apiClient.get('/boxes', { params: { page: 1, limit: 50 } });
    setBoxes(res.data.boxes);
  }, []);

  useEffect(() => {
    loadBoxes();
    const poll = setInterval(loadBoxes, POLL_INTERVAL_MS);
    return () => clearInterval(poll);
  }, [loadBoxes]);

  const carrying = boxes.filter((b) => ['ASSIGNED', 'IN_TRANSIT'].includes(b.status));

  if (!user?.driverQrToken) {
    return (
      <div>
        <h1>My QR</h1>
        <p>QR code not available for your account.</p>
      </div>
    );
  }

  return (
    <div>
      <h1>My QR</h1>
      <p>Show this QR code to the warehouse admin to be assigned deliveries.</p>
      <QrDisplay
        dataUrl={dataUrl}
        label={user.name}
        companyName="PT PecutAI International"
      />

      <div className="section">
        <div className="section-header">
          <h2>Packages you carry</h2>
        </div>
        {carrying.length === 0 ? (
          <div className="empty">
            <p>No packages assigned yet</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Destination</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {carrying.map((box) => (
                <tr key={box._id}>
                  <td className="font-mono font-bold">{box.code}</td>
                  <td>
                    {box.destinationStore?.name || '-'}
                    {box.destinationStore?.address && <div>{box.destinationStore.address}</div>}
                  </td>
                  <td>
                    <span className={`badge badge-${box.status === 'IN_TRANSIT' ? 'orange' : 'yellow'}`}>
                      {box.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { useAuth } from '../../context/AuthContext';

export default function QrPage() {
  const { user } = useAuth();
  const [dataUrl, setDataUrl] = useState(null);

  useEffect(() => {
    if (!user) return;
    QRCode.toDataURL(JSON.stringify({ type: 'driver', id: user.id, token: user.driverQrToken })).then(setDataUrl);
  }, [user]);

  if (!dataUrl) return <div>Loading...</div>;

  return (
    <div style={{ textAlign: 'center' }}>
      <h1>Your Driver QR</h1>
      <img src={dataUrl} alt="Your driver QR" width={300} height={300} />
      <p>Show this to a warehouse admin to be assigned deliveries.</p>
    </div>
  );
}

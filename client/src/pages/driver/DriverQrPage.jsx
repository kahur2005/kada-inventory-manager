import { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { useAuth } from '../../context/AuthContext';
import QrDisplay from '../../components/QrDisplay';

export default function DriverQrPage() {
  const { user } = useAuth();
  const [dataUrl, setDataUrl] = useState('');

  useEffect(() => {
    if (!user?.driverQrToken) return;
    const payload = JSON.stringify({ type: 'driver', token: user.driverQrToken });
    QRCode.toDataURL(payload, { width: 200, margin: 2 }).then(setDataUrl);
  }, [user?.driverQrToken]);

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
    </div>
  );
}

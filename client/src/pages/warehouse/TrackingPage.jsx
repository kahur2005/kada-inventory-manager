import { useState, useEffect } from 'react';
import apiClient from '../../api/client';
import DashboardMap from '../../components/DashboardMap';

export default function TrackingPage() {
  const [driverLocations, setDriverLocations] = useState([]);

  useEffect(() => {
    apiClient.get('/driver-locations').then((res) => setDriverLocations(res.data.driverLocations));
  }, []);

  return (
    <div>
      <h1>Driver Tracking</h1>
      <DashboardMap driverLocations={driverLocations} />
    </div>
  );
}

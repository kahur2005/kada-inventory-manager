import { useState, useEffect } from 'react';
import apiClient from '../../api/client';

export default function HistoryPage() {
  const [boxes, setBoxes] = useState([]);
  const [adjustments, setAdjustments] = useState([]);

  useEffect(() => {
    apiClient.get('/boxes', { params: { status: 'DELIVERED', search: '', page: 1, limit: 10 } }).then((res) => setBoxes(res.data.boxes));
    apiClient.get('/logs', { params: { page: 1, limit: 20 } }).then((res) =>
      setAdjustments(res.data.logs.filter((log) => log.action === 'STOCK_ADJUSTED'))
    );
  }, []);

  return (
    <div>
      <h1>Delivery History</h1>
      <div className="card mb-lg">
        <div className="card-header">
          <h3>Delivered Boxes</h3>
        </div>
        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Items</th>
              <th>Driver</th>
            </tr>
          </thead>
          <tbody>
            {boxes.map((box) => (
              <tr key={box._id}>
                <td className="font-mono font-bold">{box.code}</td>
                <td>{box.items.map((line) => `${line.qty}x ${line.item?.name}`).join(', ')}</td>
                <td>{box.assignedDriver?.name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <div className="card-header">
          <h3>Opname Adjustment Log</h3>
        </div>
        <table>
          <thead>
            <tr>
              <th>When</th>
              <th>Change</th>
            </tr>
          </thead>
          <tbody>
            {adjustments.map((log) => (
              <tr key={log._id}>
                <td>{new Date(log.timestamp).toLocaleString()}</td>
                <td>
                  <span className="font-mono">{log.meta.oldQty}</span>
                  {' → '}
                  <span className="font-mono">{log.meta.newQty}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

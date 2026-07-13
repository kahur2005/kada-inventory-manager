import { useState, useEffect } from 'react';
import apiClient from '../../api/client';

export default function HistoryPage() {
  const [boxes, setBoxes] = useState([]);

  useEffect(() => {
    apiClient.get('/boxes', { params: { status: 'DELIVERED', search: '', page: 1, limit: 10 } }).then((res) => setBoxes(res.data.boxes));
  }, []);

  return (
    <div>
      <h1>Delivery History</h1>
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
              <td>{box.code}</td>
              <td>{box.items.map((line) => `${line.qty}× ${line.item?.name}`).join(', ')}</td>
              <td>{box.assignedDriver?.name}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

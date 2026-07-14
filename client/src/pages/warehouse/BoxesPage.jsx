import { useState, useEffect, useCallback } from 'react';
import apiClient from '../../api/client';
import QrDisplay from '../../components/QrDisplay';

export default function BoxesPage() {
  const [boxes, setBoxes] = useState([]);
  const [stores, setStores] = useState([]);
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [destinationStore, setDestinationStore] = useState('');
  const [lineItem, setLineItem] = useState('');
  const [lineQty, setLineQty] = useState('');
  const [newBoxQr, setNewBoxQr] = useState(null);

  const loadBoxes = useCallback(async () => {
    const res = await apiClient.get('/boxes', { params: { status, search, page: 1, limit: 10 } });
    setBoxes(res.data.boxes);
  }, [status, search]);

  useEffect(() => {
    loadBoxes();
  }, [loadBoxes]);

  useEffect(() => {
    apiClient.get('/stores').then((res) => setStores(res.data.stores));
    apiClient.get('/items').then((res) => setItems(res.data.items));
  }, []);

  async function handleCreate(e) {
    e.preventDefault();
    const res = await apiClient.post('/boxes', {
      destinationStore,
      items: [{ item: lineItem, qty: Number(lineQty) }],
    });
    setNewBoxQr({ code: res.data.box.code, dataUrl: res.data.qrDataUrl });
    setLineItem('');
    setLineQty('');
    loadBoxes();
  }

  return (
    <div>
      <h1>Boxes</h1>

      <div className="filter-bar">
        <div>
          <label htmlFor="box-status">Status</label>
          <select id="box-status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All</option>
            <option value="PACKED">PACKED</option>
            <option value="ASSIGNED">ASSIGNED</option>
            <option value="IN_TRANSIT">IN_TRANSIT</option>
            <option value="DELIVERED">DELIVERED</option>
          </select>
        </div>
        <div>
          <label htmlFor="box-search">Search code</label>
          <input id="box-search" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>Code</th>
            <th>Status</th>
            <th>Destination</th>
          </tr>
        </thead>
        <tbody>
          {boxes.map((box) => (
            <tr key={box._id}>
              <td className="font-mono">{box.code}</td>
              <td><span className={`badge badge-${box.status}`}>{box.status}</span></td>
              <td>{box.destinationStore?.name}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="form-card">
        <form onSubmit={handleCreate}>
          <h2>Create box</h2>
        <label htmlFor="box-store">Destination store</label>
        <select id="box-store" value={destinationStore} onChange={(e) => setDestinationStore(e.target.value)} required>
          <option value="">Select a store</option>
          {stores.map((store) => (
            <option key={store._id} value={store._id}>
              {store.name}
            </option>
          ))}
        </select>

        <label htmlFor="box-item">Item</label>
        <select id="box-item" value={lineItem} onChange={(e) => setLineItem(e.target.value)} required>
          <option value="">Select an item</option>
          {items.map((item) => (
            <option key={item._id} value={item._id}>
              {item.name}
            </option>
          ))}
        </select>

        <label htmlFor="box-qty">Qty</label>
        <input id="box-qty" type="number" min="1" value={lineQty} onChange={(e) => setLineQty(e.target.value)} required />

        <button type="submit">Create box</button>
        </form>
      </div>

      {newBoxQr && <QrDisplay dataUrl={newBoxQr.dataUrl} label={newBoxQr.code} />}
    </div>
  );
}

import { useState, useEffect, useCallback } from 'react';
import Swal from 'sweetalert2';
import apiClient from '../../api/client';

export default function ItemsPage() {
  const [items, setItems] = useState([]);
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [unit, setUnit] = useState('pcs');
  const [volumeM3, setVolumeM3] = useState('');

  const load = useCallback(async () => {
    const res = await apiClient.get('/items');
    setItems(res.data.items);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate(e) {
    e.preventDefault();
    await apiClient.post('/items', {
      name,
      sku,
      unit,
      volumeM3: volumeM3 === '' ? undefined : Number(volumeM3),
    });
    setName('');
    setSku('');
    setUnit('pcs');
    setVolumeM3('');
    load();
  }

  async function handleDelete(item) {
    const result = await Swal.fire({ title: `Delete ${item.name}?`, icon: 'warning', showCancelButton: true, confirmButtonText: 'Delete' });
    if (result.isConfirmed) {
      await apiClient.delete(`/items/${item._id}`);
      load();
    }
  }

  return (
    <div>
      <h1>Items</h1>
      <form onSubmit={handleCreate}>
        <label htmlFor="item-name">Name</label>
        <input id="item-name" value={name} onChange={(e) => setName(e.target.value)} required />

        <label htmlFor="item-sku">SKU</label>
        <input id="item-sku" value={sku} onChange={(e) => setSku(e.target.value)} required />

        <label htmlFor="item-unit">Unit</label>
        <select id="item-unit" value={unit} onChange={(e) => setUnit(e.target.value)}>
          <option value="pcs">pcs</option>
          <option value="box">box</option>
          <option value="kg">kg</option>
        </select>

        <label htmlFor="item-volume">Volume (m³, optional)</label>
        <input id="item-volume" type="number" step="0.01" value={volumeM3} onChange={(e) => setVolumeM3(e.target.value)} />

        <button type="submit">Add item</button>
      </form>

      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>SKU</th>
            <th>Unit</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item._id}>
              <td>{item.name}</td>
              <td>{item.sku}</td>
              <td>{item.unit}</td>
              <td>
                <button aria-label={`Delete ${item.name}`} onClick={() => handleDelete(item)}>
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

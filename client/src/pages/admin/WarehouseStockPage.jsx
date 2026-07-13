import { useState, useEffect, useCallback } from 'react';
import apiClient from '../../api/client';

export default function WarehouseStockPage() {
  const [warehouses, setWarehouses] = useState([]);
  const [items, setItems] = useState([]);
  const [warehouseId, setWarehouseId] = useState('');
  const [itemId, setItemId] = useState('');
  const [qty, setQty] = useState('');
  const [stock, setStock] = useState([]);

  useEffect(() => {
    Promise.all([apiClient.get('/warehouses'), apiClient.get('/items')]).then(([whRes, itemRes]) => {
      setWarehouses(whRes.data.warehouses);
      setItems(itemRes.data.items);
      if (whRes.data.warehouses.length > 0) setWarehouseId(whRes.data.warehouses[0]._id);
      if (itemRes.data.items.length > 0) setItemId(itemRes.data.items[0]._id);
    });
  }, []);

  const loadStock = useCallback(async (whId) => {
    if (!whId) {
      setStock([]);
      return;
    }
    const res = await apiClient.get('/warehouse-stock', { params: { warehouse: whId } });
    setStock(res.data.warehouseStock);
  }, []);

  useEffect(() => {
    loadStock(warehouseId);
  }, [warehouseId, loadStock]);

  async function handleAdd(e) {
    e.preventDefault();
    await apiClient.post('/warehouse-stock/add', { warehouse: warehouseId, item: itemId, qty: Number(qty) });
    setQty('');
    loadStock(warehouseId);
  }

  return (
    <div>
      <h1>Warehouse Stock</h1>

      <label htmlFor="wsp-warehouse">Warehouse</label>
      <select id="wsp-warehouse" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
        {warehouses.map((wh) => (
          <option key={wh._id} value={wh._id}>
            {wh.name}
          </option>
        ))}
      </select>

      <form onSubmit={handleAdd}>
        <label htmlFor="wsp-item">Item</label>
        <select id="wsp-item" value={itemId} onChange={(e) => setItemId(e.target.value)}>
          {items.map((item) => (
            <option key={item._id} value={item._id}>
              {item.name}
            </option>
          ))}
        </select>

        <label htmlFor="wsp-qty">Quantity</label>
        <input id="wsp-qty" type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} required />

        <button type="submit">Add stock</button>
      </form>

      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th>Qty</th>
          </tr>
        </thead>
        <tbody>
          {stock.map((row) => (
            <tr key={row._id}>
              <td>{row.item?.name}</td>
              <td>{row.qty}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

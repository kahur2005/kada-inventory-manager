import { useState, useEffect, useCallback } from 'react';
import apiClient from '../../api/client';
import Swal from 'sweetalert2';

export default function WarehouseStockPage() {
  const [warehouses, setWarehouses] = useState([]);
  const [items, setItems] = useState([]);
  const [warehouseId, setWarehouseId] = useState('');
  const [itemId, setItemId] = useState('');
  const [qty, setQty] = useState('');
  const [stock, setStock] = useState([]);
  const [editRowId, setEditRowId] = useState(null);
  const [editQty, setEditQty] = useState('');

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

  function startEdit(row) {
    setEditRowId(row._id);
    setEditQty(row.qty);
  }

  function cancelEdit() {
    setEditRowId(null);
  }

  async function handleSaveEdit(rowId) {
    await apiClient.patch(`/warehouse-stock/${rowId}`, { qty: Number(editQty) });
    setEditRowId(null);
    loadStock(warehouseId);
  }

  async function handleDelete(row) {
    const result = await Swal.fire({
      title: `Delete stock for ${row.item?.name}?`,
      text: 'This cannot be undone.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Delete',
    });
    if (result.isConfirmed) {
      await apiClient.delete(`/warehouse-stock/${row._id}`);
      loadStock(warehouseId);
    }
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

      <div className="warehouse-stock-layout">
        <div className="warehouse-stock-layout-form">
          <div className="card">
            <div className="card-header">
              <h3>Add Stock</h3>
            </div>
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
          </div>
        </div>

        <div className="warehouse-stock-layout-table">
          <div className="card">
            <div className="card-header">
              <h3>Stock List</h3>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Qty</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {stock.length === 0 ? (
                  <tr><td colSpan="3" className="text-muted text-center">No stock data</td></tr>
                ) : stock.map((row) => (
                  <tr key={row._id}>
                    <td className="font-bold">{row.item?.name}</td>
                    <td>
                      {editRowId === row._id ? (
                        <input
                          type="number"
                          min="0"
                          value={editQty}
                          onChange={(e) => setEditQty(e.target.value)}
                          style={{ width: 80 }}
                        />
                      ) : (
                        row.qty
                      )}
                    </td>
                    <td>
                      {editRowId === row._id ? (
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button type="button" className="btn-sm" onClick={() => handleSaveEdit(row._id)}>Save</button>
                          <button type="button" className="btn-sm" onClick={cancelEdit}>Cancel</button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button type="button" className="btn-sm" onClick={() => startEdit(row)}>Edit</button>
                          <button aria-label={`Delete ${row.item?.name}`} className="btn-sm" onClick={() => handleDelete(row)}>Delete</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

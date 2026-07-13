import { useState, useEffect, useCallback } from 'react';
import apiClient from '../../api/client';
import { useAuth } from '../../context/AuthContext';

export default function StockPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [opname, setOpname] = useState(false);
  const [drafts, setDrafts] = useState({});

  const load = useCallback(async () => {
    if (!user?.store) return;
    const res = await apiClient.get('/store-stock', { params: { store: user.store } });
    setRows(res.data.storeStock);
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  function handleDraftChange(rowId, value) {
    setDrafts((prev) => ({ ...prev, [rowId]: value }));
  }

  async function handleSave(row) {
    const qty = Number(drafts[row._id] ?? row.qty);
    await apiClient.patch(`/store-stock/${row._id}/adjust`, { qty });
    load();
  }

  return (
    <div>
      <h1>Store Stock</h1>
      <button onClick={() => setOpname((v) => !v)}>{opname ? 'Exit opname mode' : 'Opname mode'}</button>

      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th>Qty</th>
            <th>Threshold</th>
            {opname && <th>Save</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row._id}>
              <td>
                {row.item?.name} {row.belowThreshold && <span>Low stock</span>}
              </td>
              <td>
                {opname ? (
                  <>
                    <label htmlFor={`qty-${row._id}`}>{`Qty for ${row.item?.name}`}</label>
                    <input
                      id={`qty-${row._id}`}
                      aria-label={`Qty for ${row.item?.name}`}
                      type="number"
                      defaultValue={row.qty}
                      onChange={(e) => handleDraftChange(row._id, e.target.value)}
                    />
                  </>
                ) : (
                  row.qty
                )}
              </td>
              <td>{row.threshold}</td>
              {opname && (
                <td>
                  <button aria-label={`Save ${row.item?.name}`} onClick={() => handleSave(row)}>
                    Save
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

import { useState, useEffect } from "react";
import apiClient from "../../api/client";

export default function QRPage() {
  const [shipments, setShipments] = useState([]);
  const [items, setItems] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [stores, setStores] = useState([]);
  const [selectedShipment, setSelectedShipment] = useState(null);
  const [qrImage, setQrImage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [form, setForm] = useState({
    warehouse: "",
    destinationStore: "",
    items: [{ item: "", qty: 1 }],
  });

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const [shipRes, itemRes, whRes, storeRes] = await Promise.all([
      apiClient.get("/shipments"),
      apiClient.get("/items"),
      apiClient.get("/warehouse-stock"),
      apiClient.get("/store-stock"),
    ]);
    setShipments(shipRes.data.shipments);
    setItems(itemRes.data.items);
    const whMap = new Map();
    whRes.data.stocks.forEach((s) => {
      if (s.warehouse && !whMap.has(s.warehouse._id)) whMap.set(s.warehouse._id, s.warehouse);
    });
    setWarehouses(Array.from(whMap.values()));
    const storeMap = new Map();
    storeRes.data.stocks.forEach((s) => {
      if (s.store && !storeMap.has(s.store._id)) storeMap.set(s.store._id, s.store);
    });
    setStores(Array.from(storeMap.values()));
  }

  function addItemLine() {
    setForm({ ...form, items: [...form.items, { item: "", qty: 1 }] });
  }

  function removeItemLine(index) {
    setForm({ ...form, items: form.items.filter((_, i) => i !== index) });
  }

  function updateItemLine(index, field, value) {
    const newItems = [...form.items];
    newItems[index] = { ...newItems[index], [field]: value };
    setForm({ ...form, items: newItems });
  }

  async function handleCreate(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const validItems = form.items.filter((i) => i.item && i.qty > 0);
      if (validItems.length === 0) {
        setError("Tambah minimal 1 item");
        setLoading(false);
        return;
      }
      await apiClient.post("/shipments", {
        warehouse: form.warehouse,
        destinationStore: form.destinationStore,
        items: validItems,
      });
      setForm({ warehouse: "", destinationStore: "", items: [{ item: "", qty: 1 }] });
      loadData();
    } catch (err) {
      setError(err.response?.data?.message || "Gagal membuat shipment");
    } finally {
      setLoading(false);
    }
  }

  async function generateQR(shipment) {
    setSelectedShipment(shipment);
    setQrImage(null);
    try {
      const { data } = await apiClient.get(`/qr/shipment/${shipment._id}`);
      setQrImage(data.qrDataUrl);
    } catch {
      setError("Gagal generate QR");
    }
  }

  async function downloadQR(shipment) {
    try {
      const response = await apiClient.get(`/qr/shipment/${shipment._id}/download`, {
        responseType: "blob",
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `${shipment.code}.png`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch {
      setError("Gagal download QR");
    }
  }

  return (
    <div>
      <h1>Shipment & QR Code</h1>

      <div className="form-card">
        <h3>Buat Shipment Baru</h3>
        <form onSubmit={handleCreate}>
          {error && <p className="alert alert-danger">{error}</p>}

          <div className="form-row">
            <div>
              <label>Gudang Asal</label>
              <select
                value={form.warehouse}
                onChange={(e) => setForm({ ...form, warehouse: e.target.value })}
                required
              >
                <option value="">Pilih gudang</option>
                {warehouses.map((w) => (
                  <option key={w._id} value={w._id}>{w.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label>Toko Tujuan</label>
              <select
                value={form.destinationStore}
                onChange={(e) => setForm({ ...form, destinationStore: e.target.value })}
                required
              >
                <option value="">Pilih toko</option>
                {stores.map((s) => (
                  <option key={s._id} value={s._id}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>

          <label>Daftar Barang</label>
          {form.items.map((line, idx) => (
            <div key={idx} className="flex gap-sm mb-sm">
              <select
                value={line.item}
                onChange={(e) => updateItemLine(idx, "item", e.target.value)}
                required
                style={{ flex: 2 }}
              >
                <option value="">Pilih item</option>
                {items.map((i) => (
                  <option key={i._id} value={i._id}>{i.name} ({i.sku})</option>
                ))}
              </select>
              <input
                type="number"
                min="1"
                value={line.qty}
                onChange={(e) => updateItemLine(idx, "qty", parseInt(e.target.value) || 1)}
                style={{ width: 80 }}
              />
              {form.items.length > 1 && (
                <button type="button" className="btn-danger btn-sm" onClick={() => removeItemLine(idx)}>
                  Hapus
                </button>
              )}
            </div>
          ))}
          <button type="button" className="btn-success btn-sm" onClick={addItemLine}>+ Tambah Item</button>

          <div className="form-actions">
            <button type="submit" disabled={loading}>
              {loading ? "Membuat..." : "Buat Shipment"}
            </button>
          </div>
        </form>
      </div>

      <div className="card">
        <div className="card-header">
          <h3>Daftar Shipment</h3>
        </div>
        {shipments.length === 0 ? (
          <p className="text-muted text-center">Belum ada shipment</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Kode</th>
                <th>Gudang</th>
                <th>Toko</th>
                <th>Items</th>
                <th>Status</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {shipments.map((s) => (
                <tr key={s._id}>
                  <td className="font-mono font-bold">{s.code}</td>
                  <td>{s.warehouse?.name}</td>
                  <td>{s.destinationStore?.name}</td>
                  <td>
                    {s.items.map((i) => `${i.qty}x ${i.item?.name}`).join(", ")}
                  </td>
                  <td>
                    <span className={`badge badge-${s.status === "CREATED" ? "gray" : s.status === "RECEIVED" ? "green" : "yellow"}`}>
                      {s.status}
                    </span>
                  </td>
                  <td>
                    <div className="flex gap-sm">
                      <button className="btn-sm" onClick={() => generateQR(s)}>QR</button>
                      <button className="btn-sm" onClick={() => downloadQR(s)}>Download</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {qrImage && selectedShipment && (
        <div className="qr-card" style={{ marginTop: 24 }}>
          <h3>QR Code: {selectedShipment.code}</h3>
          <img src={qrImage} alt={selectedShipment.code} />
          <p>Scan QR ini untuk menerima shipment di toko</p>
        </div>
      )}
    </div>
  );
}

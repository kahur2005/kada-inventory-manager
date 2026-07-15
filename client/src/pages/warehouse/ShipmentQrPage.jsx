import { useState, useEffect } from "react";
import apiClient from "../../api/client";
import QrDisplay from "../../components/QrDisplay";

export default function ShipmentQrPage() {
  const [shipments, setShipments] = useState([]);
  const [items, setItems] = useState([]);
  const [stores, setStores] = useState([]);
  const [selectedShipment, setSelectedShipment] = useState(null);
  const [qrImage, setQrImage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");

  const [form, setForm] = useState({
    destinationStore: "",
    items: [{ item: "", qty: 1 }],
  });

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const [shipRes, itemRes, storeRes] = await Promise.all([
      apiClient.get("/shipments"),
      apiClient.get("/items"),
      apiClient.get("/stores"),
    ]);
    setShipments(shipRes.data.shipments);
    setItems(itemRes.data.items);
    setStores(storeRes.data.stores);
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
        destinationStore: form.destinationStore,
        items: validItems,
      });
      setForm({ destinationStore: "", items: [{ item: "", qty: 1 }] });
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

  const filteredShipments = shipments.filter((s) => {
    const matchStatus = !status || s.status === status;
    const matchSearch = !search || s.code.toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchSearch;
  });

  return (
    <div>
      <h1>Shipment & QR Code</h1>

      <div className="form-card">
        <h3>Buat Shipment Baru</h3>
        <form onSubmit={handleCreate}>
          {error && <p className="alert alert-danger">{error}</p>}

          <div className="form-row">
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

        <div className="filter-bar">
          <div>
            <label>Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Semua</option>
              <option value="CREATED">CREATED</option>
              <option value="RECEIVED">RECEIVED</option>
            </select>
          </div>
          <div>
            <label>Cari</label>
            <input
              type="text"
              placeholder="Kode shipment..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {filteredShipments.length === 0 ? (
          <p className="text-muted text-center">Belum ada shipment</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Kode</th>
                <th>Toko</th>
                <th>Items</th>
                <th>Status</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filteredShipments.map((s) => (
                <tr key={s._id}>
                  <td className="font-mono font-bold">{s.code}</td>
                  <td>{s.destinationStore?.name}</td>
                  <td>
                    {s.items.map((i) => `${i.qty}x ${i.item?.name}`).join(", ")}
                  </td>
                  <td>
                    <span className={`badge badge-${s.status === "CREATED" ? "gray" : "green"}`}>
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
        <div style={{ marginTop: 24 }}>
          <QrDisplay
            dataUrl={qrImage}
            label={selectedShipment.code}
            from={selectedShipment.warehouse?.name}
            to={selectedShipment.destinationStore?.name}
          />
        </div>
      )}
    </div>
  );
}

import { useState, useEffect, useCallback } from 'react';
import apiClient from '../../api/client';
import MapPicker from '../../components/MapPicker';
import AddressSearch from '../../components/AddressSearch';
import Swal from 'sweetalert2';

export default function StoresPage() {
  const [stores, setStores] = useState([]);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [coords, setCoords] = useState(null);

  const [editId, setEditId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editCoords, setEditCoords] = useState(null);

  const load = useCallback(async () => {
    const res = await apiClient.get('/stores');
    setStores(res.data.stores);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate(e) {
    e.preventDefault();
    await apiClient.post('/stores', { name, address, coords });
    setName('');
    setAddress('');
    setCoords(null);
    load();
  }

  function startEdit(store) {
    setEditId(store._id);
    setEditName(store.name);
    setEditAddress(store.address);
    setEditCoords(store.coords);
  }

  function cancelEdit() {
    setEditId(null);
  }

  async function handleSaveEdit(e) {
    e.preventDefault();
    await apiClient.patch(`/stores/${editId}`, {
      name: editName,
      address: editAddress,
      coords: editCoords,
    });
    setEditId(null);
    load();
  }

  async function handleDelete(store) {
    const result = await Swal.fire({
      title: `Delete ${store.name}?`,
      text: 'This cannot be undone.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Delete',
    });
    if (result.isConfirmed) {
      await apiClient.delete(`/stores/${store._id}`);
      load();
    }
  }

  return (
    <div>
      <h1>Stores</h1>

      <div className="store-list">
        {stores.map((store) => (
          <div key={store._id} className="store-card">
            {editId === store._id ? (
              <form onSubmit={handleSaveEdit}>
                <h3>Edit store</h3>
                <label htmlFor={`edit-store-name-${store._id}`}>Name</label>
                <input id={`edit-store-name-${store._id}`} value={editName} onChange={(e) => setEditName(e.target.value)} required />

                <label htmlFor={`edit-store-address-${store._id}`}>Address</label>
                <AddressSearch
                  id={`edit-store-address-${store._id}`}
                  value={editAddress}
                  onChange={setEditAddress}
                  onPick={setEditCoords}
                  placeholder="Search address..."
                />

                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button type="submit">Save</button>
                  <button type="button" onClick={cancelEdit}>Cancel</button>
                </div>
              </form>
            ) : (
              <>
                <h3>{store.name}</h3>
                <p>{store.address}</p>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button type="button" onClick={() => startEdit(store)}>Edit</button>
                  <button aria-label={`Delete ${store.name}`} onClick={() => handleDelete(store)}>Delete</button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      <form onSubmit={handleCreate}>
        <h2>New store</h2>
        <div className="store-form-layout">
          <div className="store-form-fields">
            <label htmlFor="store-name">Name</label>
            <input id="store-name" value={name} onChange={(e) => setName(e.target.value)} required />

            <label htmlFor="store-address">Address</label>
            <AddressSearch
              id="store-address"
              value={address}
              onChange={setAddress}
              onPick={setCoords}
              placeholder="Search warehouse address..."
            />
          </div>
          <div className="store-form-map">
            <MapPicker key={`${coords?.lat}-${coords?.lng}`} coords={coords} onChange={setCoords} />
          </div>
          <div className="store-form-actions">
            <button type="submit">Create store</button>
          </div>
        </div>
      </form>
    </div>
  );
}

import { useState, useEffect, useCallback } from 'react';
import apiClient from '../../api/client';
import MapPicker from '../../components/MapPicker';
import AddressSearch from '../../components/AddressSearch';

export default function StoresPage() {
  const [stores, setStores] = useState([]);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [coords, setCoords] = useState(null);

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

  return (
    <div>
      <h1>Stores</h1>

      <div className="store-list">
        {stores.map((store) => (
          <div key={store._id} className="store-card">
            <h3>{store.name}</h3>
            <p>{store.address}</p>
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

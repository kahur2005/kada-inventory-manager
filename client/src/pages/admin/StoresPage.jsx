import { useState, useEffect, useCallback } from 'react';
import apiClient from '../../api/client';
import MapPicker from '../../components/MapPicker';

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

      {stores.map((store) => (
        <div key={store._id}>
          <h2>{store.name}</h2>
          <p>{store.address}</p>
        </div>
      ))}

      <form onSubmit={handleCreate}>
        <h2>New store</h2>
        <label htmlFor="store-name">Name</label>
        <input id="store-name" value={name} onChange={(e) => setName(e.target.value)} required />

        <label htmlFor="store-address">Address</label>
        <input id="store-address" value={address} onChange={(e) => setAddress(e.target.value)} required />

        <MapPicker coords={coords} onChange={setCoords} />

        <button type="submit">Create store</button>
      </form>
    </div>
  );
}

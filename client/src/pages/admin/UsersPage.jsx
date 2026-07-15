import { useState, useEffect, useCallback } from "react";
import Swal from "sweetalert2";
import apiClient from "../../api/client";

const ROLES = [
  "unassigned",
  "superadmin",
  "warehouse_admin",
  "store_admin",
  "driver",
];

function RoleCell({ user, warehouses, stores, onSave }) {
  const [role, setRole] = useState(user.role);
  const [warehouseId, setWarehouseId] = useState(user.warehouse?.id || "");
  const [storeId, setStoreId] = useState(user.store?.id || "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setRole(user.role);
    setWarehouseId(user.warehouse?.id || "");
    setStoreId(user.store?.id || "");
  }, [user]);

  const dirty =
    role !== user.role ||
    (role === "warehouse_admin" &&
      warehouseId !== (user.warehouse?.id || "")) ||
    (role === "store_admin" && storeId !== (user.store?.id || ""));

  const scopeMissing =
    (role === "warehouse_admin" && !warehouseId) ||
    (role === "store_admin" && !storeId);

  async function handleSave() {
    if (scopeMissing) return;
    setSaving(true);
    try {
      const body = { role };
      if (role === "warehouse_admin") body.warehouse = warehouseId;
      if (role === "store_admin") body.store = storeId;
      await onSave(user.id, body);
    } catch (err) {
      Swal.fire({
        icon: "error",
        title: "Failed to update role",
        text: err.response?.data?.message || "Something went wrong",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <label htmlFor={`role-${user.id}`}>{`Role for ${user.name}`}</label>
      <select
        id={`role-${user.id}`}
        aria-label={`Role for ${user.name}`}
        value={role}
        onChange={(e) => setRole(e.target.value)}
      >
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>

      {role === "warehouse_admin" && (
        <>
          <label
            htmlFor={`warehouse-${user.id}`}
          >{`Warehouse for ${user.name}`}</label>
          <select
            id={`warehouse-${user.id}`}
            aria-label={`Warehouse for ${user.name}`}
            value={warehouseId}
            onChange={(e) => setWarehouseId(e.target.value)}
            required
          >
            <option value="">Select warehouse…</option>
            {warehouses.map((wh) => (
              <option key={wh._id} value={wh._id}>
                {wh.name}
              </option>
            ))}
          </select>
        </>
      )}

      {role === "store_admin" && (
        <>
          <label htmlFor={`store-${user.id}`}>{`Store for ${user.name}`}</label>
          <select
            id={`store-${user.id}`}
            aria-label={`Store for ${user.name}`}
            value={storeId}
            onChange={(e) => setStoreId(e.target.value)}
            required
          >
            <option value="">Select store…</option>
            {stores.map((store) => (
              <option key={store._id} value={store._id}>
                {store.name}
              </option>
            ))}
          </select>
        </>
      )}

      <button onClick={handleSave} disabled={!dirty || scopeMissing || saving}>
        Save
      </button>
      {scopeMissing && (
        <p role="alert">
          Please select a {role === "warehouse_admin" ? "warehouse" : "store"}{" "}
          before saving.
        </p>
      )}
    </div>
  );
}

function InfoCell({ user }) {
  if (user.role === "driver") {
    return (
      <span>
        Driver: {user.name} —{" "}
        {user.driverQrToken ? "QR ready" : "QR not generated yet"}
      </span>
    );
  }
  if (user.role === "store_admin") {
    if (!user.store) return <span>Not linked to a store</span>;
    return (
      <span>
        {user.store.name}
        {user.store.address ? ` — ${user.store.address}` : ""}
      </span>
    );
  }
  if (user.role === "warehouse_admin") {
    if (!user.warehouse) return <span>Not linked to a warehouse</span>;
    return (
      <span>
        {user.warehouse.name}
        {user.warehouse.address ? ` — ${user.warehouse.address}` : ""}
      </span>
    );
  }
  return <span>—</span>;
}

export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [stores, setStores] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");

  const load = useCallback(async () => {
    const [usersRes, warehousesRes, storesRes] = await Promise.all([
      apiClient.get("/users", { params: { search, page, limit } }),
      apiClient.get("/warehouses"),
      apiClient.get("/stores"),
    ]);
    setUsers(usersRes.data.users);
    setTotal(usersRes.data.total);
    setWarehouses(warehousesRes.data.warehouses);
    setStores(storesRes.data.stores);
  }, [search, page, limit]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleRoleSave(userId, body) {
    await apiClient.patch(`/users/${userId}/role`, body);
    load();
  }

  async function handleDelete(user) {
    const result = await Swal.fire({
      title: `Delete ${user.name}?`,
      text: "This cannot be undone.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Delete",
    });
    if (result.isConfirmed) {
      await apiClient.delete(`/users/${user.id}`);
      load();
    }
  }

  function handleSearchSubmit(e) {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput);
  }

  const totalPages = Math.max(Math.ceil(total / limit), 1);

  return (
    <div>
      <h1>Users</h1>

      <form className="search-bar" onSubmit={handleSearchSubmit}>
        <div>
          <label htmlFor="user-search">Search</label>
          <input
            id="user-search"
            placeholder="Name or email..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>
        <button type="submit">Search</button>
      </form>

      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Role</th>
            <th>Info</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id}>
              <td className="font-bold">{user.name}</td>
              <td>{user.email}</td>
              <td>
                <RoleCell
                  user={user}
                  warehouses={warehouses}
                  stores={stores}
                  onSave={handleRoleSave}
                />
              </td>
              <td>
                <button
                  aria-label={`Delete ${user.name}`}
                  onClick={() => handleDelete(user)}
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="pagination">
        <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
          Prev
        </button>
        <span>
          Page {page} of {totalPages}
        </span>
        <button
          disabled={page >= totalPages}
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
}

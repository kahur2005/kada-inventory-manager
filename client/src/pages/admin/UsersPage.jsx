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
                <label
                  htmlFor={`role-${user.id}`}
                >{`Role for ${user.name}`}</label>
                <select
                  id={`role-${user.id}`}
                  aria-label={`Role for ${user.name}`}
                  value={user.role}
                  onChange={(e) => handleRoleChange(user.id, e.target.value)}
                >
                  {ROLES.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
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

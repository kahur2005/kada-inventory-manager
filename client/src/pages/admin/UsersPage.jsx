import { useState, useEffect, useCallback } from 'react';
import Swal from 'sweetalert2';
import apiClient from '../../api/client';

const ROLES = ['unassigned', 'superadmin', 'warehouse_admin', 'store_admin', 'driver'];

export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');

  const load = useCallback(async () => {
    const res = await apiClient.get('/users', { params: { search, page, limit } });
    setUsers(res.data.users);
    setTotal(res.data.total);
  }, [search, page, limit]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleRoleChange(userId, role) {
    await apiClient.patch(`/users/${userId}/role`, { role });
    load();
  }

  async function handleDelete(user) {
    const result = await Swal.fire({
      title: `Delete ${user.name}?`,
      text: 'This cannot be undone.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Delete',
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
      <form onSubmit={handleSearchSubmit}>
        <label htmlFor="user-search">Search</label>
        <input id="user-search" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
        <button type="submit">Search</button>
      </form>

      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Role</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id}>
              <td>{user.name}</td>
              <td>{user.email}</td>
              <td>
                <label htmlFor={`role-${user.id}`}>{`Role for ${user.name}`}</label>
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
                <button aria-label={`Delete ${user.name}`} onClick={() => handleDelete(user)}>
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div>
        <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
          Prev
        </button>
        <span>
          Page {page} of {totalPages}
        </span>
        <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
          Next
        </button>
      </div>
    </div>
  );
}

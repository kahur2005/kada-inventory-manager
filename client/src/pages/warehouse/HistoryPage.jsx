import { useState, useEffect, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import apiClient from '../../api/client';

export default function WarehouseHistoryPage() {
  const [logs, setLogs] = useState([]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [searchParams] = useSearchParams();
  const box = searchParams.get('box') || '';

  const loadLogs = useCallback(async () => {
    const res = await apiClient.get('/logs', {
      params: { page: 1, limit: 50, ...(box && { box }), ...(from && { from }), ...(to && { to }) },
    });
    setLogs(res.data.logs);
  }, [box, from, to]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  return (
    <div>
      <h1>Box History</h1>

      <div className="filter-bar">
        <div>
          <label htmlFor="history-from">From</label>
          <input id="history-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label htmlFor="history-to">To</label>
          <input id="history-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>

      {box && (
        <p className="mb-sm">
          Showing history for one box. <Link to="/warehouse/history">Show all</Link>
        </p>
      )}

      <table>
        <thead>
          <tr>
            <th>When</th>
            <th>Box</th>
            <th>Action</th>
            <th>By</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => (
            <tr key={log._id}>
              <td>{new Date(log.timestamp).toLocaleString()}</td>
              <td className="font-mono">{log.box?.code || '-'}</td>
              <td><span className="badge">{log.action}</span></td>
              <td>{log.actor?.name || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {logs.length === 0 && (
        <div className="empty">
          <p>No history in this range</p>
        </div>
      )}
    </div>
  );
}

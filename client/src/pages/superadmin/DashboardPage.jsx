import { useState, useEffect } from "react";
import apiClient from "../../api/client";
import DashboardMap from "../../components/DashboardMap";

const PERIODS = ["daily", "weekly", "monthly"];
const PERIOD_LABELS = {
  daily: "Harian",
  weekly: "Mingguan",
  monthly: "Bulanan",
};

export default function DashboardPage() {
  const [stats, setStats] = useState(null);
  const [period, setPeriod] = useState("daily");
  const [warehouses, setWarehouses] = useState([]);
  const [stores, setStores] = useState([]);
  const [driverLocations, setDriverLocations] = useState([]);
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    apiClient.get("/dashboard/stats").then((res) => setStats(res.data));
    apiClient
      .get("/warehouses")
      .then((res) => setWarehouses(res.data.warehouses));
    apiClient.get("/stores").then((res) => setStores(res.data.stores));
    apiClient
      .get("/driver-locations")
      .then((res) => setDriverLocations(res.data.driverLocations));
    apiClient
      .get("/logs", { params: { page: 1, limit: 10 } })
      .then((res) => setLogs(res.data.logs));
  }, []);

  const itemsFlow = stats?.warehouseFlow?.[period] || [];
  const maxFlow = Math.max(...itemsFlow.map((r) => r.inbound + r.outbound), 1);
  const slowMovingItems = stats?.slowMovingItems || [];

  const grouped = itemsFlow.reduce((acc, it) => {
    const label = it.item?.name || it.item?.sku || "Unknown";
    const cat = it.item?.category || "Other";
    const entry = { ...it, label, category: cat };
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(entry);
    return acc;
  }, {});

  const categoryTotals = Object.entries(grouped).map(([category, items]) => {
    const inboundTotal = items.reduce((s, x) => s + (x.inbound || 0), 0);
    const outboundTotal = items.reduce((s, x) => s + (x.outbound || 0), 0);
    return { category, inboundTotal, outboundTotal, items };
  });

  const maxCategoryValue = Math.max(
    ...categoryTotals.map((c) => Math.max(c.inboundTotal, c.outboundTotal)),
    1,
  );
  const [selectedCategory, setSelectedCategory] = useState(null);

  return (
    <div>
      <h1>Dashboard</h1>

      {stats && (
        <div className="stat-grid">
          <div className="stat-card">
            <div className="stat-icon icon-primary">&#128230;</div>
            <div className="stat-label">Packed</div>
            <div className="stat-value">
              {stats?.boxesByStatus?.PACKED ?? 0}
            </div>
            <div className="stat-sub">Boxes ready</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon icon-warning">&#128205;</div>
            <div className="stat-label">Assigned</div>
            <div className="stat-value">
              {stats?.boxesByStatus?.ASSIGNED ?? 0}
            </div>
            <div className="stat-sub">Awaiting pickup</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon icon-info">&#128666;</div>
            <div className="stat-label">In Transit</div>
            <div className="stat-value">
              {stats?.boxesByStatus?.IN_TRANSIT ?? 0}
            </div>
            <div className="stat-sub">On the way</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon icon-success">&#9989;</div>
            <div className="stat-label">Delivered</div>
            <div className="stat-value">
              {stats?.boxesByStatus?.DELIVERED ?? 0}
            </div>
            <div className="stat-sub">Completed</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon icon-primary">&#128101;</div>
            <div className="stat-label">Total Users</div>
            <div className="stat-value">{stats?.totalUsers ?? 0}</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon icon-danger">&#9888;&#65039;</div>
            <div className="stat-label">Low Stock Alerts</div>
            <div className="stat-value">{stats?.lowStockAlerts ?? 0}</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon icon-success">&#128200;</div>
            <div className="stat-label">Warehouse Utilization</div>
            <div className="stat-value">
              {stats?.warehouseUtilizationPct ?? 0}%
            </div>
          </div>
        </div>
      )}

      <div className="card mb-lg">
        <div className="card-header">
          <h3>Stock Turnover</h3>
          <p className="text-muted">
            Perputaran stok toko berdasarkan pengiriman delivered
          </p>
        </div>
        <div className="turnover-grid">
          <div className="turnover-card">
            <div className="label">Delivered Qty</div>
            <div className="value">
              {stats?.stockTurnover?.[period]?.deliveredQty ?? 0}
            </div>
          </div>
          <div className="turnover-card">
            <div className="label">Total Stock</div>
            <div className="value">
              {stats?.stockTurnover?.[period]?.totalQty ?? 0}
            </div>
          </div>
          <div className="turnover-card">
            <div className="label">Turnover Ratio</div>
            <div className="value">
              {stats?.stockTurnover?.[period]?.ratioPct ?? 0}%
            </div>
          </div>
        </div>
      </div>

      <div className="card mb-lg">
        <div className="card-header">
          <h3>Slow Moving / Dead Stock</h3>
        </div>
        <ul className="slow-moving-list">
          {slowMovingItems.length === 0 ? (
            <li className="slow-moving-item">
              Tidak ada item yang bergerak lambat saat ini.
            </li>
          ) : (
            slowMovingItems.map((row) => (
              <li
                key={`${row.store?.name}-${row.item?.name}-${row.qty}`}
                className="slow-moving-item"
              >
                <div className="slow-moving-summary">
                  <div className="slow-moving-status">{row.status}</div>
                  <div>
                    <strong>
                      {row.item?.name || row.item?.sku || "Unknown item"}
                    </strong>
                  </div>
                  <div>{row.store?.name || "Unknown store"}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div>{row.qty} stok</div>
                  <div>{row.deliveredQty30d} delivered</div>
                </div>
              </li>
            ))
          )}
        </ul>
      </div>

      <div className="card mb-lg">
        <div className="card-header">
          <h3>Live Map</h3>
        </div>
        <DashboardMap
          warehouses={warehouses}
          stores={stores}
          driverLocations={driverLocations}
        />
      </div>

      <div className="card">
        <div className="card-header">
          <h3>Recent Activity</h3>
        </div>
        <ul>
          {logs.map((log) => (
            <li
              key={log._id}
              style={{
                padding: "10px 0",
                borderBottom: "1px solid var(--border-light)",
                fontSize: "0.9375rem",
              }}
            >
              {log.action} by <strong>{log.actor?.name}</strong>{" "}
              {log.box && (
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "0.875rem",
                    color: "var(--text-muted)",
                  }}
                >
                  (box {log.box.code})
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

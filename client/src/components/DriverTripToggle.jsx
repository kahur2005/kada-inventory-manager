import { useState } from "react";

const STATUSES = [
  { value: "idle", label: "Idle", color: "#6b7280" },
  { value: "on-route", label: "Dalam Perjalanan", color: "#2563eb" },
  { value: "delivering", label: "Mengantar", color: "#f59e0b" },
  { value: "offline", label: "Offline", color: "#dc2626" },
];

export default function DriverTripToggle({ currentStatus, onStatusChange }) {
  const [loading, setLoading] = useState(false);

  const handleToggle = async (status) => {
    if (status === currentStatus || loading) return;
    setLoading(true);
    try {
      await onStatusChange(status);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <h3 style={styles.title}>Status Driver</h3>
      <div style={styles.buttons}>
        {STATUSES.map((s) => (
          <button
            key={s.value}
            onClick={() => handleToggle(s.value)}
            disabled={loading}
            style={{
              ...styles.button,
              background: currentStatus === s.value ? s.color : "transparent",
              color: currentStatus === s.value ? "#fff" : s.color,
              borderColor: s.color,
              opacity: loading ? 0.6 : 1,
            }}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}

const styles = {
  container: {
    padding: "20px",
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "var(--r-lg)",
  },
  title: {
    margin: "0 0 14px",
    fontSize: "0.9375rem",
    fontWeight: 600,
    color: "var(--text-heading)",
  },
  buttons: {
    display: "flex",
    gap: "8px",
    flexWrap: "wrap",
  },
  button: {
    padding: "9px 18px",
    border: "2px solid",
    borderRadius: "var(--r)",
    cursor: "pointer",
    fontSize: "0.875rem",
    fontWeight: 600,
    transition: "all 0.15s",
  },
};

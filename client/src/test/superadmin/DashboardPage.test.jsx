import { describe, test, expect, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import DashboardPage from "../../pages/superadmin/DashboardPage";
import apiClient from "../../api/client";

vi.mock("../../api/client");
vi.mock("../../components/DashboardMap", () => ({
  default: () => <div data-testid="map" />,
}));

describe("DashboardPage", () => {
  test("renders stat cards and the recent activity feed", async () => {
    apiClient.get = vi.fn((url) => {
      if (url === "/dashboard/stats") {
        return Promise.resolve({
          data: {
            boxesByStatus: {
              PACKED: 2,
              ASSIGNED: 1,
              IN_TRANSIT: 0,
              DELIVERED: 5,
            },
            totalUsers: 4,
            lowStockAlerts: 3,
            warehouseUtilizationPct: 42,
            warehouseFlow: {
              daily: [
                { item: { name: "A", sku: "A1" }, inbound: 10, outbound: 5 },
              ],
            },
            stockTurnover: {
              daily: { deliveredQty: 5, totalQty: 100, ratioPct: 5 },
            },
            slowMovingItems: [],
          },
        });
      }
      if (url === "/warehouses")
        return Promise.resolve({ data: { warehouses: [] } });
      if (url === "/stores") return Promise.resolve({ data: { stores: [] } });
      if (url === "/driver-locations")
        return Promise.resolve({ data: { driverLocations: [] } });
      if (url === "/logs")
        return Promise.resolve({
          data: {
            logs: [
              {
                _id: "l1",
                action: "BOX_PACKED",
                actor: { name: "WA" },
                box: { code: "BX-0001" },
              },
            ],
            total: 1,
            page: 1,
            limit: 10,
          },
        });
      return Promise.reject(new Error(`unexpected ${url}`));
    });

    render(<DashboardPage />);

    await waitFor(() => expect(screen.getByText(/42%/)).toBeInTheDocument());
    const deliveredCard = screen.getByText("Delivered").closest(".stat-card");
    expect(within(deliveredCard).getByText("5")).toBeInTheDocument();
    const lowStockCard = screen
      .getByText("Low Stock Alerts")
      .closest(".stat-card");
    expect(within(lowStockCard).getByText("3")).toBeInTheDocument();
    expect(screen.getByText(/BOX_PACKED/)).toBeInTheDocument();
  });
});

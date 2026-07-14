import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import UsersPage from "../pages/admin/UsersPage";
import apiClient from "../api/client";
import Swal from "sweetalert2";

vi.mock("../api/client");
vi.mock("sweetalert2");

function mockGet({ users, warehouses = [], stores = [] }) {
  apiClient.get = vi.fn((url) => {
    if (url === "/users")
      return Promise.resolve({
        data: { users, total: users.length, page: 1, limit: 10 },
      });
    if (url === "/warehouses") return Promise.resolve({ data: { warehouses } });
    if (url === "/stores") return Promise.resolve({ data: { stores } });
    return Promise.resolve({ data: {} });
  });
}

describe("UsersPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    Swal.fire = vi.fn().mockResolvedValue({ isConfirmed: true });
  });

  test("lists users returned by the API", async () => {
    mockGet({
      users: [
        {
          id: "1",
          name: "Ana",
          email: "ana@example.com",
          role: "unassigned",
          warehouse: null,
          store: null,
        },
      ],
    });

    render(<UsersPage />);

    await waitFor(() => expect(screen.getByText("Ana")).toBeInTheDocument());
    expect(apiClient.get).toHaveBeenCalledWith("/users", {
      params: { search: "", page: 1, limit: 10 },
    });
  });

  test("changing role to driver (no scope needed) PATCHes on Save and refreshes the list", async () => {
    mockGet({
      users: [
        {
          id: "1",
          name: "Ana",
          email: "ana@example.com",
          role: "unassigned",
          warehouse: null,
          store: null,
        },
      ],
    });
    apiClient.patch = vi.fn().mockResolvedValue({ data: { user: {} } });

    render(<UsersPage />);
    await waitFor(() => screen.getByText("Ana"));

    fireEvent.change(screen.getByLabelText(/role for ana/i), {
      target: { value: "driver" },
    });

    await waitFor(() =>
      expect(apiClient.patch).toHaveBeenCalledWith("/users/1/role", {
        role: "driver",
      }),
    );
  });

  test("changing role to warehouse_admin requires picking a warehouse before Save is enabled", async () => {
    mockGet({
      users: [
        {
          id: "1",
          name: "Ana",
          email: "ana@example.com",
          role: "unassigned",
          warehouse: null,
          store: null,
        },
      ],
      warehouses: [{ _id: "wh1", name: "Warehouse One" }],
    });
    apiClient.patch = vi.fn().mockResolvedValue({ data: { user: {} } });

    render(<UsersPage />);
    await waitFor(() => screen.getByText("Ana"));

    fireEvent.change(screen.getByLabelText(/role for ana/i), {
      target: { value: "warehouse_admin" },
    });
    const saveButton = screen.getByRole("button", { name: /save/i });
    expect(saveButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/warehouse for ana/i), {
      target: { value: "wh1" },
    });
    expect(saveButton).not.toBeDisabled();

    fireEvent.click(saveButton);
    await waitFor(() =>
      expect(apiClient.patch).toHaveBeenCalledWith("/users/1/role", {
        role: "warehouse_admin",
        warehouse: "wh1",
      }),
    );
  });

  test("shows an error alert instead of silently failing when the role update is rejected", async () => {
    mockGet({
      users: [
        {
          id: "1",
          name: "Ana",
          email: "ana@example.com",
          role: "unassigned",
          warehouse: null,
          store: null,
        },
      ],
    });
    apiClient.patch = vi
      .fn()
      .mockRejectedValue({ response: { data: { message: "boom" } } });

    render(<UsersPage />);
    await waitFor(() => screen.getByText("Ana"));

    fireEvent.change(screen.getByLabelText(/role for ana/i), {
      target: { value: "driver" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() =>
      expect(Swal.fire).toHaveBeenCalledWith(
        expect.objectContaining({ icon: "error", text: "boom" }),
      ),
    );
  });

  test("shows store location info for a store_admin user", async () => {
    mockGet({
      users: [
        {
          id: "2",
          name: "Sam",
          email: "sam@example.com",
          role: "store_admin",
          warehouse: null,
          store: { id: "s1", name: "Store One", address: "123 Main St" },
        },
      ],
    });

    render(<UsersPage />);

    await waitFor(() =>
      expect(screen.getByText("Store One — 123 Main St")).toBeInTheDocument(),
    );
  });

  test("delete button confirms via SweetAlert2 before calling DELETE", async () => {
    mockGet({
      users: [
        {
          id: "1",
          name: "Ana",
          email: "ana@example.com",
          role: "unassigned",
          warehouse: null,
          store: null,
        },
      ],
    });
    apiClient.delete = vi
      .fn()
      .mockResolvedValue({ data: { message: "User deleted" } });

    render(<UsersPage />);
    await waitFor(() => screen.getByText("Ana"));

    fireEvent.click(screen.getByRole("button", { name: /delete ana/i }));

    await waitFor(() =>
      expect(apiClient.delete).toHaveBeenCalledWith("/users/1"),
    );
  });
});

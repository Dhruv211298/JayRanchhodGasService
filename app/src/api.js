const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001/api";

/* ─── Token helpers ─────────────────────────────────────────────
   getToken()      — reads the JWT from localStorage
   authHeaders()   — returns headers object with Bearer token + JSON type
   clearSession()  — removes token; triggers page reload → login screen
──────────────────────────────────────────────────────────────── */
const getToken = () => localStorage.getItem("authToken");

const authHeaders = () => ({
  "Content-Type": "application/json",
  ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
});

// Called automatically when any API call returns 401 (token expired / invalid)
const handleUnauthorized = () => {
  localStorage.removeItem("authToken");
  // Dispatch a custom event so App.jsx can react without a full page reload
  window.dispatchEvent(new CustomEvent("session:expired"));
};

/* ─── Fetch wrapper — automatically handles 401 ──────────────── */
const authFetch = async (url, options = {}) => {
  const res = await fetch(url, {
    ...options,
    headers: { ...authHeaders(), ...(options.headers || {}) },
  });
  if (res.status === 401) {
    handleUnauthorized();
    throw new Error("session_expired");
  }
  return res;
};

export const api = {
  /* ── Auth ── */
  login: async (username, password) => {
    const r = await fetch(`${API_URL}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    return await r.json();
  },

  // Verify that the stored JWT is still valid on the server (used on app startup)
  verifySession: async () => {
    const token = getToken();
    if (!token) return { valid: false };
    try {
      const r = await fetch(`${API_URL}/verify-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      });
      return await r.json();
    } catch {
      return { valid: false };
    }
  },

  /* ── User management ── */
  getUsers: async () => {
    const r = await authFetch(`${API_URL}/users?t=${Date.now()}`);
    return await r.json();
  },
  addUser: async (username, password, role) =>
    authFetch(`${API_URL}/users`, {
      method: "POST",
      body: JSON.stringify({ username, password, role }),
    }),
  deleteUser: async (id) => authFetch(`${API_URL}/users/${id}`, { method: "DELETE" }),

  /* ── Core data ── */
  load: async () => {
    try {
      const r = await authFetch(`${API_URL}/load?t=${Date.now()}`);
      return await r.json();
    } catch (e) {
      if (e.message === "session_expired") throw e;
      return { prices: [], commissions: [], boys: [], vehicles: [], employees: [], pending: [], entries: [] };
    }
  },
  saveEntry: async (entry) =>
    authFetch(`${API_URL}/entries`, {
      method: "POST",
      body: JSON.stringify(entry),
    }),
  savePayment: async (ledgerId, amt, date, note, emptyReturned) =>
    authFetch(`${API_URL}/payments`, {
      method: "POST",
      body: JSON.stringify({ ledgerId, amt, date, note, emptyReturned }),
    }),

  /* ── Admin configs ── */
  syncPrices: async (prices) =>
    authFetch(`${API_URL}/prices/sync`, { method: "POST", body: JSON.stringify(prices) }),
  syncCommissions: async (comms) =>
    authFetch(`${API_URL}/commissions/sync`, { method: "POST", body: JSON.stringify(comms) }),

  /* ── Vehicles ── */
  getVehicles: async () => {
    const r = await authFetch(`${API_URL}/vehicles?t=${Date.now()}`);
    return await r.json();
  },
  addVehicle: async (data) =>
    authFetch(`${API_URL}/vehicles`, { method: "POST", body: JSON.stringify(data) }),
  updateVehicle: async (id, data) =>
    authFetch(`${API_URL}/vehicles/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  toggleVehicle: async (id) =>
    authFetch(`${API_URL}/vehicles/${id}/toggle`, { method: "PATCH" }),
  deleteVehicle: async (id) =>
    authFetch(`${API_URL}/vehicles/${id}`, { method: "DELETE" }),

  /* ── Employees ── */
  getEmployees: async () => {
    const r = await authFetch(`${API_URL}/employees?t=${Date.now()}`);
    return await r.json();
  },
  addEmployee: async (data) =>
    authFetch(`${API_URL}/employees`, { method: "POST", body: JSON.stringify(data) }),
  updateEmployee: async (id, data) =>
    authFetch(`${API_URL}/employees/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  toggleEmployee: async (id) =>
    authFetch(`${API_URL}/employees/${id}/toggle`, { method: "PATCH" }),
  deleteEmployee: async (id) =>
    authFetch(`${API_URL}/employees/${id}`, { method: "DELETE" }),

  /* ── Godown stock ── */
  getGodownStock: async (date) => {
    const r = await authFetch(`${API_URL}/godown-stock/${date}?t=${Date.now()}`);
    return await r.json();
  },
  saveGodownStock: async (date, items) =>
    authFetch(`${API_URL}/godown-stock`, {
      method: "POST",
      body: JSON.stringify({ date, items }),
    }),

  /* ── Entries ── */
  deleteEntry: async (date) => authFetch(`${API_URL}/entries/${date}`, { method: "DELETE" }),
};

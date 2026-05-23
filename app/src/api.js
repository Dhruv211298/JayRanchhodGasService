const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001/api";

export const api = {
  login: async (username, password) => {
    const r = await fetch(`${API_URL}/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }) });
    return await r.json();
  },
  getUsers: async () => {
    const r = await fetch(`${API_URL}/users?t=${Date.now()}`);
    return await r.json();
  },
  addUser: async (username, password, role) => fetch(`${API_URL}/users`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password, role }) }),
  deleteUser: async (id) => fetch(`${API_URL}/users/${id}`, { method: "DELETE" }),
  load: async () => {
    try { const r = await fetch(`${API_URL}/load?t=${Date.now()}`); return await r.json(); }
    catch { return { prices: [], commissions: [], boys: [], vehicles: [], employees: [], pending: [], entries: [] }; }
  },
  saveEntry: async (entry) => fetch(`${API_URL}/entries`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(entry) }),
  savePayment: async (ledgerId, amt, date, note) => fetch(`${API_URL}/payments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ledgerId, amt, date, note }) }),

  syncPrices: async (prices) => fetch(`${API_URL}/prices/sync`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(prices) }),
  syncCommissions: async (comms) => fetch(`${API_URL}/commissions/sync`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(comms) }),
  getVehicles: async () => { const r = await fetch(`${API_URL}/vehicles?t=${Date.now()}`); return await r.json(); },
  addVehicle: async (data) => fetch(`${API_URL}/vehicles`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }),
  updateVehicle: async (id, data) => fetch(`${API_URL}/vehicles/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }),
  toggleVehicle: async (id) => fetch(`${API_URL}/vehicles/${id}/toggle`, { method: "PATCH" }),
  deleteVehicle: async (id) => fetch(`${API_URL}/vehicles/${id}`, { method: "DELETE" }),
  getEmployees: async () => { const r = await fetch(`${API_URL}/employees?t=${Date.now()}`); return await r.json(); },
  addEmployee: async (data) => fetch(`${API_URL}/employees`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }),
  updateEmployee: async (id, data) => fetch(`${API_URL}/employees/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }),
  toggleEmployee: async (id) => fetch(`${API_URL}/employees/${id}/toggle`, { method: "PATCH" }),
  deleteEmployee: async (id) => fetch(`${API_URL}/employees/${id}`, { method: "DELETE" }),
  
  // Godown Stock
  getGodownStock: async (date) => {
    const r = await fetch(`${API_URL}/godown-stock/${date}?t=${Date.now()}`);
    return await r.json();
  },
  saveGodownStock: async (date, items) => fetch(`${API_URL}/godown-stock`, { 
    method: "POST", 
    headers: { "Content-Type": "application/json" }, 
    body: JSON.stringify({ date, items }) 
  }),
};

import { useState, useEffect } from "react";
import Swal from "sweetalert2";
import { api } from "./api";
import { T, injectCSS } from "./styles";
import { 
  PRODUCTS, DEFAULT_BOYS, todayStr, fmtDate, blankEntry, calcEntry, blankGodownStock, num 
} from "./constants";

// Separate Components
import LoginScreen from "./components/LoginScreen";
import { DailyEntry, History, PendingCredits, Summary, SalaryReport, GodownStock } from "./components/UserSide";
import { 
  AdminDashboard, AdminPriceHistory, AdminCommission, 
  AdminDayReports, AdminCreditOverview, AdminUsers, 
  AdminVehicleMaster, AdminEmployeeMaster, AdminSalaryReport
} from "./components/AdminSide";

export default function App() {
  injectCSS();

  const [authedRole, setAuthedRole] = useState(null); // null | "user" | "admin"
  const [tab, setTab] = useState("entry");
  
  const [entries, setEntries] = useState([]);
  const [pending, setPending] = useState([]); 
  const [prices, setPrices] = useState([]);
  const [commissions, setCommissions] = useState([]);
  const [deliveryBoys, setDeliveryBoys] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  
  const [entry, setEntry] = useState(blankEntry([], []));
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  const getRecoveriesForDate = (date, pendingList) => {
    const recoveries = [];
    (pendingList || []).forEach(p => {
      (p.payments || []).forEach(pay => {
        if (pay.date === date) {
          recoveries.push({
            ledgerId: p.id,
            customerName: p.customerName,
            amt: pay.amt,
            note: pay.note
          });
        }
      });
    });
    return recoveries;
  };

  const loadData = async (restoreDate = null) => {
    const data = await api.load();
    const pendingList = data.pending || [];
    
    // Map entries to dynamically calculate and attach creditRecoveries from pending payments
    const entriesList = (data.entries || []).map(e => ({
      ...e,
      creditRecoveries: getRecoveriesForDate(e.date, pendingList)
    }));

    setEntries(entriesList);
    setPending(pendingList);
    setPrices(data.prices || []);
    setCommissions(data.commissions || []);
    setVehicles(data.vehicles || []);
    setEmployees(data.employees || []);
    const loadedBoys = data.boys && data.boys.length > 0 ? data.boys : DEFAULT_BOYS;
    setDeliveryBoys(loadedBoys);
    
    // If a specific date was requested (e.g. after saving a backdated entry), restore that date
    const targetDate = restoreDate || todayStr();
    const targetEntry = entriesList.find((x) => x.date === targetDate);
    if (targetEntry) setEntry(targetEntry);
    else {
      const sortedEntries = [...entriesList].sort((a,b) => b.date.localeCompare(a.date));
      const lastEntry = sortedEntries.length > 0 ? sortedEntries[0] : null;
      const blank = blankEntry(data.prices || [], loadedBoys, lastEntry);
      blank.date = targetDate;
      blank.creditRecoveries = getRecoveriesForDate(targetDate, pendingList);
      setEntry(blank);
    }
    setLoading(false);
  };

  useEffect(() => {
    const savedRole = localStorage.getItem("authedRole");
    if (savedRole) {
      setAuthedRole(savedRole);
      setTab(savedRole === "admin" ? "admin-entry" : "entry");
    }
    loadData();
  }, []);

  /* ── save daily entry ── */
  const handleSave = async () => {
    try {
      const savedDate = entry.date; // Remember the date being saved
      const finalEntry = { ...entry };
      finalEntry.products = finalEntry.products.map(p => {
        const g = (finalEntry.godownStock || []).find(x => x.productId === p.id) || {};
        const a = (finalEntry.arrivals || []).find(x => x.productId === p.id) || {};
        const autoOpening = num(g.filled) + (finalEntry.hasArrival ? num(a.filledReceived) : 0);
        return {
          ...p,
          openingStock: autoOpening,
          closingStock: autoOpening - num(p.sell) - num(p.online) - num(p.sbc) - num(p.dbc)
        };
      });
      
      const response = await api.saveEntry(finalEntry);
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP error ${response.status}`);
      }
      
      // Reload data and restore the entry for the date that was just saved
      // (without this, loadData defaults to today — wrong for admin backdated entries)
      await loadData(savedDate);

      setSaved(true);
      setTimeout(() => setSaved(false), 2500);

      Swal.fire({
        title: "Saved Successfully!",
        text: "The daily entry has been recorded in the database.",
        icon: "success",
        confirmButtonColor: "#0077ff",
        timer: 2500,
        timerProgressBar: true
      });
    } catch (error) {
      console.error("Save Entry Error:", error);
      Swal.fire({
        title: "Save Failed!",
        text: error.message || "An error occurred while saving the entry.",
        icon: "error",
        confirmButtonColor: "#ef4444"
      });
    }
  };

  /* ── record a recovery payment against a pending credit ── */
  const recordPayment = async (pendingId, payAmt, payDate, note) => {
    await api.savePayment(pendingId, payAmt, payDate, note);
    await loadData();
  };

  const handleLogout = () => {
    localStorage.removeItem("authedRole");
    setAuthedRole(null);
  };

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: T.bg, fontFamily: "'DM Sans',sans-serif", color: T.inkLight, letterSpacing: 2, fontSize: 13 }}>
      Loading…
    </div>
  );

  if (!authedRole) return <LoginScreen onAuth={(r) => {
    localStorage.setItem("authedRole", r);
    setAuthedRole(r);
    setTab(r === "admin" ? "admin-entry" : "entry");
    loadData(); // Fresh load on login
  }} />;

  const TABS_USER = [
    { id: "entry", label: "📋 Daily Entry" },
    { id: "history", label: "📅 History" },
    { id: "credits", label: "💳 Pending Credits" },
    { id: "summary", label: "📊 Summary" },
    { id: "salary", label: "👤 Salary Report" },
  ];
  
  const TABS_ADMIN = [
    { id: "admin-entry", label: "📋 Daily Entry" },
    { id: "admin-history", label: "📅 History" },
    { id: "admin-dashboard", label: "⬛ Dashboard" },
    { id: "admin-prices", label: "📈 Prices" },
    { id: "admin-comm", label: "💰 Commission" },
    { id: "admin-vehicles", label: "🚛 Vehicle Master" },
    { id: "admin-employees", label: "👤 Employee Master" },
    { id: "admin-reports", label: "📊 Day Reports" },
    { id: "admin-salary", label: "👤 Salary Report" },
    { id: "admin-credits", label: "💳 Ledger" },
    { id: "admin-users", label: "👥 Users" },
  ];

  const TABS = authedRole === "admin" ? TABS_ADMIN : TABS_USER;
  const calcs = calcEntry(entry);

  return (
    <div className="app-shell">
      {/* Header */}
      <header className="hdr">
        <div className="hdr-brand">
          <div style={{
            height: 44,
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center"
          }}>
            <img
              src="/bpcl_logo.png"
              alt="Bharat Gas"
              style={{ height: "100%", width: "auto", objectFit: "contain" }}
            />
          </div>
          <div>
            <div className="hdr-title">JAY RANCHHOD GAS SERVICE</div>
            <div className="hdr-sub">Bharat LPG · {authedRole === "admin" ? "Admin Portal" : "Daily Management"}</div>
          </div>
        </div>
        <div style={{display:"flex", alignItems:"center", gap: 16}}>
          <div className="hdr-date">{fmtDate(todayStr())}</div>
          <button className="btn-ghost" style={{borderColor: "#444", color: "#ccc", padding: "4px 10px", fontSize: 10}} onClick={handleLogout}>LOGOUT</button>
        </div>
      </header>

      {/* Nav */}
      <nav className="nav">
        {TABS.map((t) => (
          <button key={t.id} className={`nav-btn${tab === t.id ? " active" : ""}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>

      <main className="main">
        {/* User Tabs */}
        {tab === "entry" && <DailyEntry entry={entry} setEntry={setEntry} calcs={calcs} onSave={handleSave} saved={saved} entries={entries} prices={prices} deliveryBoys={deliveryBoys} vehicles={vehicles} employees={employees} pending={pending} />}
        {tab === "history" && <History entries={entries} onEdit={(e) => { setEntry(e); setTab("entry"); }} />}
        {tab === "credits" && <PendingCredits pending={pending} onRecord={recordPayment} />}
        {tab === "summary" && <Summary entries={entries} pending={pending} />}
        {tab === "salary" && <SalaryReport entries={entries} employees={employees} />}

        {/* Admin Tabs */}
        {tab === "admin-entry" && <DailyEntry entry={entry} setEntry={setEntry} calcs={calcs} onSave={handleSave} saved={saved} entries={entries} prices={prices} deliveryBoys={deliveryBoys} vehicles={vehicles} employees={employees} pending={pending} isAdmin={true} />}
        {tab === "admin-history" && <History entries={entries} onEdit={(e) => { setEntry(e); setTab("admin-entry"); }} isAdmin={true} />}
        {tab === "admin-dashboard" && <AdminDashboard entries={entries} pending={pending} prices={prices} commissions={commissions} />}
        {tab === "admin-prices" && <AdminPriceHistory prices={prices} setPrices={setPrices} />}
        {tab === "admin-comm" && <AdminCommission commissions={commissions} setCommissions={setCommissions} />}
        {tab === "admin-reports" && <AdminDayReports entries={entries} commissions={commissions} />}
        {tab === "admin-salary" && <AdminSalaryReport entries={entries} employees={employees} />}
        {tab === "admin-credits" && <AdminCreditOverview pending={pending} />}
        {tab === "admin-users" && <AdminUsers />}
        {tab === "admin-vehicles" && <AdminVehicleMaster />}
        {tab === "admin-employees" && <AdminEmployeeMaster />}
      </main>
    </div>
  );
}
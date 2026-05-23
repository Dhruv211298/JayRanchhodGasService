import { useState, useEffect, useCallback } from "react";

/* ════════════════════════════════════════════════════════════════
   CONSTANTS & HELPERS
════════════════════════════════════════════════════════════════ */
const PRODUCTS = [
  { id: "p14", label: "14 KG  (5350–5370)", short: "14 KG", sku: "5350–5370", fallbackRate: 906.5 },
  { id: "p19", label: "19 KG  (5400)", short: "19 KG", sku: "5400", fallbackRate: 1950 },
  { id: "p5", label: "FLT 5 KG", short: "5 KG", sku: "FLT", fallbackRate: 564.5 },
];
const DEFAULT_BOYS = ["OFFICE", "CHIRAG / JAYESH", "ARPIT / MAYUR", "CHOTUKAKA / BHAGO"];
const ADMIN_PW = "admin123";

const todayStr = () => new Date().toISOString().slice(0, 10);
const fmtDate = (d) => new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
const fmtMonth = (d) => new Date(d + "T00:00:00").toLocaleDateString("en-IN", { month: "long", year: "numeric" });
const num = (v) => parseFloat(v) || 0;
const inr = (v) => "₹" + num(v).toLocaleString("en-IN", { minimumFractionDigits: 0 });
const uid = () => Math.random().toString(36).slice(2, 9);

const getCurrentRate = (pid, pricesArr) => {
  const hist = (pricesArr || []).filter(x => x.productId === pid).sort((a,b) => b.date.localeCompare(a.date));
  return hist.length > 0 ? num(hist[0].rate) : PRODUCTS.find(p=>p.id===pid).fallbackRate;
};

const getCommRate = (pid, commArr, upToDate = "9999-99-99") => {
  const hist = (commArr || []).filter(x => x.productId === pid && x.date <= upToDate).sort((a,b) => b.date.localeCompare(a.date));
  return hist[0] ? num(hist[0].perCyl) : 0;
};

/* ── blank templates ── */
const blankProduct = (pricesArr) => PRODUCTS.map((p) => ({ 
  id: p.id, 
  openingStock: "", 
  rate: getCurrentRate(p.id, pricesArr), 
  sell: "", 
  sbc: "", 
  dbc: "", 
  closingStock: "" 
}));
const blankDelivery = (boysArr) => Object.fromEntries((boysArr || DEFAULT_BOYS).map((b) => [b, ""]));
const blankExpense = () => ({ id: uid(), desc: "", amt: "" });
const blankCheque = () => ({ id: uid(), desc: "", amt: "" });
const blankCredit = () => ({ id: uid(), customerName: "", amt: "" });

const blankEntry = (pricesArr = [], boysArr = []) => ({
  date: todayStr(),
  openingCash: "",
  bob: "",
  products: blankProduct(pricesArr),
  delivery: blankDelivery(boysArr),
  expenses: [blankExpense()],
  chequeOnline: [blankCheque()],
  creditSales: [blankCredit()],
});

/* ── calculations ── */
const calcEntry = (e) => {
  const totalSales = (e.products||[]).reduce((s, p) => s + num(p.sell) * num(p.rate), 0);
  const totalDelivery = Object.values(e.delivery||{}).reduce((s, val) => s + num(val), 0);
  const totalExpenses = (e.expenses||[]).reduce((s, x) => s + num(x.amt), 0);
  const totalCheque = (e.chequeOnline||[]).reduce((s, x) => s + num(x.amt), 0);
  const totalCredit = (e.creditSales||[]).reduce((s, x) => s + num(x.amt), 0);
  const cashOnHand = num(e.openingCash) + totalSales - totalExpenses - totalCheque - totalCredit;
  return { totalSales, totalDelivery, totalExpenses, totalCheque, totalCredit, cashOnHand };
};

/* ════════════════════════════════════════════════════════════════
   STORAGE
════════════════════════════════════════════════════════════════ */
const API_URL = "http://localhost:3001/api";
const api = {
  login: async (username, password) => {
    const r = await fetch(`${API_URL}/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }) });
    return await r.json();
  },
  getUsers: async () => {
    const r = await fetch(`${API_URL}/users`);
    return await r.json();
  },
  addUser: async (username, password, role) => fetch(`${API_URL}/users`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password, role }) }),
  deleteUser: async (id) => fetch(`${API_URL}/users/${id}`, { method: "DELETE" }),
  load: async () => {
    try { const r = await fetch(`${API_URL}/load`); return await r.json(); }
    catch { return { prices: [], commissions: [], boys: [], pending: [], entries: [] }; }
  },
  saveEntry: async (entry) => fetch(`${API_URL}/entries`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(entry) }),
  savePayment: async (ledgerId, amt, date, note) => fetch(`${API_URL}/payments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ledgerId, amt, date, note }) }),
  syncBoys: async (boys) => fetch(`${API_URL}/boys/sync`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(boys) }),
  syncPrices: async (prices) => fetch(`${API_URL}/prices/sync`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(prices) }),
  syncCommissions: async (comms) => fetch(`${API_URL}/commissions/sync`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(comms) }),
};

/* ════════════════════════════════════════════════════════════════
   DESIGN TOKENS
════════════════════════════════════════════════════════════════ */
const T = {
  bg: "#f5f3ee",
  card: "#ffffff",
  cardAlt: "#faf9f6",
  border: "#e2ddd6",
  borderDk: "#c9c2b8",
  ink: "#1c1917",
  inkMid: "#57534e",
  inkLight: "#a8a29e",
  accent: "#c2410c",   // burnt orange
  accentBg: "#fff7ed",
  accentLt: "#fdba74",
  success: "#15803d",
  successBg: "#f0fdf4",
  danger: "#b91c1c",
  dangerBg: "#fef2f2",
  warn: "#92400e",
  warnBg: "#fffbeb",
  blue: "#1d4ed8",
  blueBg: "#eff6ff",
  shadow: "0 1px 3px rgba(0,0,0,.08), 0 1px 2px rgba(0,0,0,.04)",
  shadowMd: "0 4px 12px rgba(0,0,0,.10)",
};

/* ════════════════════════════════════════════════════════════════
   CSS INJECTION
════════════════════════════════════════════════════════════════ */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,400;0,600;0,700;1,400&family=DM+Sans:wght@400;500;600&display=swap');

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

body { background: ${T.bg}; font-family: 'DM Sans', sans-serif; color: ${T.ink}; }

.app-shell { min-height: 100vh; }

/* ── Header ── */
.hdr { background: ${T.ink}; padding: 0 20px; display: flex; align-items: center; justify-content: space-between; height: 56px; position: sticky; top: 0; z-index: 100; }
.hdr-brand { display: flex; align-items: center; gap: 10px; }
.hdr-title { font-family: 'Fraunces', serif; font-size: 16px; color: #fff; letter-spacing: .5px; }
.hdr-sub { font-size: 10px; color: ${T.inkLight}; letter-spacing: 2px; text-transform: uppercase; }
.hdr-date { font-size: 11px; color: ${T.inkLight}; letter-spacing: 1px; }

/* ── Nav ── */
.nav { background: ${T.card}; border-bottom: 2px solid ${T.border}; display: flex; overflow-x: auto; scrollbar-width: none; position: sticky; top: 56px; z-index: 99; }
.nav::-webkit-scrollbar { display: none; }
.nav-btn { flex-shrink: 0; padding: 0 18px; height: 44px; font-family: 'DM Sans', sans-serif; font-size: 12px; font-weight: 600; letter-spacing: .8px; text-transform: uppercase; border: none; border-bottom: 2.5px solid transparent; background: transparent; color: ${T.inkLight}; cursor: pointer; transition: all .18s; white-space: nowrap; }
.nav-btn.active { color: ${T.accent}; border-bottom-color: ${T.accent}; }
.nav-btn:hover:not(.active) { color: ${T.ink}; background: ${T.cardAlt}; }

/* ── Main ── */
.main { padding: 16px; max-width: 1080px; margin: 0 auto; }

/* ── Login ── */
.login-wrap { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: ${T.bg}; padding: 20px; }
.login-card { background: ${T.card}; border: 1px solid ${T.border}; border-radius: 12px; padding: 40px 32px; width: 100%; max-width: 420px; box-shadow: ${T.shadowMd}; text-align: center; }
.login-logo { display: flex; flex-direction: column; align-items: center; gap: 10px; margin-bottom: 8px; }
.login-logo img { height: 64px; object-fit: contain; filter: drop-shadow(0 2px 6px rgba(0,0,0,.15)); }
.login-logo-name { font-family: 'Fraunces', serif; font-size: 20px; font-weight: 700; color: ${T.ink}; line-height: 1.2; }
.login-sub { font-size: 11px; letter-spacing: 1.5px; text-transform: uppercase; color: ${T.inkLight}; margin-bottom: 32px; }
.login-options { display: flex; flex-direction: column; gap: 12px; }
.login-role-btn { background: ${T.cardAlt}; border: 1.5px solid ${T.border}; padding: 14px; border-radius: 8px; font-family: 'DM Sans', sans-serif; font-size: 14px; font-weight: 600; color: ${T.inkMid}; cursor: pointer; transition: all .2s; }
.login-role-btn:hover { border-color: ${T.accent}; color: ${T.accent}; background: ${T.accentBg}; }
.login-inp-wrap { display: flex; flex-direction: column; gap: 8px; text-align: left; }
.login-inp { width: 100%; background: ${T.cardAlt}; border: 1.5px solid ${T.border}; border-radius: 8px; padding: 12px 14px; font-family: 'DM Sans', sans-serif; font-size: 14px; color: ${T.ink}; outline: none; transition: border-color .2s; }
.login-inp:focus { border-color: ${T.accent}; }
.login-btn { width: 100%; background: ${T.accent}; color: #fff; border: none; border-radius: 8px; padding: 14px; font-family: 'DM Sans', sans-serif; font-size: 14px; font-weight: 700; cursor: pointer; transition: background .2s; margin-top: 8px; }
.login-btn:hover { background: #9a3412; }
.login-back { font-size: 12px; color: ${T.inkLight}; cursor: pointer; margin-top: 16px; text-decoration: underline; text-align: center; }
.login-err { background: ${T.dangerBg}; border: 1px solid #fecaca; border-radius: 6px; padding: 10px; font-size: 12px; color: ${T.danger}; margin-bottom: 16px; text-align: left; }

/* ── Cards / Sections ── */
.card { background: ${T.card}; border: 1px solid ${T.border}; border-radius: 10px; box-shadow: ${T.shadow}; overflow: hidden; margin-bottom: 14px; }
.card-head { padding: 10px 16px; background: ${T.cardAlt}; border-bottom: 1px solid ${T.border}; display: flex; align-items: center; justify-content: space-between; }
.card-head-title { font-size: 11px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; color: ${T.inkMid}; display: flex; align-items: center; gap: 6px; }
.card-body { padding: 14px 16px; }

/* ── Grid layouts ── */
.g2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.g3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 14px; }
.row { display: flex; gap: 14px; }
.row > * { flex: 1; }

/* ── Form controls ── */
.field { margin-bottom: 10px; }
.field label { display: block; font-size: 10px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase; color: ${T.inkLight}; margin-bottom: 4px; }
.inp { width: 100%; background: ${T.cardAlt}; border: 1.5px solid ${T.border}; border-radius: 6px; padding: 8px 10px; font-family: 'DM Sans', sans-serif; font-size: 13px; color: ${T.ink}; outline: none; transition: border-color .15s; }
.inp:focus { border-color: ${T.accent}; }
.inp-inline { width: 100%; background: transparent; border: none; border-bottom: 1.5px solid ${T.border}; padding: 4px 6px; font-family: 'DM Sans', sans-serif; font-size: 13px; color: ${T.ink}; outline: none; transition: border-color .15s; text-align: right; }
.inp-inline:focus { border-bottom-color: ${T.accent}; }
.inp-inline.left { text-align: left; }

/* ── Tables ── */
.tbl { width: 100%; border-collapse: collapse; font-size: 13px; }
.tbl th { padding: 8px 10px; font-size: 10px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: ${T.inkLight}; border-bottom: 1.5px solid ${T.border}; text-align: left; white-space: nowrap; }
.tbl td { padding: 7px 10px; border-bottom: 1px solid #f0ece6; vertical-align: middle; }
.tbl tr:last-child td { border-bottom: none; }
.tbl tr:hover td { background: ${T.cardAlt}; }
.tbl-total td { background: ${T.cardAlt} !important; font-weight: 700; font-size: 12px; }

/* ── Buttons ── */
.btn-primary { background: ${T.accent}; color: #fff; border: none; border-radius: 8px; padding: 10px 24px; font-family: 'DM Sans', sans-serif; font-size: 12px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; cursor: pointer; transition: all .18s; }
.btn-primary:hover { background: #9a3412; }
.btn-ghost { background: transparent; color: ${T.inkMid}; border: 1.5px solid ${T.border}; border-radius: 6px; padding: 7px 14px; font-family: 'DM Sans', sans-serif; font-size: 11px; font-weight: 600; letter-spacing: .8px; text-transform: uppercase; cursor: pointer; transition: all .18s; }
.btn-ghost:hover { border-color: ${T.accent}; color: ${T.accent}; }
.btn-danger { background: ${T.danger}; color: #fff; border: none; border-radius: 6px; padding: 6px 12px; font-family: 'DM Sans', sans-serif; font-size: 11px; font-weight: 600; cursor: pointer; transition: background .18s; }
.btn-danger:hover { background: #991b1b; }
.btn-icon { background: transparent; border: 1.5px solid ${T.border}; border-radius: 6px; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; cursor: pointer; color: ${T.inkLight}; font-size: 14px; transition: all .15s; flex-shrink: 0; }
.btn-icon:hover { border-color: ${T.danger}; color: ${T.danger}; }
.btn-add { background: ${T.accentBg}; color: ${T.accent}; border: 1.5px dashed ${T.accentLt}; border-radius: 6px; padding: 7px 14px; font-family: 'DM Sans', sans-serif; font-size: 11px; font-weight: 600; cursor: pointer; transition: all .18s; width: 100%; margin-top: 6px; }
.btn-add:hover { background: #fff7ed; border-style: solid; }

/* ── Badges / Tags ── */
.badge { display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 20px; font-size: 10px; font-weight: 700; letter-spacing: .8px; text-transform: uppercase; }
.badge-danger  { background: ${T.dangerBg}; color: ${T.danger}; }
.badge-success { background: ${T.successBg}; color: ${T.success}; }
.badge-warn    { background: ${T.warnBg}; color: ${T.warn}; }
.badge-blue    { background: ${T.blueBg}; color: ${T.blue}; }
.badge-ink     { background: #f5f5f4; color: ${T.inkMid}; }

/* ── Alert banners ── */
.alert { border-radius: 8px; padding: 10px 14px; font-size: 12px; font-weight: 500; margin-bottom: 14px; }
.alert-success { background: ${T.successBg}; color: ${T.success}; border: 1px solid #bbf7d0; }
.alert-warn    { background: ${T.warnBg}; color: ${T.warn}; border: 1px solid #fde68a; }

/* ── Stat cards ── */
.stat-row { display: flex; gap: 10px; margin-bottom: 14px; flex-wrap: wrap; }
.stat-card { background: ${T.card}; border: 1px solid ${T.border}; border-radius: 10px; padding: 14px 16px; flex: 1; min-width: 130px; position: relative; overflow: hidden; }
.stat-card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px; background: var(--kpi-color, transparent); }
.stat-val { font-family: 'Fraunces', serif; font-size: 22px; font-weight: 700; margin-bottom: 2px; }
.stat-lbl { font-size: 10px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase; color: ${T.inkLight}; }
.stat-delta { font-size: 11px; font-weight: 600; margin-top: 6px; }

/* ── Admin Tabs ── */
.prod-tabs { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }
.prod-tab { padding: 6px 14px; border-radius: 20px; border: 1.5px solid ${T.border}; background: ${T.cardAlt}; color: ${T.inkMid}; font-family: 'DM Sans', sans-serif; font-size: 12px; font-weight: 600; cursor: pointer; transition: all .18s; }
.prod-tab.active { background: ${T.accent}; border-color: ${T.accent}; color: #fff; }

/* ── Cash on hand bar ── */
.coh-bar { background: ${T.ink}; color: #fff; border-radius: 10px; padding: 16px 20px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; gap: 12px; flex-wrap: wrap; }
.coh-label { font-size: 11px; font-weight: 600; letter-spacing: 1.5px; text-transform: uppercase; color: ${T.accentLt}; margin-bottom: 4px; }
.coh-formula { font-size: 11px; color: #a8a29e; }
.coh-amount { font-family: 'Fraunces', serif; font-size: 34px; font-weight: 700; color: #fdba74; }
.coh-amount.negative { color: #f87171; }

/* ── Pending credit items ── */
.pending-item { border: 1px solid ${T.border}; border-radius: 8px; padding: 12px 14px; margin-bottom: 8px; background: ${T.card}; }
.pending-item.cleared { opacity: .55; border-color: #d1fae5; background: ${T.successBg}; }
.pi-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; margin-bottom: 8px; }
.pi-name { font-weight: 600; font-size: 14px; }
.pi-meta { font-size: 11px; color: ${T.inkLight}; margin-top: 2px; }
.pi-bar-wrap { background: #f5f5f4; border-radius: 20px; height: 6px; overflow: hidden; margin-bottom: 6px; }
.pi-bar { height: 100%; border-radius: 20px; background: ${T.danger}; transition: width .4s ease; }
.pi-bar.done { background: ${T.success}; }
.pi-amounts { display: flex; justify-content: space-between; font-size: 11px; }

/* ── Period buttons ── */
.period-row { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }

/* ── Responsive breakpoints ── */
@media (max-width: 680px) {
  .g2 { grid-template-columns: 1fr; }
  .g3 { grid-template-columns: 1fr; }
  .row { flex-direction: column; }
  .hdr-title { font-size: 13px; }
  .hdr-sub { display: none; }
  .main { padding: 10px; }
  .coh-amount { font-size: 26px; }
  .stat-card { min-width: 100px; }
  .stat-val { font-size: 18px; }
  .tbl { display: block; overflow-x: auto; }
}
@media (max-width: 400px) {
  .g3 { grid-template-columns: 1fr; }
  .nav-btn { padding: 0 12px; font-size: 11px; }
}

/* ── Animations ── */
@keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
.fade-in { animation: fadeIn .25s ease; }
`;

function injectCSS() {
  if (document.getElementById("jrgs-style")) return;
  const el = document.createElement("style");
  el.id = "jrgs-style";
  el.textContent = CSS;
  document.head.appendChild(el);
}

/* ════════════════════════════════════════════════════════════════
   ROOT APP & LOGIN
════════════════════════════════════════════════════════════════ */
export default function App() {
  injectCSS();

  const [authedRole, setAuthedRole] = useState(null); // null | "user" | "admin"
  const [tab, setTab] = useState("entry");
  
  const [entries, setEntries] = useState([]);
  const [pending, setPending] = useState([]); 
  const [prices, setPrices] = useState([]);
  const [commissions, setCommissions] = useState([]);
  const [deliveryBoys, setDeliveryBoys] = useState([]);
  
  const [entry, setEntry] = useState(blankEntry([], []));
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    const data = await api.load();
    setEntries(data.entries || []);
    setPending(data.pending || []);
    setPrices(data.prices || []);
    setCommissions(data.commissions || []);
    const loadedBoys = data.boys && data.boys.length > 0 ? data.boys : DEFAULT_BOYS;
    setDeliveryBoys(loadedBoys);
    
    const todayEntry = (data.entries || []).find((x) => x.date === todayStr());
    if (todayEntry) setEntry(todayEntry);
    else setEntry(blankEntry(data.prices || [], loadedBoys));
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  /* ── save daily entry ── */
  const handleSave = async () => {
    await api.saveEntry(entry);
    await loadData();
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  /* ── record a recovery payment against a pending credit ── */
  const recordPayment = async (pendingId, payAmt, payDate, note) => {
    await api.savePayment(pendingId, payAmt, payDate, note);
    await loadData();
  };

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: T.bg, fontFamily: "'DM Sans',sans-serif", color: T.inkLight, letterSpacing: 2, fontSize: 13 }}>
      Loading…
    </div>
  );

  if (!authedRole) return <LoginScreen onAuth={(r) => {
    setAuthedRole(r);
    setTab(r === "admin" ? "admin-dashboard" : "entry");
  }} />;

  const TABS_USER = [
    { id: "entry", label: "📋 Daily Entry" },
    { id: "history", label: "📅 History" },
    { id: "credits", label: "💳 Pending Credits" },
    { id: "summary", label: "📊 Summary" },
  ];
  
  const TABS_ADMIN = [
    { id: "admin-dashboard", label: "⬛ Dashboard" },
    { id: "admin-prices", label: "📈 Prices" },
    { id: "admin-comm", label: "💰 Commission" },
    { id: "admin-boys", label: "🚚 Delivery Boys" },
    { id: "admin-reports", label: "📊 Day Reports" },
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
            width: 140,
            height: 40,
            borderRadius: 6,
            overflow: "hidden",
            flexShrink: 0,
            border: "2px solid rgba(255,255,255,0.15)",
            background: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "2px 4px"
          }}>
            <img
              src="/bpcl_logo.png"
              alt="Bharat Gas"
              style={{ width: "100%", height: "100%", objectFit: "contain" }}
            />
          </div>
          <div>
            <div className="hdr-title">JAY RANCHHOD GAS SERVICE</div>
            <div className="hdr-sub">Bharat LPG · {authedRole === "admin" ? "Admin Portal" : "Daily Management"}</div>
          </div>
        </div>
        <div style={{display:"flex", alignItems:"center", gap: 16}}>
          <div className="hdr-date">{fmtDate(todayStr())}</div>
          <button className="btn-ghost" style={{borderColor: "#444", color: "#ccc", padding: "4px 10px", fontSize: 10}} onClick={() => setAuthedRole(null)}>LOGOUT</button>
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
        {tab === "entry" && <DailyEntry entry={entry} setEntry={setEntry} calcs={calcs} onSave={handleSave} saved={saved} entries={entries} prices={prices} deliveryBoys={deliveryBoys} />}
        {tab === "history" && <History entries={entries} onEdit={(e) => { setEntry(e); setTab("entry"); }} />}
        {tab === "credits" && <PendingCredits pending={pending} onRecord={recordPayment} />}
        {tab === "summary" && <Summary entries={entries} pending={pending} />}

        {/* Admin Tabs */}
        {tab === "admin-dashboard" && <AdminDashboard entries={entries} pending={pending} prices={prices} commissions={commissions} />}
        {tab === "admin-prices" && <AdminPriceHistory prices={prices} setPrices={setPrices} />}
        {tab === "admin-comm" && <AdminCommission commissions={commissions} setCommissions={setCommissions} />}
        {tab === "admin-boys" && <AdminDeliveryBoys deliveryBoys={deliveryBoys} setDeliveryBoys={setDeliveryBoys} />}
        {tab === "admin-reports" && <AdminDayReports entries={entries} commissions={commissions} />}
        {tab === "admin-credits" && <AdminCreditOverview pending={pending} />}
        {tab === "admin-users" && <AdminUsers />}
      </main>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   LOGIN SCREEN
════════════════════════════════════════════════════════════════ */
function LoginScreen({ onAuth }) {
  const [username, setUsername] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const attemptLogin = async () => {
    if (!username || !pw) { setErr("Please enter both username and password."); return; }
    setLoading(true);
    setErr("");
    try {
      const res = await api.login(username, pw);
      if (res.success) {
        onAuth(res.role);
      } else { 
        setErr(res.error || "Login failed."); 
        setPw(""); 
      }
    } catch (e) {
      setErr("Failed to connect to server.");
    }
    setLoading(false);
  };

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="login-logo">
          <img src="/bpcl_logo.png" alt="Bharat Gas Logo" />
          <div className="login-logo-name">Jay Ranchhod Gas Service</div>
        </div>
        <div className="login-sub">Sign in to your account</div>
        <div className="fade-in">
          {err && <div className="login-err">⚠️ {err}</div>}
          <div className="login-inp-wrap">
            <label style={{fontSize: 11, fontWeight: 600, color: T.inkMid, alignSelf: "flex-start"}}>Username</label>
            <input className="login-inp" type="text" placeholder="Enter username…" value={username}
              onChange={(e) => setUsername(e.target.value)} autoFocus style={{marginBottom: 12}} />
            
            <label style={{fontSize: 11, fontWeight: 600, color: T.inkMid, alignSelf: "flex-start"}}>Password</label>
            <input className="login-inp" type="password" placeholder="Enter password…" value={pw}
              onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key==="Enter" && attemptLogin()} />
            
            <button className="login-btn" onClick={attemptLogin} disabled={loading} style={{marginTop: 16}}>
              {loading ? "Authenticating..." : "Secure Login →"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({ username: "", password: "", role: "user" });
  const [loading, setLoading] = useState(true);

  const fetchUsers = async () => {
    setLoading(true);
    try { const data = await api.getUsers(); setUsers(data); } catch {}
    setLoading(false);
  };

  useEffect(() => { fetchUsers(); }, []);

  const add = async () => {
    if (!form.username || !form.password) return;
    await api.addUser(form.username, form.password, form.role);
    setForm({ username: "", password: "", role: "user" });
    fetchUsers();
  };

  const del = async (id) => {
    if (!window.confirm("Delete this user?")) return;
    await api.deleteUser(id);
    fetchUsers();
  };

  return (
    <div className="fade-in g2">
      <div className="card">
        <div className="card-head"><span className="card-head-title">➕ Add New User</span></div>
        <div className="card-body">
          <div className="field"><label>Username</label><input className="inp" type="text" value={form.username} onChange={e=>setForm({...form,username:e.target.value})} /></div>
          <div className="field"><label>Password</label><input className="inp" type="text" value={form.password} onChange={e=>setForm({...form,password:e.target.value})} /></div>
          <div className="field"><label>Role</label>
            <select className="inp" value={form.role} onChange={e=>setForm({...form,role:e.target.value})}>
              <option value="user">Office User</option>
              <option value="admin">Administrator</option>
            </select>
          </div>
          <button className="btn-primary" style={{width:"100%", margin: "8px 0"}} onClick={add}>Create User</button>
        </div>
      </div>
      <div className="card">
        <div className="card-head"><span className="card-head-title">👥 User Accounts</span></div>
        {loading ? <div style={{padding:20, textAlign:"center"}}>Loading...</div> : (
          <table className="tbl">
            <thead><tr><th style={{textAlign:"left"}}>Username</th><th style={{textAlign:"left"}}>Role</th><th></th></tr></thead>
            <tbody>
              {users.map(u=>(
                <tr key={u.id}>
                  <td style={{fontWeight:600}}>{u.username}</td>
                  <td><span className={`badge ${u.role==='admin'?'badge-danger':'badge-success'}`}>{u.role.toUpperCase()}</span></td>
                  <td><button className="btn-icon" onClick={()=>del(u.id)}>×</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   DAILY ENTRY
════════════════════════════════════════════════════════════════ */
function DailyEntry({ entry, setEntry, calcs, onSave, saved, entries, prices, deliveryBoys }) {
  const set = (path, val) => {
    setEntry((prev) => {
      const clone = JSON.parse(JSON.stringify(prev));
      const parts = path.split(".");
      let cur = clone;
      for (let i = 0; i < parts.length - 1; i++) cur = cur[parts[i]];
      cur[parts[parts.length - 1]] = val;
      return clone;
    });
  };

  const setProduct = (i, field, val) => {
    setEntry((prev) => {
      const clone = JSON.parse(JSON.stringify(prev));
      clone.products[i][field] = val;
      const os = num(clone.products[i].openingStock);
      const sell = num(clone.products[i].sell);
      clone.products[i].closingStock = (os - sell) >= 0 ? (os - sell) : (os - sell);
      return clone;
    });
  };

  const setDelivery = (boy, val) => setEntry((prev) => ({ ...prev, delivery: { ...prev.delivery, [boy]: val } }));

  const listAdd = (key, blank) => setEntry((p) => ({ ...p, [key]: [...p[key], blank()] }));
  const listRemove = (key, id) => setEntry((p) => ({ ...p, [key]: p[key].filter((x) => x.id !== id) }));
  const listSet = (key, id, field, val) =>
    setEntry((p) => ({ ...p, [key]: p[key].map((x) => x.id === id ? { ...x, [field]: val } : x) }));

  const isEdit = entries.some((x) => x.date === entry.date) && entry.date !== todayStr();

  return (
    <div className="fade-in">
      {saved && <div className="alert alert-success">✅ Entry saved successfully!</div>}
      {isEdit && <div className="alert alert-warn">✏️ Editing historical entry — {fmtDate(entry.date)}</div>}

      <div className="g3" style={{ marginBottom: 14 }}>
        <div className="card">
          <div className="card-head"><span className="card-head-title">📅 Date</span></div>
          <div className="card-body">
            <input className="inp" type="date" value={entry.date} onChange={(e) => set("date", e.target.value)} />
          </div>
        </div>
        <div className="card">
          <div className="card-head"><span className="card-head-title">💰 Opening Cash</span></div>
          <div className="card-body">
            <input className="inp" type="number" placeholder="₹ 0" value={entry.openingCash} onChange={(e) => set("openingCash", e.target.value)} />
          </div>
        </div>
        <div className="card">
          <div className="card-head"><span className="card-head-title">🏦 BOB Bank</span></div>
          <div className="card-body">
            <input className="inp" type="number" placeholder="₹ 0" value={entry.bob} onChange={(e) => set("bob", e.target.value)} />
          </div>
        </div>
      </div>

      {/* Products */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-head">
          <span className="card-head-title">🛢️ Products · Stock & Sales</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: T.success }}>{inr(calcs.totalSales)}</span>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          <div style={{ overflowX: "auto" }}>
            <table className="tbl">
              <thead>
                <tr>
                  {["Product", "Opening Stock", "Rate (₹)", "Sell Qty", "SBC", "DBC", "Total", "Closing"].map((xh) => <th key={xh}>{xh}</th>)}
                </tr>
              </thead>
              <tbody>
                {entry.products.map((p, i) => {
                  const total = num(p.sell) * num(p.rate);
                  const closing = num(p.openingStock) - num(p.sell);
                  return (
                    <tr key={p.id}>
                      <td style={{ fontWeight: 600, color: T.accent, whiteSpace: "nowrap" }}>{PRODUCTS[i].label}</td>
                      <td><input className="inp-inline" type="number" value={p.openingStock} onChange={(e) => setProduct(i, "openingStock", e.target.value)} /></td>
                      <td><input className="inp-inline" type="number" value={p.rate} onChange={(e) => setProduct(i, "rate", e.target.value)} /></td>
                      <td><input className="inp-inline" type="number" value={p.sell} onChange={(e) => setProduct(i, "sell", e.target.value)} /></td>
                      <td><input className="inp-inline" type="number" value={p.sbc} onChange={(e) => setProduct(i, "sbc", e.target.value)} /></td>
                      <td><input className="inp-inline" type="number" value={p.dbc} onChange={(e) => setProduct(i, "dbc", e.target.value)} /></td>
                      <td style={{ color: T.success, fontWeight: 700 }}>{inr(total)}</td>
                      <td style={{ color: closing < 0 ? T.danger : T.ink, fontWeight: 600 }}>{p.openingStock !== "" ? closing : "—"}</td>
                    </tr>
                  );
                })}
                <tr className="tbl-total">
                  <td colSpan={6} style={{ color: T.inkMid, fontSize: 11, textTransform: "uppercase", letterSpacing: 1 }}>Total Cash Sales</td>
                  <td style={{ color: T.success, fontSize: 15 }}>{inr(calcs.totalSales)}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="g2" style={{ marginBottom: 14 }}>
        <div className="card">
          <div className="card-head">
            <span className="card-head-title">🚚 Delivery Boy Wise</span>
            <span style={{ fontWeight: 700, color: T.accent, fontSize: 13 }}>{calcs.totalDelivery} cyl</span>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            <table className="tbl">
              <thead><tr><th>Delivery Boy</th><th style={{ textAlign: "right" }}>Qty</th></tr></thead>
              <tbody>
                {deliveryBoys.map((b) => (
                  <tr key={b}>
                    <td style={{ fontWeight: 500 }}>{b}</td>
                    <td><input className="inp-inline" type="number" value={entry.delivery[b]||""} onChange={(e) => setDelivery(b, e.target.value)} /></td>
                  </tr>
                ))}
                <tr className="tbl-total">
                  <td style={{ color: T.inkMid, fontSize: 11, textTransform: "uppercase", letterSpacing: 1 }}>Total</td>
                  <td style={{ textAlign: "right", color: T.accent }}>{calcs.totalDelivery}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <span className="card-head-title">🧾 Office Expenses</span>
            <span style={{ fontWeight: 700, color: T.danger, fontSize: 13 }}>{inr(calcs.totalExpenses)}</span>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            <table className="tbl">
              <thead><tr><th style={{ width: "55%" }}>Description</th><th>Amount</th><th></th></tr></thead>
              <tbody>
                {entry.expenses.map((x) => (
                  <tr key={x.id}>
                    <td><input className="inp-inline left" type="text" placeholder="Expense item…" value={x.desc} onChange={(e) => listSet("expenses", x.id, "desc", e.target.value)} /></td>
                    <td><input className="inp-inline" type="number" placeholder="0" value={x.amt} onChange={(e) => listSet("expenses", x.id, "amt", e.target.value)} /></td>
                    <td style={{ width: 36 }}>
                      {entry.expenses.length > 1 && <button className="btn-icon" onClick={() => listRemove("expenses", x.id)}>×</button>}
                    </td>
                  </tr>
                ))}
                <tr className="tbl-total">
                  <td style={{ color: T.inkMid, fontSize: 11, textTransform: "uppercase", letterSpacing: 1 }}>Total</td>
                  <td style={{ color: T.danger }}>{inr(calcs.totalExpenses)}</td>
                  <td />
                </tr>
              </tbody>
            </table>
            <div style={{ padding: "6px 10px 10px" }}>
              <button className="btn-add" onClick={() => listAdd("expenses", blankExpense)}>+ Add Expense Row</button>
            </div>
          </div>
        </div>
      </div>

      <div className="g2" style={{ marginBottom: 14 }}>
        <div className="card">
          <div className="card-head">
            <span className="card-head-title">🏧 Cheque / Online</span>
            <span style={{ fontWeight: 700, color: T.blue, fontSize: 13 }}>{inr(calcs.totalCheque)}</span>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            <table className="tbl">
              <thead><tr><th style={{ width: "55%" }}>Description</th><th>Amount</th><th></th></tr></thead>
              <tbody>
                {entry.chequeOnline.map((x) => (
                  <tr key={x.id}>
                    <td><input className="inp-inline left" type="text" placeholder="Payment detail…" value={x.desc} onChange={(e) => listSet("chequeOnline", x.id, "desc", e.target.value)} /></td>
                    <td><input className="inp-inline" type="number" placeholder="0" value={x.amt} onChange={(e) => listSet("chequeOnline", x.id, "amt", e.target.value)} /></td>
                    <td style={{ width: 36 }}>
                      {entry.chequeOnline.length > 1 && <button className="btn-icon" onClick={() => listRemove("chequeOnline", x.id)}>×</button>}
                    </td>
                  </tr>
                ))}
                <tr className="tbl-total">
                  <td style={{ color: T.inkMid, fontSize: 11, textTransform: "uppercase", letterSpacing: 1 }}>Total</td>
                  <td style={{ color: T.blue }}>{inr(calcs.totalCheque)}</td>
                  <td />
                </tr>
              </tbody>
            </table>
            <div style={{ padding: "6px 10px 10px" }}>
              <button className="btn-add" onClick={() => listAdd("chequeOnline", blankCheque)}>+ Add Row</button>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <span className="card-head-title">💳 Credit Sale</span>
            <span style={{ fontWeight: 700, color: T.danger, fontSize: 13 }}>{inr(calcs.totalCredit)}</span>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            <table className="tbl">
              <thead><tr><th style={{ width: "55%" }}>Customer Name</th><th>Amount</th><th></th></tr></thead>
              <tbody>
                {entry.creditSales.map((x) => (
                  <tr key={x.id}>
                    <td><input className="inp-inline left" type="text" placeholder="Customer name…" value={x.customerName} onChange={(e) => listSet("creditSales", x.id, "customerName", e.target.value)} /></td>
                    <td><input className="inp-inline" type="number" placeholder="0" value={x.amt} onChange={(e) => listSet("creditSales", x.id, "amt", e.target.value)} /></td>
                    <td style={{ width: 36 }}>
                      {entry.creditSales.length > 1 && <button className="btn-icon" onClick={() => listRemove("creditSales", x.id)}>×</button>}
                    </td>
                  </tr>
                ))}
                <tr className="tbl-total">
                  <td style={{ color: T.inkMid, fontSize: 11, textTransform: "uppercase", letterSpacing: 1 }}>Total</td>
                  <td style={{ color: T.danger }}>{inr(calcs.totalCredit)}</td>
                  <td />
                </tr>
              </tbody>
            </table>
            <div style={{ padding: "6px 10px 10px" }}>
              <button className="btn-add" onClick={() => listAdd("creditSales", blankCredit)}>+ Add Customer</button>
            </div>
          </div>
        </div>
      </div>

      <div className="coh-bar" style={{ marginBottom: 14 }}>
        <div>
          <div className="coh-label">Cash on Hand</div>
          <div className="coh-formula">Opening + Sales − Expenses − Cheque/Online − Credit Sales</div>
        </div>
        <div className={`coh-amount${calcs.cashOnHand < 0 ? " negative" : ""}`}>{inr(calcs.cashOnHand)}</div>
      </div>

      <div style={{ textAlign: "right" }}>
        <button className="btn-primary" onClick={onSave}>💾 Save Entry</button>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   HISTORY, PENDING CREDITS, SUMMARY (USER VIEWS)
════════════════════════════════════════════════════════════════ */
function History({ entries, onEdit }) {
  const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date));
  return (
    <div className="fade-in">
      <div style={{ fontSize: 12, color: T.inkLight, marginBottom: 12 }}>{entries.length} entries · tap to edit</div>
      <div className="card">
        <div style={{ overflowX: "auto" }}>
          <table className="tbl">
            <thead>
              <tr>
                {["Date", "Total Sales", "Expenses", "Cheque", "Credit Sales", "Cash on Hand", ""].map((h) => <th key={h}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: "center", padding: 32, color: T.inkLight }}>No entries yet.</td></tr>
              )}
              {sorted.map((e) => {
                const c = calcEntry(e);
                return (
                  <tr key={e.date} style={{ cursor: "pointer" }} onClick={() => onEdit(e)}>
                    <td style={{ fontWeight: 600, color: T.accent, whiteSpace: "nowrap" }}>{fmtDate(e.date)}</td>
                    <td style={{ color: T.success, fontWeight: 600 }}>{inr(c.totalSales)}</td>
                    <td style={{ color: T.danger }}>{inr(c.totalExpenses)}</td>
                    <td style={{ color: T.blue }}>{inr(c.totalCheque)}</td>
                    <td style={{ color: T.danger }}>{inr(c.totalCredit)}</td>
                    <td style={{ color: c.cashOnHand < 0 ? T.danger : T.success, fontWeight: 700 }}>{inr(c.cashOnHand)}</td>
                    <td><span className="badge badge-ink">✏️ Edit</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function PendingCredits({ pending, onRecord }) {
  const [filter, setFilter] = useState("pending");
  const [modal, setModal] = useState(null);
  const [payAmt, setPayAmt] = useState("");
  const [payDate, setPayDate] = useState(todayStr());
  const [payNote, setPayNote] = useState("");

  const totalOutstanding = pending.filter((p) => !p.cleared).reduce((s, p) => s + (p.originalAmt - p.recovered), 0);
  const totalPending = pending.filter((p) => !p.cleared).length;
  const filtered = pending.filter((p) => filter === "all" ? true : filter === "cleared" ? p.cleared : !p.cleared).sort((a, b) => b.date.localeCompare(a.date));

  const submitPayment = async () => {
    const amt = num(payAmt);
    if (!amt || !modal) return;
    await onRecord(modal, amt, payDate, payNote);
    setModal(null); setPayAmt(""); setPayNote(""); setPayDate(todayStr());
  };

  return (
    <div className="fade-in">
      <div className="stat-row">
        <div className="stat-card" style={{ "--kpi-color": T.danger }}>
          <div className="stat-val" style={{ color: T.danger }}>{inr(totalOutstanding)}</div>
          <div className="stat-lbl">Total Outstanding</div>
        </div>
        <div className="stat-card" style={{ "--kpi-color": T.warn }}>
          <div className="stat-val" style={{ color: T.warn }}>{totalPending}</div>
          <div className="stat-lbl">Pending Accounts</div>
        </div>
        <div className="stat-card" style={{ "--kpi-color": T.success }}>
          <div className="stat-val" style={{ color: T.success }}>{pending.filter((p) => p.cleared).length}</div>
          <div className="stat-lbl">Cleared Accounts</div>
        </div>
      </div>

      <div className="period-row">
        {[["pending", "⏳ Pending"], ["cleared", "✅ Cleared"], ["all", "All"]].map(([v, l]) => (
          <button key={v} className={`btn-ghost${filter === v ? " active" : ""}`}
            style={{ background: filter === v ? T.accent : "transparent", color: filter === v ? "#fff" : T.inkMid, borderColor: filter === v ? T.accent : T.border }}
            onClick={() => setFilter(v)}>{l}</button>
        ))}
        <span style={{ fontSize: 11, color: T.inkLight, alignSelf: "center", marginLeft: 4 }}>{filtered.length} records</span>
      </div>

      {filtered.length === 0 && <div className="card"><div className="card-body" style={{ textAlign: "center", padding: 40, color: T.inkLight }}>No records found.</div></div>}

      {filtered.map((p) => {
        const remaining = p.originalAmt - p.recovered;
        const pct = (p.recovered / p.originalAmt) * 100;
        return (
          <div key={p.id} className={`pending-item${p.cleared ? " cleared" : ""}`}>
            <div className="pi-top">
              <div>
                <div className="pi-name">{p.customerName}</div>
                <div className="pi-meta">Credit on {fmtDate(p.date)}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                <span className={`badge ${p.cleared ? "badge-success" : remaining > 0 ? "badge-danger" : "badge-warn"}`}>
                  {p.cleared ? "CLEARED" : `DUE ${inr(remaining)}`}
                </span>
                {!p.cleared && (
                  <button className="btn-ghost" style={{ padding: "5px 12px", fontSize: 11 }} onClick={() => setModal(p.id)}>
                    💰 Record Payment
                  </button>
                )}
              </div>
            </div>
            <div className="pi-bar-wrap"><div className="pi-bar" style={{ width: `${pct}%` }} /></div>
            <div className="pi-amounts">
              <span style={{ color: T.inkLight }}>Original: <strong style={{ color: T.ink }}>{inr(p.originalAmt)}</strong></span>
              <span style={{ color: T.inkLight }}>Recovered: <strong style={{ color: T.success }}>{inr(p.recovered)}</strong></span>
              <span style={{ color: T.inkLight }}>Remaining: <strong style={{ color: p.cleared ? T.success : T.danger }}>{inr(remaining)}</strong></span>
            </div>
            {p.payments.length > 0 && (
              <div style={{ marginTop: 10, borderTop: `1px solid ${T.border}`, paddingTop: 8 }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: T.inkLight, marginBottom: 6 }}>Payment History</div>
                {p.payments.map((pay, idx) => (
                  <div key={idx} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "3px 0", borderBottom: idx < p.payments.length - 1 ? "1px solid #f5f3ee" : "none" }}>
                    <span style={{ color: T.inkMid }}>{fmtDate(pay.date)}{pay.note ? ` · ${pay.note}` : ""}</span>
                    <span style={{ color: T.success, fontWeight: 600 }}>+{inr(pay.amt)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {modal && (() => {
        const item = pending.find((p) => p.id === modal);
        const remaining = item ? item.originalAmt - item.recovered : 0;
        return (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999, padding: 16 }}>
            <div style={{ background: T.card, borderRadius: 12, padding: 24, width: "100%", maxWidth: 400, boxShadow: T.shadowMd }}>
              <div style={{ fontFamily: "'Fraunces',serif", fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Record Payment</div>
              <div style={{ fontSize: 12, color: T.inkLight, marginBottom: 18 }}>
                {item?.customerName} · Remaining: <strong style={{ color: T.danger }}>{inr(remaining)}</strong>
              </div>
              <div className="field"><label>Payment Date</label><input className="inp" type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} /></div>
              <div className="field"><label>Amount Received (₹)</label><input className="inp" type="number" placeholder={`Max ${inr(remaining)}`} value={payAmt} onChange={(e) => setPayAmt(e.target.value)} /></div>
              <div className="field"><label>Note (optional)</label><input className="inp" type="text" placeholder="Cash / Online / Cheque…" value={payNote} onChange={(e) => setPayNote(e.target.value)} /></div>
              <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
                <button className="btn-ghost" style={{ flex: 1 }} onClick={() => { setModal(null); setPayAmt(""); setPayNote(""); }}>Cancel</button>
                <button className="btn-primary" style={{ flex: 2 }} onClick={submitPayment}>Save Payment</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function Summary({ entries, pending }) {
  const [period, setPeriod] = useState("month");
  const now = new Date();
  const filtered = entries.filter((e) => {
    const d = new Date(e.date + "T00:00:00");
    if (period === "week") { const wa = new Date(); wa.setDate(wa.getDate() - 7); return d >= wa; }
    if (period === "month") return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    return true;
  });
  const totals = filtered.reduce((acc, e) => {
    const c = calcEntry(e);
    acc.sales += c.totalSales; acc.expenses += c.totalExpenses; acc.credit += c.totalCredit; acc.cheque += c.totalCheque; acc.delivery += c.totalDelivery;
    return acc;
  }, { sales: 0, expenses: 0, credit: 0, cheque: 0, delivery: 0 });
  const productTotals = PRODUCTS.map((p, i) => ({
    label: p.label,
    qty: filtered.reduce((s, e) => s + num(e.products[i].sell), 0),
    revenue: filtered.reduce((s, e) => s + num(e.products[i].sell) * num(e.products[i].rate), 0),
  }));
  const boyTotalsObj = {};
  filtered.forEach(e => {
    Object.entries(e.delivery||{}).forEach(([b, qty]) => {
      const q = num(qty);
      if (q > 0) boyTotalsObj[b] = (boyTotalsObj[b] || 0) + q;
    });
  });
  const boyTotals = Object.entries(boyTotalsObj).map(([name, qty]) => ({ name, qty })).sort((a, b) => b.qty - a.qty);
  const totalOutstanding = pending.filter((p) => !p.cleared).reduce((s, p) => s + (p.originalAmt - p.recovered), 0);

  return (
    <div className="fade-in">
      <div className="period-row">
        {[["week", "Last 7 Days"], ["month", "This Month"], ["all", "All Time"]].map(([v, l]) => (
          <button key={v} className="btn-ghost" style={{ background: period === v ? T.accent : "transparent", color: period === v ? "#fff" : T.inkMid, borderColor: period === v ? T.accent : T.border }} onClick={() => setPeriod(v)}>{l}</button>
        ))}
        <span style={{ fontSize: 11, color: T.inkLight, alignSelf: "center" }}>{filtered.length} entries</span>
      </div>
      <div className="stat-row">
        <div className="stat-card" style={{ "--kpi-color": T.success }}><div className="stat-val" style={{ color: T.success }}>{inr(totals.sales)}</div><div className="stat-lbl">Total Sales</div></div>
        <div className="stat-card" style={{ "--kpi-color": T.danger }}><div className="stat-val" style={{ color: T.danger }}>{inr(totals.expenses)}</div><div className="stat-lbl">Expenses</div></div>
        <div className="stat-card" style={{ "--kpi-color": T.blue }}><div className="stat-val" style={{ color: T.blue }}>{inr(totals.cheque)}</div><div className="stat-lbl">Cheque/Online</div></div>
        <div className="stat-card" style={{ "--kpi-color": T.danger }}><div className="stat-val" style={{ color: T.danger }}>{inr(totalOutstanding)}</div><div className="stat-lbl">Outstanding</div></div>
      </div>
      <div className="g2">
        <div className="card">
          <div className="card-head"><span className="card-head-title">🛢️ Product Sales</span></div>
          <div style={{ overflowX: "auto" }}>
            <table className="tbl">
              <thead><tr><th>Product</th><th>Qty Sold</th><th>Revenue</th></tr></thead>
              <tbody>{productTotals.map((p) => <tr key={p.label}><td style={{ color: T.accent, fontWeight: 500 }}>{p.label}</td><td style={{ fontWeight: 600 }}>{p.qty}</td><td style={{ color: T.success, fontWeight: 700 }}>{inr(p.revenue)}</td></tr>)}</tbody>
            </table>
          </div>
        </div>
        <div className="card">
          <div className="card-head"><span className="card-head-title">🚚 Delivery Boy</span></div>
          <div style={{ overflowX: "auto" }}>
            <table className="tbl">
              <thead><tr><th>Delivery Boy</th><th>Deliveries</th><th>Share</th></tr></thead>
              <tbody>
                {boyTotals.map((b, idx) => {
                  const pct = totals.delivery > 0 ? Math.round((b.qty / totals.delivery) * 100) : 0;
                  return (
                    <tr key={b.name}><td style={{ fontWeight: idx === 0 ? 700 : 400 }}>{b.name}</td><td style={{ fontWeight: 700, color: T.accent }}>{b.qty}</td>
                      <td><div style={{ display: "flex", alignItems: "center", gap: 6 }}><div style={{ flex: 1, background: T.border, borderRadius: 20, height: 5, overflow: "hidden" }}><div style={{ width: `${pct}%`, height: "100%", background: T.accent }} /></div><span style={{ fontSize: 11, color: T.inkLight }}>{pct}%</span></div></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   ADMIN VIEWS
════════════════════════════════════════════════════════════════ */
function AdminDashboard({ entries, pending, prices, commissions }) {
  const now = new Date();
  const thisMonth = entries.filter(e => { const d = new Date(e.date+"T00:00:00"); return d.getMonth()===now.getMonth() && d.getFullYear()===now.getFullYear(); });
  const lastMonth = entries.filter(e => { const d = new Date(e.date+"T00:00:00"); const lm = new Date(now.getFullYear(), now.getMonth()-1, 1); return d.getMonth()===lm.getMonth() && d.getFullYear()===lm.getFullYear(); });

  const sumSales = (arr) => arr.reduce((s,e) => s+calcEntry(e).totalSales, 0);
  const sumCyl   = (arr) => arr.reduce((s,e) => e.products.reduce((ss,p) => ss+num(p.sell), 0)+s, 0);

  const mSales  = sumSales(thisMonth);
  const lmSales = sumSales(lastMonth);
  const mCyl    = sumCyl(thisMonth);
  const outstanding = pending.filter(p=>!p.cleared).reduce((s,p)=>s+(p.originalAmt-p.recovered),0);

  const totalComm = thisMonth.reduce((s,e) => {
    return s + e.products.reduce((ps,p) => ps + num(p.sell)*getCommRate(p.id, commissions), 0);
  },0);

  const productBreakdown = PRODUCTS.map((p,i) => ({
    ...p,
    qty: thisMonth.reduce((s,e)=>s+num(e.products[i]?.sell),0),
    revenue: thisMonth.reduce((s,e)=>s+num(e.products[i]?.sell)*num(e.products[i]?.rate),0),
    rate: getCurrentRate(p.id, prices),
    comm: getCommRate(p.id, commissions),
  }));

  const delta = lmSales>0 ? (((mSales-lmSales)/lmSales)*100).toFixed(1) : null;

  return (
    <div className="fade-in">
      <div className="stat-row">
        <div className="stat-card" style={{ "--kpi-color": T.blue }}>
          <div className="stat-val" style={{color: T.blue}}>{inr(mSales)}</div>
          <div className="stat-lbl">This Month Sales</div>
          {delta && <div className="stat-delta" style={{color: num(delta)>=0?T.success:T.danger}}>{num(delta)>=0?"▲":"▼"} {Math.abs(delta)}% vs last month</div>}
        </div>
        <div className="stat-card" style={{ "--kpi-color": T.success }}>
          <div className="stat-val" style={{color: T.success}}>{mCyl}</div>
          <div className="stat-lbl">Cylinders This Month</div>
        </div>
        <div className="stat-card" style={{ "--kpi-color": T.danger }}>
          <div className="stat-val" style={{color: T.danger}}>{inr(outstanding)}</div>
          <div className="stat-lbl">Outstanding Credit</div>
        </div>
        <div className="stat-card" style={{ "--kpi-color": T.accent }}>
          <div className="stat-val" style={{color: T.accent}}>{inr(totalComm)}</div>
          <div className="stat-lbl">Commission This Month</div>
        </div>
      </div>

      <div className="g2">
        <div className="card">
          <div className="card-head"><span className="card-head-title">📦 Product Snapshot</span><span className="badge badge-ink">{fmtMonth(todayStr())}</span></div>
          <div style={{overflowX:"auto"}}>
            <table className="tbl">
              <thead><tr><th>Product</th><th>Current Rate</th><th>Sold Qty</th><th>Revenue</th><th>Commission</th></tr></thead>
              <tbody>
                {productBreakdown.map(p=>(
                  <tr key={p.id}>
                    <td style={{fontWeight:600}}>{p.short}</td>
                    <td style={{color:T.inkLight}}>{inr(p.rate)}</td>
                    <td style={{fontWeight:600}}>{p.qty}</td>
                    <td style={{color:T.success, fontWeight:600}}>{inr(p.revenue)}</td>
                    <td style={{color:T.accent, fontWeight:600}}>{inr(p.qty*p.comm)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <div className="card-head"><span className="card-head-title">📅 Recent Days</span></div>
          <div style={{overflowX:"auto"}}>
            <table className="tbl">
              <thead><tr><th>Date</th><th>Sales</th><th>Cylinders</th><th>Cash on Hand</th></tr></thead>
              <tbody>
                {[...entries].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,6).map(e=>{
                  const c = calcEntry(e);
                  const cyl = e.products.reduce((s,p)=>s+num(p.sell),0);
                  return (
                    <tr key={e.date}>
                      <td style={{color:T.inkLight,whiteSpace:"nowrap"}}>{fmtDate(e.date)}</td>
                      <td style={{color:T.success,fontWeight:600}}>{inr(c.totalSales)}</td>
                      <td style={{fontWeight:600}}>{cyl}</td>
                      <td style={{color:c.cashOnHand<0?T.danger:T.ink,fontWeight:700}}>{inr(c.cashOnHand)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function AdminPriceHistory({ prices, setPrices }) {
  const [selProd, setSelProd] = useState("p14");
  const [form, setForm] = useState({ date: todayStr(), rate: "", note: "" });
  const [saved, setSaved] = useState(false);

  const add = async () => {
    if (!form.rate) return;
    const rec = { id: uid(), productId: selProd, rate: num(form.rate), date: form.date, note: form.note };
    const updated = [...prices, rec];
    await api.syncPrices(updated);
    setPrices(updated);
    setForm({ date: todayStr(), rate: "", note: "" });
    setSaved(true); setTimeout(() => setSaved(false), 2000);
  };

  const del = async (id) => {
    if (!window.confirm("Delete this record?")) return;
    const updated = prices.filter(p => p.id !== id);
    await api.syncPrices(updated);
    setPrices(updated);
  };

  const filtered = prices.filter(p => p.productId === selProd).sort((a,b) => b.date.localeCompare(a.date));

  return (
    <div className="fade-in">
      {saved && <div className="alert alert-success">✅ Rate saved! New daily entries will use this rate.</div>}
      <div className="stat-row">
        {PRODUCTS.map(p => {
          const cr = getCurrentRate(p.id, prices);
          return (
            <div key={p.id} className="stat-card" style={{ "--kpi-color": selProd===p.id?T.accent:T.border, cursor:"pointer", borderColor: selProd===p.id?T.accent:T.border }} onClick={()=>setSelProd(p.id)}>
              <div className="stat-lbl">{p.short}</div>
              <div className="stat-val">{inr(cr)}</div>
              <div style={{fontSize:10, color:T.inkLight}}>{prices.find(x=>x.productId===p.id) ? "Custom Rate" : "Default Rate"}</div>
            </div>
          );
        })}
      </div>

      <div className="g2">
        <div className="card">
          <div className="card-head"><span className="card-head-title">➕ Add New Rate</span></div>
          <div className="card-body">
            <div className="field"><label>Product</label><select className="inp" value={selProd} onChange={e=>setSelProd(e.target.value)}>{PRODUCTS.map(p=><option key={p.id} value={p.id}>{p.label}</option>)}</select></div>
            <div className="field"><label>Effective Date</label><input className="inp" type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})} /></div>
            <div className="field"><label>New Rate (₹ per cylinder)</label><input className="inp" type="number" placeholder="e.g. 906.50" value={form.rate} onChange={e=>setForm({...form,rate:e.target.value})} /></div>
            <div className="field"><label>Note / Reason</label><input className="inp" type="text" placeholder="Price revision…" value={form.note} onChange={e=>setForm({...form,note:e.target.value})} /></div>
            <button className="btn-primary" style={{width:"100%", marginTop: 8}} onClick={add}>Save Rate Change</button>
          </div>
        </div>
        <div className="card">
          <div className="card-head"><span className="card-head-title">📜 Rate History</span></div>
          <div style={{overflowX:"auto"}}>
            <table className="tbl">
              <thead><tr><th>Date</th><th>Rate (₹)</th><th>Note</th><th></th></tr></thead>
              <tbody>
                {filtered.length===0 && <tr><td colSpan={4} style={{textAlign:"center",padding:24,color:T.inkLight}}>No custom rates set for this product.</td></tr>}
                {filtered.map(p=>(
                  <tr key={p.id}>
                    <td style={{color:T.inkMid,whiteSpace:"nowrap"}}>{fmtDate(p.date)}</td>
                    <td style={{fontWeight:700}}>{inr(p.rate)}</td>
                    <td style={{color:T.inkLight,fontSize:11}}>{p.note||"-"}</td>
                    <td><button className="btn-icon" onClick={()=>del(p.id)}>×</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function AdminCommission({ commissions, setCommissions }) {
  const [selProd, setSelProd] = useState("p14");
  const [form, setForm] = useState({ date: todayStr(), perCyl: "", note: "" });
  const [saved, setSaved] = useState(false);

  const add = async () => {
    if (!form.perCyl) return;
    const rec = { id: uid(), productId: selProd, perCyl: num(form.perCyl), date: form.date, note: form.note };
    const updated = [...commissions, rec];
    await api.syncCommissions(updated);
    setCommissions(updated);
    setForm({ date: todayStr(), perCyl: "", note: "" });
    setSaved(true); setTimeout(() => setSaved(false), 2000);
  };
  const del = async (id) => { 
    if (!window.confirm("Delete this record?")) return;
    const updated = commissions.filter(c=>c.id!==id); 
    await api.syncCommissions(updated); 
    setCommissions(updated); 
  };
  const filtered = commissions.filter(c=>c.productId===selProd).sort((a,b)=>b.date.localeCompare(a.date));

  return (
    <div className="fade-in">
      {saved && <div className="alert alert-success">✅ Commission rate saved!</div>}
      <div className="stat-row">
        {PRODUCTS.map(p => {
          const cc = getCommRate(p.id, commissions);
          return (
            <div key={p.id} className="stat-card" style={{ "--kpi-color": selProd===p.id?T.accent:T.border, cursor:"pointer", borderColor: selProd===p.id?T.accent:T.border }} onClick={()=>setSelProd(p.id)}>
              <div className="stat-lbl">{p.short}</div>
              <div className="stat-val">₹{cc}/cyl</div>
              <div style={{fontSize:10, color:T.inkLight}}>{cc>0 ? "Active Commission" : "No Commission"}</div>
            </div>
          );
        })}
      </div>
      <div className="g2">
        <div className="card">
          <div className="card-head"><span className="card-head-title">➕ Set Commission</span></div>
          <div className="card-body">
            <div className="field"><label>Product</label><select className="inp" value={selProd} onChange={e=>setSelProd(e.target.value)}>{PRODUCTS.map(p=><option key={p.id} value={p.id}>{p.label}</option>)}</select></div>
            <div className="field"><label>Effective Date</label><input className="inp" type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})} /></div>
            <div className="field"><label>Commission (₹/cyl)</label><input className="inp" type="number" placeholder="e.g. 25" value={form.perCyl} onChange={e=>setForm({...form,perCyl:e.target.value})} /></div>
            <div className="field"><label>Note</label><input className="inp" type="text" placeholder="Reason…" value={form.note} onChange={e=>setForm({...form,note:e.target.value})} /></div>
            <button className="btn-primary" style={{width:"100%", marginTop: 8}} onClick={add}>Save Commission</button>
          </div>
        </div>
        <div className="card">
          <div className="card-head"><span className="card-head-title">📜 Commission History</span></div>
          <div style={{overflowX:"auto"}}>
            <table className="tbl">
              <thead><tr><th>Date</th><th>Per Cyl (₹)</th><th>Note</th><th></th></tr></thead>
              <tbody>
                {filtered.length===0 && <tr><td colSpan={4} style={{textAlign:"center",padding:24,color:T.inkLight}}>No commission history.</td></tr>}
                {filtered.map(c=>(
                  <tr key={c.id}>
                    <td style={{color:T.inkMid,whiteSpace:"nowrap"}}>{fmtDate(c.date)}</td>
                    <td style={{fontWeight:700}}>₹{c.perCyl}</td>
                    <td style={{color:T.inkLight,fontSize:11}}>{c.note||"-"}</td>
                    <td><button className="btn-icon" onClick={()=>del(c.id)}>×</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function AdminDayReports({ entries, commissions }) {
  const sorted = [...entries].sort((a,b)=>b.date.localeCompare(a.date));
  const [selDate, setSelDate] = useState(sorted[0]?.date || todayStr());
  const entry = entries.find(e=>e.date===selDate);

  return (
    <div className="fade-in">
      <div style={{marginBottom: 16}}>
        <select className="inp" value={selDate} onChange={e=>setSelDate(e.target.value)} style={{maxWidth: 300}}>
          {sorted.length===0 && <option>No entries</option>}
          {sorted.map(e=><option key={e.date} value={e.date}>{fmtDate(e.date)}</option>)}
        </select>
      </div>

      {!entry ? (
        <div className="card"><div className="card-body" style={{textAlign:"center",padding:40,color:T.inkLight}}>No entry found for this date.</div></div>
      ) : (
        <AdminDayDetail entry={entry} commissions={commissions} />
      )}
    </div>
  );
}

function AdminDayDetail({ entry, commissions }) {
  const calcs = calcEntry(entry);
  const totalCyl = entry.products.reduce((s,p)=>s+num(p.sell),0);
  const totalComm = entry.products.reduce((s,p)=>s+num(p.sell)*getCommRate(p.id, commissions, entry.date),0);

  return (
    <div>
      <div className="stat-row">
        <div className="stat-card" style={{ "--kpi-color": T.success }}><div className="stat-val" style={{color:T.success}}>{inr(calcs.totalSales)}</div><div className="stat-lbl">Total Sales</div></div>
        <div className="stat-card" style={{ "--kpi-color": calcs.cashOnHand<0?T.danger:T.ink }}><div className="stat-val" style={{color:calcs.cashOnHand<0?T.danger:T.ink}}>{inr(calcs.cashOnHand)}</div><div className="stat-lbl">Cash on Hand</div></div>
        <div className="stat-card" style={{ "--kpi-color": T.blue }}><div className="stat-val" style={{color:T.blue}}>{totalCyl}</div><div className="stat-lbl">Cylinders Sold</div></div>
        <div className="stat-card" style={{ "--kpi-color": T.accent }}><div className="stat-val" style={{color:T.accent}}>{inr(totalComm)}</div><div className="stat-lbl">Commission Earned</div></div>
      </div>

      <div className="card">
        <div className="card-head"><span className="card-head-title">🛢️ Products Sold</span></div>
        <div style={{overflowX:"auto"}}>
          <table className="tbl">
            <thead><tr><th>Product</th><th>Sold</th><th>Rate</th><th>Revenue</th><th>Commission</th></tr></thead>
            <tbody>
              {entry.products.map((p,i)=>{
                const rev = num(p.sell)*num(p.rate);
                const comm = num(p.sell)*getCommRate(p.id, commissions, entry.date);
                return (
                  <tr key={p.id}>
                    <td style={{fontWeight:600}}>{PRODUCTS[i].short}</td>
                    <td style={{fontWeight:600}}>{num(p.sell)||"0"}</td>
                    <td style={{color:T.inkLight}}>{inr(p.rate)}</td>
                    <td style={{color:T.success,fontWeight:600}}>{inr(rev)}</td>
                    <td style={{color:T.accent,fontWeight:600}}>{inr(comm)}</td>
                  </tr>
                );
              })}
              <tr className="tbl-total">
                <td colSpan={3} style={{textTransform:"uppercase", fontSize: 11}}>Total</td>
                <td style={{color:T.success, fontSize: 14}}>{inr(calcs.totalSales)}</td>
                <td style={{color:T.accent, fontSize: 14}}>{inr(totalComm)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="g2">
        <div className="card">
          <div className="card-head"><span className="card-head-title">💰 Financials</span></div>
          <div className="card-body">
            <div style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid #eee"}}><span style={{fontSize:12,color:T.inkMid}}>Opening Cash</span><span style={{fontWeight:600}}>{inr(entry.openingCash)}</span></div>
            <div style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid #eee"}}><span style={{fontSize:12,color:T.inkMid}}>Total Sales</span><span style={{fontWeight:600,color:T.success}}>+{inr(calcs.totalSales)}</span></div>
            <div style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid #eee"}}><span style={{fontSize:12,color:T.inkMid}}>Expenses</span><span style={{fontWeight:600,color:T.danger}}>-{inr(calcs.totalExpenses)}</span></div>
            <div style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid #eee"}}><span style={{fontSize:12,color:T.inkMid}}>Cheque/Online</span><span style={{fontWeight:600,color:T.blue}}>-{inr(calcs.totalCheque)}</span></div>
            <div style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid #eee"}}><span style={{fontSize:12,color:T.inkMid}}>Credit Sales</span><span style={{fontWeight:600,color:T.danger}}>-{inr(calcs.totalCredit)}</span></div>
            <div style={{display:"flex",justifyContent:"space-between",padding:"12px 0 4px",marginTop:8,borderTop:"2px solid #ccc"}}><span style={{fontSize:12,fontWeight:700,color:T.inkMid}}>CASH ON HAND</span><span style={{fontFamily:"'Fraunces',serif",fontSize:20,fontWeight:700,color:calcs.cashOnHand<0?T.danger:T.success}}>{inr(calcs.cashOnHand)}</span></div>
          </div>
        </div>
        
        <div style={{display:"flex", flexDirection:"column", gap: 14}}>
          <div className="card">
            <div className="card-head"><span className="card-head-title">🧾 Expenses</span><span style={{fontWeight:700,color:T.danger}}>{inr(calcs.totalExpenses)}</span></div>
            <div style={{overflowX:"auto"}}>
              <table className="tbl">
                <thead><tr><th>Desc</th><th>Amount</th></tr></thead>
                <tbody>
                  {(entry.expenses||[]).filter(x=>x.desc||x.amt).map(x=><tr key={x.id}><td style={{color:T.inkMid}}>{x.desc}</td><td style={{fontWeight:600,color:T.danger}}>{inr(x.amt)}</td></tr>)}
                  {!(entry.expenses||[]).some(x=>x.desc||x.amt) && <tr><td colSpan={2} style={{textAlign:"center",padding:10,color:T.inkLight}}>No expenses</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AdminCreditOverview({ pending }) {
  const [filter, setFilter] = useState("all");
  const outstanding = pending.filter(p=>!p.cleared).reduce((s,p)=>s+(p.originalAmt-p.recovered),0);
  const recovered   = pending.reduce((s,p)=>s+p.recovered,0);
  const total       = pending.reduce((s,p)=>s+p.originalAmt,0);

  const byCustomer = {};
  pending.forEach(p=>{
    if (!byCustomer[p.customerName]) byCustomer[p.customerName]={name:p.customerName,entries:[],total:0,recovered:0};
    byCustomer[p.customerName].entries.push(p);
    byCustomer[p.customerName].total     += p.originalAmt;
    byCustomer[p.customerName].recovered += p.recovered;
  });

  const customers = Object.values(byCustomer)
    .filter(c => filter==="all" ? true : filter==="pending" ? (c.total-c.recovered)>0 : (c.total-c.recovered)<=0)
    .sort((a,b)=>(b.total-b.recovered)-(a.total-a.recovered));

  return (
    <div className="fade-in">
      <div className="stat-row">
        <div className="stat-card" style={{ "--kpi-color": T.danger }}><div className="stat-val" style={{color:T.danger}}>{inr(outstanding)}</div><div className="stat-lbl">Outstanding</div></div>
        <div className="stat-card" style={{ "--kpi-color": T.success }}><div className="stat-val" style={{color:T.success}}>{inr(recovered)}</div><div className="stat-lbl">Recovered</div></div>
        <div className="stat-card" style={{ "--kpi-color": T.blue }}><div className="stat-val" style={{color:T.blue}}>{inr(total)}</div><div className="stat-lbl">Total Credit Given</div></div>
      </div>

      <div className="period-row">
        {[["all","All Customers"],["pending","Pending"],["cleared","Cleared"]].map(([v,l])=>(
          <button key={v} className="btn-ghost" style={{background:filter===v?T.accent:"transparent",color:filter===v?"#fff":T.inkMid,borderColor:filter===v?T.accent:T.border}} onClick={()=>setFilter(v)}>{l}</button>
        ))}
      </div>

      <div className="card">
        <div style={{overflowX:"auto"}}>
          <table className="tbl">
            <thead><tr><th>Customer</th><th>Txns</th><th>Total Credit</th><th>Recovered</th><th>Outstanding</th><th>Status</th></tr></thead>
            <tbody>
              {customers.length===0 && <tr><td colSpan={6} style={{textAlign:"center",padding:32,color:T.inkLight}}>No records.</td></tr>}
              {customers.map(c=>{
                const due = c.total-c.recovered;
                return (
                  <tr key={c.name}>
                    <td style={{fontWeight:700}}>{c.name}</td>
                    <td style={{color:T.inkMid}}>{c.entries.length}</td>
                    <td style={{fontWeight:600}}>{inr(c.total)}</td>
                    <td style={{color:T.success,fontWeight:600}}>{inr(c.recovered)}</td>
                    <td style={{color:due>0?T.danger:T.success,fontWeight:700}}>{inr(due)}</td>
                    <td><span className={`badge ${due<=0?"badge-success":"badge-danger"}`}>{due<=0?"CLEARED":"PENDING"}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function AdminDeliveryBoys({ deliveryBoys, setDeliveryBoys }) {
  const [newBoy, setNewBoy] = useState("");

  const addBoy = async () => {
    const trimmed = newBoy.trim().toUpperCase();
    if (!trimmed || deliveryBoys.includes(trimmed)) return;
    const updated = [...deliveryBoys, trimmed];
    await api.syncBoys(updated);
    setDeliveryBoys(updated);
    setNewBoy("");
  };

  const removeBoy = async (boyName) => {
    if (!window.confirm(`Remove ${boyName}?`)) return;
    const updated = deliveryBoys.filter(b => b !== boyName);
    await api.syncBoys(updated);
    setDeliveryBoys(updated);
  };

  const editBoy = async (oldName) => {
    const newName = window.prompt(`Rename ${oldName} to:`, oldName);
    if (!newName) return;
    const trimmed = newName.trim().toUpperCase();
    if (!trimmed || trimmed === oldName) return;
    if (deliveryBoys.includes(trimmed)) {
      window.alert("Name already exists!");
      return;
    }
    const updated = deliveryBoys.map(b => b === oldName ? trimmed : b);
    await api.syncBoys(updated);
    setDeliveryBoys(updated);
  };

  const moveBoy = async (index, dir) => {
    if (index + dir < 0 || index + dir >= deliveryBoys.length) return;
    const updated = [...deliveryBoys];
    const temp = updated[index];
    updated[index] = updated[index + dir];
    updated[index + dir] = temp;
    await api.syncBoys(updated);
    setDeliveryBoys(updated);
  };

  return (
    <div className="fade-in g2">
      <div className="card">
        <div className="card-head"><span className="card-head-title">➕ Add Delivery Boy</span></div>
        <div className="card-body">
          <div className="field"><label>Name</label><input className="inp" type="text" placeholder="e.g. RAMESH" value={newBoy} onChange={(e)=>setNewBoy(e.target.value)} /></div>
          <button className="btn-primary" style={{width:"100%", marginTop: 8}} onClick={addBoy}>Add</button>
        </div>
      </div>
      <div className="card">
        <div className="card-head"><span className="card-head-title">🚚 Manage Delivery Boys</span></div>
        <div style={{overflowX:"auto"}}>
          <table className="tbl">
            <thead><tr><th>Name</th><th style={{width:100}}>Order</th><th style={{width:120}}>Action</th></tr></thead>
            <tbody>
              {deliveryBoys.map((b, i) => (
                <tr key={b}>
                  <td style={{fontWeight:600}}>{b}</td>
                  <td>
                    <button className="btn-icon" style={{display:"inline-flex",marginRight:4}} onClick={()=>moveBoy(i, -1)}>↑</button>
                    <button className="btn-icon" style={{display:"inline-flex"}} onClick={()=>moveBoy(i, 1)}>↓</button>
                  </td>
                  <td>
                    <div style={{display:"flex", gap: 6}}>
                      <button className="btn-ghost" style={{padding: "4px 8px", fontSize: 10}} onClick={()=>editBoy(b)}>Edit</button>
                      <button className="btn-danger" style={{padding: "4px 8px", fontSize: 10}} onClick={()=>removeBoy(b)}>Remove</button>
                    </div>
                  </td>
                </tr>
              ))}
              {deliveryBoys.length === 0 && <tr><td colSpan={3} style={{textAlign:"center",padding:24,color:T.inkLight}}>No delivery boys.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
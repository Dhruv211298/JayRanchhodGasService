export const PRODUCTS = [
  { id: "p14", label: "14 KG  (5350–5370)", short: "14 KG", sku: "5350–5370", fallbackRate: 906.5, fallbackSbc: 0, fallbackDbc: 0 },
  { id: "p19", label: "19 KG  (5400)", short: "19 KG", sku: "5400", fallbackRate: 1950, fallbackSbc: 0, fallbackDbc: 0 },
  { id: "p5", label: "FLT 5 KG", short: "5 KG", sku: "FLT", fallbackRate: 564.5, fallbackSbc: 0, fallbackDbc: 0 },
];
export const ACCESSORIES = [
  { id: "pipe", label: "Gas Pipe", short: "Pipe", fallbackRate: 150 },
  { id: "stove", label: "Gas Stove", short: "Stove", fallbackRate: 1500 },
];
export const DEFAULT_BOYS = ["OFFICE", "CHIRAG / JAYESH", "ARPIT / MAYUR", "CHOTUKAKA / BHAGO"];
export const ADMIN_PW = "admin123";

export const todayStr = () => new Date().toISOString().slice(0, 10);

// Returns the salary month: if today is 1st–10th, use previous month; else current month.
export const getSalaryMonth = () => {
  const now = new Date();
  if (now.getDate() <= 10) {
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return prev.toISOString().slice(0, 7);
  }
  return now.toISOString().slice(0, 7);
};
export const fmtDate = (d) => new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
const _MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
export const fmtMonth = (d) => { const dt = new Date(d + "T00:00:00"); return `${_MONTHS[dt.getMonth()]} ${dt.getFullYear()}`; };
export const num = (v) => parseFloat(v) || 0;
export const inr = (v) => "₹" + num(v).toLocaleString("en-IN", { minimumFractionDigits: 0 });
export const uid = () => Math.random().toString(36).slice(2, 9);

export const getCurrentRate = (pid, pricesArr) => {
  const hist = (pricesArr || []).filter(x => x.productId === pid).sort((a,b) => b.date.localeCompare(a.date));
  if (hist.length > 0) return num(hist[0].rate);
  const p = [...PRODUCTS, ...ACCESSORIES].find(p=>p.id===pid);
  return p ? p.fallbackRate : 0;
};

export const getSbcRate = (pid, pricesArr) => {
  const hist = (pricesArr || []).filter(x => x.productId === pid).sort((a,b) => b.date.localeCompare(a.date));
  if (hist.length > 0 && hist[0].sbcRate !== undefined) return num(hist[0].sbcRate);
  const p = PRODUCTS.find(p=>p.id===pid);
  return p ? p.fallbackSbc : 0;
};

export const getDbcRate = (pid, pricesArr) => {
  const hist = (pricesArr || []).filter(x => x.productId === pid).sort((a,b) => b.date.localeCompare(a.date));
  if (hist.length > 0 && hist[0].dbcRate !== undefined) return num(hist[0].dbcRate);
  const p = PRODUCTS.find(p=>p.id===pid);
  return p ? p.fallbackDbc : 0;
};

export const getCommRate = (pid, commArr, upToDate = "9999-99-99") => {
  const hist = (commArr || []).filter(x => x.productId === pid && x.date <= upToDate).sort((a,b) => b.date.localeCompare(a.date));
  return hist[0] ? num(hist[0].perCyl) : 0;
};

/* ── calculations ── */
export const calcEntry = (e) => {
  const originalCashSales = (e.products||[]).reduce((s, p) => {
    const sell = num(p.sell);
    const sbc = num(p.sbc);
    const dbc = num(p.dbc);
    const rate = num(p.rate);
    const sbcRate = num(p.sbcRate);
    const dbcRate = num(p.dbcRate);
    return s + (sell * rate) + (sbc * sbcRate) + (dbc * dbcRate);
  }, 0);
  const totalOnlineSales = (e.products||[]).reduce((s, p) => {
    const online = num(p.online || 0);
    const rate = num(p.rate);
    return s + (online * rate);
  }, 0);
  const totalAccessorySales = (e.accessories||[]).filter(a=>a.sold).reduce((s, a) => s + num(a.qty) * num(a.rate), 0);
  const totalDelivery = Object.values(e.delivery||{}).reduce((s, val) => {
    if (typeof val === 'object' && val !== null) {
      return s + num(val.cash) + num(val.online);
    }
    return s + num(val);
  }, 0);
  const totalExpenses = (e.expenses||[]).reduce((s, x) => s + num(x.amt), 0);
  const totalCheque = (e.chequeOnline||[]).reduce((s, x) => s + num(x.amt), 0);
  const originalCredit = (e.creditSales||[]).reduce((s, x) => s + num(x.amt), 0);
  const totalVehicleExp = (e.vehicleExpenses||[]).reduce((s, x) => s + num(x.amt), 0);
  const totalSalaryPayments = (e.salaryPayments||[]).reduce((s, x) => s + num(x.amt), 0);
  const totalCreditRecoveries = (e.creditRecoveries||[]).reduce((s, x) => s + num(x.amt), 0);
  // Identify same-day payments (recoveries received today for credit sales created today)
  const sameDayPayments = (e.creditRecoveries||[]).reduce((s, x) => {
    const isSameDay = x.ledgerId && e.date && x.ledgerId.startsWith(e.date + '-');
    return s + (isSameDay ? num(x.amt) : 0);
  }, 0);

  // Adjust Credit Sales by sameDayPayments so that cleared same-day credit is 0, keeping Cash Sales unadjusted to match physical cash
  const totalCashSales = originalCashSales;
  const totalCredit = Math.max(0, originalCredit - sameDayPayments);
  const totalSales = totalCashSales + totalOnlineSales;
  const originalSales = originalCashSales + totalOnlineSales;

  // Cash on Hand: Opening + Total Sales (Cash+Online) + Accessories + Credit Returns - OnlineAutoDeduction - Expenses - Credit - Vehicle - Salary - BOB Bank
  const cashOnHand = num(e.openingCash) + totalSales + totalAccessorySales + totalCreditRecoveries - totalOnlineSales - totalExpenses - totalCredit - totalVehicleExp - totalSalaryPayments - num(e.bob);
  return { totalSales, totalCashSales, totalOnlineSales, totalAccessorySales, totalDelivery, totalExpenses, totalCheque, totalCredit, totalVehicleExp, totalSalaryPayments, totalCreditRecoveries, cashOnHand, originalCashSales, originalSales, sameDayPayments, originalCredit };
};

/* ── blank templates ── */
export const blankProduct = (pricesArr, lastEntry = null) => PRODUCTS.map((p) => {
  // Opening stock = previous day's Products Stock & Sales (In-Out Stock Master) Closing Stock
  let prevInOutFull = "";
  if (lastEntry) {
    const prevP = (lastEntry.products || []).find(x => x.id === p.id);
    if (prevP && prevP.closingStock !== "") prevInOutFull = prevP.closingStock;
  }
  return { 
    id: p.id, 
    openingStock: prevInOutFull, 
    rate: getCurrentRate(p.id, pricesArr), 
    sbcRate: getSbcRate(p.id, pricesArr),
    dbcRate: getDbcRate(p.id, pricesArr),
    sell: "", 
    online: "",
    sbc: "", 
    dbc: "", 
    closingStock: "",
    remarks: ""
  };
});
export const blankDelivery = (boysArr) => Object.fromEntries((boysArr || DEFAULT_BOYS).map((b) => [b, { cash: "", online: "" }]));
export const blankExpense = () => ({ id: uid(), desc: "", amt: "" });
export const blankCheque = () => ({ id: uid(), desc: "", amt: "" });
export const blankCredit = () => ({ id: uid(), customerName: "", amt: "" });
export const blankVehicleExp = () => ({ id: uid(), vehicleId: "", vehicleNo: "", expType: "Fuel", desc: "", amt: "" });
export const blankSalaryPayment = () => ({ id: uid(), employeeId: "", employeeName: "", amt: "", type: "Salary", notes: "", forMonth: new Date().toISOString().slice(0, 7) });
export const blankArrival = () => PRODUCTS.map(p => ({ productId: p.id, filledReceived: "", emptyReturned: "" }));
export const blankAccessory = (pricesArr) => ACCESSORIES.map(a => ({ accessoryId: a.id, sold: false, qty: "", rate: getCurrentRate(a.id, pricesArr) }));

export const blankGodownStock = (lastEntry = null) => PRODUCTS.map(p => {
  if (!lastEntry) return { productId: p.id, filled: "", empty: "" };
  // The godownStock values saved in the DB are already the end-of-day (closing) stock
  // the user physically entered. So today's opening = yesterday's closing directly.
  const g = (lastEntry.godownStock || []).find(x => x.productId === p.id) || {};
  return { 
    productId: p.id, 
    filled: g.filled !== undefined && g.filled !== "" ? g.filled : "", 
    empty: g.empty !== undefined && g.empty !== "" ? g.empty : "" 
  };
});

export const blankEntry = (pricesArr = [], boysArr = [], lastEntry = null) => ({
  date: todayStr(),
  openingCash: lastEntry ? calcEntry(lastEntry).cashOnHand : "",
  bob: "",
  products: blankProduct(pricesArr, lastEntry),
  delivery: blankDelivery(boysArr),
  expenses: [blankExpense()],
  chequeOnline: [blankCheque()],
  creditSales: [blankCredit()],
  vehicleExpenses: [blankVehicleExp()],
  salaryPayments: [blankSalaryPayment()],
  creditRecoveries: [],
  godownStock: blankGodownStock(lastEntry),
  hasArrival: false,
  arrivals: blankArrival(),
  accessories: blankAccessory(pricesArr),
});

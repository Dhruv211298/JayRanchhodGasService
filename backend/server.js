const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'jrgs-super-secret-jwt-key-2024-change-in-prod';
const JWT_EXPIRES_IN = '1h'; // Session duration: 1 hour

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

/* ════════════════════════════════════════════════════════════════
   JWT AUTH MIDDLEWARE
   Verifies Bearer token on every protected route.
   Sets req.user = { username, role } on success.
════════════════════════════════════════════════════════════════ */
function verifyToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided. Please log in.' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // { username, role, iat, exp }
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Session expired. Please log in again.', expired: true });
    }
    return res.status(401).json({ error: 'Invalid token. Please log in again.' });
  }
}

// Database connection pool
const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'jay_ranchhod_gas_agency',
  port: process.env.DB_PORT ? parseInt(process.env.DB_PORT) : 3306,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  dateStrings: true,
  connectAttributes: { program_name: 'gas-agency' }
});

// Set SQL mode on every new connection to disable ANSI_QUOTES.
// This ensures double-quoted values are NOT treated as identifiers on Aiven/cloud MySQL.
// NOTE: initializationQuery is NOT supported by mysql2 — this pool event is the correct approach.
pool.on('connection', (connection) => {
  connection.query(
    "SET sql_mode = 'STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION'",
    (err) => { if (err) console.error('Failed to set sql_mode on connection:', err.message); }
  );
});

// Helper: safe number
const num = (v) => parseFloat(v) || 0;

// Auto-migration: add for_month column to employee_payments if missing.
// Uses SHOW COLUMNS check for compatibility with all MySQL 8.x versions.
async function runMigrations() {
  // Migration 1: for_month column on employee_payments
  try {
    const [cols] = await pool.query("SHOW COLUMNS FROM employee_payments LIKE 'for_month'");
    if (cols.length === 0) {
      await pool.query("ALTER TABLE employee_payments ADD COLUMN for_month VARCHAR(7) NULL COMMENT 'YYYY-MM salary month'");
      console.log('Migration: added for_month column to employee_payments');
    }
  } catch (e) {
    console.warn('Migration warning (non-fatal):', e.message);
  }

  // Migration 2: product_id, filled_qty, empty_qty, remarks on credit_ledger
  try {
    const [clCols] = await pool.query("SHOW COLUMNS FROM credit_ledger LIKE 'product_id'");
    if (clCols.length === 0) {
      await pool.query("ALTER TABLE credit_ledger ADD COLUMN product_id VARCHAR(50) NULL COMMENT 'p14/p19/p5'");
      await pool.query("ALTER TABLE credit_ledger ADD COLUMN filled_qty INT DEFAULT 0 COMMENT 'Filled cylinders taken on credit'");
      await pool.query("ALTER TABLE credit_ledger ADD COLUMN empty_qty INT DEFAULT 0 COMMENT 'Empty cylinders returned against credit'");
      await pool.query("ALTER TABLE credit_ledger ADD COLUMN remarks VARCHAR(255) DEFAULT '' COMMENT 'Optional note'");
      console.log('Migration: added product_id, filled_qty, empty_qty, remarks to credit_ledger');
    }
  } catch (e) {
    console.warn('Migration credit_ledger warning (non-fatal):', e.message);
  }

  // Migration 3: empty_returned on credit_payments
  try {
    const [cpCols] = await pool.query("SHOW COLUMNS FROM credit_payments LIKE 'empty_returned'");
    if (cpCols.length === 0) {
      await pool.query("ALTER TABLE credit_payments ADD COLUMN empty_returned INT DEFAULT 0 COMMENT 'Empty cylinders returned in this payment'");
      console.log('Migration: added empty_returned to credit_payments');
    }
  } catch (e) {
    console.warn('Migration credit_payments warning (non-fatal):', e.message);
  }

  // Migration 4: daily_other_cash_credits table
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS daily_other_cash_credits (
        id VARCHAR(20) NOT NULL PRIMARY KEY,
        entry_date DATE NOT NULL,
        description VARCHAR(255) NOT NULL DEFAULT '',
        amount DECIMAL(10,2) NOT NULL DEFAULT 0,
        INDEX idx_occ_date (entry_date)
      ) ENGINE=InnoDB
    `);
    console.log('Migration: ensured daily_other_cash_credits table exists');
  } catch (e) {
    console.warn('Migration daily_other_cash_credits warning (non-fatal):', e.message);
  }

  // Migration 5: shortage_qty column on daily_product_stock (informational reminder only)
  try {
    const [shrCols] = await pool.query("SHOW COLUMNS FROM daily_product_stock LIKE 'shortage_qty'");
    if (shrCols.length === 0) {
      await pool.query("ALTER TABLE daily_product_stock ADD COLUMN shortage_qty INT DEFAULT 0 COMMENT 'Shortage/Stolen reminder — informational only, does not affect stock calc'");
      console.log('Migration: added shortage_qty to daily_product_stock');
    }
  } catch (e) {
    console.warn('Migration shortage_qty warning (non-fatal):', e.message);
  }
}

/* ════════════════════════════════════════════════════════════════
   1. MASTER LOAD ENDPOINT (Replaces initial dbGet Promise.all)
════════════════════════════════════════════════════════════════ */
app.get('/api/load', verifyToken, async (req, res) => {
  try {
    // 1. Load Master Data
    const [productsRows] = await pool.query('SELECT id FROM products');
    const [pricesRows] = await pool.query(`SELECT id, product_id as productId, DATE_FORMAT(effective_date, '%Y-%m-%d') as date, rate, sbc_rate as sbcRate, dbc_rate as dbcRate, note FROM price_history`);
    
    // 2. Load Commissions
    const [commRows] = await pool.query(`SELECT id, product_id as productId, DATE_FORMAT(effective_date, '%Y-%m-%d') as date, per_cyl_rate as perCyl, note FROM commission_history`);
    
    // 3. Load Employees (for dropdowns)
    const [empRows] = await pool.query('SELECT id, name, role, salary FROM employees WHERE is_active = 1 ORDER BY name ASC');
    const employees = empRows.map(e => ({ id: e.id, name: e.name, role: e.role, salary: e.salary }));
    const boys = empRows.filter(e => e.role === "Delivery Boy").map(e => e.name);

    // 4. Load Active Vehicles
    const [vehicleRows] = await pool.query('SELECT id, vehicle_no, type, capacity FROM vehicles WHERE is_active = 1 ORDER BY sort_order ASC, id ASC');
    
    // 5. Load Pending Credits
    const [ledgerRows] = await pool.query(`SELECT id, DATE_FORMAT(entry_date, '%Y-%m-%d') as date, customer_name as customerName, original_amount as originalAmt, cleared, COALESCE(product_id, '') as productId, COALESCE(filled_qty, 0) as filledQty, COALESCE(empty_qty, 0) as emptyQty, COALESCE(remarks, '') as remarks FROM credit_ledger`);
    const [paymentRows] = await pool.query(`
      SELECT p.ledger_id, DATE_FORMAT(p.payment_date, '%Y-%m-%d') as date, p.amount as amt, p.note, COALESCE(p.empty_returned, 0) as emptyReturned, l.customer_name as customerName, COALESCE(l.product_id, 'p14') as productId
      FROM credit_payments p 
      LEFT JOIN credit_ledger l ON p.ledger_id = l.id
    `);
    
    const pending = ledgerRows.map(l => {
      const payments = paymentRows.filter(p => p.ledger_id === l.id).map(p => ({ date: p.date, amt: num(p.amt), note: p.note, emptyReturned: num(p.emptyReturned) }));
      const recovered = payments.reduce((sum, p) => sum + num(p.amt), 0);
      return {
        id: l.id,
        date: l.date,
        customerName: l.customerName,
        originalAmt: num(l.originalAmt),
        recovered,
        cleared: l.cleared === 1 || recovered >= num(l.originalAmt),
        payments,
        productId: l.productId || '',
        filledQty: num(l.filledQty),
        emptyQty: num(l.emptyQty),
        remarks: l.remarks || ''
      };
    });

    // 6. Load Daily Entries
    const [entriesRows] = await pool.query(`SELECT DATE_FORMAT(entry_date, '%Y-%m-%d') as date, opening_cash as openingCash, bob_bank as bob, has_vehicle_arrival as hasArrival FROM daily_entries`);
    const [prodStockRows] = await pool.query(`SELECT DATE_FORMAT(entry_date, '%Y-%m-%d') as entry_date, product_id as id, opening_stock as openingStock, rate, sbc_rate as sbcRate, dbc_rate as dbcRate, sell_qty as sell, online_qty as online, sbc_qty as sbc, dbc_qty as dbc, closing_stock as closingStock, COALESCE(shortage_qty, 0) as shortage, remarks FROM daily_product_stock`);
    const [deliveryRows] = await pool.query(`SELECT d.cash_qty, d.online_qty, d.qty_delivered, DATE_FORMAT(d.entry_date, '%Y-%m-%d') as entry_date, b.name FROM daily_deliveries d JOIN employees b ON d.delivery_boy_id = b.id`);
    const [expRows] = await pool.query("SELECT id, DATE_FORMAT(entry_date, '%Y-%m-%d') as entry_date, description as `desc`, amount as amt FROM daily_expenses");
    const [chequeRows] = await pool.query("SELECT id, DATE_FORMAT(entry_date, '%Y-%m-%d') as entry_date, description as `desc`, amount as amt FROM daily_cheque_online");
    const [creditSalesRows] = await pool.query(`SELECT id, DATE_FORMAT(entry_date, '%Y-%m-%d') as entry_date, customer_name as customerName, original_amount as amt, COALESCE(product_id, '') as productId, COALESCE(filled_qty, 0) as filledQty, COALESCE(empty_qty, 0) as emptyQty, COALESCE(remarks, '') as remarks FROM credit_ledger`);
    const [vehExpRows] = await pool.query("SELECT dve.id, DATE_FORMAT(dve.entry_date, '%Y-%m-%d') as entry_date, dve.vehicle_id as vehicleId, COALESCE(v.vehicle_no, '') as vehicleNo, dve.expense_type as expType, dve.description as `desc`, dve.amount as amt FROM daily_vehicle_expenses dve LEFT JOIN vehicles v ON dve.vehicle_id = v.id");
    // Load salary payments — query for_month safely with a fallback
    let salPayRows = [];
    try {
      [salPayRows] = await pool.query(`SELECT sp.id, DATE_FORMAT(sp.entry_date, '%Y-%m-%d') as entry_date, sp.employee_id as employeeId, e.name as employeeName, sp.amount as amt, sp.type, sp.notes, sp.for_month as forMonth FROM employee_payments sp JOIN employees e ON sp.employee_id = e.id`);
    } catch (salErr) {
      // for_month column may not exist yet — fall back to query without it
      console.warn('Salary load fallback (for_month missing?):', salErr.message);
      [salPayRows] = await pool.query(`SELECT sp.id, DATE_FORMAT(sp.entry_date, '%Y-%m-%d') as entry_date, sp.employee_id as employeeId, e.name as employeeName, sp.amount as amt, sp.type, sp.notes FROM employee_payments sp JOIN employees e ON sp.employee_id = e.id`);
    }
    const [godownRows] = await pool.query("SELECT DATE_FORMAT(entry_date, '%Y-%m-%d') as entry_date, product_id as productId, filled_qty as `filled`, empty_qty as `empty` FROM godown_stock");
    const [arrivalRows] = await pool.query(`SELECT DATE_FORMAT(entry_date, '%Y-%m-%d') as entry_date, product_id as productId, filled_received as filledReceived, empty_returned as emptyReturned FROM vehicle_arrivals`);
    const [accRows] = await pool.query(`SELECT DATE_FORMAT(entry_date, '%Y-%m-%d') as entry_date, accessory_id as accessoryId, qty, rate FROM daily_accessory_sales`);
    const [occRows] = await pool.query("SELECT id, DATE_FORMAT(entry_date, '%Y-%m-%d') as entry_date, description as `desc`, amount as amt FROM daily_other_cash_credits");

    const entries = entriesRows.map(e => {
      const date = e.date;
      const products = prodStockRows.filter(p => p.entry_date === date).map(p => ({
        id: p.id,
        openingStock: p.openingStock || "",
        rate: p.rate || "",
        sbcRate: p.sbcRate || "",
        dbcRate: p.dbcRate || "",
        sell: p.sell || "",
        online: p.online || "",
        sbc: p.sbc || "",
        dbc: p.dbc || "",
        closingStock: p.closingStock || "",
        shortage: p.shortage || "",
        remarks: p.remarks || ""
      }));
      
      const delivery = {};
      deliveryRows.filter(d => d.entry_date === date).forEach(d => {
        delivery[d.name] = {
          cash: d.cash_qty || "",
          online: d.online_qty || ""
        };
      });
      
      const expenses = expRows.filter(x => x.entry_date === date).map(x => ({ id: x.id, desc: x.desc, amt: x.amt || "" }));
      const chequeOnline = chequeRows.filter(x => x.entry_date === date).map(x => ({ id: x.id, desc: x.desc, amt: x.amt || "" }));
      const creditSales = creditSalesRows.filter(x => x.entry_date === date).map(x => ({ id: x.id, customerName: x.customerName, amt: x.amt || "", productId: x.productId || "", filledQty: x.filledQty || "", emptyQty: x.emptyQty || "", remarks: x.remarks || "" }));
      const vehicleExpenses = vehExpRows.filter(x => x.entry_date === date).map(x => ({ id: x.id, vehicleId: x.vehicleId || '', vehicleNo: x.vehicleNo || '', expType: x.expType || 'Fuel', desc: x.desc || '', amt: x.amt || '' }));
      const salaryPayments = salPayRows.filter(x => x.entry_date === date).map(x => ({ id: x.id, employeeId: x.employeeId, employeeName: x.employeeName, amt: x.amt || "", type: x.type, notes: x.notes || "", forMonth: x.forMonth || null }));
      const creditRecoveries = paymentRows.filter(p => p.date === date).map(p => ({
        ledgerId: p.ledger_id,
        customerName: p.customerName || "UNKNOWN",
        productId: p.productId,
        amt: p.amt || "",
        note: p.note || "",
        emptyReturned: p.emptyReturned || 0
      }));

      const otherCashCredits = occRows.filter(x => x.entry_date === date).map(x => ({ id: x.id, desc: x.desc, amt: x.amt || "" }));

      return {
        date,
        openingCash: e.openingCash || "",
        bob: e.bob || "",
        products,
        delivery,
        expenses,
        chequeOnline,
        creditSales,
        vehicleExpenses,
        salaryPayments,
        creditRecoveries,
        otherCashCredits,
        godownStock: productsRows.map(p => {
          const row = godownRows.find(g => g.entry_date === date && g.productId === p.id);
          return { productId: p.id, filled: row ? row.filled : "", empty: row ? row.empty : "" };
        }),
        hasArrival: !!e.hasArrival,
        arrivals: productsRows.map(p => {
          const row = arrivalRows.find(a => a.entry_date === date && a.productId === p.id);
          return { productId: p.id, filledReceived: row ? row.filledReceived : "", emptyReturned: row ? row.emptyReturned : "" };
        }),
        accessories: ['pipe', 'stove'].map(pid => {
          const row = accRows.find(a => a.entry_date === date && a.accessoryId === pid);
          return { accessoryId: pid, sold: !!row, qty: row ? row.qty : "", rate: row ? row.rate : "" };
        })
      };
    });

    res.json({ prices: pricesRows, commissions: commRows, boys, employees, vehicles: vehicleRows, pending, entries });
  } catch (error) {
    console.error("Load API Error:", error);
    res.status(500).json({ error: error.message });
  }
});

/* ════════════════════════════════════════════════════════════════
   2. DAILY ENTRY SAVE (Transaction)
════════════════════════════════════════════════════════════════ */
app.post('/api/entries', verifyToken, async (req, res) => {
  const entry = req.body;
  const date = entry.date;
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // 1. Insert/Update daily_entries
    await connection.query(`
      INSERT INTO daily_entries (entry_date, opening_cash, bob_bank, has_vehicle_arrival) 
      VALUES (?, ?, ?, ?) 
      ON DUPLICATE KEY UPDATE opening_cash = ?, bob_bank = ?, has_vehicle_arrival = ?
    `, [date, num(entry.openingCash), num(entry.bob), !!entry.hasArrival, num(entry.openingCash), num(entry.bob), !!entry.hasArrival]);

    // 2. Process Products
    await connection.query('DELETE FROM daily_product_stock WHERE entry_date = ?', [date]);
    if (entry.products && entry.products.length > 0) {
      const prodVals = entry.products.map(p => [
        date, p.id, num(p.openingStock), num(p.rate), num(p.sbcRate), num(p.dbcRate), num(p.sell), num(p.online), num(p.sbc), num(p.dbc), num(p.closingStock), num(p.shortage), p.remarks || ''
      ]);
      await connection.query('INSERT INTO daily_product_stock (entry_date, product_id, opening_stock, rate, sbc_rate, dbc_rate, sell_qty, online_qty, sbc_qty, dbc_qty, closing_stock, shortage_qty, remarks) VALUES ?', [prodVals]);
    }

    // 3. Process Deliveries (needs boy IDs from employees table)
    await connection.query('DELETE FROM daily_deliveries WHERE entry_date = ?', [date]);
    const [boys] = await connection.query("SELECT id, name FROM employees WHERE role = 'Delivery Boy'");
    const boyMap = {};
    boys.forEach(b => boyMap[b.name] = b.id);
    
    const delVals = [];
    if (entry.delivery) {
      for (const [boyName, val] of Object.entries(entry.delivery)) {
        const cash = typeof val === 'object' && val !== null ? num(val.cash) : num(val);
        const online = typeof val === 'object' && val !== null ? num(val.online) : 0;
        const total = cash + online;
        if (total > 0 && boyMap[boyName]) {
          delVals.push([date, boyMap[boyName], cash, online, total]);
        }
      }
    }
    if (delVals.length > 0) {
      await connection.query('INSERT INTO daily_deliveries (entry_date, delivery_boy_id, cash_qty, online_qty, qty_delivered) VALUES ?', [delVals]);
    }

    // 4. Process Expenses
    await connection.query('DELETE FROM daily_expenses WHERE entry_date = ?', [date]);
    if (entry.expenses) {
      const expVals = entry.expenses.filter(x => x.desc || num(x.amt) > 0).map(x => [x.id, date, x.desc || '', num(x.amt)]);
      if (expVals.length > 0) {
        await connection.query('INSERT INTO daily_expenses (id, entry_date, description, amount) VALUES ?', [expVals]);
      }
    }

    // 5. Process Cheque/Online
    await connection.query('DELETE FROM daily_cheque_online WHERE entry_date = ?', [date]);
    if (entry.chequeOnline) {
      const chqVals = entry.chequeOnline.filter(x => x.desc || num(x.amt) > 0).map(x => [x.id, date, x.desc || '', num(x.amt)]);
      if (chqVals.length > 0) {
        await connection.query('INSERT INTO daily_cheque_online (id, entry_date, description, amount) VALUES ?', [chqVals]);
      }
    }

    // 6. Process Credit Sales (Credit Ledger)
    // For existing records (id already starts with date), use the id as-is.
    // For new records added in this session, build a fresh ledgerId.
    // Allow deleting credit sales that have been removed in the frontend, but only if they have no payments.
    if (entry.creditSales) {
      const activeIds = [];
      for (const cs of entry.creditSales) {
        if (cs.customerName && num(cs.amt) > 0) {
          // If the id already starts with the date prefix it came from the DB — use it directly
          const ledgerId = cs.id && cs.id.startsWith(date + '-') ? cs.id : `${date}-${cs.id}`;
          activeIds.push(ledgerId);
          await connection.query(`
            INSERT INTO credit_ledger (id, entry_date, customer_name, original_amount, cleared, product_id, filled_qty, empty_qty, remarks) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE customer_name = VALUES(customer_name), original_amount = VALUES(original_amount), product_id = VALUES(product_id), filled_qty = VALUES(filled_qty), empty_qty = VALUES(empty_qty), remarks = VALUES(remarks)
          `, [ledgerId, date, cs.customerName.trim().toUpperCase(), num(cs.amt), false, cs.productId || null, num(cs.filledQty), num(cs.emptyQty), cs.remarks || '']);
        }
      }

      // Delete credit ledger entries for this date that are NOT in the active list AND have no payments
      let queryStr = 'SELECT id FROM credit_ledger WHERE entry_date = ?';
      const params = [date];
      if (activeIds.length > 0) {
        queryStr += ' AND id NOT IN (?)';
        params.push(activeIds);
      }
      const [toDeleteRows] = await connection.query(queryStr, params);
      for (const row of toDeleteRows) {
        const [payments] = await connection.query('SELECT COUNT(*) as cnt FROM credit_payments WHERE ledger_id = ?', [row.id]);
        if (payments[0].cnt === 0) {
          await connection.query('DELETE FROM credit_ledger WHERE id = ?', [row.id]);
        }
      }
    } else {
      // If creditSales array is not provided or empty, delete all credit ledger entries for this date that have no payments
      const [toDeleteRows] = await connection.query('SELECT id FROM credit_ledger WHERE entry_date = ?', [date]);
      for (const row of toDeleteRows) {
        const [payments] = await connection.query('SELECT COUNT(*) as cnt FROM credit_payments WHERE ledger_id = ?', [row.id]);
        if (payments[0].cnt === 0) {
          await connection.query('DELETE FROM credit_ledger WHERE id = ?', [row.id]);
        }
      }
    }


    // 7. Process Vehicle Expenses
    await connection.query('DELETE FROM daily_vehicle_expenses WHERE entry_date = ?', [date]);
    if (entry.vehicleExpenses) {
      const vehExpVals = entry.vehicleExpenses
        .filter(x => num(x.amt) > 0)
        .map(x => [x.id, date, x.vehicleId || null, x.expType || 'Fuel', x.desc || '', num(x.amt)]);
      if (vehExpVals.length > 0) {
        await connection.query('INSERT INTO daily_vehicle_expenses (id, entry_date, vehicle_id, expense_type, description, amount) VALUES ?', [vehExpVals]);
      }
    }

    // 8. Process Salary/Advance Payments
    await connection.query('DELETE FROM employee_payments WHERE entry_date = ?', [date]);
    if (entry.salaryPayments) {
      const salPayVals = entry.salaryPayments
        .filter(x => x.employeeId && num(x.amt) > 0)
        .map(x => [x.id, date, x.employeeId, num(x.amt), x.type || 'Salary', x.notes || '', x.forMonth || null]);
      if (salPayVals.length > 0) {
        await connection.query('INSERT INTO employee_payments (id, entry_date, employee_id, amount, type, notes, for_month) VALUES ?', [salPayVals]);
      }
    }

    // 9. Process Godown Stock
    if (entry.godownStock && entry.godownStock.length > 0) {
      for (const item of entry.godownStock) {
        if (num(item.filled) > 0 || num(item.empty) > 0) {
          await connection.query(`
            INSERT INTO godown_stock (entry_date, product_id, filled_qty, empty_qty)
            VALUES (?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE filled_qty = ?, empty_qty = ?
          `, [date, item.productId, num(item.filled), num(item.empty), num(item.filled), num(item.empty)]);
        }
      }
    }

    // 10. Process Vehicle Arrivals
    if (entry.hasArrival && entry.arrivals && entry.arrivals.length > 0) {
      for (const item of entry.arrivals) {
        if (num(item.filledReceived) > 0 || num(item.emptyReturned) > 0) {
          await connection.query(`
            INSERT INTO vehicle_arrivals (entry_date, product_id, filled_received, empty_returned)
            VALUES (?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE filled_received = ?, empty_returned = ?
          `, [date, item.productId, num(item.filledReceived), num(item.emptyReturned), num(item.filledReceived), num(item.emptyReturned)]);
        }
      }
    } else {
      await connection.query('DELETE FROM vehicle_arrivals WHERE entry_date = ?', [date]);
    }

    // 11. Process Accessory Sales
    await connection.query('DELETE FROM daily_accessory_sales WHERE entry_date = ?', [date]);
    if (entry.accessories) {
      const accVals = entry.accessories
        .filter(x => x.sold && num(x.qty) > 0)
        .map(x => [date, x.accessoryId, num(x.qty), num(x.rate)]);
      if (accVals.length > 0) {
        await connection.query('INSERT INTO daily_accessory_sales (entry_date, accessory_id, qty, rate) VALUES ?', [accVals]);
      }
    }

    // 12. Process Other Cash Credits
    await connection.query('DELETE FROM daily_other_cash_credits WHERE entry_date = ?', [date]);
    if (entry.otherCashCredits) {
      const occVals = entry.otherCashCredits.filter(x => x.desc || num(x.amt) > 0).map(x => [x.id, date, x.desc || '', num(x.amt)]);
      if (occVals.length > 0) {
        await connection.query('INSERT INTO daily_other_cash_credits (id, entry_date, description, amount) VALUES ?', [occVals]);
      }
    }

    await connection.commit();
    res.json({ success: true });
  } catch (error) {
    await connection.rollback();
    console.error("Save Entry Error:", error);
    res.status(500).json({ error: error.message });
  } finally {
    connection.release();
  }
});

/* ════════════════════════════════════════════════════════════════
   2b. DELETE DAILY ENTRY (Admin only)
   Removes ONLY the day's operational entry data.
   Salary payments and credit ledger are kept as permanent records.
════════════════════════════════════════════════════════════════ */
app.delete('/api/entries/:date', verifyToken, async (req, res) => {
  const date = req.params.date;

  // Safety: validate date format (must be YYYY-MM-DD)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'Invalid date format. Expected YYYY-MM-DD.' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Only delete core daily entry tables for this specific date
    await connection.query('DELETE FROM daily_product_stock WHERE entry_date = ?', [date]);
    await connection.query('DELETE FROM daily_deliveries WHERE entry_date = ?', [date]);
    await connection.query('DELETE FROM daily_expenses WHERE entry_date = ?', [date]);
    await connection.query('DELETE FROM daily_cheque_online WHERE entry_date = ?', [date]);
    await connection.query('DELETE FROM daily_vehicle_expenses WHERE entry_date = ?', [date]);
    await connection.query('DELETE FROM godown_stock WHERE entry_date = ?', [date]);
    await connection.query('DELETE FROM vehicle_arrivals WHERE entry_date = ?', [date]);
    await connection.query('DELETE FROM daily_accessory_sales WHERE entry_date = ?', [date]);
    await connection.query('DELETE FROM daily_other_cash_credits WHERE entry_date = ?', [date]);
    // Delete the main daily entry row last
    await connection.query('DELETE FROM daily_entries WHERE entry_date = ?', [date]);

    // NOTE: employee_payments (salary/advance) and credit_ledger are intentionally
    // NOT deleted — they are permanent financial records.

    await connection.commit();
    res.json({ success: true });
  } catch (error) {
    await connection.rollback();
    console.error('Delete Entry Error:', error);
    res.status(500).json({ error: error.message });
  } finally {
    connection.release();
  }
});

/* ════════════════════════════════════════════════════════════════
   3. PAYMENT RECORDING
════════════════════════════════════════════════════════════════ */
app.post('/api/payments', verifyToken, async (req, res) => {
  const { ledgerId, amt, date, note, emptyReturned } = req.body;
  try {
    const paymentId = Math.random().toString(36).slice(2, 9);
    await pool.query('INSERT INTO credit_payments (id, ledger_id, payment_date, amount, note, empty_returned) VALUES (?, ?, ?, ?, ?, ?)', 
      [paymentId, ledgerId, date, num(amt), note || '', num(emptyReturned)]
    );
    
    // Check if cleared
    const [ledger] = await pool.query('SELECT original_amount FROM credit_ledger WHERE id = ?', [ledgerId]);
    if (ledger.length > 0) {
      const [payments] = await pool.query('SELECT SUM(amount) as total FROM credit_payments WHERE ledger_id = ?', [ledgerId]);
      if (num(payments[0].total) >= num(ledger[0].original_amount)) {
        await pool.query('UPDATE credit_ledger SET cleared = 1 WHERE id = ?', [ledgerId]);
      }
    }
    res.json({ success: true });
  } catch (error) {
    console.error("Payment Error:", error);
    res.status(500).json({ error: error.message });
  }
});

/* ════════════════════════════════════════════════════════════════
   4. SYNC ADMIN CONFIGS (Boys, Prices, Commissions)
════════════════════════════════════════════════════════════════ */
app.post('/api/prices/sync', verifyToken, async (req, res) => {
  const arr = req.body; // Array of { id, productId, rate, date, note }
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    // Clear all and re-insert is easiest for full array sync, but safer to upsert and delete missing
    await connection.query('DELETE FROM price_history');
    if (arr.length > 0) {
      const vals = arr.map(x => [x.id, x.productId, x.date, num(x.rate), num(x.sbcRate), num(x.dbcRate), x.note || '']);
      await connection.query('INSERT INTO price_history (id, product_id, effective_date, rate, sbc_rate, dbc_rate, note) VALUES ?', [vals]);
    }
    await connection.commit();
    res.json({ success: true });
  } catch (error) {
    await connection.rollback();
    res.status(500).json({ error: error.message });
  } finally {
    connection.release();
  }
});

app.post('/api/commissions/sync', verifyToken, async (req, res) => {
  const arr = req.body; // Array of { id, productId, perCyl, date, note }
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query('DELETE FROM commission_history');
    if (arr.length > 0) {
      const vals = arr.map(x => [x.id, x.productId, x.date, num(x.perCyl), x.note || '']);
      await connection.query('INSERT INTO commission_history (id, product_id, effective_date, per_cyl_rate, note) VALUES ?', [vals]);
    }
    await connection.commit();
    res.json({ success: true });
  } catch (error) {
    await connection.rollback();
    res.status(500).json({ error: error.message });
  } finally {
    connection.release();
  }
});

/* ════════════════════════════════════════════════════════════════
   5. AUTHENTICATION AND USER MANAGEMENT
════════════════════════════════════════════════════════════════ */

// Public: Login — issues a signed JWT on success
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }
  try {
    const [rows] = await pool.query('SELECT id, role FROM users WHERE username = ? AND password = ?', [username, password]);
    if (rows.length > 0) {
      const payload = { username, role: rows[0].role };
      const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
      res.json({ success: true, token, role: rows[0].role });
    } else {
      res.status(401).json({ error: 'Invalid username or password.' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Public: Verify Session — checks if a stored token is still valid
app.post('/api/verify-session', (req, res) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ valid: false, error: 'No token.' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    res.json({ valid: true, role: decoded.role, username: decoded.username, exp: decoded.exp });
  } catch (err) {
    res.status(401).json({ valid: false, error: err.name === 'TokenExpiredError' ? 'Session expired.' : 'Invalid token.' });
  }
});

// Protected: User management (admin only in practice, token required)
app.get('/api/users', verifyToken, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, username, role FROM users');
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/users', verifyToken, async (req, res) => {
  const { username, password, role } = req.body;
  try {
    await pool.query('INSERT INTO users (username, password, role) VALUES (?, ?, ?)', [username, password, role]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/users/:id', verifyToken, async (req, res) => {
  try {
    await pool.query('DELETE FROM users WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/* ════════════════════════════════════════════════════════════════
   6. VEHICLE MASTER
════════════════════════════════════════════════════════════════ */
app.get('/api/vehicles', verifyToken, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM vehicles ORDER BY sort_order ASC, id ASC');
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/vehicles', verifyToken, async (req, res) => {
  const { vehicleNo, type, capacity, notes } = req.body;
  try {
    const [result] = await pool.query(
      'INSERT INTO vehicles (vehicle_no, type, capacity, notes) VALUES (?, ?, ?, ?)',
      [vehicleNo.trim().toUpperCase(), type || '', capacity || null, notes || '']
    );
    res.json({ success: true, id: result.insertId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/vehicles/:id', verifyToken, async (req, res) => {
  const { vehicleNo, type, capacity, notes, isActive } = req.body;
  try {
    await pool.query(
      'UPDATE vehicles SET vehicle_no=?, type=?, capacity=?, notes=?, is_active=? WHERE id=?',
      [vehicleNo.trim().toUpperCase(), type || '', capacity || null, notes || '', isActive !== undefined ? isActive : 1, req.params.id]
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.patch('/api/vehicles/:id/toggle', verifyToken, async (req, res) => {
  try {
    await pool.query('UPDATE vehicles SET is_active = NOT is_active WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/vehicles/:id', verifyToken, async (req, res) => {
  try {
    await pool.query('DELETE FROM vehicles WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/* ════════════════════════════════════════════════════════════════
   7. EMPLOYEE MASTER
════════════════════════════════════════════════════════════════ */
app.get('/api/employees', verifyToken, async (req, res) => {
  try {
    const [rows] = await pool.query(`SELECT id, name, role, salary, phone, DATE_FORMAT(join_date, '%Y-%m-%d') as join_date, notes, is_active FROM employees ORDER BY name ASC`);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/employees', verifyToken, async (req, res) => {
  const { name, role, salary, phone, joinDate, notes } = req.body;
  try {
    const [result] = await pool.query(
      'INSERT INTO employees (name, role, salary, phone, join_date, notes) VALUES (?, ?, ?, ?, ?, ?)',
      [name.trim(), role || '', num(salary), phone || '', joinDate || null, notes || '']
    );
    res.json({ success: true, id: result.insertId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/employees/:id', verifyToken, async (req, res) => {
  const { name, role, salary, phone, joinDate, notes, isActive } = req.body;
  try {
    await pool.query(
      'UPDATE employees SET name=?, role=?, salary=?, phone=?, join_date=?, notes=?, is_active=? WHERE id=?',
      [name.trim(), role || '', num(salary), phone || '', joinDate || null, notes || '', isActive !== undefined ? isActive : 1, req.params.id]
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.patch('/api/employees/:id/toggle', verifyToken, async (req, res) => {
  try {
    await pool.query('UPDATE employees SET is_active = NOT is_active WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/employees/:id', verifyToken, async (req, res) => {
  try {
    await pool.query('DELETE FROM employees WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/* ════════════════════════════════════════════════════════════════
   8. GODOWN STOCK
   ════════════════════════════════════════════════════════════════ */
app.get('/api/godown-stock/:date', verifyToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT product_id as productId, filled_qty as `filled`, empty_qty as `empty` FROM godown_stock WHERE entry_date = ?",
      [req.params.date]
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/godown-stock', verifyToken, async (req, res) => {
  const { date, items } = req.body; // items: [{productId, filled, empty}]
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    for (const item of items) {
      await connection.query(`
        INSERT INTO godown_stock (entry_date, product_id, filled_qty, empty_qty)
        VALUES (?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE filled_qty = ?, empty_qty = ?
      `, [date, item.productId, num(item.filled), num(item.empty), num(item.filled), num(item.empty)]);
    }
    await connection.commit();
    res.json({ success: true });
  } catch (error) {
    await connection.rollback();
    res.status(500).json({ error: error.message });
  } finally {
    connection.release();
  }
});

const PORT = process.env.PORT || 3001;
runMigrations().then(() => {
  app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));
}).catch(err => {
  console.error("Failed to run migrations:", err);
  app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));
});


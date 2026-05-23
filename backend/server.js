const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

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
  dateStrings: true  // Always return DATE/DATETIME as strings, prevents timezone mismatch
});

// Helper: safe number
const num = (v) => parseFloat(v) || 0;

/* ════════════════════════════════════════════════════════════════
   1. MASTER LOAD ENDPOINT (Replaces initial dbGet Promise.all)
════════════════════════════════════════════════════════════════ */
app.get('/api/load', async (req, res) => {
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
    const [ledgerRows] = await pool.query(`SELECT id, DATE_FORMAT(entry_date, '%Y-%m-%d') as date, customer_name as customerName, original_amount as originalAmt, cleared FROM credit_ledger`);
    const [paymentRows] = await pool.query(`
      SELECT p.ledger_id, DATE_FORMAT(p.payment_date, "%Y-%m-%d") as date, p.amount as amt, p.note, l.customer_name as customerName 
      FROM credit_payments p 
      LEFT JOIN credit_ledger l ON p.ledger_id = l.id
    `);
    
    const pending = ledgerRows.map(l => {
      const payments = paymentRows.filter(p => p.ledger_id === l.id).map(p => ({ date: p.date, amt: num(p.amt), note: p.note }));
      const recovered = payments.reduce((sum, p) => sum + num(p.amt), 0);
      return {
        id: l.id,
        date: l.date,
        customerName: l.customerName,
        originalAmt: num(l.originalAmt),
        recovered,
        cleared: l.cleared === 1 || recovered >= num(l.originalAmt),
        payments
      };
    });

    // 6. Load Daily Entries
    const [entriesRows] = await pool.query(`SELECT DATE_FORMAT(entry_date, '%Y-%m-%d') as date, opening_cash as openingCash, bob_bank as bob, has_vehicle_arrival as hasArrival FROM daily_entries`);
    const [prodStockRows] = await pool.query(`SELECT DATE_FORMAT(entry_date, '%Y-%m-%d') as entry_date, product_id as id, opening_stock as openingStock, rate, sbc_rate as sbcRate, dbc_rate as dbcRate, sell_qty as sell, online_qty as online, sbc_qty as sbc, dbc_qty as dbc, closing_stock as closingStock, remarks FROM daily_product_stock`);
    const [deliveryRows] = await pool.query(`SELECT d.cash_qty, d.online_qty, d.qty_delivered, DATE_FORMAT(d.entry_date, '%Y-%m-%d') as entry_date, b.name FROM daily_deliveries d JOIN employees b ON d.delivery_boy_id = b.id`);
    const [expRows] = await pool.query("SELECT id, DATE_FORMAT(entry_date, '%Y-%m-%d') as entry_date, description as `desc`, amount as amt FROM daily_expenses");
    const [chequeRows] = await pool.query("SELECT id, DATE_FORMAT(entry_date, '%Y-%m-%d') as entry_date, description as `desc`, amount as amt FROM daily_cheque_online");
    const [creditSalesRows] = await pool.query(`SELECT id, DATE_FORMAT(entry_date, '%Y-%m-%d') as entry_date, customer_name as customerName, original_amount as amt FROM credit_ledger`);
    const [vehExpRows] = await pool.query("SELECT dve.id, DATE_FORMAT(dve.entry_date, '%Y-%m-%d') as entry_date, dve.vehicle_id as vehicleId, COALESCE(v.vehicle_no, '') as vehicleNo, dve.expense_type as expType, dve.description as `desc`, dve.amount as amt FROM daily_vehicle_expenses dve LEFT JOIN vehicles v ON dve.vehicle_id = v.id");
    const [salPayRows] = await pool.query(`SELECT sp.id, DATE_FORMAT(sp.entry_date, '%Y-%m-%d') as entry_date, sp.employee_id as employeeId, e.name as employeeName, sp.amount as amt, sp.type, sp.notes FROM employee_payments sp JOIN employees e ON sp.employee_id = e.id`);
    const [godownRows] = await pool.query(`SELECT DATE_FORMAT(entry_date, '%Y-%m-%d') as entry_date, product_id as productId, filled_qty as filled, empty_qty as empty FROM godown_stock`);
    const [arrivalRows] = await pool.query(`SELECT DATE_FORMAT(entry_date, '%Y-%m-%d') as entry_date, product_id as productId, filled_received as filledReceived, empty_returned as emptyReturned FROM vehicle_arrivals`);
    const [accRows] = await pool.query(`SELECT DATE_FORMAT(entry_date, '%Y-%m-%d') as entry_date, accessory_id as accessoryId, qty, rate FROM daily_accessory_sales`);

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
      const creditSales = creditSalesRows.filter(x => x.entry_date === date).map(x => ({ id: x.id, customerName: x.customerName, amt: x.amt || "" }));
      const vehicleExpenses = vehExpRows.filter(x => x.entry_date === date).map(x => ({ id: x.id, vehicleId: x.vehicleId || '', vehicleNo: x.vehicleNo || '', expType: x.expType || 'Fuel', desc: x.desc || '', amt: x.amt || '' }));
      const salaryPayments = salPayRows.filter(x => x.entry_date === date).map(x => ({ id: x.id, employeeId: x.employeeId, employeeName: x.employeeName, amt: x.amt || "", type: x.type, notes: x.notes || "" }));
      const creditRecoveries = paymentRows.filter(p => p.date === date).map(p => ({
        ledgerId: p.ledger_id,
        customerName: p.customerName || "UNKNOWN",
        amt: p.amt || "",
        note: p.note || ""
      }));

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
app.post('/api/entries', async (req, res) => {
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
        date, p.id, num(p.openingStock), num(p.rate), num(p.sbcRate), num(p.dbcRate), num(p.sell), num(p.online), num(p.sbc), num(p.dbc), num(p.closingStock), p.remarks || ''
      ]);
      await connection.query('INSERT INTO daily_product_stock (entry_date, product_id, opening_stock, rate, sbc_rate, dbc_rate, sell_qty, online_qty, sbc_qty, dbc_qty, closing_stock, remarks) VALUES ?', [prodVals]);
    }

    // 3. Process Deliveries (needs boy IDs from employees table)
    await connection.query('DELETE FROM daily_deliveries WHERE entry_date = ?', [date]);
    const [boys] = await connection.query('SELECT id, name FROM employees WHERE role = "Delivery Boy"');
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
            INSERT INTO credit_ledger (id, entry_date, customer_name, original_amount, cleared) 
            VALUES (?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE customer_name = VALUES(customer_name), original_amount = VALUES(original_amount)
          `, [ledgerId, date, cs.customerName.trim().toUpperCase(), num(cs.amt), false]);
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
        .map(x => [x.id, date, x.employeeId, num(x.amt), x.type || 'Salary', x.notes || '']);
      if (salPayVals.length > 0) {
        await connection.query('INSERT INTO employee_payments (id, entry_date, employee_id, amount, type, notes) VALUES ?', [salPayVals]);
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
   3. PAYMENT RECORDING
════════════════════════════════════════════════════════════════ */
app.post('/api/payments', async (req, res) => {
  const { ledgerId, amt, date, note } = req.body;
  try {
    const paymentId = Math.random().toString(36).slice(2, 9);
    await pool.query('INSERT INTO credit_payments (id, ledger_id, payment_date, amount, note) VALUES (?, ?, ?, ?, ?)', 
      [paymentId, ledgerId, date, num(amt), note || '']
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


app.post('/api/prices/sync', async (req, res) => {
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

app.post('/api/commissions/sync', async (req, res) => {
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
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const [rows] = await pool.query('SELECT role FROM users WHERE username = ? AND password = ?', [username, password]);
    if (rows.length > 0) {
      res.json({ success: true, role: rows[0].role });
    } else {
      res.status(401).json({ error: "Invalid username or password" });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/users', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, username, role FROM users');
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/users', async (req, res) => {
  const { username, password, role } = req.body;
  try {
    await pool.query('INSERT INTO users (username, password, role) VALUES (?, ?, ?)', [username, password, role]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/users/:id', async (req, res) => {
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
app.get('/api/vehicles', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM vehicles ORDER BY sort_order ASC, id ASC');
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/vehicles', async (req, res) => {
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

app.put('/api/vehicles/:id', async (req, res) => {
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

app.patch('/api/vehicles/:id/toggle', async (req, res) => {
  try {
    await pool.query('UPDATE vehicles SET is_active = NOT is_active WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/vehicles/:id', async (req, res) => {
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
app.get('/api/employees', async (req, res) => {
  try {
    const [rows] = await pool.query(`SELECT id, name, role, salary, phone, DATE_FORMAT(join_date, '%Y-%m-%d') as join_date, notes, is_active FROM employees ORDER BY name ASC`);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/employees', async (req, res) => {
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

app.put('/api/employees/:id', async (req, res) => {
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

app.patch('/api/employees/:id/toggle', async (req, res) => {
  try {
    await pool.query('UPDATE employees SET is_active = NOT is_active WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/employees/:id', async (req, res) => {
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
app.get('/api/godown-stock/:date', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT product_id as productId, filled_qty as filled, empty_qty as empty FROM godown_stock WHERE entry_date = ?',
      [req.params.date]
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/godown-stock', async (req, res) => {
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

const PORT = 3001;
app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));


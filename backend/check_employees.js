const mysql = require('mysql2/promise');

async function run() {
  const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'jay_ranchhod_gas_agency'
  });

  try {
    console.log("Checking employees table...");
    const [employees] = await pool.query('SELECT * FROM employees');
    console.log("Total employees:", employees.length);
    console.log(JSON.stringify(employees, null, 2));

    const [active] = await pool.query('SELECT * FROM employees WHERE is_active = 1');
    console.log("Active employees:", active.length);
    console.log(JSON.stringify(active, null, 2));
  } catch(e) {
    console.error("Error checking employees:", e.message);
  }
  process.exit(0);
}
run();

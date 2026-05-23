const mysql = require('mysql2/promise');

async function run() {
  const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'jay_ranchhod_gas_agency'
  });

  try {
    const [rows] = await pool.query('SHOW CREATE TABLE daily_deliveries');
    console.log(rows[0]['Create Table']);
  } catch(e) {
    console.error(e);
  }
  process.exit(0);
}
run();

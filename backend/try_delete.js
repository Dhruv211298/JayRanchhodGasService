const mysql = require('mysql2/promise');

async function run() {
  const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'jay_ranchhod_gas_agency'
  });

  try {
    const [result] = await pool.query('DELETE FROM employees WHERE id = 12');
    console.log(result);
  } catch(e) {
    console.error(e);
  }
  process.exit(0);
}
run();

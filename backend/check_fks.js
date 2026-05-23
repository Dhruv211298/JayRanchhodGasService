const mysql = require('mysql2/promise');

async function run() {
  const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'jay_ranchhod_gas_agency'
  });

  try {
    const [rows] = await pool.query(`
      SELECT TABLE_NAME, COLUMN_NAME, CONSTRAINT_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME 
      FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE 
      WHERE REFERENCED_TABLE_SCHEMA = 'jay_ranchhod_gas_agency' AND REFERENCED_TABLE_NAME = 'employees';
    `);
    console.log(rows);
  } catch(e) {
    console.error(e);
  }
  process.exit(0);
}
run();

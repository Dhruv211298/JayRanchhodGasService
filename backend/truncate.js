const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: '127.0.0.1',
  user: 'root',
  password: '',
  database: 'jay_ranchhod_gas_agency',
});

async function truncateTables() {
  const connection = await pool.getConnection();
  try {
    const [tables] = await connection.query("SHOW TABLES");
    const dbName = 'jay_ranchhod_gas_agency';
    const key = `Tables_in_${dbName}`;
    
    const excluded = ['employees', 'users', 'products', 'vehicles', 'delivery_boys'];
    
    await connection.query('SET FOREIGN_KEY_CHECKS = 0');
    
    for (const row of tables) {
      const tableName = row[key];
      if (!excluded.includes(tableName)) {
        console.log(`Truncating ${tableName}...`);
        await connection.query(`TRUNCATE TABLE \`${tableName}\``);
      } else {
        console.log(`Skipping ${tableName} (excluded)`);
      }
    }
    
    await connection.query('SET FOREIGN_KEY_CHECKS = 1');
    console.log('Successfully truncated operational tables.');
  } catch (error) {
    console.error('Error truncating tables:', error);
  } finally {
    connection.release();
    process.exit(0);
  }
}

truncateTables();

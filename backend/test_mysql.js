const mysql = require('mysql2/promise');

async function run() {
  console.log("Attempting connection to ::1 without database selected...");
  try {
    const conn = await mysql.createConnection({
      host: '::1',
      user: 'root',
      password: ''
    });
    console.log("Success! Connected to ::1");
    
    console.log("Checking databases...");
    const [dbs] = await conn.query('SHOW DATABASES');
    console.log("Databases:", dbs.map(d => d.Database));
    
    await conn.end();
  } catch (err) {
    console.error("Connection to ::1 failed:", err);
  }
}

run();

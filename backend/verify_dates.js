const mysql = require('mysql2/promise');
const pool = mysql.createPool({
  host: '127.0.0.1', user: 'root', password: '',
  database: 'jay_ranchhod_gas_agency', dateStrings: true
});

(async () => {
  const [e] = await pool.query('SELECT DATE_FORMAT(entry_date, "%Y-%m-%d") as date FROM daily_entries ORDER BY entry_date DESC LIMIT 1');
  const [p] = await pool.query('SELECT DATE_FORMAT(entry_date, "%Y-%m-%d") as entry_date, product_id, sell_qty, online_qty FROM daily_product_stock ORDER BY entry_date DESC LIMIT 3');
  console.log('Entry date:', e[0] && e[0].date, typeof (e[0] && e[0].date));
  p.forEach(r => console.log('Prod stock:', r.entry_date, typeof r.entry_date, '| sell:', r.sell_qty, '| online:', r.online_qty));
  const match = e[0] && p[0] && e[0].date === p[0].entry_date;
  console.log('Dates MATCH:', match, '← should be true for data to link correctly');
  process.exit(0);
})();

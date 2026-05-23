const mysql = require('mysql2/promise');
const pool = mysql.createPool({
  host: '127.0.0.1', user: 'root', password: '',
  database: 'jay_ranchhod_gas_agency', dateStrings: true
});

(async () => {
  // Show all credit_ledger entries
  const [all] = await pool.query(
    'SELECT id, entry_date, customer_name, original_amount, cleared FROM credit_ledger ORDER BY entry_date DESC, customer_name, id'
  );
  console.log('\n--- ALL CREDIT LEDGER ENTRIES ---');
  all.forEach(r => console.log(r.id, '|', r.entry_date, '|', r.customer_name, '|', '₹'+r.original_amount, '| cleared:', r.cleared));

  // Find entries where id contains a double-date pattern like "2026-05-17-2026-05-17-"
  const doubled = all.filter(r => {
    const d = r.entry_date; // e.g. "2026-05-17"
    return r.id.startsWith(d + '-' + d + '-'); // "2026-05-17-2026-05-17-xxx"
  });

  if (doubled.length === 0) {
    console.log('\n✅ No duplicate entries found!');
    process.exit(0);
  }

  console.log('\n⚠️  Found', doubled.length, 'duplicated entries:');
  doubled.forEach(r => console.log('  DUPLICATE:', r.id));

  // For each duplicate, find the original entry
  let deleted = 0;
  for (const dup of doubled) {
    const d = dup.entry_date;
    const name = dup.customer_name;
    const amt = dup.original_amount;
    
    // Check if there's an original with matching name & amount that is NOT doubled
    const original = all.find(r =>
      r.entry_date === d &&
      r.customer_name === name &&
      parseFloat(r.original_amount) === parseFloat(amt) &&
      r.id !== dup.id &&
      !r.id.startsWith(d + '-' + d + '-')
    );

    if (original) {
      console.log('  Deleting dup:', dup.id, '(original kept:', original.id + ')');
      // Check dup has no payments
      const [payments] = await pool.query('SELECT COUNT(*) as cnt FROM credit_payments WHERE ledger_id = ?', [dup.id]);
      if (payments[0].cnt > 0) {
        console.log('  ⚠️  Dup has', payments[0].cnt, 'payments - reassigning to original...');
        await pool.query('UPDATE credit_payments SET ledger_id = ? WHERE ledger_id = ?', [original.id, dup.id]);
      }
      await pool.query('DELETE FROM credit_ledger WHERE id = ?', [dup.id]);
      deleted++;
    } else {
      console.log('  ⚠️  No matching original found for dup:', dup.id, '- fixing ID format instead');
      // Rename dup to correct format: strip the double date
      const suffix = dup.id.substring((d + '-' + d + '-').length);
      const correctId = d + '-' + suffix;
      const exists = all.find(r => r.id === correctId);
      if (!exists) {
        await pool.query('UPDATE credit_ledger SET id = ? WHERE id = ?', [correctId, dup.id]);
        await pool.query('UPDATE credit_payments SET ledger_id = ? WHERE ledger_id = ?', [correctId, dup.id]);
        console.log('  Renamed to:', correctId);
      } else {
        await pool.query('DELETE FROM credit_ledger WHERE id = ?', [dup.id]);
        console.log('  Deleted pure duplicate of', correctId);
      }
      deleted++;
    }
  }

  console.log('\n✅ Fixed', deleted, 'duplicate entries.');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });

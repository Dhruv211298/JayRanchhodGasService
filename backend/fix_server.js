const fs = require('fs');
let c = fs.readFileSync('server.js', 'utf8');

// Fix: all single-quoted query strings that contain DATE_FORMAT('%Y-%m-%d')
// need to be converted to template literals (backticks)
// Pattern: pool.query('...DATE_FORMAT(..., '%Y-%m-%d')...')
// The current state after previous fix: single-quoted strings with '%Y-%m-%d' inside - invalid JS

// Restore the original double-quote format first (undo previous bad fix)
c = c.replace(/DATE_FORMAT\(([^,]+),\s*'%Y-%m-%d'\)/g, 'DATE_FORMAT($1, "%Y-%m-%d")');

// Now convert: any pool.query('...') or connection.query('...') 
// where the string contains DATE_FORMAT -> wrap in backticks
c = c.replace(/(?:pool|connection)\.query\('([^']*DATE_FORMAT[^']*)'\)/g, (match, sql) => {
  // Convert the DATE_FORMAT format string from " to '
  const fixedSql = sql.replace(/DATE_FORMAT\(([^,]+),\s*"%Y-%m-%d"\)/g, "DATE_FORMAT($1, '%Y-%m-%d')");
  return match.replace(`'${sql}'`, '`' + fixedSql + '`');
});

fs.writeFileSync('server.js', c, 'utf8');

// Verify
const idx = c.indexOf('DATE_FORMAT');
console.log('Sample:', c.substring(idx - 20, idx + 60));

// Check for any remaining bad patterns
const bad = (c.match(/DATE_FORMAT[^`'"]*"%Y/g) || []).length;
const good = (c.match(/DATE_FORMAT[^`'"]*'%Y/g) || []).length;
console.log('Fixed DATE_FORMAT count:', good, ' | Remaining bad:', bad);

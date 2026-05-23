const pool = require('./db');

async function test() {
    try {
        const [empRows] = await pool.query('SELECT id, name, role FROM employees WHERE is_active = 1 ORDER BY name ASC');
        const employees = empRows.map(e => ({ id: e.id, name: e.name, role: e.role }));
        console.log("Employees:", employees.length);
        
        const [vehicleRows] = await pool.query('SELECT id, vehicle_no, type, capacity FROM vehicles WHERE is_active = 1 ORDER BY sort_order ASC, id ASC');
        console.log("Vehicles:", vehicleRows.length);
        
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
test();

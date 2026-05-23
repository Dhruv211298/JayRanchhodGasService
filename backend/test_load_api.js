async function test() {
  try {
    const r = await fetch('http://localhost:3001/api/load');
    const data = await r.json();
    console.log("Full response data:", JSON.stringify(data, null, 2));
    console.log("Employees in /api/load:", data.employees ? data.employees.length : "MISSING");
    if (data.employees) {
      console.log(JSON.stringify(data.employees, null, 2));
    }
  } catch (e) {
    console.error("Fetch failed:", e.message);
  }
}
test();

async function run() {
  try {
    const res = await fetch('http://localhost:3001/api/employees/11', { method: 'DELETE' });
    const json = await res.json();
    console.log("Status:", res.status, "Response:", json);
  } catch(e) {
    console.error(e);
  }
}
run();

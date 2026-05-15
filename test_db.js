const sql = require("mssql/msnodesqlv8");
const db = require("./backend/config/db");

async function test() {
  try {
    const config = db.getDbConfig();
    console.log("Config:", JSON.stringify(config, null, 2));
    const pool = new sql.ConnectionPool(config);
    pool.on('error', err => {
      console.error("Pool error:", err);
    });
    console.log("Connecting...");
    await pool.connect();
    console.log("Connected successfully");
    pool.close();
  } catch (err) {
    console.error("Connection failed:", err);
  }
}

test();

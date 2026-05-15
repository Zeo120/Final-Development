const path = require("path");
const dotenv = require("dotenv");
const sql = require("mssql/msnodesqlv8");

dotenv.config({ path: path.resolve(__dirname, "..", "..", ".env") });

let poolPromise;

function parseBoolean(value, fallback) {
  if (value == null || value === "") {
    return fallback;
  }

  return String(value).toLowerCase() === "true";
}

function getDbConfig() {
  const rawServer = process.env.DB_SERVER || "localhost";
  const database = process.env.DB_DATABASE || "Test";
  const configuredInstance = process.env.DB_INSTANCE || "";
  const configuredPort = process.env.DB_PORT || "";
  const driver = process.env.DB_ODBC_DRIVER || "ODBC Driver 18 for SQL Server";
  const serverParts = rawServer.split("\\");
  const server = serverParts[0] || "localhost";
  const instanceName = configuredInstance || serverParts[1] || "";
  const port = configuredPort ? Number(configuredPort) : undefined;

  const fullServer = instanceName && !port ? `${server}\\${instanceName}` : server;

  return {
    driver,
    server: fullServer,
    database,
    connectionTimeout: Number(process.env.DB_CONNECTION_TIMEOUT || 15000),
    requestTimeout: Number(process.env.DB_REQUEST_TIMEOUT || 15000),
    options: {
      encrypt: parseBoolean(process.env.DB_ENCRYPT, false),
      trustedConnection: true,
      trustServerCertificate: parseBoolean(process.env.DB_TRUST_SERVER_CERTIFICATE, true),
      ...(port ? {} : instanceName ? { instanceName } : {})
    },
    ...(port ? { port } : {})
  };
}

function getPool() {
  if (!poolPromise) {
    poolPromise = sql.connect(getDbConfig()).catch(err => {
      poolPromise = null;
      throw err;
    });
  }

  return poolPromise;
}

module.exports = {
  sql,
  getDbConfig,
  getPool
};

const { getPool, sql } = require("../config/db");
const { createPasswordHash } = require("../utils/security");

function escapeIdentifier(identifier) {
  return `[${String(identifier).replace(/]/g, "]]")}]`;
}

async function migrateTable({ tableName, idColumn, passwordColumn }) {
  const pool = await getPool();
  const safeTable = escapeIdentifier(tableName);
  const safeIdColumn = escapeIdentifier(idColumn);
  const safePasswordColumn = escapeIdentifier(passwordColumn);

  const selectQuery = `
    SELECT ${safeIdColumn} AS [id], ${safePasswordColumn} AS [password]
    FROM ${safeTable}
  `;

  const result = await pool.request().query(selectQuery);
  let updatedCount = 0;

  for (const row of result.recordset) {
    const currentPassword = String(row.password || "");

    if (currentPassword.startsWith("scrypt$")) {
      continue;
    }

    const updateQuery = `
      UPDATE ${safeTable}
      SET ${safePasswordColumn} = @passwordValue
      WHERE ${safeIdColumn} = @idValue
    `;

    await pool
      .request()
      .input("idValue", sql.NVarChar, row.id)
      .input("passwordValue", sql.NVarChar, await createPasswordHash(currentPassword))
      .query(updateQuery);

    updatedCount += 1;
  }

  return updatedCount;
}

async function main() {
  try {
    const adminUpdates = await migrateTable({
      tableName: process.env.ADMIN_TABLE || "Admins",
      idColumn: process.env.ADMIN_ID_COLUMN || "AdminID",
      passwordColumn: process.env.ADMIN_PASSWORD_COLUMN || "Password"
    });

    const userUpdates = await migrateTable({
      tableName: process.env.USER_TABLE || "Users",
      idColumn: process.env.USER_ID_COLUMN || "UserID",
      passwordColumn: process.env.USER_PASSWORD_COLUMN || "Password"
    });

    console.log(`Admin passwords updated: ${adminUpdates}`);
    console.log(`User passwords updated: ${userUpdates}`);
    process.exit(0);
  } catch (error) {
    console.error("Password migration failed.", error);
    process.exit(1);
  }
}

main();

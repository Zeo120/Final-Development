const { sql, getPool } = require("../config/db");
const { sanitizeRecord } = require("../utils/security");
const { createPasswordHash, shouldUpgradePasswordHash, verifyPassword } = require("../utils/hashpasswords");

function escapeIdentifier(identifier) {
  return `[${String(identifier).replace(/]/g, "]]")}]`;
}

async function findUserById(tableName, idColumn, idValue) {
  const pool = await getPool();
  const safeTable = escapeIdentifier(tableName);
  const safeIdColumn = escapeIdentifier(idColumn);

  const query = `
    SELECT TOP (1) *
    FROM ${safeTable}
    WHERE ${safeIdColumn} = @idValue
  `;

  const result = await pool
    .request()
    .input("idValue", sql.NVarChar, idValue)
    .query(query);

  return result.recordset[0] || null;
}

async function setCredentialPassword(tableName, idColumn, passwordColumn, idValue, passwordValue) {
  const pool = await getPool();
  const safeTable = escapeIdentifier(tableName);
  const safeIdColumn = escapeIdentifier(idColumn);
  const safePasswordColumn = escapeIdentifier(passwordColumn);

  const query = `
    UPDATE ${safeTable}
    SET ${safePasswordColumn} = @passwordValue
    WHERE ${safeIdColumn} = @idValue
  `;

  await pool
    .request()
    .input("idValue", sql.NVarChar, idValue)
    .input("passwordValue", sql.NVarChar, passwordValue)
    .query(query);
}

async function findUserByCredential(tableName, idColumn, passwordColumn, idValue, passwordValue) {
  const record = await findUserById(tableName, idColumn, idValue);

  if (!record) {
    return null;
  }

  if (!(await verifyPassword(passwordValue, record[passwordColumn]))) {
    return null;
  }

  if (shouldUpgradePasswordHash(record[passwordColumn])) {
    const upgradedPasswordHash = await createPasswordHash(passwordValue);
    await setCredentialPassword(tableName, idColumn, passwordColumn, idValue, upgradedPasswordHash);
    record[passwordColumn] = upgradedPasswordHash;
  }

  return sanitizeRecord(record, [passwordColumn]);
}

async function createCredentialUser(tableName, idColumn, passwordColumn, idValue, passwordValue) {
  const pool = await getPool();
  const safeTable = escapeIdentifier(tableName);
  const safeIdColumn = escapeIdentifier(idColumn);
  const safePasswordColumn = escapeIdentifier(passwordColumn);

  const insertQuery = `
    INSERT INTO ${safeTable} (${safeIdColumn}, ${safePasswordColumn})
    OUTPUT INSERTED.*
    VALUES (@idValue, @passwordValue)
  `;

  const result = await pool
    .request()
    .input("idValue", sql.NVarChar, idValue)
    .input("passwordValue", sql.NVarChar, await createPasswordHash(passwordValue))
    .query(insertQuery);

  return sanitizeRecord(result.recordset[0] || null, [passwordColumn]);
}

async function validateAdminCredentials(adminId, password) {
  return findUserByCredential(
    process.env.ADMIN_TABLE || "Admins",
    process.env.ADMIN_ID_COLUMN || "AdminID",
    process.env.ADMIN_PASSWORD_COLUMN || "Password",
    adminId,
    password
  );
}

async function validateUserCredentials(userId, password) {
  return findUserByCredential(
    process.env.USER_TABLE || "Users",
    process.env.USER_ID_COLUMN || "UserID",
    process.env.USER_PASSWORD_COLUMN || "Password",
    userId,
    password
  );
}

async function createAdmin(adminId, password) {
  return createCredentialUser(
    process.env.ADMIN_TABLE || "Admins",
    process.env.ADMIN_ID_COLUMN || "AdminID",
    process.env.ADMIN_PASSWORD_COLUMN || "Password",
    adminId,
    password
  );
}

async function listAdmins() {
  const pool = await getPool();
  const safeTable = escapeIdentifier(process.env.ADMIN_TABLE || "Admins");
  const safeIdColumn = escapeIdentifier(process.env.ADMIN_ID_COLUMN || "AdminID");

  const query = `
    SELECT ${safeIdColumn} AS [adminId], [CreatedAt] AS [createdAt]
    FROM ${safeTable}
    ORDER BY ${safeIdColumn} ASC
  `;

  const result = await pool.request().query(query);
  return result.recordset;
}

async function listUsers() {
  const pool = await getPool();
  const safeTable = escapeIdentifier(process.env.USER_TABLE || "Users");
  const safeIdColumn = escapeIdentifier(process.env.USER_ID_COLUMN || "UserID");

  const query = `
    SELECT ${safeIdColumn} AS [userId], [CreatedAt] AS [createdAt]
    FROM ${safeTable}
    ORDER BY ${safeIdColumn} ASC
  `;

  const result = await pool.request().query(query);
  return result.recordset;
}

async function listUsersForAdmin(adminId) {
  const pool = await getPool();
  const safeTable = escapeIdentifier(process.env.USER_TABLE || "Users");
  const safeIdColumn = escapeIdentifier(process.env.USER_ID_COLUMN || "UserID");
  const safeAdminColumn = escapeIdentifier("AdminID");

  const query = `
    SELECT ${safeIdColumn} AS [userId], [CreatedAt] AS [createdAt]
    FROM ${safeTable}
    WHERE ${safeAdminColumn} = @adminId
    ORDER BY ${safeIdColumn} ASC
  `;

  const result = await pool
    .request()
    .input("adminId", sql.NVarChar, adminId)
    .query(query);

  return result.recordset;
}

async function updateAdminPassword(adminId, password) {
  const pool = await getPool();
  const safeTable = escapeIdentifier(process.env.ADMIN_TABLE || "Admins");
  const safeIdColumn = escapeIdentifier(process.env.ADMIN_ID_COLUMN || "AdminID");
  const safePasswordColumn = escapeIdentifier(process.env.ADMIN_PASSWORD_COLUMN || "Password");

  const query = `
    UPDATE ${safeTable}
    SET ${safePasswordColumn} = @passwordValue
    OUTPUT INSERTED.*
    WHERE ${safeIdColumn} = @adminId
  `;

  const result = await pool
    .request()
    .input("adminId", sql.NVarChar, adminId)
    .input("passwordValue", sql.NVarChar, await createPasswordHash(password))
    .query(query);

  return sanitizeRecord(result.recordset[0] || null, [process.env.ADMIN_PASSWORD_COLUMN || "Password"]);
}

async function updateAssignedUserCredentials(adminId, currentUserId, nextUserId, nextPassword) {
  const pool = await getPool();
  const userTable = escapeIdentifier(process.env.USER_TABLE || "Users");
  const userIdColumn = escapeIdentifier(process.env.USER_ID_COLUMN || "UserID");
  const passwordColumn = escapeIdentifier(process.env.USER_PASSWORD_COLUMN || "Password");
  const adminColumn = escapeIdentifier("AdminID");
  const normalizedNextUserId = nextUserId ? String(nextUserId).trim() : "";
  const hasUserRename = normalizedNextUserId && normalizedNextUserId !== currentUserId;
  const hasPasswordChange = Boolean(nextPassword);

  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const ownershipResult = await new sql.Request(transaction)
      .input("adminId", sql.NVarChar, adminId)
      .input("currentUserId", sql.NVarChar, currentUserId)
      .query(`
        SELECT TOP (1) *
        FROM ${userTable}
        WHERE ${userIdColumn} = @currentUserId
          AND ${adminColumn} = @adminId
      `);

    const existingUser = ownershipResult.recordset[0] || null;

    if (!existingUser) {
      await transaction.rollback();
      return { status: "not_found", user: null };
    }

    if (hasUserRename) {
      const duplicateResult = await new sql.Request(transaction)
        .input("nextUserId", sql.NVarChar, normalizedNextUserId)
        .query(`
          SELECT TOP (1) ${userIdColumn} AS [userId]
          FROM ${userTable}
          WHERE ${userIdColumn} = @nextUserId
        `);

      if (duplicateResult.recordset.length > 0) {
        await transaction.rollback();
        return { status: "duplicate_user_id", user: null };
      }
    }

    const updates = [];
    const request = new sql.Request(transaction)
      .input("adminId", sql.NVarChar, adminId)
      .input("currentUserId", sql.NVarChar, currentUserId);

    if (hasUserRename) {
      updates.push(`${userIdColumn} = @nextUserId`);
      request.input("nextUserId", sql.NVarChar, normalizedNextUserId);
    }

    if (hasPasswordChange) {
      updates.push(`${passwordColumn} = @nextPassword`);
      request.input("nextPassword", sql.NVarChar, await createPasswordHash(nextPassword));
    }

    if (updates.length === 0) {
      await transaction.rollback();

      return {
        status: "no_changes",
        user: sanitizeRecord(
          existingUser,
          [process.env.USER_PASSWORD_COLUMN || "Password"]
        )
      };
    }

    const updatedUserResult = await request.query(`
      UPDATE ${userTable}
      SET ${updates.join(", ")}
      OUTPUT INSERTED.*
      WHERE ${userIdColumn} = @currentUserId
        AND ${adminColumn} = @adminId
    `);

    const updatedUser = updatedUserResult.recordset[0] || null;

    if (!updatedUser) {
      await transaction.rollback();
      return { status: "not_found", user: null };
    }

    if (hasUserRename) {
      const relatedTables = ["UserPages", "Projects", "Tasks", "Compliance"];
      for (const tableName of relatedTables) {
        await new sql.Request(transaction)
          .input("currentUserId", sql.NVarChar, currentUserId)
          .input("nextUserId", sql.NVarChar, normalizedNextUserId)
          .query(`
            UPDATE ${escapeIdentifier(tableName)}
            SET [UserID] = @nextUserId
            WHERE [UserID] = @currentUserId
          `);
      }
    }

    await transaction.commit();
    return {
      status: "updated",
      user: sanitizeRecord(updatedUser, [process.env.USER_PASSWORD_COLUMN || "Password"])
    };
  } catch (error) {
    try {
      await transaction.rollback();
    } catch (_rollbackError) {
      // Ignore rollback failures; the original error is more useful.
    }

    throw error;
  }
}

module.exports = {
  createAdmin,
  listAdmins,
  listUsers,
  listUsersForAdmin,
  updateAdminPassword,
  updateAssignedUserCredentials,
  validateAdminCredentials,
  validateUserCredentials
};

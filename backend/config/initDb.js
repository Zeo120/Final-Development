const { sql, getPool } = require("./db");
const { createPasswordHash, verifyPassword } = require("../utils/hashpasswords");

function escapeIdentifier(identifier) {
  return `[${String(identifier).replace(/]/g, "]]")}]`;
}

async function ensureTable(tableName, columns) {
  const pool = await getPool();
  const safeTable = escapeIdentifier(tableName);

  const columnDefs = columns.map(col => {
    let def = `${escapeIdentifier(col.name)} ${col.type}`;
    if (col.primaryKey) def += " PRIMARY KEY";
    if (col.notNull) def += " NOT NULL";
    if (col.default) def += ` DEFAULT ${col.default}`;
    if (col.references) {
      const ref = col.references;
      def += ` FOREIGN KEY REFERENCES ${escapeIdentifier(ref.table)}(${escapeIdentifier(ref.column)})`;
    }
    return def;
  }).join(",\n        ");

  const query = `
    IF OBJECT_ID(N'${tableName.replace(/'/g, "''")}', N'U') IS NULL
    BEGIN
      CREATE TABLE ${safeTable} (
        ${columnDefs}
      );
    END
  `;

  await pool.request().query(query);
}

async function seedUserIfTableEmpty({ tableName, idColumn, passwordColumn, idValue, passwordValue }) {
  if (!idValue || !passwordValue) {
    return;
  }

  const pool = await getPool();
  const safeTable = escapeIdentifier(tableName);
  const safeIdColumn = escapeIdentifier(idColumn);
  const safePasswordColumn = escapeIdentifier(passwordColumn);
  const countQuery = `SELECT COUNT(1) AS [count] FROM ${safeTable};`;
  const countResult = await pool.request().query(countQuery);
  const existingCount = Number(countResult.recordset[0] && countResult.recordset[0].count ? countResult.recordset[0].count : 0);

  if (existingCount > 0) {
    return;
  }

  const insertQuery = `
    INSERT INTO ${safeTable} (${safeIdColumn}, ${safePasswordColumn})
    VALUES (@idValue, @passwordValue);
  `;

  const passwordHash = await createPasswordHash(passwordValue);
  await pool
    .request()
    .input("idValue", sql.NVarChar, idValue)
    .input("passwordValue", sql.NVarChar, passwordHash)
    .query(insertQuery);
}

async function initializeDatabase() {
  const adminTable = process.env.ADMIN_TABLE || "Admins";
  const userTable = process.env.USER_TABLE || "Users";
  const adminIdColumn = process.env.ADMIN_ID_COLUMN || "AdminID";
  const adminPasswordColumn = process.env.ADMIN_PASSWORD_COLUMN || "Password";
  const userIdColumn = process.env.USER_ID_COLUMN || "UserID";
  const userPasswordColumn = process.env.USER_PASSWORD_COLUMN || "Password";

  const pool = await getPool();

  // Auth Tables
  await ensureTable(adminTable, [
    { name: adminIdColumn, type: "NVARCHAR(100)", primaryKey: true, notNull: true },
    { name: adminPasswordColumn, type: "NVARCHAR(500)", notNull: true },
    { name: "CreatedAt", type: "DATETIME2", notNull: true, default: "SYSUTCDATETIME()" }
  ]);

  await ensureTable(userTable, [
    { name: userIdColumn, type: "NVARCHAR(100)", primaryKey: true, notNull: true },
    { name: userPasswordColumn, type: "NVARCHAR(500)", notNull: true },
    { name: adminIdColumn, type: "NVARCHAR(100)", notNull: false, references: { table: adminTable, column: adminIdColumn } },
    { name: "CreatedAt", type: "DATETIME2", notNull: true, default: "SYSUTCDATETIME()" }
  ]);

  // Hierarchical Structure: User Dashboard Pages (allowing both AdminID and UserID)
  await ensureTable("UserPages", [
    { name: "PageID", type: "INT IDENTITY(1,1)", primaryKey: true, notNull: true },
    { name: "UserID", type: "NVARCHAR(100)", notNull: true }, // Relaxed FK to allow Admins or Users
    { name: "Title", type: "NVARCHAR(100)", notNull: true },
    { name: "Slug", type: "NVARCHAR(100)", notNull: true },
    { name: "IsDefault", type: "BIT", notNull: true, default: "0" },
    { name: "CreatedAt", type: "DATETIME2", notNull: true, default: "SYSUTCDATETIME()" }
  ]);

  // Hierarchical Structure: Page Widgets
  await ensureTable("Widgets", [
    { name: "WidgetID", type: "INT IDENTITY(1,1)", primaryKey: true, notNull: true },
    { name: "PageID", type: "INT", notNull: true, references: { table: "UserPages", column: "PageID" } },
    { name: "Type", type: "NVARCHAR(50)", notNull: true }, // e.g., 'project-summary', 'task-list'
    { name: "Title", type: "NVARCHAR(255)", notNull: false },
    { name: "Settings", type: "NVARCHAR(MAX)", notNull: false }, // JSON string
    { name: "Position", type: "INT", notNull: true, default: "0" },
    { name: "CreatedAt", type: "DATETIME2", notNull: true, default: "SYSUTCDATETIME()" }
  ]);

  // Projects Table (Now optionally linked to a Page)
  await ensureTable("Projects", [
    { name: "ProjectID", type: "INT IDENTITY(1,1)", primaryKey: true, notNull: true },
    { name: "UserID", type: "NVARCHAR(100)", notNull: true },
    { name: "Title", type: "NVARCHAR(255)", notNull: true },
    { name: "Status", type: "NVARCHAR(50)", notNull: true, default: "'Active'" },
    { name: "Budget", type: "DECIMAL(18,2)", notNull: false },
    { name: "Spent", type: "DECIMAL(18,2)", notNull: false, default: "0" },
    { name: "CreatedAt", type: "DATETIME2", notNull: true, default: "SYSUTCDATETIME()" }
  ]);

  // Tasks Table
  await ensureTable("Tasks", [
    { name: "TaskID", type: "INT IDENTITY(1,1)", primaryKey: true, notNull: true },
    { name: "UserID", type: "NVARCHAR(100)", notNull: true },
    { name: "Description", type: "NVARCHAR(MAX)", notNull: true },
    { name: "Priority", type: "NVARCHAR(20)", notNull: true, default: "'Medium'" },
    { name: "DueDate", type: "DATETIME2", notNull: false },
    { name: "IsCompleted", type: "BIT", notNull: true, default: "0" },
    { name: "CreatedAt", type: "DATETIME2", notNull: true, default: "SYSUTCDATETIME()" }
  ]);

  // Compliance Table
  await ensureTable("Compliance", [
    { name: "ComplianceID", type: "INT IDENTITY(1,1)", primaryKey: true, notNull: true },
    { name: "UserID", type: "NVARCHAR(100)", notNull: true },
    { name: "Title", type: "NVARCHAR(255)", notNull: true },
    { name: "Status", type: "NVARCHAR(50)", notNull: true, default: "'Pending'" },
    { name: "Deadline", type: "DATETIME2", notNull: false },
    { name: "CreatedAt", type: "DATETIME2", notNull: true, default: "SYSUTCDATETIME()" }
  ]);

  await ensureTable("FiscalYears", [
    { name: "FiscalYearID", type: "INT IDENTITY(1,1)", primaryKey: true, notNull: true },
    { name: "UserID", type: "NVARCHAR(100)", notNull: true },
    { name: "Title", type: "NVARCHAR(100)", notNull: true },
    { name: "StartDate", type: "DATE", notNull: true },
    { name: "EndDate", type: "DATE", notNull: true },
    { name: "CreatedAt", type: "DATETIME2", notNull: true, default: "SYSUTCDATETIME()" }
  ]);

  await ensureTable("FiscalMonths", [
    { name: "MonthID", type: "INT IDENTITY(1,1)", primaryKey: true, notNull: true },
    { name: "FiscalYearID", type: "INT", notNull: true, references: { table: "FiscalYears", column: "FiscalYearID" } },
    { name: "MonthName", type: "NVARCHAR(50)", notNull: true },
    { name: "MonthIndex", type: "INT", notNull: true, default: "1" },
    { name: "Status", type: "NVARCHAR(50)", notNull: true, default: "'Not Filed'" },
    { name: "TotalITC", type: "DECIMAL(18,2)", notNull: true, default: "0" },
    { name: "CreatedAt", type: "DATETIME2", notNull: true, default: "SYSUTCDATETIME()" }
  ]);

  await ensureTable("FiscalInvoices", [
    { name: "InvoiceID", type: "INT IDENTITY(1,1)", primaryKey: true, notNull: true },
    { name: "FiscalMonthID", type: "INT", notNull: true, references: { table: "FiscalMonths", column: "MonthID" } },
    { name: "InvoiceNumber", type: "NVARCHAR(100)", notNull: true },
    { name: "InvoiceValue", type: "DECIMAL(18,2)", notNull: true, default: "0" },
    { name: "TaxableValue", type: "DECIMAL(18,2)", notNull: true, default: "0" },
    { name: "CGST", type: "DECIMAL(18,2)", notNull: true, default: "0" },
    { name: "SGST", type: "DECIMAL(18,2)", notNull: true, default: "0" },
    { name: "IGST", type: "DECIMAL(18,2)", notNull: true, default: "0" },
    { name: "CreatedAt", type: "DATETIME2", notNull: true, default: "SYSUTCDATETIME()" }
  ]);

  // Seeding
  await seedUserIfTableEmpty({
    tableName: adminTable,
    idColumn: adminIdColumn,
    passwordColumn: adminPasswordColumn,
    idValue: process.env.DEFAULT_ADMIN_ID || "admin",
    passwordValue: process.env.DEFAULT_ADMIN_PASSWORD || "admin123"
  });

  // Ensure default admin password is hashed if needed
  const adminRes = await pool.request()
    .input("aid", sql.NVarChar, process.env.DEFAULT_ADMIN_ID || "admin")
    .query(`SELECT * FROM ${escapeIdentifier(adminTable)} WHERE ${escapeIdentifier(adminIdColumn)} = @aid`);
  if (
    adminRes.recordset.length > 0 &&
    !(await verifyPassword(process.env.DEFAULT_ADMIN_PASSWORD || "admin123", adminRes.recordset[0][adminPasswordColumn]))
  ) {
    console.log("Upgrading admin password to hash...");
    const adminPassHash = await createPasswordHash(process.env.DEFAULT_ADMIN_PASSWORD || "admin123");
    await pool.request()
      .input("aid", sql.NVarChar, process.env.DEFAULT_ADMIN_ID || "admin")
      .input("pass", sql.NVarChar, adminPassHash)
      .query(`UPDATE ${escapeIdentifier(adminTable)} SET ${escapeIdentifier(adminPasswordColumn)} = @pass WHERE ${escapeIdentifier(adminIdColumn)} = @aid`);
  }

  // Ensure default user exists (with hash)
  const defaultUserRes = await pool.request()
    .input("userId", sql.NVarChar, process.env.DEFAULT_USER_ID || "user")
    .query(`SELECT * FROM ${escapeIdentifier(userTable)} WHERE ${escapeIdentifier(userIdColumn)} = @userId`);

  if (defaultUserRes.recordset.length === 0) {
    const userPassHash = await createPasswordHash(process.env.DEFAULT_USER_PASSWORD || "user123");
    await pool.request()
      .input("userId", sql.NVarChar, process.env.DEFAULT_USER_ID || "user")
      .input("password", sql.NVarChar, userPassHash)
      .input("adminId", sql.NVarChar, process.env.DEFAULT_ADMIN_ID || "admin")
      .query(`INSERT INTO ${escapeIdentifier(userTable)} (${escapeIdentifier(userIdColumn)}, ${escapeIdentifier(userPasswordColumn)}, ${escapeIdentifier(adminIdColumn)}) VALUES (@userId, @password, @adminId)`);
  } else if (
    !(await verifyPassword(process.env.DEFAULT_USER_PASSWORD || "user123", defaultUserRes.recordset[0][userPasswordColumn]))
  ) {
    console.log("Upgrading default user password to hash...");
    const userUpgradeHash = await createPasswordHash(process.env.DEFAULT_USER_PASSWORD || "user123");
    await pool.request()
      .input("userId", sql.NVarChar, process.env.DEFAULT_USER_ID || "user")
      .input("newPass", sql.NVarChar, userUpgradeHash)
      .query(`UPDATE ${escapeIdentifier(userTable)} SET ${escapeIdentifier(userPasswordColumn)} = @newPass WHERE ${escapeIdentifier(userIdColumn)} = @userId`);
  }

  // Ensure ALL accounts have at least one page and widgets
  const allIdentities = [];
  const adminIds = await pool.request().query(`SELECT ${escapeIdentifier(adminIdColumn)} as ID FROM ${escapeIdentifier(adminTable)}`);
  const userIds = await pool.request().query(`SELECT ${escapeIdentifier(userIdColumn)} as ID FROM ${escapeIdentifier(userTable)}`);
  allIdentities.push(...adminIds.recordset, ...userIds.recordset);

  for (const identity of allIdentities) {
    let pageId;
    const pageRes = await pool.request()
      .input("uid", sql.NVarChar, identity.ID)
      .query("SELECT [PageID] FROM UserPages WHERE UserID = @uid AND IsDefault = 1");

    if (pageRes.recordset.length === 0) {
      console.log(`Seeding default page for identity: ${identity.ID}`);
      const pageInsertRes = await pool.request()
        .input("uid", sql.NVarChar, identity.ID)
        .query("INSERT INTO [UserPages] ([UserID], [Title], [Slug], [IsDefault]) OUTPUT INSERTED.PageID VALUES (@uid, 'Overview', 'overview', 1)");
      pageId = pageInsertRes.recordset[0].PageID;
    } else {
      pageId = pageRes.recordset[0].PageID;
    }

    const widgetCheck = await pool.request()
      .input("pid", sql.Int, pageId)
      .query("SELECT COUNT(*) as count FROM Widgets WHERE PageID = @pid");

    if (widgetCheck.recordset[0].count === 0) {
      console.log(`Seeding widgets for identity page: ${identity.ID}`);
      const widgets = [
        { type: 'project-summary', title: 'Projects Overview', pos: 0 },
        { type: 'task-list', title: 'Pending Tasks', pos: 1 }
      ];
      for (const w of widgets) {
        await pool.request()
          .input("pageId", sql.Int, pageId)
          .input("type", sql.NVarChar, w.type)
          .input("title", sql.NVarChar, w.title)
          .input("pos", sql.Int, w.pos)
          .query("INSERT INTO [Widgets] ([PageID], [Type], [Title], [Position]) VALUES (@pageId, @type, @title, @pos)");
      }
    }
  }
}

module.exports = {
  initializeDatabase
};

const { sql, getPool } = require("../config/db");
const { requireAppAuth } = require("./authController");

async function getSummaryData(userId, isAdmin) {
  const pool = await getPool();
  if (isAdmin) {
    const query = `
      SELECT 
        (SELECT COUNT(*) FROM Projects WHERE UserID IN (SELECT UserID FROM Users WHERE AdminID = @adminId)) as totalProjects,
        (SELECT COUNT(*) FROM Tasks WHERE IsCompleted = 0 AND UserID IN (SELECT UserID FROM Users WHERE AdminID = @adminId)) as pendingTasks,
        (SELECT COUNT(*) FROM Compliance WHERE Status != 'Completed' AND UserID IN (SELECT UserID FROM Users WHERE AdminID = @adminId)) as activeCompliance
    `;
    const result = await pool.request()
      .input("adminId", sql.NVarChar, userId)
      .query(query);
    return result.recordset[0];
  }

  const query = `
    SELECT 
      (SELECT COUNT(*) FROM Projects WHERE UserID = @userId) as totalProjects,
      (SELECT COUNT(*) FROM Tasks WHERE UserID = @userId AND IsCompleted = 0) as pendingTasks,
      (SELECT COUNT(*) FROM Compliance WHERE UserID = @userId AND Status != 'Completed') as activeCompliance
  `;
  const result = await pool.request()
    .input("userId", sql.NVarChar, userId)
    .query(query);
  return result.recordset[0];
}

async function getProjectList(userId, isAdmin) {
  const pool = await getPool();
  let query = "SELECT * FROM Projects";
  if (isAdmin) {
    query += " WHERE UserID IN (SELECT UserID FROM Users WHERE AdminID = @adminId)";
  } else {
    query += " WHERE UserID = @userId";
  }
  query += " ORDER BY CreatedAt DESC";

  const request = pool.request();
  if (isAdmin) {
    request.input("adminId", sql.NVarChar, userId);
  } else {
    request.input("userId", sql.NVarChar, userId);
  }

  const result = await request.query(query);
  return result.recordset;
}

async function createProject(userId, title, budget) {
  const pool = await getPool();
  const query = `
    INSERT INTO Projects (UserID, Title, Budget, Status)
    OUTPUT INSERTED.*
    VALUES (@userId, @title, @budget, 'Active')
  `;
  const result = await pool.request()
    .input("userId", sql.NVarChar, userId)
    .input("title", sql.NVarChar, title)
    .input("budget", sql.Decimal(18, 2), budget == null || budget === "" ? null : Number(budget))
    .query(query);
  return result.recordset[0];
}

async function updateProjectStatus(projectId, status, userId, isAdmin) {
  const pool = await getPool();
  const query = isAdmin
    ? "UPDATE Projects SET Status = @status WHERE ProjectID = @projectId AND UserID IN (SELECT UserID FROM Users WHERE AdminID = @adminId)"
    : "UPDATE Projects SET Status = @status WHERE ProjectID = @projectId AND UserID = @userId";
  const request = pool.request()
    .input("projectId", sql.Int, projectId)
    .input("status", sql.NVarChar, status);

  if (isAdmin) {
    request.input("adminId", sql.NVarChar, userId);
  } else {
    request.input("userId", sql.NVarChar, userId);
  }

  const result = await request.query(query);
  return result.rowsAffected[0] > 0;
}

async function getTaskList(userId, isAdmin) {
  const pool = await getPool();
  let query = "SELECT * FROM Tasks";
  if (isAdmin) {
    query += " WHERE UserID IN (SELECT UserID FROM Users WHERE AdminID = @adminId)";
  } else {
    query += " WHERE UserID = @userId";
  }
  query += " ORDER BY DueDate ASC, CreatedAt DESC";

  const request = pool.request();
  if (isAdmin) {
    request.input("adminId", sql.NVarChar, userId);
  } else {
    request.input("userId", sql.NVarChar, userId);
  }

  const result = await request.query(query);
  return result.recordset;
}

async function createTask(userId, description, priority, dueDate) {
  const pool = await getPool();
  const query = `
    INSERT INTO Tasks (UserID, Description, Priority, DueDate, IsCompleted)
    OUTPUT INSERTED.*
    VALUES (@userId, @description, @priority, @dueDate, 0)
  `;
  const result = await pool.request()
    .input("userId", sql.NVarChar, userId)
    .input("description", sql.NVarChar, description)
    .input("priority", sql.NVarChar, priority)
    .input("dueDate", sql.DateTime2, dueDate || null)
    .query(query);
  return result.recordset[0];
}

async function toggleTaskCompletion(taskId, isCompleted, userId, isAdmin) {
  const pool = await getPool();
  const query = isAdmin
    ? "UPDATE Tasks SET IsCompleted = @isCompleted WHERE TaskID = @taskId AND UserID IN (SELECT UserID FROM Users WHERE AdminID = @adminId)"
    : "UPDATE Tasks SET IsCompleted = @isCompleted WHERE TaskID = @taskId AND UserID = @userId";
  const request = pool.request()
    .input("taskId", sql.Int, taskId)
    .input("isCompleted", sql.Bit, Boolean(isCompleted));

  if (isAdmin) {
    request.input("adminId", sql.NVarChar, userId);
  } else {
    request.input("userId", sql.NVarChar, userId);
  }

  const result = await request.query(query);
  return result.rowsAffected[0] > 0;
}

async function getComplianceList(userId, isAdmin) {
  const pool = await getPool();
  let query = "SELECT * FROM Compliance";
  if (isAdmin) {
    query += " WHERE UserID IN (SELECT UserID FROM Users WHERE AdminID = @adminId)";
  } else {
    query += " WHERE UserID = @userId";
  }
  query += " ORDER BY Deadline ASC";

  const request = pool.request();
  if (isAdmin) {
    request.input("adminId", sql.NVarChar, userId);
  } else {
    request.input("userId", sql.NVarChar, userId);
  }

  const result = await request.query(query);
  return result.recordset;
}

async function createComplianceItem(userId, title, deadline) {
  const pool = await getPool();
  const query = `
    INSERT INTO Compliance (UserID, Title, Deadline, Status)
    OUTPUT INSERTED.*
    VALUES (@userId, @title, @deadline, 'Pending')
  `;
  const result = await pool.request()
    .input("userId", sql.NVarChar, userId)
    .input("title", sql.NVarChar, title)
    .input("deadline", sql.DateTime2, deadline || null)
    .query(query);
  return result.recordset[0];
}

async function userBelongsToAdmin(adminId, targetUserId) {
  const pool = await getPool();
  const result = await pool.request()
    .input("adminId", sql.NVarChar, adminId)
    .input("userId", sql.NVarChar, targetUserId)
    .query("SELECT 1 FROM Users WHERE UserID = @userId AND AdminID = @adminId");

  return result.recordset.length > 0;
}

async function getFiscalYearById(fiscalYearId) {
  const pool = await getPool();
  const result = await pool.request()
    .input("fiscalYearId", sql.Int, fiscalYearId)
    .query("SELECT * FROM FiscalYears WHERE FiscalYearID = @fiscalYearId");
  return result.recordset[0];
}

async function fetchFiscalYearsForUser(userId) {
  const pool = await getPool();
  const result = await pool.request()
    .input("userId", sql.NVarChar, userId)
    .query("SELECT FiscalYearID, UserID, Title, StartDate, EndDate FROM FiscalYears WHERE UserID = @userId ORDER BY StartDate DESC");

  return result.recordset;
}

async function getFiscalMonthById(fiscalMonthId) {
  const pool = await getPool();
  const result = await pool.request()
    .input("fiscalMonthId", sql.Int, fiscalMonthId)
    .query(`
      SELECT TOP (1) *
      FROM FiscalMonths
      WHERE MonthID = @fiscalMonthId
    `);

  return result.recordset[0] || null;
}

function getAuthenticatedIdentity(req, res, allowedRoles = ["admin", "user"]) {
  return requireAppAuth(req, res, allowedRoles);
}

async function summaryHandler(req, res, next) {
  try {
    const auth = getAuthenticatedIdentity(req, res);
    if (!auth) return;

    const data = await getSummaryData(auth.userId, auth.role === "admin");
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function projectsHandler(req, res, next) {
  try {
    const auth = getAuthenticatedIdentity(req, res);
    if (!auth) return;

    const data = await getProjectList(auth.userId, auth.role === "admin");
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function createProjectHandler(req, res, next) {
  try {
    const auth = getAuthenticatedIdentity(req, res, ["admin"]);
    if (!auth) return;

    const userId = String(req.body.userId || "").trim();
    const title = String(req.body.title || "").trim();
    const budget = req.body.budget;

    if (!userId || !title) {
      return res.status(400).json({ success: false, message: "User ID and title are required." });
    }

    const hasAccess = await userBelongsToAdmin(auth.userId, userId);
    if (!hasAccess) {
      return res.status(403).json({ success: false, message: "Not allowed to manage that client." });
    }

    const project = await createProject(userId, title, budget);
    res.status(201).json({ success: true, project });
  } catch (err) {
    next(err);
  }
}

async function updateProjectStatusHandler(req, res, next) {
  try {
    const auth = getAuthenticatedIdentity(req, res);
    if (!auth) return;

    const projectId = Number(req.params.projectId);
    const status = String(req.body.status || "").trim();

    if (!Number.isInteger(projectId) || projectId <= 0 || !status) {
      return res.status(400).json({ success: false, message: "Valid project ID and status are required." });
    }

    const updated = await updateProjectStatus(projectId, status, auth.userId, auth.role === "admin");
    if (!updated) {
      return res.status(404).json({ success: false, message: "Project not found." });
    }

    return res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

async function tasksHandler(req, res, next) {
  try {
    const auth = getAuthenticatedIdentity(req, res);
    if (!auth) return;

    const data = await getTaskList(auth.userId, auth.role === "admin");
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function createTaskHandler(req, res, next) {
  try {
    const auth = getAuthenticatedIdentity(req, res, ["admin"]);
    if (!auth) return;

    const userId = String(req.body.userId || "").trim();
    const description = String(req.body.description || "").trim();
    const priority = String(req.body.priority || "Medium").trim();
    const dueDate = req.body.dueDate;

    if (!userId || !description) {
      return res.status(400).json({ success: false, message: "User ID and description are required." });
    }

    const hasAccess = await userBelongsToAdmin(auth.userId, userId);
    if (!hasAccess) {
      return res.status(403).json({ success: false, message: "Not allowed to manage that client." });
    }

    const task = await createTask(userId, description, priority, dueDate);
    res.status(201).json({ success: true, task });
  } catch (err) {
    next(err);
  }
}

async function toggleTaskCompletionHandler(req, res, next) {
  try {
    const auth = getAuthenticatedIdentity(req, res);
    if (!auth) return;

    const taskId = Number(req.params.taskId);
    const isCompleted = req.body.isCompleted;

    if (!Number.isInteger(taskId) || taskId <= 0 || typeof isCompleted !== "boolean") {
      return res.status(400).json({ success: false, message: "Valid task ID and completion state are required." });
    }

    const updated = await toggleTaskCompletion(taskId, isCompleted, auth.userId, auth.role === "admin");
    if (!updated) {
      return res.status(404).json({ success: false, message: "Task not found." });
    }

    return res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

async function complianceHandler(req, res, next) {
  try {
    const auth = getAuthenticatedIdentity(req, res);
    if (!auth) return;

    const data = await getComplianceList(auth.userId, auth.role === "admin");
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function createComplianceItemHandler(req, res, next) {
  try {
    const auth = getAuthenticatedIdentity(req, res, ["admin"]);
    if (!auth) return;

    const userId = String(req.body.userId || "").trim();
    const title = String(req.body.title || "").trim();
    const deadline = req.body.deadline;

    if (!userId || !title) {
      return res.status(400).json({ success: false, message: "User ID and title are required." });
    }

    const hasAccess = await userBelongsToAdmin(auth.userId, userId);
    if (!hasAccess) {
      return res.status(403).json({ success: false, message: "Not allowed to manage that client." });
    }

    const item = await createComplianceItem(userId, title, deadline);
    res.status(201).json({ success: true, item });
  } catch (err) {
    next(err);
  }
}

async function fiscalYearsHandler(req, res, next) {
  try {
    const auth = getAuthenticatedIdentity(req, res);
    if (!auth) return;

    const targetUserId = auth.role === "admin"
      ? String(req.query.userId || "").trim()
      : auth.userId;

    if (auth.role === "admin" && !targetUserId) {
      return res.status(400).json({ success: false, message: "Client userId is required." });
    }

    if (auth.role === "admin") {
      const hasAccess = await userBelongsToAdmin(auth.userId, targetUserId);
      if (!hasAccess) {
        return res.status(403).json({ success: false, message: "Not allowed to access that client." });
      }
    }

    const data = await fetchFiscalYearsForUser(targetUserId);
    return res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function fiscalYearDetailsHandler(req, res, next) {
  try {
    const auth = getAuthenticatedIdentity(req, res);
    if (!auth) return;

    const fiscalYearId = Number(req.params.yearId);
    if (!Number.isInteger(fiscalYearId) || fiscalYearId <= 0) {
      return res.status(400).json({ success: false, message: "Valid fiscal year ID is required." });
    }

    const fiscalYear = await getFiscalYearById(fiscalYearId);
    if (!fiscalYear) {
      return res.status(404).json({ success: false, message: "Fiscal year not found." });
    }

    if (auth.role === "user" && fiscalYear.UserID !== auth.userId) {
      return res.status(403).json({ success: false, message: "Not allowed to view that fiscal year." });
    }

    if (auth.role === "admin") {
      const hasAccess = await userBelongsToAdmin(auth.userId, fiscalYear.UserID);
      if (!hasAccess) {
        return res.status(403).json({ success: false, message: "Not allowed to access that client's fiscal records." });
      }
    }

    const pool = await getPool();
    const monthsResult = await pool.request()
      .input("fiscalYearId", sql.Int, fiscalYearId)
      .query(`
        SELECT MonthID, FiscalYearID, MonthName, MonthIndex, Status, TotalITC
        FROM FiscalMonths
        WHERE FiscalYearID = @fiscalYearId
        ORDER BY MonthIndex ASC
      `);
    const invoicesResult = await pool.request()
      .input("fiscalYearId", sql.Int, fiscalYearId)
      .query(`
        SELECT
          fi.InvoiceID,
          fi.FiscalMonthID,
          fm.MonthName,
          fm.MonthIndex,
          fi.InvoiceNumber,
          fi.InvoiceValue,
          fi.TaxableValue,
          fi.CGST,
          fi.SGST,
          fi.IGST
        FROM FiscalInvoices fi
        INNER JOIN FiscalMonths fm ON fi.FiscalMonthID = fm.MonthID
        WHERE fm.FiscalYearID = @fiscalYearId
        ORDER BY fm.MonthIndex ASC, fi.CreatedAt ASC
      `);
    return res.json({ success: true, year: fiscalYear, months: monthsResult.recordset, invoices: invoicesResult.recordset });
  } catch (err) {
    next(err);
  }
}

async function createFiscalYearHandler(req, res, next) {
  try {
    const auth = getAuthenticatedIdentity(req, res, ["admin"]);
    if (!auth) return;

    const userId = String(req.body.userId || "").trim();
    const title = String(req.body.title || "").trim();
    const startDate = req.body.startDate;
    const endDate = req.body.endDate;

    if (!userId || !title || !startDate || !endDate) {
      return res.status(400).json({ success: false, message: "userId, title, startDate, and endDate are required." });
    }

    const hasAccess = await userBelongsToAdmin(auth.userId, userId);
    if (!hasAccess) {
      return res.status(403).json({ success: false, message: "Not allowed to manage that client." });
    }

    const pool = await getPool();
    const result = await pool.request()
      .input("userId", sql.NVarChar, userId)
      .input("title", sql.NVarChar, title)
      .input("startDate", sql.Date, startDate)
      .input("endDate", sql.Date, endDate)
      .query(`
        INSERT INTO FiscalYears (UserID, Title, StartDate, EndDate)
        OUTPUT INSERTED.*
        VALUES (@userId, @title, @startDate, @endDate)
      `);

    return res.status(201).json({ success: true, fiscalYear: result.recordset[0] });
  } catch (err) {
    next(err);
  }
}

async function createFiscalMonthHandler(req, res, next) {
  try {
    const auth = getAuthenticatedIdentity(req, res, ["admin"]);
    if (!auth) return;

    const fiscalYearId = Number(req.body.fiscalYearId);
    const monthIndex = Number(req.body.monthIndex);
    const monthName = String(req.body.monthName || "").trim();
    const status = String(req.body.status || "Not Filed").trim();
    const totalItc = Number(req.body.totalItc || 0);

    if (!Number.isInteger(fiscalYearId) || fiscalYearId <= 0 || !monthName) {
      return res.status(400).json({ success: false, message: "Valid fiscalYearId and monthName are required." });
    }

    if (!Number.isInteger(monthIndex) || monthIndex < 1 || monthIndex > 12) {
      return res.status(400).json({ success: false, message: "monthIndex must be between 1 and 12." });
    }

    const fiscalYear = await getFiscalYearById(fiscalYearId);
    if (!fiscalYear) {
      return res.status(404).json({ success: false, message: "Fiscal year not found." });
    }

    const hasAccess = await userBelongsToAdmin(auth.userId, fiscalYear.UserID);
    if (!hasAccess) {
      return res.status(403).json({ success: false, message: "Not allowed to modify that fiscal year." });
    }

    const pool = await getPool();
    const result = await pool.request()
      .input("fiscalYearId", sql.Int, fiscalYearId)
      .input("monthName", sql.NVarChar, monthName)
      .input("monthIndex", sql.Int, monthIndex)
      .input("status", sql.NVarChar, status)
      .input("totalItc", sql.Decimal(18, 2), totalItc)
      .query(`
        INSERT INTO FiscalMonths (FiscalYearID, MonthName, MonthIndex, Status, TotalITC)
        OUTPUT INSERTED.*
        VALUES (@fiscalYearId, @monthName, @monthIndex, @status, @totalItc)
      `);

    return res.status(201).json({ success: true, month: result.recordset[0] });
  } catch (err) {
    next(err);
  }
}

async function createFiscalInvoiceHandler(req, res, next) {
  try {
    const auth = getAuthenticatedIdentity(req, res, ["admin"]);
    if (!auth) return;

    const fiscalMonthId = Number(req.body.fiscalMonthId);
    const invoiceNumber = String(req.body.invoiceNumber || "").trim();
    const invoiceValue = Number(req.body.invoiceValue || 0);
    const taxableValue = Number(req.body.taxableValue || 0);
    const cgst = Number(req.body.cgst || 0);
    const sgst = Number(req.body.sgst || 0);
    const igst = Number(req.body.igst || 0);

    if (!Number.isInteger(fiscalMonthId) || fiscalMonthId <= 0 || !invoiceNumber) {
      return res.status(400).json({ success: false, message: "Valid fiscalMonthId and invoiceNumber are required." });
    }

    const month = await getFiscalMonthById(fiscalMonthId);
    if (!month) {
      return res.status(404).json({ success: false, message: "Fiscal month not found." });
    }

    const fiscalYear = await getFiscalYearById(month.FiscalYearID);
    if (!fiscalYear) {
      return res.status(404).json({ success: false, message: "Fiscal year not found." });
    }

    const hasAccess = await userBelongsToAdmin(auth.userId, fiscalYear.UserID);
    if (!hasAccess) {
      return res.status(403).json({ success: false, message: "Not allowed to add invoices for that fiscal year." });
    }

    const pool = await getPool();
    const result = await pool.request()
      .input("fiscalMonthId", sql.Int, fiscalMonthId)
      .input("invoiceNumber", sql.NVarChar, invoiceNumber)
      .input("invoiceValue", sql.Decimal(18, 2), invoiceValue)
      .input("taxableValue", sql.Decimal(18, 2), taxableValue)
      .input("cgst", sql.Decimal(18, 2), cgst)
      .input("sgst", sql.Decimal(18, 2), sgst)
      .input("igst", sql.Decimal(18, 2), igst)
      .query(`
        INSERT INTO FiscalInvoices (FiscalMonthID, InvoiceNumber, InvoiceValue, TaxableValue, CGST, SGST, IGST)
        OUTPUT INSERTED.*
        VALUES (@fiscalMonthId, @invoiceNumber, @invoiceValue, @taxableValue, @cgst, @sgst, @igst)
      `);

    return res.status(201).json({ success: true, invoice: result.recordset[0] });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createComplianceItem,
  createComplianceItemHandler,
  createProject,
  createProjectHandler,
  createTask,
  createTaskHandler,
  getComplianceList,
  getProjectList,
  getSummaryData,
  getTaskList,
  projectsHandler,
  summaryHandler,
  tasksHandler,
  toggleTaskCompletion,
  toggleTaskCompletionHandler,
  updateProjectStatus,
  updateProjectStatusHandler,
  complianceHandler,
  fiscalYearsHandler,
  fiscalYearDetailsHandler,
  createFiscalYearHandler,
  createFiscalMonthHandler,
  createFiscalInvoiceHandler
};

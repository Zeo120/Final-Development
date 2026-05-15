const express = require("express");
const {
  adminLogin,
  createAdminAccount,
  getAdminAccounts,
  getUsers,
  modifyAdminAccount,
  modifyAssignedUser,
  superAdminLogin,
  userLogin
} = require("../controllers/authController");
const {
  summaryHandler,
  projectsHandler,
  createProjectHandler,
  updateProjectStatusHandler,
  tasksHandler,
  createTaskHandler,
  toggleTaskCompletionHandler,
  complianceHandler,
  createComplianceItemHandler,
  fiscalYearsHandler,
  fiscalYearDetailsHandler,
  createFiscalYearHandler,
  createFiscalMonthHandler,
  createFiscalInvoiceHandler
} = require("../controllers/dataController");
const { listPages, getPageDetails, createNewPage, addNewWidget, removeWidget } = require("../controllers/pageController");
const { authRateLimit, sessionRateLimit } = require("../middleware/rateLimiter");

const router = express.Router();

// Apply session rate limit to all API routes
router.use(sessionRateLimit);

// Auth Routes
router.post("/auth/admin-login", authRateLimit, adminLogin);
router.post("/auth/user-login", authRateLimit, userLogin);
router.post("/auth/super-admin-login", authRateLimit, superAdminLogin);

// Admin Routes
router.get("/admins", getAdminAccounts);
router.post("/admins", authRateLimit, createAdminAccount);
router.patch("/admins/:adminId", authRateLimit, modifyAdminAccount);

// User Routes
router.get("/users", getUsers);
router.patch("/users/:userId", authRateLimit, modifyAssignedUser);

// Data Routes
router.get("/data/summary", summaryHandler);
router.get("/data/projects", projectsHandler);
router.post("/data/projects", createProjectHandler);
router.patch("/data/projects/:projectId/status", updateProjectStatusHandler);
router.get("/data/tasks", tasksHandler);
router.post("/data/tasks", createTaskHandler);
router.patch("/data/tasks/:taskId/toggle", toggleTaskCompletionHandler);
router.get("/data/compliance", complianceHandler);
router.post("/data/compliance", createComplianceItemHandler);

// Compliance Routes
router.get("/compliance/fiscal-years", fiscalYearsHandler);
router.get("/compliance/fiscal-years/:yearId", fiscalYearDetailsHandler);
router.post("/compliance/fiscal-years", createFiscalYearHandler);
router.post("/compliance/months", createFiscalMonthHandler);
router.post("/compliance/invoices", createFiscalInvoiceHandler);

// Page Routes
router.get("/pages", listPages);
router.post("/pages", createNewPage);
router.get("/pages/:pageId/widgets", getPageDetails);
router.post("/pages/:pageId/widgets", addNewWidget);
router.delete("/widgets/:widgetId", removeWidget);

module.exports = router;

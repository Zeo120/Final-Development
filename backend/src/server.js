const path = require("path");
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
const { initializeDatabase } = require("../config/initDb");

const app = express();
const rootDir = path.resolve(__dirname, "..", "..");
const port = Number(process.env.PORT || 3000);
let databaseInitializationState = {
  ready: false,
  message: "Database initialization has not started."
};

const rateLimitBuckets = new Map();
const RATE_LIMIT_CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
let nextBucketCleanupAt = Date.now() + RATE_LIMIT_CLEANUP_INTERVAL_MS;

function setSecurityHeaders(_req, res, next) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  res.setHeader("Content-Security-Policy", "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; font-src 'self' data:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'");
  next();
}

function createRateLimitMiddleware({ windowMs, maxRequests }) {
  const refillRatePerMs = windowMs > 0 ? maxRequests / windowMs : maxRequests;
  return (req, res, next) => {
    const forwardedFor = String(req.headers["x-forwarded-for"] || "");
    const sourceIp = forwardedFor.split(",")[0].trim() || req.socket.remoteAddress || "unknown";
    const key = `${req.method}:${req.path}:${sourceIp}`;
    const now = Date.now();

    if (now >= nextBucketCleanupAt) {
      for (const [bucketKey, bucket] of rateLimitBuckets.entries()) {
        if (now - bucket.last > windowMs * 2) {
          rateLimitBuckets.delete(bucketKey);
        }
      }
      nextBucketCleanupAt = now + RATE_LIMIT_CLEANUP_INTERVAL_MS;
    }

    const bucket = rateLimitBuckets.get(key) || { tokens: maxRequests, last: now };
    const elapsed = Math.max(0, now - bucket.last);

    if (elapsed > 0) {
      bucket.tokens = Math.min(maxRequests, bucket.tokens + elapsed * refillRatePerMs);
    }

    bucket.last = now;

    if (bucket.tokens < 1) {
      const missingTokens = 1 - bucket.tokens;
      const retryAfterMs = refillRatePerMs > 0
        ? Math.max(1, Math.ceil(missingTokens / refillRatePerMs))
        : windowMs || 1000;
      res.setHeader("Retry-After", String(Math.ceil(retryAfterMs / 1000)));
      return res.status(429).json({
        success: false,
        message: "Too many requests. Please try again later."
      });
    }

    bucket.tokens -= 1;
    rateLimitBuckets.set(key, bucket);
    return next();
  };
}

app.disable("x-powered-by");
app.use(setSecurityHeaders);
app.use(express.json({ limit: "16kb" }));
app.use(express.urlencoded({ extended: true, limit: "16kb" }));
app.use(express.static(rootDir, {
  setHeaders(res) {
    res.setHeader("Cache-Control", "no-store");
  }
}));

const authRateLimit = createRateLimitMiddleware({
  windowMs: 15 * 60 * 1000,
  maxRequests: 10
});

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    database: databaseInitializationState
  });
});

app.post("/api/auth/admin-login", authRateLimit, adminLogin);
app.post("/api/auth/user-login", authRateLimit, userLogin);
app.post("/api/auth/super-admin-login", authRateLimit, superAdminLogin);
app.get("/api/admins", getAdminAccounts);
app.post("/api/admins", authRateLimit, createAdminAccount);
app.patch("/api/admins/:adminId", authRateLimit, modifyAdminAccount);
app.get("/api/users", getUsers);
app.patch("/api/users/:userId", authRateLimit, modifyAssignedUser);

app.get("/api/data/summary", summaryHandler);
app.get("/api/data/projects", projectsHandler);
app.post("/api/data/projects", createProjectHandler);
app.patch("/api/data/projects/:projectId/status", updateProjectStatusHandler);
app.get("/api/data/tasks", tasksHandler);
app.post("/api/data/tasks", createTaskHandler);
app.patch("/api/data/tasks/:taskId/toggle", toggleTaskCompletionHandler);
app.get("/api/data/compliance", complianceHandler);
app.post("/api/data/compliance", createComplianceItemHandler);
app.get("/api/compliance/fiscal-years", fiscalYearsHandler);
app.get("/api/compliance/fiscal-years/:yearId", fiscalYearDetailsHandler);
app.post("/api/compliance/fiscal-years", createFiscalYearHandler);
app.post("/api/compliance/months", createFiscalMonthHandler);
app.post("/api/compliance/invoices", createFiscalInvoiceHandler);

app.get("/api/pages", listPages);
app.post("/api/pages", createNewPage);
app.get("/api/pages/:pageId/widgets", getPageDetails);
app.post("/api/pages/:pageId/widgets", addNewWidget);
app.delete("/api/widgets/:widgetId", removeWidget);

app.get("/", (_req, res) => {
  res.sendFile(path.join(rootDir, "index.html"));
});

app.get("/admin-login", (_req, res) => {
  res.sendFile(path.join(rootDir, "pages", "admin-login.html"));
});

app.get("/user-login", (_req, res) => {
  res.sendFile(path.join(rootDir, "pages", "user-login.html"));
});

app.get("/login", (_req, res) => {
  res.redirect("/user-login");
});

app.get("/super-admin-login", (_req, res) => {
  res.sendFile(path.join(rootDir, "pages", "super-admin-login.html"));
});

app.get("/admin-dashboard", (_req, res) => {
  res.sendFile(path.join(rootDir, "pages", "admin-dashboard.html"));
});

app.get("/user-dashboard", (_req, res) => {
  res.sendFile(path.join(rootDir, "pages", "user-dashboard.html"));
});

app.get("/user-vestazen", (_req, res) => {
  res.sendFile(path.join(rootDir, "pages", "user-vestazen.html"));
});

app.get("/super-admin-dashboard", (_req, res) => {
  res.sendFile(path.join(rootDir, "pages", "super-admin-dashboard.html"));
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({
    success: false,
    message: "Unexpected server error."
  });
});

async function startServer() {
  app.listen(port, () => {
    console.log(`Paradigm server listening on http://localhost:${port}`);
  });

  try {
    await initializeDatabase();
    databaseInitializationState = {
      ready: true,
      message: "Database initialized successfully."
    };
  } catch (error) {
    databaseInitializationState = {
      ready: false,
      message: String(error && error.message ? error.message : "Database initialization failed.")
    };
    console.error("Failed to initialize database.", error);
  }
}

startServer();

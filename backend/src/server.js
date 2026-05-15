const path = require("path");
const express = require("express");
const compression = require("compression");
const { initializeDatabase } = require("../config/initDb");
const { setSecurityHeaders } = require("../middleware/security");
const apiRoutes = require("../routes/apiRoutes");
const viewRoutes = require("../routes/viewRoutes");

const app = express();
const rootDir = path.resolve(__dirname, "..", "..");
const port = Number(process.env.PORT || 3000);

let databaseInitializationState = {
  ready: false,
  message: "Database initialization has not started."
};

function runDatabaseInitialization() {
  databaseInitializationState = {
    ready: false,
    message: "Database initialization is starting."
  };

  void (async () => {
    try {
      await initializeDatabase();
      databaseInitializationState = { ready: true, message: "Database initialized successfully." };
    } catch (error) {
      databaseInitializationState = {
        ready: false,
        message: String(error && error.message ? error.message : "Database initialization failed.")
      };
      console.error("Failed to initialize database.", error);
    }
  })();
}

// Global Middleware
app.disable("x-powered-by");
app.use(setSecurityHeaders);
app.use(compression());
app.use(express.json({ limit: "16kb" }));
app.use(express.urlencoded({ extended: true, limit: "16kb" }));

// Crawler / Bot Discovery Files
app.get("/robots.txt", (_req, res) => {
  res.setHeader("Content-Type", "text/plain");
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.sendFile(path.join(rootDir, "robots.txt"));
});
app.get("/sitemap.xml", (_req, res) => {
  res.setHeader("Content-Type", "application/xml");
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.sendFile(path.join(rootDir, "sitemap.xml"));
});
app.get("/llms.txt", (_req, res) => {
  res.setHeader("Content-Type", "text/plain");
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.sendFile(path.join(rootDir, "llms.txt"));
});

// Static Assets
app.use(express.static(rootDir, {
  setHeaders(res) {
    res.setHeader("Cache-Control", "no-store");
  }
}));

// Health Check
app.get("/health", (_req, res) => {
  res.json({ ok: true, database: databaseInitializationState });
});

// Routers
app.use("/api", apiRoutes);
app.use("/", viewRoutes);

// Global Error Handler
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ success: false, message: "Unexpected server error." });
});

// Initialization
let server;
async function startServer() {
  server = app.listen(port, () => {
    console.log(`Paradigm server listening on http://localhost:${port}`);
    runDatabaseInitialization();
  });
}

function gracefulShutdown(signal) {
  console.log(`\nReceived ${signal}. Starting graceful shutdown...`);
  if (server) {
    server.close(async () => {
      console.log("HTTP server closed.");
      try {
        const { closePool } = require("../config/db");
        await closePool();
        console.log("Database connection closed.");
        process.exit(0);
      } catch (err) {
        console.error("Error during database disconnection:", err);
        process.exit(1);
      }
    });
  } else {
    process.exit(0);
  }
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

startServer();

const express = require("express");
const path = require("path");

const router = express.Router();
const rootDir = path.resolve(__dirname, "..", "..");

router.get("/", (_req, res) => {
  res.sendFile(path.join(rootDir, "index.html"));
});

router.get("/admin-login", (_req, res) => {
  res.sendFile(path.join(rootDir, "pages", "admin-login.html"));
});

router.get("/user-login", (_req, res) => {
  res.sendFile(path.join(rootDir, "pages", "user-login.html"));
});

router.get("/login", (_req, res) => {
  res.redirect("/user-login");
});

router.get("/super-admin-login", (_req, res) => {
  res.sendFile(path.join(rootDir, "pages", "super-admin-login.html"));
});

router.get("/admin-dashboard", (_req, res) => {
  res.sendFile(path.join(rootDir, "pages", "admin-dashboard.html"));
});

router.get("/user-dashboard", (_req, res) => {
  res.sendFile(path.join(rootDir, "pages", "user-dashboard.html"));
});

router.get("/user-vestazen", (_req, res) => {
  res.sendFile(path.join(rootDir, "pages", "user-vestazen.html"));
});

router.get("/super-admin-dashboard", (_req, res) => {
  res.sendFile(path.join(rootDir, "pages", "super-admin-dashboard.html"));
});

module.exports = router;

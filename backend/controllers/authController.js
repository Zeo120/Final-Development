/**
 * authController.js
 * 
 * Handles all Authentication and Authorization logic.
 * 
 * ============================================================================
 * INTERN NOTES:
 * - We use JSON Web Tokens (JWT) for stateless sessions. Tokens live for 30 mins.
 * - Login endpoints explicitly track failed attempts and lock out IPs/Users 
 *   using `cacheAdapter.js` to prevent brute-force attacks.
 * - The `requireAppAuth` and `requireSuperAdmin` functions act as pseudo-middleware
 *   that strictly verify JWTs before allowing access to secure data endpoints.
 * ============================================================================
 */
const {
  createAdmin,
  listAdmins,
  listUsersForAdmin,
  updateAdminPassword,
  updateAssignedUserCredentials,
  validateAdminCredentials,
  validateUserCredentials
} = require("../models/authModel");
const {
  createSignedToken,
  isStrongPassword,
  timingSafeEqualString,
  verifySignedToken
} = require("../utils/security");
const { verifyPassword } = require("../utils/hashpasswords");

const { get, set, remove } = require("../utils/cacheAdapter");

const APP_TOKEN_TTL_MS = 1000 * 60 * 30; // 30 minutes
const SUPER_ADMIN_TOKEN_TTL_MS = 1000 * 60 * 60 * 1; // 1 hour
const MAX_LOGIN_ATTEMPTS = Number(process.env.MAX_LOGIN_ATTEMPTS || 5);
const LOGIN_LOCKOUT_DURATION_MS = Number(process.env.LOGIN_LOCKOUT_DURATION_MS || 15 * 60 * 1000);

function normalizeLoginIdentifier(value) {
  return String(value || "").trim().toLowerCase();
}

function getLoginKey(role, identifier) {
  return `${role}:${normalizeLoginIdentifier(identifier)}`;
}

async function getAccountLockStatus(role, identifier) {
  const key = `lockout:${getLoginKey(role, identifier)}`;
  const entry = await get(key);
  if (!entry || !entry.lockUntil) {
    return { locked: false, remainingMs: 0 };
  }

  const now = Date.now();
  if (now < entry.lockUntil) {
    return { locked: true, remainingMs: entry.lockUntil - now };
  }

  await remove(key);
  return { locked: false, remainingMs: 0 };
}

async function recordFailedLoginAttempt(role, identifier) {
  const key = `lockout:${getLoginKey(role, identifier)}`;
  const now = Date.now();
  const entry = await get(key) || { count: 0, lockUntil: 0 };

  if (entry.lockUntil && now >= entry.lockUntil) {
    entry.count = 0;
    entry.lockUntil = 0;
  }

  entry.count += 1;

  if (entry.count >= MAX_LOGIN_ATTEMPTS) {
    entry.lockUntil = now + LOGIN_LOCKOUT_DURATION_MS;
  }

  await set(key, entry, LOGIN_LOCKOUT_DURATION_MS * 2);
  return entry;
}

async function clearFailedLoginAttempts(role, identifier) {
  await remove(`lockout:${getLoginKey(role, identifier)}`);
}

function respondWithLockout(res, remainingMs) {
  const seconds = Math.max(1, Math.ceil(remainingMs / 1000));
  res.setHeader("Retry-After", String(seconds));
  const minutes = Math.max(1, Math.ceil(remainingMs / (60 * 1000)));

  return res.status(429).json({
    success: false,
    message: `Too many failed login attempts. Try again in ${minutes} minute(s).`
  });
}

function isDatabaseConnectivityError(error) {
  const message = String(error && error.message ? error.message : "").toLowerCase();

  return (
    message.includes("network-related") ||
    message.includes("server is not found") ||
    message.includes("not accessible") ||
    message.includes("odbc") ||
    message.includes("connection")
  );
}

function isDuplicateKeyError(error) {
  const message = String(error && error.message ? error.message : "").toLowerCase();

  return message.includes("duplicate key") || message.includes("violation of primary key");
}

function getSuperAdminId() {
  return String(process.env.SUPER_ADMIN_ID || "superadmin");
}

function getSuperAdminPassword() {
  return String(process.env.SUPER_ADMIN_PASSWORD || "");
}

function getSuperAdminPasswordHash() {
  return String(process.env.SUPER_ADMIN_PASSWORD_HASH || "");
}

function getSuperAdminTokenSecret() {
  return String(process.env.SUPER_ADMIN_TOKEN_SECRET || "");
}

function getAppTokenSecret() {
  return String(process.env.APP_TOKEN_SECRET || "");
}

async function hasValidSuperAdminCredentials(superAdminId, superAdminPassword) {
  const normalizedId = normalizeLoginIdentifier(superAdminId);
  const normalizedPassword = String(superAdminPassword || "");
  const configuredPasswordHash = getSuperAdminPasswordHash();
  const configuredSuperAdminId = normalizeLoginIdentifier(getSuperAdminId());
  const matchesId = timingSafeEqualString(normalizedId, configuredSuperAdminId);
  const matchesPassword = configuredPasswordHash
    ? await verifyPassword(normalizedPassword, configuredPasswordHash)
    : timingSafeEqualString(normalizedPassword, getSuperAdminPassword());

  return matchesId && matchesPassword;
}

function createSuperAdminToken(superAdminId) {
  return createSignedToken({
    payload: {
      role: "super-admin",
      superAdminId
    },
    secret: getSuperAdminTokenSecret(),
    ttlMs: SUPER_ADMIN_TOKEN_TTL_MS
  });
}

function verifySuperAdminToken(token) {
  return verifySignedToken(token, getSuperAdminTokenSecret(), {
    requiredRole: "super-admin"
  });
}

function createAppToken(role, userId) {
  return createSignedToken({
    payload: {
      role,
      userId
    },
    secret: getAppTokenSecret(),
    ttlMs: APP_TOKEN_TTL_MS
  });
}

function verifyAppToken(token) {
  return verifySignedToken(token, getAppTokenSecret(), {
    requiredRoles: ["admin", "user"]
  });
}

function getBearerToken(req) {
  const header = String(req.headers.authorization || "");

  if (!header.startsWith("Bearer ")) {
    return "";
  }

  return header.slice("Bearer ".length).trim();
}

function requireSuperAdmin(req, res) {
  const token = getBearerToken(req);
  const payload = verifySuperAdminToken(token);

  if (!payload) {
    res.status(401).json({
      success: false,
      message: "Super admin authorization is required."
    });
    return null;
  }

  req.auth = payload;
  return payload;
}

function requireAppAuth(req, res, allowedRoles = ["admin", "user"]) {
  const token = getBearerToken(req);
  const payload = verifyAppToken(token);

  if (!payload || !allowedRoles.includes(payload.role)) {
    res.status(401).json({
      success: false,
      message: "Authorization is required."
    });
    return null;
  }

  req.auth = payload;
  return payload;
}

function validatePasswordStrength(password) {
  if (!isStrongPassword(password)) {
    return "Password must be at least 8 characters and include upper, lower, number, and special character.";
  }

  return "";
}

async function adminLogin(req, res, next) {
  try {
    const { adminId, password } = req.body;

    if (!adminId || !password) {
      return res.status(400).json({
        success: false,
        message: "Admin ID and password are required."
      });
    }

    const normalizedId = normalizeLoginIdentifier(adminId);
    const normalizedPass = String(password || "");
    const lockStatus = await getAccountLockStatus("admin", normalizedId);
    if (lockStatus.locked) {
      return respondWithLockout(res, lockStatus.remainingMs);
    }
    const user = await validateAdminCredentials(normalizedId, normalizedPass);

    if (!user) {
      await recordFailedLoginAttempt("admin", normalizedId);
      return res.status(401).json({
        success: false,
        message: "Invalid admin credentials."
      });
    }

    await clearFailedLoginAttempts("admin", normalizedId);

    return res.json({
      success: true,
      role: "admin",
      token: createAppToken("admin", normalizedId),
      user
    });
  } catch (error) {
    if (isDatabaseConnectivityError(error)) {
      return res.status(503).json({
        success: false,
        message: "Database connection failed. Verify the SQL Server name and connection settings."
      });
    }

    return next(error);
  }
}

async function userLogin(req, res, next) {
  try {
    const { userId, password } = req.body;

    if (!userId || !password) {
      return res.status(400).json({
        success: false,
        message: "User ID and password are required."
      });
    }

    const normalizedUserId = normalizeLoginIdentifier(userId);
    const normalizedPassword = String(password || "");
    const lockStatus = await getAccountLockStatus("user", normalizedUserId);
    if (lockStatus.locked) {
      return respondWithLockout(res, lockStatus.remainingMs);
    }
    const user = await validateUserCredentials(normalizedUserId, normalizedPassword);

    if (!user) {
      await recordFailedLoginAttempt("user", normalizedUserId);
      return res.status(401).json({
        success: false,
        message: "Invalid user credentials."
      });
    }

    await clearFailedLoginAttempts("user", normalizedUserId);

    return res.json({
      success: true,
      role: "user",
      token: createAppToken("user", normalizedUserId),
      user
    });
  } catch (error) {
    if (isDatabaseConnectivityError(error)) {
      return res.status(503).json({
        success: false,
        message: "Database connection failed. Verify the SQL Server name and connection settings."
      });
    }

    return next(error);
  }
}

async function superAdminLogin(req, res, next) {
  try {
    const { superAdminId, superAdminPassword } = req.body;

    if (!superAdminId || !superAdminPassword) {
      return res.status(400).json({
        success: false,
        message: "Super admin ID and password are required."
      });
    }

    const normalizedSuperAdminId = normalizeLoginIdentifier(superAdminId);
    const lockStatus = await getAccountLockStatus("super-admin", normalizedSuperAdminId);
    if (lockStatus.locked) {
      return respondWithLockout(res, lockStatus.remainingMs);
    }

    if (!(await hasValidSuperAdminCredentials(superAdminId, superAdminPassword))) {
      await recordFailedLoginAttempt("super-admin", normalizedSuperAdminId);
      return res.status(401).json({
        success: false,
        message: "Invalid super admin credentials."
      });
    }

    await clearFailedLoginAttempts("super-admin", normalizedSuperAdminId);

    return res.json({
      success: true,
      role: "super-admin",
      token: createSuperAdminToken(normalizedSuperAdminId)
    });
  } catch (error) {
    return next(error);
  }
}

async function createAdminAccount(req, res, next) {
  try {
    if (!requireSuperAdmin(req, res)) {
      return;
    }

    const { adminId, password } = req.body;
    const normalizedAdminId = String(adminId || "").trim();
    const normalizedPassword = String(password || "");

    if (!normalizedAdminId || !normalizedPassword) {
      return res.status(400).json({
        success: false,
        message: "Admin ID and password are required."
      });
    }

    const passwordError = validatePasswordStrength(normalizedPassword);
    if (passwordError) {
      return res.status(400).json({ success: false, message: passwordError });
    }

    const createdAdmin = await createAdmin(normalizedAdminId, normalizedPassword);

    return res.status(201).json({
      success: true,
      message: "Admin created successfully.",
      admin: createdAdmin
    });
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      return res.status(409).json({
        success: false,
        message: "That Admin ID already exists."
      });
    }

    if (isDatabaseConnectivityError(error)) {
      return res.status(503).json({
        success: false,
        message: "Database connection failed. Verify the SQL Server name and connection settings."
      });
    }

    return next(error);
  }
}

async function getAdminAccounts(req, res, next) {
  try {
    if (!requireSuperAdmin(req, res)) {
      return;
    }

    const admins = await listAdmins();

    return res.json({
      success: true,
      admins
    });
  } catch (error) {
    if (isDatabaseConnectivityError(error)) {
      return res.status(503).json({
        success: false,
        message: "Database connection failed. Verify the SQL Server name and connection settings."
      });
    }

    return next(error);
  }
}

async function modifyAdminAccount(req, res, next) {
  try {
    if (!requireSuperAdmin(req, res)) {
      return;
    }

    const adminId = String(req.params.adminId || "").trim();
    const password = String(req.body.password || "");

    if (!adminId || !password) {
      return res.status(400).json({
        success: false,
        message: "Admin ID and new password are required."
      });
    }

    const passwordError = validatePasswordStrength(password);
    if (passwordError) {
      return res.status(400).json({ success: false, message: passwordError });
    }

    const updatedAdmin = await updateAdminPassword(adminId, password);

    if (!updatedAdmin) {
      return res.status(404).json({
        success: false,
        message: "Admin not found."
      });
    }

    return res.json({
      success: true,
      message: "Admin updated successfully.",
      admin: updatedAdmin
    });
  } catch (error) {
    if (isDatabaseConnectivityError(error)) {
      return res.status(503).json({
        success: false,
        message: "Database connection failed. Verify the SQL Server name and connection settings."
      });
    }

    return next(error);
  }
}

async function getUsers(req, res, next) {
  try {
    const auth = requireAppAuth(req, res, ["admin"]);
    if (!auth) {
      return;
    }

    const requestedAdminId = String(req.query.adminId || "").trim();
    const effectiveAdminId = requestedAdminId || auth.userId;

    if (effectiveAdminId !== auth.userId) {
      return res.status(403).json({
        success: false,
        message: "You are not allowed to access those users."
      });
    }

    const users = await listUsersForAdmin(auth.userId);
    return res.json({ success: true, users });
  } catch (error) {
    return next(error);
  }
}

async function modifyAssignedUser(req, res, next) {
  try {
    const auth = requireAppAuth(req, res, ["admin"]);
    if (!auth) {
      return;
    }

    const adminId = auth.userId;
    const currentUserId = String(req.params.userId || "").trim();
    const nextUserId = String(req.body.userId || "").trim();
    const password = String(req.body.password || "");

    if (!adminId || !currentUserId) {
      return res.status(400).json({
        success: false,
        message: "Admin ID and target user ID are required."
      });
    }

    if (!password && (!nextUserId || nextUserId === currentUserId)) {
      return res.status(400).json({
        success: false,
        message: "Provide a new user ID, a new password, or both."
      });
    }

    if (password) {
      const passwordError = validatePasswordStrength(password);
      if (passwordError) {
        return res.status(400).json({ success: false, message: passwordError });
      }
    }

    const result = await updateAssignedUserCredentials(adminId, currentUserId, nextUserId, password);

    if (result.status === "not_found") {
      return res.status(404).json({
        success: false,
        message: "Assigned user not found for this admin."
      });
    }

    if (result.status === "duplicate_user_id") {
      return res.status(409).json({
        success: false,
        message: "That user ID is already in use."
      });
    }

    return res.json({
      success: true,
      message: "Assigned user updated successfully.",
      user: result.user
    });
  } catch (error) {
    if (isDatabaseConnectivityError(error)) {
      return res.status(503).json({
        success: false,
        message: "Database connection failed. Verify the SQL Server name and connection settings."
      });
    }

    return next(error);
  }
}

module.exports = {
  adminLogin,
  createAdminAccount,
  getAdminAccounts,
  getUsers,
  modifyAssignedUser,
  modifyAdminAccount,
  requireAppAuth,
  requireSuperAdmin,
  superAdminLogin,
  userLogin
};

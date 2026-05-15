const argon2 = require("argon2");
const crypto = require("crypto");

function timingSafeEqualString(left, right) {
  const leftBuffer = Buffer.from(String(left || ""), "utf8");
  const rightBuffer = Buffer.from(String(right || ""), "utf8");

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 };
const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 1 << 16,
  timeCost: 3,
  parallelism: 2
};

function isArgon2Hash(value) {
  return typeof value === "string" && value.startsWith("$argon2");
}

async function createPasswordHash(password) {
  if (!password) return "";
  return argon2.hash(password, ARGON2_OPTIONS);
}

async function verifyPassword(password, storedValue) {
  if (!password || !storedValue) {
    return false;
  }

  if (isArgon2Hash(storedValue)) {
    return argon2.verify(storedValue, password);
  }

  if (!storedValue.startsWith("scrypt$")) {
    return timingSafeEqualString(password, storedValue);
  }

  const parts = storedValue.split("$");
  if (parts.length !== 6) {
    return false;
  }

  const [_algo, n, r, p, salt, hash] = parts;
  const derived = crypto.scryptSync(password, salt, 64, {
    N: parseInt(n, 10),
    r: parseInt(r, 10),
    p: parseInt(p, 10)
  }).toString("base64");
  return timingSafeEqualString(derived, hash);
}

function shouldUpgradePasswordHash(storedValue) {
  return !isArgon2Hash(storedValue);
}

function sanitizeRecord(record, keysToRemove) {
  if (!record) {
    return null;
  }

  const clone = { ...record };

  for (const key of keysToRemove) {
    delete clone[key];
  }

  return clone;
}

function createSignedToken({ payload, secret, ttlMs }) {
  const tokenPayload = {
    ...payload,
    exp: Date.now() + ttlMs
  };
  const encodedPayload = Buffer.from(JSON.stringify(tokenPayload)).toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(encodedPayload).digest("base64url");
  return `${encodedPayload}.${signature}`;
}

function verifySignedToken(token, secret, options = {}) {
  if (!token || !token.includes(".")) {
    return null;
  }

  const [encodedPayload, signature] = token.split(".");
  const expectedSignature = crypto.createHmac("sha256", secret).update(encodedPayload).digest("base64url");

  if (!timingSafeEqualString(signature, expectedSignature)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
    if (!payload || payload.exp <= Date.now()) {
      return null;
    }

    if (options.requiredRole && payload.role !== options.requiredRole) {
      return null;
    }

    if (Array.isArray(options.requiredRoles) && !options.requiredRoles.includes(payload.role)) {
      return null;
    }

    return payload;
  } catch (_error) {
    return null;
  }
}

function isStrongPassword(password) {
  const value = String(password || "");
  return (
    value.length >= 8 &&
    /[a-z]/.test(value) &&
    /[A-Z]/.test(value) &&
    /\d/.test(value) &&
    /[^A-Za-z0-9]/.test(value)
  );
}

module.exports = {
  createPasswordHash,
  createSignedToken,
  isStrongPassword,
  sanitizeRecord,
  shouldUpgradePasswordHash,
  timingSafeEqualString,
  verifyPassword,
  verifySignedToken
};

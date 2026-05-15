const crypto = require("crypto");

function timingSafeEqualString(left, right) {
  const leftBuffer = Buffer.from(String(left || ""), "utf8");
  const rightBuffer = Buffer.from(String(right || ""), "utf8");

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
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
  createSignedToken,
  isStrongPassword,
  sanitizeRecord,
  timingSafeEqualString,
  verifySignedToken
};

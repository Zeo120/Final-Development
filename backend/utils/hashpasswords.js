/**
 * hashpasswords.js
 * 
 * Core cryptographic utility for password hashing and verification.
 * 
 * ============================================================================
 * INTERN NOTES:
 * 1. Why Argon2? We use Argon2id because it is highly resistant to GPU cracking and 
 *    side-channel attacks. We push the memoryCost to 256MB to make it mathematically 
 *    unfeasible for attackers to brute-force our database if it leaks.
 * 2. What is Peppering? Even if our DB leaks, attackers have the hashes. By appending a 
 *    secret `.env` string (PASSWORD_PEPPER) to the password *before* hashing, the hashes 
 *    are completely useless without the server's environment variables.
 * ============================================================================
 */
const argon2 = require("argon2");
const { timingSafeEqualString } = require("./security");

const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 1 << 18, // 256MB
  timeCost: 8,
  parallelism: 2
};

function getPepper() {
  return String(process.env.PASSWORD_PEPPER || "default-paradigm-pepper-string");
}

function pepperPassword(password) {
  return password + getPepper();
}

function isArgon2Hash(value) {
  return typeof value === "string" && value.startsWith("$argon2");
}

async function createPasswordHash(password) {
  if (!password) return "";
  return argon2.hash(pepperPassword(password), ARGON2_OPTIONS);
}

async function verifyPassword(password, storedValue) {
  if (!password || !storedValue) {
    return false;
  }

  const peppered = pepperPassword(password);

  if (isArgon2Hash(storedValue)) {
    // Check with the pepper
    const verified = await argon2.verify(storedValue, peppered);
    if (verified) return true;
    
    // Fallback: Check without the pepper (in case hash was generated before pepper was added)
    return argon2.verify(storedValue, password);
  }

  // Fallback to plaintext comparison so it can be upgraded to Argon2
  return timingSafeEqualString(password, storedValue);
}

function shouldUpgradePasswordHash(storedValue) {
  return !isArgon2Hash(storedValue);
}

module.exports = {
  createPasswordHash,
  shouldUpgradePasswordHash,
  verifyPassword
};

const fs = require("fs");

function fixByFirstModuleExports(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  const idx = content.indexOf("module.exports = {");
  const end = content.indexOf("};", idx) + 2;
  fs.writeFileSync(filePath, content.substring(0, end) + "\n");
}

function fixByFirstOccurrence(filePath, marker) {
  const content = fs.readFileSync(filePath, "utf8");
  const idx = content.indexOf(marker);
  fs.writeFileSync(filePath, content.substring(0, idx) + marker);
}

// Fix package.json
const pkg = {
  name: "paradigm", version: "1.0.0",
  description: "Paradigm Admin and User Hub",
  main: "backend/src/server.js",
  scripts: {
    start: "node backend/src/server.js",
    dev: "node --watch backend/src/server.js",
    "migrate:hash-passwords": "node backend/scripts/hashExistingPasswords.js"
  },
  dependencies: {
    argon2: "^0.31.2", compression: "^1.8.1", cors: "^2.8.6",
    dotenv: "^17.3.1", express: "^5.2.1",
    msnodesqlv8: "^5.1.5", mssql: "^12.2.0"
  }
};
fs.writeFileSync("package.json", JSON.stringify(pkg, null, 2));

// Fix server.js
fixByFirstOccurrence("backend/src/server.js", "startServer();");

// Fix security.js
fixByFirstModuleExports("backend/utils/security.js");

// Fix rateLimiter.js
fixByFirstModuleExports("backend/middleware/rateLimiter.js");

const files = ["package.json","backend/src/server.js","backend/utils/security.js","backend/middleware/rateLimiter.js"];
files.forEach(f => console.log(f, "lines:", fs.readFileSync(f,"utf8").split("\n").length));
console.log("All files fixed. Starting server...");
8").split("\n").length);

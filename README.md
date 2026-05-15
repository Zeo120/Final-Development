# Paradigm Dashboard Architecture

Welcome to the Paradigm Dashboard repository! This application is built with a highly optimized, strictly organized "Clean MVC" Node.js backend and a vanilla HTML/JS/CSS frontend. It is designed for enterprise-grade security and massive horizontal scalability.

## 📁 Architecture Overview

The codebase strictly separates concerns to ensure it is easy to maintain and test.

### Frontend (`/assets`, `/pages`, `index.html`)
- No heavy frameworks (React/Vue). Vanilla JS and CSS for maximum performance and minimum bundle size.
- **Stateless UI:** The frontend holds no sensitive data. Session tokens are stored in `sessionStorage` and are wiped the moment the user navigates to a login page.

### Backend (`/backend`)
- `src/server.js`: The pure orchestrator. It registers global middleware, initializes the database, and boots the server. It handles **Graceful Shutdowns** via SIGINT/SIGTERM.
- `config/`: Environment loading and Database connection pool logic.
- `routes/`: Express routers. `apiRoutes.js` handles JSON data, `viewRoutes.js` serves HTML.
- `middleware/`: Global HTTP pipeline logic (Security headers, Rate Limiting, Compression).
- `controllers/`: The business logic. Parses requests, enforces authorization, and returns responses.
- `models/`: The database layer. Pure SQL queries with strict parameterization to prevent SQL injection.
- `utils/`: Core utilities (Hashing, JWTs, Cache Adapters).

## 🔒 Security Highlights

This application is hardened far beyond standard defaults:
1. **Argon2 Peppering**: Passwords are not just hashed. They are hashed using Argon2 (256MB memory cost) and "peppered" with a secret server-side `.env` key (`PASSWORD_PEPPER`).
2. **Stateless JWTs**: Sessions use HMAC SHA-256 JWTs with ultra-short lifespans (30 minutes) to minimize the blast radius of a compromised token.
3. **Strict Rate Limiting**: The API allows only 20 requests per second globally, and login endpoints lock out IPs after 5 failed attempts.
4. **Tenant Isolation (IDOR Prevention)**: Backend controllers strictly enforce ownership. An admin can *never* query or modify data belonging to another admin's user.
5. **Aggressive Cache Control**: The server forces browsers to never cache authenticated pages (`Cache-Control: no-store`).

## 🚀 Scaling Guide (1000x Readiness)

The backend is 100% "Cluster Ready". If you need to scale to thousands of concurrent instances:

1. **Database Scaling**: Open your `.env` and increase `DB_POOL_MAX`.
2. **Horizontal Node.js Scaling (Vanilla)**: By default, rate limits and login lockouts use an ultra-fast in-memory map. To share this state across a massive cluster without using 3rd-party tools like Redis, you have two native options:
   - **Sticky Sessions:** Configure your Load Balancer (e.g., NGINX) to route the same IP to the same Node.js instance. The local memory maps will work flawlessly.
   - **SQL Server Backend:** Update `backend/utils/cacheAdapter.js` to read/write from a simple SQL Server table. Because the adapter is fully asynchronous, **no other files in the codebase need to be modified!**

## ⚙️ Environment Setup

Create a `.env` file in the root directory:

```env
# Server
PORT=3000

# Database
DB_SERVER=localhost\SQLEXPRESS
DB_DATABASE=Test
DB_POOL_MAX=50
DB_POOL_MIN=5

# Security Secrets (CRITICAL)
PASSWORD_PEPPER=your-super-secret-pepper-string
APP_TOKEN_SECRET=your-app-jwt-secret
SUPER_ADMIN_TOKEN_SECRET=your-super-admin-jwt-secret
SUPER_ADMIN_ID=superadmin
SUPER_ADMIN_PASSWORD_HASH=generate-this-manually-if-needed
```

## 🛠️ Running the App
1. Run `npm install`
2. Run `npm start`
3. Navigate to `http://localhost:3000`

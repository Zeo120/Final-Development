# Paradigm Dashboard

Paradigm is a Node.js and SQL Server dashboard application with a vanilla HTML, CSS, and JavaScript frontend. It supports three main user journeys:

- Super admin logs in and manages admin accounts.
- Admin logs in and manages assigned client users, projects, tasks, compliance records, fiscal years, months, and invoices.
- User logs in and views their own dashboard data.

This README is written for interns or new contributors who need to understand the existing codebase before making changes.

## Quick Start

1. Install dependencies:

```bash
npm install
```

2. Create a `.env` file in the project root. Start by copying values from `.env.example`, then change secrets and database values for your machine.

3. Make sure SQL Server is running and the configured database exists or can be created by your environment.

4. Start the app:

```bash
npm start
```

For development with automatic Node reloads:

```bash
npm run dev
```

5. Open the app:

```text
http://localhost:3000
```

Useful routes:

- `/` - public landing page
- `/admin-login` - admin login
- `/user-login` - user login
- `/super-admin-login` - super admin login
- `/admin-dashboard` - admin dashboard
- `/user-dashboard` - user dashboard
- `/health` - server and database initialization status

## Tech Stack

- Runtime: Node.js
- Backend framework: Express 5
- Database: Microsoft SQL Server
- SQL driver: `mssql` with `msnodesqlv8`
- Password hashing: Argon2
- Frontend: plain HTML, CSS, and browser JavaScript
- Build step: none

There is no React, Vue, Angular, bundler, or transpiler. The browser loads files directly from `index.html`, `pages/`, and `assets/`.

## Project Structure

```text
.
|-- backend/
|   |-- config/          # Database connection and startup table creation
|   |-- controllers/     # Request handling and business rules
|   |-- middleware/      # Security headers and rate limiting
|   |-- models/          # SQL queries for auth-related data
|   |-- routes/          # Express route definitions
|   |-- scripts/         # One-off backend maintenance scripts
|   |-- src/server.js    # Main Express server entry point
|   `-- utils/           # Hashing, token, cache, and security helpers
|-- assets/
|   |-- css/             # Shared and page-specific styles
|   |-- images/          # Static images and icons
|   `-- js/              # Browser-side JavaScript
|-- pages/               # HTML pages served by view routes
|-- scripts/             # Project-level utility scripts
|-- index.html           # Public homepage
|-- package.json         # npm scripts and dependencies
|-- .env.example         # Example local configuration
`-- README.md
```

## How The App Starts

The backend starts from `backend/src/server.js`.

Startup flow:

1. Load environment variables through `backend/config/db.js`.
2. Validate required security variables:
   - `APP_TOKEN_SECRET`
   - `SUPER_ADMIN_TOKEN_SECRET`
   - `PASSWORD_PEPPER`
3. Connect to SQL Server.
4. Run `initializeDatabase()` from `backend/config/initDb.js`.
5. Create missing tables if they do not already exist.
6. Seed default admin, user, pages, and widgets if needed.
7. Register middleware, static files, API routes, view routes, and the error handler.
8. Listen on `PORT`, defaulting to `3000`.

The server also handles graceful shutdown for `SIGINT` and `SIGTERM`, closing the HTTP server and SQL connection pool before exiting.

## Backend Architecture

The backend uses a simple MVC-style structure.

### Routes

Routes decide which controller function should handle a request.

- `backend/routes/viewRoutes.js` serves HTML pages.
- `backend/routes/apiRoutes.js` defines JSON API endpoints under `/api`.

Example:

```text
POST /api/auth/admin-login
```

is routed to `adminLogin()` in `backend/controllers/authController.js`.

### Controllers

Controllers contain request-level logic:

- Read request parameters and body values.
- Validate input.
- Check authentication and authorization.
- Call database/model functions.
- Return JSON responses.

Important controller files:

- `authController.js` handles login, token creation, role checks, admin creation, and credential updates.
- `dataController.js` handles dashboard data, projects, tasks, compliance records, fiscal years, fiscal months, and invoices.
- `pageController.js` handles dashboard pages and widgets.

### Models

Models are responsible for SQL access.

- `backend/models/authModel.js` contains auth-related SQL queries.
- `backend/models/pageModel.js` contains dashboard page and widget SQL queries.

Some data queries currently live directly in `dataController.js`. If you add larger data features, consider moving repeated SQL into a model file to keep controllers smaller.

### Middleware

Middleware runs before route handlers.

- `backend/middleware/security.js` sets security-related HTTP headers.
- `backend/middleware/rateLimiter.js` limits request volume and login attempts.

### Utilities

Utilities hold reusable logic:

- `backend/utils/hashpasswords.js` creates and verifies Argon2 password hashes.
- `backend/utils/security.js` signs/verifies tokens, checks password strength, compares strings safely, and removes sensitive fields.
- `backend/utils/cacheAdapter.js` provides a small async cache abstraction used by rate limiting and lockouts.

## Frontend Architecture

The frontend is plain browser code.

Important files:

- `index.html` is the public entry page.
- `pages/admin-login.html`, `pages/user-login.html`, and `pages/super-admin-login.html` are login pages.
- `pages/admin-dashboard.html` and `pages/user-dashboard.html` are authenticated dashboard pages.
- `pages/user-vestazen.html` is a special user landing page for the configured `vestazen` user under admin `lvss`.
- `assets/js/auth.js` handles admin and user login forms.
- `assets/js/super-admin.js` handles super admin login and admin management UI.
- `assets/js/dashboard.js` loads dashboard data, pages, widgets, projects, tasks, and compliance data.
- `assets/js/password-toggle.js` handles password field visibility controls.
- `assets/css/*.css` contains shared and page-specific styling.

Frontend session data is stored in `window.sessionStorage` under the key:

```text
paradigmSession
```

The session contains the user role, user id, token, and returned user record. Authenticated frontend API calls attach the token as:

```http
Authorization: Bearer <token>
```

## Authentication And Roles

The app has three roles.

### Super Admin

Super admin credentials come from `.env`.

Related environment variables:

- `SUPER_ADMIN_ID`
- `SUPER_ADMIN_PASSWORD`
- `SUPER_ADMIN_PASSWORD_HASH`
- `SUPER_ADMIN_TOKEN_SECRET`

The super admin can:

- Log in through `/super-admin-login`.
- List admin accounts.
- Create admin accounts.
- Reset admin passwords.

### Admin

Admin accounts are stored in the `Admins` table.

Admins can:

- Log in through `/admin-login`.
- View assigned client users.
- Rename or reset passwords for their assigned users.
- Create projects, tasks, compliance items, fiscal years, fiscal months, and invoices for assigned users.
- Manage dashboard pages and widgets.

Admin endpoints protect against cross-admin access by checking that the target user belongs to the logged-in admin.

### User

User accounts are stored in the `Users` table.

Users can:

- Log in through `/user-login`.
- View their own projects, tasks, compliance records, pages, and widgets.
- Toggle task completion.

Users should not be able to access another user's data.

## Database

Database connection settings are read in `backend/config/db.js`.

Common `.env` values:

```env
PORT=3000
DB_SERVER=localhost
DB_INSTANCE=SQLEXPRESS
DB_DATABASE=Test
DB_ODBC_DRIVER=ODBC Driver 18 for SQL Server
DB_ENCRYPT=false
DB_TRUST_SERVER_CERTIFICATE=true

APP_TOKEN_SECRET=change-this-admin-token-secret
SUPER_ADMIN_TOKEN_SECRET=change-this-super-admin-token-secret
PASSWORD_PEPPER=change-this-password-pepper-string
```

The application uses trusted Windows authentication for SQL Server:

```js
trustedConnection: true
```

If your machine cannot connect, first check SQL Server name, instance name, ODBC driver, Windows permissions, and whether SQL Server allows local connections.

### Tables Created At Startup

`backend/config/initDb.js` creates missing tables during startup:

- `Admins`
- `Users`
- `UserPages`
- `Widgets`
- `Projects`
- `Tasks`
- `Compliance`
- `FiscalYears`
- `FiscalMonths`
- `FiscalInvoices`

It also seeds:

- A default admin from `DEFAULT_ADMIN_ID` and `DEFAULT_ADMIN_PASSWORD`.
- A default user from `DEFAULT_USER_ID` and `DEFAULT_USER_PASSWORD`.
- A default dashboard page named `Overview`.
- Default widgets for new identities.

Do not assume this is a full migration system. It creates tables that are missing, but it does not perform every possible schema migration for existing tables.

## Main API Areas

All API routes are registered under `/api`.

### Auth

- `POST /api/auth/admin-login`
- `POST /api/auth/user-login`
- `POST /api/auth/super-admin-login`

### Super Admin Admin-Management

- `GET /api/admins`
- `POST /api/admins`
- `PATCH /api/admins/:adminId`

### Admin User-Management

- `GET /api/users`
- `PATCH /api/users/:userId`

### Dashboard Data

- `GET /api/data/summary`
- `GET /api/data/projects`
- `POST /api/data/projects`
- `PATCH /api/data/projects/:projectId/status`
- `GET /api/data/tasks`
- `POST /api/data/tasks`
- `PATCH /api/data/tasks/:taskId/toggle`
- `GET /api/data/compliance`
- `POST /api/data/compliance`

### Fiscal Compliance

- `GET /api/compliance/fiscal-years`
- `GET /api/compliance/fiscal-years/:yearId`
- `POST /api/compliance/fiscal-years`
- `POST /api/compliance/months`
- `POST /api/compliance/invoices`

### Pages And Widgets

- `GET /api/pages`
- `POST /api/pages`
- `GET /api/pages/:pageId/widgets`
- `POST /api/pages/:pageId/widgets`
- `DELETE /api/widgets/:widgetId`

## Request Flow Example

Example: admin creates a task for a client user.

1. Browser submits a form in `assets/js/dashboard.js`.
2. `apiRequest()` adds the logged-in admin JWT to the `Authorization` header.
3. Express receives `POST /api/data/tasks`.
4. `backend/routes/apiRoutes.js` sends the request to `createTaskHandler()`.
5. `createTaskHandler()` verifies the caller is an admin.
6. It checks that the target `userId` belongs to that admin.
7. It inserts the task into the `Tasks` table.
8. The controller returns the created task as JSON.
9. The frontend refreshes dashboard data.

This is the pattern most secure admin actions should follow: authenticate first, verify ownership second, write data last.

## Security Notes

- Passwords are hashed with Argon2.
- `PASSWORD_PEPPER` is required and should be different in every environment.
- Tokens are signed server-side and expire quickly.
- Login attempts are rate limited.
- Authenticated pages and static files use `Cache-Control: no-store`.
- SQL inputs use parameterized queries.
- Sensitive password fields are removed before records are returned to the browser.

Never commit a real `.env` file or production secrets.

## Common Development Tasks

### Add A New API Endpoint

1. Add the route in `backend/routes/apiRoutes.js`.
2. Add the handler in the correct controller.
3. Add SQL access in a model file if the query is reusable or large.
4. Check authentication with `requireAppAuth()` or `requireSuperAdmin()`.
5. Validate input before writing to the database.
6. Return consistent JSON:

```json
{ "success": true }
```

or:

```json
{ "success": false, "message": "Helpful error message." }
```

### Add A New HTML Page

1. Create the file in `pages/`.
2. Add a route in `backend/routes/viewRoutes.js`.
3. Link the page from the relevant HTML or JavaScript.
4. Add CSS in `assets/css/` if needed.
5. Add browser behavior in `assets/js/` if needed.

### Add A New Dashboard Widget Type

1. Make sure widgets of that type can be stored in the `Widgets` table.
2. Update widget creation UI in the dashboard page if needed.
3. Add rendering logic in `renderWidgets()` or `loadWidgetData()` in `assets/js/dashboard.js`.
4. Add any required API endpoint and backend query.

### Change Login Behavior

Start with:

- `assets/js/auth.js` for admin and user login UI behavior.
- `assets/js/super-admin.js` for super admin login UI behavior.
- `backend/controllers/authController.js` for server-side credential checks and token creation.
- `backend/utils/security.js` for token signing and verification.

## Scripts

Available npm scripts:

```bash
npm start
npm run dev
npm run migrate:hash-passwords
```

`npm run migrate:hash-passwords` runs `backend/scripts/hashExistingPasswords.js`, which is intended for upgrading existing plain or old-format passwords into the current hash format.

There is also a standalone `test_db.js` file that can be used to test database connectivity during local debugging.

## Intern Checklist Before Making Changes

- Read the route first to find the controller.
- Read the controller to understand validation and authorization.
- Read the model or SQL query before changing database behavior.
- Check whether the change affects admin, user, or super admin flows.
- Keep secrets in `.env`, never in source files.
- Test login after changing auth/session code.
- Test with both admin and user accounts after changing dashboard data.
- Check `/health` if startup or database initialization fails.

## Troubleshooting

### Server exits immediately

Check that these required values exist in `.env`:

- `APP_TOKEN_SECRET`
- `SUPER_ADMIN_TOKEN_SECRET`
- `PASSWORD_PEPPER`

### Database connection fails

Check:

- SQL Server is running.
- `DB_SERVER` and `DB_INSTANCE` match your local SQL Server.
- `DB_ODBC_DRIVER` is installed.
- Your Windows user has database access.
- `DB_ENCRYPT` and `DB_TRUST_SERVER_CERTIFICATE` match your SQL Server setup.

### Login works but dashboard redirects back to login

The dashboard checks `sessionStorage` and the current route role. Make sure:

- You logged in through the correct login page.
- The token has not expired.
- The dashboard URL matches the role: admins use `/admin-dashboard`, users use `/user-dashboard`.

### API returns 401

The request is missing a valid bearer token, the token expired, or the role is not allowed for that endpoint.

### API returns 403

The user is authenticated, but is trying to access data they do not own or manage.
not allowed for that endpoint.

### API returns 403

The user is authenticated, but is trying to access data they do not own or manage.

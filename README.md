# Project Structure

This project is organized so the static frontend can grow into a frontend plus backend application without another restructure.

## Current Layout

- `index.html`: Main frontend entry page
- `assets/css`: Stylesheets
- `assets/js`: Frontend scripts
- `assets/images`: Images and media assets
- `pages`: Additional frontend pages
- `backend/src`: Backend application entry files
- `backend/routes`: Route definitions
- `backend/controllers`: Request handlers
- `backend/models`: Data models
- `backend/config`: Environment and app configuration

## Suggested Next Step

When you add the backend, keep API/server code inside `backend` and continue serving frontend files separately from the root frontend structure.

## Running the Node App

- Install dependencies: `npm.cmd install`
- Start the server: `npm.cmd start`
- Open: `http://localhost:3000`

## Current Backend Notes

- Express serves the frontend and login pages.
- Admin login posts to `/api/auth/admin-login`.
- User login posts to `/api/auth/user-login`.
- SQL Server connection settings are in `.env`.
- The current default server target is `A\SQLEXPRESS`.
- Login endpoints enforce account-level lockouts after five failed attempts by default and surface a `Retry-After` header while the lockout is active.
- Customize lockout policy with `MAX_LOGIN_ATTEMPTS` and `LOGIN_LOCKOUT_DURATION_MS` in your `.env` (defaults: `5` attempts, `900000` milliseconds).

## Cleaning Bank Statement CSV

- Run: `node scripts/clean-bank-statement.mjs path\to\statement.csv -o path\to\statement.clean.csv`
- Optional mapping: `node scripts/clean-bank-statement.mjs statement.csv --config mapping.json`

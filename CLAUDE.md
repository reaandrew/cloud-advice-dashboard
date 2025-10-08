# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Cloud Advice Dashboard is a Node.js/Express web application that provides AWS cloud compliance monitoring and policy advice. It displays compliance metrics from MongoDB collections and renders them using GOV.UK Design System templates (Nunjucks).

## Development Commands

### Running the Application

```bash
# Start the portal (basic)
cd portal && node app.js

# Start with specific configuration
cd portal && node app.js --config production
cd portal && node app.js -c staging

# Start with multiple configs (loaded in order)
cd portal && node app.js --config base --config custom

# Using environment variables
PORT=8080 LOG_LEVEL=debug node portal/app.js
```

### Build Commands

```bash
# Build portal with Docker
docker build --security-opt seccomp=unconfined -t policy/portal:latest .

# Install dependencies
npm ci                    # Root dependencies (semantic-release)
cd portal && npm ci       # Portal dependencies
```

### Releases

This project uses semantic-release with conventional commits. Releases are automated via GitHub Actions on push to main.

## Architecture

### Configuration System

The application uses a hierarchical YAML-based configuration system located in `configs/`:

- **Loading order** (higher priority overrides lower):
  1. `configs/default.yaml` (base config, always loaded)
  2. Command-line config files: `--config <name>` or `-c <name>`
  3. Environment variables (highest priority)

- **Config loader**: `portal/libs/config-loader.js`
  - Singleton that merges configs and provides `get(path, defaultValue)` API
  - Supports dot notation: `config.get('database.mongodb.host')`
  - Parses CLI args for `--config` flags automatically

- **Environment variable mappings** (see `configs/README.md` for full list):
  - `PORT` → `app.port`
  - `MONGO_CONNECTION_STRING` → `database.mongodb.connection_string`
  - `AUTH_TYPE` → `auth.type`
  - `LOG_LEVEL` → `monitoring.logging.level`

### Application Structure

**Main entry point**: `portal/app.js`
- Initializes Express, Nunjucks (with GOV.UK Frontend), middleware, and routes
- Conditionally loads MongoDB middleware if `features.compliance` is enabled
- Conditionally loads auth middleware if `features.auth` is enabled (supports 'mock' and 'oidc' types)
- Configures error handlers for 404 and 500 errors

**Routing**:
- `portal/routes/index.js` - Homepage/dashboard
- `portal/routes/compliance.js` - Compliance overview/navigation
- `portal/routes/compliance/*.js` - Individual compliance policies (tagging, database, loadbalancers, kms, autoscaling)
- `portal/routes/policies.js` - Policy documentation pages

**Database queries**:
- MongoDB queries are in `portal/queries/compliance/*.js` and `portal/queries/dashboard/*.js`
- Queries expect collections organized by date with fields like `year`, `month`, `day`
- Access MongoDB via `req.app.locals.mongodb` (set by middleware)

**Middleware**:
- `portal/libs/middleware/mongo.js` - MongoDB connection, attached to `app.locals`
- `portal/libs/middleware/authentication.js` - OIDC authentication
- `portal/libs/middleware/authenticationMock.js` - Mock authentication for dev/testing
- `portal/libs/middleware/authorizationImpl.js` - Custom authorization logic (must be created by implementer)

**Views/Templates**:
- Nunjucks templates in `portal/views/`
- Uses GOV.UK Frontend components (govuk-frontend npm package)
- Templates expect `breadcrumbs`, `currentSection`, and page-specific data

**Static assets**:
- GOV.UK Frontend assets served from `node_modules/govuk-frontend/dist`
- Custom assets in `portal/stylesheets/`, `portal/javascripts/`, `portal/assets/`

### Feature Flags

The application supports feature flags via configuration:

- `features.compliance` (default: true) - Enables/disables compliance monitoring functionality
- `features.auth` (default: false) - Enables/disables authentication

### Authentication

When `features.auth` is enabled, you must specify `auth.type`:

- `'mock'` - Mock authentication for development (uses `authenticationMock.js`)
- `'oidc'` - OpenID Connect authentication (uses `express-openid-connect`)

Create `portal/libs/middleware/authorizationImpl.js` to implement custom authorization logic. See `portal/libs/middleware/authorizationImpl.js.example` for guidance.

### Logging

Uses custom logger at `portal/libs/logger.js`:
- Configured via `monitoring.logging.level` (debug, info, warn, error)
- Supports multiple formats via `monitoring.logging.format` (console, json)

## Key Development Notes

### Adding New Compliance Policies

1. Create MongoDB query file in `portal/queries/compliance/<policy>.js`
2. Create route handler in `portal/routes/compliance/<policy>.js`
3. Create Nunjucks template in `portal/views/policies/<policy>/`
4. Register route in `portal/app.js` (see existing patterns)
5. Add navigation link in `portal/routes/compliance.js`

### Working with MongoDB Collections

- Collections are typically organized by date with `year`, `month`, `day` fields
- Use helper queries to get latest date: `getLatest<Collection>Date(req)`
- Access MongoDB client via: `req.app.locals.mongodb`
- Always handle "no data" cases gracefully (render no-data page instead of errors)

### Configuration Changes

When adding new config options:
1. Add to `configs/default.yaml` with sensible defaults
2. If needed, add environment variable mapping in `portal/libs/config-loader.js` `getEnvOverrides()`
3. Document in `configs/README.md`

### Semantic Release

- Uses conventional commits for versioning
- Commit format: `feat:`, `fix:`, `chore:`, `refactor:`, etc.
- Configured in `.releaserc.json`
- Automated via GitHub Actions (`.github/workflows/ci.yml`)
- Generates `CHANGELOG.md` automatically
- Requires Node 20+ for semantic-release dependencies

## Repository Organization

```
/
├── configs/                    # Configuration files (YAML)
├── portal/                     # Main application
│   ├── app.js                 # Entry point
│   ├── routes/                # Route handlers
│   ├── queries/               # MongoDB queries
│   ├── views/                 # Nunjucks templates
│   ├── libs/                  # Core libraries (config, logger, middleware)
│   ├── utils/                 # Shared utilities
│   ├── stylesheets/           # Custom SCSS
│   ├── javascripts/           # Client-side JS
│   └── assets/                # Static assets
├── scripts/                    # Utility scripts
└── account_mappings.yaml      # AWS account mappings
```

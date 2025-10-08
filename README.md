# Cloud Advice Dashboard

A web application for monitoring AWS cloud compliance and providing policy advice. Built with Node.js, Express, and the GOV.UK Design System, it displays compliance metrics from MongoDB collections and helps teams track adherence to cloud policies.

[![Semantic Release](https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg)](https://github.com/semantic-release/semantic-release)

## Features

- **Compliance Monitoring**: Track AWS resource compliance across multiple policies
  - Tagging compliance
  - Database version compliance
  - Load balancer configuration
  - KMS key management
  - Auto-scaling policies
- **Multi-tenancy**: Support for multiple AWS accounts and teams
- **Flexible Configuration**: YAML-based configuration with environment variable overrides
- **Authentication Options**: Mock auth for development, OIDC for production
- **GOV.UK Design System**: Accessible, standards-compliant UI
- **Feature Flags**: Enable/disable functionality based on deployment needs

## Quick Start

### Docker Compose

The quickest way to get up and running is by using docker compose:

```sh
docker-compose up
```

Once the services are up and running, you can see the database using the [mock_aws_to_mongo.py](./scripts/mock_aws_to_mongo.py) script.

```
python3 scripts/mock_aws_to_mongo.py \
    --mongo-uri "mongodb://localhost:27017/" \
    --db aws_data \
    --region eu-west-2 \
    --date 2025-08-12 \
    --accounts 2 \
    --ec2 10 --asg 3 --elb 3 --efs 2 --kms 5 --rds 2 --redshift 1 --zones 2 --buckets 4 --sg 6 --volumes 10
```

### Manual Installation

#### Prerequisites

- Node.js 20+ (required for semantic-release)
- MongoDB instance with compliance data
- (Optional) OIDC provider for authentication

#### Installation

```bash
# Clone the repository
git clone git@github.com:reaandrew/cloud-advice-dashboard.git
cd cloud-advice-dashboard

# Install dependencies
npm ci                # Root dependencies
cd portal && npm ci   # Portal dependencies
```

### Configuration

1. Copy the example configuration:

   ```bash
   cp configs/default.yaml.example configs/default.yaml
   ```

2. Edit `configs/default.yaml` with your settings:

   - MongoDB connection details
   - Authentication configuration (if enabling auth)
   - Mandatory tags for your organization
   - Feature flags

3. (Optional) Create environment-specific configs:
   ```bash
   cp configs/default.yaml configs/production.yaml
   # Edit production.yaml with production-specific overrides
   ```

### Running the Application

```bash
# Development (default config)
cd portal && node app.js

# With specific configuration
cd portal && node app.js --config production

# With environment variables
PORT=8080 MONGO_HOST=mongodb.example.com node portal/app.js

# With debug logging
LOG_LEVEL=debug node portal/app.js
```

The application will be available at http://localhost:3000 (or the configured port).

## Configuration

The application uses a hierarchical configuration system with YAML files in the `configs/` directory.

### Configuration Loading Order

Configurations are merged in priority order (higher overrides lower):

1. `configs/default.yaml` (base configuration)
2. Command-line config files: `--config <name>`
3. Environment variables (highest priority)

### Key Configuration Options

```yaml
app:
  name: "Cloud Advice Dashboard"
  port: 3000
  base_url: "http://localhost:3000"

# Enable/disable major features
features:
  auth: false # Enable authentication
  compliance: true # Enable compliance monitoring

# Authentication (when features.auth is true)
auth:
  type: "oidc" # Options: mock, oidc
  oidc:
    client_id: ""
    client_secret: ""
    issuer_url: ""

# Database connection
database:
  mongodb:
    host: "localhost"
    port: 27017
    database_name: "aws_data"
    connection_string: "" # Optional override

# Compliance policies
compliance:
  tagging:
    mandatory_tags:
      - "MyCode"
      - "Source"
      - "BSP"

# Logging
monitoring:
  logging:
    level: "info" # Options: debug, info, warn, error
    format: "json" # Options: json, console
```

### Environment Variables

Override configuration values with environment variables:

- `PORT` → `app.port`
- `BASE_URL` → `app.base_url`
- `AUTH_TYPE` → `auth.type`
- `AUTH_MOCK_GROUPS` → `auth.mock.groups`
- `OIDC_CLIENT_ID` → `auth.oidc.client_id`
- `OIDC_CLIENT_SECRET` → `auth.oidc.client_secret`
- `OIDC_ISSUER_URL` → `auth.oidc.issuer_url`
- `MONGO_HOST` → `database.mongodb.host`
- `MONGO_PORT` → `database.mongodb.port`
- `MONGO_DATABASE` → `database.mongodb.database_name`
- `MONGO_CONNECTION_STRING` → `database.mongodb.connection_string`
- `LOG_LEVEL` → `monitoring.logging.level`

See `configs/README.md` for detailed configuration documentation.

## Authentication & Authorization

### Development Mode (Mock Authentication)

For local development without an OIDC provider:

```yaml
features:
  auth: false # No authentication required
```

Or with mock authentication:

```yaml
features:
  auth: true
auth:
  type: "mock"
  mock:
    groups: ["admin", "team-alpha"] # Simulated user groups
```

### Production Mode (OIDC)

Configure OIDC authentication:

```yaml
features:
  auth: true
auth:
  type: "oidc"
  oidc:
    client_id: "your-client-id"
    client_secret: "your-client-secret"
    issuer_url: "https://auth.example.com"
```

### Implementing Authorization

Create custom authorization logic by implementing `portal/libs/middleware/authorizationImpl.js`:

```bash
cp portal/libs/middleware/authorizationImpl.js.example portal/libs/middleware/authorizationImpl.js
# Edit authorizationImpl.js to define your authorization rules
```

The middleware receives the authenticated user and can enforce access controls based on groups, roles, or other attributes.

## Docker Deployment

Build the Docker image:

```bash
docker build --security-opt seccomp=unconfined -t policy/portal:latest .
```

Run with Docker:

```bash
docker run -p 3000:3000 \
  -e MONGO_CONNECTION_STRING="mongodb://mongo:27017/aws_data" \
  -e AUTH_TYPE="oidc" \
  -e OIDC_CLIENT_ID="your-client-id" \
  -e OIDC_CLIENT_SECRET="your-secret" \
  -e OIDC_ISSUER_URL="https://auth.example.com" \
  policy/portal:latest
```

## MongoDB Data Structure

The application expects MongoDB collections organized by date with compliance data:

### Expected Collections

- `tags` - Resource tagging compliance data
- `database` - Database version and configuration compliance
- `loadbalancers` - Load balancer configuration compliance
- `autoscaling` - Auto-scaling group compliance
- `kms` - KMS key management compliance

### Document Structure

Documents should include date fields for time-series tracking:

```javascript
{
  year: 2024,
  month: 10,
  day: 7,
  // ... compliance-specific fields
}
```

See individual query files in `portal/queries/compliance/` for specific field requirements.

## Development

### Project Structure

```
/
├── configs/                    # Configuration files (YAML)
├── portal/                     # Main application
│   ├── app.js                 # Entry point
│   ├── routes/                # Route handlers
│   │   ├── compliance/        # Compliance policy routes
│   │   └── policies/          # Policy documentation routes
│   ├── queries/               # MongoDB query functions
│   │   ├── compliance/        # Compliance queries
│   │   └── dashboard/         # Dashboard queries
│   ├── views/                 # Nunjucks templates
│   ├── libs/                  # Core libraries
│   │   ├── config-loader.js  # Configuration system
│   │   ├── logger.js         # Logging utility
│   │   └── middleware/       # Express middleware
│   ├── utils/                 # Shared utilities
│   ├── stylesheets/          # Custom SCSS
│   ├── javascripts/          # Client-side JS
│   └── assets/               # Static assets
├── scripts/                   # Utility scripts
└── account_mappings.yaml     # AWS account to team mappings
```

### Adding a New Compliance Policy

1. **Create MongoDB query module**: `portal/queries/compliance/newpolicy.js`

   ```javascript
   async function getLatestDate(req) {
     const db = req.app.locals.mongodb;
     // Query logic...
   }
   module.exports = { getLatestDate };
   ```

2. **Create route handler**: `portal/routes/compliance/newpolicy.js`

   ```javascript
   const express = require("express");
   const router = express.Router();
   const queries = require("../../queries/compliance/newpolicy");

   router.get("/", async (req, res) => {
     // Route logic...
   });

   module.exports = router;
   ```

3. **Register route in app.js**:

   ```javascript
   const newpolicyRoutes = require("./routes/compliance/newpolicy");
   app.use("/compliance/newpolicy", requiresAuth(), newpolicyRoutes);
   ```

4. **Create Nunjucks template**: `portal/views/policies/newpolicy/*.njk`

5. **Add navigation link**: Update `portal/routes/compliance.js`

### Running Tests

```bash
# Tests are not yet implemented
npm test
```

### Code Style

The project uses conventional commits for semantic versioning:

- `feat:` - New features (minor version bump)
- `fix:` - Bug fixes (patch version bump)
- `chore:` - Maintenance tasks (no version bump)
- `refactor:` - Code refactoring (no version bump)
- `docs:` - Documentation changes (no version bump)

Breaking changes should include `BREAKING CHANGE:` in the commit body.

## Releases

The project uses [semantic-release](https://github.com/semantic-release/semantic-release) for automated versioning and releases.

Releases are automatically created when:

1. Changes are pushed to the `main` branch
2. CI checks pass
3. Conventional commits are present

The release process:

- Analyzes commit messages
- Determines version bump (major/minor/patch)
- Generates `CHANGELOG.md`
- Creates a GitHub release with release notes
- Tags the release

## Contributing

1. Create a feature branch from `main`
2. Make your changes with conventional commits
3. Push and create a pull request
4. Wait for CI checks to pass
5. Merge to main (semantic-release will handle versioning)

## License

[Specify your license here]

## Support

For issues and questions:

- Open an issue on [GitHub](https://github.com/reaandrew/cloud-advice-dashboard/issues)
- Refer to `CLAUDE.md` for detailed architecture documentation

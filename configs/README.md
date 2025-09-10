# Configuration System

The Cloud Advice Dashboard uses a flexible configuration system that supports environment-specific configs loaded via command line arguments.

## Directory Structure

```
configs/
├── default.yaml          # Base configuration (always loaded)
├── <environment>.yaml    # <environment> overrides
```

## Configuration Loading Order

Configurations are merged in the following priority order (higher priority overrides lower):

1. **default.yaml** (always loaded first)
2. **Command line config files** (loaded in order specified)
3. **Environment variables** (highest priority)

## Usage Examples

### Basic Usage (default config only)
```bash
node portal/app.js
```

### Load with environment-specific config
```bash
# Load default + production config
node portal/app.js --config production

# Load default + staging config
node portal/app.js --config staging.yaml

# Load multiple configs (processed in order)
node portal/app.js --config base --config production --config custom
```

### Alternative syntax
```bash
# Using equals sign
node portal/app.js --config=production

# Using short flag
node portal/app.js -c production
```

### Using absolute or relative paths
```bash
# Relative path from project root
node portal/app.js --config ./configs/production.yaml

# Absolute path
node portal/app.js --config /path/to/custom-config.yaml
```

## Creating Environment Configs

1. Copy an example file:
   ```bash
   cp configs/production.yaml.example configs/production.yaml
   ```

2. Edit the new file to include only the settings you want to override from `default.yaml`

3. Use the config when starting the application:
   ```bash
   node portal/app.js --config production
   ```

## Environment Variable Overrides

The following environment variables will override config file settings:

- `PORT` → `app.port`
- `BASE_URL` → `app.base_url`
- `AUTH_MOCK_GROUPS` -> `auth.mock.groups`
- `AUTH_TYPE` → `auth.type`
- `OIDC_CLIENT_ID` → `auth.oidc.client_id`
- `OIDC_CLIENT_SECRET` → `auth.oidc.client_secret`
- `OIDC_ISSUER_URL` → `auth.oidc.issuer_url`
- `MONGO_HOST` → `database.mongodb.host`
- `MONGO_PORT` → `database.mongodb.port`
- `MONGO_DATABASE` → `database.mongodb.database_name`
- `LOG_LEVEL` → `monitoring.logging.level`

## Configuration File Format

Configuration files use YAML format and support deep merging. Only include the sections you want to override:

```yaml
# Example: Override just the app port and database host
app:
  port: 8080

database:
  mongodb:
    host: "prod-mongo.example.com"
```

## Debugging Configuration

Enable debug mode to see which configuration files were loaded:

```yaml
development:
  debug: true
```

Or set the environment variable:
```bash
NODE_ENV=development node portal/app.js --config production
```

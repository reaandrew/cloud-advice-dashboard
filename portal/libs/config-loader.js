const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

// Import logger after it's available
let logger;
try {
    logger = require('./logger');
} catch {
    // Fallback to console if logger not available during bootstrap
    logger = {
        debug: console.log,
        info: console.log,
        warn: console.warn,
        error: console.error
    };
}

class ConfigLoader {
    constructor() {
        this.config = {};
        this.configsDir = path.join(__dirname, '../../configs');
        this.defaultConfigPath = path.join(this.configsDir, 'default.yaml');
        this.configFiles = [];
        this.envOverrides = this.getEnvOverrides();
    }

    /**
     * Set additional config files to load (from command line arguments)
     * @param {string[]} configFiles - Array of config file paths or names
     */
    setConfigFiles(configFiles = []) {
        this.configFiles = configFiles.map(file => {
            // If it's just a filename, look in configs directory
            if (!path.isAbsolute(file) && !file.includes('/')) {
                return path.join(this.configsDir, file.endsWith('.yaml') ? file : `${file}.yaml`);
            }
            // If it's a relative path, resolve it from project root
            if (!path.isAbsolute(file)) {
                return path.resolve(path.join(__dirname, '../..', file));
            }
            // Absolute path, use as-is
            return file;
        });
    }

    /**
     * Load and merge configuration files
     * Priority: Environment Variables > Additional Config Files > Default Config
     */
    load() {
        try {
            logger.debug('About to initialize config...');
            this.config = {};
            
            // Always load default configuration first
            logger.debug('About to load default configuration...');
            if (fs.existsSync(this.defaultConfigPath)) {
                logger.debug(`Reading default config from: ${this.defaultConfigPath}`);
                const defaultConfig = yaml.load(fs.readFileSync(this.defaultConfigPath, 'utf8'));
                this.config = this.deepMerge(this.config, defaultConfig);
                logger.info('✓ Default configuration loaded');
            } else {
                logger.warn(`Default configuration file not found at ${this.defaultConfigPath}`);
            }

            // Load additional configuration files in order
            if (this.configFiles.length > 0) {
                logger.debug(`About to load ${this.configFiles.length} additional config files...`);
            }
            this.configFiles.forEach((configPath, index) => {
                logger.debug(`Loading config file ${index + 1}/${this.configFiles.length}: ${configPath}`);
                if (fs.existsSync(configPath)) {
                    const configData = yaml.load(fs.readFileSync(configPath, 'utf8'));
                    this.config = this.deepMerge(this.config, configData);
                    logger.info(`✓ Configuration loaded from ${path.relative(path.join(__dirname, '../..'), configPath)}`);
                } else {
                    logger.warn(`Configuration file not found: ${configPath}`);
                }
            });

            // Apply environment variable overrides last
            logger.debug('About to apply environment variable overrides...');
            this.applyEnvOverrides();
            logger.debug('✓ Environment variable overrides applied');

            logger.info(`✓ Configuration loading complete - ${1 + this.configFiles.filter(f => fs.existsSync(f)).length} files loaded`);
            return this.config;
        } catch (error) {
            logger.error('Error loading configuration:', error);
            throw error;
        }
    }

    /**
     * Deep merge two objects, with source overriding target
     */
    deepMerge(target, source) {
        const output = Object.assign({}, target);
        
        if (this.isObject(target) && this.isObject(source)) {
            Object.keys(source).forEach(key => {
                if (this.isObject(source[key])) {
                    if (!(key in target)) {
                        Object.assign(output, { [key]: source[key] });
                    } else {
                        output[key] = this.deepMerge(target[key], source[key]);
                    }
                } else {
                    Object.assign(output, { [key]: source[key] });
                }
            });
        }
        
        return output;
    }

    /**
     * Check if value is an object
     */
    isObject(item) {
        return item && typeof item === 'object' && !Array.isArray(item);
    }

    /**
     * Get environment variable overrides
     */
    getEnvOverrides() {
        return {
            // Application settings
            'app.port': process.env.PORT,
            'app.environment': process.env.NODE_ENV,
            'app.base_url': process.env.BASE_URL,
            
            // Authentication
            'auth.type': process.env.AUTH_TYPE,
            'auth.oidc.client_id': process.env.OIDC_CLIENT_ID,
            'auth.oidc.client_secret': process.env.OIDC_CLIENT_SECRET,
            'auth.oidc.issuer_url': process.env.OIDC_ISSUER_URL,
            
            // Database
            'database.mongodb.host': process.env.MONGO_HOST,
            'database.mongodb.port': process.env.MONGO_PORT,
            'database.mongodb.database_name': process.env.MONGO_DATABASE,
            'database.mongodb.connection_string': process.env.MONGO_CONNECTION_STRING,
            
            // AWS
            'integrations.aws.region': process.env.AWS_REGION,
            'integrations.aws.assume_role_arn': process.env.AWS_ASSUME_ROLE_ARN,
            
            // Logging
            'monitoring.logging.level': process.env.LOG_LEVEL,
            
            // Security
            'security.session.secret': process.env.SESSION_SECRET,
        };
    }

    /**
     * Apply environment variable overrides to config
     */
    applyEnvOverrides() {
        Object.entries(this.envOverrides).forEach(([path, value]) => {
            if (value !== undefined) {
                this.setNestedProperty(this.config, path, value);
            }
        });
    }

    /**
     * Set a nested property using dot notation
     */
    setNestedProperty(obj, path, value) {
        const keys = path.split('.');
        let current = obj;
        
        for (let i = 0; i < keys.length - 1; i++) {
            const key = keys[i];
            if (!(key in current) || !this.isObject(current[key])) {
                current[key] = {};
            }
            current = current[key];
        }
        
        // Handle type conversion for environment variables
        if (typeof value === 'string') {
            // Try to parse numbers
            if (/^\d+$/.test(value)) {
                value = parseInt(value, 10);
            }
            // Try to parse booleans
            else if (value.toLowerCase() === 'true') {
                value = true;
            }
            else if (value.toLowerCase() === 'false') {
                value = false;
            }
        }
        
        current[keys[keys.length - 1]] = value;
    }

    /**
     * Get a configuration value using dot notation
     */
    get(path, defaultValue = undefined) {
        const keys = path.split('.');
        let current = this.config;
        
        for (const key of keys) {
            if (current && typeof current === 'object' && key in current) {
                current = current[key];
            } else {
                return defaultValue;
            }
        }
        
        return current;
    }

    /**
     * Get the entire configuration object
     */
    getAll() {
        return this.config;
    }

    /**
     * Reload configuration
     */
    reload() {
        return this.load();
    }

    /**
     * Get list of loaded config files for debugging
     */
    getLoadedFiles() {
        const files = [this.defaultConfigPath];
        return files.concat(this.configFiles.filter(f => fs.existsSync(f)));
    }
}

// Parse command line arguments for config files
function parseConfigArgs() {
    const args = process.argv.slice(2);
    const configFiles = [];
    
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--config' || args[i] === '-c') {
            if (i + 1 < args.length) {
                configFiles.push(args[i + 1]);
                i++; // Skip next argument as it's the config file
            }
        } else if (args[i].startsWith('--config=')) {
            configFiles.push(args[i].split('=')[1]);
        }
    }
    
    if (configFiles.length > 0) {
        console.log(`Found ${configFiles.length} config files from args: ${configFiles.join(', ')}`);
    }
    return configFiles;
}

// Create singleton instance
const configLoader = new ConfigLoader();

const configFiles = parseConfigArgs();
if (configFiles.length > 0) {
    configLoader.setConfigFiles(configFiles);
}

const config = configLoader.load();

module.exports = {
    config,
    configLoader,
    get: (path, defaultValue) => configLoader.get(path, defaultValue),
    getAll: () => configLoader.getAll(),
    reload: () => configLoader.reload(),
    getLoadedFiles: () => configLoader.getLoadedFiles()
};
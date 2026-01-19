const fs = require('fs');
const path = require('path');
const config = require('./config-loader');

class FileLogger {
    constructor(options = {}) {
        this.levels = {
            debug: 0,
            info: 1,
            warn: 2,
            error: 3
        };

        // Set defaults or use provided options
        this.currentLevel = this.levels[options.level || 'debug'];
        this.format = options.format || 'text';
        this.logDir = options.logDir || path.join(process.cwd(), 'logs');
        this.filename = options.filename || 'app.log';

        // Ensure log directory exists
        if (!fs.existsSync(this.logDir)) {
            fs.mkdirSync(this.logDir, { recursive: true });
        }

        this.logPath = path.join(this.logDir, this.filename);

        // Write header to log file
        const timestamp = new Date().toISOString();
        const header = `\n\n========== LOG SESSION STARTED AT ${timestamp} ==========\n\n`;
        try {
            fs.appendFileSync(this.logPath, header);
        } catch (err) {
            console.error(`ERROR WRITING TO LOG FILE ${this.logPath}: ${err.message}`);
        }

        // Log initial message
        this.info(`File logger initialized: ${this.logPath}`);
    }

    log(level, message, ...args) {
        if (this.levels[level] >= this.currentLevel) {
            const timestamp = new Date().toISOString();
            let logEntry;

            if (this.format === 'json') {
                logEntry = JSON.stringify({
                    timestamp,
                    level: level.toUpperCase(),
                    message,
                    ...(args.length > 0 && { data: args })
                }) + '\n';
            } else {
                // Format: [timestamp] LEVEL: message data1 data2 ...
                const prefix = `[${timestamp}] ${level.toUpperCase()}:`;

                // Handle various data types for args
                let formattedArgs = args.map(arg => {
                    if (typeof arg === 'object') {
                        try {
                            return JSON.stringify(arg, null, 2);
                        } catch (e) {
                            return `[Object: ${typeof arg}]`;
                        }
                    }
                    return arg;
                });

                logEntry = `${prefix} ${message} ${formattedArgs.join(' ')}\n`;
            }

            // Write to file
            try {
                fs.appendFileSync(this.logPath, logEntry);
            } catch (err) {
                console.error(`Failed to write to log file: ${err.message}`);
                // Fall back to console
                console.log(prefix, message, ...args);
            }

            // Also output to console for visibility
            if (level === 'error' || level === 'warn') {
                console[level](message, ...args);
            }
        }
    }

    debug(message, ...args) {
        this.log('debug', message, ...args);
    }

    info(message, ...args) {
        this.log('info', message, ...args);
    }

    warn(message, ...args) {
        this.log('warn', message, ...args);
    }

    error(message, ...args) {
        this.log('error', message, ...args);
    }

    setLevel(level) {
        if (this.levels[level] !== undefined) {
            this.currentLevel = this.levels[level];
            this.info(`Log level set to: ${level}`);
        }
    }

    setFormat(format) {
        this.format = format;
        this.info(`Log format set to: ${format}`);
    }
}

// Create generic logger
const createLogger = (filename = 'app.log') => {
    return new FileLogger({
        level: 'debug',
        format: 'text',
        filename
    });
};

// For backwards compatibility
const createLoadBalancerLogger = () => createLogger('loadbalancers.log');

module.exports = {
    FileLogger,
    createLogger,
    createLoadBalancerLogger
};
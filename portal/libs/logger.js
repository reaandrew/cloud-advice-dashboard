const config = require('./config-loader');

class Logger {
    constructor(level, format) {
        this.levels = {
            debug: 0,
            info: 1,
            warn: 2,
            error: 3
        }
        this.currentLevel = this.levels[level];
        this.format = format;
    }

    log(level, message, ...args) {
        if (this.levels[level] >= this.currentLevel) {
            // Debug code to trace large Map objects
            for (const arg of args) {
                if (arg instanceof Map && arg.size > 25) {
                    console.error('Large Map detected in logger call:', message);
                    console.error('Call stack:', new Error().stack);
                    // Don't log the full Map, just note it was found
                    console.error(`Map has ${arg.size} entries`);
                    // Replace the large Map with a string to avoid huge output
                    args = args.map(a => (a === arg) ? `[Map with ${arg.size} entries]` : a);
                    break;
                }
            }

            const timestamp = new Date().toISOString();

            if (this.format === 'json') {
                const logEntry = {
                    timestamp,
                    level: level.toUpperCase(),
                    message,
                    ...(args.length > 0 && { data: args })
                };
                console.log(JSON.stringify(logEntry));
            } else {
                const prefix = `[${timestamp}] ${level.toUpperCase()}:`;
                console.log(prefix, message, ...args);
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
        }
    }

    setFormat(format) {
        this.format = format;
    }
}

const logger = new Logger();

module.exports = logger;

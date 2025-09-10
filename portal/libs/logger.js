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

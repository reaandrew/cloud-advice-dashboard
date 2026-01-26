const winston = require('winston');
const config = require('./config-loader');

const level = config.get('monitoring.logging.level', 'info');
const format = config.get('monitoring.logging.format', 'console');

const consoleFormat = winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
        const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
        return `[${timestamp}] ${level.toUpperCase()}: ${message}${metaStr}`;
    })
);

const jsonFormat = winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
);

const logger = winston.createLogger({
    level: level,
    format: format === 'json' ? jsonFormat : consoleFormat,
    transports: [
        new winston.transports.Console()
    ]
});

module.exports = logger;

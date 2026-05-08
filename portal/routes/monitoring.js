const express = require('express');
const path = require('path');
const fs = require('fs');
const config = require('../libs/config-loader');

const router = express.Router();

// Load build info once at startup
let buildInfo = {
    commit: process.env.BUILD_COMMIT || 'unknown',
    buildTime: process.env.BUILD_TIME || 'unknown',
    branch: process.env.BUILD_BRANCH || 'unknown'
};

// Try to load from build-info.json if it exists
const buildInfoPath = path.join(__dirname, '..', 'build-info.json');
try {
    if (fs.existsSync(buildInfoPath)) {
        const fileInfo = JSON.parse(fs.readFileSync(buildInfoPath, 'utf8'));
        buildInfo = { ...buildInfo, ...fileInfo };
    }
} catch (e) {
    // Ignore errors reading build-info.json
}

// Middleware to restrict to localhost only
function localhostOnly(req, res, next) {
    const ip = req.ip || req.connection.remoteAddress;
    if (ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1') {
        next();
    } else {
        res.status(403).json({ error: 'Forbidden' });
    }
}

router.get('/version', (req, res) => {
    const pkg = require(path.join(__dirname, '..', 'package.json'));
    res.json({ version: pkg.version });
});

router.get('/health', localhostOnly, (req, res) => {
    const pkg = require(path.join(__dirname, '..', 'package.json'));
    res.json({
        status: 'ok',
        version: pkg.version,
        commit: buildInfo.commit,
        branch: buildInfo.branch,
        buildTime: buildInfo.buildTime,
        uptime: process.uptime(),
        nodeVersion: process.version
    });
});

router.get('/flags', (req, res) => {
    res.json({ features: config.get('features', {}) });
});

module.exports = router;

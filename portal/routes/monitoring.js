const express = require('express');
const path = require('path');
const config = require('../libs/config-loader');

const router = express.Router();

router.get('/version', (req, res) => {
    const pkg = require(path.join(__dirname, '..', 'package.json'));
    res.json({ version: pkg.version });
});

router.get('/flags', (req, res) => {
    res.json({ features: config.get('features', {}) });
});

module.exports = router;

const express = require('express');
const config = require('../libs/config-loader');
const { registerGlobalComplianceOverview } = require('../libs/middleware/registerComplianceRule');
const { rules } = require('../queries');

const router = express.Router();

if (config.get("features.compliance", false)) {
    router.get("/", registerGlobalComplianceOverview(rules));
} else {
    router.get("/", (_, res) => res.redirect("/policies"));
}

module.exports = router;

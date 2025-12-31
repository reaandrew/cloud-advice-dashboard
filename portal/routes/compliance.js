const express = require('express');
const router = express.Router();

const { registerComplianceRule, registerComplianceRuleSummary } = require('../libs/middleware/registerComplianceRule');
const registerComplianceView = require('../libs/middleware/registerComplianceView');
const { views, rules } = require('../queries');

views.forEach(view => registerComplianceView(view, router));
rules.forEach(rule => registerComplianceRule(rule, router));

router.get('/', registerComplianceRuleSummary(rules));

module.exports = { router, views };

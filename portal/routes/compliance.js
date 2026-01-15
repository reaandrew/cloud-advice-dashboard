const express = require('express');
const router = express.Router();

const { registerComplianceRule, registerComplianceRuleSummary } = require('../libs/middleware/registerComplianceRule');
const registerComplianceView = require('../libs/middleware/registerComplianceView');
const { views, rules } = require('../queries');

views.forEach(view => registerComplianceView(view, router, rules, views));
rules.forEach(rule => registerComplianceRule(rule, router, rules, views));

router.get('/', registerComplianceRuleSummary(rules, views));

module.exports = { router, views };

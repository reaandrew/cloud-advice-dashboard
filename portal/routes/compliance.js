const express = require('express');
const router = express.Router();

const { registerComplianceRule, registerComplianceRuleSummary } = require('../libs/middleware/registerComplianceRule');
const registerComplianceView = require('../libs/middleware/registerComplianceView');
const { autoscalingGroupDimensionsRule, autoscalingGroupsView } = require('../queries/compliance/autoscaling');
const { kmsKeysRule, kmsKeysView } = require('../queries/compliance/kms');
const { missingTagsRule, taggingView } = require('../queries/compliance/tagging');
const { databasesView, databaseVersionsRule } = require('../queries/compliance/database');
const { loadBalancersView, loadBalancerComplianceRule } = require('../queries/compliance/loadbalancers');

const views = [
    autoscalingGroupsView,
    kmsKeysView,
    taggingView,
    databasesView,
    loadBalancersView,
];

const rules = [
    autoscalingGroupDimensionsRule,
    kmsKeysRule,
    missingTagsRule,
    databaseVersionsRule,
    loadBalancerComplianceRule,
];

views.forEach(view => registerComplianceView(view, router));
rules.forEach(rule => registerComplianceRule(rule, router));

router.get('/', registerComplianceRuleSummary(rules));

module.exports = { router, views };

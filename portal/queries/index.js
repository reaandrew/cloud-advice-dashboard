const { autoscalingGroupDimensionsRule, autoscalingGroupsView } = require('./autoscaling');
const { kmsKeysRule, kmsKeysView } = require('./kms');
const { missingTagsRule, taggingView } = require('./tagging');
const { databasesView, databaseVersionsRule } = require('./database');
const { loadBalancersView, loadBalancerComplianceRule } = require('./loadbalancers');

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

module.exports = { views, rules }

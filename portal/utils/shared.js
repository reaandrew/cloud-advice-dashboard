const path = require('path');
const { get } = require('../libs/config-loader');

// Load account mappings from config
const mappings = get('account_mappings', []);

// Create lookup maps for different fields
const accountIdToTeam = Object.fromEntries(mappings.map(mapping => [mapping.OwnerId, mapping.Team]));
const accountIdToService = Object.fromEntries(mappings.map(mapping => [mapping.OwnerId, mapping.Service]));
const accountIdToCode = Object.fromEntries(mappings.map(mapping => [mapping.OwnerId, mapping.Code]));
const accountIdToApplicationEnv = Object.fromEntries(mappings.map(mapping => [mapping.OwnerId, mapping['Application Env']]));
const accountIdToECSAccount = Object.fromEntries(mappings.map(mapping => [mapping.OwnerId, mapping['ECS Account']]));

// Create a comprehensive lookup function
const getAccountInfo = (accountId) => {
    const mapping = mappings.find(m => m.OwnerId === accountId);
    return mapping ? {
        team: mapping.Team,
        service: mapping.Service,
        code: mapping.Code,
        applicationEnv: mapping['Application Env'],
        ecsAccount: mapping['ECS Account'],
        description: mapping.description
    } : null;
};

// Debug logging for account mappings
const logger = require('../libs/logger');
logger.debug('Account mappings loaded:', mappings);
logger.debug('Account ID to Team lookup:', accountIdToTeam);

// Breadcrumb configurations
const baseBreadcrumbs = [
    { text: 'Home', href: '/' }
];

const complianceBreadcrumbs = [
    ...baseBreadcrumbs,
    { text: 'Compliance Reports', href: '/compliance' }
];

const policiesBreadcrumbs = [
    ...baseBreadcrumbs,
    { text: 'Policies', href: '/policies' }
];

// Configuration
const markdownRoot = path.join(__dirname, '../markdown');
const mandatoryTags = get('compliance.tagging.mandatory_tags', ["PRCode", "Source", "SN_ServiceID", "SN_Environment", "SN_Application", "BSP"]);

// Database deprecation checking function
function checkDatabaseDeprecation(engine, version) {
    const issues = [];
    const deprecatedVersions = get('compliance.database.deprecated_versions', {});
    
    // Check if this engine has deprecated versions configured
    if (deprecatedVersions[engine]) {
        for (const deprecated of deprecatedVersions[engine]) {
            if (version.startsWith(deprecated.version) || version.includes(deprecated.version)) {
                issues.push(deprecated.message);
            }
        }
    }
    
    return issues;
}

module.exports = {
    accountIdToTeam,
    accountIdToService,
    accountIdToCode,
    accountIdToApplicationEnv,
    accountIdToECSAccount,
    getAccountInfo,
    baseBreadcrumbs,
    complianceBreadcrumbs,
    policiesBreadcrumbs,
    markdownRoot,
    mandatoryTags,
    checkDatabaseDeprecation
};
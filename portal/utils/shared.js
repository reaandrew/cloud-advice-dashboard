const path = require('path');
const { get } = require('../libs/config-loader');

// Load account mappings from config
const mappings = get('account_mappings', []);
const accountIdToTeam = Object.fromEntries(mappings.map(mapping => [mapping.owner_id, mapping.team]));

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
    baseBreadcrumbs,
    complianceBreadcrumbs,
    policiesBreadcrumbs,
    markdownRoot,
    mandatoryTags,
    checkDatabaseDeprecation
};
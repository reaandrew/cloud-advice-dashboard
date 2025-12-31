const path = require('path');
const { get } = require('../libs/config-loader');

// Load account mappings from config
const mappings = get('account_mappings', []);

// Debug logging for account mappings
const logger = require('../libs/logger');
logger.debug('Account mappings loaded:', mappings);

// Breadcrumb configurations
const baseBreadcrumbs = [
    { text: 'Home', href: '/' }
];

const complianceBreadcrumbs = [
    ...baseBreadcrumbs,
    { text: 'Reports', href: '/compliance' }
];

const policiesBreadcrumbs = [
    ...baseBreadcrumbs,
    { text: 'Policies', href: '/policies' }
];

// Configuration
const markdownRoot = path.join(__dirname, '../markdown');

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

module.exports.baseBreadcrumbs = baseBreadcrumbs;
module.exports.complianceBreadcrumbs = complianceBreadcrumbs;
module.exports.policiesBreadcrumbs = policiesBreadcrumbs;
module.exports.markdownRoot = markdownRoot;

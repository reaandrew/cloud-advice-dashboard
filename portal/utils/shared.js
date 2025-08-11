const fs = require('fs');
const path = require('path');
const yaml = require('yaml');

// Load account mappings
const mappings = yaml.parse(fs.readFileSync(path.join(__dirname, '../config/account_mappings.yaml'), 'utf8'));
const accountIdToTeam = Object.fromEntries(mappings.map(mapping => [mapping.OwnerId, mapping.Team]));

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
const mandatoryTags = ["PRCode", "Source", "SN_ServiceID", "SN_Environment", "SN_Application", "BSP"];

// Database deprecation checking function
function checkDatabaseDeprecation(engine, version) {
    const issues = [];
    
    // MySQL deprecations
    if (engine === 'mysql') {
        if (version.startsWith('5.7')) {
            issues.push('MySQL 5.7 reached end of standard support on February 29, 2024. Now on Extended Support (paid).');
        }
    }
    
    // PostgreSQL deprecations
    if (engine === 'postgres') {
        if (version.startsWith('9.6')) {
            issues.push('PostgreSQL 9.6 reached end of life on November 11, 2021.');
        }
        if (version.startsWith('10.')) {
            issues.push('PostgreSQL 10 reached end of life on November 10, 2022.');
        }
        if (version.startsWith('11.')) {
            issues.push('PostgreSQL 11 reached end of life on November 9, 2023.');
        }
    }
    
    // Oracle deprecations
    if (engine.startsWith('oracle')) {
        if (version.includes('12.1') || version.includes('12.2')) {
            issues.push('Oracle 12c is no longer supported. End of support was March 31, 2022.');
        }
        if (version.includes('11.2')) {
            issues.push('Oracle 11g is no longer supported. Legacy version.');
        }
        if (version.includes('18.0')) {
            issues.push('Oracle 18c is no longer supported. Legacy version.');
        }
    }
    
    // SQL Server deprecations
    if (engine.startsWith('sqlserver')) {
        if (version.includes('12.00')) {
            issues.push('SQL Server 2014 reached end of support on July 9, 2024.');
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
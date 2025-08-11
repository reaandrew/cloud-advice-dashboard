console.log('About to require express...');
const express = require('express');
console.log('✓ Express required');

// Will get both setupAuth and requiresAuth from auth modules
let setupAuth, requiresAuth;

console.log('About to require nunjucks...');
const nunjucks = require('nunjucks');
console.log('✓ Nunjucks required');

console.log('About to require path...');
const path = require('path');
console.log('✓ Path required');

console.log('About to require config-loader...');
const { config, get, getLoadedFiles } = require('./libs/config-loader');
console.log('✓ Config loader required and loaded');

console.log('About to create express app...');
const app = express();
console.log('✓ Express app created');

// Get auth type from config
console.log('About to get auth type from config...');
const AUTH_TYPE = get('auth.type', 'none');
console.log(`✓ Auth type: ${AUTH_TYPE}`);

// Choose the authentication based on the config
console.log('About to setup authentication...');
switch (AUTH_TYPE) {
    case 'none':
        console.log('Loading auth-config-none...');
        const noneAuth = require('./libs/auth-config-none');
        setupAuth = noneAuth.setupAuth;
        requiresAuth = noneAuth.requiresAuth;
        break;
    case 'oidc':
    default:
        console.log('Loading auth-config-oidc...');
        const oidcAuth = require('./libs/auth-config-oidc');
        setupAuth = oidcAuth.setupAuth;
        requiresAuth = oidcAuth.requiresAuth;
        break;
}

console.log('About to configure authentication...');
setupAuth(app);
console.log('✓ Authentication configured');

// Configure Nunjucks using config
console.log('About to configure Nunjucks...');
const nunjucksEnv = nunjucks.configure([
    path.join(__dirname, 'node_modules/govuk-frontend/dist'),
    path.join(__dirname, 'views')
], {
    autoescape: get('frontend.templates.autoescape', true),
    express: app,
    cache: get('frontend.templates.cache', false),
});
console.log('About to add Nunjucks globals...');
nunjucksEnv.addGlobal('govukRebrand', get('frontend.govuk.rebrand', true));
nunjucksEnv.addGlobal('serviceName', get('frontend.govuk.service_name', 'Cloud Advice Dashboard'));
nunjucksEnv.addGlobal('config', config);
console.log('✓ Nunjucks configured');

// Serve GOV.UK Frontend assets
console.log('About to configure static assets...');
app.use('/assets', [
    express.static(path.join(__dirname, 'node_modules/govuk-frontend/dist/govuk/assets')),
    express.static(path.join(__dirname, 'assets')),
]);

// Serve custom stylesheets from the 'stylesheets' directory
app.use('/stylesheets', [
    express.static(path.join(__dirname, 'node_modules/govuk-frontend/dist/govuk')),
    express.static(path.join(__dirname, 'stylesheets')),
]);

app.use('/javascripts', [
    express.static(path.join(__dirname, 'node_modules/govuk-frontend/dist/govuk')),
    express.static(path.join(__dirname, 'javascripts')),
]);
console.log('✓ Static assets configured');

// Import and use route modules
console.log('About to load route modules...');
console.log('Loading index routes...');
const indexRoutes = require('./routes/index');
console.log('Loading compliance routes...');
const complianceRoutes = require('./routes/compliance');
console.log('Loading policies routes...');
const policiesRoutes = require('./routes/policies');
console.log('Loading tagging routes...');
const taggingRoutes = require('./routes/compliance/tagging');
console.log('Loading database routes...');
const databaseRoutes = require('./routes/compliance/database');
console.log('Loading loadbalancers routes...');
const loadbalancersRoutes = require('./routes/compliance/loadbalancers');
console.log('Loading autoscaling routes...');
const autoscalingRoutes = require('./routes/compliance/autoscaling');
console.log('Loading kms routes...');
const kmsRoutes = require('./routes/compliance/kms');
console.log('✓ All route modules loaded');

// Use the routes
console.log('About to configure routes...');
app.use('/', indexRoutes);
app.use('/compliance', requiresAuth(), complianceRoutes);
app.use('/policies', policiesRoutes);
app.use('/compliance/tagging', requiresAuth(), taggingRoutes);
app.use('/compliance/database', requiresAuth(), databaseRoutes);
app.use('/compliance/loadbalancers', requiresAuth(), loadbalancersRoutes);
app.use('/compliance/autoscaling', requiresAuth(), autoscalingRoutes);
app.use('/compliance/kms', requiresAuth(), kmsRoutes);
console.log('✓ Routes configured');

// Get port from config
console.log('About to get config values for startup...');
const port = get('app.port', 3000);
const appName = get('app.name', 'Cloud Advice Dashboard');
const environment = get('app.environment', 'development');
console.log(`✓ Config values - Port: ${port}, App: ${appName}, Env: ${environment}`);

console.log('About to start server...');
app.listen(port, () => {
    console.log(`✓ ${appName} (${environment}) is running on http://localhost:${port}`);
    console.log('✓ Application startup complete');
    
    if (get('development.debug', false)) {
        console.log('Debug mode enabled');
        console.log('Loaded configuration files:', getLoadedFiles().map(f => path.relative(__dirname, f)));
    }
});

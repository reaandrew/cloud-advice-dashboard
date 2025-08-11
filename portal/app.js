const express = require('express');
const { auth, requiresAuth } = require('express-openid-connect');
const nunjucks = require('nunjucks');
const path = require('path');
const { config, get, getLoadedFiles } = require('./libs/config-loader');

const app = express();

// Get auth type from config
const AUTH_TYPE = get('auth.type', 'none');

let setupAuth;

// Choose the authentication based on the environment variable
switch (AUTH_TYPE) {
    case 'none':
        setupAuth = require('./libs/auth-config-none');
        break;
    case 'oidc':
    default:
        setupAuth = require('./libs/auth-config-oidc');
        break;
}

setupAuth(app);

// Configure Nunjucks using config
const nunjucksEnv = nunjucks.configure([
    path.join(__dirname, 'node_modules/govuk-frontend/dist'),
    path.join(__dirname, 'views')
], {
    autoescape: get('frontend.templates.autoescape', true),
    express: app,
    cache: get('frontend.templates.cache', false),
});
nunjucksEnv.addGlobal('govukRebrand', get('frontend.govuk.rebrand', true));
nunjucksEnv.addGlobal('serviceName', get('frontend.govuk.service_name', 'Cloud Advice Dashboard'));
nunjucksEnv.addGlobal('config', config);

// Serve GOV.UK Frontend assets

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

// Import and use route modules
const indexRoutes = require('./routes/index');
const complianceRoutes = require('./routes/compliance');
const policiesRoutes = require('./routes/policies');
const taggingRoutes = require('./routes/compliance/tagging');
const databaseRoutes = require('./routes/compliance/database');
const loadbalancersRoutes = require('./routes/compliance/loadbalancers');
const autoscalingRoutes = require('./routes/compliance/autoscaling');
const kmsRoutes = require('./routes/compliance/kms');

// Use the routes
app.use('/', indexRoutes);
app.use('/compliance', requiresAuth(), complianceRoutes);
app.use('/policies', policiesRoutes);
app.use('/compliance/tagging', requiresAuth(), taggingRoutes);
app.use('/compliance/database', requiresAuth(), databaseRoutes);
app.use('/compliance/loadbalancers', requiresAuth(), loadbalancersRoutes);
app.use('/compliance/autoscaling', requiresAuth(), autoscalingRoutes);
app.use('/compliance/kms', requiresAuth(), kmsRoutes);

// Get port from config
const port = get('app.port', 3000);
const appName = get('app.name', 'Cloud Advice Dashboard');
const environment = get('app.environment', 'development');

app.listen(port, () => {
    console.log(`${appName} (${environment}) is running on http://localhost:${port}`);
    console.log('Configuration loaded successfully');
    
    if (get('development.debug', false)) {
        console.log('Debug mode enabled');
        console.log('Loaded configuration files:', getLoadedFiles().map(f => path.relative(__dirname, f)));
    }
});

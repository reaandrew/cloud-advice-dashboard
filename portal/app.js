const express = require('express');
const { auth, requiresAuth } = require('express-openid-connect');
const nunjucks = require('nunjucks');
const path = require('path');

const app = express();

const AUTH_TYPE = process.env.AUTH_TYPE || 'none';

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

// Configure Nunjucks
const nunjucksEnv = nunjucks.configure([
    path.join(__dirname, 'node_modules/govuk-frontend/dist'),
    path.join(__dirname, 'views')
], {
    autoescape: true,
    express: app,
});
nunjucksEnv.addGlobal('govukRebrand', true);

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

app.listen(3000, () => {
    console.log('Server is running on http://localhost:3000');
});

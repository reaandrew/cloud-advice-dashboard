const express = require('express');
const nunjucks = require('nunjucks');
const path = require('path');
const config = require('./libs/config-loader');

const app = express();

// Configure database
if (config.get('features.compliance', true)) {
    const useMock = config.get('database.mock', false) || process.env.USE_MOCK_DB === 'true';

    if (useMock) {
        app.use(require('./libs/middleware/mongo-mock.js'));
    } else {
        app.use(require('./libs/middleware/mongo.js'));
    }
}

// Configure auth
let attemptSilentLogin = () => (_, __, next) => { next(); };
let requiresAuth = () => (_, __, next) => { next(); };
if (config.get('features.auth', false)) {
    switch (config.get('auth.type')) {
        case 'mock':
            const authMock = require('./libs/middleware/authenticationMock.js');
            app.use(authMock.auth);
            attemptSilentLogin = authMock.attemptSilentLogin;
            requiresAuth = authMock.requiresAuth;
            break;
        case 'oidc':
            app.use(require('./libs/middleware/authentication.js'));
            attemptSilentLogin = require('express-openid-connect').attemptSilentLogin;
            requiresAuth = require('express-openid-connect').requiresAuth;
            break;
        default:
            exit(1);
    }
    app.use(require('./libs/middleware/authorizationImpl.js'));
}

// Configure Nunjucks using config
const nunjucksEnv = nunjucks.configure([
    path.join(__dirname, 'node_modules/govuk-frontend/dist'),
    path.join(__dirname, 'views')
], {
    autoescape: true,
    express: app,
    cache: config.get('frontend.templates.cache', false),

});
nunjucksEnv.addGlobal('govukRebrand', true);
nunjucksEnv.addGlobal('serviceName', config.get('app.name', 'Cloud Advice Dashboard'));
nunjucksEnv.addGlobal('logoUrl', config.get('frontend.govuk.logo_url', '/assets/LOGO.png'));
nunjucksEnv.addGlobal('complianceEnabled', config.get('features.compliance', false));

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
const tenantsRoutes = require('./routes/compliance/tenants');
const teamsRoutes = require('./routes/compliance/teams');

// Use the routes
app.use('/', attemptSilentLogin(), indexRoutes);
app.use('/policies', policiesRoutes);
if (config.get('features.auth', false)) {
    const allowedRedirects = new Set(['/','/compliance','/policies']);
    app.use('/signin', requiresAuth(), (req, res) => {
        const redirect = req.query.redirect;
        if (allowedRedirects.has(redirect)) {
            res.redirect(redirect);
        } else {
            res.redirect("/");
        }
    });
}
if (config.get('features.compliance', true)) {
    app.use('/compliance', requiresAuth(), complianceRoutes);
    app.use('/compliance/tenants', requiresAuth(), tenantsRoutes);
    app.use('/compliance/teams', requiresAuth(), teamsRoutes);
    app.use('/compliance/tagging', requiresAuth(), taggingRoutes);
    app.use('/compliance/database', requiresAuth(), databaseRoutes);
    app.use('/compliance/loadbalancers', requiresAuth(), loadbalancersRoutes);
    app.use('/compliance/autoscaling', requiresAuth(), autoscalingRoutes);
    app.use('/compliance/kms', requiresAuth(), kmsRoutes);
}

// Error handling middleware

// 404 handler - must be after all other routes
app.use((req, res, _) => {
    res.status(404);

    // Respond with 404 page
    if (req.accepts('html')) {
        res.render('errors/404.njk', {
            url: req.url,
            currentSection: null
        });
        return;
    }

    // Respond with JSON for API requests
    if (req.accepts('json')) {
        res.json({ error: 'Not found' });
        return;
    }

    // Default to plain text
    res.type('txt').send('Not found');
});

// 500 error handler - must be last middleware
app.use((err, req, res, next) => {
    res.status(err.status || 500);

    // Respond with 500 page
    if (req.accepts('html')) {
        res.render('errors/500.njk', {
            error: config.get('development.debug', false) ? err : {},
            currentSection: null
        });
        return;
    }

    // Respond with JSON for API requests
    if (req.accepts('json')) {
        res.json({
            error: config.get('development.debug', false) ? err.message : 'Internal server error'
        });
        return;
    }

    // Default to plain text
    res.type('txt').send(get('development.debug', false) ? err.stack : 'Internal server error');
});

// config.get port from config
const port = config.get('app.port', 3000);

app.listen(port, () => {
});

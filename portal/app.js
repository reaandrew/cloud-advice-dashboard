const express = require('express');
const nunjucks = require('nunjucks');
const path = require('path');
const { config, get, getLoadedFiles } = require('./libs/config-loader');
const logger = require('./libs/logger');

// Will get both setupAuth and requiresAuth from auth modules
let setupAuth, requiresAuth;

logger.debug('Creating express app...');
const app = express();
logger.debug('✓ Express app created');

// Get auth type from config
const AUTH_TYPE = get('auth.type', 'none');
logger.info(`Auth type: ${AUTH_TYPE}`);

// Choose the authentication based on the config
logger.debug('Setting up authentication...');
switch (AUTH_TYPE) {
    case 'none':
        const noneAuth = require('./libs/auth-config-none');
        setupAuth = noneAuth.setupAuth;
        requiresAuth = noneAuth.requiresAuth;
        break;
    case 'oidc':
    default:
        const oidcAuth = require('./libs/auth-config-oidc');
        setupAuth = oidcAuth.setupAuth;
        requiresAuth = oidcAuth.requiresAuth;
        break;
}

setupAuth(app);
logger.info('✓ Authentication configured');

// Configure Nunjucks using config
logger.debug('Configuring Nunjucks...');
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
nunjucksEnv.addGlobal('logoUrl', get('frontend.govuk.logo_url', '/assets/LOGO.png'));
nunjucksEnv.addGlobal('config', config);
logger.debug('✓ Nunjucks configured');

// Serve GOV.UK Frontend assets
logger.debug('Configuring static assets...');
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
logger.debug('✓ Static assets configured');

// Import and use route modules
logger.debug('Loading route modules...');
const indexRoutes = require('./routes/index');
const complianceRoutes = require('./routes/compliance');
const policiesRoutes = require('./routes/policies');
const taggingRoutes = require('./routes/compliance/tagging');
const databaseRoutes = require('./routes/compliance/database');
const loadbalancersRoutes = require('./routes/compliance/loadbalancers');
const autoscalingRoutes = require('./routes/compliance/autoscaling');
const kmsRoutes = require('./routes/compliance/kms');
logger.debug('✓ Route modules loaded');

// Use the routes
logger.debug('Configuring routes...');
app.use('/', indexRoutes);
app.use('/compliance', requiresAuth(), complianceRoutes);
app.use('/policies', policiesRoutes);
app.use('/compliance/tagging', requiresAuth(), taggingRoutes);
app.use('/compliance/database', requiresAuth(), databaseRoutes);
app.use('/compliance/loadbalancers', requiresAuth(), loadbalancersRoutes);
app.use('/compliance/autoscaling', requiresAuth(), autoscalingRoutes);
app.use('/compliance/kms', requiresAuth(), kmsRoutes);
logger.debug('✓ Routes configured');

// Error handling middleware
logger.debug('Setting up error handling...');

// 404 handler - must be after all other routes
app.use((req, res, next) => {
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
    // Log the error
    logger.error('Application error:', err);

    res.status(err.status || 500);

    // Respond with 500 page
    if (req.accepts('html')) {
        res.render('errors/500.njk', { 
            error: get('development.debug', false) ? err : {},
            currentSection: null 
        });
        return;
    }

    // Respond with JSON for API requests
    if (req.accepts('json')) {
        res.json({ 
            error: get('development.debug', false) ? err.message : 'Internal server error'
        });
        return;
    }

    // Default to plain text
    res.type('txt').send(get('development.debug', false) ? err.stack : 'Internal server error');
});

logger.debug('✓ Error handling configured');

// Get port from config
const port = get('app.port', 3000);
const appName = get('app.name', 'Cloud Advice Dashboard');
const environment = get('app.environment', 'development');

logger.debug('Starting server...');
app.listen(port, () => {
    logger.info(`✓ ${appName} (${environment}) is running on http://localhost:${port}`);
    logger.info('✓ Application startup complete');
    
    if (get('development.debug', false)) {
        logger.debug('Debug mode enabled');
        logger.debug('Loaded configuration files:', getLoadedFiles().map(f => path.relative(__dirname, f)));
    }
});

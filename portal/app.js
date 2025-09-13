const express = require('express');
const nunjucks = require('nunjucks');
const path = require('path');
const config = require('./libs/config-loader');
const logger = require('./libs/logger');

// Configure logger
logger.setLevel(config.get('monitoring.logging.level', 'info'));
logger.setFormat(config.get('monitoring.logging.format', 'console'));

logger.debug('Creating express app...');
const app = express();
logger.debug('✓ Express app created');

// Configure middleware
app.use(require('./libs/middleware/mongo.js'));
let requiresAuth = () => (_, __, next) => { next(); };
if (config.get('features.auth')) {
    requiresAuth = require('express-openid-connect').requiresAuth;
    switch (config.get('auth.type')) {
        case 'mock':
            logger.debug("Using mock auth middleware")
            app.use(require('./libs/middleware/authenticationMock.js'));
            break;
        case 'oidc':
            logger.debug("Using oidc auth middleware")
            app.use(require('./libs/middleware/authentication.js'));
            break;
        default:
            logger.error(`Failed to setup auth. Unknown auth type: ${config.get('auth.type')}`);
            exit(1);
    }
    app.use(require('./libs/middleware/authorizationImpl.js'));
} else {
}
logger.info('✓ Auth and DB Middleware configured');

// Configure Nunjucks using config
logger.debug('Configuring Nunjucks...');
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
    // Log the error
    if (err["message"] !== undefined) {
        logger.error(`Application error`, { message: err.message, stack: err.stack });
    } else {
        logger.error(`Application error`, err);
    }

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

logger.debug('✓ Error handling configured');

// config.get port from config
const port = config.get('app.port', 3000);
const appName = config.get('app.name', 'Cloud Advice Dashboard');
const environment = config.get('app.environment', 'development');

logger.debug('Starting server...');
app.listen(port, () => {
    logger.info(`✓ ${appName} (${environment}) is running on http://localhost:${port}`);
    logger.info('✓ Application startup complete');

    if (config.get('development.debug', false)) {
        logger.debug('Debug mode enabled');
        logger.debug('Loaded configuration files:', config.getLoadedFiles().map(f => path.relative(__dirname, f)));
    }
});

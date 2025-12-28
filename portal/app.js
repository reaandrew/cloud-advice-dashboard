const express = require('express');
const nunjucks = require('nunjucks');
const path = require('path');
const config = require('./libs/config-loader');
const logger = require('./libs/logger');
const complianceModule = require('./routes/compliance');
const mongoClient = require('./libs/middleware/mongo');

// Configure logger
logger.setLevel(config.get('monitoring.logging.level', 'info'));
logger.setFormat(config.get('monitoring.logging.format', 'console'));

logger.debug('Creating express app...');
const app = express();
logger.debug('✓ Express app created');

// Configure database
if (config.get('features.compliance', true)) {
    app.use(mongoClient.mongo);
}

// Configure auth
let attemptSilentLogin = () => (_, __, next) => { next(); };
let requiresAuth = () => (_, __, next) => { next(); };
if (config.get('features.auth', false)) {
    switch (config.get('auth.type')) {
        case 'mock':
            logger.debug('Using mock auth middleware');
            const authMock = require('./libs/middleware/authenticationMock.js');
            app.use(authMock.auth);
            attemptSilentLogin = authMock.attemptSilentLogin;
            requiresAuth = authMock.requiresAuth;
            break;
        case 'oidc':
            logger.debug('Using oidc auth middleware')
            app.use(require('./libs/middleware/authentication.js'));
            attemptSilentLogin = require('express-openid-connect').attemptSilentLogin;
            requiresAuth = require('express-openid-connect').requiresAuth;
            break;
        default:
            logger.error(`Failed to setup auth. Unknown auth type: ${config.get('auth.type')}`);
            exit(1);
    }
    app.use(require('./libs/middleware/authorizationImpl.js'));
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
nunjucksEnv.addGlobal('complianceEnabled', config.get('features.compliance', false));
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
const policiesRoutes = require('./routes/policies');
const tenantsRoutes = require('./routes/compliance/tenants');
const teamsRoutes = require('./routes/compliance/teams');
logger.debug('✓ Route modules loaded');

// Use the routes
logger.debug('Configuring routes...');
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
    logger.debug('✓ Auth Routes configured');
}
if (config.get('features.compliance', true)) {
    app.use('/compliance', requiresAuth(), complianceModule.router);
    app.use('/compliance/tenants', requiresAuth(), tenantsRoutes);
    app.use('/compliance/teams', requiresAuth(), teamsRoutes);
    logger.debug('✓ Compliance Routes configured');
}
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
    if (err['message'] !== undefined) {
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

logger.debug('Starting server...');
async function startServer() {
    try {
        if (config.get('features.compliance', true)) {
            const db = await mongoClient.connect();

            logger.info('Syncing compliance views...');
            for (const view of complianceModule.views) {
                const collection_name = `compliance_view_${view.id}`;
                try { await db.collection(collection_name).drop(); } catch (e) { /* ignore if missing */ }

                await db.createCollection(collection_name, {
                    viewOn: view.collection,
                    pipeline: view.pipeline,
                });
                logger.debug(`  ✓ Synced view: ${collection_name}`);
            }
        }

        app.listen(port, () => {
            logger.info(`✓ ${appName} is running on http://localhost:${port}`);
            logger.info('✓ Application startup complete');
            if (config.get('development.debug', false)) {
                logger.debug('Debug mode enabled');
                logger.debug('Loaded configuration files:', config.getLoadedFiles().map(f => path.relative(__dirname, f)));
            }
        });
    } catch (err) {
        logger.error('CRITICAL: Failed to start application', err);
        process.exit(1);
    }
};

startServer();

const { auth } = require('express-openid-connect');
const config = require('../config-loader');

module.exports = auth({
    authorizationParams: {
        response_type: config.get('auth.oidc.response_type'),
        scope: config.get('auth.oidc.scope'),
    },
    authRequired: false,
    enableTelemetry: false,
    issuerBaseURL: config.get('auth.oidc.issuer_url'),
    baseURL: config.get('app.base_url'),
    clientID: config.get('auth.oidc.client_id'),
    clientSecret: config.get('auth.oidc.client_secret'),
    secret: config.get('auth.oidc.client_secret'),
})

const { auth } = require('express-openid-connect');

function setupOIDC(app) {
    const clientId = process.env.OIDC_CLIENT_ID;
    if (!clientId) {
        console.error("ERROR: OIDC client iD not specified. Authorized routes will not work. To resolve set environment variable OIDC_CLIENT_ID.")
    }
    const clientSecret = process.env.OIDC_CLIENT_SECRET;
    if (!clientSecret) {
        console.error("ERROR: OIDC client secret is not specified. Authorized routes will not work. To resolve set environment variable OIDC_CLIENT_ID.")
    }
    const baseURL = process.env.BASE_URL;
    if (!baseURL) {
        console.error("ERROR: base url is not specified. Authorized routes will not work. To resolve set environment variable BASE_URL")
    }
    const issuerBaseURL = process.env.OIDC_ISSUER_URL;
    if (!baseURL) {
        console.error("ERROR: issuer base url is not specified. To resolve set environment variable OIDC_ISSUER_URL")
    }

    if (!clientId || !clientSecret || !baseURL) {
        console.error("ERROR: Required OIDC environment variables are missing.");
        return;
    }

    app.use(
        auth({
            authorizationParams: {
                response_type: 'code',
                scope: 'openid profile email',
            },
            authRequired: false,
            enableTelemetry: false,
            issuerBaseURL: issuerBaseURL,
            baseURL: baseURL,
            clientID: clientId,
            clientSecret: clientSecret,
            secret: clientSecret,
        })
    );
}

module.exports = setupOIDC;
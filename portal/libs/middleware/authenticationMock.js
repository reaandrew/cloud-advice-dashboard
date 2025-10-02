const config = require("../config-loader");

const user = {
    "exp": Date.now() + (24 * 60 * 60 * 1000),
    "iat": Date.now(),
    "jti": "00000000-0000-0000-0000-000000000000",
    "iss": "https://mock",
    "aud": "mock",
    "sub": "00000000-0000-0000-0000-000000000000",
    "typ": "ID",
    "azp": "mock",
    "sid": "00000000-0000-0000-0000-000000000000",
    "email_verified": true,
    "name": "Example User",
    "groups": config.get('auth.mock.groups', []),
    "preferred_username": "0000000",
    "given_name": "Example",
    "family_name": "User",
    "email": "example@localhost"
}
let signedIn = false;

function auth(req, _, next) {
    req.oidc = {
        isAuthenticated: () => signedIn,
        user: signedIn ? user : undefined
    }
    next();
}

function attemptSilentLogin(req, _, next) {
    if (config.get("auth.mock.silent_login", false) && !req.oidc.isAuthenticated()) {
        req.oidc.user = user;
        signedIn = true;
    }
    next();
}

function requiresAuth(req, _, next) {
    if (!req.oidc.isAuthenticated()) {
        req.oidc.user = user;
        signedIn = true;
    }
    next();
}

module.exports.auth = auth;
module.exports.attemptSilentLogin = () => attemptSilentLogin;
module.exports.requiresAuth = () => requiresAuth;

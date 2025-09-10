const config = require("../config-loader");

function auth(req, _, next) {
    req.oidc = {
        isAuthenticated: () => true,
        user: {
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
    }
    next();
}

module.exports = auth;


function setupNoAuth(app) {
    // No authentication setup needed
}

// No-op requiresAuth function
const requiresAuth = () => (req, res, next) => next();

module.exports = {
    setupAuth: setupNoAuth,
    requiresAuth
};
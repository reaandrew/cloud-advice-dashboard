const express = require('express');
const router = express.Router();

// Route for the homepage
router.get('/', (req, res) => {
    res.render('overview.njk', {
        currentSection: 'overview',
        currentPath: '/'
    });
});

module.exports = router;

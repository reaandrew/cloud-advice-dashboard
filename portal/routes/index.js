const express = require('express');
const router = express.Router();

// Route for the homepage
router.get('/', (req, res) => {
    res.redirect('/policies');
});

module.exports = router;

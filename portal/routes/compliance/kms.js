const express = require('express');
const router = express.Router();

const { keyAges, keyDetails } = require('../../queries/compliance/kms');
const { render } = require('../../libs/views/compliance');

router.get('/', render(keyAges));
router.get('/details', render(keyDetails));

module.exports = router;

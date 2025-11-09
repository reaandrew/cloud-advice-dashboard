const express = require('express');
const router = express.Router();

const {autoscalingDimensions, autoscalingDetails} = require('../../queries/compliance/autoscaling');
const { render } = require('../../libs/views/compliance');

router.get('/', (_, res) => res.redirect('/compliance/autoscaling/dimensions'));
router.get('/dimensions', render(autoscalingDimensions))
router.get('/details', render(autoscalingDetails));

module.exports = router;

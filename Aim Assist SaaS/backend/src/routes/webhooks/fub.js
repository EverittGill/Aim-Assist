const express = require('express');
const router = express.Router();

router.post('/', (req, res) => {
  console.log('fub webhook received:', req.body);
  res.status(200).send('OK');
});

module.exports = router;

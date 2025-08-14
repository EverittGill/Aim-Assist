const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  res.json({ message: 'settings endpoint - to be implemented' });
});

module.exports = router;

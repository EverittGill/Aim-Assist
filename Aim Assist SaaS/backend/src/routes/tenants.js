const express = require('express');
const router = express.Router();

// Placeholder tenant routes
router.get('/', (req, res) => {
  res.json({ message: 'List tenants - to be implemented' });
});

router.post('/', (req, res) => {
  res.json({ message: 'Create tenant - to be implemented' });
});

router.get('/:id', (req, res) => {
  res.json({ message: 'Get tenant - to be implemented' });
});

router.put('/:id', (req, res) => {
  res.json({ message: 'Update tenant - to be implemented' });
});

module.exports = router;
// API version 1 — every route lives under /api/v1
const express = require('express');
const router = express.Router();

router.get('/health', (req, res) => res.json({ status: 'ok', version: 'v1', time: new Date().toISOString() }));

router.use('/auth', require('./auth'));
router.use('/patients', require('./patients'));
router.use('/games', require('./games'));
router.use('/memories', require('./memories'));
router.use('/family', require('./family'));
router.use('/reminders', require('./reminders'));
router.use('/alerts', require('./alerts'));
router.use('/reports', require('./reports'));
router.use('/chat', require('./chat'));
router.use('/journal', require('./journal'));
router.use('/ai', require('./ai'));
router.use('/admin', require('./admin'));
router.use('/i18n', require('./i18n'));

module.exports = router;

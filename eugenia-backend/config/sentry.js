// This file now just exports Sentry since initialization happens in instrument.js
const Sentry = require('@sentry/node');

module.exports = { Sentry };
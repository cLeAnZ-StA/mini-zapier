// models/Rule.js
const mongoose = require('mongoose');

const ruleSchema = new mongoose.Schema({
    trigger_source: String,   // e.g., "webhook", "timer"
    action_target: String,    // e.g., "discord", "telegram"
    action_payload: String,   // e.g., "Hello world!"
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Rule', ruleSchema);
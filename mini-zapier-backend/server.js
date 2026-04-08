require('dotenv').config();
const path = require('path');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const cron = require('node-cron');

const app = express();
app.use(express.json());
app.use(cors());

// Serve the frontend UI
const frontendPath = path.join(__dirname, '../mini-zapier-frontend');
app.use(express.static(frontendPath));

app.get('/', (req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
});

// 1. DATABASE CONNECTION
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("✅ MongoDB Connected Successfully"))
    .catch(err => console.error("❌ MongoDB Connection Error:", err));

// 2. DATA SCHEMAS (Added target_id)
const ruleSchema = new mongoose.Schema({
    trigger_source: String,
    action_target: String,
    action_payload: String,
    target_id: String, // <--- New field for dynamic routing
    cron_schedule: { type: String, default: '* * * * *' },
    created_at: { type: Date, default: Date.now }
});
const Rule = mongoose.model('Rule', ruleSchema);

const logSchema = new mongoose.Schema({
    target: String,
    payload: String,
    destination: String,
    timestamp: { type: Date, default: Date.now }
});
const Log = mongoose.model('Log', logSchema);

// --- SECURITY BOUNCER ---
const authenticateRequest = (req, res, next) => {
    const providedKey = req.headers['x-api-key'];
    if (!providedKey || providedKey !== process.env.SYSTEM_API_KEY) {
        console.log(`🚨 SECURITY ALERT: Unauthorized attempt from IP: ${req.ip}`);
        return res.status(401).json({ error: "Unauthorized" });
    }
    next(); 
};

// --- HELPER FUNCTIONS FOR SENDING ---

const sendDiscord = async (message, channelId) => {
    const token = process.env.DISCORD_TOKEN;
    if (!token || !channelId) return console.error("❌ Discord Token or Channel ID missing");

    await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
        method: 'POST',
        headers: {
            'Authorization': `Bot ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content: `📡 **Zapier Alert:** ${message}` })
    });
};

const sendTelegram = async (message, chatId) => {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token || !chatId) return console.error("❌ Telegram Token or Chat ID missing");

    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: `📱 SignalLink Alert:\n${message}` })
    });
};

// 3. THE "EXECUTIONER" ROUTE (Webhook Trigger)
app.post('/api/webhook/catch', authenticateRequest, async (req, res) => {    
    console.log("\n--- 🔥 LIVE WEBHOOK TRIGGERED ---");
    try {   
        const activeRules = await Rule.find({ trigger_source: "Webhook" }); 

        for (const rule of activeRules) {
            if (rule.action_target === "Discord") {
                await sendDiscord(rule.action_payload, rule.target_id);
            }
            if (rule.action_target === "Telegram") {
                await sendTelegram(rule.action_payload, rule.target_id);
            }
            await new Log({ target: rule.action_target, payload: rule.action_payload, destination: rule.target_id }).save();
        }
        res.status(200).json({ status: "Executed", count: activeRules.length });
    } catch (error) {
        res.status(500).json({ error: "Trigger failed" });
    }
});

// 4. MANAGEMENT ROUTES
app.post('/save-rule', authenticateRequest, async (req, res) => {
    try {
        const newRule = new Rule(req.body);
        await newRule.save();
        res.status(201).json({ message: "Rule saved!" });
    } catch (err) { res.status(500).json({ error: "Save failed" }); }
});

app.get('/get-rules', authenticateRequest, async (req, res) => {
    const rules = await Rule.find().sort({ created_at: -1 });
    res.json(rules);
});

app.delete('/delete-rule/:id', authenticateRequest, async (req, res) => {
    await Rule.findByIdAndDelete(req.params.id);
    res.status(200).json({ message: "Deleted" });
});

app.get('/get-logs', authenticateRequest, async (req, res) => {
    const logs = await Log.find().sort({ timestamp: -1 }).limit(10);
    res.json(logs);
});

// 5. AUTOMATION TICKER (Dynamic Scheduler)
cron.schedule('* * * * *', async () => {
    const now = new Date();
    const currentMin = now.getMinutes();
    const currentHr = now.getHours();

    try {
        const scheduledRules = await Rule.find({ trigger_source: "Schedule" });

        for (const rule of scheduledRules) {
            const parts = (rule.cron_schedule || "* * * * *").split(' ');
            const ruleMin = parts[0], ruleHr = parts[1];

            let shouldRun = false;
            if (ruleMin === '*' && ruleHr === '*') shouldRun = true; 
            else if (ruleMin == currentMin && ruleHr === '*') shouldRun = true; 
            else if (ruleMin == currentMin && ruleHr == currentHr) shouldRun = true; 

            if (shouldRun) {
                console.log(`⏳ Running Schedule: ${rule.action_payload}`);
                if (rule.action_target === "Discord") await sendDiscord(rule.action_payload, rule.target_id);
                if (rule.action_target === "Telegram") await sendTelegram(rule.action_payload, rule.target_id);
                await new Log({ target: rule.action_target, payload: rule.action_payload, destination: rule.target_id }).save();
            }
        }
    } catch (err) { console.error("❌ Ticker Error:", err); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
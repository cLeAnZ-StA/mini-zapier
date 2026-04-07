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

// 2. DATA SCHEMAS
const ruleSchema = new mongoose.Schema({
    trigger_source: String,
    action_target: String,
    action_payload: String,
    cron_schedule: { type: String, default: '* * * * *' },
    created_at: { type: Date, default: Date.now }
});
const Rule = mongoose.model('Rule', ruleSchema);

const logSchema = new mongoose.Schema({
    target: String,
    payload: String,
    timestamp: { type: Date, default: Date.now }
});
const Log = mongoose.model('Log', logSchema);

// --- SECURITY: THE DIGITAL BOUNCER ---
const authenticateRequest = (req, res, next) => {
    // Look for x-api-key in the headers
    const providedKey = req.headers['x-api-key'];

    if (!providedKey || providedKey !== process.env.SYSTEM_API_KEY) {
        // Added req.ip so you can see the IP address of the hacker trying to guess your key
        console.log(`🚨 SECURITY ALERT: Blocked unauthorized request from IP: ${req.ip}`);
        return res.status(401).json({ error: "Unauthorized: Invalid or Missing API Key" });
    }
    next(); 
};

// 3. THE "EXECUTIONER" ROUTE
app.post('/api/webhook/catch', authenticateRequest, async (req, res) => {    
    console.log("\n--- 🔥 LIVE TRIGGER DETECTED ---");
    
    try {   
        const incomingData = req.body; 
        const activeRules = await Rule.find({ trigger_source: "Webhook" }); 

        if (activeRules.length === 0) {
            console.log("ℹ️  No rules found for this trigger.");
        } else {
            console.log(`🚀 Found ${activeRules.length} rule(s). Executing...`);

            for (const rule of activeRules) {
                
                // --- DISCORD ---
                if (rule.action_target === "Discord") {
                    console.log(`📡 Sending to Discord: "${rule.action_payload}"`);
                    await fetch(process.env.DISCORD_WEBHOOK, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            username: "SignalLink Bot",
                            content: `⚡ **Alert!**\n> **Configured Msg:** ${rule.action_payload}\n> **Live Data:** ${JSON.stringify(incomingData)}`
                        })
                    });
                    console.log("✅ Discord message sent!");
                    await new Log({ target: "Discord", payload: rule.action_payload }).save(); 
                }

                // --- TELEGRAM ---
                if (rule.action_target === "Telegram") {
                    console.log(`📱 Sending to Telegram: "${rule.action_payload}"`);
                    const teleUrl = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`;
                    
                    await fetch(teleUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            chat_id: process.env.TELEGRAM_CHAT_ID,
                            text: `⚡ SignalLink Alert:\n${rule.action_payload}`
                        })
                    });
                    console.log("✅ Telegram message sent!");
                    await new Log({ target: "Telegram", payload: rule.action_payload }).save();
                }
            }
        }
        res.status(200).json({ message: "Success", executed: activeRules.length });

    } catch (error) {
        console.error("🔴 Execution Error:", error);
        res.status(500).json({ error: "Failed to process trigger" });
    }
});

// 4. MANAGEMENT ROUTES (Now Secured!)
app.post('/save-rule', authenticateRequest, async (req, res) => {
    try {
        const newRule = new Rule(req.body);
        await newRule.save();
        res.status(201).json({ message: "Rule saved!" });
    } catch (err) { res.status(500).json({ error: "Failed to save rule" }); }
});

app.get('/get-rules', authenticateRequest, async (req, res) => {
    try {
        const rules = await Rule.find().sort({ created_at: -1 });
        res.json(rules);
    } catch (err) { res.status(500).json({ error: "Failed to fetch rules" }); }
});

app.delete('/delete-rule/:id', authenticateRequest, async (req, res) => {
    try {
        await Rule.findByIdAndDelete(req.params.id);
        res.status(200).json({ message: "Rule deleted" });
    } catch (err) { res.status(500).json({ error: "Delete failed" }); }
});

app.get('/get-logs', authenticateRequest, async (req, res) => {
    try {
        const logs = await Log.find().sort({ timestamp: -1 }).limit(10);
        res.json(logs);
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch logs" });
    }
});

// 5. AUTOMATION TICKER (Dynamic Scheduler)
cron.schedule('* * * * *', async () => {
    const now = new Date();
    const currentMin = now.getMinutes();
    const currentHr = now.getHours();
    
    if (currentMin === 0) console.log(`⏰ Hourly Ticker Check: ${now.toLocaleTimeString()}`);

    try {
        const scheduledRules = await Rule.find({ trigger_source: "Schedule" });

        for (const rule of scheduledRules) {
            const cronStr = rule.cron_schedule || "* * * * *"; 
            const parts = cronStr.split(' ');
            const ruleMin = parts[0];
            const ruleHr = parts[1];

            let shouldRun = false;
            if (ruleMin === '*' && ruleHr === '*') shouldRun = true; 
            else if (ruleMin == currentMin && ruleHr === '*') shouldRun = true; 
            else if (ruleMin == currentMin && ruleHr == currentHr) shouldRun = true; 

            if (shouldRun) {
                console.log(`⏳ Executing Scheduled Task: ${rule.action_payload}`);

                if (rule.action_target === "Discord") {
                    await fetch(process.env.DISCORD_WEBHOOK, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            username: "SignalLink Bot",
                            content: `⏰ **Scheduled Alert:** ${rule.action_payload}`
                        })
                    });
                    await new Log({ target: "Discord", payload: rule.action_payload }).save();
                }

                if (rule.action_target === "Telegram") {
                    const teleUrl = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`;
                    await fetch(teleUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            chat_id: process.env.TELEGRAM_CHAT_ID,
                            text: `⏰ Scheduled Alert:\n${rule.action_payload}`
                        })
                    });
                    await new Log({ target: "Telegram", payload: rule.action_payload }).save();
                }
            }
        }
    } catch (err) {
        console.error("❌ Ticker Error:", err);
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 SignalLink Server running on port ${PORT}`);
});
require('dotenv').config();
const path = require('path');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const cron = require('node-cron');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
app.use(express.json());
app.use(cors());

// Serve the frontend UI
const frontendPath = path.join(__dirname, '../mini-zapier-frontend');
app.use(express.static(frontendPath));

app.get('/', (req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
});

// --- 1. DATABASE CONNECTION ---
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("✅ MongoDB Connected Successfully"))
    .catch(err => console.error("❌ MongoDB Connection Error:", err));

// --- 2. DATA SCHEMAS ---
const userSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    created_at: { type: Date, default: Date.now }
});
const User = mongoose.model('User', userSchema);

const ruleSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, 
    trigger_source: String,
    action_target: String,
    action_payload: String,
    target_id: String, 
    cron_schedule: { type: String, default: '* * * * *' },
    created_at: { type: Date, default: Date.now }
});
const Rule = mongoose.model('Rule', ruleSchema);

// --- 3. SECURITY BOUNCERS ---

// Bouncer for the User Dashboard (Uses JWT)
const authenticateUser = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; 

    if (!token) return res.status(401).json({ error: "Access Denied: Please log in" });

    try {
        const verified = jwt.verify(token, process.env.JWT_SECRET);
        req.user = verified; // Attach the user's ID to the request
        next(); 
    } catch (err) {
        res.status(403).json({ error: "Invalid or Expired Token" });
    }
};

// Bouncer for external hardware/webhooks (Uses Static API Key)
const authenticateWebhook = (req, res, next) => {
    const providedKey = req.headers['x-api-key'];
    if (!providedKey || providedKey !== process.env.SYSTEM_API_KEY) {
        return res.status(401).json({ error: "Unauthorized Webhook Source" });
    }
    next(); 
};

// --- 4. ACTION API HELPERS ---
const sendDiscord = async (message, channelId) => {
    const token = process.env.DISCORD_TOKEN;
    if (!token || !channelId) return console.error("❌ Discord Credentials Missing");

    try {
        const response = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
            method: 'POST',
            headers: {
                'Authorization': `Bot ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ content: `📡 **Platform Alert:** ${message}` })
        });
        const result = await response.json();
        if (response.ok) console.log(`✅ Discord: Sent to ${channelId}`);
        else console.error(`❌ Discord Error: ${result.message}`);
    } catch (err) { console.error("❌ Discord Network Error:", err); }
};

const sendTelegram = async (message, chatId) => {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token || !chatId) return console.error("❌ Telegram Credentials Missing");

    try {
        const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text: `📱 SignalLink Alert:\n${message}` })
        });
        const result = await response.json();
        if (result.ok) console.log(`✅ Telegram: Sent to ${chatId}`);
        else console.error(`❌ Telegram Error: ${result.description}`);
    } catch (err) { console.error("❌ Telegram Network Error:", err); }
};

// --- 5. AUTHENTICATION ROUTES (Login & Register) ---
app.post('/api/auth/register', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (await User.findOne({ email })) return res.status(400).json({ error: "Email already in use" });
        
        const hashedPassword = await bcrypt.hash(password, 10);
        await new User({ email, password: hashedPassword }).save();
        res.status(201).json({ message: "Account created successfully!" });
    } catch (err) { res.status(500).json({ error: "Registration failed" }); }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        
        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(400).json({ error: "Invalid email or password" });
        }

        const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
        res.json({ token, message: "Logged in successfully" });
    } catch (err) { res.status(500).json({ error: "Login failed" }); }
});

// --- 6. USER DASHBOARD ROUTES (JWT Protected) ---
app.post('/save-rule', authenticateUser, async (req, res) => {
    try {
        await new Rule({ ...req.body, userId: req.user.userId }).save();
        res.status(201).json({ message: "Rule saved!" });
    } catch (err) { res.status(500).json({ error: "Failed to save rule" }); }
});

app.get('/get-rules', authenticateUser, async (req, res) => {
    try {
        const rules = await Rule.find({ userId: req.user.userId }).sort({ created_at: -1 });
        res.json(rules);
    } catch (err) { res.status(500).json({ error: "Failed to fetch rules" }); }
});

app.delete('/delete-rule/:id', authenticateUser, async (req, res) => {
    try {
        // Only delete if the rule belongs to the logged-in user
        await Rule.findOneAndDelete({ _id: req.params.id, userId: req.user.userId });
        res.status(200).json({ message: "Rule deleted" });
    } catch (err) { res.status(500).json({ error: "Delete failed" }); }
});

// --- 7. EXTERNAL WEBHOOK CATCHER (API Key Protected) ---
app.post('/api/webhook/catch', authenticateWebhook, async (req, res) => {    
    try {   
        const activeRules = await Rule.find({ trigger_source: "Webhook" }); 
        for (const rule of activeRules) {
            if (rule.action_target === "Discord") await sendDiscord(rule.action_payload, rule.target_id);
            if (rule.action_target === "Telegram") await sendTelegram(rule.action_payload, rule.target_id);
        }
        res.status(200).json({ status: "Processed Webhooks" });
    } catch (error) { res.status(500).json({ error: "Webhook execution failed" }); }
});

// --- 8. AUTOMATION TICKER (Global Scheduler) ---
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
                if (rule.action_target === "Discord") await sendDiscord(rule.action_payload, rule.target_id);
                if (rule.action_target === "Telegram") await sendTelegram(rule.action_payload, rule.target_id);
            }
        }
    } catch (err) { console.error("❌ Ticker Error:", err); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 SaaS Platform running on port ${PORT}`);
});
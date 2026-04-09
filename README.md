# Mini-Zapier (SignalLink Engine)

A lightweight, full-stack SaaS platform that allows users to create custom automation workflows. It acts as a bridge between web applications, physical IoT hardware (like ESP32/Arduino), and messaging platforms (Discord/Telegram).

![Live Demo](https://img.shields.io/badge/Live_Status-Online-success)
![Node.js](https://img.shields.io/badge/Node.js-Backend-green)
![MongoDB](https://img.shields.io/badge/MongoDB-Database-leaf)
![ESP32](https://img.shields.io/badge/ESP32-Hardware_Ready-blue)

## Features
* **Secure User Accounts:** Full JWT-based authentication system with encrypted passwords using `bcryptjs`.
* **Hardware Ready (ESP32/IoT):** Built-in middleware to accept secure webhook payloads from ESP32/Arduino modules, bypassing standard SSL limitations for microcontrollers.
* **Cron-based Task Scheduling:** Built-in time engine to run automated scripts at specific intervals (e.g., Every minute, hourly, or specific daily times).
* **Multi-Channel Integrations:** Seamlessly route data payloads to specific Discord Channels or Telegram Chats via dynamic IDs.
* **1-Click Bot Installations:** Integrated UI buttons allowing users to instantly add the necessary routing bots to their own Discord servers or Telegram accounts.

## Tech Stack
* **Frontend:** HTML5, CSS3 (Inter Font, Glassmorphism UI), Vanilla JavaScript
* **Backend:** Node.js, Express.js
* **Database:** MongoDB Atlas (Mongoose ODM)
* **Authentication:** JSON Web Tokens (JWT)
* **DevOps:** Hosted on Render, Cloudflare Routing, Automated anti-sleep pinging

## 📡 Hardware Integration (ESP32 Example)
This platform is explicitly designed to accept telemetry from physical microcontrollers. Users can pass their `SYSTEM_API_KEY` via headers to securely trigger actions from an ESP32 without dealing with complex SSL certificates:

```cpp
HTTPClient http;
http.begin(client, "[https://mini-zapier-o98o.onrender.com](https://mini-zapier-o98o.onrender.com/api/webhook/catch)");

http.addHeader("Content-Type", "application/json");

// replace these placeholders if using
http.addHeader("x-api-key", "your_secret_key"); 

int responseCode = http.POST("{\"device\":\"esp32\", \"status\":\"motion_detected\"}");
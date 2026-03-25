# 📈 Floorsim: Offline Floor Trading Simulator

Floorsim is a high-performance, offline-first web application designed to run live floor trading simulations, mock stock markets, and financial events on a Local Area Network (LAN). 

Built specifically for fast-paced college fests and trading events, it allows multiple "Accountants" to process trades simultaneously while a live "Leaderboard" updates in real-time on a projector. It requires **zero internet connection** to run once installed.

## ✨ Key Features

* **🔌 100% Offline Ready:** Built with pure vanilla CSS and native system fonts/emojis. No external CDNs (Tailwind, Google Fonts, etc.) are required during the live event.
* **💻 LAN Multi-User:** Run the server on one master laptop and connect multiple accountant laptops via a local Wi-Fi router. SQLite handles concurrent database locks automatically.
* **👑 Admin God-Mode:** A dedicated dashboard to monitor the audit log, manually override team ledgers, and add new teams mid-game.
* **📊 Bulk Buy-In Mode:** A specialized UI for the initial IPO/Allocation round, allowing accountants to assign multiple stocks to a team in one click.
* **🏆 Live Projector Leaderboard:** A cinematic, auto-refreshing podium view that calculates real-time Net Worth based on cash and asset holdings.
* **📂 CSV Data Portability:** Instantly export the database to CSV for round backups, or import a modified CSV to update all team balances at once.

## 🛠️ Tech Stack

* **Backend:** Node.js, Express.js
* **Database:** SQLite3 (Local file-based database)
* **Frontend:** HTML5, Vanilla JavaScript, Custom Vanilla CSS (Zero dependencies)

## 🚀 Quick Start & Installation

### Prerequisites
You must have [Node.js](https://nodejs.org/) installed on your "Master" laptop.

### 1. Clone the Repository

```bash
git clone https://github.com/ansh94082/floor_sim
cd floor_sim
npm install
```

### 2. Configure the Market
Edit the config.json file to set your teams, starting cash, and initial stock prices.
Note: If you change the config after the database is created, delete the trading.db file so it can rebuild with the new data.

### 3. Run the server

```bash
node server.js
```

## Access Roles:
### The Projector (Live Rankings): http://localhost:3000/leaderboard.html

### The Admin (God-Mode): http://localhost:3000/admin.html

### The Accountants (Trade Entry): http://[MASTER_IP_ADDRESS]:3000/accountant.html

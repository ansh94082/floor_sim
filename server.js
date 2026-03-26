const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

const app = express();
const db = new sqlite3.Database('./trading.db');

// Load Configuration
const config = JSON.parse(fs.readFileSync('./config.json', 'utf8'));
const STOCKS = config.STOCKS; 
const TICKERS = STOCKS.map(s => s.ticker); // Just the names for DB columns
const INITIAL_CASH = config.INITIAL_CASH;
const TEAM_NAMES = config.TEAM_NAMES;

app.use(bodyParser.json());
app.use(express.static('public'));

// Transaction Log File
const LOG_FILE = path.join(__dirname, 'transactions.log');
if (!fs.existsSync(LOG_FILE)) {
    fs.writeFileSync(LOG_FILE, `[${new Date().toISOString()}] [SERVER_START] Transaction log initialized\n`);
}

function logTransaction(type, details) {
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] [${type}] ${details}\n`;
    fs.appendFileSync(LOG_FILE, line);
}

db.serialize(() => {
    // FIXED: Added double quotes around ticker names to handle special characters like '&'
    const stockColumns = TICKERS.map(t => `"${t}" INTEGER DEFAULT 0`).join(', ');
    
    db.run(`CREATE TABLE IF NOT EXISTS teams (
        id INTEGER PRIMARY KEY AUTOINCREMENT, 
        name TEXT, 
        cash REAL, 
        ${stockColumns}
    )`);
    
    db.get("SELECT count(*) as count FROM teams", (err, row) => {
        if (row && row.count === 0) {
            const stmt = db.prepare(`INSERT INTO teams (name, cash) VALUES (?, ?)`);
            TEAM_NAMES.forEach(name => stmt.run(name, INITIAL_CASH));
            stmt.finalize();
            console.log("Database seeded.");
        }
    });

    db.run(`CREATE TABLE IF NOT EXISTS trades (
        id INTEGER PRIMARY KEY AUTOINCREMENT, 
        buyer_id TEXT, seller_id TEXT, stock TEXT, qty INTEGER, price REAL, ts DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
});

app.get('/api/data', (req, res) => {
    db.all("SELECT * FROM teams", [], (err, teams) => {
        db.all("SELECT * FROM trades ORDER BY ts DESC LIMIT 10", [], (err2, trades) => {
            res.json({ teams, stocks: STOCKS, trades });
        });
    });
});

app.get('/api/admin/export-csv', (req, res) => {
    db.all("SELECT * FROM teams", [], (err, rows) => {
        if (err || rows.length === 0) return res.status(500).send("Error exporting data");

        const headers = Object.keys(rows[0]);
        const csvContent = [
            headers.join(','), // Header row
            ...rows.map(row => headers.map(header => JSON.stringify(row[header])).join(',')) // Data rows
        ].join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=trading_snapshot.csv');
        res.status(200).send(csvContent);
    });
});


app.post('/api/admin/import-csv', express.text({ limit: '10mb' }), (req, res) => {
    const rows = req.body.split('\n').filter(row => row.trim() !== '');
    if (rows.length < 2) return res.status(400).send("Invalid CSV");

    const headers = rows[0].split(',').map(h => h.trim());
    const dataRows = rows.slice(1);

    db.serialize(() => {
        db.run("BEGIN TRANSACTION");
        try {
            dataRows.forEach(row => {
                // This regex handles commas inside quotes
                const values = row.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g)
                                   .map(v => v.replace(/^"|"$/g, ''));

                const teamId = values[headers.indexOf('id')];
                headers.forEach((header, index) => {
                    if (header !== 'id' && header !== 'name') {
                        // FIXED: Added double quotes around header
                        db.run(`UPDATE teams SET "${header}" = ? WHERE id = ?`, [values[index], teamId]);
                    }
                });
            });
            db.run("COMMIT", (err) => {
                if (err) throw err;
                logTransaction('CSV_IMPORT', `Imported ${dataRows.length} team(s) from CSV`);
                res.send("Database updated successfully");
            });
        } catch (error) {
            db.run("ROLLBACK");
            res.status(500).send("Import failed: " + error.message);
        }
    });
});


app.get('/api/leaderboard', (req, res) => {
    db.all("SELECT * FROM teams", [], (err, teams) => {
        if (err) return res.status(500).send(err);

        // Map through teams and calculate Net Worth based on config.json FINAL prices
        const leaderboard = teams.map(team => {
            let stockValue = 0;
            STOCKS.forEach(s => {
                // CHANGE: Use s.final instead of s.price
                const quantity = team[s.ticker] || 0;
                stockValue += quantity * s.final; 
            });

            return {
                name: team.name,
                cash: team.cash,
                stockValue: stockValue,
                netWorth: team.cash + stockValue
            };
        });

        // Sort by Net Worth Descending
        leaderboard.sort((a, b) => b.netWorth - a.netWorth);
        res.json(leaderboard);
    });
});

app.post('/api/admin/add-team', (req, res) => {
    const { name } = req.body;
    db.run(`INSERT INTO teams (name, cash) VALUES (?, ?)`, [name, 1000000], function(err) {
        if (err) return res.status(500).send(err.message);
        logTransaction('ADD_TEAM', `Team="${name}" added with ID=${this.lastID} | Cash=₹1000000`);
        res.send(`Team ${name} added with ID ${this.lastID}`);
    });
});


app.post('/api/trade', (req, res) => {
    const { buyerId, sellerId, stock, qty, price } = req.body;
    const totalCost = qty * price;

    db.get("SELECT * FROM teams WHERE id = ?", [buyerId], (err, buyer) => {
        if (!buyer) return res.status(404).send("Buyer not found");
        if (buyer.cash < totalCost) return res.status(400).send("Insufficient Cash!");

        if (sellerId !== 'BANK') {
            db.get("SELECT * FROM teams WHERE id = ?", [sellerId], (err, seller) => {
                if (!seller || seller[stock] < qty) return res.status(400).send("Seller lacks stock!");
                processTrade(buyerId, sellerId, stock, qty, totalCost, res);
            });
        } else {
            processTrade(buyerId, 'BANK', stock, qty, totalCost, res);
        }
    });
});

function processTrade(buyerId, sellerId, stock, qty, totalCost, res) {
    db.serialize(() => {
        // FIXED: Added double quotes around stock
        db.run(`UPDATE teams SET cash = cash - ?, "${stock}" = "${stock}" + ? WHERE id = ?`, [totalCost, qty, buyerId]);
        if (sellerId !== 'BANK') {
            // FIXED: Added double quotes around stock
            db.run(`UPDATE teams SET cash = cash + ?, "${stock}" = "${stock}" - ? WHERE id = ?`, [totalCost, qty, sellerId]);
        }
        db.run(`INSERT INTO trades (buyer_id, seller_id, stock, qty, price) VALUES (?, ?, ?, ?, ?)`,
            [buyerId, sellerId, stock, qty, totalCost / qty]);

        logTransaction('TRADE', `Buyer=${buyerId} | Seller=${sellerId} | Stock=${stock} | Qty=${qty} | Price=${totalCost / qty} | Total=₹${totalCost}`);
        res.send("Trade processed successfully!");
    });
}

app.post('/api/admin/update', (req, res) => {
    const { teamId, column, value } = req.body;
    // FIXED: Added double quotes around column
    db.run(`UPDATE teams SET "${column}" = ? WHERE id = ?`, [value, teamId], (err) => {
        if (!err) logTransaction('ADMIN_UPDATE', `Team=${teamId} | ${column} set to ${value}`);
        res.send(err ? "Update Failed" : "Update Successful");
    });
});

app.get('/api/admin/logs', (req, res) => {
    if (!fs.existsSync(LOG_FILE)) return res.status(200).send('No transactions logged yet.');
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', 'attachment; filename=transactions.log');
    res.sendFile(LOG_FILE);
});

app.listen(3000, () => console.log('Server Live on http://localhost:3000'));

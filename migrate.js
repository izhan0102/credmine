const sqlite3 = require('sqlite3').verbose();
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config();

// Import MongoDB User model
const User = require('./models/User');

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/credmine')
    .then(() => console.log('MongoDB Connected...'))
    .catch(err => {
        console.error('MongoDB Connection Error:', err);
        process.exit(1);
    });

// Connect to SQLite database
const db = new sqlite3.Database(path.join(__dirname, 'credmine.db'), sqlite3.OPEN_READONLY, (err) => {
    if (err) {
        console.error('Error connecting to SQLite:', err);
        process.exit(1);
    }
    console.log('Connected to SQLite database');
});

// Migration function
async function migrateData() {
    try {
        // Get all users from SQLite
        const users = await new Promise((resolve, reject) => {
            db.all('SELECT * FROM users', [], (err, rows) => {
                if (err) reject(err);
                resolve(rows);
            });
        });

        console.log(`Found ${users.length} users to migrate`);

        // Migrate each user
        for (const user of users) {
            try {
                await User.create({
                    email: user.email,
                    username: user.username,
                    password: user.password, // Password is already hashed
                    pin: user.pin,
                    walletAddress: user.wallet_address,
                    balance: 500, // Default balance
                    createdAt: user.created_at ? new Date(user.created_at) : new Date()
                });
                console.log(`Migrated user: ${user.username}`);
            } catch (err) {
                console.error(`Error migrating user ${user.username}:`, err);
            }
        }

        console.log('Migration completed successfully');
    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        // Close both database connections
        db.close();
        await mongoose.connection.close();
        process.exit(0);
    }
}

// Run migration
migrateData(); 
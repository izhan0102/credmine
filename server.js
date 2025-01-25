const express = require('express');
const path = require('path');
const session = require('express-session');
const { rtdb } = require('./config/firebase');
const { ref, get, set, query, orderByChild, equalTo, push, update } = require('firebase/database');
const { checkUsername, createUser, verifyUser, generateWalletAddress, getWalletAddress } = require('./database');
const { auth } = require('./config/firebase');
const bcrypt = require('bcrypt');
require('dotenv').config();

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Session middleware
app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        maxAge: 24 * 60 * 60 * 1000 // 1 day
    }
}));

// Authentication middleware
function requireAuth(req, res, next) {
    if (req.session.userId) {
        next();
    } else {
        res.redirect('/login');
    }
}

// Routes
app.get('/', (req, res) => {
    res.render('home', {
        isLoggedIn: !!req.session.userId
    });
});

app.get('/about', (req, res) => {
    res.render('about');
});

app.get('/privacy', (req, res) => {
    res.render('privacy');
});

app.get('/developer', (req, res) => {
    res.render('developer');
});

app.get('/login', (req, res) => {
    if (req.session.userId) {
        res.redirect('/dashboard');
    } else {
        res.render('login');
    }
});

app.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        // Query user by email
        const usersRef = ref(rtdb, 'users');
        const emailQuery = query(usersRef, orderByChild('email'), equalTo(email));
        const snapshot = await get(emailQuery);
        
        if (!snapshot.exists()) {
            return res.json({ success: false, message: 'Invalid credentials' });
        }

        // Get user data
        const userData = Object.values(snapshot.val())[0];
        const userId = Object.keys(snapshot.val())[0];

        // Verify password
        const isValidPassword = await bcrypt.compare(password, userData.password);
        
        if (!isValidPassword) {
            return res.json({ success: false, message: 'Invalid credentials' });
        }

        // Set session
        req.session.userId = userId;
        req.session.username = userData.username;
        
        res.json({ success: true });
    } catch (err) {
        console.error('Login error:', err);
        res.json({ success: false, message: 'Error during login' });
    }
});

app.get('/signup', (req, res) => {
    if (req.session.userId) {
        res.redirect('/dashboard');
    } else {
        res.render('signup');
    }
});

app.post('/check-username', async (req, res) => {
    try {
        // Log the username being checked
        console.log('Checking username availability:', req.body.username);
        
        const exists = await checkUsername(req.body.username);
        console.log('Username exists:', exists);
        
        res.json({ available: !exists });
    } catch (err) {
        console.error('Error checking username:', err);
        res.json({ available: false, error: err.message });
    }
});

app.post('/signup', async (req, res) => {
    try {
        const { email, username, password } = req.body;
        
        // Check if username already exists
        const usernameExists = await checkUsername(username);
        if (usernameExists) {
            console.log('Username taken during signup:', username);
            return res.json({ success: false, message: 'Username already taken' });
        }

        const userId = await createUser(email, username, password);
        req.session.userId = userId;
        req.session.username = username;
        res.json({ success: true });
    } catch (err) {
        console.error('Error during signup:', err);
        res.json({ success: false, message: err.message || 'Error creating account' });
    }
});

app.get('/dashboard', requireAuth, async (req, res) => {
    try {
        const userRef = ref(rtdb, `users/${req.session.userId}`);
        const snapshot = await get(userRef);
        const userData = snapshot.val();
        const walletAddress = userData.walletAddress;
        const balance = userData.balance || 0;

        res.render('dashboard', {
            username: req.session.username,
            userId: req.session.userId,
            balance: balance,
            walletAddress: walletAddress
        });
    } catch (err) {
        console.error('Error loading dashboard:', err);
        res.redirect('/error');
    }
});

app.post('/generate-address', requireAuth, async (req, res) => {
    try {
        const address = await generateWalletAddress(req.session.userId);
        res.json({ success: true, address });
    } catch (err) {
        res.json({ success: false, message: 'Error generating address' });
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/');
    });
});

// Forgot password route
app.get('/forgot-password', (req, res) => {
    res.render('forgot-password');
});

app.post('/reset-password', async (req, res) => {
    try {
        const { email } = req.body;
        
        // Check if user exists
        const usersRef = ref(rtdb, 'users');
        const emailQuery = query(usersRef, orderByChild('email'), equalTo(email));
        const snapshot = await get(emailQuery);
        
        if (!snapshot.exists()) {
            return res.json({ success: false, message: 'No account found with this email.' });
        }

        // Generate reset token
        const resetToken = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        const userId = Object.keys(snapshot.val())[0];
        
        // Save reset token and expiry
        const userRef = ref(rtdb, `users/${userId}`);
        await set(userRef, {
            resetToken,
            resetTokenExpiry: Date.now() + 3600000 // 1 hour from now
        }, { merge: true });

        // In a real application, you would send an email here
        // For now, we'll just return success
        res.json({ 
            success: true, 
            message: 'If an account exists with this email, you will receive password reset instructions.'
        });
    } catch (err) {
        console.error('Error in reset password:', err);
        res.json({ success: false, message: 'Error processing request' });
    }
});

app.get('/reset-password/:token', async (req, res) => {
    try {
        const { token } = req.params;
        
        // Find user with this reset token
        const usersRef = ref(rtdb, 'users');
        const snapshot = await get(usersRef);
        let validUser = null;
        
        snapshot.forEach((userSnapshot) => {
            const userData = userSnapshot.val();
            if (userData.resetToken === token && userData.resetTokenExpiry > Date.now()) {
                validUser = { id: userSnapshot.key, ...userData };
            }
        });

        if (!validUser) {
            return res.render('error', { message: 'Invalid or expired reset link' });
        }

        res.render('reset-password', { token });
    } catch (err) {
        console.error('Error checking reset token:', err);
        res.render('error', { message: 'Error processing reset link' });
    }
});

app.post('/reset-password/:token', async (req, res) => {
    try {
        const { token } = req.params;
        const { password } = req.body;
        
        // Find user with this reset token
        const usersRef = ref(rtdb, 'users');
        const snapshot = await get(usersRef);
        let validUser = null;
        
        snapshot.forEach((userSnapshot) => {
            const userData = userSnapshot.val();
            if (userData.resetToken === token && userData.resetTokenExpiry > Date.now()) {
                validUser = { id: userSnapshot.key, ...userData };
            }
        });

        if (!validUser) {
            return res.json({ success: false, message: 'Invalid or expired reset link' });
        }

        // Hash the new password
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Update user's password and remove reset token
        const userRef = ref(rtdb, `users/${validUser.id}`);
        await set(userRef, {
            password: hashedPassword,
            resetToken: null,
            resetTokenExpiry: null
        }, { merge: true });

        res.json({ success: true });
    } catch (err) {
        console.error('Error resetting password:', err);
        res.json({ success: false, message: 'Error resetting password' });
    }
});

app.post('/get-user-by-address', requireAuth, async (req, res) => {
    try {
        const { address } = req.body;
        
        // Query user by wallet address
        const usersRef = ref(rtdb, 'users');
        const addressQuery = query(usersRef, orderByChild('walletAddress'), equalTo(address));
        const snapshot = await get(addressQuery);
        
        if (!snapshot.exists()) {
            return res.json({ success: false, message: 'User not found' });
        }

        const userData = Object.values(snapshot.val())[0];
        res.json({ 
            success: true, 
            username: userData.username
        });
    } catch (err) {
        console.error('Error getting user by address:', err);
        res.json({ success: false, message: 'Error getting user details' });
    }
});

app.post('/transfer-cred', requireAuth, async (req, res) => {
    try {
        const { recipientAddress, amount } = req.body;
        const senderId = req.session.userId;

        // Validate amount
        const transferAmount = parseInt(amount);
        if (!transferAmount || transferAmount <= 0) {
            return res.json({ success: false, message: 'Invalid transfer amount' });
        }

        // Get sender's details
        const senderRef = ref(rtdb, `users/${senderId}`);
        const senderSnapshot = await get(senderRef);
        const senderData = senderSnapshot.val();

        if (!senderData || typeof senderData.balance !== 'number' || senderData.balance < transferAmount) {
            return res.json({ success: false, message: 'Insufficient balance' });
        }

        // Find recipient by address
        const usersRef = ref(rtdb, 'users');
        const addressQuery = query(usersRef, orderByChild('walletAddress'), equalTo(recipientAddress));
        const recipientSnapshot = await get(addressQuery);

        if (!recipientSnapshot.exists()) {
            return res.json({ success: false, message: 'Recipient not found' });
        }

        const recipientId = Object.keys(recipientSnapshot.val())[0];
        const recipientData = recipientSnapshot.val()[recipientId];

        // Prevent self-transfer
        if (senderId === recipientId) {
            return res.json({ success: false, message: 'Cannot transfer to yourself' });
        }

        // Ensure recipient balance exists and is a number
        if (typeof recipientData.balance !== 'number') {
            recipientData.balance = 0;
        }

        // Calculate new balances
        const newSenderBalance = senderData.balance - transferAmount;
        const newRecipientBalance = recipientData.balance + transferAmount;

        // Validate final balances
        if (newSenderBalance < 0 || newRecipientBalance < 0) {
            return res.json({ success: false, message: 'Invalid balance calculation' });
        }

        // Update balances
        const updates = {};
        updates[`users/${senderId}/balance`] = newSenderBalance;
        updates[`users/${recipientId}/balance`] = newRecipientBalance;

        // Add transaction to history
        const transactionRef = ref(rtdb, 'transactions');
        const newTransactionRef = push(transactionRef);
        updates[`transactions/${newTransactionRef.key}`] = {
            senderId,
            recipientId,
            amount: transferAmount,
            timestamp: Date.now(),
            senderAddress: senderData.walletAddress,
            recipientAddress,
            senderUsername: senderData.username,
            recipientUsername: recipientData.username,
            senderBalanceBefore: senderData.balance,
            senderBalanceAfter: newSenderBalance,
            recipientBalanceBefore: recipientData.balance,
            recipientBalanceAfter: newRecipientBalance
        };

        // Perform all updates atomically
        await update(ref(rtdb), updates);

        res.json({ 
            success: true,
            newBalance: newSenderBalance,
            message: `Successfully transferred ${transferAmount} CRED to ${recipientData.username}`
        });
    } catch (err) {
        console.error('Error processing transfer:', err);
        res.json({ success: false, message: 'Error processing transfer' });
    }
});

// Add get-transactions endpoint
app.get('/get-transactions', requireAuth, async (req, res) => {
    try {
        const transactionsRef = ref(rtdb, 'transactions');
        const snapshot = await get(transactionsRef);
        
        if (!snapshot.exists()) {
            return res.json({ success: true, transactions: [] });
        }

        const transactions = [];
        snapshot.forEach((childSnapshot) => {
            const transaction = childSnapshot.val();
            // Only include transactions where the user is sender or recipient
            if (transaction.senderId === req.session.userId || 
                transaction.recipientId === req.session.userId) {
                transactions.push({
                    ...transaction,
                    id: childSnapshot.key
                });
            }
        });

        // Sort transactions by timestamp, newest first
        transactions.sort((a, b) => b.timestamp - a.timestamp);

        res.json({ success: true, transactions });
    } catch (err) {
        console.error('Error getting transactions:', err);
        res.json({ success: false, message: 'Error loading transactions' });
    }
});

// Add get-balance endpoint
app.get('/get-balance', requireAuth, async (req, res) => {
    try {
        const userRef = ref(rtdb, `users/${req.session.userId}`);
        const snapshot = await get(userRef);
        
        if (!snapshot.exists()) {
            return res.json({ success: false, message: 'User not found' });
        }

        const userData = snapshot.val();
        res.json({ 
            success: true, 
            balance: userData.balance || 0
        });
    } catch (err) {
        console.error('Error getting balance:', err);
        res.json({ success: false, message: 'Error getting balance' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
}); 
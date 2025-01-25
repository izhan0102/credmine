const bcrypt = require('bcryptjs');
const { rtdb } = require('./config/firebase');
const { ref, get, set, update, query, orderByChild, equalTo, push } = require('firebase/database');

// Check if username exists
async function checkUsername(username) {
    try {
        const usersRef = ref(rtdb, 'users');
        const usernameQuery = query(usersRef, orderByChild('username'), equalTo(username));
        const snapshot = await get(usernameQuery);
        return snapshot.exists();
    } catch (err) {
        console.error('Error checking username:', err);
        throw err;
    }
}

// Create new user
async function createUser(email, username, password) {
    try {
        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Create user reference
        const usersRef = ref(rtdb, 'users');
        const newUserRef = push(usersRef);
        
        // Set user data with initial balance of 0
        await set(newUserRef, {
            email,
            username,
            password: hashedPassword,
            balance: 0, // Start with 0 balance
            createdAt: Date.now()
        });
        
        return newUserRef.key;
    } catch (err) {
        console.error('Error creating user:', err);
        throw err;
    }
}

// Verify user login
async function verifyUser(email, password) {
    try {
        const usersRef = ref(rtdb, 'users');
        const emailQuery = query(usersRef, orderByChild('email'), equalTo(email));
        const snapshot = await get(emailQuery);
        
        if (!snapshot.exists()) return null;
        
        // Get the first user with matching email
        const userData = Object.entries(snapshot.val())[0];
        const userId = userData[0];
        const user = userData[1];
        
        const match = await bcrypt.compare(password, user.password);
        return match ? { id: userId, ...user } : null;
    } catch (err) {
        console.error('Error verifying user:', err);
        throw err;
    }
}

// Set user PIN
async function setUserPin(userId, pin) {
    try {
        console.log('Setting PIN:', { userId, pin });
        const cleanPin = pin.toString().trim();
        
        const userRef = ref(rtdb, `users/${userId}`);
        const snapshot = await get(userRef);
        
        if (!snapshot.exists()) {
            console.error('No user found with ID:', userId);
            throw new Error('User not found');
        }
        
        await update(userRef, { pin: cleanPin });
        console.log('PIN set successfully for user:', userId);
        return true;
    } catch (err) {
        console.error('Error setting PIN:', err);
        throw err;
    }
}

// Verify user PIN
async function verifyPin(userId, pin) {
    try {
        const userRef = ref(rtdb, `users/${userId}`);
        const snapshot = await get(userRef);
        
        if (!snapshot.exists() || !snapshot.val().pin) {
            console.log('No PIN set for user');
            return false;
        }
        
        const userData = snapshot.val();
        console.log('Verifying PIN for user:', userId);
        console.log('Stored PIN:', userData.pin);
        console.log('Provided PIN:', pin);
        
        const isMatch = userData.pin.toString() === pin.toString();
        console.log('PIN match:', isMatch);
        return isMatch;
    } catch (err) {
        console.error('Error verifying PIN:', err);
        throw err;
    }
}

// Generate wallet address
async function generateWalletAddress(userId) {
    try {
        const userRef = ref(rtdb, `users/${userId}`);
        const snapshot = await get(userRef);
        
        if (!snapshot.exists()) throw new Error('User not found');
        
        const timestamp = Date.now().toString(36);
        const randomStr = Math.random().toString(36).substring(2, 8);
        const address = `CRED${timestamp}${randomStr}${userId}`.toUpperCase();
        
        await update(userRef, { walletAddress: address });
        return address;
    } catch (err) {
        console.error('Error generating wallet address:', err);
        throw err;
    }
}

// Get user wallet address
async function getWalletAddress(userId) {
    try {
        const userRef = ref(rtdb, `users/${userId}`);
        const snapshot = await get(userRef);
        return snapshot.exists() ? snapshot.val().walletAddress : null;
    } catch (err) {
        console.error('Error getting wallet address:', err);
        throw err;
    }
}

module.exports = {
    checkUsername,
    createUser,
    verifyUser,
    setUserPin,
    verifyPin,
    generateWalletAddress,
    getWalletAddress
}; 
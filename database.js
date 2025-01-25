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
        
        // Store PIN as string to ensure consistent format
        await update(userRef, { pin: cleanPin });
        console.log('PIN set successfully for user:', userId);
        
        // Verify the PIN was set correctly
        const verifySnapshot = await get(userRef);
        if (!verifySnapshot.exists() || verifySnapshot.val().pin !== cleanPin) {
            throw new Error('PIN verification failed after setting');
        }
        
        return true;
    } catch (err) {
        console.error('Error setting PIN:', err);
        throw err;
    }
}

// Verify user PIN
async function verifyPin(userId, pin) {
    try {
        if (!userId || !pin) {
            console.log('Missing userId or PIN');
            return false;
        }

        const userRef = ref(rtdb, `users/${userId}`);
        const snapshot = await get(userRef);
        
        if (!snapshot.exists()) {
            console.log('User not found:', userId);
            return false;
        }
        
        const userData = snapshot.val();
        if (!userData.pin) {
            console.log('No PIN set for user');
            return false;
        }
        
        // Convert both PINs to strings and trim for comparison
        const storedPin = userData.pin.toString().trim();
        const providedPin = pin.toString().trim();
        
        console.log('PIN Verification:', {
            userId,
            storedPinLength: storedPin.length,
            providedPinLength: providedPin.length
        });
        
        const isMatch = storedPin === providedPin;
        console.log('PIN match:', isMatch);
        return isMatch;
    } catch (err) {
        console.error('Error verifying PIN:', err);
        return false;
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
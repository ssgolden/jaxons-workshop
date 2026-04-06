const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { queries } = require('../config/database');

if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is required in production');
}

const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');

function generateToken(user) {
    return jwt.sign(
        { id: user.id, email: user.email, role: user.role },
        JWT_SECRET,
        { expiresIn: '24h' }
    );
}

function verifyToken(token) {
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (e) {
        return null;
    }
}

function authMiddleware(req, res, next) {
    const token = req.cookies?.token || req.headers.authorization?.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    const decoded = verifyToken(token);
    if (!decoded) {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }

    const user = queries.getStaffByEmail.get(decoded.email);
    if (!user || !user.active) {
        return res.status(401).json({ error: 'User not found or inactive' });
    }

    req.user = user;
    next();
}

function roleMiddleware(...allowedRoles) {
    return (req, res, next) => {
        if (!req.user || !allowedRoles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }
        next();
    };
}

async function loginWithEmail(email, password) {
    const user = queries.getStaffByEmail.get(email);
    if (!user || !user.active) {
        return { success: false, error: 'Invalid credentials' };
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
        return { success: false, error: 'Invalid credentials' };
    }

    return {
        success: true,
        token: generateToken(user),
        user: { id: user.id, email: user.email, name: user.name, role: user.role }
    };
}

async function loginWithPin(pin) {
    const user = queries.getStaffByPin.get(pin);
    if (!user) {
        return { success: false, error: 'Invalid PIN' };
    }

    return {
        success: true,
        token: generateToken(user),
        user: { id: user.id, email: user.email, name: user.name, role: user.role }
    };
}

module.exports = {
    authMiddleware,
    roleMiddleware,
    generateToken,
    verifyToken,
    loginWithEmail,
    loginWithPin,
    JWT_SECRET,
};

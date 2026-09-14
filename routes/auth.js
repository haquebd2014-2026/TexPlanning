const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

/**
 * Helper: Calculate remaining seconds until upcoming midnight (12:00:00 AM)
 */
function getSecondsUntilMidnight() {
  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  return Math.max(1, Math.floor((midnight.getTime() - now.getTime()) / 1000));
}

/**
 * POST /api/auth/login
 * Authenticates user and returns JWT expiring at upcoming midnight (12:00 AM).
 * Does not return password or plainPassword fields.
 */
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username and password are required.'
      });
    }

    // Explicitly query password since select: false is enforced on schema
    const user = await User.findOne({ username: username.toLowerCase().trim() }).select('+password');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid username or password.'
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid username or password.'
      });
    }

    const expiresIn = getSecondsUntilMidnight();
    const secret = process.env.JWT_SECRET || 'texplanning_jwt_secret_key_default';

    const payload = {
      id: user._id,
      username: user.username,
      role: user.role,
      allowedBuyers: user.allowedBuyers
    };

    const token = jwt.sign(payload, secret, { expiresIn });

    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);

    return res.status(200).json({
      success: true,
      token,
      expiresAt: midnight.toISOString(),
      user: {
        id: user._id,
        username: user.username,
        role: user.role,
        allowedBuyers: user.allowedBuyers
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Server error during login.',
      error: error.message
    });
  }
});

/**
 * GET /api/auth/users
 * Protected: Admin only.
 * Lists all users with password omitted.
 */
router.get('/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const users = await User.find().select('-password');
    return res.status(200).json({
      success: true,
      users
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve users.',
      error: error.message
    });
  }
});

/**
 * POST /api/auth/register
 * Protected: Admin only.
 * Creates a new user account.
 */
router.post('/register', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { username, password, role, allowedBuyers } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username and password are required.'
      });
    }

    const existingUser = await User.findOne({ username: username.toLowerCase().trim() });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'Username already exists.'
      });
    }

    const newUser = new User({
      username: username.toLowerCase().trim(),
      password,
      role: role || 'User',
      allowedBuyers: Array.isArray(allowedBuyers) ? allowedBuyers : []
    });

    await newUser.save();

    return res.status(201).json({
      success: true,
      message: 'User registered successfully.',
      user: {
        id: newUser._id,
        username: newUser.username,
        role: newUser.role,
        allowedBuyers: newUser.allowedBuyers
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to register user.',
      error: error.message
    });
  }
});

/**
 * PUT /api/auth/user/:id
 * Protected: Admin only.
 * Updates an existing user's details or password.
 */
router.put('/user/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { role, allowedBuyers, password } = req.body;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found.'
      });
    }

    if (role) user.role = role;
    if (allowedBuyers !== undefined) {
      user.allowedBuyers = Array.isArray(allowedBuyers) ? allowedBuyers : [];
    }
    if (password) {
      user.password = password; // pre-save hook will hash this
    }

    await user.save();

    return res.status(200).json({
      success: true,
      message: 'User updated successfully.',
      user: {
        id: user._id,
        username: user.username,
        role: user.role,
        allowedBuyers: user.allowedBuyers
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to update user.',
      error: error.message
    });
  }
});

/**
 * DELETE /api/auth/user/:id
 * Protected: Admin only.
 * Deletes a user account.
 */
router.delete('/user/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const deletedUser = await User.findByIdAndDelete(id);
    if (!deletedUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found.'
      });
    }

    return res.status(200).json({
      success: true,
      message: `User ${deletedUser.username} deleted successfully.`
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to delete user.',
      error: error.message
    });
  }
});

module.exports = router;

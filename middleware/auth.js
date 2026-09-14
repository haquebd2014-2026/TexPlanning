const jwt = require('jsonwebtoken');

/**
 * Middleware: Verify Bearer JWT in the Authorization header.
 * Returns 401 if missing, 403 if invalid or expired.
 */
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ')
    ? authHeader.substring(7)
    : authHeader;

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Access denied. No authentication token provided.'
    });
  }

  const secret = process.env.JWT_SECRET || 'texplanning_jwt_secret_key_default';

  try {
    const decoded = jwt.verify(token, secret);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({
      success: false,
      message: 'Invalid or expired token.'
    });
  }
}

/**
 * Middleware: Ensure the authenticated user has Admin role.
 * Returns 403 if user is not Admin.
 */
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'Admin') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Administrator privileges required.'
    });
  }
  next();
}

/**
 * Middleware: Scope database queries based on user's assigned buyers.
 * Admins have full access. Non-admin users are restricted to req.user.allowedBuyers.
 */
function buyerScope(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication context missing.'
    });
  }

  if (req.user.role === 'Admin') {
    // Admin has access to all buyers without restriction
    req.buyerFilter = {};
    req.buyerScope = null;
    return next();
  }

  const allowedBuyers = Array.isArray(req.user.allowedBuyers) ? req.user.allowedBuyers : [];
  req.buyerScope = allowedBuyers;
  req.buyerFilter = { buyer: { $in: allowedBuyers } };
  next();
}

module.exports = {
  authenticateToken,
  requireAdmin,
  buyerScope
};

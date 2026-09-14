const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const User = require('../models/User');
const UnifiedOrder = require('../models/UnifiedOrder');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

// Configure upload storage directory
const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_'));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

/**
 * POST /api/upload/file
 * Upload planning spreadsheet or related files
 */
router.post('/file', authenticateToken, upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file provided.'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'File uploaded successfully.',
      file: {
        filename: req.file.filename,
        originalName: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype,
        uploadedAt: new Date()
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'File upload failed.',
      error: error.message
    });
  }
});

/**
 * GET /api/upload/all
 * Protected: Authenticated users only.
 * Lists all uploaded planning files.
 */
router.get('/all', authenticateToken, async (req, res) => {
  try {
    const files = await fs.promises.readdir(uploadDir);
    const fileDetails = await Promise.all(
      files.map(async (file) => {
        const filePath = path.join(uploadDir, file);
        const stats = await fs.promises.stat(filePath);
        return {
          filename: file,
          size: stats.size,
          createdAt: stats.birthtime,
          modifiedAt: stats.mtime
        };
      })
    );

    return res.status(200).json({
      success: true,
      count: fileDetails.length,
      files: fileDetails
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve uploaded files.',
      error: error.message
    });
  }
});

/**
 * GET /api/upload/download/:filename
 * Protected: Authenticated users only.
 * Securely downloads an uploaded file by sanitized filename.
 */
router.get('/download/:filename', authenticateToken, (req, res) => {
  try {
    // Sanitize filename to prevent directory traversal attacks
    const safeFilename = path.basename(req.params.filename);
    const filePath = path.join(uploadDir, safeFilename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        message: 'File not found.'
      });
    }

    return res.download(filePath, safeFilename);
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to download file.',
      error: error.message
    });
  }
});

/**
 * DELETE /api/upload/clear-all-planning
 * Protected: Admin only + Password verification required.
 * Verifies adminPassword from req.body using comparePassword() before clearing collections.
 */
router.delete('/clear-all-planning', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { adminPassword } = req.body;

    if (!adminPassword) {
      return res.status(400).json({
        success: false,
        message: 'Admin confirmation password is required in request body.'
      });
    }

    // Retrieve requesting admin user including password field
    const adminUser = await User.findById(req.user.id).select('+password');
    if (!adminUser) {
      return res.status(404).json({
        success: false,
        message: 'Admin user account not found.'
      });
    }

    // Verify password using comparePassword instance method
    const isPasswordValid = await adminUser.comparePassword(adminPassword);
    if (!isPasswordValid) {
      return res.status(403).json({
        success: false,
        message: 'Invalid admin password. Action forbidden.'
      });
    }

    // Delete all records from planning collections
    const deleteResult = await UnifiedOrder.deleteMany({});

    return res.status(200).json({
      success: true,
      message: 'All planning collections have been successfully cleared.',
      deletedCount: deleteResult.deletedCount
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Error clearing planning collections.',
      error: error.message
    });
  }
});

module.exports = router;

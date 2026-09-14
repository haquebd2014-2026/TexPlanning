const express = require('express');
const router = express.Router();
const multer = require('multer');
const { authenticateToken, buyerScope } = require('../middleware/auth');
const { getUnifiedOrders, updateUnifiedPlan } = require('../controllers/orderController');
const { processExcelUpload } = require('../controllers/uploadController');

// Multer memory storage configuration for spreadsheet buffering
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB file size limit
});

// Enforce authentication on all order routes
router.use(authenticateToken);

// GET /api/orders - Get consolidated unified orders with pagination and filtering
router.get('/', buyerScope, getUnifiedOrders);

// PUT /api/orders/:id - Update order planning (knitting, dyeing, delivery, status)
router.put('/:id', updateUnifiedPlan);

// POST /api/orders/upload-excel - Upload and bulk-upsert Excel planning sheet
router.post('/upload-excel', upload.single('file'), processExcelUpload);

module.exports = router;

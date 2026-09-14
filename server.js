const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const xlsx = require('xlsx');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;
const rawMongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || "mongodb+srv://haquebd2014-2026:Shimulbd2014%402026@cluster0.fo7s303.mongodb.net/textile_erp?retryWrites=true&w=majority&appName=Cluster0";
const MONGODB_URI = rawMongoUri.replace(
  /^(mongodb(?:\+srv)?:\/\/[^:]+:)(.*)(@[^@]+)$/,
  (match, prefix, password, host) => prefix + encodeURIComponent(decodeURIComponent(password)) + host
);
const MONGO_URI = MONGODB_URI;
const JWT_SECRET = process.env.JWT_SECRET || 'texplanning_production_secret_jwt_key_2026';

// ==========================================
// 1. MONGOOSE SCHEMAS & MODELS
// ==========================================

// --- User Schema ---
const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: [true, 'Username is required'],
    unique: true,
    trim: true,
    lowercase: true
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    select: false
  },
  role: {
    type: String,
    enum: ['Admin', 'User', 'Viewer'],
    default: 'User'
  },
  allowedBuyers: {
    type: [String],
    default: []
  }
}, {
  timestamps: true
});

// Pre-save hook: Hash password with bcrypt salt factor 10
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (err) {
    next(err);
  }
});

// Instance method to compare password
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

const User = mongoose.models.User || mongoose.model('User', userSchema);

// --- Fabric Item Schema (Module 1 Unified Structure) ---
const fabricItemSchema = new mongoose.Schema({
  color: { type: String, trim: true, default: '' },
  fabricConstruction: { type: String, trim: true, default: '' },
  gsm: { type: String, trim: true, default: '' },
  allocatedQty: { type: Number, default: 0 },
  yarnInhouseDate: { type: Date, default: null },
  knitStartDate: { type: Date, default: null },
  knitEndDate: { type: Date, default: null },
  knitQty: { type: Number, default: 0 },
  dyeingUnit: { type: String, trim: true, default: '' },
  processName: { type: String, trim: true, default: '' },
  dyeStartDate: { type: Date, default: null },
  dyeEndDate: { type: Date, default: null },
  dyeQty: { type: Number, default: 0 },
  deliveryTargetDate: { type: Date, default: null },
  deliveredQty: { type: Number, default: 0 },
  balanceQty: { type: Number, default: 0 },
  failReason: { type: String, trim: true, default: '' },
  relatedDept: { type: String, trim: true, default: '' }
}, { _id: true, timestamps: true });

// Auto calculate balance quantity before saving fabric item
fabricItemSchema.pre('save', function (next) {
  if (this.allocatedQty !== undefined && this.deliveredQty !== undefined) {
    this.balanceQty = Math.max(0, this.allocatedQty - this.deliveredQty);
  }
  next();
});

// --- General Info Subschema ---
const generalInfoSchema = new mongoose.Schema({
  buyer: { type: String, trim: true, default: '' },
  style: { type: String, trim: true, default: '' },
  season: { type: String, trim: true, default: '' },
  bookingDate: { type: Date, default: null },
  totalOrderQty: { type: Number, default: 0 },
  firstShipDate: { type: Date, default: null },
  lastShipDate: { type: Date, default: null },
  fabricNotes: { type: String, trim: true, default: '' }
}, { _id: false });

// --- Knitting Plan Subschema ---
const knittingPlanItemSchema = new mongoose.Schema({
  color: { type: String, trim: true, default: '' },
  fabricConstruction: { type: String, trim: true, default: '' },
  gsm: { type: String, trim: true, default: '' },
  allocatedQty: { type: Number, default: 0 },
  yarnInhouseDate: { type: Date, default: null },
  knitStartDate: { type: Date, default: null },
  knitEndDate: { type: Date, default: null },
  knitQty: { type: Number, default: 0 },
  status: { type: String, default: 'Pending' }
}, { _id: true, timestamps: true });

// --- Dyeing Plan Subschema ---
const dyeingPlanItemSchema = new mongoose.Schema({
  color: { type: String, trim: true, default: '' },
  dyeingUnit: { type: String, trim: true, default: '' },
  processName: { type: String, trim: true, default: '' },
  dyeStartDate: { type: Date, default: null },
  dyeEndDate: { type: Date, default: null },
  dyeQty: { type: Number, default: 0 },
  status: { type: String, default: 'Pending' }
}, { _id: true, timestamps: true });

// --- Delivery Plan Subschema ---
const deliveryPlanItemSchema = new mongoose.Schema({
  color: { type: String, trim: true, default: '' },
  deliveryTargetDate: { type: Date, default: null },
  deliveredQty: { type: Number, default: 0 },
  balanceQty: { type: Number, default: 0 },
  failReason: { type: String, trim: true, default: '' },
  relatedDept: { type: String, trim: true, default: '' },
  status: { type: String, default: 'Pending' }
}, { _id: true, timestamps: true });

// Auto calculate balance quantity before saving delivery item
deliveryPlanItemSchema.pre('save', function (next) {
  if (this.allocatedQty !== undefined && this.deliveredQty !== undefined) {
    this.balanceQty = Math.max(0, this.allocatedQty - this.deliveredQty);
  }
  next();
});

// --- Unified Order Schema ---
const unifiedOrderSchema = new mongoose.Schema({
  orderNo: {
    type: String,
    required: [true, 'Order number is required'],
    unique: true,
    trim: true,
    index: true
  },
  buyer: {
    type: String,
    required: [true, 'Buyer name is required'],
    trim: true,
    index: true
  },
  style: {
    type: String,
    trim: true,
    index: true,
    default: ''
  },
  season: {
    type: String,
    trim: true,
    default: ''
  },
  bookingDate: {
    type: Date,
    default: null
  },
  totalOrderQty: {
    type: Number,
    default: 0
  },
  firstShipDate: {
    type: Date,
    default: null
  },
  lastShipDate: {
    type: Date,
    default: null
  },
  fabricNotes: {
    type: String,
    trim: true,
    default: ''
  },
  overallStatus: {
    type: String,
    trim: true,
    default: 'Pending',
    index: true
  },
  status: {
    type: String,
    trim: true,
    default: 'Pending'
  },
  generalInfo: {
    type: generalInfoSchema,
    default: () => ({})
  },
  knittingPlan: [knittingPlanItemSchema],
  dyeingPlan: [dyeingPlanItemSchema],
  deliveryPlan: [deliveryPlanItemSchema],
  fabricItems: [fabricItemSchema]
}, {
  timestamps: true
});

// Synchronize generalInfo and top-level fields before save
unifiedOrderSchema.pre('save', function (next) {
  if (this.generalInfo) {
    if (this.generalInfo.buyer) this.buyer = this.generalInfo.buyer;
    if (this.generalInfo.style) this.style = this.generalInfo.style;
    if (this.generalInfo.season) this.season = this.generalInfo.season;
    if (this.generalInfo.bookingDate) this.bookingDate = this.generalInfo.bookingDate;
    if (this.generalInfo.totalOrderQty) this.totalOrderQty = this.generalInfo.totalOrderQty;
    if (this.generalInfo.firstShipDate) this.firstShipDate = this.generalInfo.firstShipDate;
    if (this.generalInfo.lastShipDate) this.lastShipDate = this.generalInfo.lastShipDate;
    if (this.generalInfo.fabricNotes) this.fabricNotes = this.generalInfo.fabricNotes;
  } else {
    this.generalInfo = {
      buyer: this.buyer,
      style: this.style,
      season: this.season,
      bookingDate: this.bookingDate,
      totalOrderQty: this.totalOrderQty,
      firstShipDate: this.firstShipDate,
      lastShipDate: this.lastShipDate,
      fabricNotes: this.fabricNotes
    };
  }

  if (this.overallStatus) {
    this.status = this.overallStatus;
  } else if (this.status) {
    this.overallStatus = this.status;
  }

  next();
});

const UnifiedOrder = mongoose.models.UnifiedOrder || mongoose.model('UnifiedOrder', unifiedOrderSchema);

// ==========================================
// 2. AUTHENTICATION & SECURITY MIDDLEWARE
// ==========================================

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

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({
      success: false,
      message: 'Invalid or expired token.'
    });
  }
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'Admin') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Administrator privileges required.'
    });
  }
  next();
}

function buyerScope(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication context missing.'
    });
  }

  if (req.user.role === 'Admin') {
    req.buyerFilter = {};
    req.buyerScope = null;
    return next();
  }

  const allowedBuyers = Array.isArray(req.user.allowedBuyers) ? req.user.allowedBuyers : [];
  req.buyerScope = allowedBuyers;
  req.buyerFilter = { buyer: { $in: allowedBuyers } };
  next();
}

// ==========================================
// 3. HELPER UTILITIES
// ==========================================

function getSecondsUntilMidnight() {
  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  return Math.max(1, Math.floor((midnight.getTime() - now.getTime()) / 1000));
}

function normalizeKey(str) {
  if (!str) return '';
  return String(str)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function parseExcelDate(val) {
  if (!val) return null;
  if (val instanceof Date && !isNaN(val.getTime())) {
    return val;
  }
  if (typeof val === 'number') {
    const date = xlsx.SSF.parse_date_code(val);
    if (date) {
      return new Date(date.y, date.m - 1, date.d, date.H || 0, date.M || 0, date.S || 0);
    }
  }
  const parsed = new Date(val);
  return isNaN(parsed.getTime()) ? null : parsed;
}

function parseExcelNumber(val, defaultVal = 0) {
  if (val === undefined || val === null || val === '') return defaultVal;
  const num = Number(String(val).replace(/[^0-9.-]/g, ''));
  return isNaN(num) ? defaultVal : num;
}

// ==========================================
// 4. EXPRESS MIDDLEWARE CONFIGURATION
// ==========================================

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Multer memory storage configuration for spreadsheets
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

// Configure upload storage folder on disk if needed
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
app.use('/uploads', express.static(uploadDir));

// ==========================================
// 5. AUTHENTICATION ROUTES (/api/auth)
// ==========================================

// POST /api/auth/register (Admin only)
app.post('/api/auth/register', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { username, password, role, allowedBuyers } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username and password are required.' });
    }

    const existingUser = await User.findOne({ username: username.toLowerCase().trim() });
    if (existingUser) {
      return res.status(409).json({ success: false, message: 'Username already exists.' });
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
    return res.status(500).json({ success: false, message: 'Failed to register user.', error: error.message });
  }
});

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username and password are required.' });
    }

    const user = await User.findOne({ username: username.toLowerCase().trim() }).select('+password');
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid username or password.' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid username or password.' });
    }

    const expiresIn = getSecondsUntilMidnight();
    const payload = {
      id: user._id,
      username: user.username,
      role: user.role,
      allowedBuyers: user.allowedBuyers
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn });

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
    return res.status(500).json({ success: false, message: 'Server error during login.', error: error.message });
  }
});

// GET /api/auth/users (Admin only)
app.get('/api/auth/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const users = await User.find().select('-password');
    return res.status(200).json({ success: true, users });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to retrieve users.', error: error.message });
  }
});

// GET /api/auth/me (Current user)
app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }
    return res.status(200).json({ success: true, user });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch user.', error: error.message });
  }
});

// ==========================================
// 6. ORDER ROUTES (/api/orders)
// ==========================================

// GET /api/orders (Consolidated orders with pagination and filtering)
app.get('/api/orders', authenticateToken, buyerScope, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.max(1, Math.min(200, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const { buyer, style, status, orderNo, search } = req.query;
    const filter = {};

    // Buyer scoping
    if (req.user && req.user.role !== 'Admin') {
      const allowedBuyers = Array.isArray(req.user.allowedBuyers) ? req.user.allowedBuyers : [];
      if (buyer) {
        if (!allowedBuyers.includes(buyer)) {
          return res.status(200).json({
            success: true,
            pagination: { total: 0, page, limit, totalPages: 0 },
            data: []
          });
        }
        filter.buyer = buyer;
      } else {
        filter.buyer = { $in: allowedBuyers };
      }
    } else if (buyer) {
      filter.buyer = { $regex: new RegExp(buyer.trim(), 'i') };
    }

    if (style) {
      filter.style = { $regex: new RegExp(style.trim(), 'i') };
    }

    if (status) {
      filter.$or = [
        { overallStatus: { $regex: new RegExp(status.trim(), 'i') } },
        { status: { $regex: new RegExp(status.trim(), 'i') } }
      ];
    }

    if (orderNo) {
      filter.orderNo = { $regex: new RegExp(orderNo.trim(), 'i') };
    }

    if (search) {
      const searchRegex = new RegExp(search.trim(), 'i');
      filter.$or = [
        { orderNo: searchRegex },
        { buyer: searchRegex },
        { style: searchRegex },
        { 'generalInfo.fabricNotes': searchRegex },
        { fabricNotes: searchRegex }
      ];
    }

    const totalOrders = await UnifiedOrder.countDocuments(filter);
    const orders = await UnifiedOrder.find(filter)
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit);

    const consolidatedData = orders.map((order) => {
      const generalInfo = {
        buyer: order.generalInfo?.buyer || order.buyer || '',
        style: order.generalInfo?.style || order.style || '',
        season: order.generalInfo?.season || order.season || '',
        bookingDate: order.generalInfo?.bookingDate || order.bookingDate || null,
        totalOrderQty: order.generalInfo?.totalOrderQty || order.totalOrderQty || 0,
        firstShipDate: order.generalInfo?.firstShipDate || order.firstShipDate || null,
        lastShipDate: order.generalInfo?.lastShipDate || order.lastShipDate || null,
        fabricNotes: order.generalInfo?.fabricNotes || order.fabricNotes || ''
      };

      return {
        _id: order._id,
        orderNo: order.orderNo,
        overallStatus: order.overallStatus || order.status || 'Pending',
        generalInfo,
        knittingPlan: order.knittingPlan || [],
        dyeingPlan: order.dyeingPlan || [],
        deliveryPlan: order.deliveryPlan || [],
        fabricItems: order.fabricItems || [],
        createdAt: order.createdAt,
        updatedAt: order.updatedAt
      };
    });

    return res.status(200).json({
      success: true,
      pagination: {
        total: totalOrders,
        page,
        limit,
        totalPages: Math.ceil(totalOrders / limit)
      },
      data: consolidatedData
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve unified orders.',
      error: error.message
    });
  }
});

// PUT /api/orders/:id (Atomic synchronized plan update)
app.put('/api/orders/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { knittingPlan, dyeingPlan, deliveryPlan, overallStatus, generalInfo } = req.body;

    const existingOrder = await UnifiedOrder.findById(id);
    if (!existingOrder) {
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }

    if (req.user && req.user.role !== 'Admin') {
      const allowedBuyers = Array.isArray(req.user.allowedBuyers) ? req.user.allowedBuyers : [];
      if (!allowedBuyers.includes(existingOrder.buyer)) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. You do not have permission to modify orders for this buyer.'
        });
      }
    }

    const updateFields = {};

    if (knittingPlan !== undefined) {
      updateFields.knittingPlan = Array.isArray(knittingPlan) ? knittingPlan : [];
    }

    if (dyeingPlan !== undefined) {
      updateFields.dyeingPlan = Array.isArray(dyeingPlan) ? dyeingPlan : [];
    }

    if (deliveryPlan !== undefined) {
      updateFields.deliveryPlan = Array.isArray(deliveryPlan) ? deliveryPlan : [];
    }

    if (overallStatus !== undefined) {
      updateFields.overallStatus = overallStatus;
      updateFields.status = overallStatus;
    }

    if (generalInfo !== undefined && typeof generalInfo === 'object') {
      updateFields.generalInfo = {
        ...existingOrder.generalInfo?.toObject(),
        ...generalInfo
      };
      if (generalInfo.buyer) updateFields.buyer = generalInfo.buyer;
      if (generalInfo.style) updateFields.style = generalInfo.style;
      if (generalInfo.season) updateFields.season = generalInfo.season;
      if (generalInfo.bookingDate) updateFields.bookingDate = generalInfo.bookingDate;
      if (generalInfo.totalOrderQty !== undefined) updateFields.totalOrderQty = generalInfo.totalOrderQty;
      if (generalInfo.firstShipDate) updateFields.firstShipDate = generalInfo.firstShipDate;
      if (generalInfo.lastShipDate) updateFields.lastShipDate = generalInfo.lastShipDate;
      if (generalInfo.fabricNotes) updateFields.fabricNotes = generalInfo.fabricNotes;
    }

    const updatedOrder = await UnifiedOrder.findByIdAndUpdate(
      id,
      { $set: updateFields },
      { new: true, runValidators: true }
    );

    const consolidatedResponse = {
      _id: updatedOrder._id,
      orderNo: updatedOrder.orderNo,
      overallStatus: updatedOrder.overallStatus || updatedOrder.status || 'Pending',
      generalInfo: {
        buyer: updatedOrder.generalInfo?.buyer || updatedOrder.buyer || '',
        style: updatedOrder.generalInfo?.style || updatedOrder.style || '',
        season: updatedOrder.generalInfo?.season || updatedOrder.season || '',
        bookingDate: updatedOrder.generalInfo?.bookingDate || updatedOrder.bookingDate || null,
        totalOrderQty: updatedOrder.generalInfo?.totalOrderQty || updatedOrder.totalOrderQty || 0,
        firstShipDate: updatedOrder.generalInfo?.firstShipDate || updatedOrder.firstShipDate || null,
        lastShipDate: updatedOrder.generalInfo?.lastShipDate || updatedOrder.lastShipDate || null,
        fabricNotes: updatedOrder.generalInfo?.fabricNotes || updatedOrder.fabricNotes || ''
      },
      knittingPlan: updatedOrder.knittingPlan || [],
      dyeingPlan: updatedOrder.dyeingPlan || [],
      deliveryPlan: updatedOrder.deliveryPlan || [],
      fabricItems: updatedOrder.fabricItems || [],
      createdAt: updatedOrder.createdAt,
      updatedAt: updatedOrder.updatedAt
    };

    return res.status(200).json({
      success: true,
      message: 'Unified order plan successfully updated.',
      data: consolidatedResponse
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to update unified order plan.',
      error: error.message
    });
  }
});

// POST /api/orders/upload-excel (Excel / CSV Spreadsheet Ingestion & Bulk Upsert)
app.post('/api/orders/upload-excel', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded or file buffer is empty. Please upload an Excel (.xlsx, .xls) or .csv file.'
      });
    }

    const workbook = xlsx.read(req.file.buffer, {
      type: 'buffer',
      cellDates: true,
      cellNF: false,
      cellText: false
    });

    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'The uploaded file contains no readable sheets.'
      });
    }

    const ordersMap = {};
    let totalRowsProcessed = 0;

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) continue;

      const rawRows = xlsx.utils.sheet_to_json(sheet, { defval: '', raw: false });
      if (!rawRows || rawRows.length === 0) continue;

      for (const row of rawRows) {
        totalRowsProcessed++;

        const rowMap = {};
        for (const [colName, colVal] of Object.entries(row)) {
          rowMap[normalizeKey(colName)] = colVal;
        }

        const orderNoVal = rowMap['orderno'] ||
          rowMap['order'] ||
          rowMap['ordernumber'] ||
          rowMap['pono'] ||
          rowMap['po'] ||
          rowMap['jobno'];

        if (!orderNoVal) continue;

        const orderNo = String(orderNoVal).trim();
        const buyer = String(rowMap['buyer'] || rowMap['buyername'] || rowMap['customer'] || 'Unknown Buyer').trim();
        const style = String(rowMap['style'] || rowMap['styleno'] || rowMap['stylename'] || '').trim();
        const season = String(rowMap['season'] || '').trim();
        const bookingDate = parseExcelDate(rowMap['bookingdate'] || rowMap['orderdate'] || rowMap['podate']);
        const totalOrderQty = parseExcelNumber(rowMap['totalorderqty'] || rowMap['orderqty'] || rowMap['qty'] || rowMap['totalqty']);
        const firstShipDate = parseExcelDate(rowMap['firstshipdate'] || rowMap['firstship'] || rowMap['exfactory1']);
        const lastShipDate = parseExcelDate(rowMap['lastshipdate'] || rowMap['lastship'] || rowMap['shipdate'] || rowMap['exfactorydate'] || rowMap['exfactory']);
        const fabricNotes = String(rowMap['fabricnotes'] || rowMap['yarncount'] || rowMap['notes'] || rowMap['remarks'] || '').trim();
        const overallStatus = String(rowMap['overallstatus'] || rowMap['deliverystatus'] || rowMap['status'] || 'Pending').trim();

        if (req.user && req.user.role !== 'Admin') {
          const allowedBuyers = Array.isArray(req.user.allowedBuyers) ? req.user.allowedBuyers : [];
          if (!allowedBuyers.includes(buyer)) continue;
        }

        if (!ordersMap[orderNo]) {
          ordersMap[orderNo] = {
            orderNo,
            buyer,
            style,
            season,
            bookingDate,
            totalOrderQty,
            firstShipDate,
            lastShipDate,
            fabricNotes,
            overallStatus,
            generalInfo: {
              buyer,
              style,
              season,
              bookingDate,
              totalOrderQty,
              firstShipDate,
              lastShipDate,
              fabricNotes
            },
            knittingPlan: [],
            dyeingPlan: [],
            deliveryPlan: [],
            fabricItems: []
          };
        } else {
          if (!ordersMap[orderNo].buyer && buyer) ordersMap[orderNo].buyer = buyer;
          if (!ordersMap[orderNo].style && style) ordersMap[orderNo].style = style;
          if (!ordersMap[orderNo].season && season) ordersMap[orderNo].season = season;
          if (!ordersMap[orderNo].bookingDate && bookingDate) ordersMap[orderNo].bookingDate = bookingDate;
          if (totalOrderQty > 0) ordersMap[orderNo].totalOrderQty = totalOrderQty;
          if (!ordersMap[orderNo].firstShipDate && firstShipDate) ordersMap[orderNo].firstShipDate = firstShipDate;
          if (!ordersMap[orderNo].lastShipDate && lastShipDate) ordersMap[orderNo].lastShipDate = lastShipDate;
          if (!ordersMap[orderNo].fabricNotes && fabricNotes) ordersMap[orderNo].fabricNotes = fabricNotes;
        }

        const color = String(rowMap['color'] || rowMap['colour'] || rowMap['fabriccolor'] || '').trim();
        const fabricConstruction = String(rowMap['fabricconstruction'] || rowMap['construction'] || rowMap['fabrication'] || rowMap['item'] || '').trim();
        const gsm = String(rowMap['gsm'] || '').trim();
        const allocatedQty = parseExcelNumber(rowMap['allocatedqty'] || rowMap['fabricallocatedqty'] || rowMap['reqqty'] || rowMap['orderqty'] || rowMap['totalorderqty']);

        const yarnInhouseDate = parseExcelDate(rowMap['yarninhousedate'] || rowMap['yarninhouse'] || rowMap['yarndate']);
        const knitStartDate = parseExcelDate(rowMap['knitstartdate'] || rowMap['knitstart'] || rowMap['knittingstart']);
        const knitEndDate = parseExcelDate(rowMap['knitenddate'] || rowMap['knitend'] || rowMap['knittingend']);
        const knitQty = parseExcelNumber(rowMap['knitqty'] || rowMap['knittedqty'] || rowMap['knittingqty']);
        const knitStatus = String(rowMap['knitstatus'] || (knitQty >= allocatedQty && allocatedQty > 0 ? 'Completed' : 'In Progress')).trim();

        const dyeingUnit = String(rowMap['dyeingunit'] || rowMap['dyeunit'] || rowMap['factory'] || '').trim();
        const processName = String(rowMap['processname'] || rowMap['process'] || rowMap['dyeprocess'] || '').trim();
        const dyeStartDate = parseExcelDate(rowMap['dyestartdate'] || rowMap['dyestart'] || rowMap['dyeingstart']);
        const dyeEndDate = parseExcelDate(rowMap['dyeenddate'] || rowMap['dyeend'] || rowMap['dyeingend']);
        const dyeQty = parseExcelNumber(rowMap['dyeqty'] || rowMap['dyedqty'] || rowMap['dyeingqty']);
        const dyeStatus = String(rowMap['dyestatus'] || (dyeQty >= allocatedQty && allocatedQty > 0 ? 'Completed' : 'In Progress')).trim();

        const deliveryTargetDate = parseExcelDate(rowMap['deliverytargetdate'] || rowMap['targetdelivery'] || rowMap['deliverydate'] || rowMap['exfactorydate'] || rowMap['exfactory']);
        const deliveredQty = parseExcelNumber(rowMap['deliveredqty'] || rowMap['delqty'] || rowMap['deliveryqty']);
        const balanceQty = parseExcelNumber(rowMap['balanceqty'] || rowMap['balqty'], Math.max(0, allocatedQty - deliveredQty));
        const failReason = String(rowMap['failreason'] || rowMap['reason'] || rowMap['delayreason'] || '').trim();
        const relatedDept = String(rowMap['relateddept'] || rowMap['department'] || rowMap['dept'] || '').trim();
        const deliveryStatus = String(rowMap['deliverystatus'] || (deliveredQty >= allocatedQty && allocatedQty > 0 ? 'Completed' : 'Pending')).trim();

        if (color || fabricConstruction || allocatedQty || knitQty || dyeQty || deliveredQty) {
          ordersMap[orderNo].knittingPlan.push({
            color,
            fabricConstruction,
            gsm,
            allocatedQty,
            yarnInhouseDate,
            knitStartDate,
            knitEndDate,
            knitQty,
            status: knitStatus
          });

          ordersMap[orderNo].dyeingPlan.push({
            color,
            dyeingUnit,
            processName,
            dyeStartDate,
            dyeEndDate,
            dyeQty,
            status: dyeStatus
          });

          ordersMap[orderNo].deliveryPlan.push({
            color,
            deliveryTargetDate,
            deliveredQty,
            balanceQty,
            failReason,
            relatedDept,
            status: deliveryStatus
          });

          ordersMap[orderNo].fabricItems.push({
            color,
            fabricConstruction,
            gsm,
            allocatedQty,
            yarnInhouseDate,
            knitStartDate,
            knitEndDate,
            knitQty,
            dyeingUnit,
            processName,
            dyeStartDate,
            dyeEndDate,
            dyeQty,
            deliveryTargetDate,
            deliveredQty,
            balanceQty,
            failReason,
            relatedDept
          });
        }
      }
    }

    const orderEntries = Object.values(ordersMap);
    if (orderEntries.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid order rows found in the uploaded file.',
        rowsProcessed: totalRowsProcessed
      });
    }

    const bulkOps = orderEntries.map((order) => ({
      updateOne: {
        filter: { orderNo: order.orderNo },
        update: {
          $set: {
            orderNo: order.orderNo,
            buyer: order.buyer,
            style: order.style,
            season: order.season,
            bookingDate: order.bookingDate,
            totalOrderQty: order.totalOrderQty,
            firstShipDate: order.firstShipDate,
            lastShipDate: order.lastShipDate,
            fabricNotes: order.fabricNotes,
            overallStatus: order.overallStatus,
            status: order.overallStatus,
            generalInfo: order.generalInfo,
            knittingPlan: order.knittingPlan,
            dyeingPlan: order.dyeingPlan,
            deliveryPlan: order.deliveryPlan,
            fabricItems: order.fabricItems
          }
        },
        upsert: true
      }
    }));

    const bulkResult = await UnifiedOrder.bulkWrite(bulkOps, { ordered: false });

    return res.status(200).json({
      success: true,
      message: 'File processed successfully with bulk upsert operations.',
      summary: {
        totalRowsProcessed,
        ordersDetected: orderEntries.length,
        upsertedCount: bulkResult.upsertedCount,
        modifiedCount: bulkResult.modifiedCount,
        matchedCount: bulkResult.matchedCount
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to process spreadsheet upload.',
      error: error.message
    });
  }
});

// ==========================================
// 7. CLEAR PLANNING DATA ROUTE
// ==========================================

app.delete('/api/upload/clear-all-planning', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { adminPassword } = req.body;
    if (!adminPassword) {
      return res.status(400).json({ success: false, message: 'Admin password is required for confirmation.' });
    }

    const adminUser = await User.findById(req.user.id).select('+password');
    if (!adminUser) {
      return res.status(404).json({ success: false, message: 'Admin account not found.' });
    }

    const isPasswordValid = await adminUser.comparePassword(adminPassword);
    if (!isPasswordValid) {
      return res.status(403).json({ success: false, message: 'Invalid admin password. Action aborted.' });
    }

    const deleteResult = await UnifiedOrder.deleteMany({});
    return res.status(200).json({
      success: true,
      message: 'All planning collections have been cleared.',
      deletedCount: deleteResult.deletedCount
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Error clearing planning data.', error: error.message });
  }
});

// ==========================================
// 8. STATIC ASSETS & SINGLE-SCREEN SERVING
// ==========================================

// Serve static assets from both 'public' and the root directory (handles flattened deployments)
const publicDir = path.join(__dirname, 'public');
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
}
app.use(express.static(__dirname));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'online',
    system: 'Unified Textile ERP',
    mode: 'Consolidated Single-File Backend Architecture',
    timestamp: new Date()
  });
});

// Root fallback to index.html (checks public/index.html first, then root index.html)
app.get('/', (req, res) => {
  const publicIndex = path.join(__dirname, 'public', 'index.html');
  if (fs.existsSync(publicIndex)) {
    return res.sendFile(publicIndex);
  }
  const rootIndex = path.join(__dirname, 'index.html');
  if (fs.existsSync(rootIndex)) {
    return res.sendFile(rootIndex);
  }
  return res.status(200).send('TexPlanning ERP Backend Online');
});

// Global 404 handler for API routes
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({
      success: false,
      message: `Endpoint not found: ${req.method} ${req.originalUrl}`
    });
  }
  // For non-API routes, fall back to index.html if available
  const publicIndex = path.join(__dirname, 'public', 'index.html');
  if (fs.existsSync(publicIndex)) {
    return res.sendFile(publicIndex);
  }
  next();
});

// Centralized error handler
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error'
  });
});

// ==========================================
// 9. DATABASE BOOTSTRAP & AUTO-SEEDING
// ==========================================

async function ensureDefaultUsers() {
  try {
    const adminCount = await User.countDocuments({ role: 'Admin' });
    if (adminCount === 0) {
      const defaultAdmin = new User({
        username: 'admin',
        password: 'AdminPassword123!',
        role: 'Admin',
        allowedBuyers: []
      });
      await defaultAdmin.save();
      console.log('[Auto-Seed] Created default Admin user: "admin" / "AdminPassword123!"');
    }

    const plannerCount = await User.countDocuments({ username: 'planner' });
    if (plannerCount === 0) {
      const defaultPlanner = new User({
        username: 'planner',
        password: 'PlannerPassword123!',
        role: 'User',
        allowedBuyers: ['H&M', 'Zara', 'Next', 'Target', 'Marks & Spencer']
      });
      await defaultPlanner.save();
      console.log('[Auto-Seed] Created default Planner user: "planner" / "PlannerPassword123!"');
    }
  } catch (err) {
    console.error('[Auto-Seed] Note: Auto-seed check finished with:', err.message);
  }
}

if (process.env.NODE_ENV !== 'test') {
  mongoose.connect(MONGO_URI)
    .then(async () => {
      console.log('[Database] MongoDB connected successfully to database');
      await ensureDefaultUsers();
      app.listen(PORT, () => {
        console.log(`[Server] TexPlanning ERP consolidated backend running on port ${PORT}`);
      });
    })
    .catch((err) => {
      console.error('[Database] MongoDB connection error:', err.message);
    });
}

module.exports = app;

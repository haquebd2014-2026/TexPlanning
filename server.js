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
    default: 'User'
  },
  allowedBuyers: {
    type: [String],
    default: []
  },
  permissions: {
    type: [String],
    default: []
  },
  status: {
    type: String,
    default: 'Active'
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

// --- Uploaded File Schema (Permanent storage of binary files & metadata in MongoDB) ---
const uploadedFileSchema = new mongoose.Schema({
  fileName: { type: String, required: true, trim: true },
  category: { type: String, required: true, trim: true, index: true },
  fileSize: { type: Number, default: 0 },
  fileData: { type: String }, // Base64 encoded file buffer for persistent storage
  mimeType: { type: String, default: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  totalRows: { type: Number, default: 0 },
  headers: { type: [String], default: [] },
  uploadedBy: { type: String, default: 'Shimul' }
}, { timestamps: true });

const UploadedFile = mongoose.models.UploadedFile || mongoose.model('UploadedFile', uploadedFileSchema);

// --- Source Data Record Schema (100% preservation of all rows, columns & custom inputs) ---
const sourceDataRecordSchema = new mongoose.Schema({
  fileId: { type: mongoose.Schema.Types.ObjectId, ref: 'UploadedFile', index: true },
  fileName: { type: String, trim: true },
  category: { type: String, required: true, trim: true, index: true },
  sheetName: { type: String, default: 'Sheet1' },
  rowNumber: { type: Number, default: 0 },
  recordId: { type: String, required: true, trim: true, index: true },
  headers: { type: [String], default: [] },
  data: { type: mongoose.Schema.Types.Mixed, default: {} },
  additionalData: { type: mongoose.Schema.Types.Mixed, default: {} },
  updatedBy: { type: String, default: 'Shimul' }
}, { timestamps: true });

sourceDataRecordSchema.index({ category: 1, recordId: 1 });
sourceDataRecordSchema.index({ recordId: 1 });

const SourceDataRecord = mongoose.models.SourceDataRecord || mongoose.model('SourceDataRecord', sourceDataRecordSchema);

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

// POST /api/auth/register & POST /api/auth/users (Admin only)
const handleCreateUser = async (req, res) => {
  try {
    const { username, password, role, allowedBuyers, permissions, status } = req.body;
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
      allowedBuyers: Array.isArray(allowedBuyers) ? allowedBuyers : [],
      permissions: Array.isArray(permissions) ? permissions : (role === 'Admin' ? ['*'] : []),
      status: status || 'Active'
    });

    await newUser.save();

    return res.status(201).json({
      success: true,
      message: 'User created successfully.',
      user: {
        id: newUser._id,
        username: newUser.username,
        role: newUser.role,
        allowedBuyers: newUser.allowedBuyers,
        permissions: newUser.permissions,
        status: newUser.status
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to create user.', error: error.message });
  }
};

app.post('/api/auth/register', authenticateToken, requireAdmin, handleCreateUser);
app.post('/api/auth/users', authenticateToken, requireAdmin, handleCreateUser);

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
      allowedBuyers: user.allowedBuyers,
      permissions: user.permissions || (user.role === 'Admin' ? ['*'] : [])
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
        allowedBuyers: user.allowedBuyers,
        permissions: user.permissions || (user.role === 'Admin' ? ['*'] : [])
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

// PUT /api/auth/users/:id & PUT /api/auth/user/:id (Admin only)
const handleUpdateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { role, allowedBuyers, permissions, status, password } = req.body;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    if (role !== undefined) user.role = role;
    if (allowedBuyers !== undefined) user.allowedBuyers = Array.isArray(allowedBuyers) ? allowedBuyers : [];
    if (permissions !== undefined) user.permissions = Array.isArray(permissions) ? permissions : [];
    if (status !== undefined) user.status = status;
    if (password) user.password = password; // pre-save will hash

    await user.save();

    return res.status(200).json({
      success: true,
      message: 'User updated successfully.',
      user: {
        id: user._id,
        username: user.username,
        role: user.role,
        allowedBuyers: user.allowedBuyers,
        permissions: user.permissions,
        status: user.status
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to update user.', error: error.message });
  }
};

app.put('/api/auth/users/:id', authenticateToken, requireAdmin, handleUpdateUser);
app.put('/api/auth/user/:id', authenticateToken, requireAdmin, handleUpdateUser);

// DELETE /api/auth/users/:id & DELETE /api/auth/user/:id (Admin only)
const handleDeleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    if (req.user && (req.user.id === id || req.user._id === id)) {
      return res.status(400).json({ success: false, message: 'Cannot delete your own active account.' });
    }

    const deleted = await User.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    return res.status(200).json({ success: true, message: `User ${deleted.username} deleted.` });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to delete user.', error: error.message });
  }
};

app.delete('/api/auth/users/:id', authenticateToken, requireAdmin, handleDeleteUser);
app.delete('/api/auth/user/:id', authenticateToken, requireAdmin, handleDeleteUser);

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
// 6B. UNIVERSAL SOURCE DATA PRESERVATION ROUTES
// ==========================================

function optionalAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ')
    ? authHeader.substring(7)
    : authHeader;
  if (!token) return next();
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
  } catch (e) {}
  next();
}

// POST /api/upload/file - Ingest file, store permanently in MongoDB, preserve all rows & dynamic columns
app.post('/api/upload/file', optionalAuth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ success: false, message: 'No file uploaded or file is empty.' });
    }

    const category = req.body.category || 'General Data';
    const uploadedBy = req.user?.username || req.body.uploadedBy || 'Shimul';
    const fileName = req.file.originalname;

    // 1. Parse spreadsheet from memory
    const workbook = xlsx.read(req.file.buffer, {
      type: 'buffer',
      cellDates: true,
      cellNF: false,
      cellText: false
    });

    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
      return res.status(400).json({ success: false, message: 'Uploaded file contains no readable sheets.' });
    }

    const allHeadersSet = new Set();
    const recordsToInsert = [];
    let totalRows = 0;

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) continue;

      const rawRows = xlsx.utils.sheet_to_json(sheet, { defval: '', raw: false });
      if (!rawRows || rawRows.length === 0) continue;

      for (let i = 0; i < rawRows.length; i++) {
        const row = rawRows[i];
        totalRows++;

        const rowHeaders = Object.keys(row);
        rowHeaders.forEach(h => allHeadersSet.add(h));

        // Locate Record ID (e.g. Order No, PO No, Job No, Style, Batch No, or Row index)
        const recordIdVal = row['OrderNo'] || row['Order No'] || row['Booking No.'] || row['Booking No'] || row['Order'] || row['Order Number'] || row['PO No'] || row['PO'] || row['Job No'] || row['Style'] || row['Batch No'] || row['orderno'] || `ROW-${i + 1}`;
        const recordId = String(recordIdVal).trim();

        recordsToInsert.push({
          fileName,
          category,
          sheetName,
          rowNumber: i + 1,
          recordId,
          headers: rowHeaders,
          data: row,
          additionalData: {},
          updatedBy: uploadedBy
        });
      }
    }

    const headersArray = Array.from(allHeadersSet);

    // 2. Save UploadedFile metadata
    const newFileDoc = new UploadedFile({
      fileName,
      category,
      fileSize: req.file.size,
      mimeType: req.file.mimetype || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      totalRows,
      headers: headersArray,
      uploadedBy
    });
    await newFileDoc.save();

    // 3. Attach fileId to each record and save to SourceDataRecord
    if (recordsToInsert.length > 0) {
      recordsToInsert.forEach(r => { r.fileId = newFileDoc._id; });
      await SourceDataRecord.insertMany(recordsToInsert, { ordered: false });
    }

    // 4. Also perform UnifiedOrder upsert if applicable
    try {
      const orderEntries = {};
      for (const rec of recordsToInsert) {
        const r = rec.data;
        const oNo = rec.recordId;
        if (!oNo || oNo.startsWith('ROW-')) continue;
        const buyer = r['Buyer'] || r['buyer'] || r['Customer'] || 'Unknown Buyer';
        const style = r['Style'] || r['style'] || '';
        if (!orderEntries[oNo]) {
          orderEntries[oNo] = {
            orderNo: oNo,
            buyer,
            style,
            overallStatus: 'In Progress',
            totalOrderQty: Number(r['Order Qty'] || r['totalorderqty'] || 0) || 0
          };
        }
      }
      const orderList = Object.values(orderEntries);
      if (orderList.length > 0) {
        const ops = orderList.map(o => ({
          updateOne: {
            filter: { orderNo: o.orderNo },
            update: { $set: o },
            upsert: true
          }
        }));
        await UnifiedOrder.bulkWrite(ops, { ordered: false });
      }
    } catch (upsertErr) {
      console.warn('Note: UnifiedOrder sync warning:', upsertErr.message);
    }

    return res.status(200).json({
      success: true,
      message: `File "${fileName}" and all ${totalRows} data rows preserved successfully in MongoDB.`,
      file: {
        id: newFileDoc._id,
        fileName: newFileDoc.fileName,
        category: newFileDoc.category,
        fileSize: newFileDoc.fileSize,
        uploadedBy: newFileDoc.uploadedBy,
        totalRows,
        headers: headersArray,
        createdAt: newFileDoc.createdAt
      }
    });
  } catch (error) {
    console.error('Upload error:', error);
    return res.status(500).json({ success: false, message: 'Failed to process and preserve file.', error: error.message });
  }
});

// GET /api/upload/files - List preserved files
app.get('/api/upload/files', async (req, res) => {
  try {
    const { category } = req.query;
    const filter = {};
    if (category) {
      filter.category = new RegExp(category.trim(), 'i');
    }
    const files = await UploadedFile.find(filter).select('-fileData').sort({ createdAt: -1 });
    return res.status(200).json({ success: true, count: files.length, files });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to retrieve uploaded files.', error: error.message });
  }
});

// File download option has been permanently disabled for security
app.get('/api/upload/files/:id/download', (req, res) => {
  return res.status(403).json({
    success: false,
    message: 'File download is strictly disabled for security.'
  });
});

// DELETE /api/upload/files/:id - Delete file and all its preserved data rows
app.delete('/api/upload/files/:id', optionalAuth, async (req, res) => {
  try {
    const fileDoc = await UploadedFile.findByIdAndDelete(req.params.id);
    if (!fileDoc) {
      return res.status(404).json({ success: false, message: 'File not found.' });
    }
    const deletedRecords = await SourceDataRecord.deleteMany({ fileId: req.params.id });
    return res.status(200).json({
      success: true,
      message: `File "${fileDoc.fileName}" and ${deletedRecords.deletedCount} preserved rows deleted successfully.`
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to delete file.', error: error.message });
  }
});

// GET /api/data/columns - Distinct column headings by category or system-wide
app.get('/api/data/columns', async (req, res) => {
  try {
    const { category } = req.query;
    const filter = category ? { category: new RegExp(category.trim(), 'i') } : {};
    const sampleDocs = await SourceDataRecord.find(filter).select('headers').limit(100);
    const colSet = new Set();
    sampleDocs.forEach(d => (d.headers || []).forEach(h => colSet.add(h)));
    return res.status(200).json({ success: true, columns: Array.from(colSet) });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to retrieve columns.', error: error.message });
  }
});

// GET /api/data/records - Query preserved rows by ID, column, search, category
app.get('/api/data/records', async (req, res) => {
  try {
    const { category, recordId, fileId, search, column, value } = req.query;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.max(1, Math.min(200, parseInt(req.query.limit, 10) || 50));
    const skip = (page - 1) * limit;

    const filter = {};
    if (category) filter.category = new RegExp(category.trim(), 'i');
    if (recordId) filter.recordId = new RegExp(recordId.trim(), 'i');
    if (fileId) filter.fileId = fileId;
    if (column && value) {
      filter[`data.${column}`] = new RegExp(value.trim(), 'i');
    }
    if (search) {
      filter.$or = [
        { recordId: new RegExp(search.trim(), 'i') },
        { fileName: new RegExp(search.trim(), 'i') }
      ];
    }

    const total = await SourceDataRecord.countDocuments(filter);
    const records = await SourceDataRecord.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    return res.status(200).json({
      success: true,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
      records
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to query preserved records.', error: error.message });
  }
});

// PUT /api/data/records/:recordId/additional - Attach user custom inputs against ID / column header
app.put('/api/data/records/:recordId/additional', optionalAuth, async (req, res) => {
  try {
    const { recordId } = req.params;
    const { additionalData, field, value, category } = req.body;
    const updatedBy = req.user?.username || req.body.updatedBy || 'Shimul';

    const filter = { recordId };
    if (category) filter.category = new RegExp(category.trim(), 'i');

    const updateFields = { updatedBy, updatedAt: new Date() };

    if (additionalData && typeof additionalData === 'object') {
      for (const [k, v] of Object.entries(additionalData)) {
        updateFields[`additionalData.${k}`] = v;
      }
    } else if (field && value !== undefined) {
      updateFields[`additionalData.${field}`] = value;
    }

    const result = await SourceDataRecord.updateMany(filter, { $set: updateFields });
    if (result.matchedCount === 0) {
      return res.status(404).json({ success: false, message: `No record found with ID "${recordId}".` });
    }

    return res.status(200).json({
      success: true,
      message: `Additional data saved for Record ID "${recordId}".`,
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to update additional data.', error: error.message });
  }
});

// PUT & POST /api/orders/plan-manage/:orderNoOrId - Save General Info, Knitting Plan, Dyeing Plan, Delivery Plan
const handleSavePlanManage = async (req, res) => {
  try {
    const { orderNoOrId } = req.params;
    const { generalInfo, knittingPlan, dyeingPlan, deliveryPlan, orderStatus } = req.body;

    let query = {};
    if (mongoose.Types.ObjectId.isValid(orderNoOrId)) {
      query = { _id: orderNoOrId };
    } else {
      query = {
        $or: [
          { recordId: orderNoOrId },
          { 'data.OrderNo': orderNoOrId },
          { 'data.Order No': orderNoOrId },
          { 'data.Booking No.': orderNoOrId },
          { 'data.Booking No': orderNoOrId }
        ]
      };
    }

    const rec = await SourceDataRecord.findOne(query);
    if (!rec) {
      return res.status(404).json({ success: false, message: `Order record not found for "${orderNoOrId}".` });
    }

    if (!rec.additionalData) rec.additionalData = {};
    if (generalInfo !== undefined) rec.additionalData.generalInfo = generalInfo;
    if (knittingPlan !== undefined) rec.additionalData.knittingPlan = Array.isArray(knittingPlan) ? knittingPlan : [];
    if (dyeingPlan !== undefined) rec.additionalData.dyeingPlan = Array.isArray(dyeingPlan) ? dyeingPlan : [];
    if (deliveryPlan !== undefined) rec.additionalData.deliveryPlan = Array.isArray(deliveryPlan) ? deliveryPlan : [];
    if (orderStatus !== undefined) rec.additionalData.orderStatus = orderStatus;
    if (generalInfo && generalInfo.orderStatus) rec.additionalData.orderStatus = generalInfo.orderStatus;

    rec.markModified('additionalData');
    await rec.save();

    const orderNo = generalInfo?.bookingNo || generalInfo?.ewoNo || rec.data?.OrderNo || rec.data?.['Order No'] || rec.recordId;
    if (orderNo) {
      const uOrder = await UnifiedOrder.findOne({ orderNo });
      if (uOrder) {
        if (generalInfo?.orderStatus) uOrder.overallStatus = generalInfo.orderStatus;
        if (knittingPlan) uOrder.knittingPlan = knittingPlan;
        if (dyeingPlan) uOrder.dyeingPlan = dyeingPlan;
        if (deliveryPlan) uOrder.deliveryPlan = deliveryPlan;
        await uOrder.save();
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Plan data saved successfully.',
      data: {
        id: rec._id,
        recordId: rec.recordId,
        additionalData: rec.additionalData
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to save plan data.', error: error.message });
  }
};

app.put('/api/orders/plan-manage/:orderNoOrId', optionalAuth, handleSavePlanManage);
app.post('/api/orders/plan-manage/:orderNoOrId', optionalAuth, handleSavePlanManage);

// GET /api/orders/plan-manage/:orderNoOrId - Retrieve plan details and matching uploaded items from Knitting, Dyeing, Delivery Plan files
app.get('/api/orders/plan-manage/:orderNoOrId', optionalAuth, async (req, res) => {
  try {
    const { orderNoOrId } = req.params;
    const cleanId = String(orderNoOrId).trim();

    let query = {};
    if (mongoose.Types.ObjectId.isValid(cleanId)) {
      query = { _id: cleanId };
    } else {
      query = {
        $or: [
          { recordId: cleanId },
          { 'data.OrderNo': cleanId },
          { 'data.Order No': cleanId },
          { 'data.Booking No.': cleanId },
          { 'data.Booking No': cleanId }
        ]
      };
    }

    const rec = await SourceDataRecord.findOne(query);
    const orderNo = rec?.data?.OrderNo || rec?.data?.['Order No'] || rec?.data?.['Booking No.'] || rec?.data?.['Booking No'] || rec?.recordId || cleanId;

    const orderFilter = {
      $or: [
        { recordId: String(orderNo).trim() },
        { 'data.OrderNo': String(orderNo).trim() },
        { 'data.Order No': String(orderNo).trim() },
        { 'data.Booking No.': String(orderNo).trim() },
        { 'data.Booking No': String(orderNo).trim() }
      ]
    };

    const [knittingRecords, dyeingRecords, deliveryRecords] = await Promise.all([
      SourceDataRecord.find({
        category: /knitting\s*plan/i,
        ...orderFilter
      }).sort({ rowNumber: 1 }),
      SourceDataRecord.find({
        category: /dyeing\s*plan/i,
        ...orderFilter
      }).sort({ rowNumber: 1 }),
      SourceDataRecord.find({
        category: /delivery\s*plan/i,
        ...orderFilter
      }).sort({ rowNumber: 1 })
    ]);

    return res.status(200).json({
      success: true,
      orderNo,
      additionalData: rec?.additionalData || {},
      fullData: rec?.data || {},
      knittingItems: knittingRecords.map(r => r.data || {}),
      dyeingItems: dyeingRecords.map(r => r.data || {}),
      deliveryItems: deliveryRecords.map(r => r.data || {})
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to retrieve order plan items.', error: error.message });
  }
});

// GET /api/orders/plan-view - Dynamic Solid Plan & YD Plan order list strictly from uploaded files
app.get('/api/orders/plan-view', async (req, res) => {
  try {
    const { planType } = req.query;
    const isYD = planType && planType.toLowerCase().includes('yd');
    const categoryPattern = isYD ? /yd\s*plan/i : /general/i;

    // 1. Fetch only real records from SourceDataRecord that belong to an uploaded file
    const records = await SourceDataRecord.find({
      category: categoryPattern,
      fileId: { $exists: true, $ne: null }
    }).sort({ createdAt: -1 });

    // 2. Extract distinct buyers and format orders strictly from uploaded data
    const buyerSet = new Set();
    const ordersList = [];

    records.forEach((rec) => {
      const d = rec.data || {};
      
      const b = String(d['Buyer'] || d['buyer'] || d['Customer'] || d['BUYER'] || '').trim();
      if (b) buyerSet.add(b);

      const orderNo = String(
        d['OrderNo'] ||
        d['Order No'] ||
        d['Booking No.'] ||
        d['Booking No'] ||
        d['Order'] ||
        d['Order Number'] ||
        d['PO No'] ||
        d['PO'] ||
        d['Job No'] ||
        d['orderno'] ||
        (rec.recordId && !rec.recordId.startsWith('ROW-') ? rec.recordId : '') ||
        ''
      ).trim();

      const bookingDateRaw = d['BookingReceiveDate'] ||
        d['YD Booking Date'] ||
        d['Booking Date'] ||
        d['BookingDate'] ||
        d['Order Date'] ||
        d['bookingdate'] ||
        '';
      const bookingDate = bookingDateRaw ? String(bookingDateRaw).trim() : '';

      const buyerTeam = String(
        d['Buyer Team'] ||
        d['BuyerTeam'] ||
        d['buyer team'] ||
        d['Team'] ||
        d['Booking Type'] ||
        d['Style'] ||
        ''
      ).trim();

      // All orders in Pending list; remove all from Confirm list per user requirement
      const orderStatus = 'Pending';

      const statusDetail = d['Status'] ||
        d['Remarks'] ||
        d['remarks'] ||
        (d['RequiredQtyKgs'] ? `Req: ${d['RequiredQtyKgs']} kg` : '') ||
        (d['YD REQ.'] ? `YD Req: ${d['YD REQ.']}, Dyed: ${d['DYED'] || 0}` : '') ||
        'Null';

      if (orderNo) {
        ordersList.push({
          id: rec._id,
          orderNo,
          bookingDate,
          buyer: b,
          buyerTeam,
          status: orderStatus,
          statusDetail,
          fullData: d,
          additionalData: rec.additionalData || {}
        });
      }
    });

    return res.status(200).json({
      success: true,
      planType: isYD ? 'YD Plan' : 'Solid Plan',
      totalOrders: ordersList.length,
      buyers: Array.from(buyerSet).sort(),
      orders: ordersList
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to fetch plan view data.', error: err.message });
  }
});

// POST /api/upload/clean-dummy-data - Clean out any unlinked or dummy data
app.post('/api/upload/clean-dummy-data', async (req, res) => {
  try {
    const r1 = await SourceDataRecord.deleteMany({ $or: [{ fileId: { $exists: false } }, { fileId: null }] });
    const r2 = await UnifiedOrder.deleteMany({ orderNo: { $regex: /^ORD-2026-00[1-5]$/ } });
    return res.status(200).json({ success: true, message: 'Dummy data removed.', deletedSourceRecords: r1.deletedCount, deletedUnified: r2.deletedCount });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to clean dummy data.', error: err.message });
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

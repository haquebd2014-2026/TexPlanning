const mongoose = require('mongoose');

const fabricItemSchema = new mongoose.Schema({
  color: {
    type: String,
    trim: true,
    default: ''
  },
  fabricConstruction: {
    type: String,
    trim: true,
    default: ''
  },
  gsm: {
    type: String,
    trim: true,
    default: ''
  },
  allocatedQty: {
    type: Number,
    default: 0
  },

  // Knitting tracking fields per item
  yarnInhouseDate: {
    type: Date,
    default: null
  },
  knitStartDate: {
    type: Date,
    default: null
  },
  knitEndDate: {
    type: Date,
    default: null
  },
  knitQty: {
    type: Number,
    default: 0
  },

  // Dyeing tracking fields per item
  dyeingUnit: {
    type: String,
    trim: true,
    default: ''
  },
  processName: {
    type: String,
    trim: true,
    default: ''
  },
  dyeStartDate: {
    type: Date,
    default: null
  },
  dyeEndDate: {
    type: Date,
    default: null
  },
  dyeQty: {
    type: Number,
    default: 0
  },

  // Delivery tracking fields per item
  deliveryTargetDate: {
    type: Date,
    default: null
  },
  deliveredQty: {
    type: Number,
    default: 0
  },
  balanceQty: {
    type: Number,
    default: 0
  },
  failReason: {
    type: String,
    trim: true,
    default: ''
  },
  relatedDept: {
    type: String,
    trim: true,
    default: ''
  }
}, { _id: true, timestamps: true });

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

const dyeingPlanItemSchema = new mongoose.Schema({
  color: { type: String, trim: true, default: '' },
  dyeingUnit: { type: String, trim: true, default: '' },
  processName: { type: String, trim: true, default: '' },
  dyeStartDate: { type: Date, default: null },
  dyeEndDate: { type: Date, default: null },
  dyeQty: { type: Number, default: 0 },
  status: { type: String, default: 'Pending' }
}, { _id: true, timestamps: true });

const deliveryPlanItemSchema = new mongoose.Schema({
  color: { type: String, trim: true, default: '' },
  deliveryTargetDate: { type: Date, default: null },
  deliveredQty: { type: Number, default: 0 },
  balanceQty: { type: Number, default: 0 },
  failReason: { type: String, trim: true, default: '' },
  relatedDept: { type: String, trim: true, default: '' },
  status: { type: String, default: 'Pending' }
}, { _id: true, timestamps: true });

const unifiedOrderSchema = new mongoose.Schema({
  // Order metadata
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

  // Structured Sections
  generalInfo: {
    type: generalInfoSchema,
    default: () => ({})
  },
  knittingPlan: [knittingPlanItemSchema],
  dyeingPlan: [dyeingPlanItemSchema],
  deliveryPlan: [deliveryPlanItemSchema],

  // Synchronized fabric items list (Module 1)
  fabricItems: [fabricItemSchema]
}, {
  timestamps: true
});

// Automatic calculation of balance quantity before saving delivery item
deliveryPlanItemSchema.pre('save', function (next) {
  if (this.allocatedQty !== undefined && this.deliveredQty !== undefined) {
    this.balanceQty = Math.max(0, this.allocatedQty - this.deliveredQty);
  }
  next();
});

// Pre-save hook on UnifiedOrder to ensure sync between generalInfo and top-level fields
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

const UnifiedOrder = mongoose.model('UnifiedOrder', unifiedOrderSchema);

module.exports = UnifiedOrder;

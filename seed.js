const mongoose = require('mongoose');
require('dotenv').config();

const User = require('../models/User');
const UnifiedOrder = require('../models/UnifiedOrder');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/texplanning';

async function seedDatabase() {
  console.log('[Seed] Connecting to MongoDB...');
  await mongoose.connect(MONGO_URI);
  console.log(`[Seed] Connected to ${MONGO_URI}`);

  // 1. Seed Default Users
  console.log('[Seed] Seeding default users...');

  // Admin user
  const existingAdmin = await User.findOne({ username: 'admin' });
  if (!existingAdmin) {
    const admin = new User({
      username: 'admin',
      password: 'AdminPassword123!', // Pre-save hook will hash this with salt factor 10
      role: 'Admin',
      allowedBuyers: []
    });
    await admin.save();
    console.log(' -> Created default Admin user: "admin" / "AdminPassword123!"');
  } else {
    console.log(' -> Admin user already exists.');
  }

  // Operator / Planner user
  const existingPlanner = await User.findOne({ username: 'planner' });
  if (!existingPlanner) {
    const planner = new User({
      username: 'planner',
      password: 'PlannerPassword123!',
      role: 'User',
      allowedBuyers: ['H&M', 'Zara', 'Next']
    });
    await planner.save();
    console.log(' -> Created Planner user: "planner" / "PlannerPassword123!" (Buyers: H&M, Zara, Next)');
  } else {
    console.log(' -> Planner user already exists.');
  }

  // 2. Seed Sample Production Orders
  console.log('[Seed] Seeding sample production orders...');
  const sampleOrders = [
    {
      orderNo: 'ORD-2026-001',
      buyer: 'H&M',
      style: 'HM-POLO-88',
      season: 'Autumn 2026',
      bookingDate: new Date('2026-08-01'),
      totalOrderQty: 5000,
      firstShipDate: new Date('2026-10-10'),
      lastShipDate: new Date('2026-10-15'),
      fabricNotes: '26s Combed Cotton, Soft Finish',
      overallStatus: 'Completed',
      status: 'Completed',
      generalInfo: {
        buyer: 'H&M',
        style: 'HM-POLO-88',
        season: 'Autumn 2026',
        bookingDate: new Date('2026-08-01'),
        totalOrderQty: 5000,
        firstShipDate: new Date('2026-10-10'),
        lastShipDate: new Date('2026-10-15'),
        fabricNotes: '26s Combed Cotton, Soft Finish'
      },
      knittingPlan: [{
        color: 'Navy Blue',
        fabricConstruction: 'Single Jersey 100% Cotton',
        gsm: '180',
        allocatedQty: 5000,
        yarnInhouseDate: new Date('2026-08-10'),
        knitStartDate: new Date('2026-08-15'),
        knitEndDate: new Date('2026-08-28'),
        knitQty: 5200,
        status: 'Completed'
      }],
      dyeingPlan: [{
        color: 'Navy Blue',
        dyeingUnit: 'Unit-1 (High-Temp)',
        processName: 'Reactive Dyeing',
        dyeStartDate: new Date('2026-09-01'),
        dyeEndDate: new Date('2026-09-12'),
        dyeQty: 5150,
        status: 'Completed'
      }],
      deliveryPlan: [{
        color: 'Navy Blue',
        deliveryTargetDate: new Date('2026-10-15'),
        deliveredQty: 5000,
        balanceQty: 0,
        failReason: '',
        relatedDept: '',
        status: 'Completed'
      }]
    },
    {
      orderNo: 'ORD-2026-002',
      buyer: 'Zara',
      style: 'ZR-TEE-09',
      season: 'Autumn 2026',
      bookingDate: new Date('2026-08-05'),
      totalOrderQty: 3500,
      firstShipDate: new Date('2026-10-18'),
      lastShipDate: new Date('2026-10-22'),
      fabricNotes: '30s Compact 95/5 Cotton Spandex',
      overallStatus: 'In Progress',
      status: 'In Progress',
      generalInfo: {
        buyer: 'Zara',
        style: 'ZR-TEE-09',
        season: 'Autumn 2026',
        bookingDate: new Date('2026-08-05'),
        totalOrderQty: 3500,
        firstShipDate: new Date('2026-10-18'),
        lastShipDate: new Date('2026-10-22'),
        fabricNotes: '30s Compact 95/5 Cotton Spandex'
      },
      knittingPlan: [{
        color: 'Olive Green',
        fabricConstruction: '1x1 Rib 95/5 Cotton Spandex',
        gsm: '210',
        allocatedQty: 3500,
        yarnInhouseDate: new Date('2026-08-12'),
        knitStartDate: new Date('2026-08-20'),
        knitEndDate: new Date('2026-09-02'),
        knitQty: 3600,
        status: 'Completed'
      }],
      dyeingPlan: [{
        color: 'Olive Green',
        dyeingUnit: 'Unit-2 (Soft Flow)',
        processName: 'Reactive Dyeing + Silicon Finish',
        dyeStartDate: new Date('2026-09-10'),
        dyeEndDate: new Date('2026-09-24'),
        dyeQty: 3400,
        status: 'In Progress'
      }],
      deliveryPlan: [{
        color: 'Olive Green',
        deliveryTargetDate: new Date('2026-10-22'),
        deliveredQty: 2500,
        balanceQty: 1000,
        failReason: '',
        relatedDept: '',
        status: 'In Progress'
      }]
    },
    {
      orderNo: 'ORD-2026-003',
      buyer: 'Target',
      style: 'TG-HOODIE-21',
      season: 'Winter 2026',
      bookingDate: new Date('2026-08-15'),
      totalOrderQty: 8000,
      firstShipDate: new Date('2026-11-01'),
      lastShipDate: new Date('2026-11-05'),
      fabricNotes: 'Fleece 80/20 Cotton Poly, Brushed Back',
      overallStatus: 'In Progress',
      status: 'In Progress',
      generalInfo: {
        buyer: 'Target',
        style: 'TG-HOODIE-21',
        season: 'Winter 2026',
        bookingDate: new Date('2026-08-15'),
        totalOrderQty: 8000,
        firstShipDate: new Date('2026-11-01'),
        lastShipDate: new Date('2026-11-05'),
        fabricNotes: 'Fleece 80/20 Cotton Poly, Brushed Back'
      },
      knittingPlan: [{
        color: 'Heather Grey',
        fabricConstruction: 'Fleece 80/20 Cotton Poly',
        gsm: '280',
        allocatedQty: 8000,
        yarnInhouseDate: new Date('2026-08-25'),
        knitStartDate: new Date('2026-09-01'),
        knitEndDate: new Date('2026-09-20'),
        knitQty: 7500,
        status: 'In Progress'
      }],
      dyeingPlan: [{
        color: 'Heather Grey',
        dyeingUnit: 'Unit-3',
        processName: 'Disperse/Reactive Cross Dyeing',
        dyeStartDate: new Date('2026-09-18'),
        dyeEndDate: new Date('2026-10-02'),
        dyeQty: 6000,
        status: 'In Progress'
      }],
      deliveryPlan: [{
        color: 'Heather Grey',
        deliveryTargetDate: new Date('2026-11-05'),
        deliveredQty: 4200,
        balanceQty: 3800,
        failReason: '',
        relatedDept: '',
        status: 'In Progress'
      }]
    }
  ];

  for (const orderData of sampleOrders) {
    await UnifiedOrder.findOneAndUpdate(
      { orderNo: orderData.orderNo },
      { $set: orderData },
      { upsert: true, new: true }
    );
    console.log(` -> Seeded order: ${orderData.orderNo} (${orderData.buyer} - ${orderData.style})`);
  }

  console.log('\n[Seed] Database seed completed successfully!');
  await mongoose.disconnect();
  process.exit(0);
}

seedDatabase().catch((err) => {
  console.error('[Seed Error]:', err);
  process.exit(1);
});

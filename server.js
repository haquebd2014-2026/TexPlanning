const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const uploadRoutes = require('./routes/upload');
const ordersRoutes = require('./routes/orders');

const app = express();
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/texplanning';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve frontend static assets from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Static file serving for uploads directory (if needed)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/orders', ordersRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'online',
    system: 'Unified Textile ERP',
    modules: [
      'Module 1 - Backend Core & Security Hardening',
      'Module 2 - Consolidated Planning & Excel Pipeline',
      'Module 3 - Unified Single-Screen Planning Frontend'
    ],
    timestamp: new Date()
  });
});

// Root route fallback to index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Global 404 handler for API routes
app.use((req, res, next) => {
  res.status(404).json({
    success: false,
    message: `Endpoint not found: ${req.method} ${req.originalUrl}`
  });
});

// Centralized error handler
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error'
  });
});

// Database connection & Server bootstrap
if (process.env.NODE_ENV !== 'test') {
  mongoose.connect(MONGO_URI)
    .then(() => {
      console.log(`[Database] MongoDB connected successfully to ${MONGO_URI}`);
      app.listen(PORT, () => {
        console.log(`[Server] TexPlanning ERP backend running on port ${PORT}`);
      });
    })
    .catch((err) => {
      console.error('[Database] MongoDB connection error:', err.message);
    });
}

module.exports = app;

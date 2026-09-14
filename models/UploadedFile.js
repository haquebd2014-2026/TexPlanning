const mongoose = require('mongoose');

const uploadedFileSchema = new mongoose.Schema({
  fileName: {
    type: String,
    required: [true, 'File name is required'],
    trim: true
  },
  category: {
    type: String,
    required: [true, 'Category is required'],
    trim: true,
    index: true
  },
  fileSize: {
    type: Number,
    default: 0
  },
  fileData: {
    type: String // Base64 encoded file buffer for persistent storage
  },
  mimeType: {
    type: String,
    default: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  },
  totalRows: {
    type: Number,
    default: 0
  },
  headers: {
    type: [String],
    default: []
  },
  uploadedBy: {
    type: String,
    default: 'Shimul'
  }
}, {
  timestamps: true
});

module.exports = mongoose.models.UploadedFile || mongoose.model('UploadedFile', uploadedFileSchema);

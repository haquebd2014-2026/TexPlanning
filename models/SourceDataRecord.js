const mongoose = require('mongoose');

const sourceDataRecordSchema = new mongoose.Schema({
  fileId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'UploadedFile',
    index: true
  },
  fileName: {
    type: String,
    trim: true
  },
  category: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  sheetName: {
    type: String,
    default: 'Sheet1'
  },
  rowNumber: {
    type: Number,
    default: 0
  },
  recordId: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  headers: {
    type: [String],
    default: []
  },
  data: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  additionalData: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  updatedBy: {
    type: String,
    default: 'Shimul'
  }
}, {
  timestamps: true
});

sourceDataRecordSchema.index({ category: 1, recordId: 1 });
sourceDataRecordSchema.index({ recordId: 1 });

module.exports = mongoose.models.SourceDataRecord || mongoose.model('SourceDataRecord', sourceDataRecordSchema);

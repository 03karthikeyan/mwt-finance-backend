const mongoose = require('mongoose');
const { DocumentType } = require('../constants/enums');

const documentSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      default: null,
      index: true,
    },
    uploadedById: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    documentType: {
      type: String,
      enum: Object.values(DocumentType),
      default: DocumentType.OTHER,
    },
    fileUrl: {
      type: String,
      required: true,
    },
    fileType: {
      type: String,
      default: '',
    },
    fileSize: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

documentSchema.index({ companyId: 1, customerId: 1 });

module.exports = mongoose.model('Document', documentSchema);

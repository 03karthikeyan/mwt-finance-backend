const multer = require('multer');
const path = require('path');
const fs = require('fs');
const environment = require('../config/environment');
const ApiError = require('../utils/apiError');

// Ensure upload directory exists
const uploadDir = path.resolve(environment.upload.dir);
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowedExtensions = ['.jpg', '.jpeg', '.png', '.pdf', '.doc', '.docx', '.csv', '.xlsx'];
  const ext = path.extname(file.originalname).toLowerCase();
  
  if (allowedExtensions.includes(ext)) {
    cb(null, true);
  } else {
    cb(ApiError.badRequest(`Unsupported file format. Allowed formats: ${allowedExtensions.join(', ')}`), false);
  }
};

const upload = multer({
  storage,
  limits: {
    fileSize: environment.upload.maxSizeMB * 1024 * 1024,
  },
  fileFilter,
});

module.exports = upload;

const fs = require("fs");
const path = require("path");
const multer = require("multer");

const uploadDir = path.join(__dirname, "..", "public", "uploads", "events");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

function sanitiseFilename(name) {
  const base = path.basename(name || "event-image").toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return base || "event-image";
}

function buildUploadFilename(file) {
  const ext = path.extname(file.originalname || "").toLowerCase();
  const baseName = sanitiseFilename(path.basename(file.originalname || "event-image", ext));
  const stamp = Date.now();
  return `${baseName}-${stamp}${ext}`;
}

const storage = multer.diskStorage({
  destination: function (_req, _file, cb) {
    cb(null, uploadDir);
  },
  filename: function (_req, file, cb) {
    cb(null, buildUploadFilename(file));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024
  }
});

function toPublicImagePath(file) {
  return file && file.filename ? "/uploads/events/" + file.filename : null;
}

module.exports = {
  upload,
  buildUploadFilename,
  toPublicImagePath
};

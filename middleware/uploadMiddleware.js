const fs = require('fs');
const multer = require('multer');
const path = require('path');

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => {
    const directory = path.join(process.cwd(), 'uploads', 'enrollment');
    fs.mkdirSync(directory, { recursive: true });
    callback(null, directory);
  },
  filename: (_req, file, callback) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    callback(null, `${Date.now()}-${safeName}`);
  },
});

module.exports = multer({
  storage,
  limits: {
    fileSize: 8 * 1024 * 1024,
  },
});

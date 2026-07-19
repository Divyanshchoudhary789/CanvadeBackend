const multer = require("multer");

const storage = multer.memoryStorage();

module.exports = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, 
});
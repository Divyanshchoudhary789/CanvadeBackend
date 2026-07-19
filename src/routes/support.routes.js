const express = require("express");
const { sendContactMessage } = require("../controllers/support/contact.controller");
const authMiddleware = require("../middleware/auth");

const router = express.Router();

router.post("/contact", authMiddleware, sendContactMessage);

module.exports = router;

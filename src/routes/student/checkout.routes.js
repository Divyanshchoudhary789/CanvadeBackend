const express = require("express");
const checkoutController = require("../../controllers/student/checkout.controller");
const authMiddleware = require("../../middleware/auth");

const router = express.Router();

router.post("/create", authMiddleware, checkoutController.createCheckout);
router.post("/confirm", authMiddleware, checkoutController.confirmCheckout);
router.get("/:checkoutId", authMiddleware, checkoutController.getCheckoutById);

module.exports = router;
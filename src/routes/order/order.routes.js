const express = require("express");
const {createOrder, verifyPayment, checkPendingPayment, getPaymentHistory} = require("../../controllers/order/order.controller");
const auth = require("../../middleware/auth");
const router = express.Router();

router.post("/create-order", auth, createOrder);
router.post("/verify-payment", auth, verifyPayment);
router.get("/get-pending", auth, checkPendingPayment);
router.get("/get-payment-history", auth, getPaymentHistory);
module.exports = router;


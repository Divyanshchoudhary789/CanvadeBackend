const express = require("express");
const { createPlanOrder, verifyPlanPayment, getMyPlan } = require("../../controllers/plan/plan.controller");
const auth = require("../../middleware/auth");
const router = express.Router();

router.post("/create-order", auth, createPlanOrder);
router.post("/verify-payment", auth, verifyPlanPayment);
router.get("/me", auth, getMyPlan);

module.exports = router;

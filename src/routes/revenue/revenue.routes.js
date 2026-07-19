const express = require("express");
const revenueController = require("../../controllers/revenue/revenue.controller");
const authMiddleware = require("../../middleware/auth");
const router = express.Router();

router.get(
  "/dashboard",
  authMiddleware,
  revenueController.getRevenueDashboard
);

module.exports = router;
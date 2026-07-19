const express = require("express");
const activityController = require("../../controllers/activity/activity.controller");
const authMiddleware = require("../../middleware/auth");
const router = express.Router();


router.get(
  "/my",
  authMiddleware,
  activityController.getMyActivities
);

module.exports = router;
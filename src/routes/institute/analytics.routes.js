const express = require("express");
const router = express.Router();

const authMiddleWare = require("../../middleware/auth");

const {
  getEnrollmentAnalytics,
  getRevenueAnalytics,
  getCourseStatusAnalytics,
  getLocationAnalytics,
  getViewAnalytics,
  getViewCount,
} = require("../../controllers/institute/analytics.controller");

router.get("/views", authMiddleWare, getViewCount);
router.get("/enrollments", authMiddleWare, getEnrollmentAnalytics);
router.get("/revenue", authMiddleWare, getRevenueAnalytics);
router.get("/course-status", authMiddleWare, getCourseStatusAnalytics);
router.get("/locations", authMiddleWare, getLocationAnalytics);

// Was previously also mapped to "/views", which meant this handler could
// never run — Express stops at the first matching route.
router.get("/views/trend", authMiddleWare, getViewAnalytics);

module.exports = router;
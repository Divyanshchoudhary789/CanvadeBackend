const express = require("express");
const router = express.Router();
const authMiddleWare = require("../../middleware/auth");
const {
  addCourseReview, getCourseReviews, getReviewsForCourse} = require("../../controllers/institute/courseReview.controller");

router.post("/:courseId", authMiddleWare, addCourseReview);
router.get("/get", authMiddleWare, getCourseReviews);
router.get("/get/:courseId", getReviewsForCourse);
module.exports = router;
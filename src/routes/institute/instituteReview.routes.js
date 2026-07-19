const express = require("express");
const router = express.Router();
const authMiddleWare = require("../../middleware/auth");
const {
  addInstituteReview,
  getInstituteReviews,
  getReviewsForInstitute
} = require("../../controllers/institute/instituteReview.controller");

router.post("/:instituteId", authMiddleWare, addInstituteReview);
router.get("/get", authMiddleWare, getInstituteReviews);
router.get("/get/:instituteId",  getReviewsForInstitute);

module.exports = router;
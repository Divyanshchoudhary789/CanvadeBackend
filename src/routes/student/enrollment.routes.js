const express = require("express");
const enrollmentController = require("../../controllers/student/enrolment.controller");
const authMiddleware = require("../../middleware/auth");
const router = express.Router();

router.get("/enroll", authMiddleware, enrollmentController.getMyEnrollments);
router.get("/get-students", authMiddleware, enrollmentController.getInstituteEnrollments);
module.exports = router;
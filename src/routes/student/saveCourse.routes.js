const express = require("express");
const saveCourseController = require("../../controllers/student/saveCourse.controller");
const authMiddleware = require("../../middleware/auth");
const router = express.Router();

router.post("/save", authMiddleware, saveCourseController.saveCourse);
router.get("/my-saved-courses", authMiddleware, saveCourseController.getMySavedCourses);
router.delete("/remove/:courseId", authMiddleware, saveCourseController.removeSavedCourse);
router.get("/is-saved/:courseId", authMiddleware, saveCourseController.isCourseSaved);

module.exports = router;
const express = require("express");
const upload = require("../../middleware/upload");
const authMiddleWare = require("../../middleware/auth");
const router = express.Router();

const {
  createCourse,
  getMyCourses,
  getAllCourses,
  getCourseById,
  updateCourse,
  updateCourseStatus,
  updateCourseSeats,
  deleteCourse,
  getAllActiveCourses,
  getAllInactiveCourses,
  getAllDeletedCourses,
  restoreCourse,
  softDeleteCourse,
  incrementCourseView,
  getMyStudents,
  getCourseFaculties,
  getCourseBatches
} = require("../../controllers/institute/course.controller");
const uploadCourseFiles = upload.fields([
  { name: "thumbnail", maxCount: 1 },
  { name: "images", maxCount: 5 },
  { name: "video", maxCount: 1 },
  { name: "documents", maxCount: 10 },
  { name: "materials", maxCount: 10 },
]);

router.post("/create", authMiddleWare, uploadCourseFiles, createCourse);

router.get("/my-courses", authMiddleWare, getMyCourses);
router.get("/", getAllCourses);
router.patch(
  "/update/:courseId",
  authMiddleWare,
  uploadCourseFiles,
  updateCourse,
);
router.delete("/delete/:courseId", authMiddleWare, deleteCourse);
router.patch("/:courseId/soft-delete", authMiddleWare, softDeleteCourse);
router.get("/active", getAllActiveCourses);
router.patch("/status/:courseId", authMiddleWare, updateCourseStatus);
router.patch("/seats/:courseId", authMiddleWare, updateCourseSeats);
router.get("/inactive", getAllInactiveCourses);
router.get("/deleted", getAllDeletedCourses);
router.get("/:courseId", getCourseById);
router.get("/my-students/:courseId", authMiddleWare, getMyStudents);
router.patch("/:courseId/restore", authMiddleWare, restoreCourse);
router.post("/:courseId/view", authMiddleWare, incrementCourseView);
router.get("/faculties/:courseId",  getCourseFaculties);
router.get("/:courseId/batches", getCourseBatches);
module.exports = router;

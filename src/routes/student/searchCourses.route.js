const express = require("express"); 
const searchCoursesController = require("../../controllers/student/searchCourses.controller");
const router = express.Router();

router.post("/search-courses", searchCoursesController.searchCourses);

module.exports = router;    
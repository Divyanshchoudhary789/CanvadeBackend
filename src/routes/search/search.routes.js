const express = require('express');
const router = express.Router();
const SearchController = require('../../controllers/search/search.controller');
const { route } = require('../auth.routes');

router.get("/get", SearchController.searchCourses);
router.get("/category/:category", SearchController.searchCoursesByCategory);
module.exports = router;
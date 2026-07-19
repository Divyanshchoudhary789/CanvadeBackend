const express = require("express");
const router = express.Router();

const AuthMiddleware = require("../../middleware/auth");
const CompareController = require("../../controllers/student/compare.controller");

router.post("/add", AuthMiddleware, CompareController.addToCompare);
router.get("/getItems", AuthMiddleware, CompareController.getCompareItems);
router.delete("/remove", AuthMiddleware, CompareController.removeFromCompare);

module.exports = router;

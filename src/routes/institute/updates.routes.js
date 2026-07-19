const express = require("express");
const multer = require("multer");

const router = express.Router();

const upload = multer({
	storage: multer.memoryStorage(),
	limits: { fileSize: 50 * 1024 * 1024 },
});

const {
createUpdates,
getAllUpdates,
getUpdateById,
changeUpdateStatus,
deleteUpdateById,
updateUpdate,
getAllupdate,
getUpdatedByInstituteId,
getUpdatesStats,
incrementUpdateView,
incrementUpdateClick
// getDraftUpdates,
// getPublishedUpdates,
// updateUpdate,
// softDeleteUpdate,
// getsoftDeleteBlog,
// restoreBlog,
// deleteBlog   
} = require("../../controllers/institute/updates.controller");
const authMiddleware = require("../../middleware/auth");

// router.post("/create",authMiddleware,  createUpdates);
router.get("/all",  getAllupdate)
router.post(
	"/create",
	authMiddleware,
	upload.fields([
		{ name: "thumbnail", maxCount: 1 },
		{ name: "images", maxCount: 3 },
	]),
	createUpdates,
);
router.get("/", authMiddleware, getAllUpdates);
router.get("/stats", authMiddleware, getUpdatesStats);
router.post("/:updateId/view", incrementUpdateView);
router.post("/:updateId/click", incrementUpdateClick);
router.get("/:updateId", authMiddleware, getUpdateById);
router.put("/status/:updateId", authMiddleware, changeUpdateStatus);
router.delete("/destroy/:updateId", authMiddleware, deleteUpdateById);
router.put("/update/:updateId", authMiddleware, upload.fields([
		{ name: "thumbnail", maxCount: 1 },
		{ name: "images", maxCount: 3 },
	]), updateUpdate);
router.get("/get-updateby-instituteid/:instituteId", getUpdatedByInstituteId);
// router.get("/published", getPublishedUpdates);
// router.get("/draft", getDraftUpdates);
// router.put("/:updateId", authMiddleware, uploadsBlogImages, updateUpdate);
// router.put("/trash/:updateId", authMiddleware, softDeleteUpdate);
// router.get("/trash", getsoftDeleteBlog);
// router.put("/restore/:updateId", restoreBlog);
// router.delete("/:updateId", deleteBlog);

module.exports = router;
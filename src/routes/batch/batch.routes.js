const express = require("express");
const upload = require("../../middleware/upload");
const authMiddleWare = require("../../middleware/auth");
const router = express.Router();


const {
    createBatch,
    updateBatch,
    deleteBatch,
    getBatch,
    getAllBatches,
    getMyBatches
} = require("../../controllers/batch/batch.controller");

router.get("/get-my-batches", authMiddleWare, getMyBatches);
router.post("/create", authMiddleWare, createBatch);
router.patch("/update/:batchId", authMiddleWare, updateBatch);
router.delete("/delete/:batchId", authMiddleWare, deleteBatch);
router.get("/:batchId", authMiddleWare, getBatch);
router.get("/", authMiddleWare, getAllBatches);
module.exports = router;
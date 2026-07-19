const express = require("express");
const {
  registerInstitute,
  createInstitute,
  incrementInstituteView,
  getMyInstitute,
  getInstitute,
  updateInstitute,
  updateInstituteStatus,
  getAllInstitutes,
  getViewCount,
  getMyFaculties,
  saveInstituteOnboarding,
  getInstituteOnboarding
} = require("../../controllers/institute/institute.controller");
const upload = require("../../middleware/upload");
const authMiddleWare = require("../../middleware/auth");
const router = express.Router();

router.post("/register", registerInstitute);
router.get("/all", getAllInstitutes);
router.post(
  "/create-profile",
  authMiddleWare,
  upload.fields([
    { name: "logo", maxCount: 1 },
    { name: "video", maxCount: 1 },
    { name: "photos", maxCount: 15 },
    { name: "facultyImages", maxCount: 50 },
  ]),
  createInstitute,
);
router.get("/view/my-institute", authMiddleWare, getMyInstitute);
router.get("/view/:instituteId", authMiddleWare, getInstitute);
router.patch(
  "/update-profile/:instituteId",
  authMiddleWare,
  upload.fields([
    { name: "logo", maxCount: 1 },
    { name: "photos", maxCount: 15 },
    { name: "video", maxCount: 1 },
    { name: "facultyImages", maxCount: 50 },
  ]),
  updateInstitute,
);
router.patch(
  "/update-profile/status/:instituteId",
  authMiddleWare,
  updateInstituteStatus,
);
router.get("/my-faculties", authMiddleWare, getMyFaculties);
router.post(
  "/onboarding",
  authMiddleWare,
  upload.fields([{ name: "logo", maxCount: 1 }]),
  saveInstituteOnboarding,
);
router.get("/onboarding", authMiddleWare, getInstituteOnboarding);
router.post("/:instituteId/views", authMiddleWare, incrementInstituteView);
// router.get("/views", authMiddleWare, getViewCount);

module.exports = router;

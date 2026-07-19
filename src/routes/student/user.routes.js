const express = require("express");
const userController = require("../../controllers/student/user.controller");
const authMiddleware = require("../../middleware/auth");
const upload = require("../../middleware/upload");
const router = express.Router();

const uploadUserProfileImage = upload.fields([
  { name: "profileImage", maxCount: 1 },
  { name: "profilePhoto", maxCount: 1 },
]);

router.get("/all-users", userController.getAllUsers);
/**
 * @swagger
 * /api/users/register:
 *   post:
 *     summary: Register new user
 *     tags:
 *       - User
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *               phone:
 *                 type: number
 *     responses:
 *       201:
 *         description: User registered successfully
 */
router.get("/stu-id", authMiddleware, userController.getStuId);
router.get(
  "/search-student",
  authMiddleware,
  userController.searchStudentByStudentId,
);
router.post("/register", uploadUserProfileImage, userController.register);
router.post("/login", userController.login);
router.get("/profile", authMiddleware, userController.getProfile);
router.patch(
  "/update",
  authMiddleware,
  uploadUserProfileImage,
  userController.updateProfile,
);
router.delete("/delete", authMiddleware, userController.deleteProfile);
router.delete("/delete-account", authMiddleware, userController.deleteAccount);
module.exports = router;

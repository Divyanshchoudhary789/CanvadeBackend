const express = require('express');
const { login, getFirebaseToken } = require('../controllers/auth/auth.controller');
const { syncPassword } = require('../controllers/auth/password.controller');
const {
  sendResetOtp,
  verifyResetOtp,
  resetPasswordWithOtp,
} = require('../controllers/auth/resetPassword.controller');
const authMiddleWare = require('../middleware/auth');

const router = express.Router();

router.post('/login', login);
router.get('/firebase-token', authMiddleWare, getFirebaseToken);
router.post('/sync-password', syncPassword);
router.post('/forgot-password/send-otp', sendResetOtp);
router.post('/forgot-password/verify-otp', verifyResetOtp);
router.post('/forgot-password/reset', resetPasswordWithOtp);

module.exports = router;

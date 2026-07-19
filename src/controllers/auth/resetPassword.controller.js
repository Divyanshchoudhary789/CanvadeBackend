const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { admin, db } = require("../../services/firebase");
const { sendOtpMail } = require("../../config/mailer");

const OTP_TTL_MS = 10 * 60 * 1000;
const RESET_TOKEN_TTL_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

const generateOtp = () => String(crypto.randomInt(100000, 1000000));

const findUserByEmail = async (email) => {
  const indexDoc = await db.collection("emailIndex").doc(email).get();
  if (!indexDoc.exists) return null;
  const uid = indexDoc.data().uid;
  const userDoc = await db.collection("users").doc(uid).get();
  if (!userDoc.exists) return null;
  return { uid, ...userDoc.data() };
};

/**
 * Step 1 of password reset: sends a 6-digit code to the account's email.
 * Always responds with a generic success message so this can't be used to
 * probe which emails have an account.
 * POST /api/auth/forgot-password/send-otp
 */
exports.sendResetOtp = async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid email address",
      });
    }

    const genericResponse = {
      success: true,
      message: "If an account exists for that email, a verification code has been sent.",
    };

    const user = await findUserByEmail(email);
    if (!user) {
      return res.status(200).json(genericResponse);
    }

    const otp = generateOtp();
    const now = Date.now();

    await db
      .collection("passwordResetOtps")
      .doc(email)
      .set({
        email,
        otp,
        expiresAt: now + OTP_TTL_MS,
        verified: false,
        attempts: 0,
        resetToken: null,
        resetTokenExpiresAt: null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

    await sendOtpMail({
      toEmail: email,
      toName: user.displayName || user.name || "there",
      otpCode: otp,
    });

    return res.status(200).json(genericResponse);
  } catch (error) {
    console.error("Send Reset OTP Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to send verification code. Please try again.",
    });
  }
};

/**
 * Step 2: verifies the code and hands back a short-lived reset token, so the
 * final step doesn't need to resend the OTP over the wire again.
 * POST /api/auth/forgot-password/verify-otp
 */
exports.verifyResetOtp = async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const otp = String(req.body.otp || "").trim();

    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        message: "Email and code are required",
      });
    }

    const otpRef = db.collection("passwordResetOtps").doc(email);
    const otpDoc = await otpRef.get();

    if (!otpDoc.exists) {
      return res.status(400).json({
        success: false,
        message: "No verification code found for this email. Please request a new one.",
      });
    }

    const data = otpDoc.data();

    if (Date.now() > data.expiresAt) {
      return res.status(400).json({
        success: false,
        message: "This code has expired. Please request a new one.",
      });
    }

    if ((data.attempts || 0) >= MAX_ATTEMPTS) {
      return res.status(429).json({
        success: false,
        message: "Too many incorrect attempts. Please request a new code.",
      });
    }

    if (data.otp !== otp) {
      await otpRef.update({ attempts: admin.firestore.FieldValue.increment(1) });
      return res.status(400).json({
        success: false,
        message: "Incorrect code. Please try again.",
      });
    }

    const resetToken = crypto.randomBytes(32).toString("hex");
    await otpRef.update({
      verified: true,
      resetToken,
      resetTokenExpiresAt: Date.now() + RESET_TOKEN_TTL_MS,
    });

    return res.status(200).json({
      success: true,
      message: "Code verified.",
      data: { resetToken },
    });
  } catch (error) {
    console.error("Verify Reset OTP Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to verify code. Please try again.",
    });
  }
};

/**
 * Step 3: sets the new password, gated on the resetToken minted in step 2.
 * Updates both the Firestore password hash (checked by our own login) and
 * Firebase Auth's password (so Firebase-dependent flows stay in sync).
 * POST /api/auth/forgot-password/reset
 */
exports.resetPasswordWithOtp = async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const { resetToken, newPassword } = req.body;

    if (!email || !resetToken || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Email, reset token and new password are required",
      });
    }

    if (typeof newPassword !== "string" || newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters",
      });
    }

    const otpRef = db.collection("passwordResetOtps").doc(email);
    const otpDoc = await otpRef.get();

    if (!otpDoc.exists) {
      return res.status(400).json({
        success: false,
        message: "Please verify your email with a code first.",
      });
    }

    const data = otpDoc.data();
    if (
      !data.verified ||
      data.resetToken !== resetToken ||
      !data.resetTokenExpiresAt ||
      Date.now() > data.resetTokenExpiresAt
    ) {
      return res.status(400).json({
        success: false,
        message: "This reset session has expired. Please request a new code.",
      });
    }

    const user = await findUserByEmail(email);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "No account found for this email.",
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await db.collection("users").doc(user.uid).update({
      password: hashedPassword,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    try {
      await admin.auth().updateUser(user.uid, { password: newPassword });
    } catch (err) {
      console.error("Firebase Auth password update failed:", err);
    }

    await otpRef.delete();

    return res.status(200).json({
      success: true,
      message: "Password reset successfully.",
    });
  } catch (error) {
    console.error("Reset Password Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to reset password. Please try again.",
    });
  }
};

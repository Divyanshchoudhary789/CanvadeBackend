const admin = require("firebase-admin");
const bcrypt = require("bcryptjs");
const db = admin.firestore();

/**
 * After a user resets their password via Firebase (sendPasswordResetEmail +
 * confirmPasswordReset, both client-side), the app's own Firestore `users`
 * doc still has the OLD bcrypt hash — login() checks that hash directly, not
 * Firebase Auth. The frontend calls this once, right after a successful
 * reset (signed in with the new password to get a fresh ID token), so both
 * copies of the password stay in sync.
 * POST /api/auth/sync-password
 */
exports.syncPassword = async (req, res) => {
  try {
    const { idToken, newPassword } = req.body;

    if (!idToken || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "idToken and newPassword are required",
      });
    }

    if (typeof newPassword !== "string" || newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters",
      });
    }

    let decoded;
    try {
      decoded = await admin.auth().verifyIdToken(idToken);
    } catch (err) {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired session. Please try resetting your password again.",
      });
    }

    const userRef = db.collection("users").doc(decoded.uid);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return res.status(404).json({
        success: false,
        message: "Account not found.",
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await userRef.update({
      password: hashedPassword,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.status(200).json({
      success: true,
      message: "Password updated successfully.",
    });
  } catch (error) {
    console.error("Sync Password Error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error.",
      error: error.message,
    });
  }
};

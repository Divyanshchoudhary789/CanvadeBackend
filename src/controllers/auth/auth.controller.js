const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const admin = require("firebase-admin");
const { db } = require("../../services/firebase");

// Universal login for all roles (student, institute, ...)
exports.login = async (req, res) => {
  try {
    let { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: "Email and password are required" });
    }

    email = String(email).trim().toLowerCase();

    if (!process.env.JWT_SECRET) {
      console.error("JWT_SECRET is not configured");
      return res.status(500).json({ success: false, message: "Server configuration error" });
    }

    const userSnapshot = await db
      .collection("users")
      .where("email", "==", email)
      .limit(1)
      .get();

    if (userSnapshot.empty) {
      return res.status(401).json({ success: false, message: "Invalid email or password" });
    }

    const user = userSnapshot.docs[0].data();

    if (!user.password) {
      // e.g. account was created via Google sign-in and has no password set
      return res.status(401).json({ success: false, message: "Invalid email or password" });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ success: false, message: "Invalid email or password" });
    }

    const token = jwt.sign(
      {
        uid: user.uid,
        studentId: user.studentId || undefined,
        email: user.email,
        role: user.role,
        displayName: user.displayName || user.name,
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" },
    );

    const { password: _pw, ...userWithoutPassword } = user;

    return res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      user: userWithoutPassword,
    });
  } catch (error) {
    console.error("Auth login error:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong. Please try again later.",
    });
  }
};

/**
 * Mints a Firebase custom token for the already-authenticated user, so the
 * frontend can sign into Firebase Auth (via signInWithCustomToken) and
 * satisfy Firestore security rules for realtime listeners. Requires
 * authMiddleWare, which already verified the caller's backend JWT.
 */
exports.getFirebaseToken = async (req, res) => {
  try {
    const uid = req.user.uid;

    const firebaseToken = await admin.auth().createCustomToken(uid);

    return res.status(200).json({
      success: true,
      firebaseToken,
    });
  } catch (error) {
    console.error("Get Firebase Token Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create Firebase token.",
      error: error.message,
    });
  }
};
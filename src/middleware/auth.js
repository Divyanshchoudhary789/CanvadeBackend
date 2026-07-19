const jwt = require("jsonwebtoken");
const { admin, db } = require("../services/firebase");

const auth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ success: false, message: "Access token required" });
    }

    const token = authHeader.split(" ")[1];

    let decodedUid = null;

    try {
      const decodedIdToken = await admin.auth().verifyIdToken(token);
      decodedUid = decodedIdToken.uid;
    } catch (firebaseErr) {
      try {
        const decodedJwt = jwt.verify(token, process.env.JWT_SECRET);
        decodedUid = decodedJwt.uid;
      } catch (jwtErr) {
        console.error("Token verification failed:", firebaseErr.message || firebaseErr, jwtErr.message || jwtErr);
        if (firebaseErr && firebaseErr.code === "auth/id-token-expired") {
          return res.status(401).json({ success: false, message: "Token expired" });
        }
        return res.status(401).json({ success: false, message: "Invalid token" });
      }
    }

    const userSnapshot = await db.collection("users").doc(decodedUid).get();

    if (!userSnapshot.exists) {
      return res.status(401).json({ success: false, message: "User not found" });
    }

    const user = userSnapshot.data();

    req.user = {
      uid: user.uid,
      email: user.email,
      role: user.role,
      displayName: user.displayName,
      studentId: user.studentId || null,
      instituteId: user.instituteId || null,
      teacherId: user.teacherId || null,
    };

    next();
  } catch (error) {
    console.error("Auth Error:", error);
    if (error && error.name === "TokenExpiredError") {
      return res.status(401).json({ success: false, message: "Token expired" });
    }
    return res.status(401).json({ success: false, message: "Authentication failed" });
  }
};

module.exports = auth;

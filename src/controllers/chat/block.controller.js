const admin = require("firebase-admin");
const db = admin.firestore();

/**
 * Block User — prevents the target user from sending further messages to
 * the caller (enforced in message.controller.js#sendMessage). Chat history
 * and the conversation itself are left untouched.
 * POST /chat/block/:uid
 */
exports.blockUser = async (req, res) => {
  try {
    const uid = req.user.uid;
    const { uid: targetUid } = req.params;

    if (!targetUid) {
      return res.status(400).json({
        success: false,
        message: "User ID is required.",
      });
    }

    if (targetUid === uid) {
      return res.status(400).json({
        success: false,
        message: "You cannot block yourself.",
      });
    }

    await db
      .collection("users")
      .doc(uid)
      .set(
        {
          blockedUsers: admin.firestore.FieldValue.arrayUnion(targetUid),
        },
        { merge: true },
      );

    return res.status(200).json({
      success: true,
      message: "User blocked.",
    });
  } catch (error) {
    console.error("Block User Error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error.",
      error: error.message,
    });
  }
};

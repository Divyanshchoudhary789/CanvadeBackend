const admin = require("firebase-admin");
const db = admin.firestore();

/**
 * Send Group Message
 * POST /chat/group/message/send
 */
exports.sendGroupMessage = async (req, res) => {
  try {
    const senderUid = req.user.uid;

    const {
      groupId,
      text,
      type = "text",
      attachment = null,
      replyTo = null,
    } = req.body;

    // ==========================
    // Validation
    // ==========================
    if (!groupId) {
      return res.status(400).json({
        success: false,
        message: "Group ID is required.",
      });
    }

    if (type === "text" && (!text || !text.trim())) {
      return res.status(400).json({
        success: false,
        message: "Message cannot be empty.",
      });
    }

    const groupRef = db.collection("groups").doc(groupId);

    const groupDoc = await groupRef.get();

    if (!groupDoc.exists) {
      return res.status(404).json({
        success: false,
        message: "Group not found.",
      });
    }

    const group = groupDoc.data();

    if (!group.isActive) {
      return res.status(400).json({
        success: false,
        message: "Group is inactive.",
      });
    }

    // ==========================
    // Check Membership
    // ==========================
    const memberDoc = await groupRef
      .collection("members")
      .doc(senderUid)
      .get();

    if (!memberDoc.exists) {
      return res.status(403).json({
        success: false,
        message: "You are not a member of this group.",
      });
    }

    // ==========================
    // Create Message
    // ==========================
    const messageRef = groupRef
      .collection("messages")
      .doc();

    const now = admin.firestore.FieldValue.serverTimestamp();

    const messageData = {
      messageId: messageRef.id,

      groupId,

      senderId: senderUid,

      text: text || "",

      type,

      attachment,

      replyTo,

      edited: false,

      deleted: false,

      seenBy: [senderUid],

      createdAt: now,

      updatedAt: now,
    };

    // ==========================
    // Get All Members
    // ==========================
    const membersSnapshot = await groupRef
      .collection("members")
      .get();

    const unreadCount = {};

    membersSnapshot.docs.forEach((doc) => {
      const uid = doc.id;

      if (uid !== senderUid) {
        unreadCount[uid] = admin.firestore.FieldValue.increment(1);
      }
    });

    // ==========================
    // Transaction
    // ==========================
    await db.runTransaction(async (transaction) => {

      transaction.set(messageRef, messageData);

      transaction.update(groupRef, {

        lastMessage:
          type === "text"
            ? text
            : `Sent a ${type}`,

        lastMessageSender: senderUid,

        lastMessageType: type,

        lastMessageTime: now,

        updatedAt: now,

      });

    });

    return res.status(201).json({
      success: true,
      message: "Group message sent successfully.",
      data: messageData,
    });

  } catch (error) {

    console.error("Send Group Message Error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error.",
      error: error.message,
    });

  }
};

/**
 * Mark Group Messages As Seen
 * PATCH /chat/group/message/seen/:groupId
 */
exports.markGroupMessagesAsSeen = async (req, res) => {
  try {
    const uid = req.user.uid;
    const { groupId } = req.params;

    if (!groupId) {
      return res.status(400).json({
        success: false,
        message: "Group ID is required.",
      });
    }

    const groupRef = db.collection("groups").doc(groupId);

    const groupDoc = await groupRef.get();

    if (!groupDoc.exists) {
      return res.status(404).json({
        success: false,
        message: "Group not found.",
      });
    }

    // Check membership
    const memberDoc = await groupRef
      .collection("members")
      .doc(uid)
      .get();

    if (!memberDoc.exists) {
      return res.status(403).json({
        success: false,
        message: "You are not a member of this group.",
      });
    }

    const messagesSnapshot = await groupRef
      .collection("messages")
      .where("senderId", "!=", uid)
      .get();

    const batch = db.batch();

    messagesSnapshot.docs.forEach((doc) => {

      const data = doc.data();

      const seenBy = data.seenBy || [];

      if (!seenBy.includes(uid)) {

        batch.update(doc.ref, {

          seenBy: [...seenBy, uid],

          updatedAt: admin.firestore.FieldValue.serverTimestamp(),

        });

      }

    });

    await batch.commit();

    return res.status(200).json({
      success: true,
      message: "Group messages marked as seen.",
    });

  } catch (error) {

    console.error("Mark Group Seen Error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error.",
      error: error.message,
    });

  }
};

/**
 * Edit Group Message
 * PATCH /chat/group/message/edit/:messageId
 */
exports.editGroupMessage = async (req, res) => {
  try {
    const uid = req.user.uid;
    const { messageId } = req.params;
    const { groupId, text } = req.body;

    if (!groupId || !messageId) {
      return res.status(400).json({
        success: false,
        message: "Group ID and Message ID are required.",
      });
    }

    if (!text || !text.trim()) {
      return res.status(400).json({
        success: false,
        message: "Message cannot be empty.",
      });
    }

    const messageRef = db
      .collection("groups")
      .doc(groupId)
      .collection("messages")
      .doc(messageId);

    const messageDoc = await messageRef.get();

    if (!messageDoc.exists) {
      return res.status(404).json({
        success: false,
        message: "Message not found.",
      });
    }

    const message = messageDoc.data();

    if (message.senderId !== uid) {
      return res.status(403).json({
        success: false,
        message: "You can only edit your own messages.",
      });
    }

    await messageRef.update({
      text,
      edited: true,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.status(200).json({
      success: true,
      message: "Message updated successfully.",
    });
  } catch (error) {
    console.error("Edit Group Message Error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error.",
      error: error.message,
    });
  }
};

/**
 * Delete Group Message (soft delete)
 * DELETE /chat/group/message/delete/:messageId
 */
exports.deleteGroupMessage = async (req, res) => {
  try {
    const uid = req.user.uid;
    const { messageId } = req.params;
    const { groupId } = req.body;

    if (!groupId || !messageId) {
      return res.status(400).json({
        success: false,
        message: "Group ID and Message ID are required.",
      });
    }

    const messageRef = db
      .collection("groups")
      .doc(groupId)
      .collection("messages")
      .doc(messageId);

    const messageDoc = await messageRef.get();

    if (!messageDoc.exists) {
      return res.status(404).json({
        success: false,
        message: "Message not found.",
      });
    }

    const message = messageDoc.data();

    if (message.senderId !== uid) {
      return res.status(403).json({
        success: false,
        message: "You can only delete your own messages.",
      });
    }

    if (message.deleted) {
      return res.status(400).json({
        success: false,
        message: "Message already deleted.",
      });
    }

    await messageRef.update({
      deleted: true,
      text: "",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.status(200).json({
      success: true,
      message: "Message deleted successfully.",
    });
  } catch (error) {
    console.error("Delete Group Message Error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error.",
      error: error.message,
    });
  }
};
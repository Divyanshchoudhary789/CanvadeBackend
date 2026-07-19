const admin = require("firebase-admin");
const db = admin.firestore();
const { buildMemberDetail } = require("../../utils/chatParticipant");

/**
 * Get My Conversations
 * GET /chat/conversations
 */
exports.getMyConversations = async (req, res) => {
  try {
    const uid = req.user.uid;
    const snapshot = await db
      .collection("conversations")
      .where("members", "array-contains", uid)
      .where("isActive", "==", true)
      .orderBy("updatedAt", "desc")
      .get();

    if (snapshot.empty) {
      return res.status(200).json({
        success: true,
        message: "No conversations found.",
        data: [],
      });
    }

    const conversations = await Promise.all(
      snapshot.docs
        .filter((doc) => !(doc.data().deletedFor || []).includes(uid))
        .map(async (doc) => {
          const conversation = doc.data();

          let participant = null;

          if (conversation.type === "individual") {
            // Derived from `members` (always present), not from
            // `memberDetails` keys — conversations created before
            // memberDetails existed (or via any path that skipped it) would
            // otherwise always resolve otherUser to undefined and show
            // "Unknown User" forever.
            const otherUser = (conversation.members || []).find((id) => id !== uid);

            participant = conversation.memberDetails?.[otherUser] || null;

            if (!participant && otherUser) {
              participant = await buildMemberDetail(db, otherUser);
              // Best-effort backfill so this doesn't need recomputing on
              // every future fetch of this conversation.
              doc.ref
                .set({ memberDetails: { [otherUser]: participant } }, { merge: true })
                .catch((err) => console.error("Backfill memberDetails failed:", err));
            }
          }

          return {
            conversationId: conversation.conversationId,
            type: conversation.type,
            lastMessage: conversation.lastMessage,
            lastMessageType: conversation.lastMessageType,
            lastMessageSender: conversation.lastMessageSender,
            lastMessageTime: conversation.lastMessageTime,
            unreadCount: conversation.unreadCount?.[uid] || 0,
            participant,
            members: conversation.members,
          };
        }),
    );

    return res.status(200).json({
      success: true,

      total: conversations.length,

      data: conversations,
    });
  } catch (error) {
    console.error("Get Conversations Error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error.",
      error: error.message,
    });
  }
};

/**
 * Get Conversation By ID
 * GET /chat/conversation/:conversationId
 */
exports.getConversationById = async (req, res) => {
  try {
    const uid = req.user.uid;
    const { conversationId } = req.params;

    if (!conversationId) {
      return res.status(400).json({
        success: false,
        message: "Conversation ID is required.",
      });
    }

    const conversationRef = db.collection("conversations").doc(conversationId);

    const conversationDoc = await conversationRef.get();

    if (!conversationDoc.exists) {
      return res.status(404).json({
        success: false,
        message: "Conversation not found.",
      });
    }

    const conversation = conversationDoc.data();

    // User must be a member
    if (!conversation.members.includes(uid)) {
      return res.status(403).json({
        success: false,
        message: "You are not allowed to access this conversation.",
      });
    }

    const messageSnapshot = await conversationRef
      .collection("messages")
      .orderBy("createdAt", "asc")
      .limit(50)
      .get();

    const messages = messageSnapshot.docs.map((doc) => ({
      messageId: doc.id,
      ...doc.data(),
    }));

    return res.status(200).json({
      success: true,
      data: {
        conversation,
        messages,
      },
    });
  } catch (error) {
    console.error("Get Conversation Error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error.",
      error: error.message,
    });
  }
};

/**
 * Delete Conversation (for the calling user only)
 * DELETE /chat/conversation/:conversationId
 */
exports.deleteConversation = async (req, res) => {
  try {
    const uid = req.user.uid;
    const { conversationId } = req.params;

    const conversationRef = db.collection("conversations").doc(conversationId);
    const conversationDoc = await conversationRef.get();

    if (!conversationDoc.exists) {
      return res.status(404).json({
        success: false,
        message: "Conversation not found.",
      });
    }

    const conversation = conversationDoc.data();

    if (!conversation.members.includes(uid)) {
      return res.status(403).json({
        success: false,
        message: "You are not allowed to delete this conversation.",
      });
    }

    await conversationRef.update({
      deletedFor: admin.firestore.FieldValue.arrayUnion(uid),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.status(200).json({
      success: true,
      message: "Conversation deleted.",
    });
  } catch (error) {
    console.error("Delete Conversation Error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error.",
      error: error.message,
    });
  }
};

/**
 * Clear Chat — deletes every message in a conversation, keeps the
 * conversation itself.
 * POST /chat/conversation/:conversationId/clear
 */
exports.clearConversationMessages = async (req, res) => {
  try {
    const uid = req.user.uid;
    const { conversationId } = req.params;

    const conversationRef = db.collection("conversations").doc(conversationId);
    const conversationDoc = await conversationRef.get();

    if (!conversationDoc.exists) {
      return res.status(404).json({
        success: false,
        message: "Conversation not found.",
      });
    }

    const conversation = conversationDoc.data();

    if (!conversation.members.includes(uid)) {
      return res.status(403).json({
        success: false,
        message: "You are not allowed to clear this conversation.",
      });
    }

    const messagesRef = conversationRef.collection("messages");
    const messagesSnapshot = await messagesRef.get();

    const chunks = [];
    for (let i = 0; i < messagesSnapshot.docs.length; i += 450) {
      chunks.push(messagesSnapshot.docs.slice(i, i + 450));
    }

    for (const chunk of chunks) {
      const batch = db.batch();
      chunk.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
    }

    await conversationRef.update({
      lastMessage: "",
      lastMessageType: null,
      lastMessageSender: null,
      lastMessageTime: null,
      unreadCount: conversation.members.reduce((acc, member) => {
        acc[member] = 0;
        return acc;
      }, {}),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.status(200).json({
      success: true,
      message: "Chat cleared.",
    });
  } catch (error) {
    console.error("Clear Conversation Error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error.",
      error: error.message,
    });
  }
};

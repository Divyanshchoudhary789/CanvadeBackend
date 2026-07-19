const admin = require("firebase-admin");
const db = admin.firestore();
const { buildMemberDetail } = require("../../utils/chatParticipant");

/**
 * Send Chat Request
 * POST /chat/request/send
 */
exports.sendChatRequest = async (req, res) => {
  try {
    const senderUid = req.user.uid;
    const { receiverUid: rawReceiverId } = req.body;

    if (!rawReceiverId || typeof rawReceiverId !== "string") {
      return res.status(400).json({
        success: false,
        message: "Receiver UID is required.",
      });
    }

    // Accept either the receiver's Firebase uid or their studentId
    // (eg. "STU_100024") — resolve whichever was sent to the real uid.
    let receiverDoc = await db.collection("users").doc(rawReceiverId).get();

    if (!receiverDoc.exists) {
      const studentIdMatch = await db
        .collection("users")
        .where("studentId", "==", rawReceiverId)
        .limit(1)
        .get();

      if (!studentIdMatch.empty) {
        receiverDoc = studentIdMatch.docs[0];
      }
    }

    if (!receiverDoc.exists) {
      return res.status(404).json({
        success: false,
        message: "Receiver not found.",
      });
    }

    const receiverUid = receiverDoc.id;

    if (senderUid === receiverUid) {
      return res.status(400).json({
        success: false,
        message: "You cannot send a chat request to yourself.",
      });
    }

    const receiver = receiverDoc.data();

    if (receiver.role !== "student") {
      return res.status(403).json({
        success: false,
        message: "Chat requests can only be sent to students.",
      });
    }

    const pendingRequest = await db
      .collection("chatRequests")
      .where("senderUid", "==", senderUid)
      .where("receiverUid", "==", receiverUid)
      .where("status", "==", "pending")
      .limit(1)
      .get();

    if (!pendingRequest.empty) {
      return res.status(409).json({
        success: false,
        message: "Chat request already sent.",
      });
    }

    const reverseRequest = await db
      .collection("chatRequests")
      .where("senderUid", "==", receiverUid)
      .where("receiverUid", "==", senderUid)
      .where("status", "==", "pending")
      .limit(1)
      .get();

    if (!reverseRequest.empty) {
      return res.status(409).json({
        success: false,
        message:
          "This student has already sent you a chat request. Please accept it instead.",
      });
    }

    // ==============================
    // Check Existing Conversation
    // ==============================
    const conversationSnapshot = await db
      .collection("conversations")
      .where("type", "==", "individual")
      .where("members", "array-contains", senderUid)
      .get();

    const conversationExists = conversationSnapshot.docs.some((doc) => {
      const members = doc.data().members || [];
      return members.includes(receiverUid);
    });

    if (conversationExists) {
      return res.status(409).json({
        success: false,
        message: "Conversation already exists.",
      });
    }

    // ==============================
    // Create Chat Request
    // ==============================
    const requestRef = db.collection("chatRequests").doc();

    const requestData = {
      requestId: requestRef.id,

      senderUid,

      receiverUid,

      status: "pending",

      createdAt: admin.firestore.FieldValue.serverTimestamp(),

      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await requestRef.set(requestData);

    // ==============================
    // Success Response
    // ==============================
    return res.status(201).json({
      success: true,
      message: "Chat request sent successfully.",
      data: requestData,
    });
  } catch (error) {
    console.error("Send Chat Request Error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error.",
      error: error.message,
    });
  }
};

/**
 * Get Received Chat Requests
 * GET /chat/request/received
 */
exports.getReceivedChatRequests = async (req, res) => {
  try {
    const uid = req.user.uid;

    const snapshot = await db
      .collection("chatRequests")
      .where("receiverUid", "==", uid)
      .where("status", "==", "pending")
      .orderBy("createdAt", "desc")
      .get();

    if (snapshot.empty) {
      return res.status(200).json({
        success: true,
        message: "No pending chat requests found.",
        data: [],
      });
    }

    const requests = [];

    for (const doc of snapshot.docs) {
      const request = doc.data();

      const senderDoc = await db
        .collection("users")
        .doc(request.senderUid)
        .get();

      if (!senderDoc.exists) continue;

      const sender = senderDoc.data();

      requests.push({
        requestId: request.requestId,
        senderUid: request.senderUid,
        status: request.status,
        createdAt: request.createdAt,

        sender: {
          uid: sender.uid || request.senderUid,
          name: sender.name || "",
          email: sender.email || "",
          profileImage: sender.profileImage || "",
          studentId: sender.studentId || "",
        },
      });
    }

    return res.status(200).json({
      success: true,
      message: "Received chat requests fetched successfully.",
      total: requests.length,
      data: requests,
    });
  } catch (error) {
    console.error("Get Received Chat Requests Error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error.",
      error: error.message,
    });
  }
};

/**
 * Get Sent Chat Requests
 * GET /chat/request/sent
 */
exports.getSentChatRequests = async (req, res) => {
  try {
    const uid = req.user.uid;

    const snapshot = await db
      .collection("chatRequests")
      .where("senderUid", "==", uid)
      .where("status", "==", "pending")
      .orderBy("createdAt", "desc")
      .get();

    if (snapshot.empty) {
      return res.status(200).json({
        success: true,
        message: "No sent chat requests found.",
        data: [],
      });
    }

    const requests = [];

    for (const doc of snapshot.docs) {
      const request = doc.data();

      const receiverDoc = await db
        .collection("users")
        .doc(request.receiverUid)
        .get();

      if (!receiverDoc.exists) continue;

      const receiver = receiverDoc.data();

      requests.push({
        requestId: request.requestId,
        receiverUid: request.receiverUid,
        status: request.status,
        createdAt: request.createdAt,

        receiver: {
          uid: receiver.uid || request.receiverUid,
          name: receiver.name || "",
          email: receiver.email || "",
          profileImage: receiver.profileImage || "",
          studentId: receiver.studentId || "",
        },
      });
    }

    return res.status(200).json({
      success: true,
      message: "Sent chat requests fetched successfully.",
      total: requests.length,
      data: requests,
    });
  } catch (error) {
    console.error("Get Sent Chat Requests Error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error.",
      error: error.message,
    });
  }
};


exports.acceptChatRequest = async (req, res) => {
  try {
    const uid = req.user.uid;
    const { requestId } = req.params;

    if (!requestId) {
      return res.status(400).json({
        success: false,
        message: "Request ID is required.",
      });
    }

    const requestRef = db.collection("chatRequests").doc(requestId);

    const requestDoc = await requestRef.get();

    if (!requestDoc.exists) {
      return res.status(404).json({
        success: false,
        message: "Chat request not found.",
      });
    }

    const request = requestDoc.data();

      if (request.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: `Request already ${request.status}.`,
      });
    }

    // ===========================
    // Only receiver can accept
    // ===========================
    if (request.receiverUid !== uid) {
      return res.status(403).json({
        success: false,
        message: "You are not allowed to accept this request.",
      });
    }

    const members = [
      request.senderUid,
      request.receiverUid,
    ].sort();

    const participantKey = members.join("_");

    const [senderDetail, receiverDetail] = await Promise.all([
      buildMemberDetail(db, request.senderUid),
      buildMemberDetail(db, request.receiverUid),
    ]);

        // ===========================
    // Accept Request + Create Conversation
    // ===========================
    const result = await db.runTransaction(async (transaction) => {
      // Check if conversation already exists
      const existingConversation = await db
        .collection("conversations")
        .where("participantKey", "==", participantKey)
        .limit(1)
        .get();

      if (!existingConversation.empty) {
        throw new Error("Conversation already exists.");
      }

      // Conversation Reference
      const conversationRef = db.collection("conversations").doc();

      const conversationData = {
        conversationId: conversationRef.id,

        type: "individual",

        participantKey,

        members,

        memberDetails: {
          [request.senderUid]: senderDetail,
          [request.receiverUid]: receiverDetail,
        },

        lastMessage: "",

        lastMessageSender: null,

        lastMessageTime: null,

        unreadCount: {
          [request.senderUid]: 0,
          [request.receiverUid]: 0,
        },

        isActive: true,

        createdAt: admin.firestore.FieldValue.serverTimestamp(),

        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      transaction.set(conversationRef, conversationData);

      transaction.update(requestRef, {
        status: "accepted",
        conversationId: conversationRef.id,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return conversationData;
    });

    return res.status(200).json({
      success: true,
      message: "Chat request accepted successfully.",
      data: result,
    });

  } catch (error) {
    console.error("Accept Chat Request Error:", error);

    if (error.message === "Conversation already exists.") {
      return res.status(409).json({
        success: false,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Internal server error.",
      error: error.message,
    });
  }
};

/**
 * Reject Chat Request
 * PATCH /chat/request/reject/:requestId
 */
exports.rejectChatRequest = async (req, res) => {
  try {
    const uid = req.user.uid;
    const { requestId } = req.params;

    if (!requestId) {
      return res.status(400).json({
        success: false,
        message: "Request ID is required.",
      });
    }

    const requestRef = db.collection("chatRequests").doc(requestId);

    const requestDoc = await requestRef.get();

    if (!requestDoc.exists) {
      return res.status(404).json({
        success: false,
        message: "Chat request not found.",
      });
    }

    const request = requestDoc.data();

    // Only receiver can reject
    if (request.receiverUid !== uid) {
      return res.status(403).json({
        success: false,
        message: "You are not allowed to reject this request.",
      });
    }

    // Already processed
    if (request.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: `Request already ${request.status}.`,
      });
    }

    await requestRef.update({
      status: "rejected",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.status(200).json({
      success: true,
      message: "Chat request rejected successfully.",
    });

  } catch (error) {
    console.error("Reject Chat Request Error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error.",
      error: error.message,
    });
  }
};

/**
 * Cancel Chat Request
 * DELETE /chat/request/cancel/:requestId
 */
exports.cancelChatRequest = async (req, res) => {
  try {
    const uid = req.user.uid;
    const { requestId } = req.params;

    if (!requestId) {
      return res.status(400).json({
        success: false,
        message: "Request ID is required.",
      });
    }

    const requestRef = db.collection("chatRequests").doc(requestId);

    const requestDoc = await requestRef.get();

    if (!requestDoc.exists) {
      return res.status(404).json({
        success: false,
        message: "Chat request not found.",
      });
    }

    const request = requestDoc.data();

    // Only sender can cancel
    if (request.senderUid !== uid) {
      return res.status(403).json({
        success: false,
        message: "You are not allowed to cancel this request.",
      });
    }

    // Can only cancel pending requests
    if (request.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: `Cannot cancel a ${request.status} request.`,
      });
    }

    await requestRef.delete();

    return res.status(200).json({
      success: true,
      message: "Chat request cancelled successfully.",
    });

  } catch (error) {
    console.error("Cancel Chat Request Error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error.",
      error: error.message,
    });
  }
};
const admin = require("firebase-admin");
const db = admin.firestore();

/**
 * Send Group Join Request
 * POST /chat/group/request/send
 */
exports.sendGroupJoinRequest = async (req, res) => {
  try {
    const studentUid = req.user.uid;

    const { groupId } = req.body;
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

    const group = groupDoc.data();

    if (!group.isActive) {
      return res.status(400).json({
        success: false,
        message: "Group is inactive.",
      });
    }

    const memberDoc = await groupRef
      .collection("members")
      .doc(studentUid)
      .get();

    if (memberDoc.exists) {
      return res.status(409).json({
        success: false,
        message: "You are already a member.",
      });
    }

    const pendingSnapshot = await db
      .collection("groupRequests")
      .where("groupId", "==", groupId)
      .where("studentUid", "==", studentUid)
      .where("status", "==", "pending")
      .limit(1)
      .get();

    if (!pendingSnapshot.empty) {
      return res.status(409).json({
        success: false,

        message: "Join request already sent.",
      });
    }

    const requestRef = db.collection("groupRequests").doc();

    const request = {
      requestId: requestRef.id,

      groupId,

      ownerUid: group.ownerUid,

      studentUid,

      status: "pending",

      createdAt: admin.firestore.FieldValue.serverTimestamp(),

      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await requestRef.set(request);

    return res.status(201).json({
      success: true,

      message: "Join request sent successfully.",

      data: request,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,

      message: "Internal server error.",

      error: error.message,
    });
  }
};

/**
 * Get Received Group Join Requests
 * GET /chat/group/request/received
 */
exports.getReceivedGroupRequests = async (req, res) => {
  try {
    const ownerUid = req.user.uid;

    // Verify institute
    const instituteSnapshot = await db
      .collection("institutes")
      .where("ownerUid", "==", ownerUid)
      .limit(1)
      .get();

    if (instituteSnapshot.empty) {
      return res.status(403).json({
        success: false,
        message: "Only institutes can view group requests.",
      });
    }

    const snapshot = await db
      .collection("groupRequests")
      .where("ownerUid", "==", ownerUid)
      .where("status", "==", "pending")
      .orderBy("createdAt", "desc")
      .get();

    if (snapshot.empty) {
      return res.status(200).json({
        success: true,
        message: "No pending requests found.",
        total: 0,
        data: [],
      });
    }

    const requests = [];

    for (const doc of snapshot.docs) {
      const request = doc.data();

      // Student Details
      const studentDoc = await db
        .collection("users")
        .doc(request.studentUid)
        .get();

      // Group Details
      const groupDoc = await db
        .collection("groups")
        .doc(request.groupId)
        .get();

      requests.push({
        requestId: request.requestId,
        status: request.status,
        createdAt: request.createdAt,

        student: studentDoc.exists
          ? {
              uid: studentDoc.id,
              ...studentDoc.data(),
            }
          : null,

        group: groupDoc.exists
          ? {
              groupId: groupDoc.id,
              ...groupDoc.data(),
            }
          : null,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Group requests fetched successfully.",
      total: requests.length,
      data: requests,
    });
  } catch (error) {
    console.error("Get Group Requests Error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error.",
      error: error.message,
    });
  }
};

/**
 * Get Sent Group Join Requests
 * GET /chat/group/request/sent
 */
exports.getSentGroupRequests = async (req, res) => {
  try {
    const studentUid = req.user.uid;

    const snapshot = await db
      .collection("groupRequests")
      .where("studentUid", "==", studentUid)
      .orderBy("createdAt", "desc")
      .get();

    if (snapshot.empty) {
      return res.status(200).json({
        success: true,
        message: "No group requests found.",
        total: 0,
        data: [],
      });
    }

    const requests = [];

    for (const doc of snapshot.docs) {
      const request = doc.data();

      const groupDoc = await db
        .collection("groups")
        .doc(request.groupId)
        .get();

      const ownerDoc = await db
        .collection("users")
        .doc(request.ownerUid)
        .get();

      requests.push({
        requestId: request.requestId,
        groupId: request.groupId,
        status: request.status,
        createdAt: request.createdAt,
        updatedAt: request.updatedAt,

        group: groupDoc.exists
          ? {
              groupId: groupDoc.id,
              groupName: groupDoc.data().groupName,
              description: groupDoc.data().description,
              photo: groupDoc.data().photo,
              privacy: groupDoc.data().privacy,
              memberCount: groupDoc.data().memberCount,
            }
          : null,

        owner: ownerDoc.exists
          ? {
              uid: ownerDoc.id,
              name: ownerDoc.data().name,
              email: ownerDoc.data().email,
              profileImage: ownerDoc.data().profileImage,
            }
          : null,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Group requests fetched successfully.",
      total: requests.length,
      data: requests,
    });

  } catch (error) {
    console.error("Get Sent Group Requests Error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error.",
      error: error.message,
    });
  }
};

/**
 * Accept Group Join Request
 * PATCH /chat/group/request/accept/:requestId
 */
exports.acceptGroupRequest = async (req, res) => {
  try {
    const ownerUid = req.user.uid;
    const { requestId } = req.params;

    if (!requestId) {
      return res.status(400).json({
        success: false,
        message: "Request ID is required.",
      });
    }

    const requestRef = db.collection("groupRequests").doc(requestId);

    await db.runTransaction(async (transaction) => {

      const requestDoc = await transaction.get(requestRef);

      if (!requestDoc.exists) {
        throw new Error("Request not found.");
      }

      const request = requestDoc.data();

      if (request.ownerUid !== ownerUid) {
        throw new Error("Unauthorized.");
      }

      if (request.status !== "pending") {
        throw new Error(`Request already ${request.status}.`);
      }

      const groupRef = db.collection("groups").doc(request.groupId);

      const groupDoc = await transaction.get(groupRef);

      if (!groupDoc.exists) {
        throw new Error("Group not found.");
      }

      const group = groupDoc.data();

      if (!group.isActive) {
        throw new Error("Group is inactive.");
      }

      const memberRef = groupRef
        .collection("members")
        .doc(request.studentUid);

      const memberDoc = await transaction.get(memberRef);

      if (memberDoc.exists) {
        throw new Error("Student is already a member.");
      }

      transaction.set(memberRef, {

        uid: request.studentUid,

        role: "member",

        joinedAt: admin.firestore.FieldValue.serverTimestamp(),

      });

      transaction.update(groupRef, {

        memberCount: admin.firestore.FieldValue.increment(1),

        updatedAt: admin.firestore.FieldValue.serverTimestamp(),

      });

      transaction.update(requestRef, {

        status: "accepted",

        updatedAt: admin.firestore.FieldValue.serverTimestamp(),

      });

      const notificationRef = db.collection("notifications").doc();

      transaction.set(notificationRef, {

        notificationId: notificationRef.id,

        receiverUid: request.studentUid,

        title: "Group Join Request Accepted",

        body: `Your request to join "${group.groupName}" has been accepted.`,

        type: "group_request",

        referenceId: group.groupId,

        isRead: false,

        createdAt: admin.firestore.FieldValue.serverTimestamp(),

      });

      const messageRef = groupRef
        .collection("messages")
        .doc();

      transaction.set(messageRef, {

        messageId: messageRef.id,

        type: "system",

        text: "A new member joined the group.",

        senderId: ownerUid,

        targetUid: request.studentUid,

        createdAt: admin.firestore.FieldValue.serverTimestamp(),

      });

    });

    return res.status(200).json({
      success: true,
      message: "Group request accepted successfully.",
    });

  } catch (error) {

    console.error("Accept Group Request Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });

  }
};



/**
 * Reject Group Join Request
 * PATCH /chat/group/request/reject/:requestId
 */
exports.rejectGroupRequest = async (req, res) => {
  try {
    const ownerUid = req.user.uid;
    const { requestId } = req.params;

    if (!requestId) {
      return res.status(400).json({
        success: false,
        message: "Request ID is required.",
      });
    }

    const requestRef = db.collection("groupRequests").doc(requestId);

    await db.runTransaction(async (transaction) => {

      const requestDoc = await transaction.get(requestRef);

      if (!requestDoc.exists) {
        throw new Error("Group request not found.");
      }

      const request = requestDoc.data();

      if (request.ownerUid !== ownerUid) {
        throw new Error("You are not authorized to reject this request.");
      }

      if (request.status !== "pending") {
        throw new Error(`Request already ${request.status}.`);
      }

      // Update request
      transaction.update(requestRef, {
        status: "rejected",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Notification
      const notificationRef = db.collection("notifications").doc();

      transaction.set(notificationRef, {
        notificationId: notificationRef.id,

        receiverUid: request.studentUid,

        title: "Group Join Request Rejected",

        body: "Your request to join the group has been rejected.",

        type: "group_request",

        referenceId: request.groupId,

        isRead: false,

        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

    });

    return res.status(200).json({
      success: true,
      message: "Group request rejected successfully.",
    });

  } catch (error) {

    console.error("Reject Group Request Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });

  }
};

/**
 * Cancel Group Join Request
 * DELETE /chat/group/request/cancel/:requestId
 */
exports.cancelGroupRequest = async (req, res) => {
  try {
    const studentUid = req.user.uid;
    const { requestId } = req.params;

    if (!requestId) {
      return res.status(400).json({
        success: false,
        message: "Request ID is required.",
      });
    }

    const requestRef = db.collection("groupRequests").doc(requestId);

    const requestDoc = await requestRef.get();

    if (!requestDoc.exists) {
      return res.status(404).json({
        success: false,
        message: "Group request not found.",
      });
    }

    const request = requestDoc.data();

    // Only the student who created the request can cancel it
    if (request.studentUid !== studentUid) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to cancel this request.",
      });
    }

    // Only pending requests can be cancelled
    if (request.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: `Cannot cancel a ${request.status} request.`,
      });
    }

    await requestRef.delete();

    return res.status(200).json({
      success: true,
      message: "Group join request cancelled successfully.",
    });

  } catch (error) {
    console.error("Cancel Group Request Error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error.",
      error: error.message,
    });
  }
};

const admin = require("firebase-admin");
const db = admin.firestore();

/**
 * Gets (or creates) the individual conversation between a student and an
 * institute, then appends a "system" mini-details message followed by the
 * student's enquiry text — mirroring the conversation/message shapes used by
 * chatRequest.controller.js and message.controller.js, but bypassing the
 * request/accept handshake since an enquiry-initiated chat shouldn't require
 * the institute to accept first.
 */
const getOrCreateEnquiryConversation = async ({
  studentUid,
  studentName,
  instituteUid,
  instituteName,
  systemText,
  userText,
}) => {
  const members = [studentUid, instituteUid].sort();
  const participantKey = members.join("_");

  const existing = await db
    .collection("conversations")
    .where("participantKey", "==", participantKey)
    .limit(1)
    .get();

  const now = admin.firestore.FieldValue.serverTimestamp();
  let conversationRef;

  if (!existing.empty) {
    conversationRef = existing.docs[0].ref;
  } else {
    conversationRef = db.collection("conversations").doc();
    await conversationRef.set({
      conversationId: conversationRef.id,
      type: "individual",
      participantKey,
      members,
      memberDetails: {
        [studentUid]: { uid: studentUid, name: studentName || "", role: "student" },
        [instituteUid]: { uid: instituteUid, name: instituteName || "", role: "institute" },
      },
      lastMessage: "",
      lastMessageSender: null,
      lastMessageTime: null,
      unreadCount: {
        [studentUid]: 0,
        [instituteUid]: 0,
      },
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
  }

  const messagesRef = conversationRef.collection("messages");
  const systemMessageRef = messagesRef.doc();
  const textMessageRef = messagesRef.doc();

  const batch = db.batch();

  batch.set(systemMessageRef, {
    messageId: systemMessageRef.id,
    conversationId: conversationRef.id,
    senderId: studentUid,
    type: "system",
    text: systemText,
    attachment: null,
    replyTo: null,
    edited: false,
    deleted: false,
    seenBy: [studentUid],
    createdAt: now,
    updatedAt: now,
  });

  batch.set(textMessageRef, {
    messageId: textMessageRef.id,
    conversationId: conversationRef.id,
    senderId: studentUid,
    type: "text",
    text: userText,
    attachment: null,
    replyTo: null,
    edited: false,
    deleted: false,
    seenBy: [studentUid],
    createdAt: now,
    updatedAt: now,
  });

  const conversationSnapshot = await conversationRef.get();
  const unread = { ...(conversationSnapshot.data()?.unreadCount || {}) };
  unread[instituteUid] = (unread[instituteUid] || 0) + 2;

  batch.update(conversationRef, {
    lastMessage: userText,
    lastMessageType: "text",
    lastMessageSender: studentUid,
    lastMessageTime: now,
    unreadCount: unread,
    isActive: true,
    updatedAt: now,
  });

  await batch.commit();

  return conversationRef.id;
};

module.exports = { getOrCreateEnquiryConversation };

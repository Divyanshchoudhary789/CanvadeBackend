const express = require("express");
const router = express.Router();

const authMiddleWare = require("../../middleware/auth");
const upload = require("../../middleware/upload");

const {
  sendChatRequest,
  getReceivedChatRequests,
   getSentChatRequests,
   acceptChatRequest,
   rejectChatRequest,
   cancelChatRequest,
} = require("../../controllers/chat/chatRequest.controller");
const {
    getMyConversations,
    getConversationById,
    deleteConversation,
    clearConversationMessages,
} = require("../../controllers/chat/conversation.controller");

const { blockUser } = require("../../controllers/chat/block.controller");

const {
  sendMessage,
  markConversationAsSeen,
  editMessage,
  deleteMessage,
} = require("../../controllers/chat/message.controller");


const {
    createGroup,
    getMyGroups,
    getGlobalGroups,
    getGroupById,
} = require("../../controllers/chat/group.controller");

const {
    sendGroupJoinRequest,
    getReceivedGroupRequests,
    getSentGroupRequests,
    acceptGroupRequest,
    rejectGroupRequest,
    cancelGroupRequest,
} = require("../../controllers/chat/groupRequest.controller");

const {
  sendGroupMessage,
  markGroupMessagesAsSeen,
  editGroupMessage,
  deleteGroupMessage,
} = require("../../controllers/chat/groupMessage.controller");

router.post(
  "/request/send",
  authMiddleWare,
  sendChatRequest
);

router.get(
  "/request/received",
  authMiddleWare,
  getReceivedChatRequests
);

router.get(
  "/request/sent",
  authMiddleWare,
  getSentChatRequests
);

router.patch(
  "/request/accept/:requestId",
  authMiddleWare,
  acceptChatRequest
);

router.patch(
  "/request/reject/:requestId",
  authMiddleWare,
  rejectChatRequest
);

router.delete(
  "/request/cancel/:requestId",
  authMiddleWare,
  cancelChatRequest
);

router.get(
    "/conversations",
    authMiddleWare,
    getMyConversations
);

router.get(
  "/conversation/:conversationId",
  authMiddleWare,
  getConversationById
);

router.delete(
  "/conversation/:conversationId",
  authMiddleWare,
  deleteConversation
);

router.post(
  "/conversation/:conversationId/clear",
  authMiddleWare,
  clearConversationMessages
);

router.post(
  "/block/:uid",
  authMiddleWare,
  blockUser
);

router.post(
  "/message/send",
  authMiddleWare,
  upload.single("file"),
  sendMessage
);

router.patch(
  "/message/seen/:conversationId",
  authMiddleWare,
  markConversationAsSeen
);

router.patch(
  "/message/edit/:messageId",
  authMiddleWare,
  editMessage
);

router.delete(
  "/message/delete/:messageId",
  authMiddleWare,
  deleteMessage
);

router.post(
    "/group/create",
    authMiddleWare,
    createGroup
);

router.get(
  "/group/list",
  authMiddleWare,
  getMyGroups
);

// Must be registered before "/group/:groupId" so "global" isn't swallowed
// as a groupId param.
router.get(
  "/group/global",
  authMiddleWare,
  getGlobalGroups
);

router.get(
    "/group/:groupId",
    authMiddleWare,
    getGroupById
);

router.post(
    "/group/request/send",
    authMiddleWare,
    sendGroupJoinRequest
);

router.get(
  "/group/request/received",
  authMiddleWare,
  getReceivedGroupRequests
);

router.get(
  "/group/request/sent",
  authMiddleWare,
  getSentGroupRequests
);

router.patch(
  "/group/request/accept/:requestId",
  authMiddleWare,
  acceptGroupRequest
);

router.patch(
  "/group/request/reject/:requestId",
  authMiddleWare,
  rejectGroupRequest
);

router.delete(
  "/group/request/cancel/:requestId",
  authMiddleWare,
  cancelGroupRequest
);

router.post(
  "/group/message/send",
  authMiddleWare,
  sendGroupMessage
);

router.patch(
  "/group/message/seen/:groupId",
  authMiddleWare,
  markGroupMessagesAsSeen
);

router.patch(
  "/group/message/edit/:messageId",
  authMiddleWare,
  editGroupMessage
);

router.delete(
  "/group/message/delete/:messageId",
  authMiddleWare,
  deleteGroupMessage
);

module.exports = router;
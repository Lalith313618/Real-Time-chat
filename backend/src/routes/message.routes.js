const express = require('express');
const router = express.Router();
const {
  sendMessage,
  getConversationMessages,
  editMessage,
  deleteMessage,
  markAsRead,
  markConversationMessagesAsRead,
  searchMessages,
  uploadAttachment,
  getThreadReplies,
  sendThreadReply,
  toggleReaction,
  getUserMentions,
} = require('../controllers/message.controller');
const { protect } = require('../middleware/auth.middleware');
const { uploadSingle } = require('../middleware/upload.middleware');

router.use(protect);

router.post('/upload', uploadSingle('file'), uploadAttachment);
router.get('/search/:conversationId', searchMessages);
router.get('/mentions', getUserMentions);
router.post('/', sendMessage);
router.get('/:conversationId', getConversationMessages);
router.put('/:id', editMessage);
router.delete('/:id', deleteMessage);
router.put('/:id/read', markAsRead);
router.put('/conversation/:conversationId/read-all', markConversationMessagesAsRead);

// Message Threads
router.get('/:id/thread', getThreadReplies);
router.post('/:id/thread', sendThreadReply);

// Message Reactions
router.post('/:id/reactions', toggleReaction);

module.exports = router;

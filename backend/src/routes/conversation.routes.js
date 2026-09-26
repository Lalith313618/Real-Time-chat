const express = require('express');
const router = express.Router();
const {
  getOrCreateConversation,
  getUserConversations,
  getConversationById,
  createGroupConversation,
  updateGroup,
  addGroupMembers,
  removeGroupMember,
  toggleGroupAdmin,
  leaveGroup,
  deleteConversation,
  clearConversationMessages,
} = require('../controllers/conversation.controller');
const { protect } = require('../middleware/auth.middleware');

router.use(protect);

router.post('/group', createGroupConversation);
router.post('/', getOrCreateConversation);
router.get('/', getUserConversations);

router.put('/:id/group', updateGroup);
router.put('/:id/members/add', addGroupMembers);
router.put('/:id/members/remove', removeGroupMember);
router.put('/:id/admins/toggle', toggleGroupAdmin);
router.put('/:id/leave', leaveGroup);

router.get('/:id', getConversationById);
router.delete('/:id/messages', clearConversationMessages);
router.delete('/:id', deleteConversation);

module.exports = router;

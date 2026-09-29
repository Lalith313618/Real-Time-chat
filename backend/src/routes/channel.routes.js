const express = require('express');
const router = express.Router();
const {
  createChannel,
  getTeamChannels,
  getChannelById,
  updateChannel,
  deleteChannel,
  addChannelMember,
  removeChannelMember,
  getChannelMessages,
  sendChannelMessage,
  getChannelFiles,
} = require('../controllers/channel.controller');
const { protect } = require('../middleware/auth.middleware');

// All channel routes require authentication
router.use(protect);

router.post('/', createChannel);
router.get('/', getTeamChannels);
router.get('/:id', getChannelById);
router.put('/:id', updateChannel);
router.delete('/:id', deleteChannel);

// Channel Messages & Shared Files
router.get('/:id/messages', getChannelMessages);
router.post('/:id/messages', sendChannelMessage);
router.get('/:id/files', getChannelFiles);

// Private channel membership
router.post('/:id/members', addChannelMember);
router.delete('/:id/members/:memberId', removeChannelMember);

module.exports = router;

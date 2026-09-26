const mongoose = require('mongoose');
const Conversation = require('../models/conversation.model');
const User = require('../models/user.model');
const Message = require('../models/message.model');

// @desc    Get or create a 1-to-1 conversation with another user
// @route   POST /api/conversations
// @access  Private (JWT Protected)
const getOrCreateConversation = async (req, res) => {
  try {
    const { participantId } = req.body;

    if (!participantId) {
      return res.status(400).json({
        status: 'fail',
        message: 'participantId is required',
      });
    }

    if (!mongoose.Types.ObjectId.isValid(participantId)) {
      return res.status(400).json({
        status: 'fail',
        message: 'Invalid participant ID format',
      });
    }

    if (req.user._id.toString() === participantId.toString()) {
      return res.status(400).json({
        status: 'fail',
        message: 'Cannot create a conversation with yourself',
      });
    }

    // Check if participant user exists
    const targetUser = await User.findById(participantId);
    if (!targetUser) {
      return res.status(404).json({
        status: 'fail',
        message: 'The user you are trying to chat with does not exist',
      });
    }

    // Find existing 1-to-1 conversation
    let conversation = await Conversation.findOne({
      isGroup: false,
      participants: { $all: [req.user._id, participantId], $size: 2 },
    })
      .populate('participants', 'name email profileImage isOnline lastSeen')
      .populate('lastMessageSender', 'name email profileImage');

    if (conversation) {
      return res.status(200).json({
        status: 'success',
        isNew: false,
        conversation,
      });
    }

    // Create new conversation if none exists
    const newConv = await Conversation.create({
      participants: [req.user._id, participantId],
      isGroup: false,
      lastMessage: '',
      lastMessageAt: new Date(),
    });

    conversation = await Conversation.findById(newConv._id).populate(
      'participants',
      'name email profileImage isOnline lastSeen'
    );

    return res.status(201).json({
      status: 'success',
      isNew: true,
      conversation,
    });
  } catch (error) {
    console.error('[Get/Create Conversation Error]:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Error creating conversation',
    });
  }
};

// @desc    Get all conversations for currently authenticated user
// @route   GET /api/conversations
// @access  Private (JWT Protected)
const getUserConversations = async (req, res) => {
  try {
    const conversations = await Conversation.find({
      participants: req.user._id,
    })
      .populate('participants', 'name email profileImage isOnline lastSeen')
      .populate('groupAdmin', 'name email profileImage isOnline lastSeen')
      .populate('lastMessageSender', 'name email profileImage')
      .sort({ lastMessageAt: -1, updatedAt: -1 });

    // Aggregate unread message counts for each conversation
    const conversationIds = conversations.map((c) => c._id);
    const unreadAgg = await Message.aggregate([
      {
        $match: {
          conversationId: { $in: conversationIds },
          sender: { $ne: req.user._id },
          readBy: { $ne: req.user._id },
          isDeleted: false,
        },
      },
      {
        $group: {
          _id: '$conversationId',
          count: { $sum: 1 },
        },
      },
    ]);

    const unreadMap = {};
    unreadAgg.forEach((item) => {
      unreadMap[item._id.toString()] = item.count;
    });

    const conversationsWithUnread = conversations.map((c) => {
      const convObj = c.toObject();
      convObj.unreadCount = unreadMap[c._id.toString()] || 0;
      return convObj;
    });

    return res.status(200).json({
      status: 'success',
      results: conversationsWithUnread.length,
      conversations: conversationsWithUnread,
    });
  } catch (error) {
    console.error('[Get User Conversations Error]:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Error fetching conversations',
    });
  }
};

// @desc    Get conversation by ID
// @route   GET /api/conversations/:id
// @access  Private (JWT Protected)
const getConversationById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: 'fail',
        message: 'Invalid conversation ID format',
      });
    }

    const conversation = await Conversation.findById(id)
      .populate('participants', 'name email profileImage isOnline lastSeen')
      .populate('groupAdmin', 'name email profileImage isOnline lastSeen')
      .populate('lastMessageSender', 'name email profileImage');

    if (!conversation) {
      return res.status(404).json({
        status: 'fail',
        message: 'Conversation not found',
      });
    }

    // Verify user is a member of this conversation
    const isParticipant = conversation.participants.some(
      (p) => p._id.toString() === req.user._id.toString()
    );

    if (!isParticipant) {
      return res.status(403).json({
        status: 'fail',
        message: 'Not authorized to access this conversation',
      });
    }

    return res.status(200).json({
      status: 'success',
      conversation,
    });
  } catch (error) {
    console.error('[Get Conversation By ID Error]:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Error fetching conversation details',
    });
  }
};

// @desc    Create a new group conversation
// @route   POST /api/conversations/group
// @access  Private (JWT Protected)
const createGroupConversation = async (req, res) => {
  try {
    const { groupName, participants = [], groupImage = '' } = req.body;

    if (!groupName || !groupName.trim()) {
      return res.status(400).json({
        status: 'fail',
        message: 'Group name is required',
      });
    }

    if (!Array.isArray(participants)) {
      return res.status(400).json({
        status: 'fail',
        message: 'Participants must be an array of user IDs',
      });
    }

    // Include current user and eliminate duplicates
    const currentUserIdStr = req.user._id.toString();
    const rawIds = [
      ...participants.map((p) => (typeof p === 'object' && p._id ? p._id.toString() : p.toString())),
      currentUserIdStr,
    ];
    const uniqueIds = Array.from(new Set(rawIds)).filter((uid) => mongoose.Types.ObjectId.isValid(uid));

    if (uniqueIds.length < 2) {
      return res.status(400).json({
        status: 'fail',
        message: 'A group must have at least 2 members (including yourself)',
      });
    }

    // Validate all user IDs exist in database
    const validUsersCount = await User.countDocuments({ _id: { $in: uniqueIds } });
    if (validUsersCount !== uniqueIds.length) {
      return res.status(400).json({
        status: 'fail',
        message: 'One or more participant users do not exist',
      });
    }

    const conversation = await Conversation.create({
      participants: uniqueIds,
      isGroup: true,
      groupName: groupName.trim(),
      groupImage: groupImage || '',
      groupAdmin: [req.user._id],
      lastMessage: `Group "${groupName.trim()}" created`,
      lastMessageSender: req.user._id,
      lastMessageAt: new Date(),
    });

    const populated = await Conversation.findById(conversation._id)
      .populate('participants', 'name email profileImage isOnline lastSeen')
      .populate('groupAdmin', 'name email profileImage isOnline lastSeen')
      .populate('lastMessageSender', 'name email profileImage');

    const convObj = populated.toObject();
    convObj.unreadCount = 0;

    // Real-time notification to all participants
    const io = req.app.get('io');
    if (io) {
      uniqueIds.forEach((uid) => {
        io.to(uid.toString()).emit('group_created', convObj);
      });
    }

    return res.status(201).json({
      status: 'success',
      conversation: convObj,
    });
  } catch (error) {
    console.error('[Create Group Conversation Error]:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Error creating group conversation',
    });
  }
};

// @desc    Update group name and/or image
// @route   PUT /api/conversations/:id/group
// @access  Private (JWT Protected, Admin only)
const updateGroup = async (req, res) => {
  try {
    const { id } = req.params;
    const { groupName, groupImage } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: 'fail',
        message: 'Invalid conversation ID format',
      });
    }

    const conversation = await Conversation.findById(id);
    if (!conversation) {
      return res.status(404).json({
        status: 'fail',
        message: 'Conversation not found',
      });
    }

    if (!conversation.isGroup) {
      return res.status(400).json({
        status: 'fail',
        message: 'This conversation is not a group',
      });
    }

    const isAdmin = conversation.groupAdmin.some(
      (a) => a.toString() === req.user._id.toString()
    );
    if (!isAdmin) {
      return res.status(403).json({
        status: 'fail',
        message: 'Only group admins can update group information',
      });
    }

    if (groupName !== undefined) {
      if (!groupName.trim()) {
        return res.status(400).json({
          status: 'fail',
          message: 'Group name cannot be empty',
        });
      }
      conversation.groupName = groupName.trim();
    }

    if (groupImage !== undefined) {
      conversation.groupImage = groupImage;
    }

    await conversation.save();

    const populated = await Conversation.findById(id)
      .populate('participants', 'name email profileImage isOnline lastSeen')
      .populate('groupAdmin', 'name email profileImage isOnline lastSeen')
      .populate('lastMessageSender', 'name email profileImage');

    const io = req.app.get('io');
    if (io) {
      io.to(`conversation_${id}`).emit('group_updated', populated);
      conversation.participants.forEach((p) => {
        io.to(p.toString()).emit('conversation_updated', {
          conversationId: id,
          groupName: populated.groupName,
          groupImage: populated.groupImage,
        });
      });
    }

    return res.status(200).json({
      status: 'success',
      conversation: populated,
    });
  } catch (error) {
    console.error('[Update Group Error]:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Error updating group',
    });
  }
};

// @desc    Add members to group
// @route   PUT /api/conversations/:id/members/add
// @access  Private (JWT Protected, Admin only)
const addGroupMembers = async (req, res) => {
  try {
    const { id } = req.params;
    let { memberIds, memberId } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ status: 'fail', message: 'Invalid conversation ID' });
    }

    const toAdd = memberIds
      ? (Array.isArray(memberIds) ? memberIds : [memberIds])
      : (memberId ? [memberId] : []);

    if (toAdd.length === 0) {
      return res.status(400).json({ status: 'fail', message: 'No members provided to add' });
    }

    const conversation = await Conversation.findById(id);
    if (!conversation) {
      return res.status(404).json({ status: 'fail', message: 'Conversation not found' });
    }

    if (!conversation.isGroup) {
      return res.status(400).json({ status: 'fail', message: 'This conversation is not a group' });
    }

    const isAdmin = conversation.groupAdmin.some((a) => a.toString() === req.user._id.toString());
    if (!isAdmin) {
      return res.status(403).json({ status: 'fail', message: 'Only group admins can add members' });
    }

    const validToAdd = toAdd.filter((mId) => mongoose.Types.ObjectId.isValid(mId));
    const existingParticipants = new Set(conversation.participants.map((p) => p.toString()));
    const newMembers = validToAdd.filter((mId) => !existingParticipants.has(mId.toString()));

    if (newMembers.length === 0) {
      return res.status(400).json({
        status: 'fail',
        message: 'All specified users are already members of this group',
      });
    }

    const usersExist = await User.find({ _id: { $in: newMembers } });
    if (usersExist.length !== newMembers.length) {
      return res.status(400).json({ status: 'fail', message: 'One or more users do not exist' });
    }

    newMembers.forEach((mId) => conversation.participants.push(mId));
    await conversation.save();

    const populated = await Conversation.findById(id)
      .populate('participants', 'name email profileImage isOnline lastSeen')
      .populate('groupAdmin', 'name email profileImage isOnline lastSeen')
      .populate('lastMessageSender', 'name email profileImage');

    const io = req.app.get('io');
    if (io) {
      io.to(`conversation_${id}`).emit('member_added', {
        conversation: populated,
        addedMembers: usersExist,
      });
      newMembers.forEach((mId) => {
        io.to(mId.toString()).emit('group_created', populated);
      });
    }

    return res.status(200).json({
      status: 'success',
      conversation: populated,
    });
  } catch (error) {
    console.error('[Add Group Members Error]:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Error adding members to group',
    });
  }
};

// @desc    Remove member from group
// @route   PUT /api/conversations/:id/members/remove
// @access  Private (JWT Protected, Admin only)
const removeGroupMember = async (req, res) => {
  try {
    const { id } = req.params;
    const { memberId } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(memberId)) {
      return res.status(400).json({ status: 'fail', message: 'Invalid ID format' });
    }

    const conversation = await Conversation.findById(id);
    if (!conversation) {
      return res.status(404).json({ status: 'fail', message: 'Conversation not found' });
    }

    if (!conversation.isGroup) {
      return res.status(400).json({ status: 'fail', message: 'This conversation is not a group' });
    }

    const isAdmin = conversation.groupAdmin.some((a) => a.toString() === req.user._id.toString());
    if (!isAdmin) {
      return res.status(403).json({ status: 'fail', message: 'Only group admins can remove members' });
    }

    if (memberId.toString() === req.user._id.toString()) {
      return res.status(400).json({
        status: 'fail',
        message: 'Cannot remove yourself via this endpoint. Use leave group instead.',
      });
    }

    const isMember = conversation.participants.some((p) => p.toString() === memberId.toString());
    if (!isMember) {
      return res.status(400).json({ status: 'fail', message: 'User is not a member of this group' });
    }

    conversation.participants = conversation.participants.filter(
      (p) => p.toString() !== memberId.toString()
    );
    conversation.groupAdmin = conversation.groupAdmin.filter(
      (a) => a.toString() !== memberId.toString()
    );

    // If no admin left, assign first remaining participant
    if (conversation.groupAdmin.length === 0 && conversation.participants.length > 0) {
      conversation.groupAdmin.push(conversation.participants[0]);
    }

    await conversation.save();

    const populated = await Conversation.findById(id)
      .populate('participants', 'name email profileImage isOnline lastSeen')
      .populate('groupAdmin', 'name email profileImage isOnline lastSeen')
      .populate('lastMessageSender', 'name email profileImage');

    const io = req.app.get('io');
    if (io) {
      io.to(`conversation_${id}`).emit('member_removed', {
        conversationId: id,
        memberId,
        conversation: populated,
      });
      io.to(memberId.toString()).emit('group_removed', { conversationId: id });
    }

    return res.status(200).json({
      status: 'success',
      conversation: populated,
    });
  } catch (error) {
    console.error('[Remove Group Member Error]:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Error removing member from group',
    });
  }
};

// @desc    Toggle or promote/demote group admin status
// @route   PUT /api/conversations/:id/admins/toggle
// @access  Private (JWT Protected, Admin only)
const toggleGroupAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const { memberId, action } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(memberId)) {
      return res.status(400).json({ status: 'fail', message: 'Invalid ID format' });
    }

    const conversation = await Conversation.findById(id);
    if (!conversation) {
      return res.status(404).json({ status: 'fail', message: 'Conversation not found' });
    }

    if (!conversation.isGroup) {
      return res.status(400).json({ status: 'fail', message: 'This conversation is not a group' });
    }

    const isCurrentAdmin = conversation.groupAdmin.some((a) => a.toString() === req.user._id.toString());
    if (!isCurrentAdmin) {
      return res.status(403).json({ status: 'fail', message: 'Only group admins can manage admin roles' });
    }

    const isMember = conversation.participants.some((p) => p.toString() === memberId.toString());
    if (!isMember) {
      return res.status(400).json({ status: 'fail', message: 'User must be a member of the group' });
    }

    const targetIsAdmin = conversation.groupAdmin.some((a) => a.toString() === memberId.toString());

    if (action === 'demote' || (action === undefined && targetIsAdmin)) {
      if (!targetIsAdmin) {
        return res.status(400).json({ status: 'fail', message: 'User is not an admin' });
      }
      if (conversation.groupAdmin.length <= 1) {
        return res.status(400).json({
          status: 'fail',
          message: 'Cannot demote the only remaining admin. Assign another admin first.',
        });
      }
      conversation.groupAdmin = conversation.groupAdmin.filter(
        (a) => a.toString() !== memberId.toString()
      );
    } else {
      if (targetIsAdmin) {
        return res.status(400).json({ status: 'fail', message: 'User is already an admin' });
      }
      conversation.groupAdmin.push(memberId);
    }

    await conversation.save();

    const populated = await Conversation.findById(id)
      .populate('participants', 'name email profileImage isOnline lastSeen')
      .populate('groupAdmin', 'name email profileImage isOnline lastSeen')
      .populate('lastMessageSender', 'name email profileImage');

    const io = req.app.get('io');
    if (io) {
      io.to(`conversation_${id}`).emit('group_updated', populated);
    }

    return res.status(200).json({
      status: 'success',
      conversation: populated,
    });
  } catch (error) {
    console.error('[Toggle Group Admin Error]:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Error updating group admin status',
    });
  }
};

// @desc    Leave a group conversation
// @route   PUT /api/conversations/:id/leave
// @access  Private (JWT Protected)
const leaveGroup = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ status: 'fail', message: 'Invalid conversation ID' });
    }

    const conversation = await Conversation.findById(id);
    if (!conversation) {
      return res.status(404).json({ status: 'fail', message: 'Conversation not found' });
    }

    if (!conversation.isGroup) {
      return res.status(400).json({ status: 'fail', message: 'This conversation is not a group' });
    }

    const isMember = conversation.participants.some((p) => p.toString() === req.user._id.toString());
    if (!isMember) {
      return res.status(400).json({ status: 'fail', message: 'You are not a member of this group' });
    }

    conversation.participants = conversation.participants.filter(
      (p) => p.toString() !== req.user._id.toString()
    );
    conversation.groupAdmin = conversation.groupAdmin.filter(
      (a) => a.toString() !== req.user._id.toString()
    );

    // If remaining participants exist but no admins, promote the first participant
    if (conversation.participants.length > 0 && conversation.groupAdmin.length === 0) {
      conversation.groupAdmin.push(conversation.participants[0]);
    }

    await conversation.save();

    const populated = await Conversation.findById(id)
      .populate('participants', 'name email profileImage isOnline lastSeen')
      .populate('groupAdmin', 'name email profileImage isOnline lastSeen')
      .populate('lastMessageSender', 'name email profileImage');

    const io = req.app.get('io');
    if (io) {
      io.to(`conversation_${id}`).emit('group_left', {
        conversationId: id,
        userId: req.user._id,
        userName: req.user.name,
        conversation: populated,
      });
      io.to(req.user._id.toString()).emit('group_removed', { conversationId: id });
    }

    return res.status(200).json({
      status: 'success',
      message: 'Left group successfully',
      conversation: populated,
    });
  } catch (error) {
    console.error('[Leave Group Error]:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Error leaving group',
    });
  }
};

// @desc    Delete a conversation
// @route   DELETE /api/conversations/:id
// @access  Private (JWT Protected)
const deleteConversation = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: 'fail',
        message: 'Invalid conversation ID format',
      });
    }

    const conversation = await Conversation.findById(id);

    if (!conversation) {
      return res.status(404).json({
        status: 'fail',
        message: 'Conversation not found',
      });
    }

    const isParticipant = conversation.participants.some(
      (p) => p.toString() === req.user._id.toString()
    );

    if (!isParticipant) {
      return res.status(403).json({
        status: 'fail',
        message: 'Not authorized to delete this conversation',
      });
    }

    await Conversation.findByIdAndDelete(id);

    return res.status(200).json({
      status: 'success',
      message: 'Conversation deleted successfully',
    });
  } catch (error) {
    console.error('[Delete Conversation Error]:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Error deleting conversation',
    });
  }
};

// @desc    Clear all messages in a conversation
// @route   DELETE /api/conversations/:id/messages
// @access  Private (JWT Protected)
const clearConversationMessages = async (req, res) => {
  try {
    const { id } = req.params;

    const conversation = await Conversation.findById(id);
    if (!conversation) {
      return res.status(404).json({
        status: 'fail',
        message: 'Conversation not found',
      });
    }

    const isParticipant = conversation.participants.some(
      (p) => p.toString() === req.user._id.toString()
    );

    if (!isParticipant) {
      return res.status(403).json({
        status: 'fail',
        message: 'Not authorized to clear this conversation',
      });
    }

    // Delete all messages for this conversation
    await Message.deleteMany({ conversationId: id });

    // Reset last message metadata
    conversation.lastMessage = '';
    conversation.lastMessageSender = null;
    conversation.lastMessageAt = new Date();
    await conversation.save();

    return res.status(200).json({
      status: 'success',
      message: 'Chat history cleared successfully',
    });
  } catch (error) {
    console.error('[Clear Chat Error]:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Error clearing chat history',
    });
  }
};

module.exports = {
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
};

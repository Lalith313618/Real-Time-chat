const mongoose = require('mongoose');
const User = require('../models/user.model');

/**
 * Extracts and sanitizes mention user IDs from:
 * 1. Provided mentions array (IDs or objects with _id)
 * 2. Optional text parsing of @username patterns
 * Returns an array of unique mongoose.Types.ObjectId.
 */
const parseMentionIds = async (mentions, content = '') => {
  const mentionIdSet = new Set();

  // 1. Process explicit mentions array
  if (Array.isArray(mentions)) {
    for (const m of mentions) {
      const rawId = typeof m === 'object' && m !== null ? (m._id || m.id) : m;
      if (rawId && mongoose.Types.ObjectId.isValid(rawId.toString())) {
        mentionIdSet.add(rawId.toString());
      }
    }
  }

  // 2. Parse @mention from content if any
  if (content && typeof content === 'string') {
    const matches = content.match(/@([a-zA-Z0-9_\-\.]+)/g);
    if (matches && matches.length > 0) {
      const handles = matches.map((m) => m.slice(1).trim()).filter(Boolean);
      if (handles.length > 0) {
        const regexes = handles.map((h) => new RegExp(`^${h}`, 'i'));
        const matchedUsers = await User.find({
          $or: [
            { name: { $in: regexes } },
            { email: { $in: regexes } },
          ],
        }).select('_id');

        matchedUsers.forEach((u) => mentionIdSet.add(u._id.toString()));
      }
    }
  }

  return Array.from(mentionIdSet).map((id) => new mongoose.Types.ObjectId(id));
};

const { createAndSendNotification } = require('./notification.helper');

/**
 * Emits real-time notification to all mentioned users
 */
const notifyMentionedUsers = (io, message, senderUser, context = {}) => {
  if (!io || !message || !message.mentions || message.mentions.length === 0) return;

  const senderId = (senderUser?._id || senderUser)?.toString();

  message.mentions.forEach((m) => {
    const targetUserId = (m?._id || m)?.toString();
    // Do not notify self
    if (targetUserId && targetUserId !== senderId) {
      io.to(targetUserId).emit('user_mentioned', {
        messageId: message._id,
        sender: {
          _id: senderUser?._id || senderId,
          name: senderUser?.name || 'Teammate',
          profileImage: senderUser?.profileImage || '',
          email: senderUser?.email || '',
        },
        channelId: message.channelId || context.channelId || null,
        conversationId: message.conversationId || context.conversationId || null,
        parentMessageId: message.parentMessageId || context.parentMessageId || null,
        channelName: context.channelName || '',
        teamName: context.teamName || '',
        content: message.content,
        createdAt: message.createdAt || new Date(),
      });

      // Also create persistent notification in Notification Center
      createAndSendNotification(io, {
        recipient: targetUserId,
        sender: senderId,
        organization: context.organizationId || undefined,
        type: 'MENTION',
        title: `${senderUser?.name || 'Teammate'} mentioned you${context.channelName ? ' in #' + context.channelName : ''}`,
        content: message.content ? message.content.slice(0, 150) : '',
        link: context.channelId && context.teamId
          ? `/teams/${context.teamId}/channels/${context.channelId}`
          : (context.conversationId ? `/chat/${context.conversationId}` : '/teams'),
        metadata: {
          messageId: message._id,
          channelId: message.channelId || context.channelId,
          teamId: context.teamId,
          conversationId: message.conversationId || context.conversationId,
          channelName: context.channelName,
          teamName: context.teamName,
        },
      });
    }
  });
};

module.exports = {
  parseMentionIds,
  notifyMentionedUsers,
};

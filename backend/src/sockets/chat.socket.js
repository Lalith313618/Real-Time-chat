const { verifyToken } = require('../config/jwt');
const User = require('../models/user.model');
const Message = require('../models/message.model');
const Conversation = require('../models/conversation.model');
const Channel = require('../models/channel.model');
const { parseMentionIds, notifyMentionedUsers } = require('../utils/mention.helper');

// In-memory mapping of active users to set of their socket IDs
const onlineUsers = new Map();

const initChatSockets = (io) => {
  // Socket.IO Authentication Middleware
  io.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) {
        return next(new Error('Authentication error: No token provided'));
      }

      const decoded = verifyToken(token);
      const user = await User.findById(decoded.id).select('-password');
      if (!user) {
        return next(new Error('Authentication error: User not found'));
      }

      socket.user = user;
      next();
    } catch (err) {
      console.error('[Socket Auth Error]:', err.message);
      next(new Error('Authentication error: Invalid or expired token'));
    }
  });

  io.on('connection', async (socket) => {
    const user = socket.user;
    const userIdStr = user._id.toString();
    console.log(`[Socket] User connected: ${user.name} (${userIdStr}) [Socket ID: ${socket.id}]`);

    // Auto-join organization room if user has organization
    if (user.organization) {
      socket.join(`org_${user.organization.toString()}`);
    }

    // Manage online status
    if (!onlineUsers.has(userIdStr)) {
      onlineUsers.set(userIdStr, new Set());
      // First connection for this user - mark online in DB and broadcast
      try {
        await User.findByIdAndUpdate(user._id, { isOnline: true });
        io.emit('user_online', { userId: userIdStr });

        // Deliver any undelivered messages to this newly connected user
        const userConversations = await Conversation.find({ participants: user._id }).select('_id');
        const convIds = userConversations.map((c) => c._id);
        if (convIds.length > 0) {
          const undeliveredResult = await Message.updateMany(
            {
              conversationId: { $in: convIds },
              sender: { $ne: user._id },
              deliveredTo: { $ne: user._id },
            },
            {
              $addToSet: { deliveredTo: user._id },
            }
          );
          if (undeliveredResult.modifiedCount > 0) {
            convIds.forEach((cId) => {
              io.to(`conversation_${cId}`).emit('messages_delivered', {
                conversationId: cId.toString(),
                userId: userIdStr,
              });
            });
          }
        }
      } catch (e) {
        console.error('Error updating online status:', e);
      }
    }
    onlineUsers.get(userIdStr).add(socket.id);

    // Join personal user room for targeted notifications/events
    socket.join(userIdStr);

    // Request currently online users list
    socket.on('get_online_users', (callback) => {
      if (typeof callback === 'function') {
        callback({
          status: 'success',
          onlineUsers: Array.from(onlineUsers.keys()),
        });
      }
    });

    // Join a conversation room
    socket.on('join_conversation', (data, callback) => {
      const convId = typeof data === 'object' && data !== null ? data.conversationId : data;
      if (!convId) return;
      const room = `conversation_${convId}`;
      socket.join(room);
      console.log(`[Socket] ${user.name} (${userIdStr}) joined room: ${room}`);
      const cb = typeof callback === 'function' ? callback : (typeof data === 'function' ? data : null);
      if (typeof cb === 'function') {
        cb({ status: 'success', room });
      }
    });

    // Leave a conversation room
    socket.on('leave_conversation', (data, callback) => {
      const convId = typeof data === 'object' && data !== null ? data.conversationId : data;
      if (!convId) return;
      const room = `conversation_${convId}`;
      socket.leave(room);
      console.log(`[Socket] ${user.name} (${userIdStr}) left room: ${room}`);
      const cb = typeof callback === 'function' ? callback : (typeof data === 'function' ? data : null);
      if (typeof cb === 'function') {
        cb({ status: 'success', room });
      }
    });

    // Mark messages in conversation as read
    socket.on('mark_read', async (data, callback) => {
      try {
        const { conversationId } = data || {};
        if (!conversationId) return;

        const updateResult = await Message.updateMany(
          {
            conversationId,
            sender: { $ne: user._id },
            readBy: { $ne: user._id },
          },
          {
            $addToSet: {
              readBy: user._id,
              deliveredTo: user._id,
            },
          }
        );

        const room = `conversation_${conversationId}`;
        console.log(`[Socket] Broadcasting messages_read to room: ${room} from reader: ${userIdStr}`);
        io.to(room).emit('messages_read', {
          conversationId,
          readerId: userIdStr,
          readAt: new Date(),
        });

        // Notify reader to clear unread badge locally
        socket.emit('unread_cleared', { conversationId });

        if (typeof callback === 'function') {
          callback({ status: 'success', modifiedCount: updateResult.modifiedCount });
        }
      } catch (err) {
        console.error('[Socket mark_read Error]:', err);
        if (typeof callback === 'function') callback({ status: 'error', message: err.message });
      }
    });

    // Mark messages in conversation as delivered
    socket.on('mark_delivered', async (data, callback) => {
      try {
        const { conversationId } = data || {};
        if (!conversationId) return;

        await Message.updateMany(
          {
            conversationId,
            sender: { $ne: user._id },
            deliveredTo: { $ne: user._id },
          },
          {
            $addToSet: { deliveredTo: user._id },
          }
        );

        io.to(`conversation_${conversationId}`).emit('messages_delivered', {
          conversationId,
          userId: userIdStr,
        });

        if (typeof callback === 'function') callback({ status: 'success' });
      } catch (err) {
        console.error('[Socket mark_delivered Error]:', err);
      }
    });

    // Typing start indicator
    socket.on('typing_start', ({ conversationId }) => {
      if (!conversationId) return;
      const room = `conversation_${conversationId}`;
      socket.to(room).emit('typing_start', {
        conversationId,
        userId: userIdStr,
        userName: user.name,
      });
    });

    // Typing stop indicator
    socket.on('typing_stop', ({ conversationId }) => {
      if (!conversationId) return;
      const room = `conversation_${conversationId}`;
      socket.to(room).emit('typing_stop', {
        conversationId,
        userId: userIdStr,
      });
    });

    // Real-time message dispatch
    socket.on('send_message', async (data, callback) => {
      try {
        const {
          conversationId,
          content,
          messageType = 'text',
          fileUrl = '',
          fileName = '',
          fileSize = 0,
          duration = 0,
          replyTo = null,
          mentions = [],
        } = data;

        if (!conversationId || ((!content || !content.trim()) && !fileUrl)) {
          if (callback) callback({ status: 'fail', message: 'Invalid message payload' });
          return;
        }

        const conversation = await Conversation.findById(conversationId);
        if (!conversation) {
          if (callback) callback({ status: 'fail', message: 'Conversation not found' });
          return;
        }

        // Verify sender is participant
        const isParticipant = conversation.participants.some(
          (p) => p.toString() === userIdStr
        );
        if (!isParticipant) {
          if (callback) callback({ status: 'fail', message: 'Not authorized for this conversation' });
          return;
        }

        // Check if other participants are currently online for instant delivery
        const initialDeliveredTo = [user._id];
        conversation.participants.forEach((pId) => {
          const pStr = pId.toString();
          if (pStr !== userIdStr && onlineUsers.has(pStr)) {
            initialDeliveredTo.push(pId);
          }
        });

        const mentionUserIds = await parseMentionIds(mentions, content);

        // Create message in MongoDB
        const message = await Message.create({
          conversationId,
          sender: user._id,
          content: content ? content.trim() : '',
          messageType,
          fileUrl: fileUrl || '',
          fileName: fileName || '',
          fileSize: fileSize || 0,
          duration: duration || 0,
          replyTo: replyTo || null,
          mentions: mentionUserIds,
          deliveredTo: initialDeliveredTo,
          readBy: [user._id],
        });

        // Update conversation summary
        const preview =
          messageType === 'text'
            ? (content || '')
            : messageType === 'image'
              ? '📷 Photo'
              : messageType === 'file'
                ? `📎 ${fileName || 'Attachment'}`
                : messageType === 'audio'
                  ? '🎙️ Voice message'
                  : `[${messageType.toUpperCase()}]`;

        conversation.lastMessage = preview;
        conversation.lastMessageSender = user._id;
        conversation.lastMessageAt = new Date();
        await conversation.save();

        // Populate sender & replyTo
        const populated = await Message.findById(message._id)
          .populate('sender', 'name email profileImage isOnline lastSeen')
          .populate('mentions', 'name email profileImage jobTitle department')
          .populate({
            path: 'replyTo',
            select: 'content sender messageType isDeleted',
            populate: { path: 'sender', select: 'name email' },
          });

        const room = `conversation_${conversationId}`;

        // 1. Broadcast new message to conversation room
        io.to(room).emit('new_message', populated);

        // 2. Notify mentioned users
        notifyMentionedUsers(io, populated, user, { conversationId });

        // 2. Also automatically broadcast typing_stop for this user in this conversation
        socket.to(room).emit('typing_stop', {
          conversationId,
          userId: userIdStr,
        });

        // 3. Broadcast conversation update to participants' individual rooms
        conversation.participants.forEach((participantId) => {
          io.to(participantId.toString()).emit('conversation_updated', {
            conversationId,
            lastMessage: preview,
            lastMessageSender: user._id,
            lastMessageAt: conversation.lastMessageAt,
          });
        });

        if (callback) {
          callback({ status: 'success', message: populated });
        }
      } catch (error) {
        console.error('[Socket send_message Error]:', error);
        if (callback) callback({ status: 'error', message: error.message });
      }
    });

    // Real-time message edit
    socket.on('edit_message', async (data, callback) => {
      try {
        const { messageId, conversationId, content } = data;
        if (!messageId || !content || !content.trim()) {
          if (callback) callback({ status: 'fail', message: 'Invalid edit payload' });
          return;
        }

        const message = await Message.findById(messageId);
        if (!message || message.sender.toString() !== userIdStr || message.isDeleted) {
          if (callback) callback({ status: 'fail', message: 'Cannot edit this message' });
          return;
        }

        message.content = content.trim();
        message.isEdited = true;
        await message.save();

        const populated = await Message.findById(message._id)
          .populate('sender', 'name email profileImage isOnline lastSeen')
          .populate({
            path: 'replyTo',
            select: 'content sender messageType isDeleted',
            populate: { path: 'sender', select: 'name email' },
          });

        const room = `conversation_${conversationId || message.conversationId}`;
        io.to(room).emit('message_edited', populated);

        if (callback) callback({ status: 'success', message: populated });
      } catch (error) {
        console.error('[Socket edit_message Error]:', error);
        if (callback) callback({ status: 'error', message: error.message });
      }
    });

    // Real-time message delete
    socket.on('delete_message', async (data, callback) => {
      try {
        const { messageId, conversationId } = data;
        if (!messageId) return;

        const message = await Message.findById(messageId);
        if (!message || message.sender.toString() !== userIdStr) {
          if (callback) callback({ status: 'fail', message: 'Cannot delete this message' });
          return;
        }

        message.isDeleted = true;
        message.content = 'This message was deleted';
        message.fileUrl = '';
        await message.save();

        const room = `conversation_${conversationId || message.conversationId}`;
        io.to(room).emit('message_deleted', {
          messageId: message._id,
          conversationId: message.conversationId,
          content: message.content,
          isDeleted: true,
        });

        if (callback) callback({ status: 'success', messageId: message._id });
      } catch (error) {
        console.error('[Socket delete_message Error]:', error);
        if (callback) callback({ status: 'error', message: error.message });
      }
    });

    // Real-time clear chat history
    socket.on('clear_chat', (data) => {
      const { conversationId } = data || {};
      if (!conversationId) return;
      const room = `conversation_${conversationId}`;
      io.to(room).emit('chat_cleared', {
        conversationId,
        clearedBy: userIdStr,
      });
    });

    // ==========================================
    // REAL-TIME CHANNEL CHAT SOCKET EVENTS
    // ==========================================

    // Join a channel room
    socket.on('join_channel', (data, callback) => {
      const channelId = typeof data === 'object' && data !== null ? data.channelId : data;
      if (!channelId) return;
      const room = `channel_${channelId}`;
      socket.join(room);
      console.log(`[Socket] ${user.name} (${userIdStr}) joined channel room: ${room}`);
      const cb = typeof callback === 'function' ? callback : (typeof data === 'function' ? data : null);
      if (typeof cb === 'function') {
        cb({ status: 'success', room });
      }
    });

    // Leave a channel room
    socket.on('leave_channel', (data, callback) => {
      const channelId = typeof data === 'object' && data !== null ? data.channelId : data;
      if (!channelId) return;
      const room = `channel_${channelId}`;
      socket.leave(room);
      console.log(`[Socket] ${user.name} (${userIdStr}) left channel room: ${room}`);
      const cb = typeof callback === 'function' ? callback : (typeof data === 'function' ? data : null);
      if (typeof cb === 'function') {
        cb({ status: 'success', room });
      }
    });

    // Join a team room
    socket.on('join_team', (data, callback) => {
      const teamId = typeof data === 'object' && data !== null ? data.teamId : data;
      if (!teamId) return;
      const room = `team_${teamId}`;
      socket.join(room);
      const cb = typeof callback === 'function' ? callback : (typeof data === 'function' ? data : null);
      if (typeof cb === 'function') cb({ status: 'success', room });
    });

    // Leave a team room
    socket.on('leave_team', (data, callback) => {
      const teamId = typeof data === 'object' && data !== null ? data.teamId : data;
      if (!teamId) return;
      const room = `team_${teamId}`;
      socket.leave(room);
      const cb = typeof callback === 'function' ? callback : (typeof data === 'function' ? data : null);
      if (typeof cb === 'function') cb({ status: 'success', room });
    });

    // Join an organization room
    socket.on('join_org', (data, callback) => {
      const orgId = typeof data === 'object' && data !== null ? data.orgId : data;
      if (!orgId) return;
      const room = `org_${orgId}`;
      socket.join(room);
      const cb = typeof callback === 'function' ? callback : (typeof data === 'function' ? data : null);
      if (typeof cb === 'function') cb({ status: 'success', room });
    });

    // Leave an organization room
    socket.on('leave_org', (data, callback) => {
      const orgId = typeof data === 'object' && data !== null ? data.orgId : data;
      if (!orgId) return;
      const room = `org_${orgId}`;
      socket.leave(room);
      const cb = typeof callback === 'function' ? callback : (typeof data === 'function' ? data : null);
      if (typeof cb === 'function') cb({ status: 'success', room });
    });

    // Channel typing start
    socket.on('channel_typing_start', ({ channelId }) => {
      if (!channelId) return;
      const room = `channel_${channelId}`;
      socket.to(room).emit('channel_typing_start', {
        channelId,
        userId: userIdStr,
        userName: user.name,
      });
    });

    // Channel typing stop
    socket.on('channel_typing_stop', ({ channelId }) => {
      if (!channelId) return;
      const room = `channel_${channelId}`;
      socket.to(room).emit('channel_typing_stop', {
        channelId,
        userId: userIdStr,
      });
    });

    // Real-time send channel message
    socket.on('send_channel_message', async (data, callback) => {
      try {
        const {
          channelId,
          content,
          messageType = 'text',
          fileUrl = '',
          fileName = '',
          fileSize = 0,
          duration = 0,
          replyTo = null,
          mentions = [],
        } = data;

        if (!channelId || ((!content || !content.trim()) && !fileUrl)) {
          if (callback) callback({ status: 'fail', message: 'Invalid channel message payload' });
          return;
        }

        const channel = await Channel.findById(channelId);
        if (!channel) {
          if (callback) callback({ status: 'fail', message: 'Channel not found' });
          return;
        }

        const mentionUserIds = await parseMentionIds(mentions, content);

        const message = await Message.create({
          channelId,
          sender: user._id,
          content: content ? content.trim() : '',
          messageType,
          fileUrl: fileUrl || '',
          fileName: fileName || '',
          fileSize: fileSize || 0,
          duration: duration || 0,
          replyTo: replyTo || null,
          mentions: mentionUserIds,
          deliveredTo: [user._id],
          readBy: [user._id],
        });

        const populated = await Message.findById(message._id)
          .populate('sender', 'name email profileImage isOnline lastSeen jobTitle department')
          .populate('mentions', 'name email profileImage jobTitle department')
          .populate({
            path: 'replyTo',
            select: 'content sender messageType isDeleted',
            populate: { path: 'sender', select: 'name email' },
          });

        const room = `channel_${channelId}`;
        io.to(room).emit('new_channel_message', populated);

        // Real-time mention alert
        notifyMentionedUsers(io, populated, user, {
          channelId,
          channelName: channel.name,
        });

        socket.to(room).emit('channel_typing_stop', {
          channelId,
          userId: userIdStr,
        });

        if (callback) {
          callback({ status: 'success', message: populated });
        }
      } catch (error) {
        console.error('[Socket send_channel_message Error]:', error);
        if (callback) callback({ status: 'error', message: error.message });
      }
    });

    // Real-time edit channel message
    socket.on('edit_channel_message', async (data, callback) => {
      try {
        const { messageId, channelId, content } = data;
        if (!messageId || !content || !content.trim()) {
          if (callback) callback({ status: 'fail', message: 'Invalid edit payload' });
          return;
        }

        const message = await Message.findById(messageId);
        if (!message || message.sender.toString() !== userIdStr || message.isDeleted) {
          if (callback) callback({ status: 'fail', message: 'Cannot edit this message' });
          return;
        }

        message.content = content.trim();
        message.isEdited = true;
        await message.save();

        const populated = await Message.findById(message._id)
          .populate('sender', 'name email profileImage isOnline lastSeen jobTitle department')
          .populate({
            path: 'replyTo',
            select: 'content sender messageType isDeleted',
            populate: { path: 'sender', select: 'name email' },
          });

        const room = `channel_${channelId || message.channelId}`;
        io.to(room).emit('channel_message_edited', populated);

        if (callback) callback({ status: 'success', message: populated });
      } catch (error) {
        console.error('[Socket edit_channel_message Error]:', error);
        if (callback) callback({ status: 'error', message: error.message });
      }
    });

    // Real-time delete channel message
    socket.on('delete_channel_message', async (data, callback) => {
      try {
        const { messageId, channelId } = data;
        if (!messageId) return;

        const message = await Message.findById(messageId);
        if (!message || message.sender.toString() !== userIdStr) {
          if (callback) callback({ status: 'fail', message: 'Cannot delete this message' });
          return;
        }

        message.isDeleted = true;
        message.content = 'This message was deleted';
        message.fileUrl = '';
        await message.save();

        const room = `channel_${channelId || message.channelId}`;
        io.to(room).emit('channel_message_deleted', {
          messageId: message._id,
          channelId: message.channelId,
          content: message.content,
          isDeleted: true,
        });

        if (callback) callback({ status: 'success', messageId: message._id });
      } catch (error) {
        console.error('[Socket delete_channel_message Error]:', error);
        if (callback) callback({ status: 'error', message: error.message });
      }
    });

    // ==========================================
    // REAL-TIME THREAD REPLIES SOCKET EVENTS
    // ==========================================

    // Join a thread room
    socket.on('join_thread', (data, callback) => {
      const messageId = typeof data === 'object' && data !== null ? data.messageId : data;
      if (!messageId) return;
      const room = `thread_${messageId}`;
      socket.join(room);
      console.log(`[Socket] ${user.name} (${userIdStr}) joined thread room: ${room}`);
      const cb = typeof callback === 'function' ? callback : (typeof data === 'function' ? data : null);
      if (typeof cb === 'function') cb({ status: 'success', room });
    });

    // Leave a thread room
    socket.on('leave_thread', (data, callback) => {
      const messageId = typeof data === 'object' && data !== null ? data.messageId : data;
      if (!messageId) return;
      const room = `thread_${messageId}`;
      socket.leave(room);
      console.log(`[Socket] ${user.name} (${userIdStr}) left thread room: ${room}`);
      const cb = typeof callback === 'function' ? callback : (typeof data === 'function' ? data : null);
      if (typeof cb === 'function') cb({ status: 'success', room });
    });

    // Thread typing start
    socket.on('thread_typing_start', ({ messageId }) => {
      if (!messageId) return;
      const room = `thread_${messageId}`;
      socket.to(room).emit('thread_typing_start', {
        messageId,
        userId: userIdStr,
        userName: user.name,
      });
    });

    // Thread typing stop
    socket.on('thread_typing_stop', ({ messageId }) => {
      if (!messageId) return;
      const room = `thread_${messageId}`;
      socket.to(room).emit('thread_typing_stop', {
        messageId,
        userId: userIdStr,
      });
    });

    // Send thread reply via socket
    socket.on('send_thread_reply', async (data, callback) => {
      try {
        const {
          messageId,
          content,
          messageType = 'text',
          fileUrl = '',
          fileName = '',
          fileSize = 0,
          mentions = [],
        } = data;

        if (!messageId || ((!content || !content.trim()) && !fileUrl)) {
          if (callback) callback({ status: 'fail', message: 'Invalid thread reply payload' });
          return;
        }

        let targetRoot = await Message.findById(messageId);
        if (!targetRoot) {
          if (callback) callback({ status: 'fail', message: 'Target message not found' });
          return;
        }

        if (targetRoot.parentMessageId) {
          targetRoot = await Message.findById(targetRoot.parentMessageId);
          if (!targetRoot) {
            if (callback) callback({ status: 'fail', message: 'Root thread message not found' });
            return;
          }
        }

        const mentionUserIds = await parseMentionIds(mentions, content);

        const reply = await Message.create({
          parentMessageId: targetRoot._id,
          conversationId: targetRoot.conversationId || undefined,
          channelId: targetRoot.channelId || undefined,
          sender: user._id,
          content: content ? content.trim() : '',
          messageType,
          fileUrl,
          fileName,
          fileSize,
          mentions: mentionUserIds,
          deliveredTo: [user._id],
          readBy: [user._id],
        });

        targetRoot.threadCount = (targetRoot.threadCount || 0) + 1;
        targetRoot.threadLastReplyAt = new Date();
        if (!targetRoot.threadParticipants.some(p => p.toString() === user._id.toString())) {
          targetRoot.threadParticipants.push(user._id);
        }
        await targetRoot.save();

        const populatedReply = await Message.findById(reply._id)
          .populate('sender', 'name email profileImage isOnline lastSeen jobTitle department')
          .populate('mentions', 'name email profileImage jobTitle department');

        const populatedRoot = await Message.findById(targetRoot._id)
          .populate('sender', 'name email profileImage isOnline lastSeen jobTitle department')
          .populate('threadParticipants', 'name email profileImage isOnline lastSeen jobTitle department')
          .populate('mentions', 'name email profileImage jobTitle department');

        // Broadcast to thread room
        io.to(`thread_${targetRoot._id}`).emit('new_thread_reply', populatedReply);

        // Broadcast thread badge update to channel or conversation room
        const updatePayload = {
          rootMessageId: targetRoot._id,
          threadCount: targetRoot.threadCount,
          threadLastReplyAt: targetRoot.threadLastReplyAt,
          threadParticipants: populatedRoot.threadParticipants,
          latestReply: populatedReply,
        };

        if (targetRoot.channelId) {
          io.to(`channel_${targetRoot.channelId}`).emit('thread_updated', updatePayload);
        } else if (targetRoot.conversationId) {
          io.to(`conversation_${targetRoot.conversationId}`).emit('thread_updated', updatePayload);
        }

        // Notify mentioned users in thread
        notifyMentionedUsers(io, populatedReply, user, {
          parentMessageId: targetRoot._id,
          channelId: targetRoot.channelId,
          conversationId: targetRoot.conversationId,
        });

        socket.to(`thread_${targetRoot._id}`).emit('thread_typing_stop', {
          messageId: targetRoot._id,
          userId: userIdStr,
        });

        if (callback) callback({ status: 'success', reply: populatedReply, rootMessage: populatedRoot });
      } catch (err) {
        console.error('[Socket send_thread_reply Error]:', err);
        if (callback) callback({ status: 'error', message: err.message });
      }
    });

    // Real-time emoji reaction toggle
    socket.on('toggle_reaction', async (data, callback) => {
      try {
        const { messageId, emoji } = data;
        if (!messageId || !emoji || typeof emoji !== 'string' || !emoji.trim()) {
          if (callback) callback({ status: 'fail', message: 'Invalid reaction payload' });
          return;
        }

        const trimmedEmoji = emoji.trim();
        const message = await Message.findById(messageId);
        if (!message || message.isDeleted) {
          if (callback) callback({ status: 'fail', message: 'Message not found or deleted' });
          return;
        }

        if (!message.reactions) {
          message.reactions = [];
        }

        let existingReaction = message.reactions.find((r) => r.emoji === trimmedEmoji);

        if (existingReaction) {
          const userIdx = existingReaction.users.findIndex(
            (u) => u.toString() === userIdStr
          );

          if (userIdx > -1) {
            existingReaction.users.splice(userIdx, 1);
            if (existingReaction.users.length === 0) {
              message.reactions = message.reactions.filter((r) => r.emoji !== trimmedEmoji);
            }
          } else {
            existingReaction.users.push(user._id);
          }
        } else {
          message.reactions.push({
            emoji: trimmedEmoji,
            users: [user._id],
          });
        }

        await message.save();

        const populated = await Message.findById(message._id)
          .populate('reactions.users', 'name email profileImage');

        const updatePayload = {
          messageId: message._id,
          reactions: populated.reactions,
          channelId: message.channelId,
          conversationId: message.conversationId,
          parentMessageId: message.parentMessageId,
        };

        // Broadcast to channel, conversation, and thread rooms
        if (message.channelId) {
          io.to(`channel_${message.channelId}`).emit('message_reaction_updated', updatePayload);
        }
        if (message.conversationId) {
          io.to(`conversation_${message.conversationId}`).emit('message_reaction_updated', updatePayload);
        }
        if (message.parentMessageId) {
          io.to(`thread_${message.parentMessageId}`).emit('message_reaction_updated', updatePayload);
        }

        if (callback) callback({ status: 'success', messageId: message._id, reactions: populated.reactions });
      } catch (err) {
        console.error('[Socket toggle_reaction Error]:', err);
        if (callback) callback({ status: 'error', message: err.message });
      }
    });

    // Disconnect handler
    socket.on('disconnect', async () => {
      console.log(`[Socket] User disconnected: ${user.name} (${userIdStr})`);
      if (onlineUsers.has(userIdStr)) {
        const userSockets = onlineUsers.get(userIdStr);
        userSockets.delete(socket.id);

        if (userSockets.size === 0) {
          onlineUsers.delete(userIdStr);
          const lastSeenTime = new Date();
          try {
            await User.findByIdAndUpdate(user._id, {
              isOnline: false,
              lastSeen: lastSeenTime,
            });
            io.emit('user_offline', {
              userId: userIdStr,
              lastSeen: lastSeenTime,
            });
          } catch (e) {
            console.error('Error updating offline status:', e);
          }
        }
      }
    });
  });
};

module.exports = initChatSockets;

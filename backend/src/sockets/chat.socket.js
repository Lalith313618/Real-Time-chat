const { verifyToken } = require('../config/jwt');
const User = require('../models/user.model');
const Message = require('../models/message.model');
const Conversation = require('../models/conversation.model');

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
          .populate({
            path: 'replyTo',
            select: 'content sender messageType isDeleted',
            populate: { path: 'sender', select: 'name email' },
          });

        const room = `conversation_${conversationId}`;

        // 1. Broadcast new message to conversation room
        io.to(room).emit('new_message', populated);

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

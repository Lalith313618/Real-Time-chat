const mongoose = require('mongoose');
const Message = require('../models/message.model');
const Conversation = require('../models/conversation.model');
const { uploadFile } = require('../config/cloudinary');
const { parseMentionIds, notifyMentionedUsers } = require('../utils/mention.helper');

const uploadAttachment = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        status: 'fail',
        message: 'No file uploaded',
      });
    }

    const { target = 'message' } = req.query;
    let folder = 'chat_app/documents';
    if (target === 'avatar') {
      folder = 'chat_app/avatars';
    } else if (req.file.mimetype.startsWith('image/')) {
      folder = 'chat_app/images';
    } else if (req.file.mimetype.startsWith('audio/')) {
      folder = 'chat_app/audio';
    } else if (req.file.mimetype.startsWith('video/')) {
      folder = 'chat_app/videos';
    }

    const result = await uploadFile(req.file.buffer, {
      folder,
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      req,
    });

    return res.status(200).json({
      status: 'success',
      file: {
        fileUrl: result.fileUrl,
        publicId: result.publicId,
        resourceType: result.resourceType,
        fileName: result.fileName,
        fileSize: result.fileSize,
        mimetype: req.file.mimetype,
      },
    });
  } catch (error) {
    console.error('[Upload Attachment Error]:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message || 'File upload failed',
    });
  }
};

const sendMessage = async (req, res) => {
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
    } = req.body;

    if (!conversationId) {
      return res.status(400).json({
        status: 'fail',
        message: 'conversationId is required',
      });
    }

    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      return res.status(400).json({
        status: 'fail',
        message: 'Invalid conversation ID format',
      });
    }

    if ((!content || !content.trim()) && !fileUrl) {
      return res.status(400).json({
        status: 'fail',
        message: 'Message content or fileUrl is required',
      });
    }

    const conversation = await Conversation.findById(conversationId);
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
        message: 'Not authorized to send messages to this conversation',
      });
    }

    const mentionUserIds = await parseMentionIds(mentions, content);

    const message = await Message.create({
      conversationId,
      sender: req.user._id,
      content: content ? content.trim() : '',
      messageType,
      fileUrl: fileUrl || '',
      fileName: fileName || '',
      fileSize: fileSize || 0,
      duration: duration || 0,
      replyTo: replyTo && mongoose.Types.ObjectId.isValid(replyTo) ? replyTo : null,
      mentions: mentionUserIds,
      deliveredTo: [req.user._id],
      readBy: [req.user._id],
    });

    const previewContent =
      messageType === 'text'
        ? (content || '')
        : messageType === 'image'
          ? '📷 Photo'
          : messageType === 'file'
            ? `📎 ${fileName || 'Attachment'}`
            : messageType === 'audio'
              ? '🎙️ Voice message'
              : `[${messageType.toUpperCase()}]`;

    conversation.lastMessage = previewContent;
    conversation.lastMessageSender = req.user._id;
    conversation.lastMessageAt = new Date();
    await conversation.save();

    const populatedMessage = await Message.findById(message._id)
      .populate('sender', 'name email profileImage isOnline lastSeen')
      .populate('mentions', 'name email profileImage jobTitle department')
      .populate({
        path: 'replyTo',
        select: 'content sender messageType isDeleted',
        populate: { path: 'sender', select: 'name email' },
      });

    const io = req.app.get('io');
    if (io) {
      notifyMentionedUsers(io, populatedMessage, req.user, { conversationId });
    }

    return res.status(201).json({
      status: 'success',
      message: populatedMessage,
    });
  } catch (error) {
    console.error('[Send Message Error]:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Error sending message',
    });
  }
};

const getConversationMessages = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 30));
    const skip = (page - 1) * limit;

    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      return res.status(400).json({
        status: 'fail',
        message: 'Invalid conversation ID format',
      });
    }

   
    const conversation = await Conversation.findById(conversationId);
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
        message: 'Not authorized to view messages of this conversation',
      });
    }

    const totalMessages = await Message.countDocuments({ conversationId });
    const totalPages = Math.ceil(totalMessages / limit) || 1;

    
    const messages = await Message.find({ conversationId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('sender', 'name email profileImage isOnline lastSeen')
      .populate('mentions', 'name email profileImage jobTitle department')
      .populate('reactions.users', 'name email profileImage')
      .populate({
        path: 'replyTo',
        select: 'content sender messageType isDeleted',
        populate: { path: 'sender', select: 'name email' },
      });

    return res.status(200).json({
      status: 'success',
      results: messages.length,
      pagination: {
        total: totalMessages,
        page,
        totalPages,
        limit,
        hasMore: page < totalPages,
      },
      messages: messages.reverse(),
    });
  } catch (error) {
    console.error('[Get Messages Error]:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Error fetching message history',
    });
  }
};

const editMessage = async (req, res) => {
  try {
    const { id } = req.params;
    const { content } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({
        status: 'fail',
        message: 'Content cannot be empty',
      });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: 'fail',
        message: 'Invalid message ID format',
      });
    }

    const message = await Message.findById(id);
    if (!message) {
      return res.status(404).json({
        status: 'fail',
        message: 'Message not found',
      });
    }
    if (message.sender.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        status: 'fail',
        message: 'Not authorized to edit this message',
      });
    }

    if (message.isDeleted) {
      return res.status(400).json({
        status: 'fail',
        message: 'Cannot edit a deleted message',
      });
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

    return res.status(200).json({
      status: 'success',
      message: populated,
    });
  } catch (error) {
    console.error('[Edit Message Error]:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Error editing message',
    });
  }
};

const deleteMessage = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: 'fail',
        message: 'Invalid message ID format',
      });
    }

    const message = await Message.findById(id);
    if (!message) {
      return res.status(404).json({
        status: 'fail',
        message: 'Message not found',
      });
    }

    if (message.sender.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        status: 'fail',
        message: 'Not authorized to delete this message',
      });
    }

    message.isDeleted = true;
    message.content = 'This message was deleted';
    message.fileUrl = '';
    await message.save();

    return res.status(200).json({
      status: 'success',
      message: {
        _id: message._id,
        conversationId: message.conversationId,
        isDeleted: true,
        content: message.content,
      },
    });
  } catch (error) {
    console.error('[Delete Message Error]:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Error deleting message',
    });
  }
};
const markAsRead = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: 'fail',
        message: 'Invalid message ID format',
      });
    }

    const message = await Message.findByIdAndUpdate(
      id,
      {
        $addToSet: {
          readBy: req.user._id,
          deliveredTo: req.user._id,
        },
      },
      { new: true }
    );

    if (!message) {
      return res.status(404).json({
        status: 'fail',
        message: 'Message not found',
      });
    }

    return res.status(200).json({
      status: 'success',
      messageId: message._id,
      readBy: message.readBy,
    });
  } catch (error) {
    console.error('[Mark As Read Error]:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Error marking message as read',
    });
  }
};
const markConversationMessagesAsRead = async (req, res) => {
  try {
    const { conversationId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      return res.status(400).json({
        status: 'fail',
        message: 'Invalid conversation ID format',
      });
    }

    const result = await Message.updateMany(
      {
        conversationId,
        readBy: { $ne: req.user._id },
      },
      {
        $addToSet: {
          readBy: req.user._id,
          deliveredTo: req.user._id,
        },
      }
    );

    return res.status(200).json({
      status: 'success',
      modifiedCount: result.modifiedCount,
    });
  } catch (error) {
    console.error('[Mark All Read Error]:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Error marking conversation messages as read',
    });
  }
};
const searchMessages = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { q = '' } = req.query;

    const searchTerm = q.trim();
    if (!searchTerm) {
      return res.status(200).json({
        status: 'success',
        results: 0,
        messages: [],
      });
    }

    const filter = {
      isDeleted: false,
      content: { $regex: searchTerm, $options: 'i' },
    };

    if (conversationId && conversationId !== 'all') {
      if (!mongoose.Types.ObjectId.isValid(conversationId)) {
        return res.status(400).json({
          status: 'fail',
          message: 'Invalid conversation ID format',
        });
      }

      const conversation = await Conversation.findById(conversationId);
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
          message: 'Not authorized to search in this conversation',
        });
      }

      filter.conversationId = conversationId;
    } else {
      
      const userConvs = await Conversation.find({
        participants: req.user._id,
      }).select('_id');
      const convIds = userConvs.map((c) => c._id);
      filter.conversationId = { $in: convIds };
    }

    const messages = await Message.find(filter)
      .sort({ createdAt: -1 })
      .limit(50)
      .populate('sender', 'name email profileImage')
      .populate({
        path: 'replyTo',
        select: 'content sender messageType isDeleted',
        populate: { path: 'sender', select: 'name email' },
      });

    return res.status(200).json({
      status: 'success',
      results: messages.length,
      messages,
    });
  } catch (error) {
    console.error('[Search Messages Error]:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Error searching messages',
    });
  }
};


const getThreadReplies = async (req, res) => {
  try {
    const { id } = req.params;

    const rootMessage = await Message.findById(id)
      .populate('sender', 'name email profileImage isOnline lastSeen jobTitle department')
      .populate('threadParticipants', 'name email profileImage isOnline lastSeen jobTitle department')
      .populate('reactions.users', 'name email profileImage')
      .populate('mentions', 'name email profileImage jobTitle department');

    if (!rootMessage) {
      return res.status(404).json({
        status: 'fail',
        message: 'Message not found',
      });
    }

    const replies = await Message.find({ parentMessageId: id })
      .sort({ createdAt: 1 })
      .populate('sender', 'name email profileImage isOnline lastSeen jobTitle department')
      .populate('reactions.users', 'name email profileImage')
      .populate('mentions', 'name email profileImage jobTitle department');

    return res.status(200).json({
      status: 'success',
      rootMessage,
      replies,
      count: replies.length,
    });
  } catch (error) {
    console.error('[Get Thread Replies Error]:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Error fetching thread replies',
    });
  }
};
const sendThreadReply = async (req, res) => {
  try {
    const { id } = req.params;
    const { content, messageType = 'text', fileUrl = '', fileName = '', fileSize = 0, mentions = [] } = req.body;

    if ((!content || !content.trim()) && !fileUrl) {
      return res.status(400).json({
        status: 'fail',
        message: 'Reply content or attachment is required',
      });
    }

    let targetRoot = await Message.findById(id);
    if (!targetRoot) {
      return res.status(404).json({
        status: 'fail',
        message: 'Target message not found',
      });
    }

    if (targetRoot.parentMessageId) {
      targetRoot = await Message.findById(targetRoot.parentMessageId);
      if (!targetRoot) {
        return res.status(404).json({
          status: 'fail',
          message: 'Root thread message not found',
        });
      }
    }

    const mentionUserIds = await parseMentionIds(mentions, content);

    const replyMessage = await Message.create({
      parentMessageId: targetRoot._id,
      conversationId: targetRoot.conversationId || undefined,
      channelId: targetRoot.channelId || undefined,
      sender: req.user._id,
      content: content ? content.trim() : '',
      messageType,
      fileUrl,
      fileName,
      fileSize,
      mentions: mentionUserIds,
      deliveredTo: [req.user._id],
      readBy: [req.user._id],
    });

    targetRoot.threadCount = (targetRoot.threadCount || 0) + 1;
    targetRoot.threadLastReplyAt = new Date();
    if (!targetRoot.threadParticipants.some(p => p.toString() === req.user._id.toString())) {
      targetRoot.threadParticipants.push(req.user._id);
    }
    await targetRoot.save();

    const populatedReply = await Message.findById(replyMessage._id)
      .populate('sender', 'name email profileImage isOnline lastSeen jobTitle department')
      .populate('mentions', 'name email profileImage jobTitle department');

    const populatedRoot = await Message.findById(targetRoot._id)
      .populate('sender', 'name email profileImage isOnline lastSeen jobTitle department')
      .populate('threadParticipants', 'name email profileImage isOnline lastSeen jobTitle department')
      .populate('mentions', 'name email profileImage jobTitle department');

    const io = req.app.get('io');
    if (io) {
      io.to(`thread_${targetRoot._id}`).emit('new_thread_reply', populatedReply);

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

      notifyMentionedUsers(io, populatedReply, req.user, {
        parentMessageId: targetRoot._id,
        channelId: targetRoot.channelId,
        conversationId: targetRoot.conversationId,
      });
    }

    return res.status(201).json({
      status: 'success',
      reply: populatedReply,
      rootMessage: populatedRoot,
    });
  } catch (error) {
    console.error('[Send Thread Reply Error]:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Error sending thread reply',
    });
  }
};
const toggleReaction = async (req, res) => {
  try {
    const { id } = req.params;
    const { emoji } = req.body;

    if (!emoji || typeof emoji !== 'string' || !emoji.trim()) {
      return res.status(400).json({
        status: 'fail',
        message: 'A valid emoji is required',
      });
    }

    const trimmedEmoji = emoji.trim();
    const userId = req.user._id;

    const message = await Message.findById(id);
    if (!message || message.isDeleted) {
      return res.status(404).json({
        status: 'fail',
        message: 'Message not found or deleted',
      });
    }

    if (!message.reactions) {
      message.reactions = [];
    }

    let existingReaction = message.reactions.find((r) => r.emoji === trimmedEmoji);

    if (existingReaction) {
      const userIdx = existingReaction.users.findIndex(
        (u) => u.toString() === userId.toString()
      );

      if (userIdx > -1) {
        existingReaction.users.splice(userIdx, 1);
        if (existingReaction.users.length === 0) {
          message.reactions = message.reactions.filter((r) => r.emoji !== trimmedEmoji);
        }
      } else {
        existingReaction.users.push(userId);
      }
    } else {
      message.reactions.push({
        emoji: trimmedEmoji,
        users: [userId],
      });
    }

    await message.save();

    const populated = await Message.findById(message._id)
      .populate('reactions.users', 'name email profileImage');

    const io = req.app.get('io');
    if (io) {
      const updatePayload = {
        messageId: message._id,
        reactions: populated.reactions,
        channelId: message.channelId,
        conversationId: message.conversationId,
        parentMessageId: message.parentMessageId,
      };

      if (message.channelId) {
        io.to(`channel_${message.channelId}`).emit('message_reaction_updated', updatePayload);
      }
      if (message.conversationId) {
        io.to(`conversation_${message.conversationId}`).emit('message_reaction_updated', updatePayload);
      }
      if (message.parentMessageId) {
        io.to(`thread_${message.parentMessageId}`).emit('message_reaction_updated', updatePayload);
      }
    }

    return res.status(200).json({
      status: 'success',
      messageId: message._id,
      reactions: populated.reactions,
    });
  } catch (error) {
    console.error('[Toggle Reaction Error]:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Error toggling reaction',
    });
  }
};


const getUserMentions = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 30));
    const skip = (page - 1) * limit;

    const query = { mentions: req.user._id, isDeleted: false };
    const total = await Message.countDocuments(query);
    const messages = await Message.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('sender', 'name email profileImage jobTitle department isOnline')
      .populate('mentions', 'name email profileImage jobTitle department')
      .populate({
        path: 'channelId',
        select: 'name displayName type team',
        populate: { path: 'team', select: 'name' },
      })
      .populate({
        path: 'conversationId',
        select: 'participants isGroup groupName groupAvatar',
      });

    return res.status(200).json({
      status: 'success',
      results: messages.length,
      total,
      page,
      totalPages: Math.ceil(total / limit) || 1,
      messages,
    });
  } catch (error) {
    console.error('[Get User Mentions Error]:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Error fetching user mentions',
    });
  }
};

module.exports = {
  uploadAttachment,
  sendMessage,
  getConversationMessages,
  editMessage,
  deleteMessage,
  markAsRead,
  markConversationMessagesAsRead,
  searchMessages,
  getThreadReplies,
  sendThreadReply,
  toggleReaction,
  getUserMentions,
};


const mongoose = require('mongoose');
const Message = require('../models/message.model');
const Conversation = require('../models/conversation.model');
const { uploadFile } = require('../config/cloudinary');

// @desc    Upload file or image attachment (Cloudinary with local fallback)
// @route   POST /api/messages/upload
// @access  Private (JWT Protected)
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

// @desc    Send a message within a conversation
// @route   POST /api/messages
// @access  Private (JWT Protected)
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

    // Verify user is a participant in this conversation
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

    // Create the message
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
      deliveredTo: [req.user._id],
      readBy: [req.user._id],
    });

    // Update the parent conversation's last message preview
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

    // Populate sender and replyTo details for the response
    const populatedMessage = await Message.findById(message._id)
      .populate('sender', 'name email profileImage isOnline lastSeen')
      .populate({
        path: 'replyTo',
        select: 'content sender messageType isDeleted',
        populate: { path: 'sender', select: 'name email' },
      });

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

// @desc    Get message history for a conversation with pagination
// @route   GET /api/messages/:conversationId
// @access  Private (JWT Protected)
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

    // Verify user is a participant
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

    // Fetch newest messages first, then reverse to chronological order
    const messages = await Message.find({ conversationId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('sender', 'name email profileImage isOnline lastSeen')
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

// @desc    Edit a message
// @route   PUT /api/messages/:id
// @access  Private (JWT Protected)
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

    // Only the original sender can edit
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

// @desc    Delete a message (soft delete)
// @route   DELETE /api/messages/:id
// @access  Private (JWT Protected)
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

    // Only sender can delete their message
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

// @desc    Mark a message as read by current user
// @route   PUT /api/messages/:id/read
// @access  Private (JWT Protected)
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

// @desc    Mark all messages in a conversation as read by current user
// @route   PUT /api/messages/conversation/:conversationId/read-all
// @access  Private (JWT Protected)
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

// @desc    Search messages in a conversation or across all user conversations
// @route   GET /api/messages/search/:conversationId?q=keyword
// @access  Private (JWT Protected)
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

      // Verify user is a participant
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
      // Search across all conversations user belongs to
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

module.exports = {
  uploadAttachment,
  sendMessage,
  getConversationMessages,
  editMessage,
  deleteMessage,
  markAsRead,
  markConversationMessagesAsRead,
  searchMessages,
};


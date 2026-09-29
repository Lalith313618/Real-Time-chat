const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema(
  {
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Conversation',
      required: function () {
        return !this.channelId;
      },
      index: true,
    },
    channelId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Channel',
      required: function () {
        return !this.conversationId;
      },
      index: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'sender is required'],
      index: true,
    },
    content: {
      type: String,
      trim: true,
      default: '',
    },
    messageType: {
      type: String,
      enum: ['text', 'image', 'file', 'audio', 'video'],
      default: 'text',
    },
    fileUrl: {
      type: String,
      default: '',
    },
    fileName: {
      type: String,
      default: '',
    },
    fileSize: {
      type: Number,
      default: 0,
    },
    duration: {
      type: Number,
      default: 0,
    },
    isEdited: {
      type: Boolean,
      default: false,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    deliveredTo: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    readBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    replyTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message',
      default: null,
    },
    parentMessageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message',
      default: null,
      index: true,
    },
    threadCount: {
      type: Number,
      default: 0,
    },
    threadLastReplyAt: {
      type: Date,
      default: null,
    },
    threadParticipants: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    reactions: [
      {
        emoji: {
          type: String,
          required: true,
          trim: true,
        },
        users: [
          {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
          },
        ],
      },
    ],
    mentions: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Compound index to quickly fetch paginated message history of a conversation or channel
messageSchema.index({ conversationId: 1, createdAt: -1 });
messageSchema.index({ channelId: 1, createdAt: -1 });
messageSchema.index({ parentMessageId: 1, createdAt: 1 });
messageSchema.index({ mentions: 1, createdAt: -1 });

// TTL index: automatically expire and purge messages after retention window (default 30 days)
const ttlSeconds = process.env.MESSAGE_TTL_SECONDS
  ? parseInt(process.env.MESSAGE_TTL_SECONDS, 10)
  : (parseInt(process.env.MESSAGE_TTL_DAYS || '30', 10) * 24 * 60 * 60);

if (ttlSeconds > 0) {
  messageSchema.index({ createdAt: 1 }, { expireAfterSeconds: ttlSeconds });
}

const Message = mongoose.model('Message', messageSchema);

module.exports = Message;


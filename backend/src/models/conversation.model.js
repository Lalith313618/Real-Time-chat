const mongoose = require('mongoose');

const conversationSchema = new mongoose.Schema(
  {
    participants: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
      },
    ],
    isGroup: {
      type: Boolean,
      default: false,
    },
    groupName: {
      type: String,
      trim: true,
      default: '',
    },
    groupImage: {
      type: String,
      default: '',
    },
    groupAdmin: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    lastMessage: {
      type: String,
      default: '',
    },
    lastMessageSender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    lastMessageAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Index to quickly find user conversations ordered by last message time
conversationSchema.index({ participants: 1, lastMessageAt: -1 });

const Conversation = mongoose.model('Conversation', conversationSchema);

module.exports = Conversation;

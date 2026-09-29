const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Notification recipient is required'],
      index: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      index: true,
    },
    type: {
      type: String,
      enum: [
        'MENTION',
        'TASK_ASSIGNED',
        'TASK_STATUS',
        'REPLY',
        'REACTION',
        'TEAM_INVITE',
        'CHANNEL_INVITE',
        'SYSTEM',
      ],
      required: [true, 'Notification type is required'],
      index: true,
    },
    title: {
      type: String,
      required: [true, 'Notification title is required'],
      trim: true,
    },
    content: {
      type: String,
      trim: true,
      default: '',
    },
    link: {
      type: String,
      trim: true,
      default: '',
    },
    metadata: {
      messageId: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },
      channelId: { type: mongoose.Schema.Types.ObjectId, ref: 'Channel' },
      teamId: { type: mongoose.Schema.Types.ObjectId, ref: 'Team' },
      taskId: { type: mongoose.Schema.Types.ObjectId, ref: 'Task' },
      conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation' },
      channelName: String,
      teamName: String,
      emoji: String,
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
    readAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

notificationSchema.index({ recipient: 1, isRead: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);

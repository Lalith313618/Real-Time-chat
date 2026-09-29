const mongoose = require('mongoose');

const channelMemberSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User reference is required for channel membership'],
    },
    role: {
      type: String,
      enum: ['ADMIN', 'MEMBER'],
      default: 'MEMBER',
      uppercase: true,
    },
    joinedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const channelSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Channel name is required'],
      trim: true,
      lowercase: true,
      minlength: [2, 'Channel name must be at least 2 characters'],
      maxlength: [80, 'Channel name cannot exceed 80 characters'],
      match: [
        /^[a-z0-9-_]+$/,
        'Channel name can only contain lowercase letters, numbers, hyphens, and underscores',
      ],
    },
    displayName: {
      type: String,
      trim: true,
      default: '',
    },
    description: {
      type: String,
      trim: true,
      maxlength: [500, 'Description cannot exceed 500 characters'],
      default: '',
    },
    topic: {
      type: String,
      trim: true,
      maxlength: [250, 'Channel topic cannot exceed 250 characters'],
      default: '',
    },
    team: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Team',
      required: [true, 'Team is required for a channel'],
      index: true,
    },
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: [true, 'Organization is required for a channel'],
    },
    type: {
      type: String,
      enum: ['PUBLIC', 'PRIVATE'],
      default: 'PUBLIC',
      uppercase: true,
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
    isArchived: {
      type: Boolean,
      default: false,
    },
    members: [channelMemberSchema],
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes
channelSchema.index({ team: 1, name: 1 }, { unique: true });
channelSchema.index({ team: 1, isArchived: 1 });
channelSchema.index({ organization: 1 });
channelSchema.index({ 'members.user': 1 });

channelSchema.virtual('membersCount').get(function () {
  return this.members ? this.members.length : 0;
});

const Channel = mongoose.model('Channel', channelSchema);

module.exports = Channel;

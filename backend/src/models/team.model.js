const mongoose = require('mongoose');

const teamMemberSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User reference is required for team membership'],
    },
    role: {
      type: String,
      enum: ['LEAD', 'ADMIN', 'MEMBER'],
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

const teamSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Team name is required'],
      trim: true,
      minlength: [2, 'Team name must be at least 2 characters'],
      maxlength: [100, 'Team name cannot exceed 100 characters'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [500, 'Description cannot exceed 500 characters'],
      default: '',
    },
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: [true, 'Organization is required for a team'],
      index: true,
    },
    icon: {
      type: String,
      default: '',
    },
    privacy: {
      type: String,
      enum: ['PUBLIC', 'PRIVATE'],
      default: 'PUBLIC',
      uppercase: true,
    },
    members: [teamMemberSchema],
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
teamSchema.index({ organization: 1, name: 1 }, { unique: true });
teamSchema.index({ 'members.user': 1 });

// Virtual for member count
teamSchema.virtual('membersCount').get(function () {
  return this.members ? this.members.length : 0;
});

const Team = mongoose.model('Team', teamSchema);

module.exports = Team;

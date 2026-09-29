const mongoose = require('mongoose');

const memberSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User reference is required for organization membership'],
    },
    role: {
      type: String,
      enum: ['OWNER', 'ADMIN', 'MANAGER', 'MEMBER', 'GUEST'],
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

const organizationSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Organization name is required'],
      trim: true,
      minlength: [2, 'Organization name must be at least 2 characters'],
      maxlength: [100, 'Organization name cannot exceed 100 characters'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [500, 'Description cannot exceed 500 characters'],
      default: '',
    },
    logo: {
      type: String,
      default: '',
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Organization must have an owner'],
      index: true,
    },
    members: [memberSchema],
    inviteCode: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

organizationSchema.index({ 'members.user': 1 });
organizationSchema.index({ name: 'text', description: 'text' });
organizationSchema.virtual('memberCount').get(function () {
  return this.members ? this.members.length : 0;
});

const Organization = mongoose.model('Organization', organizationSchema);

module.exports = Organization;

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Please provide a name'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters'],
      maxlength: [50, 'Name cannot exceed 50 characters'],
    },
    email: {
      type: String,
      required: [true, 'Please provide an email address'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [
        /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
        'Please provide a valid email address',
      ],
    },
    password: {
      type: String,
      required: [true, 'Please provide a password'],
      minlength: [6, 'Password must be at least 6 characters'],
      select: false,
    },
    profileImage: {
      type: String,
      default: '',
    },
    isOnline: {
      type: Boolean,
      default: false,
    },
    lastSeen: {
      type: Date,
      default: Date.now,
    },
    notificationSettings: {
      soundEnabled: { type: Boolean, default: true },
      soundTone: { type: String, enum: ['chime', 'pop', 'ping', 'pulse'], default: 'chime' },
      volume: { type: Number, min: 0, max: 100, default: 80 },
      pushEnabled: { type: Boolean, default: true },
      inAppToastEnabled: { type: Boolean, default: true },
      dndEnabled: { type: Boolean, default: false },
      previewContent: { type: Boolean, default: true },
    },
    currentOrganization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      default: null,
    },
    jobTitle: {
      type: String,
      default: '',
      trim: true,
      maxlength: [100, 'Job title cannot exceed 100 characters'],
    },
    department: {
      type: String,
      default: '',
      trim: true,
      maxlength: [100, 'Department cannot exceed 100 characters'],
    },
    bio: {
      type: String,
      default: '',
      trim: true,
      maxlength: [300, 'Bio cannot exceed 300 characters'],
    },
    phone: {
      type: String,
      default: '',
      trim: true,
      maxlength: [30, 'Phone cannot exceed 30 characters'],
    },
    statusMessage: {
      type: String,
      default: '',
      trim: true,
      maxlength: [100, 'Status message cannot exceed 100 characters'],
    },
    statusEmoji: {
      type: String,
      default: '',
      trim: true,
      maxlength: [10, 'Status emoji cannot exceed 10 characters'],
    },
    presenceStatus: {
      type: String,
      enum: ['available', 'busy', 'away', 'offline'],
      default: 'available',
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        delete ret.password;
        return ret;
      },
    },
    toObject: {
      transform(doc, ret) {
        delete ret.password;
        return ret;
      },
    },
  }
);
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) {
    return next();
  }

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

userSchema.index({ name: 'text', email: 'text', jobTitle: 'text', department: 'text' });
userSchema.index({ department: 1 });

const User = mongoose.model('User', userSchema);

module.exports = User;

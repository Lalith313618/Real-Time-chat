const User = require('../models/user.model');
const { uploadFile } = require('../config/cloudinary');

const searchUsers = async (req, res) => {
  try {
    const query = req.query.q ? req.query.q.trim() : '';

    if (!query) {
      return res.status(200).json({
        status: 'success',
        results: 0,
        users: [],
      });
    }

    const sanitizedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const users = await User.find({
      _id: { $ne: req.user._id },
      $or: [
        { name: { $regex: sanitizedQuery, $options: 'i' } },
        { email: { $regex: sanitizedQuery, $options: 'i' } },
      ],
    })
      .select('_id name email profileImage isOnline lastSeen createdAt')
      .limit(20);

    return res.status(200).json({
      status: 'success',
      results: users.length,
      users,
    });
  } catch (error) {
    console.error('[Search Users Error]:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Error occurred while searching users',
    });
  }
};

// @desc    Get user profile by ID
// @route   GET /api/users/profile/:id
// @access  Private (JWT Protected)
const getUserProfile = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id).select(
      '_id name email profileImage isOnline lastSeen createdAt'
    );

    if (!user) {
      return res.status(404).json({
        status: 'fail',
        message: 'User not found',
      });
    }

    return res.status(200).json({
      status: 'success',
      user,
    });
  } catch (error) {
    console.error('[Get Profile Error]:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Error fetching user profile',
    });
  }
};

// @desc    Update current user's profile
// @route   PUT /api/users/profile
// @access  Private (JWT Protected)
const updateProfile = async (req, res) => {
  try {
    const { name, profileImage } = req.body;
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        status: 'fail',
        message: 'User not found',
      });
    }

    if (name && typeof name === 'string' && name.trim().length >= 2) {
      user.name = name.trim();
    }

    if (profileImage !== undefined) {
      user.profileImage = typeof profileImage === 'string' ? profileImage.trim() : '';
    }

    const updatedUser = await user.save();

    return res.status(200).json({
      status: 'success',
      message: 'Profile updated successfully',
      user: {
        _id: updatedUser._id,
        name: updatedUser.name,
        email: updatedUser.email,
        profileImage: updatedUser.profileImage,
        isOnline: updatedUser.isOnline,
        lastSeen: updatedUser.lastSeen,
        createdAt: updatedUser.createdAt,
        updatedAt: updatedUser.updatedAt,
      },
    });
  } catch (error) {
    console.error('[Update Profile Error]:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Error updating profile',
    });
  }
};

// @desc    Get all users (excluding current user)
// @route   GET /api/users
// @access  Private (JWT Protected)
const getAllUsers = async (req, res) => {
  try {
    const users = await User.find({ _id: { $ne: req.user._id } })
      .select('_id name email profileImage isOnline lastSeen createdAt')
      .sort({ name: 1 })
      .limit(50);

    return res.status(200).json({
      status: 'success',
      results: users.length,
      users,
    });
  } catch (error) {
    console.error('[Get All Users Error]:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Error fetching users list',
    });
  }
};

// @desc    Get current user notification settings
// @route   GET /api/users/notifications
// @access  Private (JWT Protected)
const getNotificationSettings = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('notificationSettings');
    return res.status(200).json({
      status: 'success',
      notificationSettings: user.notificationSettings || {},
    });
  } catch (error) {
    console.error('[Get Notification Settings Error]:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Error fetching notification settings',
    });
  }
};

// @desc    Update current user notification settings
// @route   PUT /api/users/notifications
// @access  Private (JWT Protected)
const updateNotificationSettings = async (req, res) => {
  try {
    const {
      soundEnabled,
      soundTone,
      volume,
      pushEnabled,
      inAppToastEnabled,
      dndEnabled,
      previewContent,
    } = req.body;

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({
        status: 'fail',
        message: 'User not found',
      });
    }

    if (!user.notificationSettings) {
      user.notificationSettings = {};
    }

    if (soundEnabled !== undefined) user.notificationSettings.soundEnabled = Boolean(soundEnabled);
    if (soundTone !== undefined) user.notificationSettings.soundTone = soundTone;
    if (volume !== undefined) user.notificationSettings.volume = Number(volume);
    if (pushEnabled !== undefined) user.notificationSettings.pushEnabled = Boolean(pushEnabled);
    if (inAppToastEnabled !== undefined) user.notificationSettings.inAppToastEnabled = Boolean(inAppToastEnabled);
    if (dndEnabled !== undefined) user.notificationSettings.dndEnabled = Boolean(dndEnabled);
    if (previewContent !== undefined) user.notificationSettings.previewContent = Boolean(previewContent);

    await user.save();

    return res.status(200).json({
      status: 'success',
      message: 'Notification settings updated successfully',
      notificationSettings: user.notificationSettings,
    });
  } catch (error) {
    console.error('[Update Notification Settings Error]:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Error updating notification settings',
    });
  }
};

// @desc    Upload avatar image & update profile for current user
// @route   POST /api/users/avatar
// @access  Private (JWT Protected)
const uploadAvatar = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        status: 'fail',
        message: 'No image file uploaded',
      });
    }

    if (!req.file.mimetype || !req.file.mimetype.startsWith('image/')) {
      return res.status(400).json({
        status: 'fail',
        message: 'Please upload a valid image file (JPEG, PNG, WEBP, GIF, SVG)',
      });
    }

    const result = await uploadFile(req.file.buffer, {
      folder: 'chat_app/avatars',
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
    });

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({
        status: 'fail',
        message: 'User not found',
      });
    }

    user.profileImage = result.fileUrl;
    const updatedUser = await user.save();

    return res.status(200).json({
      status: 'success',
      message: 'Avatar uploaded and profile updated successfully',
      fileUrl: result.fileUrl,
      user: {
        _id: updatedUser._id,
        name: updatedUser.name,
        email: updatedUser.email,
        profileImage: updatedUser.profileImage,
        isOnline: updatedUser.isOnline,
        lastSeen: updatedUser.lastSeen,
        createdAt: updatedUser.createdAt,
        updatedAt: updatedUser.updatedAt,
      },
    });
  } catch (error) {
    console.error('[Upload Avatar Error]:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Error uploading avatar',
    });
  }
};

// @desc    Remove avatar for current user
// @route   DELETE /api/users/avatar
// @access  Private (JWT Protected)
const removeAvatar = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({
        status: 'fail',
        message: 'User not found',
      });
    }

    user.profileImage = '';
    const updatedUser = await user.save();

    return res.status(200).json({
      status: 'success',
      message: 'Profile picture removed successfully',
      user: {
        _id: updatedUser._id,
        name: updatedUser.name,
        email: updatedUser.email,
        profileImage: '',
        isOnline: updatedUser.isOnline,
        lastSeen: updatedUser.lastSeen,
        createdAt: updatedUser.createdAt,
        updatedAt: updatedUser.updatedAt,
      },
    });
  } catch (error) {
    console.error('[Remove Avatar Error]:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Error removing avatar',
    });
  }
};

module.exports = {
  searchUsers,
  getUserProfile,
  updateProfile,
  uploadAvatar,
  removeAvatar,
  getAllUsers,
  getNotificationSettings,
  updateNotificationSettings,
};

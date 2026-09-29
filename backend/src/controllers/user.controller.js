const User = require('../models/user.model');
const Organization = require('../models/organization.model');
const { uploadFile } = require('../config/cloudinary');

const USER_DIRECTORY_FIELDS =
  '_id name email profileImage isOnline lastSeen jobTitle department bio phone statusMessage statusEmoji presenceStatus currentOrganization createdAt updatedAt';

// @desc    Workplace User Directory search & filter
// @route   GET /api/users/directory
// @access  Private (JWT Protected)
const getUserDirectory = async (req, res) => {
  try {
    const { q = '', department = '', presence = '', orgId } = req.query;

    const targetOrgId = orgId || req.user.currentOrganization;
    let memberRoleMap = new Map();
    let userFilter = {};

    if (targetOrgId) {
      const organization = await Organization.findById(targetOrgId);
      if (organization) {
        const memberUserIds = organization.members.map((m) => {
          memberRoleMap.set(m.user.toString(), m.role);
          return m.user;
        });
        userFilter._id = { $in: memberUserIds };
      }
    }

    // Keyword search (name, email, jobTitle, department)
    if (q && q.trim()) {
      const sanitized = q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      userFilter.$or = [
        { name: { $regex: sanitized, $options: 'i' } },
        { email: { $regex: sanitized, $options: 'i' } },
        { jobTitle: { $regex: sanitized, $options: 'i' } },
        { department: { $regex: sanitized, $options: 'i' } },
      ];
    }

    // Department filter
    if (department && department.trim() && department.toUpperCase() !== 'ALL') {
      userFilter.department = { $regex: `^${department.trim()}$`, $options: 'i' };
    }

    // Presence filter
    if (presence && presence.trim() && presence.toUpperCase() !== 'ALL') {
      if (presence === 'online') {
        userFilter.isOnline = true;
      } else if (presence === 'offline') {
        userFilter.isOnline = false;
      } else {
        userFilter.presenceStatus = presence.toLowerCase();
      }
    }

    const users = await User.find(userFilter)
      .select(USER_DIRECTORY_FIELDS)
      .sort({ isOnline: -1, name: 1 })
      .limit(100);

    const enrichedUsers = users.map((u) => {
      const uObj = u.toObject();
      return {
        ...uObj,
        orgRole: memberRoleMap.get(u._id.toString()) || 'MEMBER',
      };
    });

    return res.status(200).json({
      status: 'success',
      results: enrichedUsers.length,
      users: enrichedUsers,
    });
  } catch (error) {
    console.error('[User Directory Error]:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Error fetching user directory',
    });
  }
};

// @desc    Get list of unique departments
// @route   GET /api/users/departments
// @access  Private (JWT Protected)
const getDepartments = async (req, res) => {
  try {
    const departments = await User.distinct('department', {
      department: { $nin: ['', null] },
    });

    return res.status(200).json({
      status: 'success',
      results: departments.length,
      departments: departments.filter(Boolean).sort(),
    });
  } catch (error) {
    console.error('[Get Departments Error]:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Error fetching departments',
    });
  }
};

// @desc    Search users by name, email, or job title
// @route   GET /api/users/search
// @access  Private (JWT Protected)
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
        { jobTitle: { $regex: sanitizedQuery, $options: 'i' } },
        { department: { $regex: sanitizedQuery, $options: 'i' } },
      ],
    })
      .select(USER_DIRECTORY_FIELDS)
      .limit(30);

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

    const user = await User.findById(id).select(USER_DIRECTORY_FIELDS);

    if (!user) {
      return res.status(404).json({
        status: 'fail',
        message: 'User not found',
      });
    }

    // Attach role if member of current user's organization
    let orgRole = null;
    if (req.user.currentOrganization) {
      const org = await Organization.findById(req.user.currentOrganization);
      if (org) {
        const membership = org.members.find((m) => m.user.toString() === id.toString());
        if (membership) {
          orgRole = membership.role;
        }
      }
    }

    return res.status(200).json({
      status: 'success',
      user: {
        ...user.toObject(),
        orgRole,
      },
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
    const {
      name,
      profileImage,
      jobTitle,
      department,
      bio,
      phone,
      statusMessage,
      statusEmoji,
      presenceStatus,
    } = req.body;

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
    if (jobTitle !== undefined) {
      user.jobTitle = typeof jobTitle === 'string' ? jobTitle.trim() : '';
    }
    if (department !== undefined) {
      user.department = typeof department === 'string' ? department.trim() : '';
    }
    if (bio !== undefined) {
      user.bio = typeof bio === 'string' ? bio.trim() : '';
    }
    if (phone !== undefined) {
      user.phone = typeof phone === 'string' ? phone.trim() : '';
    }
    if (statusMessage !== undefined) {
      user.statusMessage = typeof statusMessage === 'string' ? statusMessage.trim() : '';
    }
    if (statusEmoji !== undefined) {
      user.statusEmoji = typeof statusEmoji === 'string' ? statusEmoji.trim() : '';
    }
    if (presenceStatus && ['available', 'busy', 'away', 'offline'].includes(presenceStatus)) {
      user.presenceStatus = presenceStatus;
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
        jobTitle: updatedUser.jobTitle,
        department: updatedUser.department,
        bio: updatedUser.bio,
        phone: updatedUser.phone,
        statusMessage: updatedUser.statusMessage,
        statusEmoji: updatedUser.statusEmoji,
        presenceStatus: updatedUser.presenceStatus,
        isOnline: updatedUser.isOnline,
        lastSeen: updatedUser.lastSeen,
        currentOrganization: updatedUser.currentOrganization,
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
      .select(USER_DIRECTORY_FIELDS)
      .sort({ name: 1 })
      .limit(100);

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
      req,
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
        jobTitle: updatedUser.jobTitle,
        department: updatedUser.department,
        statusMessage: updatedUser.statusMessage,
        statusEmoji: updatedUser.statusEmoji,
        presenceStatus: updatedUser.presenceStatus,
        isOnline: updatedUser.isOnline,
        lastSeen: updatedUser.lastSeen,
        currentOrganization: updatedUser.currentOrganization,
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
        jobTitle: updatedUser.jobTitle,
        department: updatedUser.department,
        statusMessage: updatedUser.statusMessage,
        statusEmoji: updatedUser.statusEmoji,
        presenceStatus: updatedUser.presenceStatus,
        isOnline: updatedUser.isOnline,
        lastSeen: updatedUser.lastSeen,
        currentOrganization: updatedUser.currentOrganization,
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
  getUserDirectory,
  getDepartments,
  searchUsers,
  getUserProfile,
  updateProfile,
  uploadAvatar,
  removeAvatar,
  getAllUsers,
  getNotificationSettings,
  updateNotificationSettings,
};

const User = require('../models/user.model');
const { generateToken } = require('../config/jwt');

// @desc    Register a new user
// @route   POST /api/auth/register
// @access  Public
const register = async (req, res) => {
  try {
    const { name, email, password, profileImage } = req.body;

    // Check if user already exists
    const userExists = await User.findOne({ email: email.toLowerCase().trim() });
    if (userExists) {
      return res.status(400).json({
        status: 'fail',
        message: 'An account with this email already exists',
      });
    }

    // Create new user (password is automatically hashed by Mongoose pre-save hook)
    const user = await User.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password,
      profileImage: profileImage || '',
      isOnline: true,
      lastSeen: new Date(),
    });

    // Generate JWT token
    const token = generateToken(user._id);

    return res.status(201).json({
      status: 'success',
      message: 'Account created successfully',
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        profileImage: user.profileImage,
        isOnline: user.isOnline,
        lastSeen: user.lastSeen,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    console.error('[Register Error]:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Server error during registration',
    });
  }
};

// @desc    Authenticate user & get token
// @route   POST /api/auth/login
// @access  Public
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user by email and explicitly select password
    const user = await User.findOne({ email: email.toLowerCase().trim() }).select('+password');

    if (!user || !(await user.matchPassword(password))) {
      return res.status(401).json({
        status: 'fail',
        message: 'Invalid email or password credentials',
      });
    }

    // Update online status
    user.isOnline = true;
    user.lastSeen = new Date();
    await user.save({ validateBeforeSave: false });

    // Generate JWT token
    const token = generateToken(user._id);

    return res.status(200).json({
      status: 'success',
      message: 'Logged in successfully',
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        profileImage: user.profileImage,
        isOnline: user.isOnline,
        lastSeen: user.lastSeen,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    console.error('[Login Error]:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Server error during login',
    });
  }
};

// @desc    Get currently logged in user profile
// @route   GET /api/auth/me
// @access  Private (Protected by JWT)
const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({
        status: 'fail',
        message: 'User not found',
      });
    }

    return res.status(200).json({
      status: 'success',
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        profileImage: user.profileImage,
        isOnline: user.isOnline,
        lastSeen: user.lastSeen,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    console.error('[GetMe Error]:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Server error fetching user profile',
    });
  }
};

module.exports = {
  register,
  login,
  getMe,
};

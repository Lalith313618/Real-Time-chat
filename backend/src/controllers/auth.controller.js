const User = require('../models/user.model');
const { generateToken } = require('../config/jwt');
const register = async (req, res) => {
  try {
    const { name, email, password, profileImage } = req.body;
    const userExists = await User.findOne({ email: email.toLowerCase().trim() });
    if (userExists) {
      return res.status(400).json({
        status: 'fail',
        message: 'An account with this email already exists',
      });
    }
    const user = await User.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password,
      profileImage: profileImage || '',
      isOnline: true,
      lastSeen: new Date(),
    });
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
        currentOrganization: user.currentOrganization || null,
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
const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: email.toLowerCase().trim() }).select('+password');

    if (!user || !(await user.matchPassword(password))) {
      return res.status(401).json({
        status: 'fail',
        message: 'Invalid email or password credentials',
      });
    }
    user.isOnline = true;
    user.lastSeen = new Date();
    await user.save({ validateBeforeSave: false });
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
        currentOrganization: user.currentOrganization || null,
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
        currentOrganization: user.currentOrganization || null,
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

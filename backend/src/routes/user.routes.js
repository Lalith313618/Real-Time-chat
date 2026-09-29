const express = require('express');
const router = express.Router();
const {
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
} = require('../controllers/user.controller');
const { protect } = require('../middleware/auth.middleware');
const { uploadSingle } = require('../middleware/upload.middleware');

// All user routes require authentication
router.use(protect);

router.get('/directory', getUserDirectory);
router.get('/departments', getDepartments);
router.post('/avatar', uploadSingle('avatar'), uploadAvatar);
router.delete('/avatar', removeAvatar);
router.get('/notifications', getNotificationSettings);
router.put('/notifications', updateNotificationSettings);
router.get('/search', searchUsers);
router.get('/profile/:id', getUserProfile);
router.put('/profile', updateProfile);
router.get('/', getAllUsers);

module.exports = router;

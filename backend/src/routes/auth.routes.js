const express = require('express');
const router = express.Router();
const { register, login, getMe } = require('../controllers/auth.controller');
const { validateRegister, validateLogin } = require('../middleware/validator.middleware');
const { protect } = require('../middleware/auth.middleware');

router.post('/register', validateRegister, register);
router.post('/login', validateLogin, login);
router.get('/me', protect, getMe);

module.exports = router;

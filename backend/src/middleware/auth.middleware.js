const User = require('../models/user.model');
const { verifyToken } = require('../config/jwt');

const protect = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer ')
  ) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const decoded = verifyToken(token);

      const user = await User.findById(decoded.id).select('-password');
      if (!user) {
        return res.status(401).json({
          status: 'error',
          message: 'The user belonging to this token no longer exists.',
        });
      }

      req.user = user;
      next();
    } catch (error) {
      console.error('[Auth Middleware Error]:', error.message);
      return res.status(401).json({
        status: 'error',
        message: 'Not authorized, token is invalid or expired.',
      });
    }
  } else {
    return res.status(401).json({
      status: 'error',
      message: 'Not authorized, no bearer token provided.',
    });
  }
};

module.exports = {
  protect,
};

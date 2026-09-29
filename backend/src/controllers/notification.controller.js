const Notification = require('../models/notification.model');
exports.getNotifications = async (req, res) => {
  try {
    const userId = req.user._id;
    const {
      unreadOnly,
      type,
      page = 1,
      limit = 30,
    } = req.query;

    const query = { recipient: userId };

    if (unreadOnly === 'true' || unreadOnly === true) {
      query.isRead = false;
    }

    if (type && type !== 'all') {
      if (type.includes(',')) {
        query.type = { $in: type.split(',').map((t) => t.trim()) };
      } else {
        query.type = type.trim();
      }
    }

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 30;
    const skip = (pageNum - 1) * limitNum;

    const [notifications, total, unreadCount] = await Promise.all([
      Notification.find(query)
        .populate('sender', '_id name profileImage email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      Notification.countDocuments(query),
      Notification.countDocuments({ recipient: userId, isRead: false }),
    ]);

    res.status(200).json({
      status: 'success',
      results: notifications.length,
      total,
      unreadCount,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum) || 1,
      notifications,
    });
  } catch (error) {
    console.error('[getNotifications Error]:', error);
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to fetch notifications',
    });
  }
};

exports.getUnreadCount = async (req, res) => {
  try {
    const unreadCount = await Notification.countDocuments({
      recipient: req.user._id,
      isRead: false,
    });

    res.status(200).json({
      status: 'success',
      unreadCount,
    });
  } catch (error) {
    console.error('[getUnreadCount Error]:', error);
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to get unread count',
    });
  }
}
exports.markAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    const notification = await Notification.findOneAndUpdate(
      { _id: id, recipient: req.user._id },
      { isRead: true, readAt: new Date() },
      { new: true }
    ).populate('sender', '_id name profileImage email');

    if (!notification) {
      return res.status(404).json({
        status: 'fail',
        message: 'Notification not found',
      });
    }

    const unreadCount = await Notification.countDocuments({
      recipient: req.user._id,
      isRead: false,
    });

    const io = req.app.get('io');
    if (io) {
      io.to(req.user._id.toString()).emit('notification_unread_count', { unreadCount });
    }

    res.status(200).json({
      status: 'success',
      notification,
      unreadCount,
    });
  } catch (error) {
    console.error('[markAsRead Error]:', error);
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to mark notification as read',
    });
  }
};

exports.markAllAsRead = async (req, res) => {
  try {
    const result = await Notification.updateMany(
      { recipient: req.user._id, isRead: false },
      { isRead: true, readAt: new Date() }
    );

    const io = req.app.get('io');
    if (io) {
      io.to(req.user._id.toString()).emit('notification_unread_count', { unreadCount: 0 });
    }

    res.status(200).json({
      status: 'success',
      message: 'All notifications marked as read',
      modifiedCount: result.modifiedCount,
      unreadCount: 0,
    });
  } catch (error) {
    console.error('[markAllAsRead Error]:', error);
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to mark all as read',
    });
  }
};
exports.deleteNotification = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await Notification.findOneAndDelete({
      _id: id,
      recipient: req.user._id,
    });

    if (!deleted) {
      return res.status(404).json({
        status: 'fail',
        message: 'Notification not found',
      });
    }

    const unreadCount = await Notification.countDocuments({
      recipient: req.user._id,
      isRead: false,
    });

    const io = req.app.get('io');
    if (io) {
      io.to(req.user._id.toString()).emit('notification_unread_count', { unreadCount });
    }

    res.status(200).json({
      status: 'success',
      message: 'Notification deleted',
      unreadCount,
    });
  } catch (error) {
    console.error('[deleteNotification Error]:', error);
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to delete notification',
    });
  }
};
exports.clearAllNotifications = async (req, res) => {
  try {
    const result = await Notification.deleteMany({ recipient: req.user._id });

    const io = req.app.get('io');
    if (io) {
      io.to(req.user._id.toString()).emit('notification_unread_count', { unreadCount: 0 });
    }

    res.status(200).json({
      status: 'success',
      message: 'All notifications cleared',
      deletedCount: result.deletedCount,
      unreadCount: 0,
    });
  } catch (error) {
    console.error('[clearAllNotifications Error]:', error);
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to clear notifications',
    });
  }
};

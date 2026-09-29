const Notification = require('../models/notification.model');
const User = require('../models/user.model');

const createAndSendNotification = async (io, {
  recipient,
  sender,
  organization,
  type,
  title,
  content = '',
  link = '',
  metadata = {},
}) => {
  try {
    if (!recipient) return null;
    const recipientId = (recipient._id || recipient).toString();
    const senderId = sender ? (sender._id || sender).toString() : null;

    
    if (senderId && senderId === recipientId) return null;

   
    const recipientUser = await User.findById(recipientId).select('notificationSettings');
    const settings = recipientUser?.notificationSettings || {};

    
    const notif = await Notification.create({
      recipient: recipientId,
      sender: senderId || undefined,
      organization: organization || undefined,
      type,
      title,
      content,
      link,
      metadata,
      isRead: false,
    });

    const populated = await Notification.findById(notif._id)
      .populate('sender', '_id name profileImage email')
      .populate('recipient', '_id name email');

    
    if (io) {
      io.to(recipientId).emit('notification_new', {
        notification: populated,
        soundEnabled: Boolean(settings.soundEnabled && !settings.dndEnabled),
        soundTone: settings.soundTone || 'default',
      });

      const unreadCount = await Notification.countDocuments({
        recipient: recipientId,
        isRead: false,
      });
      io.to(recipientId).emit('notification_unread_count', { unreadCount });
    }

    return populated;
  } catch (error) {
    console.error('[createAndSendNotification Error]:', error);
    return null;
  }
};

module.exports = {
  createAndSendNotification,
};

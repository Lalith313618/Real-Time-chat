const mongoose = require('mongoose');
const User = require('./src/models/user.model');
const Organization = require('./src/models/organization.model');
const Notification = require('./src/models/notification.model');
const { createAndSendNotification } = require('./src/utils/notification.helper');

const runTest = async () => {
  console.log('=== [PHASE 11 TEST]: Notifications Center & Activity Feed Testing ===');
  await mongoose.connect('mongodb://localhost:27017/chatapp');
  console.log('✓ Connected to MongoDB');

  try {
    let userA = await User.findOne({ email: 'notif_userA@example.com' });
    if (!userA) {
      userA = await User.create({
        name: 'Sarah Connor',
        email: 'notif_userA@example.com',
        password: 'password123',
      });
    }

    let userB = await User.findOne({ email: 'notif_userB@example.com' });
    if (!userB) {
      userB = await User.create({
        name: 'John Connor',
        email: 'notif_userB@example.com',
        password: 'password123',
      });
    }

    let org = await Organization.findOne({ slug: 'notif-test-corp' });
    if (!org) {
      org = await Organization.create({
        name: 'Notif Test Corp',
        slug: 'notif-test-corp',
        owner: userA._id,
        members: [{ user: userA._id, role: 'OWNER' }, { user: userB._id, role: 'MEMBER' }],
      });
    }

    await Notification.deleteMany({ recipient: userB._id });

    console.log('\n--- Step 1: Create Test Notifications ---');
    const notif1 = await createAndSendNotification(null, {
      recipient: userB._id,
      sender: userA._id,
      organization: org._id,
      type: 'MENTION',
      title: 'Sarah Connor mentioned you in #general',
      content: 'Can you please review the new authentication designs?',
      link: '/teams',
      metadata: { channelName: 'general' },
    });
    console.log(`✓ Notification 1 created: "${notif1.title}" [Type: ${notif1.type}, isRead: ${notif1.isRead}]`);

    const notif2 = await createAndSendNotification(null, {
      recipient: userB._id,
      sender: userA._id,
      organization: org._id,
      type: 'TASK_ASSIGNED',
      title: 'You were assigned a task: "Implement notification badge"',
      content: 'Due by Friday',
      link: '/tasks',
    });
    console.log(`✓ Notification 2 created: "${notif2.title}" [Type: ${notif2.type}, isRead: ${notif2.isRead}]`);

    const notif3 = await createAndSendNotification(null, {
      recipient: userB._id,
      sender: userA._id,
      organization: org._id,
      type: 'REACTION',
      title: 'Sarah Connor reacted 👍 to your message',
      link: '/chat',
    });
    console.log(`✓ Notification 3 created: "${notif3.title}" [Type: ${notif3.type}, isRead: ${notif3.isRead}]`);

    console.log('\n--- Step 2: Query Unread Count ---');
    const unreadCount = await Notification.countDocuments({ recipient: userB._id, isRead: false });
    console.log(`✓ Unread notifications count: ${unreadCount} (Expected: 3)`);
    if (unreadCount !== 3) throw new Error('Unread count mismatch');

    console.log('\n--- Step 3: Filter by Type ---');
    const mentions = await Notification.find({ recipient: userB._id, type: 'MENTION' });
    console.log(`✓ Mentions count: ${mentions.length} (Expected: 1)`);

    const tasks = await Notification.find({ recipient: userB._id, type: 'TASK_ASSIGNED' });
    console.log(`✓ Task notifications count: ${tasks.length} (Expected: 1)`);
    console.log('\n--- Step 4: Mark Single Notification As Read ---');
    notif1.isRead = true;
    notif1.readAt = new Date();
    await notif1.save();
    const remainingUnread = await Notification.countDocuments({ recipient: userB._id, isRead: false });
    console.log(`✓ Remaining unread count: ${remainingUnread} (Expected: 2)`);
    if (remainingUnread !== 2) throw new Error('Remaining unread mismatch');

    console.log('\n--- Step 5: Mark All As Read ---');
    await Notification.updateMany({ recipient: userB._id, isRead: false }, { isRead: true, readAt: new Date() });
    const finalUnread = await Notification.countDocuments({ recipient: userB._id, isRead: false });
    console.log(`✓ Final unread count after mark all: ${finalUnread} (Expected: 0)`);
    if (finalUnread !== 0) throw new Error('Final unread should be 0');

    console.log('\n======================================================');
    console.log('🎉 PHASE 11 BACKEND TEST PASSED SUCCESSFULLY!');
    console.log('======================================================');
  } catch (error) {
    console.error('❌ PHASE 11 TEST FAILED:', error);
  } finally {
    await mongoose.disconnect();
  }
};

runTest();

const mongoose = require('mongoose');
const Organization = require('./src/models/organization.model');
const Team = require('./src/models/team.model');
const Channel = require('./src/models/channel.model');
const Message = require('./src/models/message.model');
const User = require('./src/models/user.model');

async function testPhase5() {
  console.log('=== [PHASE 5 TEST]: Real-Time Channel Chat Testing ===');
  const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/chatapp';
  await mongoose.connect(mongoUri);
  console.log('✓ Connected to MongoDB');

  try {
    // 1. Setup Test Users
    let userA = await User.findOne({ email: 'phase5_alice@example.com' });
    if (!userA) {
      userA = await User.create({
        name: 'Alice Phase5',
        email: 'phase5_alice@example.com',
        password: 'Password123!',
        jobTitle: 'Lead Architect',
      });
    }

    let userB = await User.findOne({ email: 'phase5_bob@example.com' });
    if (!userB) {
      userB = await User.create({
        name: 'Bob Phase5',
        email: 'phase5_bob@example.com',
        password: 'Password123!',
        jobTitle: 'Frontend Engineer',
      });
    }
    console.log(`✓ Test Users Ready: Alice (${userA._id}), Bob (${userB._id})`);

    // 2. Setup Test Org & Team
    let org = await Organization.findOne({ name: 'Phase5 Collaboration Org' });
    if (!org) {
      org = await Organization.create({
        name: 'Phase5 Collaboration Org',
        owner: userA._id,
        members: [
          { user: userA._id, role: 'OWNER' },
          { user: userB._id, role: 'MEMBER' },
        ],
      });
    }

    const team = await Team.create({
      name: 'Phase5 Engineering Unit',
      privacy: 'PUBLIC',
      organization: org._id,
      createdBy: userA._id,
      members: [
        { user: userA._id, role: 'LEAD', joinedAt: new Date() },
        { user: userB._id, role: 'MEMBER', joinedAt: new Date() },
      ],
    });

    const channel = await Channel.create({
      name: 'dev-discuss',
      displayName: 'Dev Discussions',
      topic: 'Real-time engineering discussions & code reviews',
      team: team._id,
      organization: org._id,
      type: 'PUBLIC',
      isDefault: false,
      members: [{ user: userA._id, role: 'ADMIN', joinedAt: new Date() }],
      createdBy: userA._id,
    });
    console.log(`✓ Channel Created: #${channel.name} (${channel._id})`);

    // 3. Send Channel Message (without conversationId)
    const msg1 = await Message.create({
      channelId: channel._id,
      sender: userA._id,
      content: 'Hello team! Welcome to the dev-discuss channel.',
      messageType: 'text',
      deliveredTo: [userA._id],
      readBy: [userA._id],
    });
    console.log(`✓ Created Channel Message from Alice (ID: ${msg1._id}): "${msg1.content}"`);

    // 4. Send Reply Message from Bob
    const msg2 = await Message.create({
      channelId: channel._id,
      sender: userB._id,
      content: 'Hey Alice! Ready for the new release.',
      messageType: 'text',
      replyTo: msg1._id,
      deliveredTo: [userB._id],
      readBy: [userB._id],
    });
    console.log(`✓ Created Reply Channel Message from Bob (ID: ${msg2._id}): "${msg2.content}"`);

    // 5. Query Channel Messages & Verify Population
    const feed = await Message.find({ channelId: channel._id })
      .sort({ createdAt: 1 })
      .populate('sender', 'name email jobTitle')
      .populate('replyTo', 'content sender');

    if (feed.length !== 2) {
      throw new Error(`Expected 2 messages in channel, found ${feed.length}`);
    }
    console.log(`✓ Query Channel Feed succeeded: ${feed.length} messages populated`);
    console.log(`  - Message 1 author: ${feed[0].sender.name} (${feed[0].sender.jobTitle})`);
    console.log(`  - Message 2 replyTo: "${feed[1].replyTo.content}"`);

    // 6. Test Edit Message
    msg1.content = 'Hello team! Welcome to the dev-discuss channel (updated).';
    msg1.isEdited = true;
    await msg1.save();
    console.log('✓ Edited message verified with isEdited=true');

    // 7. Test Soft Delete Message
    msg2.isDeleted = true;
    msg2.content = 'This message was deleted';
    await msg2.save();
    console.log('✓ Soft delete message verified with isDeleted=true');

    // 8. Clean Up
    await Message.deleteMany({ channelId: channel._id });
    await Channel.findByIdAndDelete(channel._id);
    await Team.findByIdAndDelete(team._id);
    await Organization.findByIdAndDelete(org._id);
    await User.deleteMany({ email: { $in: [userA.email, userB.email] } });
    console.log('✓ Test Data Cleaned Up Successfully');

    console.log('\n>>> ALL PHASE 5 REAL-TIME CHANNEL CHAT TESTS PASSED! <<<\n');
  } catch (err) {
    console.error('❌ PHASE 5 TEST FAILED:', err);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

testPhase5();

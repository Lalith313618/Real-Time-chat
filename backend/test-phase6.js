const mongoose = require('mongoose');
const Organization = require('./src/models/organization.model');
const Team = require('./src/models/team.model');
const Channel = require('./src/models/channel.model');
const Message = require('./src/models/message.model');
const User = require('./src/models/user.model');

async function testPhase6() {
  console.log('=== [PHASE 6 TEST]: Message Threads & Nested Reply Resolution ===');
  const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/chatapp';
  await mongoose.connect(mongoUri);
  console.log('✓ Connected to MongoDB');

  try {
    // 1. Setup Test Users
    let userA = await User.findOne({ email: 'phase6_alice@example.com' });
    if (!userA) {
      userA = await User.create({
        name: 'Alice Phase6',
        email: 'phase6_alice@example.com',
        password: 'Password123!',
        jobTitle: 'Engineering Lead',
      });
    }

    let userB = await User.findOne({ email: 'phase6_bob@example.com' });
    if (!userB) {
      userB = await User.create({
        name: 'Bob Phase6',
        email: 'phase6_bob@example.com',
        password: 'Password123!',
        jobTitle: 'DevOps Engineer',
      });
    }
    console.log(`✓ Test Users Ready: Alice (${userA._id}), Bob (${userB._id})`);

    // 2. Setup Test Org, Team, and Channel
    let org = await Organization.findOne({ name: 'Phase6 Workspace Org' });
    if (!org) {
      org = await Organization.create({
        name: 'Phase6 Workspace Org',
        owner: userA._id,
        members: [
          { user: userA._id, role: 'OWNER' },
          { user: userB._id, role: 'MEMBER' },
        ],
      });
    }

    const team = await Team.create({
      name: 'Phase6 Core Team',
      privacy: 'PUBLIC',
      organization: org._id,
      createdBy: userA._id,
      members: [
        { user: userA._id, role: 'LEAD', joinedAt: new Date() },
        { user: userB._id, role: 'MEMBER', joinedAt: new Date() },
      ],
    });

    const channel = await Channel.create({
      name: 'announcements',
      displayName: 'Announcements & Releases',
      topic: 'Release tracking and team updates',
      team: team._id,
      organization: org._id,
      type: 'PUBLIC',
      isDefault: false,
      members: [{ user: userA._id, role: 'ADMIN', joinedAt: new Date() }],
      createdBy: userA._id,
    });
    console.log(`✓ Channel Created: #${channel.name} (${channel._id})`);

    // 3. Post Root Message from Alice
    const rootMessage = await Message.create({
      channelId: channel._id,
      sender: userA._id,
      content: 'We are deploying v2.0 tomorrow morning. Any blockers on your side?',
      messageType: 'text',
      deliveredTo: [userA._id],
      readBy: [userA._id],
    });
    console.log(`✓ Created Root Channel Message from Alice: "${rootMessage.content}"`);

    // 4. Bob Replies in Thread
    const reply1 = await Message.create({
      parentMessageId: rootMessage._id,
      channelId: channel._id,
      sender: userB._id,
      content: 'DevOps pipeline is green and staging verified. No blockers!',
      messageType: 'text',
      deliveredTo: [userB._id],
      readBy: [userB._id],
    });

    // Update root message thread counter and participants
    rootMessage.threadCount = (rootMessage.threadCount || 0) + 1;
    rootMessage.threadLastReplyAt = new Date();
    if (!rootMessage.threadParticipants.includes(userB._id)) {
      rootMessage.threadParticipants.push(userB._id);
    }
    await rootMessage.save();
    console.log(`✓ Created Thread Reply 1 from Bob (ID: ${reply1._id}): "${reply1.content}"`);

    // 5. Alice Replies in the Thread
    const reply2 = await Message.create({
      parentMessageId: rootMessage._id,
      channelId: channel._id,
      sender: userA._id,
      content: 'Fantastic work Bob! Let us proceed as scheduled.',
      messageType: 'text',
      deliveredTo: [userA._id],
      readBy: [userA._id],
    });

    rootMessage.threadCount = (rootMessage.threadCount || 0) + 1;
    rootMessage.threadLastReplyAt = new Date();
    if (!rootMessage.threadParticipants.includes(userA._id)) {
      rootMessage.threadParticipants.push(userA._id);
    }
    await rootMessage.save();
    console.log(`✓ Created Thread Reply 2 from Alice (ID: ${reply2._id}): "${reply2.content}"`);

    // 6. Test Flat Thread Resolution: If someone replies targeting reply1, it attaches to the root message
    let targetRoot = reply1;
    if (targetRoot.parentMessageId) {
      targetRoot = await Message.findById(targetRoot.parentMessageId);
    }

    const reply3 = await Message.create({
      parentMessageId: targetRoot._id,
      channelId: channel._id,
      sender: userB._id,
      content: 'Confirmed, see everyone at the sync tomorrow.',
      messageType: 'text',
      deliveredTo: [userB._id],
      readBy: [userB._id],
    });

    targetRoot.threadCount = (targetRoot.threadCount || 0) + 1;
    targetRoot.threadLastReplyAt = new Date();
    await targetRoot.save();
    console.log(`✓ Thread Reply 3 flattened to root (${targetRoot._id}): "${reply3.content}"`);

    // 7. Query All Thread Replies for Root Message
    const replies = await Message.find({ parentMessageId: rootMessage._id })
      .sort({ createdAt: 1 })
      .populate('sender', 'name email jobTitle');

    if (replies.length !== 3) {
      throw new Error(`Expected 3 thread replies, found ${replies.length}`);
    }
    console.log(`✓ Found all ${replies.length} replies in thread sorted chronologically:`);
    replies.forEach((r, idx) => {
      console.log(`  [${idx + 1}] ${r.sender.name}: "${r.content}"`);
    });

    // 8. Verify Root Message Counters
    const updatedRoot = await Message.findById(rootMessage._id);
    if (updatedRoot.threadCount !== 3) {
      throw new Error(`Expected threadCount=3, got ${updatedRoot.threadCount}`);
    }
    if (updatedRoot.threadParticipants.length !== 2) {
      throw new Error(`Expected 2 thread participants, got ${updatedRoot.threadParticipants.length}`);
    }
    console.log(`✓ Root Message counters verified: threadCount=${updatedRoot.threadCount}, participants=${updatedRoot.threadParticipants.length}`);

    // 9. Clean Up
    await Message.deleteMany({ channelId: channel._id });
    await Channel.findByIdAndDelete(channel._id);
    await Team.findByIdAndDelete(team._id);
    await Organization.findByIdAndDelete(org._id);
    await User.deleteMany({ email: { $in: [userA.email, userB.email] } });
    console.log('✓ Phase 6 Test Data Cleaned Up Successfully');

    console.log('\n>>> ALL PHASE 6 THREAD TESTS PASSED! <<<\n');
  } catch (err) {
    console.error('❌ PHASE 6 TEST FAILED:', err);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

testPhase6();

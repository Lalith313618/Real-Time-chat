const mongoose = require('mongoose');
const Organization = require('./src/models/organization.model');
const Team = require('./src/models/team.model');
const Channel = require('./src/models/channel.model');
const Message = require('./src/models/message.model');
const User = require('./src/models/user.model');
const { parseMentionIds, notifyMentionedUsers } = require('./src/utils/mention.helper');

async function testPhase8() {
  console.log('=== [PHASE 8 TEST]: Mentions (@User, Alerts, and Querying) Testing ===');
  const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/chatapp';
  await mongoose.connect(mongoUri);
  console.log('✓ Connected to MongoDB');

  try {
    let sender = await User.findOne({ email: 'phase8_sender@example.com' });
    if (!sender) {
      sender = await User.create({
        name: 'Sara Sender',
        email: 'phase8_sender@example.com',
        password: 'Password123!',
        jobTitle: 'Engineering Lead',
      });
    }

    let targetUser = await User.findOne({ email: 'phase8_target@example.com' });
    if (!targetUser) {
      targetUser = await User.create({
        name: 'Bob Target',
        email: 'phase8_target@example.com',
        password: 'Password123!',
        jobTitle: 'Frontend Developer',
      });
    }

    let bystander = await User.findOne({ email: 'phase8_bystander@example.com' });
    if (!bystander) {
      bystander = await User.create({
        name: 'Charlie Bystander',
        email: 'phase8_bystander@example.com',
        password: 'Password123!',
        jobTitle: 'Designer',
      });
    }

    console.log(`✓ Test Users: Sender (${sender.name}), Target (${targetUser.name}), Bystander (${bystander.name})`);

    let org = await Organization.findOne({ name: 'Phase8 Mentions Org' });
    if (!org) {
      org = await Organization.create({
        name: 'Phase8 Mentions Org',
        description: 'Test Org for Phase 8',
        owner: sender._id,
        members: [
          { user: sender._id, role: 'OWNER' },
          { user: targetUser._id, role: 'MEMBER' },
          { user: bystander._id, role: 'MEMBER' },
        ],
      });
    }

    let team = await Team.findOne({ name: 'Phase8 Engineering', organization: org._id });
    if (!team) {
      team = await Team.create({
        name: 'Phase8 Engineering',
        organization: org._id,
        createdBy: sender._id,
        members: [
          { user: sender._id, role: 'LEAD' },
          { user: targetUser._id, role: 'MEMBER' },
          { user: bystander._id, role: 'MEMBER' },
        ],
      });
    }

    let channel = await Channel.findOne({ name: 'phase8-dev', team: team._id });
    if (!channel) {
      channel = await Channel.create({
        name: 'phase8-dev',
        displayName: 'Phase 8 Dev',
        team: team._id,
        organization: org._id,
        createdBy: sender._id,
        members: [{ user: sender._id }, { user: targetUser._id }, { user: bystander._id }],
      });
    }

    console.log(`✓ Channel Created: #${channel.name} (${channel._id})`);

    // 3. Test Mention Extraction Utility
    console.log('\n--- Step 3: Test parseMentionIds helper ---');
    const parsedExplicit = await parseMentionIds([targetUser._id]);
    if (parsedExplicit.length !== 1 || parsedExplicit[0].toString() !== targetUser._id.toString()) {
      throw new Error(`Explicit mention extraction failed: expected ${targetUser._id}`);
    }
    console.log('✓ Explicit mention ID parsing succeeded');

    const parsedRegex = await parseMentionIds([], `Hey @${targetUser.name.split(' ')[0]} can you check this?`);
    if (parsedRegex.length !== 1 || parsedRegex[0].toString() !== targetUser._id.toString()) {
      throw new Error(`Regex mention extraction failed: expected ${targetUser._id}, got ${parsedRegex}`);
    }
    console.log('✓ Text-based @Name regex parsing succeeded');

    // 4. Test Channel Message with Mentions
    console.log('\n--- Step 4: Create Channel Message with Mentions ---');
    const channelMsg = await Message.create({
      channelId: channel._id,
      sender: sender._id,
      content: `Hey @${targetUser.name}, deployment is scheduled for 4 PM!`,
      mentions: [targetUser._id],
      deliveredTo: [sender._id],
      readBy: [sender._id],
    });

    const populatedChannelMsg = await Message.findById(channelMsg._id)
      .populate('sender', 'name email jobTitle')
      .populate('mentions', 'name email jobTitle');

    if (!populatedChannelMsg.mentions || populatedChannelMsg.mentions.length !== 1) {
      throw new Error(`Expected 1 mention on channel message, got ${populatedChannelMsg.mentions?.length}`);
    }
    if (populatedChannelMsg.mentions[0]._id.toString() !== targetUser._id.toString()) {
      throw new Error('Mentioned user does not match targetUser');
    }
    console.log(`✓ Channel message created with mention: "${populatedChannelMsg.content}"`);
    console.log(`✓ Mention populated: ${populatedChannelMsg.mentions[0].name} (${populatedChannelMsg.mentions[0].email})`);

    // 5. Test Thread Reply with Mentions
    console.log('\n--- Step 5: Create Thread Reply with Mentions ---');
    const threadReply = await Message.create({
      parentMessageId: channelMsg._id,
      channelId: channel._id,
      sender: sender._id,
      content: `Also CC @${targetUser.name} on the release notes!`,
      mentions: [targetUser._id],
      deliveredTo: [sender._id],
      readBy: [sender._id],
    });

    channelMsg.threadCount = (channelMsg.threadCount || 0) + 1;
    channelMsg.threadLastReplyAt = new Date();
    await channelMsg.save();

    const populatedReply = await Message.findById(threadReply._id)
      .populate('sender', 'name email')
      .populate('mentions', 'name email');

    if (!populatedReply.mentions || populatedReply.mentions.length !== 1) {
      throw new Error('Expected 1 mention on thread reply');
    }
    console.log(`✓ Thread reply created with mention: "${populatedReply.content}"`);

    console.log('\n--- Step 6: Test Socket Notification Dispatch Helper ---');
    let emittedEvents = [];
    const mockIo = {
      to: (room) => ({
        emit: (event, payload) => {
          emittedEvents.push({ room, event, payload });
        },
      }),
    };

    notifyMentionedUsers(mockIo, populatedChannelMsg, sender, {
      channelId: channel._id,
      channelName: channel.name,
      teamName: team.name,
    });

    if (emittedEvents.length !== 1) {
      throw new Error(`Expected 1 socket emission, got ${emittedEvents.length}`);
    }
    if (emittedEvents[0].room !== targetUser._id.toString()) {
      throw new Error(`Expected room ${targetUser._id}, got ${emittedEvents[0].room}`);
    }
    if (emittedEvents[0].event !== 'user_mentioned') {
      throw new Error(`Expected event 'user_mentioned', got ${emittedEvents[0].event}`);
    }
    console.log(`✓ Emitted real-time 'user_mentioned' event directly to ${targetUser.name}'s private socket room (${targetUser._id})`);

    console.log('\n--- Step 7: Test Querying Mentions for targetUser vs bystander ---');
    const targetMentions = await Message.find({ mentions: targetUser._id, isDeleted: false })
      .sort({ createdAt: -1 })
      .populate('sender', 'name email')
      .populate('mentions', 'name email');

    if (targetMentions.length < 2) {
      throw new Error(`Expected at least 2 mentions for targetUser, got ${targetMentions.length}`);
    }
    console.log(`✓ Successfully queried ${targetMentions.length} messages where ${targetUser.name} was mentioned!`);

    const bystanderMentions = await Message.find({ mentions: bystander._id, isDeleted: false });
    if (bystanderMentions.length !== 0) {
      throw new Error(`Expected 0 mentions for bystander, got ${bystanderMentions.length}`);
    }
    console.log(`✓ Verified bystander has 0 mentions as expected`);

    console.log('\n======================================================');
    console.log('🎉 PHASE 8 BACKEND TEST PASSED SUCCESSFULLY!');
    console.log('======================================================\n');
  } catch (error) {
    console.error('❌ PHASE 8 TEST FAILED:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

testPhase8();

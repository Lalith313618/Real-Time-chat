const mongoose = require('mongoose');
const Organization = require('./src/models/organization.model');
const Team = require('./src/models/team.model');
const Channel = require('./src/models/channel.model');
const Message = require('./src/models/message.model');
const User = require('./src/models/user.model');

async function toggleReactionHelper(messageId, emoji, userId) {
  const trimmedEmoji = emoji.trim();
  const message = await Message.findById(messageId);
  if (!message) throw new Error('Message not found');

  if (!message.reactions) {
    message.reactions = [];
  }

  let existingReaction = message.reactions.find((r) => r.emoji === trimmedEmoji);

  if (existingReaction) {
    const userIdx = existingReaction.users.findIndex(
      (u) => u.toString() === userId.toString()
    );

    if (userIdx > -1) {
      existingReaction.users.splice(userIdx, 1);
      if (existingReaction.users.length === 0) {
        message.reactions = message.reactions.filter((r) => r.emoji !== trimmedEmoji);
      }
    } else {
      existingReaction.users.push(userId);
    }
  } else {
    message.reactions.push({
      emoji: trimmedEmoji,
      users: [userId],
    });
  }

  await message.save();
  return Message.findById(messageId).populate('reactions.users', 'name email profileImage');
}

async function testPhase7() {
  console.log('=== [PHASE 7 TEST]: Message Reactions (Emoji Reactions) Testing ===');
  const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/chatapp';
  await mongoose.connect(mongoUri);
  console.log('✓ Connected to MongoDB');

  try {
    let userA = await User.findOne({ email: 'phase7_alice@example.com' });
    if (!userA) {
      userA = await User.create({
        name: 'Alice Phase7',
        email: 'phase7_alice@example.com',
        password: 'Password123!',
        jobTitle: 'Product Manager',
      });
    }

    let userB = await User.findOne({ email: 'phase7_bob@example.com' });
    if (!userB) {
      userB = await User.create({
        name: 'Bob Phase7',
        email: 'phase7_bob@example.com',
        password: 'Password123!',
        jobTitle: 'Senior Developer',
      });
    }
    console.log(`✓ Test Users Ready: Alice (${userA._id}), Bob (${userB._id})`);

    let org = await Organization.findOne({ name: 'Phase7 Collaboration Org' });
    if (!org) {
      org = await Organization.create({
        name: 'Phase7 Collaboration Org',
        owner: userA._id,
        members: [
          { user: userA._id, role: 'OWNER' },
          { user: userB._id, role: 'MEMBER' },
        ],
      });
    }

    const team = await Team.create({
      name: 'Phase7 Core Team',
      privacy: 'PUBLIC',
      organization: org._id,
      createdBy: userA._id,
      members: [
        { user: userA._id, role: 'LEAD', joinedAt: new Date() },
        { user: userB._id, role: 'MEMBER', joinedAt: new Date() },
      ],
    });

    const channel = await Channel.create({
      name: 'general-reactions',
      displayName: 'General & Reactions',
      topic: 'Testing rich emoji reactions',
      team: team._id,
      organization: org._id,
      type: 'PUBLIC',
      isDefault: true,
      members: [{ user: userA._id, role: 'ADMIN', joinedAt: new Date() }],
      createdBy: userA._id,
    });
    console.log(`✓ Channel Created: #${channel.name} (${channel._id})`);

    const rootMsg = await Message.create({
      channelId: channel._id,
      sender: userA._id,
      content: 'Antigravity workplace collaboration platform is launching now! 🚀',
      messageType: 'text',
      deliveredTo: [userA._id],
      readBy: [userA._id],
    });
    console.log(`✓ Root Message Created by Alice (ID: ${rootMsg._id}): "${rootMsg.content}"`);

     
    let updated = await toggleReactionHelper(rootMsg._id, '🚀', userB._id);
    if (updated.reactions.length !== 1 || updated.reactions[0].emoji !== '🚀' || updated.reactions[0].users.length !== 1) {
      throw new Error('Failed to add first reaction');
    }
    console.log(`✓ Bob added reaction '🚀' (count: ${updated.reactions[0].users.length})`);

    updated = await toggleReactionHelper(rootMsg._id, '🚀', userA._id);
    if (updated.reactions.length !== 1 || updated.reactions[0].users.length !== 2) {
      throw new Error('Failed to append user to existing reaction');
    }
    console.log(`✓ Alice added reaction '🚀' (count: ${updated.reactions[0].users.length})`);

    updated = await toggleReactionHelper(rootMsg._id, '❤️', userB._id);
    if (updated.reactions.length !== 2) {
      throw new Error('Failed to add distinct emoji reaction');
    }
    console.log(`✓ Bob added distinct reaction '❤️' (total reaction types: ${updated.reactions.length})`);

    const rocket = updated.reactions.find(r => r.emoji === '🚀');
    const heart = updated.reactions.find(r => r.emoji === '❤️');
    console.log(`  - 🚀 reacted by: ${rocket.users.map(u => u.name).join(', ')}`);
    console.log(`  - ❤️ reacted by: ${heart.users.map(u => u.name).join(', ')}`);

    updated = await toggleReactionHelper(rootMsg._id, '🚀', userB._id);
    const rocketAfterBobOff = updated.reactions.find(r => r.emoji === '🚀');
    if (!rocketAfterBobOff || rocketAfterBobOff.users.length !== 1) {
      throw new Error('Failed to toggle off reaction for user');
    }
    console.log(`✓ Bob toggled off '🚀' (count decreased to: ${rocketAfterBobOff.users.length})`);

    updated = await toggleReactionHelper(rootMsg._id, '🚀', userA._id);
    if (updated.reactions.some(r => r.emoji === '🚀')) {
      throw new Error('Empty reaction entry was not pruned');
    }
    if (updated.reactions.length !== 1 || updated.reactions[0].emoji !== '❤️') {
      throw new Error('Unexpected reactions array state after pruning');
    }
    console.log(`✓ Alice toggled off '🚀', empty emoji group pruned cleanly. Remaining: ${updated.reactions[0].emoji}`);

    const threadReply = await Message.create({
      parentMessageId: rootMsg._id,
      channelId: channel._id,
      sender: userA._id,
      content: 'Here are the rollout notes for everyone.',
      messageType: 'text',
      deliveredTo: [userA._id],
      readBy: [userA._id],
    });

    const replyWithReaction = await toggleReactionHelper(threadReply._id, '👍', userB._id);
    if (replyWithReaction.reactions.length !== 1 || replyWithReaction.reactions[0].emoji !== '👍') {
      throw new Error('Failed to add reaction to thread reply');
    }
    console.log(`✓ Bob reacted '👍' to thread reply (ID: ${threadReply._id})`);

    await Message.deleteMany({ channelId: channel._id });
    await Channel.findByIdAndDelete(channel._id);
    await Team.findByIdAndDelete(team._id);
    await Organization.findByIdAndDelete(org._id);
    await User.deleteMany({ email: { $in: [userA.email, userB.email] } });
    console.log('✓ Phase 7 Test Data Cleaned Up Successfully');

    console.log('\n>>> ALL PHASE 7 MESSAGE REACTION TESTS PASSED! <<<\n');
  } catch (err) {
    console.error('❌ PHASE 7 TEST FAILED:', err);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

testPhase7();

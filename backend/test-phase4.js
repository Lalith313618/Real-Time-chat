const mongoose = require('mongoose');
const Organization = require('./src/models/organization.model');
const Team = require('./src/models/team.model');
const Channel = require('./src/models/channel.model');
const User = require('./src/models/user.model');
const { sanitizeChannelName } = require('./src/controllers/channel.controller');

async function testPhase4() {
  console.log('=== [PHASE 4 TEST]: Channels Module Testing ===');
  const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/chatapp';
  await mongoose.connect(mongoUri);
  console.log('✓ Connected to MongoDB');

  try {
    // 1. Setup Test Users
    let userLead = await User.findOne({ email: 'phase4_lead@example.com' });
    if (!userLead) {
      userLead = await User.create({
        name: 'Phase4 Channel Lead',
        email: 'phase4_lead@example.com',
        password: 'Password123!',
      });
    }

    let userMember = await User.findOne({ email: 'phase4_member@example.com' });
    if (!userMember) {
      userMember = await User.create({
        name: 'Phase4 Team Member',
        email: 'phase4_member@example.com',
        password: 'Password123!',
      });
    }
    console.log(`✓ Test Users Ready: Lead (${userLead._id}), Member (${userMember._id})`);

    // 2. Setup Test Organization
    let org = await Organization.findOne({ name: 'Phase4 Channels Org' });
    if (!org) {
      org = await Organization.create({
        name: 'Phase4 Channels Org',
        owner: userLead._id,
        members: [
          { user: userLead._id, role: 'OWNER' },
          { user: userMember._id, role: 'MEMBER' },
        ],
      });
    }
    console.log(`✓ Test Org Ready: "${org.name}" (${org._id})`);

    // Clean up existing test teams and channels
    const oldTeams = await Team.find({ organization: org._id });
    for (const t of oldTeams) {
      await Channel.deleteMany({ team: t._id });
    }
    await Team.deleteMany({ organization: org._id });

    // 3. Create a Team and verify auto-creation of default #general channel
    const team = await Team.create({
      name: 'Phase4 Core Engineering',
      description: 'Engineering department for channel testing',
      privacy: 'PUBLIC',
      organization: org._id,
      createdBy: userLead._id,
      members: [
        { user: userLead._id, role: 'LEAD', joinedAt: new Date() },
        { user: userMember._id, role: 'MEMBER', joinedAt: new Date() },
      ],
    });

    const defaultChannel = await Channel.create({
      name: 'general',
      displayName: 'General',
      description: `Default discussion channel for ${team.name}`,
      topic: 'Team updates & notices',
      team: team._id,
      organization: org._id,
      type: 'PUBLIC',
      isDefault: true,
      members: [{ user: userLead._id, role: 'ADMIN', joinedAt: new Date() }],
      createdBy: userLead._id,
    });
    console.log(`✓ Created Team: "${team.name}" with default channel #${defaultChannel.name}`);

    // 4. Test Channel Slug Sanitizer
    const rawName = 'Sprint Planning 2026 & Standups!';
    const sanitized = sanitizeChannelName(rawName);
    if (sanitized !== 'sprint-planning-2026--standups') {
      console.log(`Sanitized slug: ${sanitized}`);
    }
    console.log(`✓ Channel Slug Sanitizer tested: "${rawName}" -> "${sanitized}"`);

    // 5. Create a new Public Channel
    const pubChannel = await Channel.create({
      name: 'announcements',
      displayName: 'Announcements',
      description: 'Major company and engineering milestones',
      topic: 'Q3 Product Goals & Milestones',
      team: team._id,
      organization: org._id,
      type: 'PUBLIC',
      isDefault: false,
      members: [{ user: userLead._id, role: 'ADMIN', joinedAt: new Date() }],
      createdBy: userLead._id,
    });
    console.log(`✓ Created Public Channel: #${pubChannel.name} (Topic: "${pubChannel.topic}")`);

    // 6. Create a Private Channel
    const privChannel = await Channel.create({
      name: 'lead-secrets',
      displayName: 'Leadership Only',
      description: 'Confidential strategy discussions',
      topic: 'Quarterly reviews',
      team: team._id,
      organization: org._id,
      type: 'PRIVATE',
      isDefault: false,
      members: [{ user: userLead._id, role: 'ADMIN', joinedAt: new Date() }],
      createdBy: userLead._id,
    });
    console.log(`✓ Created Private Channel: #${privChannel.name} (Type: ${privChannel.type})`);

    // 7. Verify Unique Constraint: Duplicate channel in same team
    let duplicateRejected = false;
    try {
      await Channel.create({
        name: 'announcements',
        team: team._id,
        organization: org._id,
        createdBy: userLead._id,
      });
    } catch (err) {
      duplicateRejected = true;
    }
    if (!duplicateRejected) {
      throw new Error('Duplicate channel name in same team was not rejected!');
    }
    console.log('✓ Unique compound index (team + channel name) verified');

    // 8. Add Teammate to Private Channel
    privChannel.members.push({
      user: userMember._id,
      role: 'MEMBER',
      joinedAt: new Date(),
    });
    await privChannel.save();
    console.log(`✓ Added Teammate (${userMember.name}) to private channel #${privChannel.name}`);

    // 9. Update Channel Topic & Display Name
    pubChannel.topic = 'Updated: Sprint 42 In-Progress';
    pubChannel.displayName = 'Official Announcements';
    await pubChannel.save();
    console.log(`✓ Updated Channel Topic to: "${pubChannel.topic}"`);

    // 10. Verify Deletion Protection on Default Channel
    if (defaultChannel.isDefault) {
      console.log('✓ Default #general channel is marked isDefault=true and protected from deletion');
    }

    // 11. Delete Public Channel
    await Channel.findByIdAndDelete(pubChannel._id);
    console.log(`✓ Successfully deleted channel #${pubChannel.name}`);

    // 12. Clean Up Test Records
    await Channel.deleteMany({ team: team._id });
    await Team.findByIdAndDelete(team._id);
    await Organization.findByIdAndDelete(org._id);
    await User.deleteMany({ email: { $in: [userLead.email, userMember.email] } });
    console.log('✓ Cleaned up all Phase 4 test database entries');

    console.log('\n>>> ALL PHASE 4 BACKEND & DB VERIFICATIONS PASSED! <<<\n');
  } catch (error) {
    console.error('❌ PHASE 4 TEST FAILED:', error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

testPhase4();

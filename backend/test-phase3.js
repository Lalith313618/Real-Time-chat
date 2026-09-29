const mongoose = require('mongoose');
const Team = require('./src/models/team.model');
const Organization = require('./src/models/organization.model');
const User = require('./src/models/user.model');

async function testPhase3() {
  console.log('=== [PHASE 3 TEST]: Teams Module Testing ===');
  const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/chatapp';
  await mongoose.connect(mongoUri);
  console.log('✓ Connected to MongoDB');

  try {
    // 1. Find or create two test users
    let userA = await User.findOne({ email: 'test_phase3_lead@example.com' });
    if (!userA) {
      userA = await User.create({
        name: 'Phase3 Team Lead',
        email: 'test_phase3_lead@example.com',
        password: 'Password123!',
      });
    }

    let userB = await User.findOne({ email: 'test_phase3_member@example.com' });
    if (!userB) {
      userB = await User.create({
        name: 'Phase3 Team Member',
        email: 'test_phase3_member@example.com',
        password: 'Password123!',
      });
    }
    console.log(`✓ Test Users Ready: Lead (${userA._id}), Member (${userB._id})`);

    // 2. Find or create test organization
    let org = await Organization.findOne({ name: 'Phase3 Test Workspace' });
    if (!org) {
      org = await Organization.create({
        name: 'Phase3 Test Workspace',
        description: 'Temporary workspace for Phase 3 automated test',
        owner: userA._id,
        members: [
          { user: userA._id, role: 'OWNER' },
          { user: userB._id, role: 'MEMBER' },
        ],
      });
    } else {
      // Ensure both are in org
      if (!org.members.some((m) => m.user.toString() === userB._id.toString())) {
        org.members.push({ user: userB._id, role: 'MEMBER' });
        await org.save();
      }
    }
    console.log(`✓ Workspace Ready: "${org.name}" (${org._id})`);

    // Clean up any lingering test teams
    await Team.deleteMany({ organization: org._id, name: /^Phase3 Engineering/ });

    // 3. Create a Team
    const newTeam = await Team.create({
      name: 'Phase3 Engineering Team',
      description: 'Core product engineering team',
      privacy: 'PUBLIC',
      organization: org._id,
      createdBy: userA._id,
      members: [
        {
          user: userA._id,
          role: 'LEAD',
          joinedAt: new Date(),
        },
      ],
    });
    console.log(`✓ Team Created: "${newTeam.name}" (ID: ${newTeam._id}) with Lead role`);

    // 4. Add Member
    newTeam.members.push({
      user: userB._id,
      role: 'MEMBER',
      joinedAt: new Date(),
    });
    await newTeam.save();
    console.log(`✓ Added Member (${userB.name}) to Team`);

    // 5. Query and verify populated team
    const foundTeam = await Team.findById(newTeam._id)
      .populate('createdBy', 'name email')
      .populate('members.user', 'name email jobTitle department');

    if (!foundTeam || foundTeam.members.length !== 2) {
      throw new Error(`Expected 2 team members, found ${foundTeam?.members?.length}`);
    }
    console.log(`✓ Team Populated Successfully: ${foundTeam.members.length} members`);

    // 6. Change Member Role to ADMIN
    const memberIdx = foundTeam.members.findIndex(
      (m) => m.user._id.toString() === userB._id.toString()
    );
    foundTeam.members[memberIdx].role = 'ADMIN';
    await foundTeam.save();
    console.log(`✓ Promoted Member (${userB.name}) to role ADMIN`);

    // 7. Verify Privacy and Indexes
    const privateTeam = await Team.create({
      name: 'Phase3 Secret Research',
      description: 'Confidential R&D projects',
      privacy: 'PRIVATE',
      organization: org._id,
      createdBy: userA._id,
      members: [{ user: userA._id, role: 'LEAD' }],
    });
    console.log(`✓ Created Private Team: "${privateTeam.name}"`);

    // Test duplicate prevention
    let duplicateFailed = false;
    try {
      await Team.create({
        name: 'Phase3 Engineering Team',
        organization: org._id,
        createdBy: userA._id,
      });
    } catch (err) {
      duplicateFailed = true;
    }
    if (!duplicateFailed) {
      throw new Error('Duplicate team name validation failed!');
    }
    console.log('✓ Unique compound index (organization + name) verified');

    // 8. Remove Member
    foundTeam.members = foundTeam.members.filter(
      (m) => m.user._id.toString() !== userB._id.toString()
    );
    await foundTeam.save();
    console.log(`✓ Removed Member (${userB.name}) from Team`);

    // 9. Clean up test data
    await Team.deleteMany({ organization: org._id });
    await Organization.findByIdAndDelete(org._id);
    await User.deleteMany({ email: { $in: [userA.email, userB.email] } });
    console.log('✓ Test Data Cleaned Up Successfully');

    console.log('\n>>> ALL PHASE 3 BACKEND & DB VERIFICATIONS PASSED! <<<\n');
  } catch (error) {
    console.error('❌ PHASE 3 TEST FAILED:', error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

testPhase3();

const mongoose = require('mongoose');
const User = require('./src/models/user.model');
const Organization = require('./src/models/organization.model');
const Team = require('./src/models/team.model');
const Channel = require('./src/models/channel.model');
const Task = require('./src/models/task.model');
const { generateToken } = require('./src/config/jwt');

const runTest = async () => {
  console.log('=== [PHASE 10 TEST]: Tasks / Planner / Todo Management Testing ===');
  await mongoose.connect('mongodb://localhost:27017/chatapp');
  console.log('✓ Connected to MongoDB');

  try {
    let user = await User.findOne({ email: 'phase10_test@example.com' });
    if (!user) {
      user = await User.create({
        name: 'Task Tester',
        email: 'phase10_test@example.com',
        password: 'password123',
      });
    }

    let assigneeUser = await User.findOne({ email: 'phase10_assignee@example.com' });
    if (!assigneeUser) {
      assigneeUser = await User.create({
        name: 'Alex Developer',
        email: 'phase10_assignee@example.com',
        password: 'password123',
      });
    }

    let org = await Organization.findOne({ slug: 'task-test-corp' });
    if (!org) {
      org = await Organization.create({
        name: 'Task Test Corp',
        slug: 'task-test-corp',
        owner: user._id,
        members: [
          { user: user._id, role: 'OWNER' },
          { user: assigneeUser._id, role: 'MEMBER' },
        ],
      });
    }

    let team = await Team.findOne({ name: 'Sprint Alpha Team' });
    if (!team) {
      team = await Team.create({
        name: 'Sprint Alpha Team',
        organization: org._id,
        createdBy: user._id,
        members: [
          { user: user._id, role: 'ADMIN' },
          { user: assigneeUser._id, role: 'MEMBER' },
        ],
      });
    }

    let channel = await Channel.findOne({ name: 'tasks-dev' });
    if (!channel) {
      channel = await Channel.create({
        name: 'tasks-dev',
        team: team._id,
        organization: org._id,
        createdBy: user._id,
        type: 'PUBLIC',
      });
    }
    await Task.deleteMany({ organization: org._id });
    console.log('\n--- Step 1: Create New Tasks ---');
    const task1 = await Task.create({
      title: 'Design Siltstone Kanban Board',
      description: 'Implement Kanban columns with drag/drop or status clicks in warm theme',
      organization: org._id,
      team: team._id,
      channel: channel._id,
      creator: user._id,
      assignees: [assigneeUser._id],
      status: 'TODO',
      priority: 'HIGH',
      dueDate: new Date(Date.now() + 86400000 * 3), 
      checklist: [
        { title: 'Create Kanban columns', isCompleted: false },
        { title: 'Add priority pills', isCompleted: false },
      ],
      labels: ['Frontend', 'UI/UX'],
    });
    console.log(`✓ Task 1 created: "${task1.title}" [Status: ${task1.status}, Priority: ${task1.priority}]`);

    const task2 = await Task.create({
      title: 'Setup Socket.IO Task Events',
      description: 'Broadcast task updates to team and org rooms',
      organization: org._id,
      team: team._id,
      channel: channel._id,
      creator: user._id,
      assignees: [user._id, assigneeUser._id],
      status: 'IN_PROGRESS',
      priority: 'URGENT',
      dueDate: new Date(Date.now() + 86400000),
      labels: ['Backend', 'Sockets'],
    });
    console.log(`✓ Task 2 created: "${task2.title}" [Status: ${task2.status}, Priority: ${task2.priority}]`);
    console.log('\n--- Step 2: Update Task Status ---');
    task1.status = 'IN_PROGRESS';
    await task1.save();
    console.log(`✓ Task 1 status updated to: ${task1.status}`);

    console.log('\n--- Step 3: Checklist Item Toggle ---');
    task1.checklist[0].isCompleted = true;
    task1.checklist[0].completedAt = new Date();
    await task1.save();
    console.log(`✓ Task 1 checklist item toggled: "${task1.checklist[0].title}" completed=${task1.checklist[0].isCompleted}`);


    console.log('\n--- Step 4: Query and Filter Tasks ---');
    const allOrgTasks = await Task.find({ organization: org._id });
    console.log(`✓ Total tasks in org: ${allOrgTasks.length}`);

    const inProgressTasks = await Task.find({ organization: org._id, status: 'IN_PROGRESS' });
    console.log(`✓ In-progress tasks count: ${inProgressTasks.length}`);

    const myTasks = await Task.find({ organization: org._id, assignees: assigneeUser._id });
    console.log(`✓ Tasks assigned to Alex Developer: ${myTasks.length}`);

    const channelTasks = await Task.find({ channel: channel._id });
    console.log(`✓ Tasks in channel #tasks-dev: ${channelTasks.length}`);

    console.log('\n======================================================');
    console.log('🎉 PHASE 10 BACKEND TEST PASSED SUCCESSFULLY!');
    console.log('======================================================');
  } catch (error) {
    console.error('❌ PHASE 10 TEST FAILED:', error);
  } finally {
    await mongoose.disconnect();
  }
};

runTest();

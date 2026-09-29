const mongoose = require('mongoose');
const Organization = require('./src/models/organization.model');
const Team = require('./src/models/team.model');
const Channel = require('./src/models/channel.model');
const Message = require('./src/models/message.model');
const User = require('./src/models/user.model');

async function testPhase9() {
  console.log('=== [PHASE 9 TEST]: File Sharing & Channel Files Repository Testing ===');
  const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/chatapp';
  await mongoose.connect(mongoUri);
  console.log('✓ Connected to MongoDB');

  try {
    let uploader = await User.findOne({ email: 'phase9_uploader@example.com' });
    if (!uploader) {
      uploader = await User.create({
        name: 'Alex Uploader',
        email: 'phase9_uploader@example.com',
        password: 'Password123!',
        jobTitle: 'Solutions Architect',
      });
    }

    let teammate = await User.findOne({ email: 'phase9_teammate@example.com' });
    if (!teammate) {
      teammate = await User.create({
        name: 'Jordan Teammate',
        email: 'phase9_teammate@example.com',
        password: 'Password123!',
        jobTitle: 'Software Engineer',
      });
    }

    let org = await Organization.findOne({ name: 'Phase9 Workspace' });
    if (!org) {
      org = await Organization.create({
        name: 'Phase9 Workspace',
        description: 'Org for File Sharing Testing',
        owner: uploader._id,
        members: [
          { user: uploader._id, role: 'OWNER' },
          { user: teammate._id, role: 'MEMBER' },
        ],
      });
    }

    let team = await Team.findOne({ name: 'Phase9 Core Team', organization: org._id });
    if (!team) {
      team = await Team.create({
        name: 'Phase9 Core Team',
        organization: org._id,
        createdBy: uploader._id,
        members: [
          { user: uploader._id, role: 'LEAD' },
          { user: teammate._id, role: 'MEMBER' },
        ],
      });
    }

    let channel = await Channel.findOne({ name: 'phase9-assets', team: team._id });
    if (!channel) {
      channel = await Channel.create({
        name: 'phase9-assets',
        displayName: 'Phase 9 Assets',
        team: team._id,
        organization: org._id,
        createdBy: uploader._id,
        members: [{ user: uploader._id }, { user: teammate._id }],
      });
    }

    console.log(`✓ Channel Created: #${channel.name} (${channel._id})`);

    console.log('\n--- Step 3: Post Image Message with File Details ---');
    const imageMsg = await Message.create({
      channelId: channel._id,
      sender: uploader._id,
      content: 'Here is the architecture diagram for the new microservices',
      messageType: 'image',
      fileUrl: 'https://res.cloudinary.com/chatapp/image/upload/v12345/architecture.png',
      fileName: 'architecture.png',
      fileSize: 1542890,
      deliveredTo: [uploader._id],
      readBy: [uploader._id],
    });

    if (!imageMsg.fileUrl || imageMsg.messageType !== 'image') {
      throw new Error('Image message creation failed');
    }
    console.log(`✓ Image message created: ${imageMsg.fileName} (${(imageMsg.fileSize / 1024 / 1024).toFixed(2)} MB)`);

    console.log('\n--- Step 4: Post Document Attachment Message ---');
    const docMsg = await Message.create({
      channelId: channel._id,
      sender: teammate._id,
      content: 'Please find attached the security compliance audit report',
      messageType: 'file',
      fileUrl: 'https://res.cloudinary.com/chatapp/raw/upload/v12345/security-audit.pdf',
      fileName: 'security-audit.pdf',
      fileSize: 3421500,
      deliveredTo: [teammate._id],
      readBy: [teammate._id],
    });

    if (!docMsg.fileUrl || docMsg.messageType !== 'file') {
      throw new Error('Document message creation failed');
    }
    console.log(`✓ Document message created: ${docMsg.fileName} (${(docMsg.fileSize / 1024 / 1024).toFixed(2)} MB)`);

    console.log('\n--- Step 5: Post Thread Reply with Attachment ---');
    const threadReply = await Message.create({
      parentMessageId: docMsg._id,
      channelId: channel._id,
      sender: uploader._id,
      content: 'I have attached the updated patch zip',
      messageType: 'file',
      fileUrl: 'https://res.cloudinary.com/chatapp/raw/upload/v12345/patch-v2.zip',
      fileName: 'patch-v2.zip',
      fileSize: 5242880,
      deliveredTo: [uploader._id],
      readBy: [uploader._id],
    });

    docMsg.threadCount = (docMsg.threadCount || 0) + 1;
    docMsg.threadLastReplyAt = new Date();
    await docMsg.save();

    console.log(`✓ Thread reply attachment created: ${threadReply.fileName}`);

    console.log('\n--- Step 6: Query All Channel Files ---');
    const allFiles = await Message.find({
      channelId: channel._id,
      fileUrl: { $exists: true, $ne: '' },
      isDeleted: false,
    })
      .sort({ createdAt: -1 })
      .populate('sender', 'name email jobTitle');

    if (allFiles.length < 3) {
      throw new Error(`Expected at least 3 files in channel, got ${allFiles.length}`);
    }
    console.log(`✓ Successfully queried ${allFiles.length} total shared files in channel #${channel.name}`);

    console.log('\n--- Step 7: Query Image Files Only ---');
    const imagesOnly = await Message.find({
      channelId: channel._id,
      fileUrl: { $exists: true, $ne: '' },
      messageType: 'image',
      isDeleted: false,
    });
    if (imagesOnly.length < 1 || !imagesOnly.every(f => f.messageType === 'image')) {
      throw new Error('Image filter failed');
    }
    console.log(`✓ Image filter returned ${imagesOnly.length} image(s): ${imagesOnly.map(f => f.fileName).join(', ')}`);

    console.log('\n--- Step 8: Query Document Files Only ---');
    const docsOnly = await Message.find({
      channelId: channel._id,
      fileUrl: { $exists: true, $ne: '' },
      messageType: 'file',
      isDeleted: false,
    });
    if (docsOnly.length < 2 || !docsOnly.every(f => f.messageType === 'file')) {
      throw new Error('Document filter failed');
    }
    console.log(`✓ Documents filter returned ${docsOnly.length} document(s): ${docsOnly.map(f => f.fileName).join(', ')}`);

    console.log('\n======================================================');
    console.log('🎉 PHASE 9 BACKEND TEST PASSED SUCCESSFULLY!');
    console.log('======================================================\n');
  } catch (error) {
    console.error('❌ PHASE 9 TEST FAILED:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

testPhase9();

const Channel = require('../models/channel.model');
const Team = require('../models/team.model');
const Organization = require('../models/organization.model');
const User = require('../models/user.model');
const Message = require('../models/message.model');
const { parseMentionIds, notifyMentionedUsers } = require('../utils/mention.helper');

// Helper to sanitize channel name (e.g. "Dev Sprint-01" -> "dev-sprint-01")
const sanitizeChannelName = (name) => {
  if (!name) return '';
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-_]/g, '')
    .slice(0, 80);
};

// Helper to check user membership and role in a team
const getTeamMembership = async (teamId, userId) => {
  if (!teamId) return null;
  const team = await Team.findById(teamId);
  if (!team) return null;

  const membership = team.members.find(
    (m) => m.user.toString() === userId.toString()
  );
  return {
    team,
    isMember: Boolean(membership),
    role: membership ? membership.role : null,
  };
};

// @desc    Create a new channel in a team
// @route   POST /api/channels
// @access  Private (JWT)
const createChannel = async (req, res) => {
  try {
    const {
      name,
      displayName,
      description = '',
      topic = '',
      teamId,
      type = 'PUBLIC',
      memberIds = [],
    } = req.body;

    if (!teamId) {
      return res.status(400).json({
        status: 'fail',
        message: 'Team ID is required to create a channel',
      });
    }

    const teamCheck = await getTeamMembership(teamId, req.user._id);
    if (!teamCheck || !teamCheck.team) {
      return res.status(404).json({
        status: 'fail',
        message: 'Team not found',
      });
    }

    // Check organization admin status as well
    const org = await Organization.findById(teamCheck.team.organization);
    const orgMembership = org?.members?.find(
      (m) => m.user.toString() === req.user._id.toString()
    );
    const isOrgAdminOrOwner =
      orgMembership && (orgMembership.role === 'OWNER' || orgMembership.role === 'ADMIN');
    const isTeamLeadOrAdmin =
      teamCheck.role === 'LEAD' || teamCheck.role === 'ADMIN';

    if (!teamCheck.isMember && !isOrgAdminOrOwner) {
      return res.status(403).json({
        status: 'fail',
        message: 'You must be a member of this team to create channels',
      });
    }

    const cleanName = sanitizeChannelName(name);
    if (!cleanName || cleanName.length < 2) {
      return res.status(400).json({
        status: 'fail',
        message: 'Channel name must be at least 2 characters (alphanumeric, hyphens)',
      });
    }

    // Check duplicate channel name in same team
    const existing = await Channel.findOne({
      team: teamId,
      name: cleanName,
    });
    if (existing) {
      return res.status(400).json({
        status: 'fail',
        message: `Channel #${cleanName} already exists in this team`,
      });
    }

    const channelType = type.toUpperCase() === 'PRIVATE' ? 'PRIVATE' : 'PUBLIC';

    // Channel members initial list
    const members = [
      {
        user: req.user._id,
        role: 'ADMIN',
        joinedAt: new Date(),
      },
    ];

    // For private channels, optionally seed additional members from the team
    if (channelType === 'PRIVATE' && Array.isArray(memberIds) && memberIds.length > 0) {
      const teamUserIds = new Set(teamCheck.team.members.map((m) => m.user.toString()));
      for (const mId of memberIds) {
        if (mId.toString() !== req.user._id.toString() && teamUserIds.has(mId.toString())) {
          members.push({
            user: mId,
            role: 'MEMBER',
            joinedAt: new Date(),
          });
        }
      }
    }

    const channel = await Channel.create({
      name: cleanName,
      displayName: displayName?.trim() || cleanName,
      description: description.trim(),
      topic: topic.trim(),
      team: teamId,
      organization: teamCheck.team.organization,
      type: channelType,
      isDefault: false,
      members,
      createdBy: req.user._id,
    });

    const populated = await Channel.findById(channel._id)
      .populate('createdBy', 'name email profileImage')
      .populate('members.user', 'name email profileImage isOnline lastSeen jobTitle department');

    return res.status(201).json({
      status: 'success',
      message: `Channel #${channel.name} created successfully`,
      channel: {
        ...populated.toObject(),
        myRole: 'ADMIN',
        isMember: true,
      },
    });
  } catch (error) {
    console.error('[Create Channel Error]:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Error creating channel',
    });
  }
};

// @desc    Get all channels of a team accessible to current user
// @route   GET /api/channels
// @access  Private (JWT)
const getTeamChannels = async (req, res) => {
  try {
    const { teamId } = req.query;
    if (!teamId) {
      return res.status(400).json({
        status: 'fail',
        message: 'teamId query parameter is required',
      });
    }

    const teamCheck = await getTeamMembership(teamId, req.user._id);
    if (!teamCheck || !teamCheck.team) {
      return res.status(404).json({
        status: 'fail',
        message: 'Team not found',
      });
    }

    const org = await Organization.findById(teamCheck.team.organization);
    const orgMembership = org?.members?.find(
      (m) => m.user.toString() === req.user._id.toString()
    );
    const isOrgAdminOrOwner =
      orgMembership && (orgMembership.role === 'OWNER' || orgMembership.role === 'ADMIN');
    const isTeamLeadOrAdmin =
      teamCheck.role === 'LEAD' || teamCheck.role === 'ADMIN';

    if (!teamCheck.isMember && !isOrgAdminOrOwner) {
      return res.status(403).json({
        status: 'fail',
        message: 'You are not a member of this team',
      });
    }

    // Build query: If Team Lead/Admin or Org Owner/Admin, can view all channels
    // Otherwise can view PUBLIC channels or PRIVATE channels where user is a member
    const filter = { team: teamId, isArchived: false };
    if (!isTeamLeadOrAdmin && !isOrgAdminOrOwner) {
      filter.$or = [
        { type: 'PUBLIC' },
        { 'members.user': req.user._id },
      ];
    }

    const channels = await Channel.find(filter)
      .populate('createdBy', 'name email profileImage')
      .populate('members.user', 'name email profileImage isOnline lastSeen jobTitle department')
      .sort({ isDefault: -1, name: 1 });

    const enrichedChannels = channels.map((c) => {
      const cObj = c.toObject();
      const myMembership = c.members.find(
        (m) => m.user?._id?.toString() === req.user._id.toString() || m.user?.toString() === req.user._id.toString()
      );
      return {
        ...cObj,
        myRole: myMembership ? myMembership.role : null,
        isMember: c.type === 'PUBLIC' ? true : Boolean(myMembership),
        membersCount: c.type === 'PUBLIC' ? teamCheck.team.members.length : c.members.length,
      };
    });

    return res.status(200).json({
      status: 'success',
      results: enrichedChannels.length,
      channels: enrichedChannels,
    });
  } catch (error) {
    console.error('[Get Channels Error]:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Error fetching channels',
    });
  }
};

// @desc    Get channel details by ID
// @route   GET /api/channels/:id
// @access  Private (JWT)
const getChannelById = async (req, res) => {
  try {
    const { id } = req.params;

    const channel = await Channel.findById(id)
      .populate('team', 'name description icon privacy members')
      .populate('createdBy', 'name email profileImage')
      .populate('members.user', 'name email profileImage isOnline lastSeen jobTitle department');

    if (!channel) {
      return res.status(404).json({
        status: 'fail',
        message: 'Channel not found',
      });
    }

    const teamCheck = await getTeamMembership(channel.team._id, req.user._id);
    if (!teamCheck || !teamCheck.team) {
      return res.status(404).json({
        status: 'fail',
        message: 'Associated team not found',
      });
    }

    const org = await Organization.findById(channel.organization);
    const orgMembership = org?.members?.find(
      (m) => m.user.toString() === req.user._id.toString()
    );
    const isOrgAdminOrOwner =
      orgMembership && (orgMembership.role === 'OWNER' || orgMembership.role === 'ADMIN');
    const isTeamLeadOrAdmin =
      teamCheck.role === 'LEAD' || teamCheck.role === 'ADMIN';

    const myMembership = channel.members.find(
      (m) => m.user?._id?.toString() === req.user._id.toString()
    );

    if (
      channel.type === 'PRIVATE' &&
      !myMembership &&
      !isTeamLeadOrAdmin &&
      !isOrgAdminOrOwner
    ) {
      return res.status(403).json({
        status: 'fail',
        message: 'This is a private channel. You must be added to view it.',
      });
    }

    return res.status(200).json({
      status: 'success',
      channel: {
        ...channel.toObject(),
        myRole: myMembership ? myMembership.role : null,
        isMember: channel.type === 'PUBLIC' ? true : Boolean(myMembership),
        membersCount: channel.type === 'PUBLIC' ? channel.team.members.length : channel.members.length,
      },
    });
  } catch (error) {
    console.error('[Get Channel By ID Error]:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Error fetching channel',
    });
  }
};

// @desc    Update channel details (topic, description, displayName)
// @route   PUT /api/channels/:id
// @access  Private (JWT, Channel Admin or Team Lead/Admin)
const updateChannel = async (req, res) => {
  try {
    const { id } = req.params;
    const { displayName, description, topic, isArchived } = req.body;

    const channel = await Channel.findById(id);
    if (!channel) {
      return res.status(404).json({
        status: 'fail',
        message: 'Channel not found',
      });
    }

    const teamCheck = await getTeamMembership(channel.team, req.user._id);
    const myMembership = channel.members.find(
      (m) => m.user.toString() === req.user._id.toString()
    );
    const isChannelAdmin = myMembership && myMembership.role === 'ADMIN';
    const isTeamLeadOrAdmin =
      teamCheck && (teamCheck.role === 'LEAD' || teamCheck.role === 'ADMIN');

    if (!isChannelAdmin && !isTeamLeadOrAdmin) {
      return res.status(403).json({
        status: 'fail',
        message: 'Only Channel Admins or Team Leads can update channel settings',
      });
    }

    if (displayName !== undefined) channel.displayName = displayName.trim();
    if (description !== undefined) channel.description = description.trim();
    if (topic !== undefined) channel.topic = topic.trim();

    if (isArchived !== undefined) {
      if (channel.isDefault && isArchived === true) {
        return res.status(400).json({
          status: 'fail',
          message: 'The default general channel cannot be archived',
        });
      }
      channel.isArchived = Boolean(isArchived);
    }

    await channel.save();

    const updated = await Channel.findById(channel._id)
      .populate('createdBy', 'name email profileImage')
      .populate('members.user', 'name email profileImage isOnline lastSeen jobTitle department');

    return res.status(200).json({
      status: 'success',
      message: 'Channel updated successfully',
      channel: {
        ...updated.toObject(),
        myRole: myMembership ? myMembership.role : null,
        isMember: true,
      },
    });
  } catch (error) {
    console.error('[Update Channel Error]:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Error updating channel',
    });
  }
};

// @desc    Delete channel
// @route   DELETE /api/channels/:id
// @access  Private (JWT, Team Lead or Org Admin)
const deleteChannel = async (req, res) => {
  try {
    const { id } = req.params;

    const channel = await Channel.findById(id);
    if (!channel) {
      return res.status(404).json({
        status: 'fail',
        message: 'Channel not found',
      });
    }

    if (channel.isDefault) {
      return res.status(400).json({
        status: 'fail',
        message: 'The default #general channel cannot be deleted',
      });
    }

    const teamCheck = await getTeamMembership(channel.team, req.user._id);
    const org = await Organization.findById(channel.organization);
    const orgMembership = org?.members?.find(
      (m) => m.user.toString() === req.user._id.toString()
    );
    const isOrgAdminOrOwner =
      orgMembership && (orgMembership.role === 'OWNER' || orgMembership.role === 'ADMIN');
    const isTeamLead = teamCheck && teamCheck.role === 'LEAD';

    if (!isTeamLead && !isOrgAdminOrOwner) {
      return res.status(403).json({
        status: 'fail',
        message: 'Only Team Leads or Workspace Admins can delete a channel',
      });
    }

    await Channel.findByIdAndDelete(id);

    return res.status(200).json({
      status: 'success',
      message: `Channel #${channel.name} has been deleted`,
      deletedChannelId: id,
    });
  } catch (error) {
    console.error('[Delete Channel Error]:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Error deleting channel',
    });
  }
};

// @desc    Add member to private channel
// @route   POST /api/channels/:id/members
// @access  Private (JWT, Channel Admin or Team Lead)
const addChannelMember = async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, role = 'MEMBER' } = req.body;

    if (!userId) {
      return res.status(400).json({
        status: 'fail',
        message: 'userId is required to add member to channel',
      });
    }

    const channel = await Channel.findById(id);
    if (!channel) {
      return res.status(404).json({
        status: 'fail',
        message: 'Channel not found',
      });
    }

    if (channel.type === 'PUBLIC') {
      return res.status(400).json({
        status: 'fail',
        message: 'All team members already have access to public channels',
      });
    }

    const teamCheck = await getTeamMembership(channel.team, req.user._id);
    const myMembership = channel.members.find(
      (m) => m.user.toString() === req.user._id.toString()
    );
    const isChannelAdmin = myMembership && myMembership.role === 'ADMIN';
    const isTeamLeadOrAdmin =
      teamCheck && (teamCheck.role === 'LEAD' || teamCheck.role === 'ADMIN');

    if (!isChannelAdmin && !isTeamLeadOrAdmin) {
      return res.status(403).json({
        status: 'fail',
        message: 'Only Channel Admins or Team Leads can add members to this channel',
      });
    }

    // Verify target user is in the team
    const targetTeamMembership = teamCheck.team.members.find(
      (m) => m.user.toString() === userId.toString()
    );
    if (!targetTeamMembership) {
      return res.status(400).json({
        status: 'fail',
        message: 'User must belong to the team before joining this private channel',
      });
    }

    const alreadyMember = channel.members.some(
      (m) => m.user.toString() === userId.toString()
    );
    if (alreadyMember) {
      return res.status(400).json({
        status: 'fail',
        message: 'User is already a member of this channel',
      });
    }

    channel.members.push({
      user: userId,
      role: role.toUpperCase() === 'ADMIN' ? 'ADMIN' : 'MEMBER',
      joinedAt: new Date(),
    });

    await channel.save();

    const updated = await Channel.findById(channel._id)
      .populate('createdBy', 'name email profileImage')
      .populate('members.user', 'name email profileImage isOnline lastSeen jobTitle department');

    return res.status(200).json({
      status: 'success',
      message: 'Member added to channel',
      channel: updated,
    });
  } catch (error) {
    console.error('[Add Channel Member Error]:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Error adding channel member',
    });
  }
};

// @desc    Remove member from private channel or leave
// @route   DELETE /api/channels/:id/members/:memberId
// @access  Private (JWT)
const removeChannelMember = async (req, res) => {
  try {
    const { id, memberId } = req.params;

    const channel = await Channel.findById(id);
    if (!channel) {
      return res.status(404).json({
        status: 'fail',
        message: 'Channel not found',
      });
    }

    const isSelf = req.user._id.toString() === memberId;
    const teamCheck = await getTeamMembership(channel.team, req.user._id);
    const myMembership = channel.members.find(
      (m) => m.user.toString() === req.user._id.toString()
    );
    const isChannelAdmin = myMembership && myMembership.role === 'ADMIN';
    const isTeamLeadOrAdmin =
      teamCheck && (teamCheck.role === 'LEAD' || teamCheck.role === 'ADMIN');

    if (!isSelf && !isChannelAdmin && !isTeamLeadOrAdmin) {
      return res.status(403).json({
        status: 'fail',
        message: 'Permission denied to remove channel member',
      });
    }

    const targetIdx = channel.members.findIndex(
      (m) => m.user.toString() === memberId
    );
    if (targetIdx === -1) {
      return res.status(404).json({
        status: 'fail',
        message: 'Member not found in channel',
      });
    }

    channel.members.splice(targetIdx, 1);
    await channel.save();

    const updated = await Channel.findById(channel._id)
      .populate('createdBy', 'name email profileImage')
      .populate('members.user', 'name email profileImage isOnline lastSeen jobTitle department');

    return res.status(200).json({
      status: 'success',
      message: isSelf ? 'You left the channel' : 'Member removed from channel',
      channel: updated,
    });
  } catch (error) {
    console.error('[Remove Channel Member Error]:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Error removing channel member',
    });
  }
};

// @desc    Get channel messages history (paginated)
// @route   GET /api/channels/:id/messages
// @access  Private (JWT)
const getChannelMessages = async (req, res) => {
  try {
    const { id } = req.params;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 50;
    const skip = (page - 1) * limit;

    const channel = await Channel.findById(id);
    if (!channel) {
      return res.status(404).json({
        status: 'fail',
        message: 'Channel not found',
      });
    }

    const teamCheck = await getTeamMembership(channel.team, req.user._id);
    if (!teamCheck || !teamCheck.team) {
      return res.status(404).json({
        status: 'fail',
        message: 'Associated team not found',
      });
    }

    const org = await Organization.findById(channel.organization);
    const orgMembership = org?.members?.find(
      (m) => m.user.toString() === req.user._id.toString()
    );
    const isOrgAdminOrOwner =
      orgMembership && (orgMembership.role === 'OWNER' || orgMembership.role === 'ADMIN');
    const isTeamLeadOrAdmin =
      teamCheck.role === 'LEAD' || teamCheck.role === 'ADMIN';

    const myMembership = channel.members.find(
      (m) => m.user?._id?.toString() === req.user._id.toString() || m.user?.toString() === req.user._id.toString()
    );

    if (
      channel.type === 'PRIVATE' &&
      !myMembership &&
      !isTeamLeadOrAdmin &&
      !isOrgAdminOrOwner
    ) {
      return res.status(403).json({
        status: 'fail',
        message: 'Access denied: You must be a member of this private channel to view messages',
      });
    }

    const total = await Message.countDocuments({ channelId: id });
    const messages = await Message.find({ channelId: id })
      .sort({ createdAt: 1 })
      .skip(skip)
      .limit(limit)
      .populate('sender', 'name email profileImage isOnline lastSeen jobTitle department')
      .populate('reactions.users', 'name email profileImage')
      .populate('mentions', 'name email profileImage jobTitle department')
      .populate({
        path: 'replyTo',
        select: 'content sender messageType isDeleted',
        populate: { path: 'sender', select: 'name email' },
      });

    return res.status(200).json({
      status: 'success',
      results: messages.length,
      total,
      page,
      totalPages: Math.ceil(total / limit) || 1,
      messages,
    });
  } catch (error) {
    console.error('[Get Channel Messages Error]:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Error fetching channel messages',
    });
  }
};

// @desc    Send message to channel
// @route   POST /api/channels/:id/messages
// @access  Private (JWT)
const sendChannelMessage = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      content,
      messageType = 'text',
      fileUrl = '',
      fileName = '',
      fileSize = 0,
      replyTo = null,
      mentions = [],
    } = req.body;

    if ((!content || !content.trim()) && !fileUrl) {
      return res.status(400).json({
        status: 'fail',
        message: 'Message content or attachment is required',
      });
    }

    const channel = await Channel.findById(id);
    if (!channel) {
      return res.status(404).json({
        status: 'fail',
        message: 'Channel not found',
      });
    }

    const teamCheck = await getTeamMembership(channel.team, req.user._id);
    if (!teamCheck || !teamCheck.team) {
      return res.status(404).json({
        status: 'fail',
        message: 'Associated team not found',
      });
    }

    const org = await Organization.findById(channel.organization);
    const orgMembership = org?.members?.find(
      (m) => m.user.toString() === req.user._id.toString()
    );
    const isOrgAdminOrOwner =
      orgMembership && (orgMembership.role === 'OWNER' || orgMembership.role === 'ADMIN');
    const isTeamLeadOrAdmin =
      teamCheck.role === 'LEAD' || teamCheck.role === 'ADMIN';

    const myMembership = channel.members.find(
      (m) => m.user?._id?.toString() === req.user._id.toString() || m.user?.toString() === req.user._id.toString()
    );

    if (
      channel.type === 'PRIVATE' &&
      !myMembership &&
      !isTeamLeadOrAdmin &&
      !isOrgAdminOrOwner
    ) {
      return res.status(403).json({
        status: 'fail',
        message: 'Access denied: You are not authorized to post in this private channel',
      });
    }

    const mentionUserIds = await parseMentionIds(mentions, content);

    const message = await Message.create({
      channelId: id,
      sender: req.user._id,
      content: content ? content.trim() : '',
      messageType,
      fileUrl,
      fileName,
      fileSize,
      replyTo: replyTo || null,
      mentions: mentionUserIds,
      deliveredTo: [req.user._id],
      readBy: [req.user._id],
    });

    const populated = await Message.findById(message._id)
      .populate('sender', 'name email profileImage isOnline lastSeen jobTitle department')
      .populate('mentions', 'name email profileImage jobTitle department')
      .populate({
        path: 'replyTo',
        select: 'content sender messageType isDeleted',
        populate: { path: 'sender', select: 'name email' },
      });

    // Broadcast through Socket.IO if available
    const io = req.app.get('io');
    if (io) {
      io.to(`channel_${id}`).emit('new_channel_message', populated);

      // Notify mentioned teammates in real time
      notifyMentionedUsers(io, populated, req.user, {
        channelId: id,
        channelName: channel.name,
        teamName: teamCheck.team.name,
      });
    }

    return res.status(201).json({
      status: 'success',
      message: populated,
    });
  } catch (error) {
    console.error('[Send Channel Message Error]:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Error sending channel message',
    });
  }
};

// @desc    Get all files/attachments shared in a channel
// @route   GET /api/channels/:id/files
// @access  Private (JWT)
const getChannelFiles = async (req, res) => {
  try {
    const { id } = req.params;
    const { type, page = 1, limit = 30 } = req.query;

    const channel = await Channel.findById(id);
    if (!channel) {
      return res.status(404).json({
        status: 'fail',
        message: 'Channel not found',
      });
    }

    const teamCheck = await getTeamMembership(channel.team, req.user._id);
    if (!teamCheck || !teamCheck.team) {
      return res.status(404).json({
        status: 'fail',
        message: 'Team not found',
      });
    }

    const query = {
      channelId: id,
      fileUrl: { $exists: true, $ne: '' },
      isDeleted: false,
    };

    if (type === 'image' || type === 'images') {
      query.messageType = 'image';
    } else if (type === 'file' || type === 'documents') {
      query.messageType = 'file';
    } else if (type === 'media') {
      query.messageType = { $in: ['image', 'audio', 'video'] };
    }

    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const skip = (pageNum - 1) * limitNum;

    const total = await Message.countDocuments(query);
    const files = await Message.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .populate('sender', 'name email profileImage jobTitle')
      .select('_id sender content messageType fileUrl fileName fileSize createdAt');

    return res.status(200).json({
      status: 'success',
      results: files.length,
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum) || 1,
      files,
    });
  } catch (error) {
    console.error('[Get Channel Files Error]:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Error fetching channel files',
    });
  }
};

module.exports = {
  createChannel,
  getTeamChannels,
  getChannelById,
  updateChannel,
  deleteChannel,
  addChannelMember,
  removeChannelMember,
  sanitizeChannelName,
  getChannelMessages,
  sendChannelMessage,
  getChannelFiles,
};

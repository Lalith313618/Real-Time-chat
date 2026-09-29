const Team = require('../models/team.model');
const Organization = require('../models/organization.model');
const User = require('../models/user.model');
const Channel = require('../models/channel.model');

// Helper to check user's organization membership and role
const getOrgMembership = async (orgId, userId) => {
  if (!orgId) return null;
  const org = await Organization.findById(orgId);
  if (!org) return null;
  const membership = org.members.find((m) => m.user.toString() === userId.toString());
  return membership ? { org, role: membership.role } : null;
};

// @desc    Create a new team within an organization
// @route   POST /api/teams
// @access  Private (JWT)
const createTeam = async (req, res) => {
  try {
    const {
      name,
      description = '',
      privacy = 'PUBLIC',
      icon = '',
      organizationId,
      initialMemberIds = [],
    } = req.body;

    const orgId = organizationId || req.user.currentOrganization;
    if (!orgId) {
      return res.status(400).json({
        status: 'fail',
        message: 'Organization ID is required to create a team',
      });
    }

    if (!name || name.trim().length < 2) {
      return res.status(400).json({
        status: 'fail',
        message: 'Team name must be at least 2 characters',
      });
    }

    const orgCheck = await getOrgMembership(orgId, req.user._id);
    if (!orgCheck) {
      return res.status(403).json({
        status: 'fail',
        message: 'You are not a member of this organization',
      });
    }

    // Check for duplicate team name in this organization
    const existing = await Team.findOne({
      organization: orgId,
      name: { $regex: `^${name.trim()}$`, $options: 'i' },
    });

    if (existing) {
      return res.status(400).json({
        status: 'fail',
        message: `A team named "${name.trim()}" already exists in this workspace`,
      });
    }

    // Members list starting with creator as LEAD
    const members = [
      {
        user: req.user._id,
        role: 'LEAD',
        joinedAt: new Date(),
      },
    ];

    // Add valid initial members who belong to this organization
    if (Array.isArray(initialMemberIds) && initialMemberIds.length > 0) {
      const orgMemberIds = new Set(orgCheck.org.members.map((m) => m.user.toString()));
      for (const mId of initialMemberIds) {
        if (mId.toString() !== req.user._id.toString() && orgMemberIds.has(mId.toString())) {
          members.push({
            user: mId,
            role: 'MEMBER',
            joinedAt: new Date(),
          });
        }
      }
    }

    const team = await Team.create({
      name: name.trim(),
      description: description.trim(),
      organization: orgId,
      privacy: privacy.toUpperCase() === 'PRIVATE' ? 'PRIVATE' : 'PUBLIC',
      icon: icon.trim(),
      members,
      createdBy: req.user._id,
    });

    // Automatically create default #general channel for this team
    try {
      await Channel.create({
        name: 'general',
        displayName: 'General',
        description: `Default discussion channel for ${team.name}`,
        topic: 'Welcome to the team! Share announcements and general updates here.',
        team: team._id,
        organization: orgId,
        type: 'PUBLIC',
        isDefault: true,
        members: [
          {
            user: req.user._id,
            role: 'ADMIN',
            joinedAt: new Date(),
          },
        ],
        createdBy: req.user._id,
      });
    } catch (chanErr) {
      console.warn('[Auto-create general channel warning]:', chanErr.message);
    }

    const populated = await Team.findById(team._id)
      .populate('createdBy', 'name email profileImage')
      .populate('members.user', 'name email profileImage isOnline lastSeen jobTitle department');

    return res.status(201).json({
      status: 'success',
      message: `Team "${team.name}" created successfully`,
      team: {
        ...populated.toObject(),
        myRole: 'LEAD',
        isMember: true,
      },
    });
  } catch (error) {
    console.error('[Create Team Error]:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Error creating team',
    });
  }
};

// @desc    Get all teams in organization (accessible to user)
// @route   GET /api/teams
// @access  Private (JWT)
const getOrganizationTeams = async (req, res) => {
  try {
    const orgId = req.query.orgId || req.user.currentOrganization;
    if (!orgId) {
      return res.status(400).json({
        status: 'fail',
        message: 'No active organization selected',
      });
    }

    const orgCheck = await getOrgMembership(orgId, req.user._id);
    if (!orgCheck) {
      return res.status(403).json({
        status: 'fail',
        message: 'You are not a member of this organization',
      });
    }

    const isOrgAdminOrOwner = orgCheck.role === 'OWNER' || orgCheck.role === 'ADMIN';

    // If org admin/owner, can view all teams; otherwise can view PUBLIC teams or teams they are a member of
    const query = { organization: orgId };
    if (!isOrgAdminOrOwner) {
      query.$or = [
        { privacy: 'PUBLIC' },
        { 'members.user': req.user._id },
      ];
    }

    const teams = await Team.find(query)
      .populate('createdBy', 'name email profileImage')
      .populate('members.user', 'name email profileImage isOnline lastSeen jobTitle department')
      .sort({ name: 1 });

    const enrichedTeams = teams.map((team) => {
      const tObj = team.toObject();
      const myMembership = team.members.find(
        (m) => m.user?._id?.toString() === req.user._id.toString() || m.user?.toString() === req.user._id.toString()
      );
      return {
        ...tObj,
        myRole: myMembership ? myMembership.role : null,
        isMember: Boolean(myMembership),
        membersCount: team.members.length,
      };
    });

    return res.status(200).json({
      status: 'success',
      results: enrichedTeams.length,
      teams: enrichedTeams,
    });
  } catch (error) {
    console.error('[Get Teams Error]:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Error fetching teams',
    });
  }
};

// @desc    Get team by ID
// @route   GET /api/teams/:id
// @access  Private (JWT)
const getTeamById = async (req, res) => {
  try {
    const { id } = req.params;

    const team = await Team.findById(id)
      .populate('createdBy', 'name email profileImage')
      .populate('members.user', 'name email profileImage isOnline lastSeen jobTitle department');

    if (!team) {
      return res.status(404).json({
        status: 'fail',
        message: 'Team not found',
      });
    }

    const orgCheck = await getOrgMembership(team.organization, req.user._id);
    if (!orgCheck) {
      return res.status(403).json({
        status: 'fail',
        message: 'You are not a member of this team’s organization',
      });
    }

    const myMembership = team.members.find(
      (m) => m.user?._id?.toString() === req.user._id.toString()
    );

    // If private team and not member and not org admin/owner
    if (
      team.privacy === 'PRIVATE' &&
      !myMembership &&
      orgCheck.role !== 'OWNER' &&
      orgCheck.role !== 'ADMIN'
    ) {
      return res.status(403).json({
        status: 'fail',
        message: 'This is a private team. You must be invited to view details.',
      });
    }

    return res.status(200).json({
      status: 'success',
      team: {
        ...team.toObject(),
        myRole: myMembership ? myMembership.role : null,
        isMember: Boolean(myMembership),
        membersCount: team.members.length,
      },
    });
  } catch (error) {
    console.error('[Get Team By ID Error]:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Error fetching team details',
    });
  }
};

// @desc    Update team metadata
// @route   PUT /api/teams/:id
// @access  Private (JWT, Team Lead/Admin or Org Owner/Admin)
const updateTeam = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, privacy, icon } = req.body;

    const team = await Team.findById(id);
    if (!team) {
      return res.status(404).json({
        status: 'fail',
        message: 'Team not found',
      });
    }

    const orgCheck = await getOrgMembership(team.organization, req.user._id);
    if (!orgCheck) {
      return res.status(403).json({
        status: 'fail',
        message: 'Not authorized in this organization',
      });
    }

    const myMembership = team.members.find(
      (m) => m.user.toString() === req.user._id.toString()
    );

    const isTeamLeadOrAdmin =
      myMembership && (myMembership.role === 'LEAD' || myMembership.role === 'ADMIN');
    const isOrgAdminOrOwner = orgCheck.role === 'OWNER' || orgCheck.role === 'ADMIN';

    if (!isTeamLeadOrAdmin && !isOrgAdminOrOwner) {
      return res.status(403).json({
        status: 'fail',
        message: 'Only Team Leads or Workspace Admins can edit team settings',
      });
    }

    if (name && name.trim().length >= 2) {
      // Check duplicate name in same org
      const duplicate = await Team.findOne({
        _id: { $ne: team._id },
        organization: team.organization,
        name: { $regex: `^${name.trim()}$`, $options: 'i' },
      });
      if (duplicate) {
        return res.status(400).json({
          status: 'fail',
          message: `Another team named "${name.trim()}" already exists in this workspace`,
        });
      }
      team.name = name.trim();
    }

    if (description !== undefined) team.description = description.trim();
    if (privacy && ['PUBLIC', 'PRIVATE'].includes(privacy.toUpperCase())) {
      team.privacy = privacy.toUpperCase();
    }
    if (icon !== undefined) team.icon = icon.trim();

    await team.save();

    const updated = await Team.findById(team._id)
      .populate('createdBy', 'name email profileImage')
      .populate('members.user', 'name email profileImage isOnline lastSeen jobTitle department');

    return res.status(200).json({
      status: 'success',
      message: 'Team updated successfully',
      team: {
        ...updated.toObject(),
        myRole: myMembership ? myMembership.role : null,
        isMember: Boolean(myMembership),
      },
    });
  } catch (error) {
    console.error('[Update Team Error]:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Error updating team',
    });
  }
};

// @desc    Add member to team (or self-join if public)
// @route   POST /api/teams/:id/members
// @access  Private (JWT)
const addTeamMember = async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, email, role = 'MEMBER' } = req.body;

    const team = await Team.findById(id);
    if (!team) {
      return res.status(404).json({
        status: 'fail',
        message: 'Team not found',
      });
    }

    const orgCheck = await getOrgMembership(team.organization, req.user._id);
    if (!orgCheck) {
      return res.status(403).json({
        status: 'fail',
        message: 'Not authorized in this workspace',
      });
    }

    // Determine target user
    let targetUser = null;
    if (userId) {
      targetUser = await User.findById(userId);
    } else if (email) {
      targetUser = await User.findOne({ email: email.toLowerCase().trim() });
    } else {
      // Default to self-join
      targetUser = req.user;
    }

    if (!targetUser) {
      return res.status(404).json({
        status: 'fail',
        message: 'Target user not found',
      });
    }

    const isSelf = targetUser._id.toString() === req.user._id.toString();

    // Check if target user belongs to the Organization
    const targetOrgMembership = orgCheck.org.members.find(
      (m) => m.user.toString() === targetUser._id.toString()
    );
    if (!targetOrgMembership) {
      return res.status(400).json({
        status: 'fail',
        message: `${targetUser.name} must join the workspace first before joining teams`,
      });
    }

    // Permission check: If adding someone else or joining a private team
    const myMembership = team.members.find(
      (m) => m.user.toString() === req.user._id.toString()
    );
    const isTeamLeadOrAdmin =
      myMembership && (myMembership.role === 'LEAD' || myMembership.role === 'ADMIN');
    const isOrgAdminOrOwner = orgCheck.role === 'OWNER' || orgCheck.role === 'ADMIN';

    if (isSelf && team.privacy === 'PRIVATE' && !isOrgAdminOrOwner) {
      return res.status(403).json({
        status: 'fail',
        message: 'This is a private team. An existing Team Lead must add you.',
      });
    }

    if (!isSelf && !isTeamLeadOrAdmin && !isOrgAdminOrOwner) {
      return res.status(403).json({
        status: 'fail',
        message: 'Only Team Leads or Workspace Admins can add other members',
      });
    }

    // Check if already a member
    const alreadyMember = team.members.some(
      (m) => m.user.toString() === targetUser._id.toString()
    );
    if (alreadyMember) {
      return res.status(400).json({
        status: 'fail',
        message: `${targetUser.name} is already a member of this team`,
      });
    }

    const assignedRole = ['LEAD', 'ADMIN', 'MEMBER'].includes(role.toUpperCase())
      ? role.toUpperCase()
      : 'MEMBER';

    team.members.push({
      user: targetUser._id,
      role: isSelf ? 'MEMBER' : assignedRole,
      joinedAt: new Date(),
    });

    await team.save();

    const updated = await Team.findById(team._id)
      .populate('createdBy', 'name email profileImage')
      .populate('members.user', 'name email profileImage isOnline lastSeen jobTitle department');

    const updatedMyMembership = updated.members.find(
      (m) => m.user?._id?.toString() === req.user._id.toString()
    );

    return res.status(200).json({
      status: 'success',
      message: isSelf
        ? `You joined team "${team.name}"`
        : `${targetUser.name} added to team "${team.name}"`,
      team: {
        ...updated.toObject(),
        myRole: updatedMyMembership ? updatedMyMembership.role : null,
        isMember: Boolean(updatedMyMembership),
      },
    });
  } catch (error) {
    console.error('[Add Team Member Error]:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Error adding team member',
    });
  }
};

// @desc    Change team member role (LEAD, ADMIN, MEMBER)
// @route   PUT /api/teams/:id/members/:memberId/role
// @access  Private (JWT, Team Lead or Org Owner/Admin)
const changeTeamMemberRole = async (req, res) => {
  try {
    const { id, memberId } = req.params;
    const { role } = req.body;

    const validRoles = ['LEAD', 'ADMIN', 'MEMBER'];
    if (!role || !validRoles.includes(role.toUpperCase())) {
      return res.status(400).json({
        status: 'fail',
        message: 'Valid role is required (LEAD, ADMIN, MEMBER)',
      });
    }

    const team = await Team.findById(id);
    if (!team) {
      return res.status(404).json({
        status: 'fail',
        message: 'Team not found',
      });
    }

    const orgCheck = await getOrgMembership(team.organization, req.user._id);
    const myMembership = team.members.find(
      (m) => m.user.toString() === req.user._id.toString()
    );
    const isTeamLead = myMembership && myMembership.role === 'LEAD';
    const isOrgAdminOrOwner = orgCheck && (orgCheck.role === 'OWNER' || orgCheck.role === 'ADMIN');

    if (!isTeamLead && !isOrgAdminOrOwner) {
      return res.status(403).json({
        status: 'fail',
        message: 'Only Team Leads or Workspace Admins can modify member roles',
      });
    }

    const targetIndex = team.members.findIndex(
      (m) => m.user.toString() === memberId
    );
    if (targetIndex === -1) {
      return res.status(404).json({
        status: 'fail',
        message: 'Member not found in this team',
      });
    }

    team.members[targetIndex].role = role.toUpperCase();
    await team.save();

    const updated = await Team.findById(team._id)
      .populate('createdBy', 'name email profileImage')
      .populate('members.user', 'name email profileImage isOnline lastSeen jobTitle department');

    const updatedMyMembership = updated.members.find(
      (m) => m.user?._id?.toString() === req.user._id.toString()
    );

    return res.status(200).json({
      status: 'success',
      message: `Member role updated to ${role.toUpperCase()}`,
      team: {
        ...updated.toObject(),
        myRole: updatedMyMembership ? updatedMyMembership.role : null,
        isMember: Boolean(updatedMyMembership),
      },
    });
  } catch (error) {
    console.error('[Change Team Member Role Error]:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Error updating team member role',
    });
  }
};

// @desc    Remove member from team or leave team
// @route   DELETE /api/teams/:id/members/:memberId
// @access  Private (JWT)
const removeTeamMember = async (req, res) => {
  try {
    const { id, memberId } = req.params;

    const team = await Team.findById(id);
    if (!team) {
      return res.status(404).json({
        status: 'fail',
        message: 'Team not found',
      });
    }

    const orgCheck = await getOrgMembership(team.organization, req.user._id);
    const isSelf = req.user._id.toString() === memberId;
    const myMembership = team.members.find(
      (m) => m.user.toString() === req.user._id.toString()
    );
    const isTeamLeadOrAdmin =
      myMembership && (myMembership.role === 'LEAD' || myMembership.role === 'ADMIN');
    const isOrgAdminOrOwner = orgCheck && (orgCheck.role === 'OWNER' || orgCheck.role === 'ADMIN');

    if (!isSelf && !isTeamLeadOrAdmin && !isOrgAdminOrOwner) {
      return res.status(403).json({
        status: 'fail',
        message: 'Permission denied to remove this team member',
      });
    }

    const targetIndex = team.members.findIndex(
      (m) => m.user.toString() === memberId
    );
    if (targetIndex === -1) {
      return res.status(404).json({
        status: 'fail',
        message: 'Member not found in this team',
      });
    }

    team.members.splice(targetIndex, 1);
    await team.save();

    const updated = await Team.findById(team._id)
      .populate('createdBy', 'name email profileImage')
      .populate('members.user', 'name email profileImage isOnline lastSeen jobTitle department');

    const updatedMyMembership = updated.members.find(
      (m) => m.user?._id?.toString() === req.user._id.toString()
    );

    return res.status(200).json({
      status: 'success',
      message: isSelf ? 'You have left the team' : 'Member removed from team',
      team: {
        ...updated.toObject(),
        myRole: updatedMyMembership ? updatedMyMembership.role : null,
        isMember: Boolean(updatedMyMembership),
      },
    });
  } catch (error) {
    console.error('[Remove Team Member Error]:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Error removing team member',
    });
  }
};

// @desc    Delete team
// @route   DELETE /api/teams/:id
// @access  Private (JWT, Team Lead or Org Owner/Admin)
const deleteTeam = async (req, res) => {
  try {
    const { id } = req.params;

    const team = await Team.findById(id);
    if (!team) {
      return res.status(404).json({
        status: 'fail',
        message: 'Team not found',
      });
    }

    const orgCheck = await getOrgMembership(team.organization, req.user._id);
    const myMembership = team.members.find(
      (m) => m.user.toString() === req.user._id.toString()
    );
    const isTeamLead = myMembership && myMembership.role === 'LEAD';
    const isOrgAdminOrOwner = orgCheck && (orgCheck.role === 'OWNER' || orgCheck.role === 'ADMIN');

    if (!isTeamLead && !isOrgAdminOrOwner) {
      return res.status(403).json({
        status: 'fail',
        message: 'Only Team Leads or Workspace Admins can delete a team',
      });
    }

    await Channel.deleteMany({ team: id });
    await Team.findByIdAndDelete(id);

    return res.status(200).json({
      status: 'success',
      message: `Team "${team.name}" and its channels have been deleted`,
      deletedTeamId: id,
    });
  } catch (error) {
    console.error('[Delete Team Error]:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Error deleting team',
    });
  }
};

module.exports = {
  createTeam,
  getOrganizationTeams,
  getTeamById,
  updateTeam,
  addTeamMember,
  changeTeamMemberRole,
  removeTeamMember,
  deleteTeam,
};

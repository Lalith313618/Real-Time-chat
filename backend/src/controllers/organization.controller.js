const crypto = require('crypto');
const Organization = require('../models/organization.model');
const User = require('../models/user.model');
const { uploadFile } = require('../config/cloudinary');
const { ROLE_RANK } = require('../middleware/org-auth.middleware');

const generateInviteCode = () => {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
};
const createOrganization = async (req, res) => {
  try {
    const { name, description = '', logo = '' } = req.body;

    if (!name || name.trim().length < 2) {
      return res.status(400).json({
        status: 'fail',
        message: 'Organization name must be at least 2 characters',
      });
    }

    const inviteCode = generateInviteCode();

    const organization = await Organization.create({
      name: name.trim(),
      description: description.trim(),
      logo: logo.trim(),
      owner: req.user._id,
      members: [
        {
          user: req.user._id,
          role: 'OWNER',
          joinedAt: new Date(),
        },
      ],
      inviteCode,
    });
organization
    await User.findByIdAndUpdate(req.user._id, {
      currentOrganization: organization._id,
    });

    const populatedOrg = await Organization.findById(organization._id)
      .populate('owner', 'name email profileImage')
      .populate('members.user', 'name email profileImage isOnline lastSeen');

    return res.status(201).json({
      status: 'success',
      message: 'Organization created successfully',
      organization: {
        ...populatedOrg.toObject(),
        myRole: 'OWNER',
      },
    });
  } catch (error) {
    console.error('[Create Organization Error]:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Error creating organization',
    });
  }
};
const getUserOrganizations = async (req, res) => {
  try {
    const organizations = await Organization.find({
      'members.user': req.user._id,
    })
      .populate('owner', 'name email profileImage')
      .sort({ updatedAt: -1 });

    const orgsWithRole = organizations.map((org) => {
      const orgObj = org.toObject();
      const myMembership = org.members.find(
        (m) => m.user.toString() === req.user._id.toString()
      );
      return {
        ...orgObj,
        myRole: myMembership ? myMembership.role : 'MEMBER',
        memberCount: org.members.length,
      };
    });

    return res.status(200).json({
      status: 'success',
      results: orgsWithRole.length,
      organizations: orgsWithRole,
    });
  } catch (error) {
    console.error('[Get User Organizations Error]:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Error fetching user organizations',
    });
  }
};


const getOrganizationById = async (req, res) => {
  try {
    const org = await Organization.findById(req.organization._id)
      .populate('owner', 'name email profileImage')
      .populate('members.user', 'name email profileImage isOnline lastSeen');

    return res.status(200).json({
      status: 'success',
      organization: {
        ...org.toObject(),
        myRole: req.orgRole,
        memberCount: org.members.length,
      },
    });
  } catch (error) {
    console.error('[Get Organization By ID Error]:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Error fetching organization details',
    });
  }
};

const updateOrganization = async (req, res) => {
  try {
    const { name, description, logo } = req.body;
    const org = req.organization;

    if (name && name.trim().length >= 2) {
      org.name = name.trim();
    }
    if (description !== undefined) {
      org.description = description.trim();
    }
    if (logo !== undefined) {
      org.logo = logo.trim();
    }

    await org.save();

    const updated = await Organization.findById(org._id)
      .populate('owner', 'name email profileImage')
      .populate('members.user', 'name email profileImage isOnline lastSeen');

    return res.status(200).json({
      status: 'success',
      message: 'Organization updated successfully',
      organization: {
        ...updated.toObject(),
        myRole: req.orgRole,
      },
    });
  } catch (error) {
    console.error('[Update Organization Error]:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Error updating organization',
    });
  }
};
const inviteMember = async (req, res) => {
  try {
    const { email, userId, role = 'MEMBER' } = req.body;
    const org = req.organization;

    const validRoles = ['OWNER', 'ADMIN', 'MANAGER', 'MEMBER', 'GUEST'];
    const requestedRole = role.toUpperCase();

    if (!validRoles.includes(requestedRole)) {
      return res.status(400).json({
        status: 'fail',
        message: `Invalid role. Allowed roles: ${validRoles.join(', ')}`,
      });
    }
    if (requestedRole === 'OWNER' && req.orgRole !== 'OWNER') {
      return res.status(403).json({
        status: 'fail',
        message: 'Only the organization owner can invite or appoint another OWNER',
      });
    }

    if (requestedRole === 'ADMIN' && req.orgRole !== 'OWNER' && req.orgRole !== 'ADMIN') {
      return res.status(403).json({
        status: 'fail',
        message: 'Only OWNER or ADMIN can invite another ADMIN',
      });
    }
    let targetUser = null;
    if (userId) {
      targetUser = await User.findById(userId);
    } else if (email) {
      targetUser = await User.findOne({ email: email.toLowerCase().trim() });
    }

    if (!targetUser) {
      return res.status(404).json({
        status: 'fail',
        message: 'User not found with the provided email or ID',
      });
    }
    const existingIndex = org.members.findIndex(
      (m) => m.user.toString() === targetUser._id.toString()
    );

    if (existingIndex !== -1) {
      return res.status(400).json({
        status: 'fail',
        message: `${targetUser.name} is already a member of this organization`,
      });
    }
    org.members.push({
      user: targetUser._id,
      role: requestedRole,
      joinedAt: new Date(),
    });

    await org.save();
    if (!targetUser.currentOrganization) {
      targetUser.currentOrganization = org._id;
      await targetUser.save({ validateBeforeSave: false });
    }

    const updatedOrg = await Organization.findById(org._id)
      .populate('owner', 'name email profileImage')
      .populate('members.user', 'name email profileImage isOnline lastSeen');

    return res.status(200).json({
      status: 'success',
      message: `${targetUser.name} added to ${org.name} as ${requestedRole}`,
      organization: {
        ...updatedOrg.toObject(),
        myRole: req.orgRole,
      },
    });
  } catch (error) {
    console.error('[Invite Member Error]:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Error adding member to organization',
    });
  }
};
const changeMemberRole = async (req, res) => {
  try {
    const { memberId } = req.params;
    const { role: newRole } = req.body;
    const org = req.organization;

    const validRoles = ['OWNER', 'ADMIN', 'MANAGER', 'MEMBER', 'GUEST'];
    if (!newRole || !validRoles.includes(newRole.toUpperCase())) {
      return res.status(400).json({
        status: 'fail',
        message: `Invalid role. Must be one of: ${validRoles.join(', ')}`,
      });
    }

    const targetRole = newRole.toUpperCase();
    const memberIndex = org.members.findIndex(
      (m) => m.user.toString() === memberId
    );

    if (memberIndex === -1) {
      return res.status(404).json({
        status: 'fail',
        message: 'Member not found in this organization',
      });
    }

    const currentMemberRole = org.members[memberIndex].role;

    if (currentMemberRole === 'OWNER' && req.orgRole !== 'OWNER') {
      return res.status(403).json({
        status: 'fail',
        message: 'Only an OWNER can modify the role of another OWNER',
      });
    }

    if (targetRole === 'OWNER' && req.orgRole !== 'OWNER') {
      return res.status(403).json({
        status: 'fail',
        message: 'Only an OWNER can promote members to OWNER',
      });
    }
    if (req.orgRole === 'ADMIN') {
      if (ROLE_RANK[currentMemberRole] >= ROLE_RANK['ADMIN']) {
        return res.status(403).json({
          status: 'fail',
          message: 'Admins cannot change roles of other Admins or Owners',
        });
      }
      if (ROLE_RANK[targetRole] > ROLE_RANK['ADMIN']) {
        return res.status(403).json({
          status: 'fail',
          message: 'Admins cannot promote members to higher than Admin',
        });
      }
    }

    if (currentMemberRole === 'OWNER' && targetRole !== 'OWNER') {
      const ownerCount = org.members.filter((m) => m.role === 'OWNER').length;
      if (ownerCount <= 1) {
        return res.status(400).json({
          status: 'fail',
          message: 'Organization must have at least one OWNER. Transfer ownership first.',
        });
      }
    }

    org.members[memberIndex].role = targetRole;
    await org.save();

    const updatedOrg = await Organization.findById(org._id)
      .populate('owner', 'name email profileImage')
      .populate('members.user', 'name email profileImage isOnline lastSeen');

    return res.status(200).json({
      status: 'success',
      message: `Member role updated to ${targetRole}`,
      organization: {
        ...updatedOrg.toObject(),
        myRole: req.orgRole,
      },
    });
  } catch (error) {
    console.error('[Change Member Role Error]:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Error updating member role',
    });
  }
};
const removeMember = async (req, res) => {
  try {
    const { memberId } = req.params;
    const org = req.organization;
    const currentUserId = req.user._id.toString();

    const isSelf = currentUserId === memberId;
    const isOwner = req.orgRole === 'OWNER';
    const isAdmin = req.orgRole === 'ADMIN';

    if (!isSelf && !isOwner && !isAdmin) {
      return res.status(403).json({
        status: 'fail',
        message: 'Permission denied. Only Owner or Admin can remove members.',
      });
    }

    const memberIndex = org.members.findIndex(
      (m) => m.user.toString() === memberId
    );

    if (memberIndex === -1) {
      return res.status(404).json({
        status: 'fail',
        message: 'Member not found in this organization',
      });
    }

    const targetMemberRole = org.members[memberIndex].role;

    if (targetMemberRole === 'OWNER') {
      const ownerCount = org.members.filter((m) => m.role === 'OWNER').length;
      if (ownerCount <= 1) {
        return res.status(400).json({
          status: 'fail',
          message: 'Cannot remove the sole organization owner.',
        });
      }
    }
    if (isAdmin && !isOwner && !isSelf) {
      if (ROLE_RANK[targetMemberRole] >= ROLE_RANK['ADMIN']) {
        return res.status(403).json({
          status: 'fail',
          message: 'Admins cannot remove other Admins or Owners',
        });
      }
    }

 
    org.members.splice(memberIndex, 1);
    await org.save();
    await User.findByIdAndUpdate(memberId, {
      $cond: [{ $eq: ['$currentOrganization', org._id] }, null, '$currentOrganization'],
    });

    const updatedOrg = await Organization.findById(org._id)
      .populate('owner', 'name email profileImage')
      .populate('members.user', 'name email profileImage isOnline lastSeen');

    return res.status(200).json({
      status: 'success',
      message: isSelf ? 'You have left the organization' : 'Member removed successfully',
      organization: {
        ...updatedOrg.toObject(),
        myRole: isSelf ? null : req.orgRole,
      },
    });
  } catch (error) {
    console.error('[Remove Member Error]:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Error removing member',
    });
  }
};

const switchOrganization = async (req, res) => {
  try {
    const org = req.organization;

    await User.findByIdAndUpdate(req.user._id, {
      currentOrganization: org._id,
    });

    const populatedOrg = await Organization.findById(org._id)
      .populate('owner', 'name email profileImage')
      .populate('members.user', 'name email profileImage isOnline lastSeen');

    return res.status(200).json({
      status: 'success',
      message: `Active workspace switched to ${org.name}`,
      organization: {
        ...populatedOrg.toObject(),
        myRole: req.orgRole,
      },
    });
  } catch (error) {
    console.error('[Switch Organization Error]:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Error switching organization',
    });
  }
};
const uploadLogo = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        status: 'fail',
        message: 'No image file uploaded',
      });
    }

    const org = req.organization;
    const result = await uploadFile(req.file.buffer, {
      folder: 'chat_app/org_logos',
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      req,
    });

    org.logo = result.fileUrl;
    await org.save();

    return res.status(200).json({
      status: 'success',
      message: 'Organization logo updated successfully',
      logoUrl: result.fileUrl,
    });
  } catch (error) {
    console.error('[Upload Logo Error]:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Error uploading organization logo',
    });
  }
};

module.exports = {
  createOrganization,
  getUserOrganizations,
  getOrganizationById,
  updateOrganization,
  inviteMember,
  changeMemberRole,
  removeMember,
  switchOrganization,
  uploadLogo,
};

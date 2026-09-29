const Organization = require('../models/organization.model');

const ROLE_RANK = {
  OWNER: 5,
  ADMIN: 4,
  MANAGER: 3,
  MEMBER: 2,
  GUEST: 1,
};
const requireOrgMember = async (req, res, next) => {
  try {
    const orgId =
      req.params.orgId ||
      req.params.id ||
      req.body.organizationId ||
      req.headers['x-organization-id'];

    if (!orgId) {
      return res.status(400).json({
        status: 'fail',
        message: 'Organization ID is required',
      });
    }

    const organization = await Organization.findById(orgId);
    if (!organization) {
      return res.status(404).json({
        status: 'fail',
        message: 'Organization not found',
      });
    }

    const currentUserId = req.user._id.toString();
    const membership = organization.members.find(
      (m) => m.user.toString() === currentUserId
    );

    if (!membership) {
      return res.status(403).json({
        status: 'fail',
        message: 'You are not a member of this organization',
      });
    }

    req.organization = organization;
    req.orgMembership = membership;
    req.orgRole = membership.role;
    next();
  } catch (error) {
    console.error('[Org Auth Middleware Error]:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Error validating organization membership',
    });
  }
};
const requireOrgRoles = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.orgRole) {
      return res.status(403).json({
        status: 'fail',
        message: 'Organization context missing',
      });
    }

    if (!allowedRoles.includes(req.orgRole)) {
      return res.status(403).json({
        status: 'fail',
        message: `Permission denied. Required role: ${allowedRoles.join(' or ')}. Your role: ${req.orgRole}`,
      });
    }

    next();
  };
};

module.exports = {
  ROLE_RANK,
  requireOrgMember,
  requireOrgRoles,
};

const express = require('express');
const router = express.Router();
const {
  createOrganization,
  getUserOrganizations,
  getOrganizationById,
  updateOrganization,
  inviteMember,
  changeMemberRole,
  removeMember,
  switchOrganization,
  uploadLogo,
} = require('../controllers/organization.controller');
const { protect } = require('../middleware/auth.middleware');
const { requireOrgMember, requireOrgRoles } = require('../middleware/org-auth.middleware');
const { uploadSingle } = require('../middleware/upload.middleware');

router.use(protect);
router.post('/', createOrganization);
router.get('/', getUserOrganizations);
router.get('/:id', requireOrgMember, getOrganizationById);
router.put('/:id', requireOrgMember, requireOrgRoles(['OWNER', 'ADMIN']), updateOrganization);
router.post('/:id/logo', requireOrgMember, requireOrgRoles(['OWNER', 'ADMIN']), uploadSingle('logo'), uploadLogo);
router.put('/:id/switch', requireOrgMember, switchOrganization);
router.post('/:id/members', requireOrgMember, requireOrgRoles(['OWNER', 'ADMIN', 'MANAGER']), inviteMember);
router.put('/:id/members/:memberId/role', requireOrgMember, requireOrgRoles(['OWNER', 'ADMIN']), changeMemberRole);
router.delete('/:id/members/:memberId', requireOrgMember, removeMember);

module.exports = router;

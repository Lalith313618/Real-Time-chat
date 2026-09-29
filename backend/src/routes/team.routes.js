const express = require('express');
const router = express.Router();
const {
  createTeam,
  getOrganizationTeams,
  getTeamById,
  updateTeam,
  addTeamMember,
  changeTeamMemberRole,
  removeTeamMember,
  deleteTeam,
} = require('../controllers/team.controller');
const { protect } = require('../middleware/auth.middleware');

// All team routes require authentication
router.use(protect);

router.post('/', createTeam);
router.get('/', getOrganizationTeams);
router.get('/:id', getTeamById);
router.put('/:id', updateTeam);
router.delete('/:id', deleteTeam);

// Team members management
router.post('/:id/members', addTeamMember);
router.put('/:id/members/:memberId/role', changeTeamMemberRole);
router.delete('/:id/members/:memberId', removeTeamMember);

module.exports = router;

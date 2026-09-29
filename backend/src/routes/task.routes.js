const express = require('express');
const router = express.Router();
const {
  createTask,
  getTasks,
  getTaskById,
  updateTask,
  updateTaskStatus,
  addChecklistItem,
  toggleChecklistItem,
  deleteTask,
} = require('../controllers/task.controller');
const { protect } = require('../middleware/auth.middleware');

// All task routes require authentication
router.use(protect);

router.post('/', createTask);
router.get('/', getTasks);
router.get('/:id', getTaskById);
router.put('/:id', updateTask);
router.patch('/:id/status', updateTaskStatus);
router.post('/:id/checklist', addChecklistItem);
router.patch('/:id/checklist/:itemId', toggleChecklistItem);
router.delete('/:id', deleteTask);

module.exports = router;

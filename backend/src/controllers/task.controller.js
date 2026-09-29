const Task = require('../models/task.model');
const Team = require('../models/team.model');
const Channel = require('../models/channel.model');
const Organization = require('../models/organization.model');

const populateTask = (query) => {
  return query
    .populate('creator', '_id name email profileImage')
    .populate('assignees', '_id name email profileImage jobTitle')
    .populate('team', '_id name privacy')
    .populate('channel', '_id name type');
};

exports.createTask = async (req, res) => {
  try {
    const {
      title,
      description,
      organization,
      team,
      channel,
      assignees,
      status,
      priority,
      dueDate,
      checklist,
      labels,
      attachments,
    } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({
        status: 'fail',
        message: 'Task title is required',
      });
    }

    const orgId = organization || req.user.organization;
    if (!orgId) {
      return res.status(400).json({
        status: 'fail',
        message: 'Organization reference is required to create a task',
      });
    }


    let assigneesList = [];
    if (Array.isArray(assignees)) {
      assigneesList = assignees.filter(Boolean);
    } else if (assignees) {
      assigneesList = [assignees];
    }

    let cleanChecklist = [];
    if (Array.isArray(checklist)) {
      cleanChecklist = checklist
        .filter((item) => item && (typeof item === 'string' ? item.trim() : item.title?.trim()))
        .map((item) => ({
          title: typeof item === 'string' ? item.trim() : item.title.trim(),
          isCompleted: typeof item === 'object' ? Boolean(item.isCompleted) : false,
        }));
    }

    const newTask = await Task.create({
      title: title.trim(),
      description: description ? description.trim() : '',
      organization: orgId,
      team: team || undefined,
      channel: channel || undefined,
      creator: req.user._id,
      assignees: assigneesList,
      status: status || 'TODO',
      priority: priority || 'MEDIUM',
      dueDate: dueDate ? new Date(dueDate) : undefined,
      checklist: cleanChecklist,
      labels: Array.isArray(labels) ? labels.filter(Boolean) : [],
      attachments: Array.isArray(attachments) ? attachments : [],
    });

    const populated = await populateTask(Task.findById(newTask._id));

    const io = req.app.get('io');
    if (io) {
      if (team) {
        io.to(`team_${team}`).emit('task_created', { task: populated });
      }
      if (channel) {
        io.to(`channel_${channel}`).emit('task_created', { task: populated });
      }
      io.to(`org_${orgId}`).emit('task_created', { task: populated });
    }

    res.status(201).json({
      status: 'success',
      task: populated,
    });
  } catch (error) {
    console.error('[createTask Error]:', error);
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to create task',
    });
  }
};
exports.getTasks = async (req, res) => {
  try {
    const {
      organization,
      team,
      channel,
      status,
      priority,
      assigneeId,
      myTasks,
      q,
      sortBy = 'createdAt',
      order = 'desc',
    } = req.query;

    const query = {};


    const orgId = organization || req.user.organization;
    if (orgId) {
      query.organization = orgId;
    }
    if (team) {
      query.team = team;
    }
    if (channel) {
      query.channel = channel;
    }
    if (status) {
      if (status.includes(',')) {
        query.status = { $in: status.split(',').map((s) => s.trim()) };
      } else {
        query.status = status.trim();
      }
    }
    if (priority) {
      query.priority = priority.trim();
    }
    if (myTasks === 'true' || myTasks === true) {
      query.assignees = req.user._id;
    } else if (assigneeId) {
      query.assignees = assigneeId;
    }

    if (q && q.trim()) {
      const searchRegex = new RegExp(q.trim(), 'i');
      query.$or = [{ title: searchRegex }, { description: searchRegex }];
    }
    let sortOptions = {};
    if (sortBy === 'dueDate') {
      sortOptions = { dueDate: order === 'asc' ? 1 : -1, createdAt: -1 };
    } else if (sortBy === 'priority') {
      sortOptions = { priority: order === 'asc' ? 1 : -1, createdAt: -1 };
    } else {
      sortOptions = { [sortBy]: order === 'asc' ? 1 : -1 };
    }

    const tasks = await populateTask(Task.find(query).sort(sortOptions));

    res.status(200).json({
      status: 'success',
      results: tasks.length,
      tasks,
    });
  } catch (error) {
    console.error('[getTasks Error]:', error);
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to fetch tasks',
    });
  }
};
exports.getTaskById = async (req, res) => {
  try {
    const { id } = req.params;
    const task = await populateTask(Task.findById(id));

    if (!task) {
      return res.status(404).json({
        status: 'fail',
        message: 'Task not found',
      });
    }

    res.status(200).json({
      status: 'success',
      task,
    });
  } catch (error) {
    console.error('[getTaskById Error]:', error);
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to fetch task',
    });
  }
};
exports.updateTask = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      description,
      team,
      channel,
      assignees,
      status,
      priority,
      dueDate,
      labels,
      checklist,
      attachments,
    } = req.body;

    const task = await Task.findById(id);
    if (!task) {
      return res.status(404).json({
        status: 'fail',
        message: 'Task not found',
      });
    }

    if (title !== undefined) task.title = title.trim();
    if (description !== undefined) task.description = description.trim();
    if (team !== undefined) task.team = team || null;
    if (channel !== undefined) task.channel = channel || null;
    if (status !== undefined) task.status = status;
    if (priority !== undefined) task.priority = priority;
    if (dueDate !== undefined) task.dueDate = dueDate ? new Date(dueDate) : null;
    if (labels !== undefined && Array.isArray(labels)) task.labels = labels;
    if (attachments !== undefined && Array.isArray(attachments)) task.attachments = attachments;

    if (assignees !== undefined) {
      task.assignees = Array.isArray(assignees) ? assignees.filter(Boolean) : [assignees].filter(Boolean);
    }

    if (checklist !== undefined && Array.isArray(checklist)) {
      task.checklist = checklist.map((item) => ({
        title: item.title,
        isCompleted: Boolean(item.isCompleted),
        completedAt: item.isCompleted ? (item.completedAt || new Date()) : null,
      }));
    }

    await task.save();

    const populated = await populateTask(Task.findById(task._id));

    // Emit socket event
    const io = req.app.get('io');
    if (io) {
      if (populated.team?._id) {
        io.to(`team_${populated.team._id}`).emit('task_updated', { task: populated });
      }
      if (populated.channel?._id) {
        io.to(`channel_${populated.channel._id}`).emit('task_updated', { task: populated });
      }
      io.to(`org_${populated.organization}`).emit('task_updated', { task: populated });
    }

    res.status(200).json({
      status: 'success',
      task: populated,
    });
  } catch (error) {
    console.error('[updateTask Error]:', error);
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to update task',
    });
  }
};

// @desc    Quick update task status
// @route   PATCH /api/tasks/:id/status
// @access  Private (JWT)
exports.updateTaskStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'COMPLETED'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({
        status: 'fail',
        message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
      });
    }

    const task = await Task.findById(id);
    if (!task) {
      return res.status(404).json({
        status: 'fail',
        message: 'Task not found',
      });
    }

    const oldStatus = task.status;
    task.status = status;
    await task.save();

    const populated = await populateTask(Task.findById(task._id));

    const io = req.app.get('io');
    if (io) {
      const payload = {
        taskId: task._id,
        oldStatus,
        newStatus: status,
        task: populated,
      };
      if (populated.team?._id) {
        io.to(`team_${populated.team._id}`).emit('task_status_changed', payload);
      }
      if (populated.channel?._id) {
        io.to(`channel_${populated.channel._id}`).emit('task_status_changed', payload);
      }
      io.to(`org_${populated.organization}`).emit('task_status_changed', payload);
    }

    res.status(200).json({
      status: 'success',
      task: populated,
    });
  } catch (error) {
    console.error('[updateTaskStatus Error]:', error);
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to update task status',
    });
  }
};
exports.addChecklistItem = async (req, res) => {
  try {
    const { id } = req.params;
    const { title } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({
        status: 'fail',
        message: 'Checklist item title is required',
      });
    }

    const task = await Task.findById(id);
    if (!task) {
      return res.status(404).json({
        status: 'fail',
        message: 'Task not found',
      });
    }

    task.checklist.push({
      title: title.trim(),
      isCompleted: false,
    });

    await task.save();
    const populated = await populateTask(Task.findById(task._id));

    res.status(200).json({
      status: 'success',
      task: populated,
    });
  } catch (error) {
    console.error('[addChecklistItem Error]:', error);
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to add checklist item',
    });
  }
};
exports.toggleChecklistItem = async (req, res) => {
  try {
    const { id, itemId } = req.params;

    const task = await Task.findById(id);
    if (!task) {
      return res.status(404).json({
        status: 'fail',
        message: 'Task not found',
      });
    }

    const item = task.checklist.id(itemId);
    if (!item) {
      return res.status(404).json({
        status: 'fail',
        message: 'Checklist item not found',
      });
    }

    item.isCompleted = !item.isCompleted;
    item.completedAt = item.isCompleted ? new Date() : null;

    await task.save();
    const populated = await populateTask(Task.findById(task._id));

    res.status(200).json({
      status: 'success',
      task: populated,
    });
  } catch (error) {
    console.error('[toggleChecklistItem Error]:', error);
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to toggle checklist item',
    });
  }
};
exports.deleteTask = async (req, res) => {
  try {
    const { id } = req.params;
    const task = await Task.findById(id);

    if (!task) {
      return res.status(404).json({
        status: 'fail',
        message: 'Task not found',
      });
    }

    const orgId = task.organization;
    const teamId = task.team;
    const channelId = task.channel;

    await Task.findByIdAndDelete(id);

    const io = req.app.get('io');
    if (io) {
      if (teamId) {
        io.to(`team_${teamId}`).emit('task_deleted', { taskId: id });
      }
      if (channelId) {
        io.to(`channel_${channelId}`).emit('task_deleted', { taskId: id });
      }
      io.to(`org_${orgId}`).emit('task_deleted', { taskId: id });
    }

    res.status(200).json({
      status: 'success',
      message: 'Task deleted successfully',
      taskId: id,
    });
  } catch (error) {
    console.error('[deleteTask Error]:', error);
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to delete task',
    });
  }
};

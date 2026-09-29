const User = require('../models/user.model');
const Message = require('../models/message.model');
const Team = require('../models/team.model');
const Channel = require('../models/channel.model');
const Task = require('../models/task.model');
const Organization = require('../models/organization.model');

exports.globalSearch = async (req, res) => {
  try {
    const { q, type = 'all', limit = 20 } = req.query;

    if (!q || !q.trim() || q.trim().length < 2) {
      return res.status(200).json({
        status: 'success',
        query: q || '',
        total: 0,
        results: {
          people: [],
          teams: [],
          channels: [],
          tasks: [],
          messages: [],
          files: [],
        },
      });
    }

    const queryText = q.trim();
    const regex = new RegExp(queryText.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&'), 'i');
    const maxLimit = Math.min(parseInt(limit, 10) || 20, 50);

    const orgId = req.user.organization;
    const currentUserId = req.user._id;

    const shouldSearch = (cat) => type === 'all' || type === cat;

    const results = {
      people: [],
      teams: [],
      channels: [],
      tasks: [],
      messages: [],
      files: [],
    };

    const tasksToExecute = [];

    if (shouldSearch('people')) {
      tasksToExecute.push(
        (async () => {
          const userQuery = {
            $or: [
              { name: { $regex: regex } },
              { email: { $regex: regex } },
              { jobTitle: { $regex: regex } },
              { department: { $regex: regex } },
            ],
          };
          if (orgId) {
            userQuery.organization = orgId;
          }

          results.people = await User.find(userQuery)
            .select('_id name email profileImage jobTitle department isOnline')
            .limit(maxLimit)
            .lean();
        })()
      );
    }

    if (shouldSearch('teams')) {
      tasksToExecute.push(
        (async () => {
          const teamQuery = {
            name: { $regex: regex },
            isArchived: { $ne: true },
          };
          if (orgId) {
            teamQuery.organization = orgId;
          }

          teamQuery.$or = [
            { privacy: 'PUBLIC' },
            { 'members.user': currentUserId },
            { owner: currentUserId },
          ];

          results.teams = await Team.find(teamQuery)
            .select('_id name description privacy avatar memberCount')
            .limit(maxLimit)
            .lean();
        })()
      );
    }

    if (shouldSearch('channels')) {
      tasksToExecute.push(
        (async () => {
          const channelQuery = {
            name: { $regex: regex },
            isArchived: { $ne: true },
          };

          if (orgId) {
            channelQuery.organization = orgId;
          }

          channelQuery.$or = [
            { type: 'PUBLIC' },
            { members: currentUserId },
          ];

          results.channels = await Channel.find(channelQuery)
            .select('_id name description type team')
            .populate('team', '_id name')
            .limit(maxLimit)
            .lean();
        })()
      );
    }
    if (shouldSearch('tasks')) {
      tasksToExecute.push(
        (async () => {
          const taskQuery = {
            $or: [
              { title: { $regex: regex } },
              { description: { $regex: regex } },
              { labels: { $regex: regex } },
            ],
            isArchived: { $ne: true },
          };

          if (orgId) {
            taskQuery.organization = orgId;
          }

          results.tasks = await Task.find(taskQuery)
            .select('_id title status priority dueDate team channel assignees labels')
            .populate('team', '_id name')
            .populate('channel', '_id name')
            .populate('assignees', '_id name profileImage')
            .limit(maxLimit)
            .lean();
        })()
      );
    }

    if (shouldSearch('messages')) {
      tasksToExecute.push(
        (async () => {
         
          const messageQuery = {
            content: { $regex: regex },
            isDeleted: { $ne: true },
          };

         
          messageQuery.$or = [
            { sender: currentUserId },
            { recipient: currentUserId },
            { channel: { $ne: null } },
          ];

          results.messages = await Message.find(messageQuery)
            .select('_id content messageType sender recipient channel team threadParent createdAt attachments')
            .populate('sender', '_id name profileImage')
            .populate('channel', '_id name')
            .populate('team', '_id name')
            .sort({ createdAt: -1 })
            .limit(maxLimit)
            .lean();
        })()
      );
    }

    if (shouldSearch('files')) {
      tasksToExecute.push(
        (async () => {
         
          const fileMessages = await Message.find({
            'attachments.originalName': { $regex: regex },
            isDeleted: { $ne: true },
          })
            .select('_id sender channel team createdAt attachments')
            .populate('sender', '_id name profileImage')
            .populate('channel', '_id name')
            .sort({ createdAt: -1 })
            .limit(maxLimit)
            .lean();

          const filesList = [];
          for (const msg of fileMessages) {
            for (const att of msg.attachments || []) {
              if (att.originalName && regex.test(att.originalName)) {
                filesList.push({
                  _id: att._id || msg._id,
                  originalName: att.originalName,
                  fileUrl: att.fileUrl,
                  mimeType: att.mimeType,
                  fileSize: att.fileSize,
                  uploader: msg.sender,
                  channel: msg.channel,
                  messageId: msg._id,
                  createdAt: msg.createdAt,
                });
              }
            }
          }
          results.files = filesList.slice(0, maxLimit);
        })()
      );
    }

    await Promise.all(tasksToExecute);

    const totalCount =
      results.people.length +
      results.teams.length +
      results.channels.length +
      results.tasks.length +
      results.messages.length +
      results.files.length;

    res.status(200).json({
      status: 'success',
      query: queryText,
      total: totalCount,
      results,
    });
  } catch (error) {
    console.error('Error in globalSearch:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to perform global search',
      error: error.message,
    });
  }
};

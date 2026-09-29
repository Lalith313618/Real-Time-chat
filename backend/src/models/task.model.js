const mongoose = require('mongoose');

const checklistItemSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Checklist item title is required'],
      trim: true,
    },
    isCompleted: {
      type: Boolean,
      default: false,
    },
    completedAt: {
      type: Date,
    },
  },
  { _id: true }
);

const taskSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Task title is required'],
      trim: true,
      maxlength: [200, 'Task title cannot exceed 200 characters'],
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: [true, 'Organization reference is required'],
      index: true,
    },
    team: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Team',
      index: true,
    },
    channel: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Channel',
      index: true,
    },
    creator: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Task creator is required'],
      index: true,
    },
    assignees: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    status: {
      type: String,
      enum: ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'COMPLETED'],
      default: 'TODO',
      index: true,
    },
    priority: {
      type: String,
      enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'],
      default: 'MEDIUM',
      index: true,
    },
    dueDate: {
      type: Date,
      index: true,
    },
    checklist: [checklistItemSchema],
    labels: [
      {
        type: String,
        trim: true,
      },
    ],
    attachments: [
      {
        fileUrl: String,
        fileName: String,
        fileSize: Number,
      },
    ],
  },
  {
    timestamps: true,
  }
);

taskSchema.index({ organization: 1, status: 1 });
taskSchema.index({ organization: 1, team: 1 });
taskSchema.index({ assignees: 1 });

module.exports = mongoose.model('Task', taskSchema);

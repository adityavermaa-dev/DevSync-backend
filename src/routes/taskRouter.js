const express = require('express');
const { userAuth } = require('../middlewares/auth');
const Task = require('../models/task');
const Project = require('../models/project');
const { trackUserActivity } = require('../services/gamificationService');

const taskRouter = express.Router();

// Middleware to check if user is member of project
const checkProjectMember = async (req, res, next) => {
  try {
    const projectId = req.params.projectId || req.body.projectId;
    const project = await Project.findById(projectId);
    
    if (!project) return res.status(404).json({ message: 'Project not found' });
    
    const isMember = project.members.some(m => m.user.toString() === req.user._id.toString());
    if (!isMember && project.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Must be a project member to access tasks' });
    }
    
    req.project = project; // attach project to request
    next();
  } catch (error) {
    res.status(500).json({ message: 'Error checking project membership', error: error.message });
  }
};

// Create a task
taskRouter.post('/projects/:projectId/tasks', userAuth, checkProjectMember, async (req, res) => {
  try {
    const { title, description, status, priority, assignee } = req.body;
    
    if (!title) return res.status(400).json({ message: 'Task title is required' });

    const newTask = new Task({
      projectId: req.project._id,
      title,
      description,
      status: status || 'todo',
      priority: priority || 'medium',
      assignee,
      createdBy: req.user._id
    });

    const savedTask = await newTask.save();
    
    await trackUserActivity(req.user._id);

    // Populate assignee for frontend
    await savedTask.populate('assignee', 'firstName lastName photoUrl');
    
    res.status(201).json(savedTask);
  } catch (error) {
    res.status(500).json({ message: 'Error creating task', error: error.message });
  }
});

// Get all tasks for a project
taskRouter.get('/projects/:projectId/tasks', userAuth, checkProjectMember, async (req, res) => {
  try {
    const tasks = await Task.find({ projectId: req.project._id })
      .populate('assignee', 'firstName lastName photoUrl')
      .populate('createdBy', 'firstName lastName photoUrl')
      .sort({ createdAt: -1 });
      
    res.json(tasks);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching tasks', error: error.message });
  }
});

// Update a task (status, assign, etc)
taskRouter.patch('/projects/:projectId/tasks/:taskId', userAuth, checkProjectMember, async (req, res) => {
  try {
    const { title, description, status, priority, assignee } = req.body;
    
    const task = await Task.findOne({ _id: req.params.taskId, projectId: req.params.projectId });
    
    if (!task) return res.status(404).json({ message: 'Task not found' });

    if (title) task.title = title;
    if (description !== undefined) task.description = description;
    if (status) task.status = status;
    if (priority) task.priority = priority;
    if (assignee !== undefined) task.assignee = assignee; // allow clearing assignee by sending null

    await task.save();
    
    await trackUserActivity(req.user._id);

    await task.populate('assignee', 'firstName lastName photoUrl');
    
    res.json(task);
  } catch (error) {
    res.status(500).json({ message: 'Error updating task', error: error.message });
  }
});

// Delete a task
taskRouter.delete('/projects/:projectId/tasks/:taskId', userAuth, checkProjectMember, async (req, res) => {
  try {
    const task = await Task.findOneAndDelete({ _id: req.params.taskId, projectId: req.params.projectId });
    
    if (!task) return res.status(404).json({ message: 'Task not found' });
    
    res.json({ message: 'Task deleted successfully', task });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting task', error: error.message });
  }
});

module.exports = taskRouter;

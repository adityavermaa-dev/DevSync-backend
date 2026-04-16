const express = require('express');
const { userAuth } = require('../middlewares/auth');
const Project = require('../models/project');
const Chat = require('../models/chat');
const User = require('../models/user');
const { trackUserActivity } = require('../services/gamificationService');

const projectRouter = express.Router();

// Get all open projects
projectRouter.get('/projects', userAuth, async (req, res) => {
  try {
    const projects = await Project.find({ status: 'Open' })
      .populate('owner', 'firstName lastName photoUrl')
      .populate('members.user', 'firstName lastName photoUrl')
      .sort({ createdAt: -1 });
    res.json(projects);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching projects', error: error.message });
  }
});

// Create a new project
projectRouter.post('/project', userAuth, async (req, res) => {
  try {
    const { title, description, techStack, rolesNeeded, repoUrl, maxMembers, status } = req.body;
    
    if (!title || !description) {
      return res.status(400).json({ message: 'Title and description are required' });
    }

    const newProject = new Project({
      title,
      description,
      owner: req.user._id,
      techStack: techStack || [],
      rolesNeeded: rolesNeeded || [],
      repoUrl,
      maxMembers,
      status: status || 'Open',
      members: [{ user: req.user._id, role: 'admin' }]
    });

    const savedProject = await newProject.save();

    // Create a group chat for the project
    const chat = new Chat({
      isGroup: true,
      name: `${title} - General`,
      projectName: title,
      participants: [req.user._id],
      admin: req.user._id,
      projectId: savedProject._id
    });
    await chat.save();

    await trackUserActivity(req.user._id);

    res.status(201).json(savedProject);
  } catch (error) {
    res.status(500).json({ message: 'Error creating project', error: error.message });
  }
});

// Get a single project by ID
projectRouter.get('/projects/:projectId', userAuth, async (req, res) => {
  try {
    const project = await Project.findById(req.params.projectId)
      .populate('owner', 'firstName lastName photoUrl')
      .populate('members.user', 'firstName lastName photoUrl skills')
      .populate('joinRequests.user', 'firstName lastName photoUrl');
    
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }
    
    res.json(project);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching project', error: error.message });
  }
});

// Edit project
projectRouter.patch('/projects/:projectId', userAuth, async (req, res) => {
  try {
    const project = await Project.findById(req.params.projectId);
    
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    if (project.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to edit this project' });
    }

    const { title, description, techStack, rolesNeeded, repoUrl, maxMembers, status } = req.body;
    
    if (title) project.title = title;
    if (description) project.description = description;
    if (techStack) project.techStack = techStack;
    if (rolesNeeded) project.rolesNeeded = rolesNeeded;
    if (repoUrl !== undefined) project.repoUrl = repoUrl;
    if (maxMembers) project.maxMembers = maxMembers;
    if (status) project.status = status;

    await project.save();
    res.json(project);
  } catch (error) {
    res.status(500).json({ message: 'Error updating project', error: error.message });
  }
});

// Delete project
projectRouter.delete('/projects/:projectId', userAuth, async (req, res) => {
  try {
    const project = await Project.findById(req.params.projectId);
    
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    if (project.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to delete this project' });
    }

    await Project.findByIdAndDelete(req.params.projectId);
    await Chat.findOneAndDelete({ projectId: req.params.projectId });

    res.json({ message: 'Project deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting project', error: error.message });
  }
});

// Request to join project
projectRouter.post('/projects/:projectId/join', userAuth, async (req, res) => {
  try {
    const project = await Project.findById(req.params.projectId);
    
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    // Check if user is already a member
    const isMember = project.members.some(m => m.user.toString() === req.user._id.toString());
    if (isMember) {
      return res.status(400).json({ message: 'You are already a member of this project' });
    }

    // Check if user has already requested
    const hasRequested = project.joinRequests.some(m => m.user.toString() === req.user._id.toString() && m.status === 'pending');
    if (hasRequested) {
      return res.status(400).json({ message: 'You have already requested to join this project' });
    }

    project.joinRequests.push({
      user: req.user._id,
      message: req.body.message || 'I would like to join this project.',
      status: 'pending'
    });

    await project.save();
    res.json({ message: 'Join request sent successfully', project });
  } catch (error) {
    res.status(500).json({ message: 'Error sending join request', error: error.message });
  }
});

// Respond to join request
projectRouter.post('/projects/:projectId/request/:requestId/respond', userAuth, async (req, res) => {
  try {
    const { action } = req.body; // 'accept' or 'reject'
    const project = await Project.findById(req.params.projectId);

    if (!project) return res.status(404).json({ message: 'Project not found' });
    if (project.owner.toString() !== req.user._id.toString()) return res.status(403).json({ message: 'Only owner can respond to requests' });

    const request = project.joinRequests.id(req.params.requestId);
    if (!request) return res.status(404).json({ message: 'Request not found' });

    if (action === 'accept') {
      request.status = 'accepted';
      const isAlreadyMember = project.members.some(m => m.user.toString() === request.user.toString());
      if (!isAlreadyMember) {
        project.members.push({ user: request.user, role: 'member' });
      }

      // Add user to project chat
      const chat = await Chat.findOne({ projectId: project._id });
      if (chat && !chat.participants.includes(request.user)) {
        chat.participants.push(request.user);
        await chat.save();
      }

    } else if (action === 'reject') {
      request.status = 'rejected';
    } else {
      return res.status(400).json({ message: 'Invalid action. Use accept or reject.' });
    }

    await project.save();
    
    // Return updated project with populated fields
    const updatedProject = await Project.findById(req.params.projectId)
      .populate('owner', 'firstName lastName photoUrl')
      .populate('members.user', 'firstName lastName photoUrl skills')
      .populate('joinRequests.user', 'firstName lastName photoUrl');

    res.json({ message: `Request ${action}ed successfully`, project: updatedProject });
  } catch (error) {
    res.status(500).json({ message: 'Error responding to request', error: error.message });
  }
});

module.exports = projectRouter;

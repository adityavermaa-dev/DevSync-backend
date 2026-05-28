const express = require('express');
const { userAuth } = require('../middlewares/auth');
const Project = require('../models/project');
const Chat = require('../models/chat');
const User = require('../models/user');
const Notification = require('../models/notification');
const { trackUserActivity } = require('../services/gamificationService');
const { getIO } = require('../services/socket');

const projectRouter = express.Router();

const addGithubProfile = (user) => {
  if (!user) {
    return user;
  }

  const plainUser = typeof user.toObject === 'function' ? user.toObject() : { ...user };

  return {
    ...plainUser,
    githubUrl: plainUser.githubUsername ? `https://github.com/${plainUser.githubUsername}` : null
  };
};

const addGithubProfilesToProject = (project) => {
  const plainProject = typeof project.toObject === 'function' ? project.toObject() : { ...project };

  return {
    ...plainProject,
    owner: addGithubProfile(plainProject.owner),
    members: Array.isArray(plainProject.members)
      ? plainProject.members.map((member) => ({
          ...member,
          user: addGithubProfile(member.user)
        }))
      : plainProject.members,
    joinRequests: Array.isArray(plainProject.joinRequests)
      ? plainProject.joinRequests.map((request) => ({
          ...request,
          user: addGithubProfile(request.user)
        }))
      : plainProject.joinRequests
  };
};

const emitNotificationToUser = (userId, notification) => {
  const io = getIO();

  if (!io || !userId) {
    return;
  }

  io.to(`user:${userId.toString()}`).emit('notification:new', notification);
};

projectRouter.get('/projects', userAuth, async (req, res) => {
  try {
    const projects = await Project.find({ status: 'Open' })
      .populate('owner', 'firstName lastName photoUrl githubUsername')
      .populate('members.user', 'firstName lastName photoUrl githubUsername')
      .sort({ createdAt: -1 });
    res.json(projects.map(addGithubProfilesToProject));
  } catch (error) {
    res.status(500).json({ message: 'Error fetching projects', error: error.message });
  }
});

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

projectRouter.get('/projects/:projectId', userAuth, async (req, res) => {
  try {
    const project = await Project.findById(req.params.projectId)
      .populate('owner', 'firstName lastName photoUrl githubUsername')
      .populate('members.user', 'firstName lastName photoUrl skills githubUsername')
      .populate('joinRequests.user', 'firstName lastName photoUrl githubUsername');
    
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }
    
    res.json(addGithubProfilesToProject(project));
  } catch (error) {
    res.status(500).json({ message: 'Error fetching project', error: error.message });
  }
});

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

projectRouter.post('/projects/:projectId/join', userAuth, async (req, res) => {
  try {
    const project = await Project.findById(req.params.projectId);
    
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    const isMember = project.members.some(m => m.user.toString() === req.user._id.toString());
    if (isMember) {
      return res.status(400).json({ message: 'You are already a member of this project' });
    }

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

    await Notification.create({
      recipient: project.owner,
      sender: req.user._id,
      type: 'projectJoinRequest',
      title: 'New Project Join Request',
      body: `${req.user.firstName} ${req.user.lastName || ''} wants to join ${project.title}.`.trim(),
      relatedEntity: project._id,
      relatedModel: null
    });

    emitNotificationToUser(project.owner, {
      recipient: project.owner,
      sender: req.user._id,
      type: 'projectJoinRequest',
      title: 'New Project Join Request',
      body: `${req.user.firstName} ${req.user.lastName || ''} wants to join ${project.title}.`.trim(),
      relatedEntity: project._id,
      relatedModel: null
    });

    res.json({ message: 'Join request sent successfully', project });
  } catch (error) {
    res.status(500).json({ message: 'Error sending join request', error: error.message });
  }
});

projectRouter.post('/projects/:projectId/request/:requestId/respond', userAuth, async (req, res) => {
  try {
    const { action } = req.body;
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

    await Notification.create({
      recipient: request.user,
      sender: req.user._id,
      type: 'projectInvite',
      title: `Project request ${action}ed`,
      body: `Your request to join ${project.title} was ${action}ed.`,
      relatedEntity: project._id,
      relatedModel: null
    });

    emitNotificationToUser(request.user, {
      recipient: request.user,
      sender: req.user._id,
      type: 'projectInvite',
      title: `Project request ${action}ed`,
      body: `Your request to join ${project.title} was ${action}ed.`,
      relatedEntity: project._id,
      relatedModel: null
    });
    
    const updatedProject = await Project.findById(req.params.projectId)
      .populate('owner', 'firstName lastName photoUrl githubUsername')
      .populate('members.user', 'firstName lastName photoUrl skills githubUsername')
      .populate('joinRequests.user', 'firstName lastName photoUrl githubUsername');

    res.json({ message: `Request ${action}ed successfully`, project: addGithubProfilesToProject(updatedProject) });
  } catch (error) {
    res.status(500).json({ message: 'Error responding to request', error: error.message });
  }
});

module.exports = projectRouter;

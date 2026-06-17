const express = require('express');
const { userAuth } = require('../middlewares/auth');
const Project = require('../models/project');
const User = require('../models/user');

const matchRouter = express.Router();

matchRouter.get('/matches/recommendations', userAuth, async (req, res) => {
  try {
    const user = req.user;
    const userSkills = user.skills || [];
    
    const allProjects = await Project.find({ status: 'Open' })
      .populate('owner', 'firstName lastName photoUrl coverPhotoUrl')
      .populate('members.user', 'firstName lastName photoUrl coverPhotoUrl')
      .lean();

    const matchedProjects = allProjects.filter(p => {
      if (p.owner._id.toString() === user._id.toString()) return false;
      if (p.members.some(m => m.user._id.toString() === user._id.toString())) return false;
      const techStack = p.techStack || [];
      return techStack.some(tech => userSkills.some(skill => skill.toLowerCase() === tech.toLowerCase()));
    }).map(p => {
        const score = p.techStack.filter(tech => userSkills.some(skill => skill.toLowerCase() === tech.toLowerCase())).length;
        return { ...p, matchScore: score };
    }).sort((a, b) => b.matchScore - a.matchScore).slice(0, 10);

    const allUsers = await User.find({ _id: { $ne: user._id } }).select('firstName lastName photoUrl coverPhotoUrl skills githubUsername').lean();
    
    const matchedDevelopers = allUsers.filter(u => {
        const uSkills = u.skills || [];
        return uSkills.some(tech => userSkills.some(skill => skill.toLowerCase() === tech.toLowerCase()));
    }).map(u => {
        const score = (u.skills || []).filter(tech => userSkills.some(skill => skill.toLowerCase() === tech.toLowerCase())).length;
        return { ...u, matchScore: score };
    }).sort((a, b) => b.matchScore - a.matchScore).slice(0, 10);

    res.json({
        matchedProjects,
        matchedDevelopers
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching matching recommendations', error: error.message });
  }
});

module.exports = matchRouter;

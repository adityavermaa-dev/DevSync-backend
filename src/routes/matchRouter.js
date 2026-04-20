const express = require('express');
const { userAuth } = require('../middlewares/auth');
const Project = require('../models/project');
const User = require('../models/user');

const matchRouter = express.Router();

// Get personalized matching recommendations
matchRouter.get('/matches/recommendations', userAuth, async (req, res) => {
  try {
    const user = req.user;
    const userSkills = user.skills || [];
    
    // 1. Find matched projects (Open projects where repo tech overlap with user skills)
    // We only recommend projects the user is not already a member of or owns
    const allProjects = await Project.find({ status: 'Open' })
      .populate('owner', 'firstName lastName photoUrl coverPhotoUrl')
      .populate('members.user', 'firstName lastName photoUrl coverPhotoUrl');

    const matchedProjects = allProjects.filter(p => {
      // exclude if user is owner
      if (p.owner._id.toString() === user._id.toString()) return false;
      // exclude if user is member
      if (p.members.some(m => m.user._id.toString() === user._id.toString())) return false;
      // Need at least 1 matching skill
      const techStack = p.techStack || [];
      return techStack.some(tech => userSkills.some(skill => skill.toLowerCase() === tech.toLowerCase()));
    }).map(p => {
        // Calculate score
        const score = p.techStack.filter(tech => userSkills.some(skill => skill.toLowerCase() === tech.toLowerCase())).length;
        return { ...p.toObject(), matchScore: score };
    }).sort((a, b) => b.matchScore - a.matchScore).slice(0, 10);

    // 2. Find matched developers (Users who share skills)
    const allUsers = await User.find({ _id: { $ne: user._id } }).select('firstName lastName photoUrl coverPhotoUrl skills githubUsername');
    
    const matchedDevelopers = allUsers.filter(u => {
        const uSkills = u.skills || [];
        return uSkills.some(tech => userSkills.some(skill => skill.toLowerCase() === tech.toLowerCase()));
    }).map(u => {
        // Calculate score
        const score = (u.skills || []).filter(tech => userSkills.some(skill => skill.toLowerCase() === tech.toLowerCase())).length;
        return { ...u.toObject(), matchScore: score };
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

const express = require('express');
const { userAuth } = require('../middlewares/auth');
const BuildLog = require('../models/buildLog');
const { trackUserActivity } = require('../services/gamificationService');

const buildLogRouter = express.Router();

// Get all build logs
buildLogRouter.get('/build-logs', userAuth, async (req, res) => {
  try {
    const logs = await BuildLog.find({})
      .populate('author', 'firstName lastName photoUrl githubUsername')
      .sort({ createdAt: -1 })
      .limit(50);
    res.json(logs);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching build logs', error: error.message });
  }
});

// Create build log
buildLogRouter.post('/build-logs', userAuth, async (req, res) => {
  try {
    const { title, content, tags } = req.body;
    if (!title || !content) return res.status(400).json({ message: 'Title and content required' });

    const newLog = new BuildLog({
      author: req.user._id,
      title,
      content,
      tags: tags || []
    });
    
    await newLog.save();

    await trackUserActivity(req.user._id);
    
    // Populate before returning
    const populatedLog = await BuildLog.findById(newLog._id)
        .populate('author', 'firstName lastName photoUrl githubUsername');
        
    res.status(201).json(populatedLog);
  } catch (error) {
    res.status(500).json({ message: 'Error creating build log', error: error.message });
  }
});

// Toggle Like
buildLogRouter.post('/build-logs/:id/like', userAuth, async (req, res) => {
  try {
    const log = await BuildLog.findById(req.params.id);
    if (!log) return res.status(404).json({ message: 'Build log not found' });

    const index = log.likes.indexOf(req.user._id);
    if (index === -1) {
      log.likes.push(req.user._id);
    } else {
      log.likes.splice(index, 1);
    }
    
    await log.save();
    res.json({ message: 'Like toggled', likes: log.likes });
  } catch (error) {
    res.status(500).json({ message: 'Error toggling like', error: error.message });
  }
});

// Delete build log
buildLogRouter.delete('/build-logs/:id', userAuth, async (req, res) => {
  try {
    const log = await BuildLog.findById(req.params.id);
    if (!log) return res.status(404).json({ message: 'Build log not found' });

    if (log.author.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    await BuildLog.findByIdAndDelete(req.params.id);
    res.json({ message: 'Build log deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting build log', error: error.message });
  }
});

module.exports = buildLogRouter;

const express = require('express');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const User = require('../models/User');
const { isAuthenticated } = require('../middleware/authMiddleware');

const router = express.Router();

// Multer setup for profile images
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'public/uploads');
  },
  filename: (req, file, cb) => {
    cb(null, req.session.user._id + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

// READ: Profile Page
router.get('/dashboard/profile', isAuthenticated, async (req, res) => {
  const user = await User.findById(req.session.user._id);
  res.render('profile/view', { user, success: null, error: null });
});

// UPDATE: Profile Info
router.post('/dashboard/profile', isAuthenticated, upload.single('profileImage'), async (req, res) => {
  try {
    const { fullName } = req.body;
    const user = await User.findById(req.session.user._id);

    user.fullName = fullName;

    if (req.file) {
      // Delete old profile picture if it exists and is not default
      if (user.profilePicture && user.profilePicture !== 'default.png') {
        const oldPath = path.join(__dirname, '../public/uploads/', user.profilePicture);
        fs.unlink(oldPath, err => {
          if (err) console.log('Old profile picture delete error:', err.message);
        });
      }

      // Save new profile picture
      user.profilePicture = req.file.filename;
    }

    await user.save();

    // Update session
    req.session.user = user;

    res.render('profile/view', { user, success: "Profile updated successfully!", error: null });
  } catch (err) {
    console.log(err);
    res.render('profile/view', { user: req.session.user, success: null, error: "Error updating profile." });
  }
});


// UPDATE: Change Password
router.post('/dashboard/profile/change-password', isAuthenticated, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const user = await User.findById(req.session.user._id);

  const match = await bcrypt.compare(currentPassword, user.password);
  if (!match) {
    return res.render('profile/view', { user, success: null, error: "Current password is incorrect." });
  }

  user.password = await bcrypt.hash(newPassword, 10);
  await user.save();

  res.render('profile/view', { user, success: "Password updated successfully!", error: null });
});

// DELETE: Remove Account
router.post('/dashboard/profile/delete', isAuthenticated, async (req, res) => {
  const user = await User.findById(req.session.user._id);

  if (user.profileImage && user.profileImage !== 'default.png') {
    try {
      fs.unlinkSync(path.join(__dirname, '../public/uploads/', user.profileImage));
    } catch (err) {
      console.log("Image delete error:", err.message);
    }
  }

  await User.findByIdAndDelete(user._id);
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

module.exports = router;

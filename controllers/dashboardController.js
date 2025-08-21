const Message = require('../models/Message');

exports.getStudentDashboard = async (req, res) => {
  try {
    const inboxCount = await Message.countDocuments({
      receiver: req.session.user._id,
      isRead: false
    });

    res.render('dashboard/student', {
      user: req.session.user,
      inboxCount // 👈 This makes inboxCount available in student.ejs
    });
  } catch (error) {
    console.error('Error loading student dashboard:', error);
    res.status(500).send('Server error');
  }
};

const User = require('../models/User');
const Subject = require('../models/Subject');
const Assignment = require('../models/Assignment');
const Grade = require('../models/Grade');

exports.getAdminDashboard = async (req, res) => {
  try {
    // Fetch total students dynamically
    const totalStudents = await User.countDocuments({ role: 'student' });

    // You can still keep other stats static if you want, no need to change them yet
    const activeCourses = 6;
    const assignmentsDue = 8;
    const pendingGrading = 23;

    // Render admin dashboard
    res.render('dashboard/admin', {
      user: req.session.user,
      totalStudents,
      activeCourses,
      assignmentsDue,
      pendingGrading
    });
  } catch (err) {
    console.error(err);
    res.render('dashboard/admin', {
      user: req.session.user,
      totalStudents: 0,
      activeCourses: 0,
      assignmentsDue: 0,
      pendingGrading: 0
    });
  }
};


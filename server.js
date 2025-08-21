const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const dotenv = require('dotenv');
const path = require('path');
const flash = require('connect-flash');
const http = require('http');
const socketIo = require('socket.io');

dotenv.config();
const app = express();

// Database
require('./config/db')();

// ✅ Import your Message model
const Message = require('./models/Message');

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');

// Sessions
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: process.env.MONGO_URI }),
}));

// Body parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(flash());

// Flash messages
app.use((req, res, next) => {
  res.locals.success_msg = req.flash('success_msg');
  res.locals.error_msg = req.flash('error_msg');
  next();
});

// Views
app.set('view engine', 'ejs');
app.set('views', './views');

// Routes
app.use('/', require('./routes/authRoutes'));
app.use('/uploads', express.static('uploads'));
const dashboardRoutes = require('./routes/dashboardRoutes');
app.use('/dashboard', dashboardRoutes);
const adminRoutes = require('./routes/adminRoutes');
app.use('/dashboard/admin', adminRoutes);
const studentRoutes = require('./routes/studentRoutes');
app.use('/dashboard/student', studentRoutes);
const teacherRoutes = require('./routes/teacherRoutes');
app.use('/dashboard/teacher', teacherRoutes);
const attendanceRoutes = require('./routes/attendanceRoutes');
app.use('/attendance', attendanceRoutes);
const gradeRoutes = require('./routes/gradeRoutes');
app.use('/', gradeRoutes);
const messageRoutes = require('./routes/messageRoutes');
app.use('/', messageRoutes);
app.use('/analytics', require('./routes/analyticsRoutes'));
const calendarRoutes = require('./routes/calendarRoutes');
app.use('/', calendarRoutes);
const profileRoutes = require('./routes/profileRoutes');
app.use('/', profileRoutes);


// ----------------- SOCKET.IO SETUP ----------------- //
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*" }});

// Track presence: userId -> Set of socketIds
const presence = new Map();

function broadcastStatus(userId, online) {
  io.emit('userStatus', { id: String(userId), online: !!online });
}

io.on('connection', (socket) => {
  // Register user and join personal room
  socket.on('registerUser', (userId) => {
    socket.userId = String(userId);
    socket.join(socket.userId);

    // presence add
    const set = presence.get(socket.userId) || new Set();
    set.add(socket.id);
    presence.set(socket.userId, set);

    broadcastStatus(socket.userId, true);
  });

  // Mark messages as read (you already had this)
  socket.on('markAsRead', async ({ userId, partnerId }) => {
    try {
      // If you use readAt (new model), update that. If you still use isRead, keep your version.
      const a = String(userId), b = String(partnerId);
      const conversationKey = a < b ? `${a}:${b}` : `${b}:${a}`;

      await Message.updateMany(
        { conversationKey, receiver: userId, readAt: { $exists: false } },
        { $set: { readAt: new Date() } }
      );

      // Clear badge for *this* user's other tabs and inform partner if needed
      io.to(String(userId)).emit('clearUnread', String(partnerId));
      io.to(String(partnerId)).emit('messagesRead', String(userId));
    } catch (err) {
      console.error('Error marking messages as read:', err);
    }
  });

  // OPTIONAL: direct socket message relay (you still persist via API)
  socket.on('chat message', async ({ senderId, receiverId, content }) => {
    try {
      // Persist to DB so history is consistent
      const msg = await Message.create({ sender: senderId, receiver: receiverId, content });
      const payload = {
        _id: String(msg._id),
        sender: String(senderId),
        receiver: String(receiverId),
        content: msg.content,
        createdAt: msg.createdAt
      };

      // Send only to sender and receiver rooms
      io.to(String(receiverId)).emit('receiveMessage', payload);
      io.to(String(senderId)).emit('receiveMessage', payload);
    } catch (err) {
      console.error('Error saving socket message:', err);
    }
  });

  // Typing indicators
  socket.on('typing', ({ sender, receiver }) => {
    io.to(String(receiver)).emit('typing', { sender: String(sender) });
  });

  socket.on('stopTyping', ({ sender, receiver }) => {
    io.to(String(receiver)).emit('stopTyping', { sender: String(sender) });
  });

  socket.on('disconnect', () => {
    const uid = socket.userId;
    if (uid) {
      const set = presence.get(uid);
      if (set) {
        set.delete(socket.id);
        if (set.size === 0) {
          presence.delete(uid);
          broadcastStatus(uid, false);
        } else {
          presence.set(uid, set);
        }
      }
    }
  });
});
// ---------------------------------------------------- //


const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT} 🚀`);
});

// controllers/messageController.js
const Message = require('../models/Message');
const User = require('../models/User');
const mongoose = require('mongoose');

let io = null;
try {
  const serverModule = require('../server'); // server.js must export { server, io }
  io = serverModule.io;
} catch (err) {
  io = null; // realtime will be gracefully skipped if io isn't available
}

// --- Legacy inbox/new/sent ---
exports.inbox = async (req, res) => {
  try {
    const userId = req.session.user._id;
    const messages = await Message.find({ receiver: userId })
      .populate('sender', 'fullName profilePicture')
      .sort({ createdAt: -1 })
      .lean();
    return res.render('messages/inbox', { user: req.session.user, messages });
  } catch (err) {
    console.error('inbox error', err);
    return res.status(500).send('Server error');
  }
};

exports.newMessageForm = async (req, res) => {
  try {
    const users = await User.find({ _id: { $ne: req.session.user._id } }, 'fullName role profilePicture').lean();
    return res.render('messages/new', { user: req.session.user, users });
  } catch (err) {
    console.error('newMessageForm error', err);
    return res.status(500).send('Server error');
  }
};

exports.sendMessage = async (req, res) => {
  try {
    const { receiver, content } = req.body;
    if (!receiver || !content) {
      req.flash && req.flash('error', 'Receiver and message are required.');
      return res.redirect('/messages/new');
    }

    const msg = await Message.create({
      sender: req.session.user._id,
      receiver,
      content
    });

    if (io) {
      try {
        io.to(String(receiver)).emit('receiveMessage', {
          _id: msg._id,
          sender: String(req.session.user._id),
          receiver: String(receiver),
          content: msg.content,
          createdAt: msg.createdAt || msg.sentAt
        });
      } catch (e) { console.warn('emit error (sendMessage)', e); }
    }

    return res.redirect('/messages');
  } catch (err) {
    console.error('sendMessage error', err);
    return res.status(500).send('Server error');
  }
};

exports.sentMessages = async (req, res) => {
  try {
    const userId = req.session.user._id;
    const sent = await Message.find({ sender: userId })
      .populate('receiver', 'fullName profilePicture')
      .sort({ createdAt: -1 })
      .lean();
    return res.render('messages/sent', { user: req.session.user, sent });
  } catch (err) {
    console.error('sentMessages error', err);
    return res.status(500).send('Server error');
  }
};

exports.getStudentDashboard = async (req, res) => {
  try {
    const inboxCount = await Message.countDocuments({
      receiver: req.session.user._id,
      readAt: { $exists: false }
    });
    return res.render('dashboard/student', { inboxCount, user: req.session.user });
  } catch (err) {
    console.error('getStudentDashboard error', err);
    return res.status(500).send('Server error');
  }
};

/* ---------- WhatsApp-style functions ---------- */

exports.chatListPage = async (req, res) => {
  try {
    const me = req.session.user._id;

    // Get last message per conversation
    const lastPerConvo = await Message.aggregate([
      { $match: { $or: [{ sender: new mongoose.Types.ObjectId(me) }, { receiver: new mongoose.Types.ObjectId(me) }] } },
      { $sort: { createdAt: -1 } },
      { $group: { _id: '$conversationKey', lastMessage: { $first: '$$ROOT' } } },
      { $sort: { 'lastMessage.createdAt': -1 } },
      { $limit: 200 }
    ]);

    const partnerIds = lastPerConvo.map(x => {
      const lm = x.lastMessage;
      return String(lm.sender) === String(me) ? String(lm.receiver) : String(lm.sender);
    });

    const partners = await User.find({ _id: { $in: partnerIds } }, 'fullName profilePicture role').lean();
    const partnerMap = new Map(partners.map(p => [String(p._id), p]));

    // Unread count per partner
    const unreadRaw = await Message.aggregate([
      { $match: { receiver: new mongoose.Types.ObjectId(me), readAt: { $exists: false } } },
      { $group: { _id: '$sender', count: { $sum: 1 } } }
    ]);
    const unreadMap = new Map(unreadRaw.map(u => [String(u._id), u.count]));

    const chats = lastPerConvo.map(x => {
      const lm = x.lastMessage;
      const partnerId = String(lm.sender) === String(me) ? String(lm.receiver) : String(lm.sender);
      return {
        partner: partnerMap.get(partnerId) || null,
        partnerId,
        lastMessage: lm.content,
        lastAt: lm.createdAt || lm.sentAt,
        unreadCount: unreadMap.get(partnerId) || 0
      };
    });

    const allUsers = await User.find({ _id: { $ne: me } }, 'fullName role profilePicture').lean();

    // <- Replace old render with premium chatApp
    return res.render('messages/chatApp', { user: req.session.user, chats, allUsers });
  } catch (err) {
    console.error('chatListPage error', err);
    return res.status(500).send('Server error');
  }
};


// Chat conversation view
exports.chatPage = async (req, res) => {
  try {
    const me = req.session.user._id;
    const partnerId = req.params.partnerId;
    if (!partnerId) return res.status(400).send('partnerId required');

    const a = String(me), b = String(partnerId);
    const conversationKey = a < b ? `${a}:${b}` : `${b}:${a}`;

    const partner = await User.findById(partnerId, 'fullName profilePicture role').lean();
    if (!partner) return res.status(404).send('User not found');

    const messages = await Message.find({ conversationKey }).sort({ createdAt: 1 }).lean();

    return res.render('messages/chat', { user: req.session.user, partner, partnerId, messages });
  } catch (err) {
    console.error('chatPage error', err);
    return res.status(500).send('Server error');
  }
};

// JSON send endpoint
exports.apiSendMessage = async (req, res) => {
  try {
    const me = req.session.user._id;
    const { receiver, content } = req.body;
    if (!receiver || !content) return res.status(400).json({ error: 'receiver and content required' });

    const msg = await Message.create({ sender: me, receiver, content });

    if (io) {
      try {
        io.to(String(receiver)).emit('receiveMessage', {
          _id: msg._id,
          sender: String(me),
          receiver: String(receiver),
          content: msg.content,
          createdAt: msg.createdAt || msg.sentAt
        });
      } catch (e) { console.warn('emit error (apiSendMessage)', e); }
    }

    return res.json({
      ok: true,
      message: {
        _id: msg._id,
        sender: String(me),
        receiver: String(receiver),
        content: msg.content,
        createdAt: msg.createdAt || msg.sentAt
      }
    });
  } catch (err) {
    console.error('apiSendMessage error', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

// Mark conversation messages as read
exports.apiMarkRead = async (req, res) => {
  try {
    const me = req.session.user._id;
    const { partnerId } = req.body;
    if (!partnerId) return res.status(400).json({ error: 'partnerId required' });

    const a = String(me), b = String(partnerId);
    const conversationKey = a < b ? `${a}:${b}` : `${b}:${a}`;

    const now = new Date();
    await Message.updateMany(
      { conversationKey, receiver: me, readAt: { $exists: false } },
      { $set: { readAt: now } }
    );

    return res.json({ ok: true });
  } catch (err) {
    console.error('apiMarkRead error', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

exports.apiGetHistory = async (req, res) => {
  try {
    const me = req.session.user._id;
    const { partnerId, limit = 200 } = req.body;
    if (!partnerId) return res.status(400).json({ error: 'partnerId required' });

    const a = String(me), b = String(partnerId);
    const conversationKey = a < b ? `${a}:${b}` : `${b}:${a}`;

    const messages = await Message.find({ conversationKey })
      .sort({ createdAt: 1 })
      .limit(Number(limit))
      .lean();

    return res.json({ ok: true, messages });
  } catch (err) {
    console.error('apiGetHistory error', err);
    return res.status(500).json({ error: 'Server error' });
  }
};


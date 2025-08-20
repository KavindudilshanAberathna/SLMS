// routes/messageRoutes.js
const express = require('express');
const router = express.Router();
const { isAuthenticated } = require('../middleware/authMiddleware');
const messageController = require('../controllers/messageController');

// --- Legacy inbox/new/sent endpoints ---
router.get('/messages', isAuthenticated, messageController.inbox);
router.get('/messages/new', isAuthenticated, messageController.newMessageForm);
router.post('/messages', isAuthenticated, messageController.sendMessage);
router.get('/messages/sent', isAuthenticated, messageController.sentMessages);

// --- WhatsApp-style chat routes ---
router.get('/chat', isAuthenticated, messageController.chatListPage);           // Chats list page
router.get('/chat/:partnerId', isAuthenticated, messageController.chatPage);
router.post('/messages/send', isAuthenticated, messageController.sendMessage);


// --- JSON APIs used by chat UI ---
router.post('/messages/api/send', isAuthenticated, messageController.apiSendMessage);  // Send message via API
router.post('/messages/api/read', isAuthenticated, messageController.apiMarkRead);    // Mark messages as read
router.post('/messages/api/history', isAuthenticated, messageController.apiGetHistory);


module.exports = router;
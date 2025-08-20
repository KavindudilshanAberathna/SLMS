// models/Message.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

const messageSchema = new Schema({
  sender:   { type: Schema.Types.ObjectId, ref: 'User', required: true },
  receiver: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  content:  { type: String, required: true },

  // timestamps for delivery/read states
  deliveredAt: { type: Date },
  readAt:      { type: Date },

  // conversation key: sorted pair to group messages between two users
  conversationKey: { type: String, index: true },

  // legacy compatibility
  sentAt: { type: Date, default: Date.now }
}, { timestamps: true });

messageSchema.pre('save', function(next) {
  try {
    const a = String(this.sender);
    const b = String(this.receiver);
    this.conversationKey = a < b ? `${a}:${b}` : `${b}:${a}`;
    if (!this.sentAt) this.sentAt = new Date();
    next();
  } catch (err) {
    next(err);
  }
});

messageSchema.index({ conversationKey: 1, createdAt: 1 });

module.exports = mongoose.model('Message', messageSchema);

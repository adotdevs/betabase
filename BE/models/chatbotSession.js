const mongoose = require("mongoose");

const chatbotSessionSchema = new mongoose.Schema({
  sessionId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null
  },
  threadId: {
    type: String, // OpenAI Assistant thread ID
    default: null
  },
  messageCount: {
    type: Number,
    default: 0
  },
  lastActivity: {
    type: Date,
    default: Date.now
  },
  userAgent: {
    type: String,
    default: null
  },
  referrer: {
    type: String,
    default: null
  },
  url: {
    type: String,
    default: null
  },
  ipAddress: {
    type: String,
    default: null
  },
  emailSent: {
    type: Boolean,
    default: false
  },
  emailSentAt: {
    type: Date,
    default: null
  },
  useWidgetAssistant: {
    type: Boolean,
    default: false // false = use default assistant, true = use widget assistant
  }
}, {
  timestamps: true
});

// Index for cleanup queries
chatbotSessionSchema.index({ lastActivity: 1 });
chatbotSessionSchema.index({ createdAt: 1 });

module.exports = mongoose.model("ChatbotSession", chatbotSessionSchema);

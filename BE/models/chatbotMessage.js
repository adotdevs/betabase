const mongoose = require("mongoose");

const chatbotMessageSchema = new mongoose.Schema({
  sessionId: {
    type: String,
    required: true,
    index: true
  },
  content: {
    type: String,
    required: true
  },
  role: {
    type: String,
    enum: ['user', 'assistant'],
    required: true
  },
  isBot: {
    type: Boolean,
    default: false
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null
  }
}, {
  timestamps: true
});

// Index for efficient querying
chatbotMessageSchema.index({ sessionId: 1, timestamp: 1 });

module.exports = mongoose.model("ChatbotMessage", chatbotMessageSchema);

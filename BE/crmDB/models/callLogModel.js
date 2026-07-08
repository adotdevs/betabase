// models/CallLog.js
const mongoose = require("mongoose");
const connectCRMDatabase = require("../../config/crmDatabase");

const callLogSchema = new mongoose.Schema({
  leadId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Lead",
    required: true,
    index: true
  },
  agentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true
  },
  phoneNumber: {
    type: String,
    required: true
  },
  callSid: {
    type: String,
    unique: true,
    sparse: true
  },
  direction: {
    type: String,
    enum: ["outbound", "inbound"],
    default: "outbound"
  },
  status: {
    type: String,
    enum: ["initiated", "ringing", "in-progress", "completed", "failed", "busy", "no-answer", "canceled"],
    default: "initiated"
  },
  duration: {
    type: Number,
    default: 0 // in seconds
  },
  recordingUrl: {
    type: String
  },
  transcription: {
    type: String
  },
  voice: {
    type: String,
    enum: ["alloy", "echo", "fable", "onyx", "nova", "shimmer"],
    default: "alloy"
  },
  notes: {
    type: String
  },
  cost: {
    type: Number,
    default: 0
  },
  errorMessage: {
    type: String
  },
  startedAt: {
    type: Date
  },
  endedAt: {
    type: Date
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
callLogSchema.index({ leadId: 1, createdAt: -1 });
callLogSchema.index({ agentId: 1, createdAt: -1 });
callLogSchema.index({ status: 1 });
callLogSchema.index({ callSid: 1 });

const getCallLogModel = async () => {
  const crmDB = await connectCRMDatabase();
  return crmDB.model("CallLog", callLogSchema);
};

module.exports = getCallLogModel;
module.exports.getCallLogModel = getCallLogModel;


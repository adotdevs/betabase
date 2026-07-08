const mongoose = require('mongoose');
const connectCRMDatabase = require('../../config/crmDatabase');

const callSchema = new mongoose.Schema({
    leadId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Lead',
        required: true,
        index: true
    },
    sessionId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    phoneNumber: {
        type: String,
        required: true
    },
    status: {
        type: String,
        enum: ['scheduled', 'initiating', 'ringing', 'in-progress', 'completed', 'failed', 'no-answer', 'cancelled'],
        default: 'scheduled',
        index: true
    },
    callType: {
        type: String,
        enum: ['manual', 'automatic', 'scheduled'],
        default: 'manual'
    },
    duration: {
        type: Number, // seconds
        default: 0
    },
    startedAt: {
        type: Date
    },
    endedAt: {
        type: Date
    },
    // High-level termination metadata for quick access in listings
    endedReason: {
        type: String // e.g. 'assistant-ended-call', 'customer-did-not-answer'
    },
    // Call back flag - extracted from structured outputs (appointment booked)
    callBack: {
        type: Boolean,
        default: false,
        index: true // Index for filtering
    },
    scheduledAt: {
        type: Date // for scheduled calls
    },
    initiatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User', // Reference to User model (admin who initiated the call)
        default: null
    },
    summary: {
        type: String // GPT-generated call summary
    },
    transcript: {
        type: String // full conversation transcript
    },
    summaryFileUrl: {
        type: String // path to summary JSON/TXT
    },
    metadata: {
        turns: Number,
        context: mongoose.Schema.Types.Mixed,
        sentiment: String,
        keyPoints: [String],
        nextAction: String,
        voipSessionId: String, // Store VoIP sessionId (SIP Call-ID) for reference
        sipStatus: {
            code: mongoose.Schema.Types.Mixed, // Can be Number (100, 180, 183, 200) or String ('BYE')
            message: String, // "Session Progress", "OK", "BYE"
            receivedAt: Date
        },
        // Allow legacy string payloads as well as new object structure
        sipEvents: [mongoose.Schema.Types.Mixed]
    },
    activeCallTime: {
        type: Number, // seconds - time from answered to ended
        default: 0
    },
    // Last error message for this call (if any)
    error: {
        type: String
    },
    logs: [
        {
            type: { type: String },
            message: String,
            timestamp: { type: Date, default: Date.now },
            data: mongoose.Schema.Types.Mixed,
        }
    ],
    ringingTime: {
        type: Number, // seconds - time from start to answered
        default: 0
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Update updatedAt on save
callSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    next();
});

// Create indexes for better performance
callSchema.index({ leadId: 1, createdAt: -1 }); // For fetching calls by lead
callSchema.index({ status: 1, scheduledAt: 1 }); // For scheduled calls cron
callSchema.index({ sessionId: 1 }); // For quick lookup by session
callSchema.index({ status: 1, leadId: 1, endedAt: -1 }); // For completed/failed calls list sorted by endedAt

// Ensure the correct schema is in use – if an older version of the model
// (where `metadata.sipEvents` was typed as [String]) is already registered
// in this connection, remove it and re-compile with the fixed definition.

const needsRecompile = (connection) => {
  if (!connection.models.Call) return false;
  const sipEventsPath = connection.models.Call.schema.path('metadata.sipEvents');
  const logsPath = connection.models.Call.schema.path('logs');

  const sipEventsOutdated =
    sipEventsPath &&
    sipEventsPath.instance === 'Array' &&
    sipEventsPath.$embeddedSchemaType &&
    sipEventsPath.$embeddedSchemaType.instance === 'String';

  // Check if logs schema is outdated (String array) or missing proper structure
  const logsOutdated =
    logsPath &&
    logsPath.instance === 'Array' &&
    logsPath.$embeddedSchemaType &&
    logsPath.$embeddedSchemaType.instance === 'String';

  // Also check if logs schema is missing the proper object structure
  const logsMissingStructure =
    logsPath &&
    logsPath.instance === 'Array' &&
    (!logsPath.$embeddedSchemaType || 
     !logsPath.$embeddedSchemaType.schema || 
     !logsPath.$embeddedSchemaType.schema.path('type'));

  return sipEventsOutdated || logsOutdated || logsMissingStructure;
};

const getCallModel = async () => {
  const crmDB = await connectCRMDatabase();

  // Hot-swap model if an outdated definition is already cached
  if (needsRecompile(crmDB)) {
    delete crmDB.models.Call;
  }

  return crmDB.models.Call || crmDB.model('Call', callSchema);
};

module.exports = getCallModel;
module.exports.getCallModel = getCallModel;


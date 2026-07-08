const app = require("./app");
const User = require('./models/userModel');
const PendingActivationEmail = require('./models/pendingActivationEmail');
const FailedEmail = require('./models/failedEmail');
const sendEmail = require('./utils/sendEmail');
const cron = require('node-cron');
var bodyParser = require("body-parser");
const { errorMiddleware } = require("./middlewares/errorMiddleware");

// Add request logging at the very beginning (before any middleware)
app.use((req, res, next) => {
    if (req.url.includes('/crm/uploadLeads') && req.method === 'POST') {
        console.log('🚀 [SERVER.JS] Request received at server level:', {
            method: req.method,
            url: req.url,
            contentType: req.headers['content-type'],
            contentLength: req.headers['content-length'],
            contentLengthMB: req.headers['content-length'] ? (parseInt(req.headers['content-length']) / (1024 * 1024)).toFixed(2) + 'MB' : 'unknown',
            host: req.headers.host,
            remoteAddress: req.socket.remoteAddress,
            timestamp: new Date().toISOString()
        });
    }
    next();
});

// Database connect
// NOTE: bodyParser is already configured in app.js with 50MB limit
// REMOVED: app.use(bodyParser.urlencoded({ extended: true }));
// This was causing issues because it had no limit (defaults to 100kb) and was overriding app.js settings
// All body-parser configuration is now in app.js with proper 50MB limits
const database = require("./config/database");
database();

// Initialize CRM database connection at startup
const connectCRMDatabase = require("./config/crmDatabase");
(async () => {
  try {
    await connectCRMDatabase();
    console.log("✅ CRM Database initialized at startup");
  } catch (error) {
    console.error("❌ Failed to initialize CRM Database at startup:", error.message);
    // Don't exit - let it retry on first use
  }
})();

const cloudinary = require("cloudinary");
const http = require('http');
const { Server } = require('socket.io');

app.get("/", async (req, res) => {
  res.send("working");
}); 
cloudinary.v2.config({
  cloud_name: process.env.CLOUDINARY_CLIENT_NAME,
  api_key: process.env.CLOUDINARY_CLIENT_API,
  api_secret: process.env.CLOUDINARY_CLIENT_SECRET,
});

app.use(errorMiddleware);

// User online status checker
setInterval(async () => {
  const threeMinutesAgo = new Date(Date.now() - 3 * 60 * 1000);

  await User.updateMany(
    { lastActivity: { $lt: threeMinutesAgo }, online: true },
    { $set: { online: false, lastOnline: new Date() } }
  ); 
}, 60 * 1000); // Check every 1 minute

// Start server
let PORT = process.env.SERVER_PORT || 4006;
let server = app.listen(PORT, () => {
  console.log(`server is running at ${PORT}`);
});

// ✅ Setup Socket.io for real-time email queue updates
const io = new Server(server, {
  cors: {
    origin: process.env.BASE_URL || "http://localhost:3000",
    credentials: true
  }
});

// Socket.io connection
 

// Make io available globally for emitting events
global.io = io;

// Initialize VoIP agent
const WebRTCVoiceAgent = require('./voip/webrtcVoiceAgent');
const { updateCallStatusInternal, addToCallQueue, getQueueStatus, processCallQueue } = require('./controllers/callController');
let voipAgent = null;
try {
    voipAgent = new WebRTCVoiceAgent();
    global.voipAgent = voipAgent;
    // Make updateCallStatus available globally for VoIP agent
    global.updateCallStatusInternal = updateCallStatusInternal;
    console.log('✅ VoIP agent initialized successfully');
} catch (error) {
    console.error('❌ Failed to initialize VoIP agent:', error);
    console.error('   VoIP calling features will not be available');
}

// ✅ Background Email Queue Processor (runs automatically)
const processEmailQueue = async () => {
  try {
    // Get pending emails (limit to prevent overload)
    const pendingEmails = await PendingActivationEmail.find({
      status: 'pending'
    }).limit(50).lean();

    if (pendingEmails.length === 0) {
      // No pending emails - check for stuck processing ones
      const stuckProcessing = await PendingActivationEmail.find({ status: 'processing' });
      if (stuckProcessing.length > 0) {
        console.log(`⚠️ Found ${stuckProcessing.length} emails stuck in processing - resetting to pending`);
        await PendingActivationEmail.updateMany(
          { status: 'processing' },
          { status: 'pending' }
        );
      }
      return;
    }

    console.log(`📤 [WORKER] Processing ${pendingEmails.length} pending emails...`);
    
    let sentCount = 0;
    let failedCount = 0;

    for (const pending of pendingEmails) {
      console.log(`\n📧 [${sentCount + failedCount + 1}/${pendingEmails.length}] Processing: ${pending.email}`);
      
      // ✅ Declare emailMessage and attempt counter OUTSIDE try-catch so accessible in both blocks
      const emailSubject = 'Account Activated - Login Credentials';
      const emailMessage = `
Hello ${pending.firstName} ${pending.lastName},

Your account has been activated!

Login Credentials:
Email: ${pending.email}
Password: ${pending.password}

Please login and change your password.

Best regards,
Admin Team
      `;
      
      let currentAttempts = pending.attempts || 0;
      
      try {
        console.log(`   ├─ Step 1: Marking as processing...`);
        // Mark as processing
        const updated = await PendingActivationEmail.findByIdAndUpdate(
          pending._id, 
          {
            status: 'processing',
            lastAttempt: new Date(),
            $inc: { attempts: 1 }
          },
          { new: true }
        );
        
        if (!updated) {
          console.error(`   ├─ ❌ Failed to update status (email might have been processed already)`);
          continue;
        }
        
        currentAttempts = updated.attempts;  // ✅ Store attempts for use in catch block
        console.log(`   ├─ Step 2: Status marked as processing (attempt #${currentAttempts})`);
        console.log(`   ├─ Step 3: Sending email...`);
        
        // ✅ sendEmail expects: (email, subject, text) - not an object!
        await sendEmail(
          pending.email,
          emailSubject,
          emailMessage
        );

        console.log(`   ├─ Step 4: Email sent successfully! ✅`);
        
        // Success - remove from pending
        console.log(`   ├─ Step 5: Removing from pending queue...`);
        const deleted = await PendingActivationEmail.deleteOne({ _id: pending._id });
        
        if (deleted.deletedCount === 0) {
          console.error(`   ├─ ⚠️ Warning: Email not found in queue (might have been deleted already)`);
        } else {
          console.log(`   └─ ✅ Email removed from queue`);
        }
        
        sentCount++;

        // Emit socket event for real-time update
        if (global.io) {
          const queueStatus = await getEmailQueueStatusData();
          global.io.emit('emailQueueUpdate', queueStatus);
          console.log(`   └─ 📡 Socket.io update emitted (pending: ${queueStatus.pending}, failed: ${queueStatus.failed})`);
        }

      } catch (error) {
        failedCount++;
        
        console.log(`   ├─ ❌ Error occurred while sending email`);
        
        // Extract detailed error message
        let errorMessage = 'Unknown error';
        if (error.message) {
          errorMessage = error.message;
        } else if (error.response?.data?.message) {
          errorMessage = error.response.data.message;
        } else if (error.response?.data) {
          errorMessage = JSON.stringify(error.response.data);
        } else if (typeof error === 'string') {
          errorMessage = error;
        } else if (error.code) {
          errorMessage = `Error code: ${error.code}`;
        }
        
        console.error(`   ├─ Error message: ${errorMessage}`);
        console.error(`   ├─ Error code: ${error.code}`);
        console.error(`   ├─ Full error:`, error);
        
        console.log(`   ├─ Step 6: Moving to failed emails collection...`);
        
        try {
          // Move to failed emails collection with ALL required fields matching the schema
          const failedEmailData = {
            email: pending.email,
            subject: emailSubject,  // ✅ Required - now accessible from outer scope
            text: emailMessage,  // ✅ Required - now accessible from outer scope
            leadName: `${pending.firstName} ${pending.lastName}`,
            failureReason: errorMessage,
            errorType: error.code === 'EAUTH' || errorMessage.includes('authentication') || errorMessage.includes('rate limit') 
                        ? 'authentication' 
                        : errorMessage.includes('timeout') 
                        ? 'timeout' 
                        : errorMessage.includes('quota')
                        ? 'quota_exceeded'
                        : 'other',
            retryCount: currentAttempts,  // ✅ Use variable from outer scope
            lastRetryAt: new Date(),
            status: 'pending',
            userId: pending.userId,
            activationSessionId: ''
          };
          
          console.log(`   ├─ Creating failed email with data:`, JSON.stringify({
            email: failedEmailData.email,
            subject: failedEmailData.subject ? 'present' : 'missing',
            text: failedEmailData.text ? `${failedEmailData.text.substring(0, 50)}...` : 'missing',
            errorType: failedEmailData.errorType,
            retryCount: failedEmailData.retryCount
          }));
          
          const failedEmail = await FailedEmail.create(failedEmailData);
          
          console.log(`   ├─ ✅ Added to failed emails collection (ID: ${failedEmail._id})`);

          // Remove from pending
          console.log(`   ├─ Step 7: Removing from pending queue...`);
          await PendingActivationEmail.deleteOne({ _id: pending._id });
          console.log(`   └─ ✅ Removed from pending queue`);

          // Emit socket event
          if (global.io) {
            const queueStatus = await getEmailQueueStatusData();
            global.io.emit('emailQueueUpdate', queueStatus);
            console.log(`   └─ 📡 Socket.io update emitted (failed count: ${queueStatus.failed})`);
          }
        } catch (cleanupError) {
          console.error(`   └─ ❌ ERROR during cleanup:`, cleanupError);
          // Even if cleanup fails, try to remove from pending to prevent infinite loop
          try {
            await PendingActivationEmail.deleteOne({ _id: pending._id });
            console.log(`   └─ ⚠️ Force removed from pending queue to prevent stuck state`);
          } catch (forceDeleteError) {
            console.error(`   └─ 💥 CRITICAL: Cannot remove from pending queue:`, forceDeleteError);
          }
        }
      }

      // Small delay to prevent rate limiting (100ms between emails)
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    if (sentCount > 0 || failedCount > 0) {
      console.log(`\n✅ [WORKER] Batch complete: ${sentCount} sent, ${failedCount} failed`);
    }

  } catch (error) {
    console.error('❌ [WORKER] Error processing email queue:', error);
  }
};

// Helper function to get queue status data
const getEmailQueueStatusData = async () => {
  const pendingCount = await PendingActivationEmail.countDocuments({ status: 'pending' });
  const processingCount = await PendingActivationEmail.countDocuments({ status: 'processing' });
  const failedCount = await FailedEmail.countDocuments();
  
  return {
    pending: pendingCount,
    processing: processingCount,
    failed: failedCount,
    total: pendingCount + processingCount,
    timestamp: new Date()
  };
};

// ✅ Cleanup stuck 'retrying' statuses on server startup
(async () => {
  try {
    const result = await FailedEmail.updateMany(
      { status: 'retrying' },
      { $set: { status: 'pending' } }
    );
    
    if (result.modifiedCount > 0) {
      console.log(`\n🧹 Reset ${result.modifiedCount} stuck 'retrying' status(es) to 'pending'\n`);
    }
  } catch (err) {
    console.error('❌ Error resetting stuck retrying statuses:', err);
  }
})();

// ✅ Start background email queue processor (runs every 30 seconds)
console.log('\n📧 ========================================');
console.log('📧 Starting background email queue processor...');
console.log('📧 ========================================\n');

// Show initial queue status
getEmailQueueStatusData().then(status => {
  console.log('📊 Initial queue status:');
  console.log(`   ├─ Pending: ${status.pending}`);
  console.log(`   ├─ Processing: ${status.processing}`);
  console.log(`   ├─ Failed: ${status.failed}`);
  console.log(`   └─ Total: ${status.total}\n`);
}).catch(err => {
  console.error('❌ Error getting initial status:', err);
});

setInterval(processEmailQueue, 30000); // Every 30 seconds

// Run once immediately on startup
processEmailQueue().then(() => {
  console.log('\n📧 ========================================');
  console.log('📧 Initial email queue check complete');
  console.log('📧 Worker will run every 30 seconds');
  console.log('📧 ========================================\n');
}).catch(err => {
  console.error('❌ Error in initial email queue check:', err);
});

// ✅ Cron job: Delete 'sent' emails older than 10 days (runs daily at midnight)
// Scheduled calls cron job - check every minute
// IMPORTANT: This cron job only adds scheduled calls to the queue
// It does NOT directly initiate calls to prevent conflicts with active calls
cron.schedule('* * * * *', async () => {
    try {
        if (!global.voipAgent) return;
        
        // ✅ CRITICAL: Check if queue is paused - don't add any calls if paused
        const queueStatus = getQueueStatus();
        if (queueStatus.isPaused) {
            // Queue is paused - don't add any calls, just return silently
            return;
        }
        
        const getCallModel = require('./crmDB/models/callModel');
        const Call = await getCallModel();
        
        // Find scheduled calls that should be executed now
        const now = new Date();
        const scheduledCalls = await Call.find({
            status: 'scheduled',
            scheduledAt: { $lte: now }
        }).limit(10); // Process max 10 at a time
        
        if (scheduledCalls.length === 0) return;
        
        console.log(`⏰ [CRON] Found ${scheduledCalls.length} scheduled calls ready to process`);
        
        for (const call of scheduledCalls) {
            try {
                // Skip if call is already being processed (ringing, in-progress) or completed/failed
                if (call.status !== 'scheduled') {
                    console.log(`⚠️ [CRON] Call ${call._id} is not in scheduled status (${call.status}), skipping...`);
                    continue;
                }
                
                // Check if call is already in queue or being processed
                const alreadyProcessing = await Call.findOne({
                    _id: call._id,
                    status: { $in: ['ringing', 'in-progress'] }
                });
                
                if (alreadyProcessing) {
                    console.log(`⚠️ [CRON] Call ${call._id} is already being processed (${alreadyProcessing.status}), skipping...`);
                    continue;
                }
                
                // Check if there's already an active call
                const activeCall = await Call.findOne({
                    _id: { $ne: call._id },
                    status: { $in: ['initiating', 'ringing', 'in-progress'] }
                });
                
                const hasActiveCall = !!(await Call.findOne({
                    _id: { $ne: call._id },
                    status: { $in: ['initiating', 'ringing', 'in-progress'] }
                }));
                
                // Use the imported function to add to queue (with deduplication)
                const added = addToCallQueue({
                    callId: call._id.toString(),
                    leadId: call.leadId,
                    phoneNumber: call.phoneNumber,
                    delay: 0, // No delay for scheduled calls
                    total: 1,
                    completed: 0
                });
                
                if (!added) {
                    // Call is already in queue – avoid noisy duplicate logs
                    continue;
                }
                
                // Only log when we actually enqueue the call
                if (hasActiveCall) {
                    console.log(`⏳ [CRON] Active call exists, scheduled call ${call._id} queued and will wait in queue`);
                } else {
                    console.log(`📅 [CRON] Scheduled call ${call._id} added to queue`);
                }
                
                // Get queue status to check if processing (but only if not paused)
                const currentQueueStatus = getQueueStatus();
                if (!currentQueueStatus.isProcessingQueue && !currentQueueStatus.isPaused) {
                    processCallQueue().catch(err => {
                        console.error('❌ [CRON] Error starting queue processing:', err);
                    });
                }
                
            } catch (error) {
                console.error(`❌ [CRON] Error processing scheduled call ${call._id}:`, error);
            }
        }
        
    } catch (error) {
        console.error('❌ [CRON] Error in scheduled calls cron:', error);
    }
});

// ✅ CRON job: Clean up stuck calls (runs every 5 minutes)
// This fixes calls that are stuck in "in-progress" status but have actually completed
cron.schedule('*/5 * * * *', async () => {
    try {
        if (!global.voipAgent) return;
        
        const getCallModel = require('./crmDB/models/callModel');
        const Call = await getCallModel();
        
        // Find calls stuck in "in-progress" or "ringing" for more than 10 minutes
        const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
        const stuckCalls = await Call.find({
            status: { $in: ['in-progress', 'ringing'] },
            startedAt: { $lt: tenMinutesAgo }
        }).limit(50); // Process max 50 at a time
        
        if (stuckCalls.length === 0) return;
        
        console.log(`🧹 [CLEANUP] Found ${stuckCalls.length} potentially stuck calls, checking Vapi status...`);
        
        for (const call of stuckCalls) {
            try {
                // Check if call has a Vapi call ID
                const vapiCallId = call.sessionId || call.metadata?.vapiCallId;
                
                if (vapiCallId && global.voipAgent && global.voipAgent.vapi) {
                    try {
                        // Check actual Vapi status
                        const vapiStatus = await global.voipAgent.vapi.getCallStatus(vapiCallId);
                        const actualStatus = vapiStatus.status || vapiStatus.state;
                        
                        // If Vapi says call ended but CRM still shows in-progress, fix it
                        if ((actualStatus === 'ended' || actualStatus === 'failed' || actualStatus === 'cancelled') && 
                            (call.status === 'in-progress' || call.status === 'ringing')) {
                            
                            console.log(`🔧 [CLEANUP] Fixing stuck call ${call._id}: Vapi status is ${actualStatus}, CRM status is ${call.status}`);
                            
                            // Finalize the call properly
                            await global.voipAgent.finalizeVapiCall(vapiCallId, { crmSessionId: call.sessionId }, vapiStatus);
                            
                            console.log(`✅ [CLEANUP] Call ${call._id} status updated from ${call.status} to completed/failed`);
                        }
                    } catch (vapiError) {
                        // If we can't check Vapi (404, etc.), mark as failed if stuck for more than 15 minutes
                        const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
                        if (call.startedAt && new Date(call.startedAt) < fifteenMinutesAgo) {
                            console.log(`⚠️ [CLEANUP] Call ${call._id} stuck for >15 minutes and Vapi check failed, marking as failed`);
                            call.status = 'failed';
                            call.endedAt = new Date();
                            call.error = 'Call stuck in progress - auto-marked as failed after 15 minutes';
                            await call.save();
                            
                            if (global.io) {
                                global.io.emit('call:status:update', {
                                    callId: call._id,
                                    sessionId: call.sessionId,
                                    leadId: call.leadId,
                                    status: 'failed',
                                    error: call.error
                                });
                            }
                        }
                    }
                } else {
                    // No Vapi ID - if stuck for more than 15 minutes, mark as failed
                    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
                    if (call.startedAt && new Date(call.startedAt) < fifteenMinutesAgo) {
                        console.log(`⚠️ [CLEANUP] Call ${call._id} stuck for >15 minutes without Vapi ID, marking as failed`);
                        call.status = 'failed';
                        call.endedAt = new Date();
                        call.error = 'Call stuck in progress - auto-marked as failed after 15 minutes';
                        await call.save();
                        
                        if (global.io) {
                            global.io.emit('call:status:update', {
                                callId: call._id,
                                sessionId: call.sessionId,
                                leadId: call.leadId,
                                status: 'failed',
                                error: call.error
                            });
                        }
                    }
                }
            } catch (error) {
                console.error(`❌ [CLEANUP] Error processing stuck call ${call._id}:`, error.message);
            }
        }
        
    } catch (error) {
        console.error('❌ [CLEANUP] Error in stuck calls cleanup cron:', error);
    }
});

cron.schedule('0 0 * * *', async () => {
  try {
    console.log('\n🧹 ========================================');
    console.log('🧹 Running cleanup: Deleting old sent emails');
    console.log('🧹 ========================================\n');
    
    // Calculate date 10 days ago
    const tenDaysAgo = new Date();
    tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);
    
    // Delete emails with status 'sent' that are older than 10 days
    const result = await FailedEmail.deleteMany({
      status: 'sent',
      sentAt: { $lt: tenDaysAgo }
    });
    
    console.log(`🗑️ Cleanup complete: Deleted ${result.deletedCount} old 'sent' emails (older than 10 days)`);
    console.log(`📅 Cutoff date: ${tenDaysAgo.toISOString()}\n`);
    
  } catch (error) {
    console.error('❌ Error in cleanup cron job:', error);
  }
});

console.log('✅ Cron job scheduled: Old sent emails cleanup (daily at midnight)\n');

const { processDueReminders } = require('./controllers/reminderController');
cron.schedule('* * * * *', async () => {
  await processDueReminders();
});
console.log('✅ Cron job scheduled: CRM reminder notifications (every minute)\n');

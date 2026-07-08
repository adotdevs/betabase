const catchAsyncErrors = require('../middlewares/catchAsyncErrors');
const ErrorHandler = require('../utils/errorHandler');
const { updateCallStatusInternal, mapVapiEndedReasonToStatus } = require('./callController');

const MAX_CALL_LOG_ENTRIES = 200;

// ✅ DEBOUNCE: Throttle conversation-update webhooks to prevent system freeze
// Store pending updates per call ID
const conversationUpdateQueue = new Map();
const CONVERSATION_UPDATE_DEBOUNCE_MS = 3000; // Process every 3 seconds max

// Process queued conversation updates
async function processConversationUpdateQueue() {
    for (const [callId, { callId: storedCallId, vapiCallId, data, messageType, webhookPayload, lastUpdate }] of conversationUpdateQueue.entries()) {
        // Only process if it's been at least DEBOUNCE_MS since last update
        if (Date.now() - lastUpdate < CONVERSATION_UPDATE_DEBOUNCE_MS) {
            continue;
        }
        
        // Remove from queue and process
        conversationUpdateQueue.delete(callId);
        
        // Re-fetch call to get latest data
        try {
            const getCallModel = require('../crmDB/models/callModel');
            const Call = await getCallModel();
            const call = await Call.findById(storedCallId).lean().maxTimeMS(500).catch(() => null);
            
            if (call) {
                await handleConversationUpdatedInternal(call, data, messageType, webhookPayload);
            }
        } catch (error) {
            // Silently ignore errors - not critical
        }
    }
}

// Start debounce processor
setInterval(processConversationUpdateQueue, 1000); // Check every second

const getWebhookTimestamp = (payload) => {
    if (!payload) return Date.now();
    if (payload.timestamp) return payload.timestamp;
    if (payload.message?.timestamp) return payload.message.timestamp;
    return Date.now();
};

const pushCallLog = async (call, { type, message, timestamp, data } = {}) => {
    // CRITICAL FIX: Use raw MongoDB collection to completely bypass Mongoose schema validation
    // The model may have the old schema cached (logs: [String]), so we use the raw driver
    // which doesn't perform any schema validation or casting
    // We get the collection from the model to ensure correct collection name, but use raw MongoDB operations
    
    const getCallModel = require('../crmDB/models/callModel');
    const Call = await getCallModel();
    const callsCollection = Call.collection; // Raw MongoDB collection - bypasses Mongoose validation
    
    const logEntry = {
        type: type || 'webhook',
        message: message || 'Webhook event received',
        timestamp: timestamp ? new Date(timestamp) : new Date(),
        data: data || {},
    };
    
    // ✅ OPTIMIZED: Use $push with $slice to trim in a single operation (no blocking findOne)
    // This avoids the blocking findOne + updateOne pattern that was freezing the system
    await callsCollection.updateOne(
        { _id: call._id },
        {
            $push: { 
                logs: {
                    $each: [logEntry],
                    $slice: -MAX_CALL_LOG_ENTRIES // Keep only last N entries
                }
            },
            $set: { updatedAt: new Date() }
        }
    );
    
    // DO NOT modify call.logs directly - this triggers Mongoose validation
    // The database update is complete, the local object doesn't need to be updated
};

/**
 * Vapi Webhook Handler - Source of Truth for Call Lifecycle Events
 * 
 * This is the AUTHORITATIVE source for call status, endedReason, duration, transcript, etc.
 * Polling is only for UI responsiveness - webhooks are the final data source.
 */
const handleVapiWebhook = catchAsyncErrors(async (req, res) => {
    const event = req.body;
    
    // #region agent log
    if (typeof fetch === 'function') {
        const message = event.message || event;
        const messageType = message.type || event.type;
        const callData = message.call || message.data || message;
        const vapiCallId = callData?.id || callData?.callId || message.call?.id;
        fetch('http://127.0.0.1:7243/ingest/0b7ae174-df61-4914-8ec0-ed47b5d9d381',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'vapiWebhookController.js:90',message:'Webhook received - entry',data:{messageType,vapiCallId,hasMessage:!!event.message,hasArtifact:!!message.artifact,artifactKeys:message.artifact?Object.keys(message.artifact):[]},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    }
    // #endregion
    
    // ✅ CRITICAL FIX: Return 200 IMMEDIATELY to prevent blocking HTTP requests
    // Process webhook asynchronously in background to avoid freezing the system
    res.status(200).json({ success: true, message: 'Webhook received' });
    
    // Process webhook asynchronously - don't block the HTTP response
    setImmediate(async () => {
        try {
            // Vapi webhook format: { message: { type, call, ... } }
            // OR: { type, data } (legacy format)
            const message = event.message || event;
            const messageType = message.type || event.type;
            const callData = message.call || message.data || message;
            
            // Lightweight logging - avoid JSON.stringify on large payloads (can be several MB)
            const vapiCallId = callData?.id || callData?.callId || message.call?.id;
            
            if (!messageType) {
                // Silently ignore - invalid payload
                return;
            }
            
            // ✅ DEBOUNCE: Handle conversation-update separately via debounce queue
            // This prevents system freeze from rapid-fire webhooks
            // Must check BEFORE database lookup to avoid unnecessary queries
            if (messageType === 'conversation-update' || messageType === 'conversation.updated') {
                if (!vapiCallId) return;
                
                // Fast lookup for debounce queue (with timeout to prevent blocking)
                const getCallModel = require('../crmDB/models/callModel');
                const Call = await getCallModel();
                const call = await Call.findOne({
                    $or: [
                        { sessionId: vapiCallId },
                        { 'metadata.vapiCallId': vapiCallId }
                    ]
                }).select('_id').lean().maxTimeMS(500).catch(() => null);
                
                if (call && call._id) {
                    conversationUpdateQueue.set(call._id.toString(), {
                        callId: call._id,
                        vapiCallId,
                        data: callData || message,
                        messageType,
                        webhookPayload: event,
                        lastUpdate: Date.now()
                    });
                }
                return; // Don't process further - handled by debounce queue
            }
            
            // ✅ FILTER: Skip processing for high-frequency, non-critical webhook types
            // These webhooks come in very frequently and don't need database operations
            const skipWebhookTypes = ['speech-update', 'hang', 'function-call', 'tool-calls', 'user-interrupted'];
            if (skipWebhookTypes.includes(messageType)) {
                // Silently ignore - these are just status updates, not critical data
                return;
            }
            
            console.log(`📥 [WEBHOOK] ${messageType} | Call: ${vapiCallId || 'N/A'}`);
            
            if (!vapiCallId) {
                // Silently ignore - missing call ID
                return;
            }
            
            // ✅ CRITICAL: Use lean() query and limit fields to reduce memory/CPU usage
            // Also add timeout to prevent hanging queries
            const getCallModel = require('../crmDB/models/callModel');
            const Call = await getCallModel();
            
            // Find call in CRM database with lean() for faster queries
            let call = await Call.findOne({
                $or: [
                    { sessionId: vapiCallId },
                    { 'metadata.vapiCallId': vapiCallId }
                ]
            }).lean().maxTimeMS(1000).catch(() => null); // 1 second timeout, don't throw
            
            if (!call) {
                // Don't log warnings for missing calls - they might be timing issues
                return;
            }
            
            // Convert lean document back to Mongoose document if needed
            const callDoc = await Call.findById(call._id).catch(() => null);
            if (!callDoc) return;
            call = callDoc;
        
        // Handle different event types based on Vapi's actual webhook format
        // Vapi sends: "end-of-call-report", "status-update", etc.
        if (messageType === 'end-of-call-report' || messageType === 'status-update') {
            // Extract endedReason from message or call object
            const endedReason = message.endedReason || callData.endedReason || message.call?.endedReason || null;
            const status = callData.status || message.status || message.call?.status || 'queued';
            
            // For end-of-call-report, extract data from message.artifact and message directly
            const artifact = message.artifact || {};
            // Extract from nested call object if available
            const nestedCall = message.call || callData || {};
            const transcript = artifact.transcript || message.transcript || callData.transcript || nestedCall.transcript || null;
            const summary = artifact.summary || message.summary || callData.summary || nestedCall.summary || null;
            const duration = message.durationSeconds || message.duration || artifact.durationSeconds || callData.duration || nestedCall.duration || null;
            const startedAt = message.startedAt || artifact.startedAt || callData.startedAt || nestedCall.startedAt || null;
            const endedAt = message.endedAt || artifact.endedAt || callData.endedAt || nestedCall.endedAt || null;
            const cost = message.cost || artifact.cost || callData.cost || nestedCall.cost || null;
            
            // Extract structured outputs from artifact (this is where Vapi stores them)
            const structuredOutputs = artifact.structuredOutputs || message.structuredOutputs || null;
            
            // #region agent log
            if (typeof fetch === 'function') {
                fetch('http://127.0.0.1:7243/ingest/0b7ae174-df61-4914-8ec0-ed47b5d9d381',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'vapiWebhookController.js:200',message:'Webhook - structured outputs extraction',data:{messageType,status,endedReason,vapiCallId,hasArtifact:!!artifact,hasStructuredOutputs:!!structuredOutputs,structuredOutputsKeys:structuredOutputs?Object.keys(structuredOutputs):[],artifactKeys:artifact?Object.keys(artifact):[]},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
            }
            // #endregion
            
            if (status === 'ended' || endedReason) {
                await handleCallEnded(call, {
                    id: callData.id || message.call?.id,
                    ...callData,
                    endedReason: endedReason,
                    status: status,
                    duration: duration,
                    transcript: transcript,
                    summary: summary,
                    endedAt: endedAt,
                    startedAt: startedAt,
                    error: callData.error || message.error || null,
                    cost: cost,
                    phoneCallProviderDetails: callData.phoneCallProviderDetails || message.call?.phoneCallProviderDetails || null,
                    artifact: artifact, // Store full artifact for debugging
                    structuredOutputs: structuredOutputs // Pass structured outputs explicitly
                }, messageType, event);
            } else if (status === 'failed') {
                await handleCallFailed(call, {
                    ...callData,
                    error: callData.error || message.error || endedReason,
                    endedReason: endedReason
                }, messageType, event);
            } else if (status === 'connected' || status === 'ringing') {
                await handleCallConnected(call, callData, messageType, event);
            } else if (status === 'queued' || status === 'started') {
                await handleCallStarted(call, callData, messageType, event);
            }
        } else if (messageType === 'call.started' || messageType === 'assistant.started') {
            await handleCallStarted(call, callData, messageType, event);
        } else if (messageType === 'call.connected') {
            await handleCallConnected(call, callData, messageType, event);
        } else if (messageType === 'call.ended') {
            await handleCallEnded(call, callData, messageType, event);
        } else if (messageType === 'call.failed') {
            await handleCallFailed(call, callData, messageType, event);
        // conversation-update is now handled earlier, before database lookup
        } else {
            // Try to extract endedReason anyway if present
            if (message.endedReason || callData.endedReason) {
                const endedReason = message.endedReason || callData.endedReason;
                await handleCallEnded(call, {
                    ...callData,
                    endedReason: endedReason,
                    status: callData.status || 'ended'
                }, messageType, event);
            }
        }
        
        } catch (error) {
            console.error('❌ [WEBHOOK] Error processing webhook:', error.message);
            // Don't log full stack in production to avoid spam
            if (process.env.NODE_ENV === 'development') {
                console.error('   Stack:', error.stack);
            }
        }
    });
});

/**
 * Handle call.started event
 */
async function handleCallStarted(call, data, messageType = 'call.started', webhookPayload = null) {
    console.log(`📞 [WEBHOOK] Call started: ${data.id}`);
    
    // Only update status if call is still in initial state - webhook is source of truth
    if (call.status === 'scheduled' || call.status === 'initiating' || !call.status) {
        call.status = 'ringing';
    }
    
    // Extract startedAt from multiple locations
    const startedAt = data.startedAt || 
                     data.call?.startedAt || 
                     data.message?.startedAt ||
                     null;
    if (startedAt) {
        call.startedAt = new Date(startedAt);
    } else if (!call.startedAt) {
        // Fallback: use current time or createdAt
        call.startedAt = call.createdAt || new Date();
    }
    
    // Store Vapi metadata
    if (!call.metadata) call.metadata = {};
    call.metadata.vapiCallId = data.id || data.callId;
    call.metadata.vapiStatus = 'started';
    call.metadata.vapiSource = 'webhook';
    if (webhookPayload) {
        call.metadata.vapiWebhookPayload = webhookPayload;
    }
    
    await pushCallLog(call, {
        type: messageType || 'call.started',
        message: `Call started - status ${call.status}`,
        timestamp: getWebhookTimestamp(webhookPayload),
        data: {
            status: call.status,
            startedAt: call.startedAt,
            phoneNumber: call.phoneNumber,
            fullPayload: webhookPayload || data
        }
    });
    
    // Use raw MongoDB to save and avoid validation issues with logs field
    const getCallModel = require('../crmDB/models/callModel');
    const Call = await getCallModel();
    const callsCollection = Call.collection;
    await callsCollection.updateOne(
        { _id: call._id },
        {
            $set: {
                status: call.status,
                startedAt: call.startedAt,
                metadata: call.metadata,
                updatedAt: new Date()
            }
        }
    );
    
    // ✅ CRITICAL: Make updateCallStatusInternal non-blocking to prevent system freeze
    if (call.sessionId) {
        setImmediate(() => {
            updateCallStatusInternal(call.sessionId, call.status, {
                callId: call._id,
                leadId: call.leadId,
                phoneNumber: call.phoneNumber,
                startedAt: call.startedAt
            }).catch(() => {}); // Silently ignore errors
        });
    }
    
    console.log(`✅ [WEBHOOK] Call status updated to 'ringing'`);
}

/**
 * Handle call.connected event
 */
async function handleCallConnected(call, data, messageType = 'call.connected', webhookPayload = null) {
    console.log(`📞 [WEBHOOK] Call connected: ${data.id}`);
    
    call.status = 'in-progress';
    
    // Store Vapi metadata
    if (!call.metadata) call.metadata = {};
    call.metadata.vapiStatus = 'connected';
    call.metadata.vapiSource = 'webhook';
    if (webhookPayload) {
        call.metadata.vapiWebhookPayload = webhookPayload;
    }
    
    await pushCallLog(call, {
        type: messageType || 'call.connected',
        message: 'Call connected',
        timestamp: getWebhookTimestamp(webhookPayload),
        data: {
            status: call.status,
            startedAt: call.startedAt,
            phoneNumber: call.phoneNumber,
            fullPayload: webhookPayload || data
        }
    });
    
    // Use raw MongoDB to save and avoid validation issues with logs field
    const getCallModel = require('../crmDB/models/callModel');
    const Call = await getCallModel();
    const callsCollection = Call.collection;
    await callsCollection.updateOne(
        { _id: call._id },
        {
            $set: {
                status: call.status,
                metadata: call.metadata,
                updatedAt: new Date()
            }
        }
    );
    
    // ✅ CRITICAL: Make updateCallStatusInternal non-blocking to prevent system freeze
    if (call.sessionId) {
        setImmediate(() => {
            updateCallStatusInternal(call.sessionId, call.status, {
                callId: call._id,
                leadId: call.leadId,
                phoneNumber: call.phoneNumber
            }).catch(() => {}); // Silently ignore errors
        });
    }
    
    console.log(`✅ [WEBHOOK] Call status updated to 'in-progress'`);
}

/**
 * Handle call.ended event - THIS IS THE CRITICAL ONE
 * This is where we get endedReason, duration, transcript, summary
 */
async function handleCallEnded(call, data, messageType = 'call.ended', webhookPayload = null) {
    console.log(`📞 [WEBHOOK] Call ended: ${data.id || data.callId || 'UNKNOWN'}`);
    
    // CRITICAL: Check if this webhook was already processed (idempotency check)
    // Use the webhook timestamp and endedReason as a unique identifier
    const webhookTimestamp = getWebhookTimestamp(webhookPayload || data);
    const endedReason = data.endedReason || 
                       data.endReason || 
                       data.ended_reason || 
                       data.reason ||
                       data.call?.endedReason ||
                       data.message?.endedReason ||
                       null;
    
    console.log(`   EndedReason: ${endedReason || 'NOT PROVIDED'}`);
    console.log(`   Duration: ${data.duration || data.call?.duration || 'NOT PROVIDED'}`);
    console.log(`   Transcript: ${(data.transcript || data.call?.transcript) ? 'Available' : 'Not available'}`);
    console.log(`   Summary: ${(data.summary || data.call?.summary) ? 'Available' : 'Not available'}`);
    console.log(`   Status: ${data.status || data.call?.status || 'NOT PROVIDED'}`);
    
    // CRITICAL: Store ALL data from webhook - this is the source of truth
    // Extract startedAt from multiple locations
    const startedAt = data.startedAt || 
                     data.artifact?.startedAt || 
                     data.call?.startedAt || 
                     data.message?.startedAt ||
                     null;
    if (startedAt) {
        call.startedAt = new Date(startedAt);
    } else if (!call.startedAt && call.createdAt) {
        // Fallback: use createdAt if startedAt not provided
        call.startedAt = call.createdAt;
    }
    
    // Check multiple locations for endedAt (message.artifact, message, call)
    const endedAt = data.endedAt || 
                   data.artifact?.endedAt || 
                   data.call?.endedAt || 
                   data.message?.endedAt ||
                   null;
    call.endedAt = endedAt ? new Date(endedAt) : new Date();
    
    // Calculate duration if not provided (check multiple formats: seconds, milliseconds, durationSeconds)
    let duration = data.duration || 
                  data.durationSeconds || 
                  data.artifact?.durationSeconds ||
                  data.call?.duration || 
                  data.message?.duration ||
                  data.message?.durationSeconds ||
                  null;
    
    // Convert to seconds if in milliseconds
    if (duration && duration > 1000000) {
        duration = Math.floor(duration / 1000);
    }
    
    if (duration) {
        call.duration = Math.floor(duration);
    } else if (call.startedAt && call.endedAt) {
        call.duration = Math.floor((call.endedAt - call.startedAt) / 1000);
    } else if (call.createdAt && call.endedAt) {
        // Fallback: calculate from createdAt if startedAt is not available
        call.duration = Math.floor((call.endedAt - call.createdAt) / 1000);
    } else if (data.call?.createdAt && data.call?.updatedAt) {
        // Try to calculate from webhook call object timestamps
        const created = new Date(data.call.createdAt);
        const updated = new Date(data.call.updatedAt);
        call.duration = Math.floor((updated - created) / 1000);
        if (!call.startedAt) call.startedAt = created;
        if (!call.endedAt) call.endedAt = updated;
    } else if (call.createdAt) {
        // Last resort: use current time
        call.duration = Math.floor((new Date() - call.createdAt) / 1000);
    }
    
    // CRITICAL: Extract structured outputs FIRST to check for appointment before setting status
    // If appointment is booked, "customer-ended-call" should be "completed" not "cancelled"
    const structuredOutputsForStatus = data.artifact?.structuredOutputs ||
                                       data.structuredOutputs ||
                                       data.message?.artifact?.structuredOutputs ||
                                       data.message?.structuredOutputs ||
                                       null;
    
    // Determine CRM status based on endedReason using centralized mapping function
    // This ensures consistent categorization across all Vapi ended reasons
    let crmStatus = mapVapiEndedReasonToStatus(endedReason);
    
    // CRITICAL: If call has appointment booked, treat "customer-ended-call" as "completed"
    // A successful call with appointment should be marked as completed, not cancelled
    if (crmStatus === 'cancelled' && endedReason && endedReason.toLowerCase().includes('customer-ended-call') && structuredOutputsForStatus) {
        for (const [key, output] of Object.entries(structuredOutputsForStatus)) {
            if (output && typeof output === 'object') {
                const outputName = (output.name || key || '').toLowerCase();
                if ((outputName.includes('appointment') || outputName.includes('callback') || outputName.includes('call back')) && 
                    output.result === true) {
                    crmStatus = 'completed'; // Override to completed if appointment was booked
                    console.log(`✅ [WEBHOOK] Overriding status to 'completed' - appointment was booked`);
                    break;
                }
            }
        }
    }
    
    call.status = crmStatus;
    
    // CRITICAL: Check if this exact webhook was already processed (idempotency check)
    // Load fresh call from database to check current state
    const getCallModel = require('../crmDB/models/callModel');
    const Call = await getCallModel();
    const freshCall = await Call.findById(call._id);
    
    // If call is already finalized with same endedReason and similar timestamp, skip processing
    if (freshCall && freshCall.metadata && freshCall.metadata.finalizedAt && freshCall.metadata.vapiEndedReason === endedReason) {
        const timeDiff = Math.abs(new Date(freshCall.metadata.finalizedAt) - new Date(webhookTimestamp));
        if (timeDiff < 5000) { // Within 5 seconds
            console.log(`⚠️ [WEBHOOK] Duplicate webhook detected - call ${call._id} already finalized with same endedReason (${endedReason}), skipping processing`);
            // ✅ CRITICAL: Make updateCallStatusInternal non-blocking to prevent system freeze
            if (call.sessionId) {
                setImmediate(() => {
                    updateCallStatusInternal(call.sessionId, freshCall.status || crmStatus, {
                        callId: call._id,
                        leadId: call.leadId,
                        phoneNumber: call.phoneNumber,
                        endedAt: freshCall.endedAt || call.endedAt,
                        duration: freshCall.duration || call.duration,
                        endedReason: endedReason,
                        source: 'webhook',
                        forceUpdate: true
                    }).catch(() => {}); // Silently ignore errors
                });
            }
            return; // Skip duplicate processing
        }
    }
    
    // Store ALL Vapi metadata - this is the source of truth
    if (!call.metadata) call.metadata = {};
    call.metadata.vapiEndedReason = endedReason; // CRITICAL: Store endedReason
    call.metadata.endedReason = endedReason; // Also store in legacy field
    // Mirror on root document for fast access in listings / analytics
    call.endedReason = endedReason;
    call.metadata.vapiStatus = 'ended';
    call.metadata.vapiSource = 'webhook';
    call.metadata.vapiDuration = duration || data.duration || data.durationSeconds || null;
    call.metadata.vapiError = data.error || null;
    call.metadata.vapiMessage = data.message || null;
    call.metadata.vapiCallId = data.id || data.callId || null;
    call.metadata.finalizedAt = new Date(webhookTimestamp); // Mark as finalized with webhook timestamp
    call.metadata.finalizedBy = 'webhook'; // Track source
    if (webhookPayload) {
        call.metadata.vapiWebhookPayload = webhookPayload;
    } else {
        call.metadata.vapiWebhookPayload = data;
    }
    
    // Store SIP details if available (from phoneCallProviderDetails)
    if (data.phoneCallProviderDetails) {
        if (!call.metadata.sipStatus) call.metadata.sipStatus = {};
        call.metadata.sipStatus.code = data.phoneCallProviderDetails.sipStatus;
        call.metadata.sipStatus.message = data.phoneCallProviderDetails.sipReason || 'Busy Here';
        call.metadata.sipStatus.receivedAt = new Date();
    }
    
    // Store transcript and summary if available (check multiple locations including artifact)
    const transcript = data.transcript || 
                      data.artifact?.transcript || 
                      data.call?.transcript || 
                      data.message?.transcript ||
                      data.message?.artifact?.transcript ||
                      null;
    if (transcript) {
        call.transcript = typeof transcript === 'string' 
            ? transcript 
            : JSON.stringify(transcript);
    }
    
    const summary = data.summary || 
                   data.artifact?.summary || 
                   data.call?.summary || 
                   data.message?.summary ||
                   data.message?.artifact?.summary ||
                   null;
    if (summary) {
        call.summary = typeof summary === 'string' 
            ? summary 
            : JSON.stringify(summary);
    }

    const resolvedCost = data.cost ||
        data.artifact?.cost ||
        data.call?.cost ||
        data.message?.cost ||
        data.message?.artifact?.cost ||
        null;
    call.metadata.vapiCost = resolvedCost;
    
    // Extract and store structured outputs from artifact
    // Check multiple locations: data.artifact, data itself (if passed from end-of-call-report), webhookPayload
    const structuredOutputs = data.artifact?.structuredOutputs ||
                              data.structuredOutputs ||
                              data.message?.artifact?.structuredOutputs ||
                              data.message?.structuredOutputs ||
                              (webhookPayload && webhookPayload.message?.artifact?.structuredOutputs) ||
                              (webhookPayload && webhookPayload.artifact?.structuredOutputs) ||
                              null;
    
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/0b7ae174-df61-4914-8ec0-ed47b5d9d381',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'vapiWebhookController.js:577',message:'Structured outputs extraction - entry',data:{hasStructuredOutputs:!!structuredOutputs,structuredOutputsKeys:structuredOutputs?Object.keys(structuredOutputs):[],callId:call._id?.toString(),sessionId:call.sessionId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    
    if (structuredOutputs) {
        call.metadata.structuredOutputs = structuredOutputs;
        console.log(`✅ [WEBHOOK] Stored structured outputs:`, Object.keys(structuredOutputs));
        
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/0b7ae174-df61-4914-8ec0-ed47b5d9d381',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'vapiWebhookController.js:584',message:'Structured outputs found - iterating',data:{structuredOutputsCount:Object.keys(structuredOutputs).length,structuredOutputsEntries:Object.entries(structuredOutputs).map(([k,v])=>({key:k,name:v?.name,result:v?.result,resultType:typeof v?.result})),callId:call._id?.toString()},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
        
        // Extract appointment/callback flag from structured outputs
        // Look for "Appointment Booked" or similar structured output with result: true
        let appointmentBooked = false;
        for (const [key, output] of Object.entries(structuredOutputs)) {
            if (output && typeof output === 'object') {
                const outputName = (output.name || '').toLowerCase();
                const outputKey = key.toLowerCase();
                
                // #region agent log
                fetch('http://127.0.0.1:7243/ingest/0b7ae174-df61-4914-8ec0-ed47b5d9d381',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'vapiWebhookController.js:590',message:'Checking structured output entry',data:{key,outputName,outputKey,result:output.result,resultType:typeof output.result,hasAppointment:outputName.includes('appointment'),hasCallback:outputName.includes('callback')||outputName.includes('call back'),resultIsTrue:output.result===true},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
                // #endregion
                
                // Check if it's an appointment-related output with result: true
                if ((outputName.includes('appointment') || outputName.includes('callback') || outputName.includes('call back')) && 
                    output.result === true) {
                    appointmentBooked = true;
                    console.log(`✅ [WEBHOOK] Found appointment booked: ${output.name} = ${output.result}`);
                    
                    // #region agent log
                    fetch('http://127.0.0.1:7243/ingest/0b7ae174-df61-4914-8ec0-ed47b5d9d381',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'vapiWebhookController.js:595',message:'Appointment booked found',data:{outputName,outputKey,result:output.result,callId:call._id?.toString()},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
                    // #endregion
                    
                    break;
                }
            }
        }
        // Store as callBack flag for easy filtering
        call.metadata.callBack = appointmentBooked;
        call.callBack = appointmentBooked; // Also store on root for fast access
        console.log(`✅ [WEBHOOK] Set callBack flag: ${appointmentBooked}`);
        
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/0b7ae174-df61-4914-8ec0-ed47b5d9d381',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'vapiWebhookController.js:599',message:'callBack flag set - before save',data:{appointmentBooked,callId:call._id?.toString(),callBackOnCall:call.callBack,callBackOnMetadata:call.metadata.callBack},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
        // #endregion
    } else {
        // If no structured outputs found, set callBack to false explicitly
        call.metadata.callBack = false;
        call.callBack = false;
        
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/0b7ae174-df61-4914-8ec0-ed47b5d9d381',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'vapiWebhookController.js:603',message:'No structured outputs - setting callBack to false',data:{callId:call._id?.toString()},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
    }
    
    // Store SIP details if available
    if (data.phoneCallProviderDetails) {
        if (!call.metadata.sipStatus) call.metadata.sipStatus = {};
        call.metadata.sipStatus.code = data.phoneCallProviderDetails.sipStatus;
        call.metadata.sipStatus.message = data.phoneCallProviderDetails.sipReason || 'Busy Here';
        call.metadata.sipStatus.receivedAt = new Date();
    }
    
    // Store full webhook payload for debugging
    const logPayload = webhookPayload || data;
    
    await pushCallLog(call, {
        type: messageType || 'call.ended',
        message: `Call ended${endedReason ? ` (${endedReason})` : ''}`,
        timestamp: getWebhookTimestamp(webhookPayload || data),
        data: {
            status: crmStatus,
            endedReason: endedReason || null,
            duration: call.duration,
            startedAt: call.startedAt,
            endedAt: call.endedAt,
            summary: summary || null,
            transcript: transcript || null,
            cost: resolvedCost || null,
            fullPayload: logPayload
        }
    });
    
    // Use raw MongoDB to save call data and avoid validation issues with logs field
    // This bypasses Mongoose validation which may fail if logs field has corrupted data
    // Note: Call model already retrieved above for idempotency check
    const callsCollection = Call.collection;
    
    // Build update object with all fields that need to be saved
    const updateData = {
        status: crmStatus,
        endedAt: call.endedAt,
        duration: call.duration,
        updatedAt: new Date()
    };
    
    // Add all fields that were set in the function
    if (call.startedAt) updateData.startedAt = call.startedAt;
    if (call.transcript !== undefined) updateData.transcript = call.transcript;
    if (call.summary !== undefined) updateData.summary = call.summary;
    // CRITICAL: Include endedReason on root document for fast access in listings
    if (call.endedReason) updateData.endedReason = call.endedReason;
    if (call.error) updateData.error = call.error;
    if (call.metadata) updateData.metadata = call.metadata;
    
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/0b7ae174-df61-4914-8ec0-ed47b5d9d381',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'vapiWebhookController.js:654',message:'Update data before save',data:{callId:call._id?.toString(),callBack:call.callBack,metadataCallBack:call.metadata?.callBack,hasMetadata:!!call.metadata,updateDataCallBack:updateData.metadata?.callBack},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
    // #endregion
    
    // CRITICAL: Explicitly include callBack in updateData if it was set
    if (call.callBack !== undefined) {
        updateData.callBack = call.callBack;
    }
    
    // Use raw MongoDB updateOne to bypass Mongoose validation
    await callsCollection.updateOne(
        { _id: call._id },
        { $set: updateData }
    );
    
    console.log(`✅ [WEBHOOK] Call finalized:`);
    console.log(`   Status: ${crmStatus}`);
    console.log(`   EndedReason: ${endedReason || 'N/A'}`);
    console.log(`   Duration: ${call.duration}s`);
    console.log(`   Transcript: ${call.transcript ? 'Stored' : 'Not available'}`);
    console.log(`   Summary: ${call.summary ? 'Stored' : 'Not available'}`);
    
    // ✅ CRITICAL: Make updateCallStatusInternal non-blocking to prevent system freeze
    // Pass source='webhook' and forceUpdate=true to bypass duplicate checks
    // Webhooks are the source of truth and should always broadcast even if status matches
    if (call.sessionId) {
        setImmediate(() => {
            updateCallStatusInternal(call.sessionId, crmStatus, {
                callId: call._id,
                leadId: call.leadId,
                phoneNumber: call.phoneNumber,
                endedAt: call.endedAt,
                duration: call.duration,
                endedReason: endedReason,
                source: 'webhook', // Mark as webhook update (source of truth)
                forceUpdate: true // Force update to bypass duplicate checks
            }).catch(() => {}); // Silently ignore errors
        });
    }
}

/**
 * Handle call.failed event
 */
async function handleCallFailed(call, data, messageType = 'call.failed', webhookPayload = null) {
    console.log(`❌ [WEBHOOK] Call failed: ${data.id}`);
    console.log(`   Error: ${data.error || 'NOT PROVIDED'}`);
    
    call.status = 'failed';
    call.endedAt = data.endedAt ? new Date(data.endedAt) : new Date();
    
    if (call.startedAt) {
        call.duration = Math.floor((call.endedAt - call.startedAt) / 1000);
    }
    
    // Store error details
    if (!call.metadata) call.metadata = {};
    const failedReason = data.error || data.endedReason || 'Call failed';
    call.metadata.vapiEndedReason = failedReason;
    call.metadata.endedReason = failedReason;
    // Mirror on root document for fast access
    call.endedReason = failedReason;
    call.error = data.error || failedReason;
    call.metadata.vapiStatus = 'failed';
    call.metadata.vapiSource = 'webhook';
    call.metadata.vapiError = data.error || null;
    call.metadata.vapiCallId = data.id;
    call.metadata.finalizedAt = new Date();
    call.metadata.finalizedBy = 'webhook';
    if (webhookPayload) {
        call.metadata.vapiWebhookPayload = webhookPayload;
    }
    
    await pushCallLog(call, {
        type: messageType || 'call.failed',
        message: `Call failed: ${call.metadata.vapiEndedReason}`,
        timestamp: getWebhookTimestamp(webhookPayload || data),
        data: {
            status: 'failed',
            endedReason: call.metadata.vapiEndedReason,
            error: call.metadata.vapiError,
            endedAt: call.endedAt,
            duration: call.duration,
            fullPayload: webhookPayload || data
        }
    });
    
    // Use raw MongoDB to save and avoid validation issues with logs field
    const getCallModel = require('../crmDB/models/callModel');
    const Call = await getCallModel();
    const callsCollection = Call.collection;
    await callsCollection.updateOne(
        { _id: call._id },
        {
            $set: {
                status: 'failed',
                endedAt: call.endedAt,
                duration: call.duration,
                endedReason: call.endedReason,
                error: call.error,
                metadata: call.metadata,
                updatedAt: new Date()
            }
        }
    );
    
    // ✅ CRITICAL: Make updateCallStatusInternal non-blocking to prevent system freeze
    if (call.sessionId) {
        setImmediate(() => {
            updateCallStatusInternal(call.sessionId, 'failed', {
                callId: call._id,
                leadId: call.leadId,
                phoneNumber: call.phoneNumber,
                endedAt: call.endedAt,
                duration: call.duration,
                error: call.metadata.vapiError
            }).catch(() => {}); // Silently ignore errors
        });
    }
    
    console.log(`✅ [WEBHOOK] Call marked as failed`);
}

/**
 * Handle conversation.updated event (transcript updates)
 */
// Internal function to actually process conversation updates
async function handleConversationUpdatedInternal(call, data, messageType = 'conversation-update', webhookPayload = null) {
    // call is already a lean document from the queue
    if (!call || !call._id) return;
    
    const getCallModel = require('../crmDB/models/callModel');
    const Call = await getCallModel();
    
    // Update transcript if provided
    if (data.transcript) {
        freshCall.transcript = typeof data.transcript === 'string' 
            ? data.transcript 
            : JSON.stringify(data.transcript);
    }
    
    // Update summary if provided
    if (data.summary) {
        freshCall.summary = typeof data.summary === 'string' 
            ? data.summary 
            : JSON.stringify(data.summary);
    }
    
    // Store in metadata
    if (!freshCall.metadata) freshCall.metadata = {};
    freshCall.metadata.vapiSource = 'webhook';
    freshCall.metadata.lastConversationUpdate = new Date();
    
    // Use raw MongoDB to save and avoid validation issues with logs field
    const callsCollection = Call.collection;
    const updateData = {
        metadata: freshCall.metadata,
        updatedAt: new Date()
    };
    if (freshCall.transcript !== undefined) updateData.transcript = freshCall.transcript;
    if (freshCall.summary !== undefined) updateData.summary = freshCall.summary;
    
    // Single atomic update - no separate log push to reduce DB operations
    await callsCollection.updateOne(
        { _id: freshCall._id },
        { $set: updateData }
    );
}

// Legacy function name for backwards compatibility
async function handleConversationUpdated(call, data, messageType = 'conversation-update', webhookPayload = null) {
    return handleConversationUpdatedInternal(call, data, messageType, webhookPayload);
}

module.exports = {
    handleVapiWebhook
};

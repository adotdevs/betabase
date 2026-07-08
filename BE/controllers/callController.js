// controllers/callController.js
const getLeadModel = require('../crmDB/models/leadsModel');
const getCallModel = require('../crmDB/models/callModel');
const User = require('../models/userModel'); // from main DB
const catchAsyncErrors = require('../middlewares/catchAsyncErrors');
const ErrorHandler = require('../utils/errorHandler');
const { logActivity } = require('./activityController');

// Helper function to format phone number with + prefix
const formatPhoneNumber = (phone) => {
    if (!phone) return '';
    
    // Convert to string and trim
    let formatted = String(phone).trim();
    
    // Remove spaces, dashes, parentheses, and other non-digit characters except +
    formatted = formatted.replace(/[\s\-\(\)\.]/g, '');
    
    // Add + prefix if missing
    if (formatted && !formatted.startsWith('+')) {
        formatted = '+' + formatted;
    }
    
    return formatted;
};

/**
 * Maps Vapi endedReason to CRM status category (completed, no-answer, failed, cancelled)
 * Uses exact matching first, then pattern matching for efficiency
 * @param {string} endedReason - The endedReason from Vapi
 * @returns {string} - One of: 'completed', 'no-answer', 'failed', 'cancelled'
 */
exports.mapVapiEndedReasonToStatus = function mapVapiEndedReasonToStatus(endedReason) {
    if (!endedReason || typeof endedReason !== 'string') {
        return 'completed'; // Default to completed
    }
    
    const reasonLower = endedReason.toLowerCase();
    
    // Exact matches first (fastest)
    // Completed category
    if (['assistant-ended-call', 'assistant-ended-call-after-message-spoken', 'assistant-ended-call-with-hangup-task',
         'assistant-forwarded-call', 'assistant-said-end-call-phrase', 'vonage-completed'].includes(reasonLower)) {
        return 'completed';
    }
    
    // No-Answer category
    if (['customer-did-not-answer', 'customer-busy', 'voicemail'].includes(reasonLower)) {
        return 'no-answer';
    }
    
    // Cancelled category
    if (['customer-ended-call', 'manually-canceled', 'vonage-disconnected'].includes(reasonLower)) {
        return 'cancelled';
    }
    
    // Pattern matching for variations (second priority)
    // No-Answer patterns (check first to avoid false positives)
    if (reasonLower.includes('customer-did-not-answer') || reasonLower.includes('did-not-answer') ||
        reasonLower.includes('customer-busy') || reasonLower.includes('voicemail')) {
        return 'no-answer';
    }
    
    // Cancelled patterns
    if (reasonLower.includes('customer-ended-call') || reasonLower.includes('manually-canceled') ||
        reasonLower.includes('manually-cancelled') || reasonLower.includes('vonage-disconnected')) {
        return 'cancelled';
    }
    
    // Failed patterns (catch-all for errors) - covers all Vapi error reasons
    // Assistant errors
    if (reasonLower.includes('assistant-error') || reasonLower.includes('assistant-join-timed-out') ||
        reasonLower.includes('assistant-not-found') || reasonLower.includes('assistant-not-valid') ||
        reasonLower.includes('assistant-not-provided') || reasonLower.includes('assistant-request-failed') ||
        reasonLower.includes('assistant-request-returned')) {
        return 'failed';
    }
    // General errors
    if (reasonLower.includes('error') || reasonLower.includes('failed') || reasonLower.includes('timeout') ||
        reasonLower.includes('not-found') || reasonLower.includes('not-valid') || reasonLower.includes('not-provided') ||
        reasonLower.includes('database-error') || reasonLower.includes('exceeded-max-duration') ||
        reasonLower.includes('silence-timed-out') || reasonLower.includes('worker-shutdown') ||
        reasonLower.includes('unknown-error')) {
        return 'failed';
    }
    // Call start errors
    if (reasonLower.includes('call-start-error') || reasonLower.includes('call.start.error')) {
        return 'failed';
    }
    // Call in-progress errors
    if (reasonLower.includes('call.in-progress.error') || reasonLower.includes('assistant-did-not-receive-customer-audio')) {
        return 'failed';
    }
    // Provider errors
    if (reasonLower.includes('phone-call-provider') || reasonLower.includes('twilio-') ||
        reasonLower.includes('vonage-failed') || reasonLower.includes('vonage-rejected') ||
        reasonLower.includes('sip-telephony-provider-failed')) {
        return 'failed';
    }
    
    // Completed patterns (check last to catch assistant-ended variations)
    if (reasonLower.includes('assistant-ended') || reasonLower.includes('assistant-forwarded') ||
        reasonLower.includes('assistant-said-end')) {
        return 'completed';
    }
    
    // Default to completed if no match
    return 'completed';
}

/**
 * Gets all endedReason patterns for a specific status category
 * Used for filtering in MongoDB queries
 * @param {string} status - One of: 'completed', 'no-answer', 'failed', 'cancelled'
 * @returns {Array<string>} - Array of endedReason patterns
 */
function getEndedReasonPatternsForStatus(status) {
    switch (status) {
        case 'no-answer':
            return ['customer-did-not-answer', 'customer-busy', 'voicemail'];
        case 'cancelled':
            return ['customer-ended-call', 'manually-canceled', 'manually-cancelled', 'vonage-disconnected'];
        case 'failed':
            // Return common patterns (not exhaustive, but covers most cases)
            return ['error', 'failed', 'timeout', 'not-found', 'not-valid', 'not-provided', 
                   'request-failed', 'database-error', 'exceeded-max-duration', 'silence-timed-out',
                   'worker-shutdown', 'unknown-error', 'call-start-error', 'twilio-failed',
                   'vonage-failed', 'vonage-rejected'];
        case 'completed':
            return ['assistant-ended-call', 'assistant-ended-call-after-message-spoken',
                   'assistant-ended-call-with-hangup-task', 'assistant-forwarded-call',
                   'assistant-said-end-call-phrase', 'vonage-completed'];
        default:
            return [];
    }
}

// PERFORMANCE OPTIMIZATION: Cache for accessible lead IDs
const accessibleLeadIdsCache = new Map();
const ACCESSIBLE_LEADS_CACHE_TTL = 2 * 60 * 1000; // 2 minutes cache

/**
 * Helper function to get accessible lead IDs based on user role - OPTIMIZED with caching
 * Returns null for superadmin (no filtering needed), or array of accessible lead IDs
 */
async function getAccessibleLeadIds(currentUser) {
    if (!currentUser) return null;
    
    const currentUserRole = currentUser.role;
    const userId = currentUser._id.toString();
    const cacheKey = `accessible_leads_${userId}`;
    
    // Check cache first
    const cached = accessibleLeadIdsCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < ACCESSIBLE_LEADS_CACHE_TTL) {
        return cached.data;
    }
    
    const Lead = await getLeadModel();
    let result = null;
    
    if (currentUserRole === 'superadmin') {
        // Superadmin can see all leads - return null (no filtering)
        result = null;
    } else if (currentUserRole === 'subadmin') {
        // Subadmin: only own leads
        const leads = await Lead.find({ agent: currentUser._id }).select('_id').lean();
        result = leads.map(l => l._id);
    } else if (currentUserRole === 'admin') {
        // Admin: own leads + subadmins' leads only if allowed - OPTIMIZED with cached permissions
        const { getCachedUserPermissions } = require('./crmController');
        const userPerms = await getCachedUserPermissions(currentUser._id);
        if (userPerms?.adminPermissions?.canManageCrmLeads) {
            const { getCachedSubadmins } = require('./crmController');
            const subadminIds = await getCachedSubadmins();
            const allowedAgentIds = [currentUser._id, ...subadminIds];
            const leads = await Lead.find({ agent: { $in: allowedAgentIds } }).select('_id').lean();
            result = leads.map(l => l._id);
        } else {
            // Admin without permission: only own leads
            const leads = await Lead.find({ agent: currentUser._id }).select('_id').lean();
            result = leads.map(l => l._id);
        }
    } else {
        // Unknown role - return empty array (no access)
        result = [];
    }
    
    // Cache the result
    accessibleLeadIdsCache.set(cacheKey, {
        data: result,
        timestamp: Date.now()
    });
    
    return result;
}

// Clear cache when needed
function clearAccessibleLeadIdsCache(userId) {
    if (userId) {
        accessibleLeadIdsCache.delete(`accessible_leads_${userId.toString()}`);
    } else {
        accessibleLeadIdsCache.clear();
    }
}

/**
 * Initiate a call for a lead (manual)
 */
exports.initiateCall = catchAsyncErrors(async (req, res, next) => {
    // Declare upfront so they are in scope for catch as well
    const { leadId, phoneNumber } = req.body;
    try {

        if (!leadId || !phoneNumber) {
            return next(new ErrorHandler('Lead ID and phone number are required', 400));
        }

        // Format phone number with + prefix if missing (for old leads)
        const formattedPhoneNumber = formatPhoneNumber(phoneNumber);
        
        if (!formattedPhoneNumber) {
            return next(new ErrorHandler('Invalid phone number', 400));
        }

        // Get models
        const Lead = await getLeadModel();
        const Call = await getCallModel();

        // Verify lead exists
        const lead = await Lead.findById(leadId);
        if (!lead) {
            return next(new ErrorHandler('Lead not found', 404));
        }
        
        // Update lead's phone number if it was formatted (for old leads without +)
        if (lead.phone !== formattedPhoneNumber) {
            lead.phone = formattedPhoneNumber;
            await lead.save();
            console.log(`📞 Updated lead phone number: "${phoneNumber}" → "${formattedPhoneNumber}"`);
        }
        
        // ✅ Vapi Config Logic:
        // - ALL users (including superadmin) MUST use their profile Vapi config (dynamic from profile)
        // - No default fallback to env - everyone must configure their own keys
        let userVapiConfig = null;
        let userSipConfig = null;
        if (req.user) {
            const User = require('../models/userModel');
            const user = await User.findById(req.user._id).select('vapiConfig sipConfig role email');
            
            if (user && (user.role === 'superadmin' || user.role === 'admin' || user.role === 'subadmin')) {
                // All admins and superadmin must have Vapi config enabled in their profile
                if (!user.vapiConfig || !user.vapiConfig.enabled) {
                    return res.status(400).json({
                        success: false,
                        message: 'Vapi configuration is not enabled. Please enable and configure your Vapi settings in your profile before making calls.',
                        msg: 'Vapi configuration is not enabled. Please enable and configure your Vapi settings in your profile before making calls.',
                        requiresVapiConfig: true
                    });
                }
                
                if (!user.vapiConfig.apiKey) {
                    return res.status(400).json({
                        success: false,
                        message: 'Vapi API key is not configured. Please configure your Vapi settings in your profile before making calls.',
                        msg: 'Vapi API key is not configured. Please configure your Vapi settings in your profile before making calls.',
                        requiresVapiConfig: true
                    });
                }
                
                // Use user's profile Vapi config (dynamic from profile)
                userVapiConfig = {
                    apiKey: user.vapiConfig.apiKey,
                    assistantId: user.vapiConfig.assistantId || null,
                    phoneNumberId: user.vapiConfig.phoneNumberId || null,
                    enabled: true
                };
                console.log(`🔧 Using ${user.role} Vapi config from profile for user: ${user.email}`);
                
                // Check if user has custom SIP config enabled
                if (user.sipConfig && user.sipConfig.enabled) {
                    userSipConfig = {
                        server: user.sipConfig.server,
                        username: user.sipConfig.username,
                        password: user.sipConfig.password,
                        port: user.sipConfig.port || 5060,
                        enabled: true
                    };
                    console.log(`🔧 Using ${user.role} custom SIP config from profile for user: ${user.email}`);
                } else {
                    console.log(`🔧 Using default SIP config from environment for user: ${user.email}`);
                }
            } else {
                // Non-admin user - still need to check config
                return res.status(403).json({
                    success: false,
                    message: 'You do not have permission to make calls.',
                    msg: 'You do not have permission to make calls.',
                    requiresVapiConfig: false
                });
            }
        } else {
            // No user authenticated
            return res.status(401).json({
                success: false,
                message: 'Authentication required.',
                msg: 'Authentication required.',
                requiresVapiConfig: false
            });
        }

            // ✅ CRITICAL: Check call initiation lock and cooldown to prevent race conditions
        const now = Date.now();
        const timeSinceLastCall = now - lastCallInitiationTime;
        
        if (callInitiationLock || timeSinceLastCall < CALL_INITIATION_COOLDOWN) {
            // Lock is active or within cooldown period - schedule this call instead
            const sessionId = `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const scheduledCall = new Call({
                leadId: leadId,
                sessionId: sessionId,
                phoneNumber: formattedPhoneNumber,
                status: 'scheduled',
                callType: 'manual',
                scheduledAt: new Date()
            });
            await scheduledCall.save();

            // Add to queue for processing after current call finishes
            addToQueueSafely({
                callId: scheduledCall._id.toString(),
                leadId: leadId,
                phoneNumber: formattedPhoneNumber,
                delay: Math.max(5000, CALL_INITIATION_COOLDOWN - timeSinceLastCall), // Wait at least cooldown period
                completed: 0
            });

            // Start processing queue if not already processing
            if (!isProcessingQueue && !queuePaused) {
                processCallQueue().catch(err => {
                    console.error('Error processing call queue:', err);
                });
            }

            return res.status(200).json({
                success: true,
                message: 'Another call is being initiated. This call has been scheduled and will be processed automatically.',
                call: {
                    id: scheduledCall._id,
                    sessionId: sessionId,
                    leadId: leadId,
                    phoneNumber: formattedPhoneNumber,
                    status: 'scheduled'
                }
            });
        }

        // ✅ CRITICAL: Check if there's already an active call (ringing or in-progress)
        // Only allow ONE active call at a time to prevent system overload
        const activeCall = await Call.findOne({
            status: { $in: ['ringing', 'in-progress'] }
        });

        if (activeCall) {
            // There's already an active call - schedule this one instead
            const sessionId = `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const scheduledCall = new Call({
                leadId: leadId,
                sessionId: sessionId,
                phoneNumber: formattedPhoneNumber,
                status: 'scheduled',
                callType: 'manual',
                scheduledAt: new Date() // Schedule immediately (will be processed when active call finishes)
            });
            await scheduledCall.save();

            // Add to queue for processing after current call finishes
            addToQueueSafely({
                callId: scheduledCall._id.toString(),
                leadId: leadId,
                phoneNumber: formattedPhoneNumber,
                delay: 5000, // 5 second delay after previous call
                completed: 0
            });

            // Start processing queue if not already processing
            if (!isProcessingQueue && !queuePaused) {
                processCallQueue().catch(err => {
                    console.error('Error processing call queue:', err);
                });
            }

            return res.status(200).json({
                success: true,
                message: 'Another call is in progress. This call has been scheduled and will be processed automatically.',
                call: {
                    id: scheduledCall._id,
                    sessionId: sessionId,
                    leadId: leadId,
                    phoneNumber: formattedPhoneNumber,
                    status: 'scheduled'
                }
            });
        }

        // No active call - proceed with immediate initiation
        // ✅ CRITICAL: Set lock to prevent race conditions
        callInitiationLock = true;
        lastCallInitiationTime = Date.now();
        
        // Create call record with "initiating" status first (prevents other calls from starting)
        const sessionId = `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const call = new Call({
            leadId: leadId,
            sessionId: sessionId,
            phoneNumber: formattedPhoneNumber,
            status: 'ringing', // Set to ringing immediately to block other calls
            callType: 'manual',
            startedAt: new Date(),
            initiatedBy: req.user ? req.user._id : null // Store who initiated the call
        });
        await call.save();
        
        console.log(`🔒 [CALL_INIT] Lock set - Call ${call._id} initiating (${formattedPhoneNumber})`);

        // OPTIMIZED: Emit Socket.io event asynchronously to prevent blocking during bulk operations
        setImmediate(() => {
            if (global.io) {
                global.io.emit('call:status:update', {
                    callId: call._id,
                    sessionId: sessionId,
                    leadId: leadId,
                    phoneNumber: formattedPhoneNumber,
                    status: 'ringing',
                    startedAt: call.startedAt
                });
            }
        });

        // Initiate call using VoIP agent
        if (global.voipAgent) {
            // ✅ CRITICAL: Final check before making VoIP call - ensure no other call is active FOR THIS USER
            // Allow multiple admins to make calls simultaneously - only check for same user's active calls
            const currentUserId = req.user ? req.user._id.toString() : null;
            
            const finalActiveCheck = await Call.findOne({
                status: { $in: ['ringing', 'in-progress'] },
                _id: { $ne: call._id }, // Exclude current call
                ...(currentUserId ? { initiatedBy: currentUserId } : {}) // Only check for same user's calls
            });

            if (finalActiveCheck && currentUserId) {
                // Same user has another active call - mark this one as scheduled and queue it
                call.status = 'scheduled';
                call.scheduledAt = new Date();
                await call.save();
                
                // Release lock
                callInitiationLock = false;
                console.log(`🔓 [CALL_INIT] Lock released - Call ${call._id} queued due to same user's active call`);

                // Add to queue
                addToQueueSafely({
                    callId: call._id.toString(),
                    leadId: leadId,
                    phoneNumber: formattedPhoneNumber,
                    delay: 5000,
                    completed: 0
                });

                // Start processing queue if not already processing
                if (!isProcessingQueue && !queuePaused) {
                    processCallQueue().catch(err => {
                        console.error('Error processing call queue:', err);
                    });
                }

                return res.status(200).json({
                    success: true,
                    message: 'Another call became active. This call has been scheduled and will be processed automatically.',
                    call: {
                        id: call._id,
                        sessionId: call.sessionId,
                        leadId: leadId,
                        phoneNumber: formattedPhoneNumber,
                        status: 'scheduled'
                    }
                });
            }

            // Prepare lead information for the bot
            const leadInfo = {
                firstName: lead.firstName || null,
                lastName: lead.lastName || null,
                email: lead.email || null,
                phone: formattedPhoneNumber, // Use formatted phone number
                country: lead.country || null,
                brand: lead.Brand || null,
                address: lead.Address || null,
                status: lead.status || null
            };
            
            // Store leadId, callId, and leadInfo in session metadata
            const callSession = await global.voipAgent.makeCall(formattedPhoneNumber, process.env.AZURE_TTS_VOICE || 'en-US-AvaMultilingualNeural', null, { 
                leadId: leadId,
                callId: call._id.toString(), // Pass MongoDB call ID as callId
                leadInfo: leadInfo, // Pass lead information for personalized conversation
                userId: req.user ? req.user._id.toString() : null,
                userVapiConfig: userVapiConfig, // Pass user's Vapi config if available
                userSipConfig: userSipConfig // Pass user's SIP config if enabled, otherwise null (uses default)
            });
            
            // Update call with session info
            call.sessionId = callSession.id || sessionId;
            await call.save();
            
            // ✅ CRITICAL: Keep lock active for cooldown period to prevent race conditions
            // Release lock after a short delay to ensure call status is properly set
            setTimeout(() => {
                callInitiationLock = false;
                console.log(`🔓 [CALL_INIT] Lock released after cooldown - Call ${call._id} is now active`);
            }, CALL_INITIATION_COOLDOWN);

            // Update call status to in-progress when call starts
            setTimeout(async () => {
                const updatedCall = await Call.findById(call._id);
                if (updatedCall && updatedCall.status === 'ringing') {
                    updatedCall.status = 'in-progress';
                    await updatedCall.save();
                    
                    if (global.io) {
                        // OPTIMIZED: Emit asynchronously to prevent blocking
                        setImmediate(() => {
                            if (global.io) {
                                global.io.emit('call:status:update', {
                                    callId: call._id,
                                    sessionId: call.sessionId,
                                    leadId: leadId,
                                    status: 'in-progress'
                                });
                            }
                        });
                    }
                }
            }, 2000);
        } else {
            return next(new ErrorHandler('VoIP agent not initialized', 500));
        }

        res.status(200).json({
            success: true,
            call: {
                id: call._id,
                sessionId: call.sessionId,
                leadId: leadId,
                phoneNumber: formattedPhoneNumber,
                status: call.status
            }
        });

    } catch (error) {
        console.error('Error initiating call:', error);
        
        // ✅ CRITICAL: Release lock on error
        callInitiationLock = false;
        console.log(`🔓 [CALL_INIT] Lock released due to error`);
        
        // Check if it's a Vapi configuration/authentication error
        const errorMessage = error.message || '';
        const isVapiError = errorMessage.includes('Vapi') || errorMessage.includes('VAPI') || 
                           errorMessage.includes('authentication failed') || 
                           errorMessage.includes('API key') ||
                           errorMessage.includes('not configured');
        
        // Mark call as failed on error so it doesn't stick in "ringing"
        try {
            const Call = await getCallModel();
            // Find the call we just created (most recent for this lead)
            let failedCall = null;
            if (typeof call !== 'undefined' && call?._id) {
                failedCall = await Call.findById(call._id);
            } else if (leadId || (req && req.body && req.body.leadId)) {
                // Fallback: find most recent ringing call for this lead
                failedCall = await Call.findOne({
                    leadId: leadId || req.body.leadId,
                    status: 'ringing'
                }).sort({ createdAt: -1 });
            }
            
            if (failedCall) {
                // Format phone number if available
                const errorPhoneNumber = (typeof phoneNumber !== 'undefined' && phoneNumber) 
                    ? formatPhoneNumber(phoneNumber) 
                    : (req && req.body && req.body.phoneNumber ? formatPhoneNumber(req.body.phoneNumber) : undefined);
                
                // Prefer updating through centralized status updater to propagate SSE/socket
                await exports.updateCallStatusInternal(failedCall.sessionId, 'failed', {
                    callId: failedCall._id,
                    leadId: leadId || failedCall.leadId,
                    phoneNumber: errorPhoneNumber,
                    sipCode: isVapiError ? 401 : 408,
                    sipMessage: isVapiError ? 'Vapi Configuration Error' : 'Request Timeout',
                    sipType: isVapiError ? 'vapi_error' : 'timeout'
                });
            }
        } catch (e) {
            console.error('Error marking call as failed in error handler:', e);
        }
        
        // Return appropriate error response
        if (isVapiError) {
            return res.status(400).json({
                success: false,
                message: errorMessage,
                msg: errorMessage,
                requiresVapiConfig: true
            });
        }
        
        return next(new ErrorHandler(errorMessage || 'Failed to initiate call', 500));
    }
});

// Global call queue for sequential calling
let callQueue = [];
let isProcessingQueue = false;
let queuePaused = false;
let currentCall = null;
let callInitiationLock = false; // ✅ CRITICAL: Lock to prevent race conditions during call initiation
let lastCallInitiationTime = 0; // Track when last call was initiated
const CALL_INITIATION_COOLDOWN = 3000; // 3 second cooldown after initiating a call

// Deduplication: Track call IDs currently in queue to prevent duplicates
const queueCallIds = new Set();

// Helper function to add to queue with deduplication
function addToQueueSafely(queueItem) {
    const callId = queueItem.callId || queueItem._id?.toString();
    if (!callId) {
        console.warn('⚠️ [QUEUE] Cannot add item to queue: missing callId');
        return false;
    }
    
    // Check if already in queue – avoid noisy logs on expected duplicates
    if (queueCallIds.has(callId)) {
        // Only log when debug flag enabled to reduce log spam
        if (process.env.DEBUG_QUEUE === 'true') {
            console.log(`⚠️ [QUEUE] Call ${callId} already in queue, skipping duplicate...`);
        }
        return false;
    }
    
    // Add to queue and tracking set
    callQueue.push(queueItem);
    queueCallIds.add(callId);
    console.log(`📥 [QUEUE] Call ${callId} enqueued (queue size: ${callQueue.length})`);
    return true;
}

// Store SSE clients for call updates
const sseClients = new Set();

/**
 * Process call queue sequentially (one by one)
 */
async function processCallQueue() {
    if (isProcessingQueue || callQueue.length === 0 || queuePaused) {
        return;
    }

    isProcessingQueue = true;
    const Call = await getCallModel();

    while (callQueue.length > 0 && !queuePaused) {
        const queueItem = callQueue.shift();
        const { callId, leadId, phoneNumber, delay = 5000 } = queueItem;
        
        // Remove from deduplication set
        queueCallIds.delete(callId);
        
        try {
            // If queue was paused after this iteration started, defer this item
            if (queuePaused) {
                console.log(`⏸️ [QUEUE] Queue paused, deferring call ${callId} until resume`);
                callQueue.unshift(queueItem);
                queueCallIds.add(callId);
                break;
            }
            
            // Wait for delay before next call
            if (delay > 0) {
                await new Promise(resolve => setTimeout(resolve, delay));
                
                // Re-check pause after waiting
                if (queuePaused) {
                    console.log(`⏸️ [QUEUE] Queue paused during delay, deferring call ${callId} until resume`);
                    callQueue.unshift(queueItem);
                    queueCallIds.add(callId);
                    break;
                }
            }
        
            // ✅ CRITICAL: Check if there's an active call - wait until it finishes
            // This ensures ONLY ONE call is active at a time
            let activeCall = await Call.findOne({
                status: { $in: ['ringing', 'in-progress'] }
            });
        
            if (activeCall) {
                console.log(`⏳ [QUEUE] Active call found (${activeCall.sessionId}), waiting for it to finish before processing next call...`);
                // Wait for active call to finish (with timeout to prevent infinite wait)
                await waitForCallToFinish(activeCall.sessionId, 120000); // 2 minute max wait

                // If queue was paused while waiting for the active call, stop before starting a new one
                if (queuePaused) {
                    console.log(`⏸️ [QUEUE] Queue paused while waiting for active call, deferring call ${callId} until resume`);
                    callQueue.unshift(queueItem);
                    queueCallIds.add(callId);
                    break;
                }
                
                // Double-check after waiting (in case another call started)
                activeCall = await Call.findOne({
                    status: { $in: ['ringing', 'in-progress'] }
                });
                if (activeCall) {
                    console.log(`⚠️ [QUEUE] Another call became active while waiting, re-queuing current call...`);
                    // Re-add to queue with retry count
                    queueItem.retryCount = (queueItem.retryCount || 0) + 1;
                    if (addToQueueSafely(queueItem)) {
                        // Item added successfully
                    }
                    continue;
                }
            }

            // Get call record
            const call = await Call.findById(callId);
            if (!call) {
                console.log(`⚠️ [QUEUE] Call ${callId} not found, skipping...`);
                continue;
            }
            
            // Skip if call is already completed or failed
            if (call.status === 'completed' || call.status === 'failed') {
                console.log(`⚠️ [QUEUE] Call ${callId} already ${call.status}, skipping...`);
                continue;
            }
            
            // If call is ringing but not scheduled, check if it's stuck
            if (call.status === 'ringing' && call.status !== 'scheduled') {
                const timeSinceRinging = call.startedAt ? (Date.now() - new Date(call.startedAt).getTime()) : 0;
                if (timeSinceRinging > 120000) {
                    // Stuck in ringing for more than 2 minutes - reset to scheduled
                    console.log(`⚠️ [QUEUE] Call ${callId} stuck in ringing for ${Math.round(timeSinceRinging/1000)}s, resetting to scheduled...`);
                    call.status = 'scheduled';
                    await call.save();
                } else {
                    // Still within timeout, skip this call
                    console.log(`⚠️ [QUEUE] Call ${callId} already ringing (${Math.round(timeSinceRinging/1000)}s ago), skipping...`);
                    continue;
                }
            }
            
            // Ensure call is in scheduled status before processing
            if (call.status !== 'scheduled') {
                console.log(`⚠️ [QUEUE] Call ${callId} not in scheduled status (${call.status}), skipping...`);
                continue;
            }

            // ✅ CRITICAL: Final check before marking as ringing - ensure no other call became active FOR THIS USER
            // Allow multiple admins to make calls simultaneously - only check for same user's active calls
            const callUserId = call.initiatedBy ? call.initiatedBy.toString() : null;
            
            const finalActiveCheck = await Call.findOne({
                status: { $in: ['ringing', 'in-progress'] },
                _id: { $ne: call._id }, // Exclude current call
                ...(callUserId ? { initiatedBy: callUserId } : {}) // Only check for same user's calls
            });

            if (finalActiveCheck && callUserId) {
                console.log(`⚠️ [QUEUE] Same user has another active call (${finalActiveCheck.sessionId}), re-queuing call ${callId}...`);
                // Re-add to queue with retry count
                queueItem.retryCount = (queueItem.retryCount || 0) + 1;
                if (addToQueueSafely(queueItem)) {
                    // Item added successfully
                }
                continue;
            }

            currentCall = call;

            // Update status to ringing
            call.status = 'ringing';
            call.startedAt = new Date();
            await call.save();
            
            console.log(`✅ [QUEUE] Starting call ${callId} - status set to ringing`);

            // Prepare event data for both Socket.io and SSE
            const queueEventData = {
                callId: call._id,
                sessionId: call.sessionId,
                leadId: leadId,
                status: 'ringing',
                phoneNumber: phoneNumber,
                startedAt: call.startedAt
            };

            // OPTIMIZED: Emit status update asynchronously to prevent blocking during bulk operations
            setImmediate(() => {
                if (global.io) {
                    global.io.emit('call:status:update', queueEventData);

                    global.io.emit('bulk:call:progress', {
                        total: queueItem.total,
                        completed: queueItem.completed,
                        current: {
                            callId: call._id,
                            leadId: leadId,
                            phoneNumber: phoneNumber,
                            status: 'ringing'
                        }
                    });
                }
                
                // ✅ CRITICAL: Also emit to SSE clients
                sseClients.forEach(client => {
                    try {
                        if (!client.destroyed && sseClients.has(client)) {
                            const sseMessage = JSON.stringify({ 
                                type: 'call:status:update', 
                                ...queueEventData 
                            });
                            client.write(`data: ${sseMessage}\n\n`);
                            console.log(`📡 [SSE] Emitted queue call:status:update:`, {
                                callId: queueEventData.callId,
                                sessionId: queueEventData.sessionId,
                                status: queueEventData.status
                            });
                        }
                    } catch (error) {
                        console.error('❌ [SSE] Error sending queue update to client:', error);
                        sseClients.delete(client);
                    }
                });
            });

            // Initiate call
            if (global.voipAgent) {
                // ✅ CRITICAL: Check lock and cooldown before making VoIP call
                const now = Date.now();
                const timeSinceLastCall = now - lastCallInitiationTime;
                
                // Check if call has been stuck in ringing status for too long (more than 2 minutes)
                const timeSinceRinging = call.startedAt ? (now - new Date(call.startedAt).getTime()) : 0;
                if (call.status === 'ringing' && timeSinceRinging > 120000) {
                    console.log(`⚠️ [QUEUE] Call ${callId} stuck in ringing status for ${Math.round(timeSinceRinging/1000)}s, marking as failed...`);
                    call.status = 'failed';
                    call.endedAt = new Date();
                    call.error = 'Call stuck in ringing status - timeout after 2 minutes';
                    await call.save();
                
                // Release lock if this call was holding it
                if (callInitiationLock) {
                    callInitiationLock = false;
                    console.log(`🔓 [QUEUE] Lock released - Call ${callId} timed out`);
                }
                
                if (global.io) {
                    // OPTIMIZED: Emit asynchronously to prevent blocking during bulk operations
                    setImmediate(() => {
                        if (global.io) {
                            global.io.emit('call:status:update', {
                                callId: call._id,
                                sessionId: call.sessionId,
                                leadId: leadId,
                                status: 'failed',
                                error: call.error
                            });
                        }
                    });
                }
                continue;
            }
            
            // Check retry count to prevent infinite loops
            const retryCount = queueItem.retryCount || 0;
            if (retryCount >= 3) {
                console.log(`⚠️ [QUEUE] Call ${callId} exceeded max retries (${retryCount}), marking as failed...`);
                call.status = 'failed';
                call.endedAt = new Date();
                call.error = 'Call failed after maximum retry attempts';
                await call.save();
                
                // Release lock if this call was holding it
                if (callInitiationLock) {
                    callInitiationLock = false;
                    console.log(`🔓 [QUEUE] Lock released - Call ${callId} exceeded retries`);
                }
                
                if (global.io) {
                    // OPTIMIZED: Emit asynchronously to prevent blocking during bulk operations
                    setImmediate(() => {
                        if (global.io) {
                            global.io.emit('call:status:update', {
                                callId: call._id,
                                sessionId: call.sessionId,
                                leadId: leadId,
                                status: 'failed',
                                error: call.error
                            });
                        }
                    });
                }
                continue;
            }
            
            if (callInitiationLock || timeSinceLastCall < CALL_INITIATION_COOLDOWN) {
                const waitTime = callInitiationLock ? CALL_INITIATION_COOLDOWN : (CALL_INITIATION_COOLDOWN - timeSinceLastCall);
                console.log(`⚠️ [QUEUE] Call initiation lock active or cooldown period (${timeSinceLastCall}ms < ${CALL_INITIATION_COOLDOWN}ms), waiting ${waitTime}ms before retry...`);
                
                // Wait for lock/cooldown
                await new Promise(resolve => setTimeout(resolve, waitTime));
                
                // Check again after waiting - if still locked, re-queue with retry count
                if (callInitiationLock || (Date.now() - lastCallInitiationTime) < CALL_INITIATION_COOLDOWN) {
                    console.log(`⚠️ [QUEUE] Still locked after wait, re-queuing call ${callId} (retry ${retryCount + 1})...`);
                    // Re-add to queue with incremented retry count
                    queueItem.retryCount = retryCount + 1;
                    if (addToQueueSafely(queueItem)) {
                        // Reset call status back to scheduled
                        call.status = 'scheduled';
                        await call.save();
                    }
                    continue;
                }
            }

            // ✅ CRITICAL: Final check right before making VoIP call - ensure no other call is active
            const finalActiveCheck = await Call.findOne({
                status: { $in: ['ringing', 'in-progress'] },
                _id: { $ne: call._id } // Exclude current call
            });

            if (finalActiveCheck) {
                console.log(`⚠️ [QUEUE] Another call became active (${finalActiveCheck.sessionId}) right before VoIP call, re-queuing call ${callId}...`);
                // Re-add to queue with retry count
                queueItem.retryCount = (queueItem.retryCount || 0) + 1;
                if (addToQueueSafely(queueItem)) {
                    // Reset call status back to scheduled
                    call.status = 'scheduled';
                    await call.save();
                }
                continue;
            }

            // ✅ CRITICAL: Check if queue was paused RIGHT BEFORE making the actual call
            if (queuePaused) {
                console.log(`⏸️ [QUEUE] Queue paused right before making call ${callId}, deferring until resume`);
                // Reset call status back to scheduled
                call.status = 'scheduled';
                await call.save();
                // Re-add to queue
                callQueue.unshift(queueItem);
                queueCallIds.add(callId);
                break; // Exit the loop - no more calls will be processed
            }
            
            // ✅ CRITICAL: Set lock before making VoIP call
            callInitiationLock = true;
            lastCallInitiationTime = Date.now();
            console.log(`🔒 [QUEUE] Lock set - Call ${callId} initiating from queue`);
            
            // Set a timeout to release lock if call doesn't start within reasonable time
            const lockTimeout = setTimeout(() => {
                if (callInitiationLock) {
                    console.log(`⚠️ [QUEUE] Lock timeout - releasing lock for call ${callId}`);
                    callInitiationLock = false;
                }
            }, 30000); // 30 second timeout

                // Fetch lead information for personalized conversation
                const Lead = await getLeadModel();
                const lead = await Lead.findById(leadId);
                
                const leadInfo = lead ? {
                    firstName: lead.firstName || null,
                    lastName: lead.lastName || null,
                    email: lead.email || null,
                    phone: lead.phone || null,
                    country: lead.country || null,
                    brand: lead.Brand || null,
                    address: lead.Address || null,
                    status: lead.status || null
                } : {};
                
                // ✅ Vapi Config Logic (same as initiateCall):
                // - ALL users (including superadmin) MUST use their profile Vapi config (dynamic from profile)
                // - No default fallback to env - everyone must configure their own keys
                let queueUserVapiConfig = null;
                let queueUserSipConfig = null;
                if (call.initiatedBy) {
                    const User = require('../models/userModel');
                    const user = await User.findById(call.initiatedBy).select('vapiConfig sipConfig role email');
                    
                    if (user && (user.role === 'superadmin' || user.role === 'admin' || user.role === 'subadmin')) {
                        // All admins and superadmin must have Vapi config enabled in their profile
                        if (!user.vapiConfig || !user.vapiConfig.enabled) {
                            console.error(`❌ [QUEUE] ${user.role} ${user.email} call failed: Vapi config not enabled in profile`);
                            call.status = 'failed';
                            call.endedAt = new Date();
                            call.error = 'Vapi configuration is not enabled. Please enable and configure your Vapi settings in your profile before making calls.';
                            await call.save();
                            
                            if (global.io) {
                                global.io.emit('call:status:update', {
                                    callId: call._id,
                                    sessionId: call.sessionId,
                                    leadId: leadId,
                                    status: 'failed',
                                    error: call.error
                                });
                            }
                            continue;
                        }
                        
                        if (!user.vapiConfig.apiKey) {
                            console.error(`❌ [QUEUE] ${user.role} ${user.email} call failed: Vapi API key missing from profile`);
                            call.status = 'failed';
                            call.endedAt = new Date();
                            call.error = 'Vapi API key is not configured. Please configure your Vapi settings in your profile before making calls.';
                            await call.save();
                            
                            if (global.io) {
                                global.io.emit('call:status:update', {
                                    callId: call._id,
                                    sessionId: call.sessionId,
                                    leadId: leadId,
                                    status: 'failed',
                                    error: call.error
                                });
                            }
                            continue;
                        }
                        
                        // Use user's profile Vapi config (dynamic from profile)
                        queueUserVapiConfig = {
                            apiKey: user.vapiConfig.apiKey,
                            assistantId: user.vapiConfig.assistantId || null,
                            phoneNumberId: user.vapiConfig.phoneNumberId || null,
                            enabled: true
                        };
                        console.log(`🔧 [QUEUE] Using ${user.role} Vapi config from profile for user: ${user.email}`);
                        
                        // Check if user has custom SIP config enabled
                        if (user.sipConfig && user.sipConfig.enabled) {
                            queueUserSipConfig = {
                                server: user.sipConfig.server,
                                username: user.sipConfig.username,
                                password: user.sipConfig.password,
                                port: user.sipConfig.port || 5060,
                                enabled: true
                            };
                            console.log(`🔧 [QUEUE] Using ${user.role} custom SIP config from profile for user: ${user.email}`);
                        } else {
                            console.log(`🔧 [QUEUE] Using default SIP config from environment for user: ${user.email}`);
                        }
                    } else {
                        // User not found or not admin/superadmin
                        console.error(`❌ [QUEUE] Call failed: User not found or does not have permission`);
                        call.status = 'failed';
                        call.endedAt = new Date();
                        call.error = 'User not found or does not have permission to make calls.';
                        await call.save();
                        continue;
                    }
                } else {
                    // No initiatedBy - cannot proceed without user
                    console.error(`❌ [QUEUE] Call failed: No user associated with call`);
                    call.status = 'failed';
                    call.endedAt = new Date();
                    call.error = 'No user associated with call. Cannot proceed without Vapi configuration.';
                    await call.save();
                    continue;
                }
                
                console.log(`📞 [QUEUE] Making VoIP call for call ${callId} (${phoneNumber})...`);
                const callSession = await global.voipAgent.makeCall(phoneNumber, process.env.AZURE_TTS_VOICE || 'en-US-AvaMultilingualNeural', null, { 
                    leadId: leadId,
                    callId: call._id.toString(),
                    sessionId: call.sessionId, // Pass the CRM sessionId so VoIP agent can use it
                    leadInfo: leadInfo, // Pass lead information for personalized conversation
                    userId: call.initiatedBy ? call.initiatedBy.toString() : null,
                    userVapiConfig: queueUserVapiConfig, // Pass user's Vapi config if available
                    userSipConfig: queueUserSipConfig // Pass user's SIP config if enabled, otherwise null (uses default)
                });
                
                // Update call with VoIP session ID if different
                if (callSession && callSession.id && callSession.id !== call.sessionId) {
                    call.sessionId = callSession.id;
                    await call.save();
                }
                
                // Clear lock timeout since call started successfully
                clearTimeout(lockTimeout);
                
                // ✅ CRITICAL: Keep lock active for cooldown period to prevent race conditions
                // Release lock after a short delay to ensure call status is properly set
                setTimeout(() => {
                    callInitiationLock = false;
                    console.log(`🔓 [QUEUE] Lock released after cooldown - Call ${callId} is now active`);
                }, CALL_INITIATION_COOLDOWN);

                // Wait for call to complete (max 2 minutes for queue processing)
                // If call doesn't complete within 2 minutes, mark as failed and move on
                const callStartTime = Date.now();
                const CALL_TIMEOUT = 120000; // 2 minutes timeout
                
                try {
                    await waitForCallToFinish(call.sessionId, CALL_TIMEOUT);
                    
                    // Check if call actually completed or if it timed out
                    const updatedCall = await Call.findById(callId);
                    if (updatedCall && updatedCall.status !== 'completed' && updatedCall.status !== 'failed') {
                        const timeElapsed = Date.now() - callStartTime;
                        if (timeElapsed >= CALL_TIMEOUT) {
                            console.log(`⚠️ [QUEUE] Call ${callId} timed out after ${Math.round(timeElapsed/1000)}s, marking as failed...`);
                            updatedCall.status = 'failed';
                            updatedCall.endedAt = new Date();
                            updatedCall.error = 'Call timed out - did not complete within 2 minutes';
                            await updatedCall.save();
                            
                            // OPTIMIZED: Emit asynchronously to prevent blocking during bulk operations
                            setImmediate(() => {
                                if (global.io) {
                                    global.io.emit('call:status:update', {
                                        callId: updatedCall._id,
                                        sessionId: updatedCall.sessionId,
                                        leadId: leadId,
                                        status: 'failed',
                                        error: updatedCall.error
                                    });
                                }
                            });
                        }
                    }
                } catch (timeoutError) {
                    console.log(`⚠️ [QUEUE] Call ${callId} wait timeout, marking as failed...`);
                    const updatedCall = await Call.findById(callId);
                    if (updatedCall && updatedCall.status !== 'completed' && updatedCall.status !== 'failed') {
                        updatedCall.status = 'failed';
                        updatedCall.endedAt = new Date();
                        updatedCall.error = 'Call wait timeout - call did not complete in time';
                        await updatedCall.save();
                        
                        if (global.io) {
                            global.io.emit('call:status:update', {
                                callId: updatedCall._id,
                                sessionId: updatedCall.sessionId,
                                leadId: leadId,
                                status: 'failed',
                                error: updatedCall.error
                            });
                        }
                    }
                }

                // Update completed count
                queueItem.completed++;
            }

        } catch (error) {
            console.error(`Error processing call ${callId}:`, error);
            
            // ✅ CRITICAL: Release lock on error
            callInitiationLock = false;
            console.log(`🔓 [QUEUE] Lock released due to error in call ${callId}`);
            
            // Clear lock timeout if it exists
            if (typeof lockTimeout !== 'undefined') {
                clearTimeout(lockTimeout);
            }
            
            const call = await Call.findById(callId);
            if (call) {
                // Only mark as failed if it's not already completed
                if (call.status !== 'completed' && call.status !== 'failed') {
                    call.status = 'failed';
                    call.endedAt = new Date();
                    call.error = error.message || 'Call processing error';
                    await call.save();
                    
                    if (global.io) {
                        global.io.emit('call:status:update', {
                            callId: call._id,
                            sessionId: call.sessionId,
                            leadId: leadId,
                            status: 'failed',
                            error: call.error
                        });
                    }
                }
            }
        }

        currentCall = null;
    }

    isProcessingQueue = false;

    // Emit completion
    if (global.io) {
        global.io.emit('bulk:call:complete', {
            message: 'All calls in queue completed'
        });
    }
}

/**
 * Wait for call to finish
 * @param {string} sessionId - Call session ID
 * @param {number} maxWait - Maximum wait time in milliseconds (default 2 minutes)
 * @returns {Promise<void>}
 */
async function waitForCallToFinish(sessionId, maxWait = 120000) {
    const Call = await getCallModel();
    const startTime = Date.now();
    const checkInterval = 3000; // Check every 3 seconds
    let lastStatus = null;
    let stuckCount = 0; // Track how many times status hasn't changed

    while (Date.now() - startTime < maxWait) {
        const call = await Call.findOne({ sessionId: sessionId });
        
        if (!call) {
            console.log(`⚠️ [WAIT] Call with sessionId ${sessionId} not found, stopping wait`);
            return;
        }
        
        // Check if call is in a terminal state
        if (call.status === 'completed' || call.status === 'failed' || call.status === 'no-answer' || call.status === 'cancelled') {
            console.log(`✅ [WAIT] Call ${sessionId} finished with status: ${call.status}`);
            return;
        }
        
        // Detect if call is stuck in same status
        if (call.status === lastStatus) {
            stuckCount++;
        } else {
            stuckCount = 0;
            lastStatus = call.status;
        }
        
        // If call has been in "queued" or "ringing" status for more than 1 minute, consider it stuck
        const timeElapsed = Date.now() - startTime;
        if ((call.status === 'queued' || call.status === 'ringing') && timeElapsed > 60000) {
            console.log(`⚠️ [WAIT] Call ${sessionId} stuck in ${call.status} status for ${Math.round(timeElapsed/1000)}s, marking as failed...`);
            call.status = 'failed';
            call.endedAt = new Date();
            call.error = `Call stuck in ${call.status} status for more than 1 minute`;
            await call.save();
            return;
        }
        
        // If call has been in "in-progress" for more than 5 minutes, consider it stuck
        if (call.status === 'in-progress' && timeElapsed > 300000) {
            console.log(`⚠️ [WAIT] Call ${sessionId} stuck in in-progress status for ${Math.round(timeElapsed/1000)}s, marking as failed...`);
            call.status = 'failed';
            call.endedAt = new Date();
            call.error = 'Call stuck in in-progress status for more than 5 minutes';
            await call.save();
            return;
        }

        await new Promise(resolve => setTimeout(resolve, checkInterval));
    }
    
    // Timeout reached - mark call as failed if still active
    const call = await Call.findOne({ sessionId: sessionId });
    if (call && call.status !== 'completed' && call.status !== 'failed') {
        console.log(`⚠️ [WAIT] Call ${sessionId} wait timeout after ${Math.round(maxWait/1000)}s, marking as failed...`);
        call.status = 'failed';
        call.endedAt = new Date();
        call.error = `Call did not complete within ${Math.round(maxWait/1000)} seconds`;
        await call.save();
    }
}

/**
 * Bulk call leads (automatic) - Sequential one-by-one calling
 */
exports.bulkCallLeads = catchAsyncErrors(async (req, res, next) => {
    try {
        const { leadIds, options = {} } = req.body;

        if (!leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
            return next(new ErrorHandler('Lead IDs array is required', 400));
        }

        // ✅ CRITICAL: Check permissions for admin users
        if (req.user && req.user.role === 'admin') {
            const { getCachedUserPermissions } = require('./crmController');
            const userPerms = await getCachedUserPermissions(req.user._id);
            
            // Check if admin has permission to make calls
            if (!userPerms?.adminPermissions?.canMakeCalls) {
                return res.status(403).json({
                    success: false,
                    message: 'You do not have permission to make calls. Please contact your administrator.',
                    msg: 'You do not have permission to make calls. Please contact your administrator.'
                });
            }
        }

        // ✅ CRITICAL: All admins and superadmin MUST configure their own Vapi keys (no default fallback)
        let userVapiConfig = null;
        let userSipConfig = null;
        if (req.user && (req.user.role === 'admin' || req.user.role === 'subadmin' || req.user.role === 'superadmin')) {
            const User = require('../models/userModel');
            const user = await User.findById(req.user._id).select('vapiConfig sipConfig role email');
            
            if (!user.vapiConfig || !user.vapiConfig.apiKey) {
                return res.status(400).json({
                    success: false,
                    message: 'Vapi API key is not configured. Please configure your Vapi settings in your profile before making calls.',
                    msg: 'Vapi API key is not configured. Please configure your Vapi settings in your profile before making calls.',
                    requiresVapiConfig: true
                });
            }
            
            // Use admin's/superadmin's own Vapi config
            userVapiConfig = {
                apiKey: user.vapiConfig.apiKey,
                assistantId: user.vapiConfig.assistantId || null,
                phoneNumberId: user.vapiConfig.phoneNumberId || null,
                enabled: true
            };
            console.log(`🔧 [BULK] Using ${user.role} Vapi config for user: ${user.email}`);
            
            // Check if user has custom SIP config enabled
            if (user.sipConfig && user.sipConfig.enabled) {
                userSipConfig = {
                    server: user.sipConfig.server,
                    username: user.sipConfig.username,
                    password: user.sipConfig.password,
                    port: user.sipConfig.port || 5060,
                    enabled: true
                };
                console.log(`🔧 [BULK] Using ${user.role} custom SIP config for user: ${user.email}`);
            } else {
                console.log(`🔧 [BULK] Using default SIP config from environment for user: ${user.email}`);
            }
        }

        const Lead = await getLeadModel();
        const Call = await getCallModel();

        // ✅ CRITICAL: Check if user has access to the leads they're trying to call
        const currentUser = req.user;
        const accessibleLeadIds = await getAccessibleLeadIds(currentUser);
        
        // Filter leadIds based on access control
        let authorizedLeadIds = leadIds;
        if (accessibleLeadIds !== null) {
            // User has restricted access - filter to only accessible leads
            authorizedLeadIds = leadIds.filter(id => {
                return accessibleLeadIds.some(accessibleId => 
                    accessibleId.toString() === id.toString()
                );
            });
            
            if (authorizedLeadIds.length === 0) {
                return res.status(403).json({
                    success: false,
                    message: 'You do not have access to call any of the selected leads.',
                    msg: 'You do not have access to call any of the selected leads.'
                });
            }
            
            if (authorizedLeadIds.length < leadIds.length) {
                console.log(`⚠️ [BULK] User ${currentUser._id} attempted to call ${leadIds.length} leads, but only has access to ${authorizedLeadIds.length}`);
            }
        }

        // Get leads with phone numbers (only authorized leads)
        const leads = await Lead.find({ 
            _id: { $in: authorizedLeadIds },
            phone: { $exists: true, $ne: null, $ne: '' }
        });

        if (leads.length === 0) {
            return next(new ErrorHandler('No valid leads with phone numbers found', 404));
        }

        const calls = [];
        const delay = options.delay || 5000; // 5 seconds between calls (after previous call ends)

        // Create call records and add to queue
        for (let i = 0; i < leads.length; i++) {
            const lead = leads[i];

            const sessionId = `bulk_call_${Date.now()}_${i}_${Math.random().toString(36).substr(2, 9)}`;
            const call = new Call({
                leadId: lead._id,
                sessionId: sessionId,
                phoneNumber: lead.phone,
                status: 'scheduled',
                callType: 'automatic',
                scheduledAt: new Date(),
                initiatedBy: req.user ? req.user._id : null // Store who initiated the bulk call
            });
            await call.save();
            calls.push(call);

            // Add to queue
            addToQueueSafely({
                callId: call._id,
                leadId: lead._id,
                phoneNumber: lead.phone,
                delay: i === 0 ? 0 : delay, // No delay for first call
                total: leads.length,
                completed: 0
            });

            // Link call to lead
            if (!lead.callHistory) {
                lead.callHistory = [];
            }
            if (!lead.callHistory.includes(call._id)) {
                lead.callHistory.push(call._id);
                await lead.save();
            }
        }

        // Start processing queue
        processCallQueue().catch(err => {
            console.error('Error processing call queue:', err);
        });

        res.status(200).json({
            success: true,
            message: `Queued ${calls.length} calls for sequential processing`,
            calls: calls.map(c => ({
                id: c._id,
                sessionId: c.sessionId,
                leadId: c.leadId,
                phoneNumber: c.phoneNumber,
                status: c.status
            })),
            queueSize: callQueue.length
        });

    } catch (error) {
        console.error('Error in bulk call:', error);
        return next(new ErrorHandler(error.message || 'Failed to initiate bulk calls', 500));
    }
});

/**
 * Get call queue status
 */
exports.getCallQueueStatus = catchAsyncErrors(async (req, res, next) => {
    try {
        const Call = await getCallModel();
        // Ensure Lead model is registered on same connection before populating
        await getLeadModel();
        const currentUser = req.user;
        
        // Optional pagination for scheduled (pending) calls list
        const scheduledPage = parseInt(req.query.scheduledPage || '1', 10);
        const scheduledLimit = parseInt(req.query.scheduledLimit || '20', 10);
        const scheduledSkip = (scheduledPage - 1) * scheduledLimit;

        // ✅ CRITICAL: For admin users, filter by initiatedBy to show only their own calls
        // Build query filters
        const activeCallQuery = {
            status: { $in: ['ringing', 'in-progress'] }
        };
        
        const pendingCallsQuery = {
            status: 'scheduled',
            scheduledAt: { $lte: new Date() } // Only scheduled calls that are due
        };

        const scheduledCountQuery = {
            status: 'scheduled'
        };

        const totalDueScheduledQuery = {
            status: 'scheduled',
            scheduledAt: { $lte: new Date() }
        };

        // ✅ CRITICAL: For admin users, filter by initiatedBy
        if (currentUser && currentUser.role === 'admin') {
            activeCallQuery.initiatedBy = currentUser._id;
            pendingCallsQuery.initiatedBy = currentUser._id;
            scheduledCountQuery.initiatedBy = currentUser._id;
            totalDueScheduledQuery.initiatedBy = currentUser._id;
        } else {
            // ✅ OPTIMIZED: Apply access control with timeout to prevent blocking (for superadmin/subadmin)
            const accessibleLeadIds = await Promise.race([
                getAccessibleLeadIds(currentUser),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 2000))
            ]).catch(() => null); // Fallback to null on timeout
            
            // Apply lead filtering if user is not superadmin
            if (accessibleLeadIds !== null) {
                if (accessibleLeadIds.length === 0) {
                    // User has no access - return empty queue
                    return res.status(200).json({
                        success: true,
                        queue: {
                            pending: 0,
                            isProcessing: false,
                            isPaused: queuePaused,
                            currentCall: null,
                            activeCall: null,
                            pendingCalls: [],
                            totalScheduled: 0,
                            scheduledPagination: {
                                page: scheduledPage,
                                limit: scheduledLimit,
                                total: 0,
                                totalPages: 0
                            }
                        }
                    });
                }
                activeCallQuery.leadId = { $in: accessibleLeadIds };
                pendingCallsQuery.leadId = { $in: accessibleLeadIds };
                scheduledCountQuery.leadId = { $in: accessibleLeadIds };
                totalDueScheduledQuery.leadId = { $in: accessibleLeadIds };
            }
        }
        
        // ✅ OPTIMIZED: Run all queries in parallel with timeouts to prevent blocking
        const [activeCall, pendingCalls, allScheduledCalls, totalDueScheduled] = await Promise.all([
            Call.findOne(activeCallQuery)
                .select('+metadata')
                .populate('leadId', 'firstName lastName email phone')
                .lean()
                .maxTimeMS(2000)
                .catch(() => null),
            Call.find(pendingCallsQuery)
                .select('_id sessionId leadId phoneNumber status scheduledAt metadata')
                .populate('leadId', 'firstName lastName email phone')
                .sort({ scheduledAt: 1 })
                .skip(scheduledSkip)
                .limit(scheduledLimit)
                .lean()
                .maxTimeMS(2000)
                .catch(() => []),
            Call.countDocuments(scheduledCountQuery).maxTimeMS(2000).catch(() => 0),
            Call.countDocuments(totalDueScheduledQuery).maxTimeMS(2000).catch(() => 0)
        ]);

        res.status(200).json({
            success: true,
            queue: {
                pending: callQueue.length,
                isProcessing: isProcessingQueue,
                isPaused: queuePaused,
                currentCall: currentCall ? {
                    callId: currentCall._id,
                    leadId: currentCall.leadId,
                    phoneNumber: currentCall.phoneNumber,
                    status: currentCall.status,
                    sessionId: currentCall.sessionId
                } : null,
                activeCall: activeCall ? {
                    callId: activeCall._id,
                    leadId: activeCall.leadId,
                    phoneNumber: activeCall.phoneNumber,
                    status: activeCall.status,
                    duration: activeCall.duration,
                    sessionId: activeCall.sessionId,
                    startedAt: activeCall.startedAt,
                    leadInfo: activeCall.leadId ? {
                        firstName: activeCall.leadId.firstName,
                        lastName: activeCall.leadId.lastName,
                        email: activeCall.leadId.email,
                        phone: activeCall.leadId.phone
                    } : null
                } : null,
                pendingCalls: pendingCalls.map(call => ({
                    callId: call._id,
                    sessionId: call.sessionId,
                    leadId: call.leadId,
                    phoneNumber: call.phoneNumber,
                    status: call.status,
                    scheduledAt: call.scheduledAt,
                    leadInfo: call.leadId ? {
                        firstName: call.leadId.firstName,
                        lastName: call.leadId.lastName,
                        email: call.leadId.email,
                        phone: call.leadId.phone
                    } : null
                })),
                totalScheduled: allScheduledCalls,
                scheduledPagination: {
                    page: scheduledPage,
                    limit: scheduledLimit,
                    total: totalDueScheduled,
                    totalPages: Math.ceil(totalDueScheduled / scheduledLimit)
                }
            }
        });

    } catch (error) {
        console.error('Error getting queue status:', error);
        return next(new ErrorHandler(error.message || 'Failed to get queue status', 500));
    }
});

/**
 * Schedule a call for a specific time
 */
exports.scheduleCall = catchAsyncErrors(async (req, res, next) => {
    try {
        const { leadId, phoneNumber, scheduledAt } = req.body;

        if (!leadId || !phoneNumber || !scheduledAt) {
            return next(new ErrorHandler('Lead ID, phone number, and scheduled time are required', 400));
        }

        const Call = await getCallModel();
        const scheduledDate = new Date(scheduledAt);

        if (scheduledDate < new Date()) {
            return next(new ErrorHandler('Scheduled time must be in the future', 400));
        }

        const sessionId = `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const call = new Call({
            leadId: leadId,
            sessionId: sessionId,
            phoneNumber: phoneNumber,
            status: 'scheduled',
            callType: 'scheduled',
            scheduledAt: scheduledDate
        });
        await call.save();

        res.status(200).json({
            success: true,
            call: {
                id: call._id,
                sessionId: call.sessionId,
                leadId: leadId,
                phoneNumber: phoneNumber,
                status: call.status,
                scheduledAt: call.scheduledAt
            }
        });

    } catch (error) {
        console.error('Error scheduling call:', error);
        return next(new ErrorHandler(error.message || 'Failed to schedule call', 500));
    }
});

/**
 * Get call status
 */
exports.getCallStatus = catchAsyncErrors(async (req, res, next) => {
    try {
        const { sessionId } = req.params;

        const Call = await getCallModel();
        // Ensure Lead model is registered on same connection before populating
        await getLeadModel();
        
        // ✅ OPTIMIZED: Use lean() and add timeout to prevent blocking
        const call = await Call.findOne({ sessionId: sessionId })
        .populate('leadId', 'firstName lastName email phone')
        .lean()
        .maxTimeMS(2000) // 2 second timeout
        .catch(() => null); // Return null on error/timeout

        if (!call) {
            return next(new ErrorHandler('Call not found', 404));
        }

        res.status(200).json({
            success: true,
            call: call
        });

    } catch (error) {
        console.error('Error getting call status:', error);
        return next(new ErrorHandler(error.message || 'Failed to get call status', 500));
    }
});

/**
 * Get call history for a lead
 */
exports.getCallHistory = catchAsyncErrors(async (req, res, next) => {
    try {
        const { leadId } = req.params;
        const currentUser = req.user;
        const currentUserRole = currentUser.role;

        // Get models
        const Lead = await getLeadModel();
        const Call = await getCallModel();

        // First, verify the lead exists
        const lead = await Lead.findById(leadId);
        if (!lead) {
            return next(new ErrorHandler('Lead not found', 404));
        }

        // Apply visibility rules - same logic as in crmController.js
        let hasAccess = false;

        if (currentUserRole === 'superadmin') {
            // Superadmin can see all leads
            hasAccess = true;
        } else if (currentUserRole === 'subadmin') {
            // Subadmin: only own leads
            hasAccess = lead.agent && lead.agent.toString() === currentUser._id.toString();
        } else if (currentUserRole === 'admin') {
            // Admin: own leads + subadmins' leads only if allowed
            const me = await User.findById(currentUser._id).select('adminPermissions');
            if (me?.adminPermissions?.canManageCrmLeads) {
                // Check if lead belongs to admin or any subadmin
                const subadmins = await User.find({ role: 'subadmin' }).select('_id');
                const subadminIds = subadmins.map(u => u._id.toString());
                const allowedAgentIds = [currentUser._id.toString(), ...subadminIds];
                hasAccess = lead.agent && allowedAgentIds.includes(lead.agent.toString());
            } else {
                // Admin without permission: only own leads
                hasAccess = lead.agent && lead.agent.toString() === currentUser._id.toString();
            }
        } else {
            // Unknown role - deny access
            hasAccess = false;
        }

        if (!hasAccess) {
            return next(new ErrorHandler('Access denied: You do not have permission to view this lead\'s call history', 403));
        }

        // User has access - fetch call history
        // Explicitly select metadata to ensure vapiEndedReason is included
        const calls = await Call.find({ leadId: leadId })
            .select('+metadata') // Explicitly include metadata field
            .sort({ createdAt: -1 })
            .limit(50);

        res.status(200).json({
            success: true,
            calls: calls
        });

    } catch (error) {
        console.error('Error getting call history:', error);
        return next(new ErrorHandler(error.message || 'Failed to get call history', 500));
    }
});

/**
 * Cancel a call
 */
exports.cancelCall = catchAsyncErrors(async (req, res, next) => {
    try {
        const { sessionId } = req.params;

        const Call = await getCallModel();
        // Use raw MongoDB to avoid validation issues with potentially corrupted logs
        const callsCollection = Call.collection;
        const callData = await callsCollection.findOne({ sessionId: sessionId });

        if (!callData) {
            return next(new ErrorHandler('Call not found', 404));
        }

        // For Vapi calls, allow cancelling even if already cancelled (to force cleanup)
        const isVapiCall = callData.metadata && callData.metadata.vapiCallId;
        
        if (!isVapiCall && (callData.status === 'completed' || callData.status === 'cancelled')) {
            return next(new ErrorHandler('Call cannot be cancelled', 400));
        }

        // Tell VoIP agent to end the call (handles both SIP and Vapi)
        if (global.voipAgent) {
            try {
                if (isVapiCall) {
                    // Vapi call - use Vapi end method (force cleanup even if already cancelled)
                    const ended = await global.voipAgent.endVapiCall(callData.metadata.vapiCallId, sessionId);
                    if (!ended) {
                        console.warn(`⚠️ Could not end Vapi call for sessionId: ${sessionId}`);
                    }
                } else {
                    // SIP call - use regular end method
                    const ended = await global.voipAgent.endCallBySessionId(sessionId);
                    if (!ended) {
                        console.warn(`⚠️ Could not end call in VoIP agent for sessionId: ${sessionId}`);
                    }
                }
            } catch (error) {
                console.error('❌ Error ending call in VoIP agent:', error);
                // Continue anyway - update database status
            }
        }

        const endedAt = new Date();
        const startedAt = callData.startedAt ? new Date(callData.startedAt) : null;
        const duration = startedAt ? Math.floor((endedAt - startedAt) / 1000) : 0;
        
        // Use raw MongoDB update to avoid validation issues with logs field
        // The logs field might have corrupted data from previous schema versions
        await callsCollection.updateOne(
            { _id: callData._id },
            {
                $set: {
                    status: 'cancelled',
                    endedAt: endedAt,
                    duration: duration,
                    updatedAt: new Date()
                }
            }
        );

        // Emit Socket.io event
        if (global.io) {
            global.io.emit('call:status:update', {
                callId: callData._id,
                sessionId: sessionId,
                leadId: callData.leadId,
                status: 'cancelled',
                endedAt: endedAt
            });
        }

        // Fetch updated call for response (using lean to avoid validation issues)
        const updatedCall = await Call.findById(callData._id).lean();

        res.status(200).json({
            success: true,
            message: 'Call cancelled',
            call: updatedCall
        });

    } catch (error) {
        console.error('Error cancelling call:', error);
        return next(new ErrorHandler(error.message || 'Failed to cancel call', 500));
    }
});

/**
 * Webhook endpoint for call summary (called by VoIP bot)
 */
exports.receiveCallSummary = catchAsyncErrors(async (req, res, next) => {
    try {
        const { sessionId, leadId, summary, transcript, metadata } = req.body;

        if (!sessionId) {
            return next(new ErrorHandler('Session ID is required', 400));
        }

        const Call = await getCallModel();
        const Lead = await getLeadModel();

        // Find call by sessionId
        const call = await Call.findOne({ sessionId: sessionId });
        if (!call) {
            return next(new ErrorHandler('Call not found', 404));
        }

        // Update call with summary
        call.summary = summary || call.summary;
        // Prefer JSON transcript format if available, otherwise use text format
        call.transcript = transcript || call.transcript;
        // Also store transcriptText if provided for backward compatibility
        if (req.body.transcriptText) {
            call.transcriptText = req.body.transcriptText;
        }
        call.metadata = metadata || call.metadata;
        call.status = 'completed';
        call.endedAt = new Date();
        if (call.startedAt) {
            call.duration = Math.floor((call.endedAt - call.startedAt) / 1000);
        }
        await call.save();

        // Update lead's call history
        if (leadId) {
            const lead = await Lead.findById(leadId);
            if (lead) {
                if (!lead.callHistory) {
                    lead.callHistory = [];
                }
                if (!lead.callHistory.includes(call._id)) {
                    lead.callHistory.push(call._id);
                    await lead.save();
                }
            }
        }

        // Create activity log entry
        if (leadId && summary) {
            await logActivity({
                leadId: leadId,
                type: 'call_logged',
                comment: summary,
                metadata: {
                    callId: call._id,
                    sessionId: sessionId,
                    duration: call.duration,
                    transcript: transcript
                },
                isSystemGenerated: true
            });
        }

        // Emit Socket.io event
        if (global.io) {
            global.io.emit('call:summary:ready', {
                callId: call._id,
                sessionId: sessionId,
                leadId: leadId || call.leadId,
                summary: summary
            });
            // Also emit a status update so dashboards immediately drop from "active"
            global.io.emit('call:status:update', {
                callId: call._id,
                sessionId: sessionId,
                leadId: leadId || call.leadId,
                status: 'completed',
                duration: call.duration,
                activeCallTime: call.activeCallTime,
                ringingTime: call.ringingTime,
                endedAt: call.endedAt,
                sipStatus: call.metadata?.sipStatus,
                sipEvents: call.metadata?.sipEvents || []
            });
        }

        res.status(200).json({
            success: true,
            message: 'Call summary received',
            call: call
        });

    } catch (error) {
        console.error('Error receiving call summary:', error);
        return next(new ErrorHandler(error.message || 'Failed to receive call summary', 500));
    }
});

/**
 * Internal method to update call status (called by VoIP bot)
 * Tracks SIP events and calculates timing
 * This is the internal version that can be called directly (not wrapped in catchAsyncErrors)
 */
async function updateCallStatusInternal(sessionId, status, data = {}) {
    try {
        const Call = await getCallModel();
        let call = await Call.findOne({ sessionId: sessionId });

        // Fallback: if not found by sessionId, try by callId (if provided by VoIP agent)
        if (!call && data.callId) {
            try {
                const mongoose = require('mongoose');
                const isObjectId = mongoose.Types.ObjectId.isValid(data.callId);
                if (isObjectId) {
                    call = await Call.findById(data.callId);
                } else {
                    // Some integrations send SIP Call-ID in callId field - try lookup by sessionId again
                    call = await Call.findOne({ sessionId: data.callId });
                }
                // If found by callId and incoming sessionId is provided, sync it
                if (call && sessionId && call.sessionId !== sessionId) {
                    call.sessionId = sessionId;
                    await call.save();
                }
            } catch (_) {
                // ignore and continue to not found handling
            }
        }

        if (!call) {
            // This is not a critical error - just a timing issue during call setup
            // Try to find call by leadId as fallback (common during early SIP events)
            if (data.leadId) {
                try {
                    call = await Call.findOne({
                        leadId: data.leadId,
                        status: { $in: ['scheduled', 'ringing', 'in-progress', 'initiating'] }
                    }).sort({ createdAt: -1 });
                    
                    if (call) {
                        // Sync sessionId if it doesn't match
                        if (sessionId && call.sessionId !== sessionId) {
                            call.sessionId = sessionId;
                            await call.save();
                            console.log(`✅ [CALL_STATUS] Found call by leadId and synced sessionId: ${sessionId}`);
                        } else {
                            console.log(`✅ [CALL_STATUS] Found call by leadId (sessionId already matches)`);
                        }
                    }
                } catch (e) {
                    console.warn(`⚠️ [CALL_STATUS] Error finding call by leadId: ${e.message}`);
                }
            }
            
            // If still not found, it's likely a timing issue - call record might not be saved yet
            // This is normal during early SIP events (183, 180) and will be retried on next event
            if (!call) {
                console.log(`ℹ️ [CALL_STATUS] Call not found for sessionId: ${sessionId} (likely timing issue - will retry on next SIP event)`);
                return; // Silently return - call will be found on next SIP event
            }
        }

        const now = new Date();
        
        // ✅ CRITICAL: Prevent terminal statuses from being overridden by non-terminal ones
        const terminalStatuses = ['completed', 'failed', 'cancelled', 'no-answer'];
        const isCurrentTerminal = terminalStatuses.includes(call.status);
        const isIncomingTerminal = terminalStatuses.includes(status);
        
        // ✅ CRITICAL: Prevent 'failed' from overriding 'completed' (completed is more definitive)
        // This prevents 408 timeouts on BYE from marking completed calls as failed
        if (call.status === 'completed' && status === 'failed') {
            console.log(`⚠️ [CALL_STATUS] Ignoring failed status - call ${call._id} is already completed, not overriding with failed${data.sipCode === 408 ? ' (408 timeout ignored)' : ''}`);
            return; // Don't override completed with failed
        }
        
        // If call is already terminal, only allow terminal status updates (e.g., failed -> completed is OK, but completed -> ringing is NOT)
        if (isCurrentTerminal && !isIncomingTerminal) {
            console.log(`⚠️ [CALL_STATUS] Ignoring non-terminal status update: call ${call._id} is already ${call.status}, ignoring ${status}`);
            return; // Don't update - call is already terminal
        }
        
        // ✅ CRITICAL: Prevent duplicate terminal status updates (same terminal status within 2 seconds)
        // EXCEPTION: Webhook updates are the source of truth and should always be allowed to broadcast
        // even if status matches, as they may contain updated metadata (duration, endedAt, etc.)
        const isWebhookUpdate = data.source === 'webhook' || data.forceUpdate === true;
        if (!isWebhookUpdate && isCurrentTerminal && isIncomingTerminal && call.status === status) {
            const timeSinceLastUpdate = call.endedAt ? (now - new Date(call.endedAt)) : Infinity;
            if (timeSinceLastUpdate < 2000) { // Within 2 seconds
                console.log(`⚠️ [CALL_STATUS] Ignoring duplicate terminal status update: call ${call._id} is already ${call.status}, ignoring duplicate ${status}`);
                return; // Don't update - duplicate terminal status
            }
        }
        
        // For webhook updates, allow the update even if status matches (to update metadata and broadcast)
        if (isWebhookUpdate && isCurrentTerminal && isIncomingTerminal && call.status === status) {
            console.log(`✅ [CALL_STATUS] Allowing webhook update for call ${call._id} (status: ${status}) - webhook is source of truth, updating metadata and broadcasting`);
        }
        
        // Normalize terminal statuses from SIP BYE or explicit flags
        if ((data.sipMessage === 'BYE' || data.sipCode === 'BYE')) {
            status = 'completed';
        }
        call.status = status;

        // Track SIP events
        if (data.sipCode && data.sipMessage) {
            if (!call.metadata) call.metadata = {};
            if (!call.metadata.sipEvents) call.metadata.sipEvents = [];
            
            // ✅ CRITICAL: Check if this event already exists to avoid duplicates (extended window for same code)
            const eventExists = call.metadata.sipEvents.some(e => {
                const codeMatch = String(e.code) === String(data.sipCode);
                const messageMatch = e.message === data.sipMessage;
                const timeDiff = Math.abs(new Date(e.timestamp) - now);
                // Allow same event within 5 seconds (to catch duplicates from retries)
                return codeMatch && messageMatch && timeDiff < 5000;
            });
            
            if (!eventExists) {
                const sipEvent = {
                    code: data.sipCode, // Can be Number or String ('BYE')
                    message: data.sipMessage,
                    timestamp: now,
                    type: data.sipType || getSipEventType(data.sipCode)
                };
                
                call.metadata.sipEvents.push(sipEvent);
                
                // Update sipStatus (latest SIP event) - only if not duplicate
                call.metadata.sipStatus = {
                    code: data.sipCode, // Can be Number or String ('BYE')
                    message: data.sipMessage,
                    receivedAt: now
                };
            } else {
                console.log(`⚠️ [CALL_STATUS] Duplicate SIP event ignored: ${data.sipCode} ${data.sipMessage} for call ${call._id}`);
                // Don't update sipStatus for duplicates - keep existing, but continue with status update if needed
            }
        }

        // Calculate timing
        if (data.startedAt) {
            call.startedAt = new Date(data.startedAt);
        } else if (!call.startedAt && status !== 'scheduled') {
            call.startedAt = now;
        }

        // Track when call is answered (200 OK)
        if (data.sipCode === 200 && status === 'in-progress') {
            call.status = 'in-progress';
            if (call.startedAt) {
                call.ringingTime = Math.floor((now - call.startedAt) / 1000);
            }
        }

        // Track when call ends (BYE or explicit terminal)
        if ((data.sipMessage === 'BYE' || data.sipCode === 'BYE') || status === 'completed' || status === 'failed' || status === 'cancelled' || status === 'no-answer') {
            // CRITICAL: Preserve the actual status passed in (no-answer, cancelled, failed, etc.)
            // Only default to 'completed' if status is 'in-progress' and no specific terminal status is provided
            if (status === 'in-progress' && !['completed', 'failed', 'cancelled', 'no-answer'].includes(call.status)) {
                call.status = 'completed';
            } else if (status && ['completed', 'failed', 'cancelled', 'no-answer'].includes(status)) {
                call.status = status; // Use the explicitly provided terminal status
            }
            // If call.status is already set to a terminal status, keep it (don't override)
            call.endedAt = now;
            if (call.startedAt) {
                call.duration = Math.floor((now - call.startedAt) / 1000);
                
                // Calculate active call time (from answered to ended)
                const answeredAt = call.metadata?.sipEvents?.find(e => e.code === 200)?.timestamp;
                if (answeredAt) {
                    call.activeCallTime = Math.floor((now - new Date(answeredAt)) / 1000);
                }
            }
        }

        if (data.duration) call.duration = data.duration;
        if (data.endedAt) call.endedAt = new Date(data.endedAt);
        
        // Persist endedReason whenever provided (from webhook or direct status updates)
        if (data.endedReason) {
            if (!call.metadata) call.metadata = {};
            call.metadata.vapiEndedReason = data.endedReason;
            call.metadata.endedReason = data.endedReason;
            // Also store on the root document for fast access in listings
            call.endedReason = data.endedReason;
        }

        // For webhook updates, ensure metadata is preserved/updated even if status matches
        if (isWebhookUpdate) {
            if (!call.metadata) call.metadata = {};
            // Ensure webhook source is marked
            call.metadata.vapiSource = 'webhook';
            call.metadata.finalizedBy = 'webhook';
            if (data.endedAt && !call.metadata.finalizedAt) {
                call.metadata.finalizedAt = new Date(data.endedAt);
            }
        }
        
        // OPTIMIZED: Use raw MongoDB update for non-critical status updates during bulk operations
        // Note: Call is already declared at the start of this function (line 1822)
        if (data.forceUpdate || ['completed', 'failed', 'cancelled', 'no-answer'].includes(call.status)) {
            // Critical updates: use full Mongoose save
            await call.save();
        } else {
            // Non-critical updates: use faster raw MongoDB update to reduce overhead
            const callsCollection = Call.collection;
            await callsCollection.updateOne(
                { _id: call._id },
                { 
                    $set: { 
                        status: call.status,
                        updatedAt: new Date(),
                        ...(call.metadata ? { metadata: call.metadata } : {}),
                        ...(call.endedReason ? { endedReason: call.endedReason } : {}),
                        ...(call.endedAt ? { endedAt: call.endedAt } : {}),
                        ...(call.duration !== undefined ? { duration: call.duration } : {}),
                        ...(call.startedAt ? { startedAt: call.startedAt } : {}),
                        ...(call.ringingTime !== undefined ? { ringingTime: call.ringingTime } : {}),
                        ...(call.activeCallTime !== undefined ? { activeCallTime: call.activeCallTime } : {})
                    } 
                }
            );
        }

        // Prepare event data
        const eventData = {
                callId: call._id,
                sessionId: sessionId,
                leadId: call.leadId,
                phoneNumber: call.phoneNumber,
                status: call.status,
                duration: call.duration,
                activeCallTime: call.activeCallTime,
                ringingTime: call.ringingTime,
                sipStatus: call.metadata?.sipStatus,
                sipEvents: call.metadata?.sipEvents || [],
                startedAt: call.startedAt,
                endedAt: call.endedAt
        };
        
        // OPTIMIZED: Throttle socket emissions during bulk operations to prevent UI freezing
        // Only emit if status changed significantly or it's a terminal status
        const shouldEmitSocket = data.forceUpdate || 
                          ['completed', 'failed', 'cancelled', 'no-answer'].includes(call.status) ||
                          (data.sipCode && [200, 180, 183].includes(data.sipCode));
        
        if (shouldEmitSocket && global.io) {
            // Use setImmediate to prevent blocking during bulk operations
            setImmediate(() => {
                global.io.emit('call:status:update', eventData);
            });
        }
        
        // ✅ CRITICAL FIX: Always emit to SSE clients for ALL status updates
        // Frontend already has throttling/batching, so we don't need to throttle here
        // This ensures "ringing" and other status changes are immediately sent to frontend
        setImmediate(() => {
            sseClients.forEach(client => {
                try {
                    if (!client.destroyed && sseClients.has(client)) {
                        const sseMessage = JSON.stringify({ 
                            type: 'call:status:update', 
                            ...eventData 
                        });
                        client.write(`data: ${sseMessage}\n\n`);
                        console.log(`📡 [SSE] Emitted call:status:update to ${sseClients.size} client(s):`, {
                            callId: eventData.callId,
                            sessionId: eventData.sessionId,
                            status: eventData.status
                        });
                    }
                } catch (error) {
                    // Client disconnected, remove from set
                    console.error('❌ [SSE] Error sending to client:', error);
                    sseClients.delete(client);
                }
            });
        });

    } catch (error) {
        console.error('Error updating call status:', error);
    }
}

/**
 * Exported version wrapped in catchAsyncErrors for API routes
 */
exports.updateCallStatus = catchAsyncErrors(async (req, res, next) => {
    try {
        const { sessionId, status, ...data } = req.body;
        await updateCallStatusInternal(sessionId, status, data);
        res.status(200).json({ success: true });
    } catch (error) {
        return next(new ErrorHandler(error.message || 'Failed to update call status', 500));
    }
});

// Export internal version for direct calls
exports.updateCallStatusInternal = updateCallStatusInternal;

/**
 * Helper to determine SIP event type from status code
 */
exports.getSipEventType = (code) => {
    if (code === 100) return 'trying';
    if (code === 180) return 'ringing';
    if (code === 183) return 'progress';
    if (code === 200) return 'answered';
    if (code >= 400 && code < 500) return 'client_error';
    if (code >= 500 && code < 600) return 'server_error';
    if (code === 'BYE') return 'bye';
    return 'unknown';
};

/**
 * Get call statistics
 */
exports.getCallStatistics = catchAsyncErrors(async (req, res, next) => {
    try {
        const Call = await getCallModel();
        const { startDate, endDate } = req.query;
        const currentUser = req.user;

        const matchQuery = {};
        if (startDate || endDate) {
            matchQuery.createdAt = {};
            if (startDate) matchQuery.createdAt.$gte = new Date(startDate);
            if (endDate) matchQuery.createdAt.$lte = new Date(endDate);
        }

        // ✅ OPTIMIZED: Apply access control with timeout to prevent blocking
        const accessibleLeadIds = await Promise.race([
            getAccessibleLeadIds(currentUser),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 2000))
        ]).catch(() => null); // Fallback to null on timeout
        
        if (accessibleLeadIds !== null) {
            // If empty array, user has no access - return empty stats
            if (accessibleLeadIds.length === 0) {
                return res.status(200).json({
                    success: true,
                    statistics: {
                        total: 0,
                        completed: 0,
                        active: 0,
                        failed: 0,
                        byStatus: [],
                        successRate: 0
                    }
                });
            }
            matchQuery.leadId = { $in: accessibleLeadIds };
        }

        // ✅ OPTIMIZED: Run all database queries in parallel with timeouts to prevent blocking
        // Use Promise.allSettled for better resilience - if one query fails, others still return
        const [statsResult, totalCallsResult, completedCallsResult, activeCallsResult, failedCallsResult] = await Promise.allSettled([
            Call.aggregate([
                { $match: matchQuery },
                {
                    $group: {
                        _id: '$status',
                        count: { $sum: 1 },
                        totalDuration: { $sum: '$duration' },
                        avgDuration: { $avg: '$duration' },
                        totalActiveTime: { $sum: '$activeCallTime' },
                        avgActiveTime: { $avg: '$activeCallTime' }
                    }
                }
            ]).option({ maxTimeMS: 3000 }),
            Call.countDocuments(matchQuery).maxTimeMS(2000),
            Call.countDocuments({ ...matchQuery, status: 'completed' }).maxTimeMS(2000),
            Call.countDocuments({ ...matchQuery, status: { $in: ['ringing', 'in-progress'] } }).maxTimeMS(2000),
            Call.countDocuments({ ...matchQuery, status: 'failed' }).maxTimeMS(2000)
        ]);
        
        // Extract values with fallbacks
        const stats = statsResult.status === 'fulfilled' ? statsResult.value : [];
        const totalCalls = totalCallsResult.status === 'fulfilled' ? totalCallsResult.value : 0;
        const completedCalls = completedCallsResult.status === 'fulfilled' ? completedCallsResult.value : 0;
        const activeCalls = activeCallsResult.status === 'fulfilled' ? activeCallsResult.value : 0;
        const failedCalls = failedCallsResult.status === 'fulfilled' ? failedCallsResult.value : 0;

        res.status(200).json({
            success: true,
            statistics: {
                total: totalCalls,
                completed: completedCalls,
                active: activeCalls,
                failed: failedCalls,
                byStatus: stats,
                // Success rate based on terminal outcomes (completed vs failed)
                successRate: (completedCalls + failedCalls) > 0 
                    ? Number(((completedCalls / (completedCalls + failedCalls)) * 100).toFixed(2))
                    : 0
            }
        });

    } catch (error) {
        console.error('Error getting call statistics:', error);
        return next(new ErrorHandler(error.message || 'Failed to get call statistics', 500));
    }
});

/**
 * Get active calls
 */
exports.getActiveCalls = catchAsyncErrors(async (req, res, next) => {
    try {
        const Call = await getCallModel();
        // Ensure Lead model is registered on the same connection before populating
        await getLeadModel();
        const currentUser = req.user;
        
        // Get calls that are truly active (ringing or in-progress)
        // Exclude calls that have been "ringing" for more than 90 seconds (likely timed out)
        // ✅ CRITICAL: Explicitly exclude ALL terminal statuses
        const now = new Date();
        const staleThreshold = new Date(now.getTime() - 90 * 1000); // 90 seconds ago
        
        const activeCallsQuery = {
            status: { 
                $in: ['ringing', 'in-progress'],
                $nin: ['completed', 'failed', 'cancelled', 'no-answer'] // Explicitly exclude terminal
            },
            // Exclude stale "ringing" calls that haven't progressed
            $or: [
                { status: 'in-progress' }, // Always include in-progress
                { 
                    status: 'ringing',
                    startedAt: { $gte: staleThreshold } // Only include recent ringing calls
                }
            ]
        };

        // ✅ CRITICAL: For admin users, filter by initiatedBy to show only their own calls
        if (currentUser && currentUser.role === 'admin') {
            activeCallsQuery.initiatedBy = currentUser._id;
        } else {
            // ✅ OPTIMIZED: Apply access control with timeout to prevent blocking (for superadmin/subadmin)
            const accessibleLeadIds = await Promise.race([
                getAccessibleLeadIds(currentUser),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 2000))
            ]).catch(() => null); // Fallback to null on timeout
            
            if (accessibleLeadIds !== null) {
                if (accessibleLeadIds.length === 0) {
                    // User has no access - return empty
                    return res.status(200).json({
                        success: true,
                        calls: [],
                        count: 0
                    });
                }
                activeCallsQuery.leadId = { $in: accessibleLeadIds };
            }
        }
        
        // ✅ OPTIMIZED: Use lean() and add timeout to prevent blocking, limit fields
        const activeCalls = await Call.find(activeCallsQuery)
        .select('_id sessionId leadId phoneNumber status startedAt duration metadata')
        .populate({
            path: 'leadId',
            select: 'firstName lastName email phone',
            model: 'Lead'
        })
        .sort({ startedAt: -1 })
        .limit(50)
        .lean()
        .maxTimeMS(2000)
        .catch(() => []);

        // Cleanup: Mark any stale "ringing" calls as failed (background operation, don't block response)
        setImmediate(() => {
            Call.updateMany(
                {
                    status: 'ringing',
                    startedAt: { $lt: staleThreshold }
                },
                {
                    $set: {
                        status: 'failed',
                        endedAt: now
                    }
                }
            ).catch(() => {}); // Silently fail - background operation
        });

        // Calculate live duration for active calls
        // OPTIMIZED: Since we're using .lean(), call is already a plain object, no need for toObject()
        const callsWithLiveDuration = activeCalls.map(call => {
            const callObj = call && typeof call === 'object' ? { ...call } : call;
            if (callObj.startedAt) {
                const liveDuration = Math.floor((new Date() - new Date(callObj.startedAt)) / 1000);
                callObj.liveDuration = liveDuration;
                callObj.liveDurationFormatted = formatDuration(liveDuration);
            }
            return callObj;
        });
    
    res.status(200).json({
        success: true,
            calls: callsWithLiveDuration,
            count: activeCalls.length
    });

    } catch (error) {
        console.error('Error getting active calls:', error);
        return next(new ErrorHandler(error.message || 'Failed to get active calls', 500));
    }
});

/**
 * Helper to format duration
 */
function formatDuration(seconds) {
    if (!seconds) return '0:00';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
        return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `${minutes}:${String(secs).padStart(2, '0')}`;
}

/**
 * Server-Sent Events endpoint for real-time call updates
 */
exports.callUpdatesSSE = (req, res) => {
    try {
        // Set SSE headers
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
        res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        // Flush headers to start streaming immediately
        if (typeof res.flushHeaders === 'function') {
            try { res.flushHeaders(); } catch (e) {}
        }
        
        const clientId = Date.now().toString();
        console.log(`📡 [SSE] Client ${clientId} connected to call updates stream`);
        
        // Add client to set
        sseClients.add(res);
        
        // Send initial connection message
        res.write(`data: ${JSON.stringify({ type: 'connected', clientId })}\n\n`);
        
        // Handle client disconnect
        const cleanup = () => {
            console.log(`📡 [SSE] Client ${clientId} disconnected`);
            sseClients.delete(res);
            if (heartbeat) clearInterval(heartbeat);
            if (!res.destroyed) {
                res.end();
            }
        };
        
        req.on('close', cleanup);
        req.on('aborted', cleanup);
        res.on('close', cleanup);
        
        // Send heartbeat every 30 seconds to keep connection alive
        const heartbeat = setInterval(() => {
            try {
                if (!res.destroyed && sseClients.has(res)) {
                    res.write(`data: ${JSON.stringify({ type: 'heartbeat', timestamp: Date.now() })}\n\n`);
                } else {
                clearInterval(heartbeat);
                    sseClients.delete(res);
                }
            } catch (error) {
                clearInterval(heartbeat);
                sseClients.delete(res);
            }
        }, 30000);
        
    } catch (error) {
        console.error('SSE connection error:', error);
        sseClients.delete(res);
        if (!res.headersSent) {
            res.status(500).json({ success: false, message: 'SSE connection failed' });
        }
    }
};

/**
 * Get completed calls
 */
exports.getCompletedCalls = catchAsyncErrors(async (req, res, next) => {
    try {
        const { page = 1, limit = 50, status, callBack } = req.query;
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const skip = (pageNum - 1) * limitNum;

        const Call = await getCallModel();
        // Ensure Lead model is registered on same connection before populating
        await getLeadModel();
        const currentUser = req.user;
        
        const allowedStatuses = ['completed', 'failed', 'cancelled', 'no-answer'];
        const noAnswerPatterns = ['customer-did-not-answer', 'did-not-answer', 'customer-busy', 'busy', 'voicemail'];
        
        // ✅ CRITICAL: Build status filter based on requested status
        // For 'completed' status, exclude calls with no-answer endedReasons
        // For 'no-answer' status, include calls with status='completed' but endedReason indicates no-answer
        let statusFilter = {};
        if (status && allowedStatuses.includes(status)) {
            if (status === 'completed') {
                // Exclude calls with no-answer endedReasons (these should be in no-answer category)
                // Use $nor to exclude calls where endedReason or metadata.vapiEndedReason matches no-answer patterns
                statusFilter = {
                    status: 'completed',
                    $nor: [
                        { endedReason: { $in: noAnswerPatterns } },
                        { 'metadata.vapiEndedReason': { $in: noAnswerPatterns } }
                    ]
                };
            } else if (status === 'no-answer') {
                // Include calls with status='no-answer' OR status='completed' with no-answer endedReason
                statusFilter = {
                    $or: [
                        { status: 'no-answer' },
                        {
                            status: 'completed',
                            $or: [
                                { endedReason: { $in: noAnswerPatterns } },
                                { 'metadata.vapiEndedReason': { $in: noAnswerPatterns } }
                            ]
                        }
                    ]
                };
            } else {
                // For other statuses (failed, cancelled), use simple status filter
                statusFilter = { status };
            }
        } else {
            // No specific status requested - return all allowed statuses
            statusFilter = { status: { $in: allowedStatuses } };
        }

        // ✅ CRITICAL: For admin users, filter by initiatedBy to show only their own calls
        if (currentUser && currentUser.role === 'admin') {
            statusFilter.initiatedBy = currentUser._id;
        } else {
            // Apply access control - filter by accessible lead IDs (for superadmin/subadmin)
            const accessibleLeadIds = await getAccessibleLeadIds(currentUser);
            if (accessibleLeadIds !== null) {
                if (accessibleLeadIds.length === 0) {
                    // User has no access - return empty
                    return res.status(200).json({
                        success: true,
                        calls: [],
                        pagination: {
                            page: pageNum,
                            limit: limitNum,
                            total: 0,
                            totalPages: 0
                        }
                    });
                }
                statusFilter.leadId = { $in: accessibleLeadIds };
            }
        }

        // Filter by callBack flag if provided
        if (callBack !== undefined && callBack !== null && callBack !== '') {
            const callBackValue = callBack === 'true' || callBack === true;
            console.log(`🔍 [FILTER] callBack filter requested: ${callBack}, parsed as: ${callBackValue}`);
            
            // #region agent log
            if (typeof fetch === 'function') {
                fetch('http://127.0.0.1:7243/ingest/0b7ae174-df61-4914-8ec0-ed47b5d9d381',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'callController.js:2635',message:'Filter by callBack - entry',data:{callBackParam:callBack,callBackValue,statusFilterBefore:JSON.stringify(statusFilter)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
            }
            // #endregion
            
            if (callBackValue) {
                // Filter for callBack = true (must be explicitly true)
                statusFilter.callBack = true;
                console.log(`✅ [FILTER] Filtering for callBack = true`);
            } else {
                // Filter for callBack = false OR callBack is null/undefined (treat as false)
                // Use $ne: true to match everything that's not explicitly true
                // This will match: false, null, undefined (missing field)
                statusFilter.callBack = { $ne: true };
                console.log(`✅ [FILTER] Filtering for callBack != true (includes false, null, undefined)`);
            }
            
            // #region agent log
            if (typeof fetch === 'function') {
                fetch('http://127.0.0.1:7243/ingest/0b7ae174-df61-4914-8ec0-ed47b5d9d381',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'callController.js:2646',message:'Filter by callBack - after setting',data:{statusFilterAfter:JSON.stringify(statusFilter)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
            }
            // #endregion
        }

        // OPTIMIZATION: Exclude heavy fields (logs, transcript) unless specifically requested
        // These fields can be large and slow down responses significantly
        // CRITICAL: Always include metadata field as it contains vapiEndedReason and other important webhook data
        // OPTIMIZED: Only include logs if needed for endedReason extraction (async background process)
        const { includeLogs, includeTranscript } = req.query;
        // CRITICAL: Don't include +metadata in string - it doesn't work with .lean(). Use separate .select() call instead
        let selectFields = 'leadId sessionId phoneNumber status duration startedAt endedAt scheduledAt initiatedAt initiatedBy summary endedReason error callBack';
        // Only include logs if specifically requested or if we need to extract endedReason (but do it async)
        if (includeLogs === 'true') selectFields += ' +logs';
        // Include transcript if requested - no need for + prefix since transcript is not excluded in schema
        if (includeTranscript === 'true') selectFields += ' transcript';

        // #region agent log
        try {
            // Use global fetch if available; guard in case environment doesn't support it
            if (typeof fetch === 'function') {
                fetch('http://127.0.0.1:7242/ingest/d116b95a-c785-46dc-bf1d-ba3cfb5de970', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        sessionId: 'debug-session',
                        runId: 'initial',
                        hypothesisId: 'BH1',
                        location: 'callController.js:getCompletedCalls:beforeQuery',
                        message: 'Incoming getCompletedCalls query params',
                        data: {
                            page: pageNum,
                            limit: limitNum,
                            status: status || null,
                            includeLogs: includeLogs || null,
                            includeTranscript: includeTranscript || null,
                            selectFields
                        },
                        timestamp: Date.now()
                    })
                }).catch(() => {});
            }
        } catch (e) {
            // Swallow any instrumentation errors
        }
        // #endregion agent log
        
        // OPTIMIZED: Use lean() for faster queries, run count in parallel, add timeout
        console.log(`🔍 [QUERY] Executing query with filter:`, JSON.stringify(statusFilter, null, 2));
        
        // #region agent log
        if (typeof fetch === 'function') {
            fetch('http://127.0.0.1:7243/ingest/0b7ae174-df61-4914-8ec0-ed47b5d9d381',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'callController.js:2691',message:'Query execution - before',data:{statusFilter:JSON.stringify(statusFilter),skip,limitNum},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
        }
        // #endregion
        
        // CRITICAL: Build select object to ensure metadata is included
        // When using .select() with string, we need to explicitly add metadata
        const selectObj = selectFields.split(' ').reduce((acc, field) => {
            if (field && field !== '+metadata') { // Remove +metadata from string since we'll add it separately
                acc[field] = 1;
            }
            return acc;
        }, {});
        selectObj.metadata = 1; // Explicitly include metadata
        
        const [completedCalls, total] = await Promise.all([
            Call.find(statusFilter)
                .populate('leadId', 'firstName lastName email phone')
                .select(selectObj) // Use object instead of string to ensure metadata is included
                .sort({ endedAt: -1 })
                .skip(skip)
                .limit(limitNum)
                .lean()
                .maxTimeMS(3000)
                .catch(() => []),
            Call.countDocuments(statusFilter)
                .maxTimeMS(2000)
                .catch(() => 0)
        ]);
        console.log(`✅ [QUERY] Found ${completedCalls.length} calls (total: ${total})`);
        
        // #region agent log
        if (typeof fetch === 'function') {
            // Check first call in detail to see what fields are actually returned
            const firstCall = completedCalls[0];
            fetch('http://127.0.0.1:7243/ingest/0b7ae174-df61-4914-8ec0-ed47b5d9d381',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'callController.js:2706',message:'Query execution - after',data:{callsFound:completedCalls.length,total,firstCallCallBack:firstCall?.callBack,firstCallId:firstCall?._id?.toString(),firstCallKeys:firstCall?Object.keys(firstCall):[],hasMetadata:!!firstCall?.metadata,metadataType:typeof firstCall?.metadata,metadataKeys:firstCall?.metadata?Object.keys(firstCall.metadata):[],hasStructuredOutputs:!!firstCall?.metadata?.structuredOutputs,structuredOutputsKeys:firstCall?.metadata?.structuredOutputs?Object.keys(firstCall.metadata.structuredOutputs):[],callBackValues:completedCalls.slice(0,5).map(c=>({id:c._id?.toString(),callBack:c.callBack,hasMetadata:!!c.metadata,hasStructuredOutputs:!!c.metadata?.structuredOutputs}))},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
            
            // Also check database directly for a sample call to see if metadata exists
            if (firstCall?._id) {
                const directCheck = await Call.findById(firstCall._id).select('+metadata').lean().catch(() => null);
                fetch('http://127.0.0.1:7243/ingest/0b7ae174-df61-4914-8ec0-ed47b5d9d381',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'callController.js:2715',message:'Direct database check for metadata',data:{callId:firstCall._id?.toString(),hasMetadata:!!directCheck?.metadata,metadataKeys:directCheck?.metadata?Object.keys(directCheck.metadata):[],hasStructuredOutputs:!!directCheck?.metadata?.structuredOutputs,structuredOutputsKeys:directCheck?.metadata?.structuredOutputs?Object.keys(directCheck.metadata.structuredOutputs):[]},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
            }
        }
        // #endregion

        // Backfill callBack flag from structured outputs for calls that don't have it set
        // This handles calls that were processed before we added the callBack extraction logic
        const updatePromises = [];
        for (const call of completedCalls) {
            // #region agent log
            if (typeof fetch === 'function') {
                fetch('http://127.0.0.1:7243/ingest/0b7ae174-df61-4914-8ec0-ed47b5d9d381',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'callController.js:2711',message:'Backfill - checking call',data:{callId:call._id?.toString(),currentCallBack:call.callBack,hasStructuredOutputs:!!call.metadata?.structuredOutputs,structuredOutputsKeys:call.metadata?.structuredOutputs?Object.keys(call.metadata.structuredOutputs):[]},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
            }
            // #endregion
            
            // Check if callBack is undefined or null (not explicitly set)
            if ((call.callBack === undefined || call.callBack === null) && call.metadata?.structuredOutputs) {
                let appointmentBooked = false;
                const structuredOutputs = call.metadata.structuredOutputs;
                
                // #region agent log
                if (typeof fetch === 'function') {
                    fetch('http://127.0.0.1:7243/ingest/0b7ae174-df61-4914-8ec0-ed47b5d9d381',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'callController.js:2717',message:'Backfill - iterating structured outputs',data:{callId:call._id?.toString(),structuredOutputsEntries:Object.entries(structuredOutputs).map(([k,v])=>({key:k,name:v?.name,result:v?.result,resultType:typeof v?.result}))},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
                }
                // #endregion
                
                for (const [key, output] of Object.entries(structuredOutputs)) {
                    if (output && typeof output === 'object') {
                        const outputName = (output.name || '').toLowerCase();
                        const outputKey = key.toLowerCase();
                        
                        // #region agent log
                        if (typeof fetch === 'function') {
                            fetch('http://127.0.0.1:7243/ingest/0b7ae174-df61-4914-8ec0-ed47b5d9d381',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'callController.js:2722',message:'Backfill - checking output entry',data:{callId:call._id?.toString(),key,outputName,outputKey,result:output.result,resultType:typeof output.result,hasAppointment:outputName.includes('appointment'),hasCallback:outputName.includes('callback')||outputName.includes('call back'),resultIsTrue:output.result===true},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
                        }
                        // #endregion
                        
                        // Check if it's an appointment-related output with result: true
                        if ((outputName.includes('appointment') || outputName.includes('callback') || outputName.includes('call back')) && 
                            output.result === true) {
                            appointmentBooked = true;
                            
                            // #region agent log
                            if (typeof fetch === 'function') {
                                fetch('http://127.0.0.1:7243/ingest/0b7ae174-df61-4914-8ec0-ed47b5d9d381',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'callController.js:2726',message:'Backfill - appointment found',data:{callId:call._id?.toString(),outputName,outputKey,result:output.result},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
                            }
                            // #endregion
                            
                            break;
                        }
                    }
                }
                
                // Update call object for response
                call.callBack = appointmentBooked;
                if (!call.metadata) call.metadata = {};
                call.metadata.callBack = appointmentBooked;
                
                // #region agent log
                if (typeof fetch === 'function') {
                    fetch('http://127.0.0.1:7243/ingest/0b7ae174-df61-4914-8ec0-ed47b5d9d381',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'callController.js:2732',message:'Backfill - queuing update',data:{callId:call._id?.toString(),appointmentBooked},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
                }
                // #endregion
                
                // Queue database update (async, don't wait)
                updatePromises.push(
                    Call.findByIdAndUpdate(call._id, {
                        $set: {
                            callBack: appointmentBooked,
                            'metadata.callBack': appointmentBooked
                        }
                    }).then(() => {
                        // #region agent log
                        if (typeof fetch === 'function') {
                            fetch('http://127.0.0.1:7243/ingest/0b7ae174-df61-4914-8ec0-ed47b5d9d381',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'callController.js:2741',message:'Backfill - update successful',data:{callId:call._id?.toString(),appointmentBooked},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
                        }
                        // #endregion
                    }).catch((err) => {
                        // #region agent log
                        if (typeof fetch === 'function') {
                            fetch('http://127.0.0.1:7243/ingest/0b7ae174-df61-4914-8ec0-ed47b5d9d381',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'callController.js:2745',message:'Backfill - update failed',data:{callId:call._id?.toString(),error:err.message},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
                        }
                        // #endregion
                    })
                );
            } else if (call.callBack === undefined || call.callBack === null) {
                // If no structured outputs or callBack not set, set to false explicitly for response
                call.callBack = false;
                if (!call.metadata) call.metadata = {};
                call.metadata.callBack = false;
                
                // Also update in database
                updatePromises.push(
                    Call.findByIdAndUpdate(call._id, {
                        $set: {
                            callBack: false,
                            'metadata.callBack': false
                        }
                    }).catch(() => {}) // Silently fail
                );
            }
        }
        
        // Execute all updates in parallel (don't wait for response)
        if (updatePromises.length > 0) {
            Promise.all(updatePromises).catch(() => {});
        }

        // CRITICAL: Extract endedReason synchronously for immediate display in UI
        // Only process calls that don't have endedReason yet
        const callsNeedingEndedReason = completedCalls.filter(call => 
            !call.endedReason && !call.metadata?.vapiEndedReason && !call.metadata?.endedReason
        );
        
        if (callsNeedingEndedReason.length > 0) {
            try {
                const CallModel = await getCallModel();
                // Fetch only logs for calls that need endedReason extraction (batch)
                const callIds = callsNeedingEndedReason.map(c => c._id);
                const callsWithLogs = await CallModel.find({ _id: { $in: callIds } })
                    .select('_id logs metadata')
                    .lean()
                    .maxTimeMS(2000)
                    .catch(() => []);
                
                // Create a map for quick lookup
                const logsMap = new Map(callsWithLogs.map(c => [String(c._id), { logs: c.logs || [], metadata: c.metadata || {} }]));
                
                // Extract and update endedReason for each call (synchronously for response)
                const updatePromises = [];
                for (const call of callsNeedingEndedReason) {
                    const callData = logsMap.get(String(call._id));
                    if (!callData) continue;
                    
                    const callLogs = callData.logs;
                    if (callLogs.length === 0) {
                        // Try to extract from metadata webhook payload
                        const webhookPayload = callData.metadata?.vapiWebhookPayload;
                        if (webhookPayload) {
                            const foundReason = webhookPayload.message?.endedReason || 
                                              webhookPayload.endedReason ||
                                              webhookPayload.message?.call?.endedReason ||
                                              null;
                            if (foundReason) {
                                if (!call.metadata) call.metadata = {};
                                call.metadata.vapiEndedReason = foundReason;
                                call.metadata.endedReason = foundReason;
                                call.endedReason = foundReason;
                                
                                // Queue database update
                                updatePromises.push(
                                    CallModel.findByIdAndUpdate(call._id, {
                                        $set: {
                                            endedReason: foundReason,
                                            'metadata.vapiEndedReason': foundReason,
                                            'metadata.endedReason': foundReason
                                        }
                                    }).catch(() => {})
                                );
                                continue;
                            }
                        }
                        continue;
                    }
                    
                    // Only check last 10 logs for performance (increased from 5)
                    const logsToCheck = callLogs.slice(-10);
                    for (let i = logsToCheck.length - 1; i >= 0; i--) {
                        const log = logsToCheck[i];
                        if (!log || typeof log !== 'object' || !log.data) continue;
                        
                        const foundReason = log.data.endedReason || 
                                          log.data.fullPayload?.message?.endedReason ||
                                          log.data.fullPayload?.message?.call?.endedReason ||
                                          log.data.fullPayload?.endedReason ||
                                          null;
                        
                        if (foundReason) {
                            // Update call object in response (for immediate display)
                            if (!call.metadata) call.metadata = {};
                            call.metadata.vapiEndedReason = foundReason;
                            call.metadata.endedReason = foundReason;
                            call.endedReason = foundReason;
                            
                            // Queue database update (batch update)
                            updatePromises.push(
                                CallModel.findByIdAndUpdate(call._id, {
                                    $set: {
                                        endedReason: foundReason,
                                        'metadata.vapiEndedReason': foundReason,
                                        'metadata.endedReason': foundReason
                                    }
                                }).catch(() => {})
                            );
                            break;
                        }
                    }
                }
                
                // Execute all updates in parallel (but don't wait - fire and forget)
                if (updatePromises.length > 0) {
                    Promise.all(updatePromises).catch(() => {});
                }
            } catch (err) {
                // Silently fail - don't block response
                console.warn('⚠️ [getCompletedCalls] Failed to extract endedReason from logs:', err.message);
            }
        }
        
        // CRITICAL: Also infer endedReason from status for calls that still don't have it
        for (const call of completedCalls) {
            if (!call.endedReason && call.status) {
                if (call.status === 'no-answer') {
                    call.endedReason = 'customer-did-not-answer';
                    if (!call.metadata) call.metadata = {};
                    call.metadata.vapiEndedReason = 'customer-did-not-answer';
                } else if (call.status === 'cancelled') {
                    call.endedReason = 'user-cancelled';
                    if (!call.metadata) call.metadata = {};
                    call.metadata.vapiEndedReason = 'user-cancelled';
                } else if (call.status === 'failed') {
                    call.endedReason = 'failed';
                    if (!call.metadata) call.metadata = {};
                    call.metadata.vapiEndedReason = 'failed';
                }
                // CRITICAL: Don't infer "assistant-ended" for "completed" status
                // Let the actual endedReason from Vapi API or webhooks be used instead
            }
        }

        // #region agent log
        try {
            if (typeof fetch === 'function') {
                const first = completedCalls && completedCalls.length > 0 ? completedCalls[0] : null;
                fetch('http://127.0.0.1:7242/ingest/d116b95a-c785-46dc-bf1d-ba3cfb5de970', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        sessionId: 'debug-session',
                        runId: 'initial',
                        hypothesisId: 'BH2',
                        location: 'callController.js:getCompletedCalls:afterQuery',
                        message: 'Completed calls fetched for getCompletedCalls',
                        data: {
                            totalMatched: completedCalls.length,
                            firstCallId: first ? String(first._id) : null,
                            firstCallHasLogs: first && Array.isArray(first.logs) ? true : false,
                            firstCallLogsLength: first && Array.isArray(first.logs) ? first.logs.length : 0,
                            firstCallHasMetadata: !!(first && first.metadata),
                            firstCallMetadataEndedReason: first && first.metadata ? first.metadata.endedReason || null : null,
                            firstCallMetadataVapiEndedReason: first && first.metadata ? first.metadata.vapiEndedReason || null : null,
                            firstCallEndedReasonField: first ? first.endedReason || null : null
                        },
                        timestamp: Date.now()
                    })
                }).catch(() => {});
            }
        } catch (e) {
            // Ignore instrumentation errors
        }
        // #endregion agent log

        res.status(200).json({
            success: true,
            calls: completedCalls,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total: total,
                totalPages: Math.ceil(total / limitNum)
            }
        });

    } catch (error) {
        console.error('Error getting completed calls:', error);
        return next(new ErrorHandler(error.message || 'Failed to get completed calls', 500));
    }
});

/**
 * Delete call(s)
 */
exports.deleteCall = catchAsyncErrors(async (req, res, next) => {
    try {
        const { callId } = req.params;
        const { callIds, status } = req.body; // Support bulk delete via body

        const Call = await getCallModel();

        if (callId) {
            // Single call delete
            const call = await Call.findByIdAndDelete(callId);
            if (!call) {
                return next(new ErrorHandler('Call not found', 404));
            }

        res.status(200).json({
            success: true,
                message: 'Call deleted successfully'
            });
        } else if (callIds && Array.isArray(callIds)) {
            // Bulk delete by IDs
            const result = await Call.deleteMany({ _id: { $in: callIds } });
            res.status(200).json({
                success: true,
                message: `${result.deletedCount} call(s) deleted successfully`,
                deletedCount: result.deletedCount
            });
        } else if (status) {
            // Delete by status - OPTIMIZED: Delete ALL calls with this status (no pagination/visibility limits)
            // First, get count to verify we're deleting all
            const statusValue = String(status).trim().toLowerCase();
            const totalCount = await Call.countDocuments({ status: statusValue });
            
            console.log(`🗑️ [DELETE_CALLS_BY_STATUS] Attempting to delete all calls with status '${statusValue}'. Total found: ${totalCount}`);
            
            // Delete all calls with this status (no limits, no pagination)
            const result = await Call.deleteMany({ status: statusValue });
            
            console.log(`🗑️ [DELETE_CALLS_BY_STATUS] Successfully deleted ${result.deletedCount} of ${totalCount} calls with status '${statusValue}'`);
            
            // Verify deletion completed
            const remainingCount = await Call.countDocuments({ status: statusValue });
            if (remainingCount > 0) {
                console.warn(`⚠️ [DELETE_CALLS_BY_STATUS] Warning: ${remainingCount} calls with status '${statusValue}' still remain after deletion`);
            }
            
            res.status(200).json({
                success: true,
                message: `${result.deletedCount} call(s) with status '${statusValue}' deleted successfully`,
                deletedCount: result.deletedCount,
                totalFound: totalCount,
                remainingCount: remainingCount
            });
        } else {
            return next(new ErrorHandler('Call ID, callIds array, or status is required', 400));
        }

    } catch (error) {
        console.error('Error deleting call:', error);
        return next(new ErrorHandler(error.message || 'Failed to delete call', 500));
    }
});

/**
 * Pause call queue
 */
exports.pauseCallQueue = catchAsyncErrors(async (req, res, next) => {
    try {
        queuePaused = true;
        console.log('⏸️ Call queue paused');

        res.status(200).json({
            success: true,
            message: 'Call queue paused',
            queuePaused: true,
            queueSize: callQueue.length
        });

    } catch (error) {
        console.error('Error pausing queue:', error);
        return next(new ErrorHandler(error.message || 'Failed to pause queue', 500));
    }
});

/**
 * Resume call queue
 */
exports.resumeCallQueue = catchAsyncErrors(async (req, res, next) => {
    try {
        queuePaused = false;
        console.log('▶️ Call queue resumed');
        
        // Resume processing if queue has items
        if (callQueue.length > 0 && !isProcessingQueue) {
            processCallQueue().catch(err => {
                console.error('Error resuming queue processing:', err);
            });
        }

        res.status(200).json({
            success: true,
            message: 'Call queue resumed',
            queuePaused: false,
            queueSize: callQueue.length
        });

    } catch (error) {
        console.error('Error resuming queue:', error);
        return next(new ErrorHandler(error.message || 'Failed to resume queue', 500));
    }
});

/**
 * Retry failed call
 */
exports.retryFailedCall = catchAsyncErrors(async (req, res, next) => {
    try {
        const { callId } = req.body;

        if (!callId) {
            return next(new ErrorHandler('Call ID is required', 400));
        }

        const Call = await getCallModel();
        // Ensure Lead model is registered on same connection before populating
        await getLeadModel();
        
        const call = await Call.findById(callId).populate('leadId');

        if (!call) {
            return next(new ErrorHandler('Call not found', 404));
        }

        if (call.status !== 'failed') {
            return next(new ErrorHandler('Only failed calls can be retried', 400));
        }

        if (!call.leadId || !call.phoneNumber) {
            return next(new ErrorHandler('Call missing lead or phone number', 400));
        }

        // Create new call record
        const newSessionId = `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const newCall = new Call({
            leadId: call.leadId._id,
            sessionId: newSessionId,
            phoneNumber: call.phoneNumber,
            status: 'scheduled',
            callType: call.callType || 'manual',
            scheduledAt: new Date()
        });
        await newCall.save();

        // Add to queue
        addToQueueSafely({
            callId: newCall._id,
            leadId: call.leadId._id,
            phoneNumber: call.phoneNumber,
            delay: 0,
            total: 1,
            completed: 0
        });

        // Start processing queue if not already processing
        if (!isProcessingQueue && !queuePaused) {
            processCallQueue().catch(err => {
                console.error('Error processing retry queue:', err);
            });
        }

        res.status(200).json({
            success: true,
            message: 'Call queued for retry',
            call: {
                id: newCall._id,
                sessionId: newSessionId,
                leadId: call.leadId._id,
                phoneNumber: call.phoneNumber,
                status: newCall.status
            }
        });

    } catch (error) {
        console.error('Error retrying call:', error);
        return next(new ErrorHandler(error.message || 'Failed to retry call', 500));
    }
});

/**
 * Get Vapi call logs for a specific call
 */
exports.getCallLogs = catchAsyncErrors(async (req, res, next) => {
    try {
        const { callId } = req.params;
        const { light, includeFullPayload, maxLogs, fetchFromVapi } = req.query;
        const includeFullPayloadFlag = includeFullPayload === 'true' || (includeFullPayload === undefined && light !== 'true');
        const maxLogsNum = maxLogs ? Math.max(1, Math.min(parseInt(maxLogs, 10) || 0, 500)) : null;
        // OPTIMIZATION: Only fetch from Vapi API if explicitly requested (prevents unnecessary API calls)
        const shouldFetchFromVapi = fetchFromVapi === 'true';
        const Call = await getCallModel();
        const currentUser = req.user;
        
        // Find the call
        const call = await Call.findById(callId);
        if (!call) {
            return next(new ErrorHandler('Call not found', 404));
        }
        
        // Check access control
        const accessibleLeadIds = await getAccessibleLeadIds(currentUser);
        if (accessibleLeadIds !== null && !accessibleLeadIds.some(id => id.equals(call.leadId))) {
            return next(new ErrorHandler('Access denied to this call', 403));
        }
        
        // Check permission to view call logs
        // Superadmin always has permission, others need explicit permission
        // CRITICAL: Always fetch fresh user data from database (JWT token may be stale)
        let userRole = null;
        let userAdminPermissions = null;
        let isSuperAdmin = false;
        
        if (currentUser?._id) {
            try {
                // CRITICAL: Use select with + to include adminPermissions even if it's not in default selection
                // Don't use lean() to ensure we get the full Mongoose document with all fields
                const freshUser = await User.findById(currentUser._id).select('+adminPermissions role');
                if (freshUser) {
                    userRole = freshUser.role;
                    // CRITICAL: Convert to plain object to ensure adminPermissions is accessible
                    userAdminPermissions = freshUser.adminPermissions ? freshUser.adminPermissions.toObject ? freshUser.adminPermissions.toObject() : freshUser.adminPermissions : {};
                    // CRITICAL: Check both database role and JWT role (database is source of truth)
                    isSuperAdmin = (userRole && userRole.toLowerCase() === 'superadmin') || 
                                   (currentUser.role && currentUser.role.toLowerCase() === 'superadmin');
                } else {
                    // Fallback to req.user if database fetch fails
                    userRole = currentUser.role;
                    userAdminPermissions = currentUser.adminPermissions ? (currentUser.adminPermissions.toObject ? currentUser.adminPermissions.toObject() : currentUser.adminPermissions) : {};
                    isSuperAdmin = userRole && userRole.toLowerCase() === 'superadmin';
                }
            } catch (userError) {
                console.warn('⚠️ [CALL LOGS] Failed to fetch user from database, using req.user:', userError.message);
                // Fallback to req.user
                userRole = currentUser.role;
                userAdminPermissions = currentUser.adminPermissions ? (currentUser.adminPermissions.toObject ? currentUser.adminPermissions.toObject() : currentUser.adminPermissions) : {};
                isSuperAdmin = userRole && userRole.toLowerCase() === 'superadmin';
            }
        } else {
            // No user ID - use req.user directly
            userRole = currentUser?.role;
            userAdminPermissions = currentUser?.adminPermissions ? (currentUser.adminPermissions.toObject ? currentUser.adminPermissions.toObject() : currentUser.adminPermissions) : {};
            isSuperAdmin = userRole && userRole.toLowerCase() === 'superadmin';
        }
        
        // Superadmin always has permission (case-insensitive check)
        // For non-superadmin, check explicit permission
        // CRITICAL: Check if adminPermissions exists and canViewCallLogs is explicitly true
        // Also check if adminPermissions is an object (not null/undefined) and has the property
        const hasCallLogsPermission = isSuperAdmin || 
            (userAdminPermissions && 
             typeof userAdminPermissions === 'object' && 
             userAdminPermissions.canViewCallLogs === true);
        
        // DEBUG: Log permission check details (only for first few calls to avoid spam)
        if (!hasCallLogsPermission && (!global.permissionDebugLogged || global.permissionDebugLogged < 3)) {
            if (!global.permissionDebugLogged) global.permissionDebugLogged = 0;
            global.permissionDebugLogged++;
            console.log('🔍 [CALL LOGS] Permission check details:', {
                userId: currentUser?._id,
                isSuperAdmin,
                userRole,
                hasAdminPerms: !!userAdminPermissions,
                adminPermissionsType: typeof userAdminPermissions,
                adminPermissionsValue: userAdminPermissions,
                canViewCallLogs: userAdminPermissions?.canViewCallLogs,
                canViewCallLogsType: typeof userAdminPermissions?.canViewCallLogs,
                permissionResult: hasCallLogsPermission
            });
        }
        
        if (!hasCallLogsPermission) {
            // CRITICAL: Circuit breaker - prevent infinite loops from same user
            const userId = currentUser?._id?.toString();
            let shouldLog = true;
            
            if (userId) {
                if (!global.permissionDeniedCounts) global.permissionDeniedCounts = new Map();
                if (!global.permissionDeniedCounts.has(userId)) {
                    global.permissionDeniedCounts.set(userId, { count: 0, firstDenied: Date.now() });
                }
                
                const userDenied = global.permissionDeniedCounts.get(userId);
                userDenied.count++;
                
                // If user has been denied more than 5 times in the last minute, stop logging
                const oneMinuteAgo = Date.now() - 60 * 1000;
                if (userDenied.firstDenied < oneMinuteAgo) {
                    // Reset counter if it's been more than a minute
                    userDenied.count = 1;
                    userDenied.firstDenied = Date.now();
                } else if (userDenied.count > 5) {
                    // Circuit breaker: Stop logging after 5 denials in 1 minute
                    shouldLog = false;
                }
            }
            
            // CRITICAL: Only log once per callId to prevent log spam (and only if circuit breaker allows)
            if (shouldLog) {
                const logKey = `permission_denied_${callId}_${currentUser?._id}`;
                if (!global.permissionDeniedLogs) global.permissionDeniedLogs = new Set();
                
                if (!global.permissionDeniedLogs.has(logKey)) {
                    global.permissionDeniedLogs.add(logKey);
                    // Clear after 5 minutes to allow retry if permissions change
                    setTimeout(() => global.permissionDeniedLogs.delete(logKey), 5 * 60 * 1000);
                    
                    const userDenied = userId && global.permissionDeniedCounts?.get(userId);
                    console.error('❌ [CALL LOGS] Permission denied:', {
                        userId: currentUser?._id,
                        role: userRole,
                        roleType: typeof userRole,
                        isSuperAdmin,
                        hasAdminPerms: !!userAdminPermissions,
                        canViewCallLogs: userAdminPermissions?.canViewCallLogs,
                        adminPermissionsType: typeof userAdminPermissions,
                        adminPermissionsKeys: userAdminPermissions ? Object.keys(userAdminPermissions) : [],
                        currentUserExists: !!currentUser,
                        currentUserRole: currentUser?.role,
                        dbRole: userRole,
                        jwtRole: currentUser?.role,
                        deniedCount: userDenied?.count || 0,
                        note: userDenied?.count > 5 ? 'Circuit breaker active - logging suppressed' : `To fix: ${isSuperAdmin ? 'User should be superadmin but role is "' + userRole + '" - update database role to "superadmin"' : 'Enable canViewCallLogs permission in adminPermissions for user'}`
                    });
                }
            }
            
            return next(new ErrorHandler('You do not have permission to view call logs', 403));
        }
        
        // Reset denial count if permission is granted
        const userId = currentUser?._id?.toString();
        if (userId && global.permissionDeniedCounts) {
            global.permissionDeniedCounts.delete(userId);
        }
        
        // Log successful permission check for debugging (only once per callId)
        const logKey = `permission_granted_${callId}_${currentUser?._id}`;
        if (!global.permissionGrantedLogs) global.permissionGrantedLogs = new Set();
        if (!global.permissionGrantedLogs.has(logKey)) {
            global.permissionGrantedLogs.add(logKey);
            setTimeout(() => global.permissionGrantedLogs.delete(logKey), 5 * 60 * 1000);
            
            if (isSuperAdmin) {
                console.log(`✅ [CALL LOGS] Superadmin access granted for user: ${currentUser?._id}`);
            } else {
                console.log(`✅ [CALL LOGS] Admin access granted (canViewCallLogs=true) for user: ${currentUser?._id}`);
            }
        }
        
        // Helper function to clean fullPayload (heavy Vapi blobs)
        const cleanFullPayload = (fullPayload) => {
            if (!fullPayload || !fullPayload.message) return fullPayload;
            
            const cleaned = JSON.parse(JSON.stringify(fullPayload)); // Deep clone
            
            // Remove specified fields from call object
            if (cleaned.message.call) {
                const fieldsToRemove = [
                    'id', 'assistantId', 'customerId', 'phoneNumberId', 'type',
                    'startedAt', 'endedAt', 'transcript', 'recordingUrl', 'summary',
                    'createdAt', 'updatedAt', 'orgId',  'twilioCallSid',
                    'twilioCallStatus', 'webCallUrl', 'assistant', 'phoneNumber',
                    'customer', 'metadata', 'assistantOverrides', 'assistantOverride',
                    'assistants', 'squadId', 'squad', 'analysis', 'artifact', 'name',
                    'destination', 'costs', 'monitor', 'transport', 'schedulePlan',
                    'workflowOverrides', 'workflowId', 'workflow', 'campaignId',
                    'compliance', 'squadOverrides', 'endedMessage'
                ];
                
                fieldsToRemove.forEach(field => {
                    delete cleaned.message.call[field];
                });
            }
            
            // Remove entire assistant object
            delete cleaned.message.assistant;
            
            return cleaned;
        };
        
        // Check if this is a Vapi call - check multiple sources
        // vapiCallId can be in metadata.vapiCallId OR sessionId (for older calls)
        // CRITICAL: Vapi API requires UUID format - validate before using
        const isValidUUID = (str) => {
            if (!str || typeof str !== 'string') return false;
            // CRITICAL: Vapi uses UUID-like IDs that may not follow strict UUID v4 format
            // Accept format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx (8-4-4-4-12 hex characters)
            // Vapi IDs like "019bb845-81d7-7bb8-9c32-b28c79513b2a" are valid even though third segment doesn't start with "4"
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            return uuidRegex.test(str);
        };
        
        // Get potential vapiCallId from metadata first (most reliable)
        let vapiCallId = call.metadata?.vapiCallId || null;
        
        // CRITICAL: Validate metadata.vapiCallId is a valid UUID
        if (vapiCallId && !isValidUUID(vapiCallId)) {
            console.log(`⚠️ [CALL LOGS] metadata.vapiCallId "${vapiCallId}" is not a valid UUID - ignoring`);
            vapiCallId = null;
        }
        
        // Only use sessionId if it's a valid UUID (not custom session IDs like "bulk_call_...")
        if (!vapiCallId && call.sessionId) {
            // Check if sessionId is a valid UUID before using it
            if (isValidUUID(call.sessionId)) {
                vapiCallId = call.sessionId;
            } else {
                // sessionId is not a UUID (likely a custom ID like "bulk_call_...")
                // Only log warning if fetchFromVapi is explicitly requested
                if (shouldFetchFromVapi) {
                    console.log(`⚠️ [CALL LOGS] sessionId "${call.sessionId}" is not a valid UUID - cannot fetch from Vapi API. Check metadata.vapiCallId instead.`);
                }
            }
        }
        
        // If fetchFromVapi is requested but we don't have a valid UUID, log a warning
        if (shouldFetchFromVapi && !vapiCallId) {
            console.warn(`⚠️ [CALL LOGS] fetchFromVapi=true requested but no valid vapiCallId found. Available: metadata.vapiCallId=${call.metadata?.vapiCallId || 'none'}, sessionId=${call.sessionId || 'none'}`);
        }
        
        // Process stored logs if available
        let storedLogs = [];
        if (call.logs && call.logs.length > 0) {
            storedLogs = call.logs.map(rawLog => {
                const baseLog = {
                    type: rawLog.type,
                    message: rawLog.message,
                    timestamp: rawLog.timestamp,
                    data: rawLog.data || {},
                };

                if (!includeFullPayloadFlag && baseLog.data && baseLog.data.fullPayload) {
                    // Strip heavy fullPayload entirely in light mode
                    const { fullPayload, ...restData } = baseLog.data;
                    baseLog.data = restData;
                } else if (includeFullPayloadFlag && baseLog.data && baseLog.data.fullPayload) {
                    // Clean fullPayload to remove extremely heavy fields
                    baseLog.data = {
                        ...baseLog.data,
                        fullPayload: cleanFullPayload(baseLog.data.fullPayload)
                    };
                }

                return baseLog;
            }).sort((a, b) => {
                const aTime = new Date(a.timestamp || a.data?.timestamp || 0).getTime();
                const bTime = new Date(b.timestamp || b.data?.timestamp || 0).getTime();
                return aTime - bTime;
            });
        }
        
        // OPTIMIZATION: If we have stored logs and fetchFromVapi is not explicitly requested, return stored logs immediately
        // This prevents unnecessary Vapi API calls when we just need to display endedReason/duration
        if (storedLogs.length > 0 && !shouldFetchFromVapi) {
            if (maxLogsNum) {
                storedLogs = storedLogs.slice(-maxLogsNum);
            }
            
            // CRITICAL: Extract endedReason from multiple sources (prioritize in order)
            // 1. Direct call.endedReason (fastest)
            // 2. call.metadata.vapiEndedReason (from webhook)
            // 3. call.metadata.endedReason (fallback)
            // 4. From webhook payload in metadata
            // 5. From stored logs (check for endedReason in log data)
            let endedReason = call.endedReason || 
                            call.metadata?.vapiEndedReason || 
                            call.metadata?.endedReason || null;
            
            // Extract from webhook payload if not found
            const webhookPayload = call.metadata?.vapiWebhookPayload || null;
            if (!endedReason && webhookPayload) {
                endedReason = webhookPayload.message?.endedReason || 
                            webhookPayload.endedReason || 
                            null;
            }
            
            // Extract from stored logs if still not found
            if (!endedReason && storedLogs.length > 0) {
                // Check stored logs for endedReason (reverse order to get most recent)
                for (let i = storedLogs.length - 1; i >= 0; i--) {
                    const log = storedLogs[i];
                    if (log.data?.endedReason) {
                        endedReason = log.data.endedReason;
                        break;
                    }
                    // Also check webhook logs
                    if (log.type === 'webhook' && log.data?.endedReason) {
                        endedReason = log.data.endedReason;
                        break;
                    }
                }
            }
            
            // Final attempt: Infer from status if still not found
            // CRITICAL: Don't infer "assistant-ended" - only infer for specific statuses that map directly
            if (!endedReason && call.status) {
                if (call.status === 'no-answer') {
                    endedReason = 'customer-did-not-answer';
                } else if (call.status === 'cancelled') {
                    endedReason = 'user-cancelled';
                } else if (call.status === 'failed') {
                    endedReason = 'failed';
                }
                // Don't infer "assistant-ended" for "completed" - let it remain null or use actual endedReason from Vapi
            }
            
            // CRITICAL: Enhance stored logs - ensure "ended" log has endedReason in data
            if (endedReason) {
                storedLogs = storedLogs.map(log => {
                    // If this is an "ended" log without endedReason, add it
                    if (log.type === 'ended' && !log.data?.endedReason) {
                        return {
                            ...log,
                            data: {
                                ...log.data,
                                endedReason: endedReason
                            },
                            message: log.message.includes('ended') && !log.message.includes(endedReason) 
                                ? `Call ended: ${endedReason}` 
                                : log.message
                        };
                    }
                    return log;
                });
            }
            
            // Extract structured outputs from metadata or webhook payload
            let structuredOutputs = call.metadata?.structuredOutputs || null;
            if (!structuredOutputs) {
                const webhookPayload = call.metadata?.vapiWebhookPayload;
                structuredOutputs = webhookPayload?.message?.artifact?.structuredOutputs ||
                                  webhookPayload?.artifact?.structuredOutputs ||
                                  webhookPayload?.structuredOutputs ||
                                  null;
            }
            
            return res.status(200).json({
                success: true,
                logs: storedLogs,
                callDetails: {
                    _id: call._id,
                    leadId: call.leadId,
                    phoneNumber: call.phoneNumber,
                    status: call.status,
                    duration: call.duration,
                    startedAt: call.startedAt,
                    endedAt: call.endedAt,
                    endedReason: endedReason, // CRITICAL: Always include endedReason
                    transcript: call.transcript,
                    summary: call.summary,
                    vapiEndedReason: call.metadata?.vapiEndedReason || endedReason,
                    vapiStatus: call.metadata?.vapiStatus,
                    vapiSource: call.metadata?.vapiSource,
                    vapiDuration: call.metadata?.vapiDuration,
                    structuredOutputs: structuredOutputs, // Include structured outputs
                    metadata: call.metadata, // Include full metadata for frontend access
                    webhookPayload: call.metadata?.vapiWebhookPayload, // Include webhook payload for debugging
                },
                message: 'Showing stored logs. Use fetchFromVapi=true to get fresh data from Vapi API.'
            });
        }
        
        // If we have stored logs AND vapiCallId AND fetchFromVapi is requested, we'll try to fetch from Vapi API to enhance
        // But if API fails, we'll return stored logs (handled in catch block)
        
        // Even if there's no vapiCallId, we can still return logs from stored metadata
        if (!vapiCallId) {
            const logs = [];
            
            // CRITICAL: Extract endedReason from multiple sources (prioritize in order)
            // 1. Direct call.endedReason (fastest)
            // 2. call.metadata.vapiEndedReason (from webhook)
            // 3. call.metadata.endedReason (fallback)
            // 4. From webhook payload in metadata
            // 5. From stored logs (check for endedReason in log data)
            let storedEndedReason = call.endedReason || 
                                   call.metadata?.vapiEndedReason || 
                                   call.metadata?.endedReason || null;
            
            // Extract from webhook payload if not found
            const webhookPayload = call.metadata?.vapiWebhookPayload || null;
            if (!storedEndedReason && webhookPayload) {
                storedEndedReason = webhookPayload.message?.endedReason || 
                                  webhookPayload.endedReason || 
                                  null;
            }
            
            // Extract from stored logs if still not found
            if (!storedEndedReason && storedLogs.length > 0) {
                // Check stored logs for endedReason (reverse order to get most recent)
                for (let i = storedLogs.length - 1; i >= 0; i--) {
                    const log = storedLogs[i];
                    if (log.data?.endedReason) {
                        storedEndedReason = log.data.endedReason;
                        break;
                    }
                    // Also check webhook logs
                    if (log.type === 'webhook' && log.data?.endedReason) {
                        storedEndedReason = log.data.endedReason;
                        break;
                    }
                }
            }
            
            // Final attempt: Infer from status if still not found
            // CRITICAL: Don't infer "assistant-ended" - only infer for specific statuses that map directly
            if (!storedEndedReason && call.status) {
                if (call.status === 'no-answer') {
                    storedEndedReason = 'customer-did-not-answer';
                } else if (call.status === 'cancelled') {
                    storedEndedReason = 'user-cancelled';
                } else if (call.status === 'failed') {
                    storedEndedReason = 'failed';
                }
                // Don't infer "assistant-ended" for "completed" - let it remain null or use actual endedReason from Vapi
            }
            
            const storedError = call.metadata?.vapiError;
            
            // Add call creation/start event from stored data
            if (call.startedAt) {
                logs.push({
                    type: 'call_started',
                    timestamp: call.startedAt,
                    message: `Call started`,
                    data: {
                        startedAt: call.startedAt,
                        status: call.status,
                        phoneNumber: call.phoneNumber
                    }
                });
            }
            
            // Add status
            if (call.status) {
                logs.push({
                    type: 'status',
                    timestamp: call.startedAt || call.createdAt,
                    message: `Call status: ${call.status}`,
                    data: { 
                        status: call.status,
                        timestamp: call.startedAt || call.createdAt
                    }
                });
            }
            
            // Add ended reason - CRITICAL: Always include endedReason in the log data
            if (call.endedAt) {
                logs.push({
                    type: 'ended',
                    timestamp: call.endedAt,
                    message: storedEndedReason ? `Call ended: ${storedEndedReason}` : `Call ended with status: ${call.status}`,
                    data: { 
                        endedReason: storedEndedReason || call.status, // CRITICAL: Always include endedReason
                        status: call.status,
                        endedAt: call.endedAt,
                        duration: call.duration
                    }
                });
            }
            
            // Add error if available
            if (storedError || call.error) {
                logs.push({
                    type: 'error',
                    timestamp: call.endedAt || call.updatedAt || new Date(),
                    message: `Error: ${storedError || call.error}`,
                    data: { 
                        error: storedError || call.error,
                        vapiError: storedError,
                        callError: call.error
                    }
                });
            }
            
            // Add webhook payload as a log entry if available (optionally clean/omit fullPayload)
            if (webhookPayload) {
                // Extract endedReason from webhook if not already found
                const webhookEndedReason = webhookPayload.message?.endedReason || webhookPayload.endedReason || null;
                if (webhookEndedReason && !storedEndedReason) {
                    storedEndedReason = webhookEndedReason;
                }
                
                const data = {
                    webhookType: webhookPayload.message?.type || webhookPayload.type || 'unknown',
                    endedReason: webhookEndedReason,
                    status: webhookPayload.message?.status || webhookPayload.status || null,
                };

                if (includeFullPayloadFlag) {
                    data.fullPayload = cleanFullPayload(webhookPayload);
                }

                logs.push({
                    type: 'webhook',
                    timestamp: call.endedAt || call.updatedAt || new Date(),
                    message: 'Vapi Webhook Payload',
                    data
                });
                
                // Sort again after adding webhook log
                logs.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
            }
            
            return res.status(200).json({
                success: true,
                logs: logs,
                callDetails: {
                    callId: call._id,
                    status: call.status,
                    duration: call.duration,
                    startedAt: call.startedAt,
                    endedAt: call.endedAt,
                    endedReason: storedEndedReason, // CRITICAL: Always include endedReason
                    error: storedError || call.error,
                    transcript: call.transcript || null,
                    summary: call.summary || null,
                    vapiEndedReason: call.metadata?.vapiEndedReason || storedEndedReason,
                    vapiStatus: call.metadata?.vapiStatus,
                    vapiSource: call.metadata?.vapiSource,
                    vapiDuration: call.metadata?.vapiDuration,
                    note: storedEndedReason ? 
                        'Showing logs from stored call metadata.' : 
                        'This call was not handled by Vapi AI. Showing logs from stored call metadata.'
                },
                message: storedEndedReason ? 
                    'Showing logs from stored call metadata.' : 
                    'This call was not handled by Vapi AI. Showing logs from stored call metadata.'
            });
        }
        
        // OPTIMIZATION: Only fetch from Vapi API if explicitly requested
        // This prevents unnecessary API calls when we just need stored data (endedReason, duration)
        if (!shouldFetchFromVapi) {
            // Return stored logs or metadata-based logs without calling Vapi API
            if (storedLogs.length > 0) {
                if (maxLogsNum) {
                    storedLogs = storedLogs.slice(-maxLogsNum);
                }
                const endedReason = call.endedReason || call.metadata?.vapiEndedReason || call.metadata?.endedReason || null;
                return res.status(200).json({
                    success: true,
                    logs: storedLogs,
                    callDetails: {
                        _id: call._id,
                        leadId: call.leadId,
                        phoneNumber: call.phoneNumber,
                        status: call.status,
                        duration: call.duration,
                        startedAt: call.startedAt,
                        endedAt: call.endedAt,
                        endedReason: endedReason,
                        transcript: call.transcript,
                        summary: call.summary,
                        vapiEndedReason: call.metadata?.vapiEndedReason,
                        vapiStatus: call.metadata?.vapiStatus,
                        vapiSource: call.metadata?.vapiSource,
                        vapiDuration: call.metadata?.vapiDuration,
                    },
                    message: 'Showing stored logs. Use fetchFromVapi=true to get fresh data from Vapi API.'
                });
            }
            // If no stored logs, fall through to create logs from metadata (handled below)
        }
        
        // Get logs from Vapi API (only if fetchFromVapi=true)
        // Check if call was initiated by a user with custom Vapi config (dynamic per admin)
        let vapiInstance = null;
        let usingUserConfig = false;
        
        // Try to get the user who initiated the call to use their Vapi config
        if (call.initiatedBy) {
            try {
                const initiatingUser = await User.findById(call.initiatedBy).select('vapiConfig role email');
                if (initiatingUser && initiatingUser.vapiConfig && initiatingUser.vapiConfig.enabled && initiatingUser.vapiConfig.apiKey) {
                    // User has custom Vapi config - create instance with user config
                    const VapiIntegration = require('../voip/vapiIntegration');
                    vapiInstance = new VapiIntegration({
                        apiKey: initiatingUser.vapiConfig.apiKey,
                        assistantId: initiatingUser.vapiConfig.assistantId || null,
                        phoneNumberId: initiatingUser.vapiConfig.phoneNumberId || null,
                        enabled: true
                    });
                    usingUserConfig = true;
                    console.log(`🔧 [CALL LOGS] Using ${initiatingUser.role} Vapi config from profile for user: ${initiatingUser.email}`);
                }
            } catch (userError) {
                console.warn('⚠️ [CALL LOGS] Failed to load user Vapi config:', userError.message);
            }
        }
        
        // Fallback to global Vapi instance if no user config found
        if (!vapiInstance) {
            if (!global.voipAgent || !global.voipAgent.vapi) {
                // Fallback to stored logs if Vapi not available
                if (storedLogs.length > 0) {
                    if (maxLogsNum) {
                        storedLogs = storedLogs.slice(-maxLogsNum);
                    }
                    return res.status(200).json({
                        success: true,
                        logs: storedLogs,
                        callDetails: {
                            _id: call._id,
                            leadId: call.leadId,
                            phoneNumber: call.phoneNumber,
                            status: call.status,
                            duration: call.duration,
                            startedAt: call.startedAt,
                            endedAt: call.endedAt,
                            transcript: call.transcript,
                            summary: call.summary,
                        },
                        message: 'Vapi integration not available. Showing stored logs.'
                    });
                }
                return next(new ErrorHandler('Vapi integration not available', 503));
            }
            vapiInstance = global.voipAgent.vapi;
            console.log(`🔧 [CALL LOGS] Using default Vapi config from environment`);
        }
        
        try {
            // CRITICAL: If vapiCallId is not valid, try to extract it from stored logs or webhook payload
            if (!vapiCallId || !isValidUUID(vapiCallId)) {
                // Try to find vapiCallId in stored logs (webhook payloads often contain the real Vapi call ID)
                if (storedLogs.length > 0) {
                    for (let i = storedLogs.length - 1; i >= 0; i--) {
                        const log = storedLogs[i];
                        if (log.data?.fullPayload?.message?.call?.id) {
                            const potentialId = log.data.fullPayload.message.call.id;
                            if (isValidUUID(potentialId)) {
                                vapiCallId = potentialId;
                                console.log(`✅ [CALL LOGS] Found valid vapiCallId in stored logs: ${vapiCallId}`);
                                break;
                            }
                        }
                        // Also check direct call.id in webhook payload
                        if (log.data?.fullPayload?.call?.id) {
                            const potentialId = log.data.fullPayload.call.id;
                            if (isValidUUID(potentialId)) {
                                vapiCallId = potentialId;
                                console.log(`✅ [CALL LOGS] Found valid vapiCallId in stored logs (direct): ${vapiCallId}`);
                                break;
                            }
                        }
                    }
                }
                
                // Also check webhook payload in metadata
                if ((!vapiCallId || !isValidUUID(vapiCallId)) && call.metadata?.vapiWebhookPayload) {
                    const webhookPayload = call.metadata.vapiWebhookPayload;
                    const potentialId = webhookPayload.message?.call?.id || webhookPayload.call?.id;
                    if (potentialId && isValidUUID(potentialId)) {
                        vapiCallId = potentialId;
                        console.log(`✅ [CALL LOGS] Found valid vapiCallId in webhook payload: ${vapiCallId}`);
                    }
                }
            }
            
            // CRITICAL: Validate vapiCallId is a valid UUID before calling Vapi API
            // Vapi API will return 400 "id must be a valid UUID" for non-UUID IDs (like "bulk_call_...")
            if (!vapiCallId || !isValidUUID(vapiCallId)) {
                const warningMsg = shouldFetchFromVapi 
                    ? `⚠️ [CALL LOGS] fetchFromVapi=true requested but no valid vapiCallId found. Available: metadata.vapiCallId=${call.metadata?.vapiCallId || 'none'}, sessionId=${call.sessionId || 'none'}. Using stored logs only.`
                    : `⚠️ [CALL LOGS] vapiCallId "${vapiCallId}" is not a valid UUID - using stored logs only`;
                console.warn(warningMsg);
                
                // Return stored logs instead of making invalid API call
                if (storedLogs.length > 0) {
                    if (maxLogsNum) {
                        storedLogs = storedLogs.slice(-maxLogsNum);
                    }
                    return res.status(200).json({
                        success: true,
                        logs: storedLogs,
                        callDetails: {
                            _id: call._id,
                            leadId: call.leadId,
                            phoneNumber: call.phoneNumber,
                            status: call.status,
                            duration: call.duration,
                            startedAt: call.startedAt,
                            endedAt: call.endedAt,
                            transcript: call.transcript,
                            summary: call.summary,
                        },
                        message: shouldFetchFromVapi 
                            ? 'No valid Vapi call ID found. Showing stored logs only. The call may have been made with a custom session ID instead of a Vapi UUID.'
                            : 'Call ID is not a valid Vapi UUID. Showing stored logs only.'
                    });
                }
                // No stored logs either - return basic call info
                return res.status(200).json({
                    success: true,
                    logs: [],
                    callDetails: {
                        _id: call._id,
                        leadId: call.leadId,
                        phoneNumber: call.phoneNumber,
                        status: call.status,
                        duration: call.duration,
                        startedAt: call.startedAt,
                        endedAt: call.endedAt,
                        transcript: call.transcript,
                        summary: call.summary,
                    },
                    message: 'Call ID is not a valid Vapi UUID. No logs available.'
                });
            }
            
            // CRITICAL: Add rate limit protection - check if monitoring was stopped due to rate limits
            if (call.metadata?.monitoringStopped && call.metadata?.monitoringStoppedReason?.includes('Rate limit')) {
                console.warn(`⚠️ [CALL LOGS] Call ${callId} monitoring was stopped due to rate limits. Using stored logs only.`);
                // Return stored logs instead of making API call
                if (storedLogs.length > 0) {
                    if (maxLogsNum) {
                        storedLogs = storedLogs.slice(-maxLogsNum);
                    }
                    return res.status(200).json({
                        success: true,
                        logs: storedLogs,
                        callDetails: {
                            _id: call._id,
                            leadId: call.leadId,
                            phoneNumber: call.phoneNumber,
                            status: call.status,
                            duration: call.duration,
                            startedAt: call.startedAt,
                            endedAt: call.endedAt,
                            transcript: call.transcript,
                            summary: call.summary,
                        },
                        message: 'Rate limit protection: Using stored logs only. Vapi API calls were stopped to prevent rate limiting.'
                    });
                }
            }
            
            const callStatus = await vapiInstance.getCallStatus(vapiCallId);
            
            // Format comprehensive logs from Vapi response
            const logs = [];
            
            // Add call initialization event
            if (callStatus.startedAt) {
                logs.push({
                    type: 'call_started',
                    timestamp: new Date(callStatus.startedAt),
                    message: `Call started - ${callStatus.direction || 'outbound'} call`,
                    data: {
                        callId: callStatus.id,
                        direction: callStatus.direction,
                        startedAt: callStatus.startedAt
                    }
                });
            }
            
            // Add call status/state events
            if (callStatus.status || callStatus.state) {
                logs.push({
                    type: 'status',
                    timestamp: callStatus.startedAt ? new Date(callStatus.startedAt) : call.createdAt,
                    message: `Call status: ${callStatus.status || callStatus.state}`,
                    data: { 
                        status: callStatus.status,
                        state: callStatus.state,
                        direction: callStatus.direction
                    }
                });
            }
            
            // Add messages/transcript events with full details
            if (callStatus.messages && Array.isArray(callStatus.messages)) {
                callStatus.messages.forEach((msg, idx) => {
                    const msgTimestamp = msg.timestamp ? new Date(msg.timestamp) : 
                                        (msg.createdAt ? new Date(msg.createdAt) : 
                                        (callStatus.startedAt ? new Date(callStatus.startedAt) : call.createdAt));
                    
                    const messageContent = msg.content || msg.text || msg.message || msg.transcript || '';
                    const messageType = msg.type || 'message';
                    
                    logs.push({
                        type: messageType,
                        timestamp: msgTimestamp,
                        role: msg.role || msg.sender || 'assistant',
                        message: messageContent || `${messageType} event`,
                        data: {
                            ...msg,
                            index: idx,
                            // Include additional useful fields
                            functionCall: msg.functionCall || null,
                            functionCallResult: msg.functionCallResult || null,
                            toolCalls: msg.toolCalls || null,
                            toolCallResults: msg.toolCallResults || null,
                        }
                    });
                });
            }
            
            // Add function calls if available separately
            if (callStatus.functionCalls && Array.isArray(callStatus.functionCalls)) {
                callStatus.functionCalls.forEach((fnCall, idx) => {
                    logs.push({
                        type: 'function_call',
                        timestamp: fnCall.timestamp ? new Date(fnCall.timestamp) : (callStatus.startedAt ? new Date(callStatus.startedAt) : call.createdAt),
                        message: `Function call: ${fnCall.name || 'unknown'}`,
                        data: {
                            ...fnCall,
                            index: idx
                        }
                    });
                });
            }
            
            // Add tool calls if available
            if (callStatus.toolCalls && Array.isArray(callStatus.toolCalls)) {
                callStatus.toolCalls.forEach((toolCall, idx) => {
                    logs.push({
                        type: 'tool_call',
                        timestamp: toolCall.timestamp ? new Date(toolCall.timestamp) : (callStatus.startedAt ? new Date(callStatus.startedAt) : call.createdAt),
                        message: `Tool call: ${toolCall.name || toolCall.type || 'unknown'}`,
                        data: {
                            ...toolCall,
                            index: idx
                        }
                    });
                });
            }
            
            // Add transcript if available (separate from messages)
            if (callStatus.transcript) {
                if (typeof callStatus.transcript === 'string' && callStatus.transcript.trim()) {
                    logs.push({
                        type: 'transcript',
                        timestamp: callStatus.endedAt ? new Date(callStatus.endedAt) : new Date(),
                        message: 'Full call transcript',
                        data: { transcript: callStatus.transcript }
                    });
                } else if (typeof callStatus.transcript === 'object' && callStatus.transcript.messages) {
                    callStatus.transcript.messages.forEach((msg, idx) => {
                        logs.push({
                            type: 'transcript_message',
                            timestamp: msg.timestamp ? new Date(msg.timestamp) : (callStatus.startedAt ? new Date(callStatus.startedAt) : call.createdAt),
                            role: msg.role || 'assistant',
                            message: msg.content || msg.text || '',
                            data: { ...msg, index: idx }
                        });
                    });
                }
            }
            
            // Add summary if available
            if (callStatus.summary) {
                logs.push({
                    type: 'summary',
                    timestamp: callStatus.endedAt ? new Date(callStatus.endedAt) : new Date(),
                    message: 'Call summary generated',
                    data: { summary: callStatus.summary }
                });
            }
            
            // Extract endedReason from multiple possible field names (Vapi API variations)
            // CRITICAL: Prioritize actual endedReason from Vapi API response, don't infer from status
            const status = callStatus.status || callStatus.state;
            let endedReason = callStatus.endedReason || 
                            callStatus.endReason || 
                            callStatus.ended_reason || 
                            callStatus.reason ||
                            callStatus.end?.reason ||
                            callStatus.callEnd?.reason ||
                            null;
            
            // DEBUG: Log what we found from Vapi
            if (callStatus.endedReason) {
                console.log(`✅ [CALL LOGS] Found endedReason from Vapi API: "${callStatus.endedReason}"`);
            } else {
                console.log(`⚠️ [CALL LOGS] No endedReason in Vapi API response. Checked: endedReason=${callStatus.endedReason}, endReason=${callStatus.endReason}, reason=${callStatus.reason}`);
            }
            
            // Only use metadata or status as fallback if Vapi didn't provide endedReason
            if (!endedReason) {
                endedReason = call.metadata?.vapiEndedReason || 
                             call.metadata?.endedReason ||
                             null;
                
                // Last resort: Only infer from status if it's a terminal status AND we have no other source
                if (!endedReason && status && ['ended', 'failed', 'cancelled', 'queued'].includes(status)) {
                    // Don't infer "assistant-ended" - use the actual status or leave null
                    endedReason = status;
                    console.log(`⚠️ [CALL LOGS] No endedReason found, using status as fallback: "${status}"`);
                }
            }

            // Persist endedReason back onto the Call document when we discover it from Vapi
            if (endedReason) {
                if (!call.metadata) call.metadata = {};
                call.metadata.vapiEndedReason = endedReason;
                call.metadata.endedReason = endedReason;
                // Don't overwrite an existing, more specific reason on the root unless it's missing
                if (!call.endedReason) {
                    call.endedReason = endedReason;
                }
                try {
                    await call.save();
                } catch (saveErr) {
                    console.warn('⚠️ [CALL LOGS] Failed to persist endedReason on Call document:', saveErr.message);
                }
            }
            
            // Add status transition logs - capture ALL status changes
            if (status) {
                logs.push({
                    type: 'status',
                    timestamp: callStatus.startedAt ? new Date(callStatus.startedAt) : (callStatus.endedAt ? new Date(callStatus.endedAt) : call.createdAt),
                    message: `Call status: ${status}`,
                    data: { 
                        status: status,
                        state: callStatus.state,
                        direction: callStatus.direction
                    }
                });
            }
            
            // Add ended reason with full details (use status if endedReason not available)
            if (endedReason || (status && (status === 'ended' || status === 'failed' || status === 'cancelled'))) {
                logs.push({
                    type: 'ended',
                    timestamp: callStatus.endedAt ? new Date(callStatus.endedAt) : call.endedAt || new Date(),
                    message: `Call ended: ${endedReason || status}`,
                    data: { 
                        endedReason: endedReason || status,
                        status: status,
                        endedAt: callStatus.endedAt,
                        duration: callStatus.duration
                    }
                });
            }
            
            // Add error if available with full context
            if (callStatus.error) {
                logs.push({
                    type: 'error',
                    timestamp: callStatus.endedAt ? new Date(callStatus.endedAt) : call.endedAt || new Date(),
                    message: `Error occurred: ${callStatus.error}`,
                    data: { 
                        error: callStatus.error,
                        errorMessage: callStatus.errorMessage,
                        errorCode: callStatus.errorCode
                    }
                });
            }
            
            // Add cost information if available
            if (callStatus.cost !== undefined && callStatus.cost !== null) {
                logs.push({
                    type: 'cost',
                    timestamp: callStatus.endedAt ? new Date(callStatus.endedAt) : new Date(),
                    message: `Call cost: $${callStatus.cost}`,
                    data: { cost: callStatus.cost, currency: callStatus.currency || 'USD' }
                });
            }
            
            // Add recording URL if available
            if (callStatus.recordingUrl) {
                logs.push({
                    type: 'recording',
                    timestamp: callStatus.endedAt ? new Date(callStatus.endedAt) : new Date(),
                    message: 'Call recording available',
                    data: {
                        recordingUrl: callStatus.recordingUrl,
                        recordingDuration: callStatus.recordingDuration || null
                    }
                });
            }
            
            // Add analysis/insights if available
            if (callStatus.analysis) {
                logs.push({
                    type: 'analysis',
                    timestamp: callStatus.endedAt ? new Date(callStatus.endedAt) : new Date(),
                    message: 'Call analysis available',
                    data: {
                        analysis: callStatus.analysis
                    }
                });
            }
            
            // Deduplicate logs by timestamp, type, and message to avoid duplicates
            const uniqueLogs = [];
            const seen = new Set();
            
            logs.forEach(log => {
                const key = `${log.timestamp}-${log.type}-${log.message?.substring(0, 50)}`;
                if (!seen.has(key)) {
                    seen.add(key);
                    uniqueLogs.push(log);
                }
            });
            
            // Sort by timestamp
            uniqueLogs.sort((a, b) => {
                const aTime = new Date(a.timestamp || 0).getTime();
                const bTime = new Date(b.timestamp || 0).getTime();
                return aTime - bTime;
            });
            
            // Apply maxLogs limit
            if (maxLogsNum && uniqueLogs.length > maxLogsNum) {
                uniqueLogs.splice(0, uniqueLogs.length - maxLogsNum);
            }
            
            // Include webhook payload if available (add at the end, don't duplicate if already in stored logs)
            const webhookPayload = call.metadata?.vapiWebhookPayload || null;
            if (webhookPayload && !storedLogs.some(log => log.type === 'webhook')) {
                uniqueLogs.push({
                    type: 'webhook',
                    timestamp: call.endedAt || call.updatedAt || new Date(),
                    message: 'Vapi Webhook Payload',
                    data: {
                        webhookType: webhookPayload.message?.type || webhookPayload.type || 'unknown',
                        endedReason: webhookPayload.message?.endedReason || webhookPayload.endedReason || null,
                        status: webhookPayload.message?.status || webhookPayload.status || null,
                        fullPayload: includeFullPayloadFlag ? cleanFullPayload(webhookPayload) : undefined
                    }
                });
                
                // Sort again after adding webhook log
                uniqueLogs.sort((a, b) => {
                    const aTime = new Date(a.timestamp || 0).getTime();
                    const bTime = new Date(b.timestamp || 0).getTime();
                    return aTime - bTime;
                });
            }
            
            // Extract structured outputs from Vapi API response or stored metadata
            let structuredOutputs = callStatus.artifact?.structuredOutputs ||
                                  callStatus.structuredOutputs ||
                                  call.metadata?.structuredOutputs ||
                                  null;
            
            return res.status(200).json({
                success: true,
                logs: uniqueLogs,
                callDetails: {
                    vapiCallId: vapiCallId,
                    callId: callStatus.id,
                    status: callStatus.status || callStatus.state,
                    state: callStatus.state,
                    duration: callStatus.duration || call.duration,
                    startedAt: callStatus.startedAt || call.startedAt,
                    endedAt: callStatus.endedAt || call.endedAt,
                    endedReason: endedReason || call.metadata?.vapiEndedReason || null, // CRITICAL: Use actual endedReason from Vapi, don't fallback to status
                    error: callStatus.error,
                    message: callStatus.message,
                    direction: callStatus.direction,
                    cost: callStatus.cost || call.metadata?.vapiCost,
                    transcript: callStatus.transcript || call.transcript,
                    summary: callStatus.summary || call.summary,
                    messagesCount: callStatus.messages ? callStatus.messages.length : 0,
                    recordingUrl: callStatus.recordingUrl || null,
                    analysis: callStatus.analysis || null,
                    structuredOutputs: structuredOutputs, // Include structured outputs from Vapi API
                    artifact: callStatus.artifact, // Include full artifact for debugging
                    metadata: call.metadata, // Include full metadata
                    webhookPayload: call.metadata?.vapiWebhookPayload // Include webhook payload
                }
            });
        } catch (vapiError) {
            console.error('Error fetching Vapi logs:', vapiError);
            console.log(`⚠️ [CALL LOGS] Vapi API error (${vapiError.response?.status || 'unknown'}): ${vapiError.message}`);
            
            // CRITICAL: Handle 400 Bad Request (invalid UUID) - don't retry, use stored logs
            if (vapiError.response?.status === 400) {
                const errorMessage = vapiError.response?.data?.message || [];
                const isInvalidUUID = Array.isArray(errorMessage) && 
                                    errorMessage.some(msg => typeof msg === 'string' && msg.includes('must be a valid UUID'));
                
                if (isInvalidUUID) {
                    console.warn(`⚠️ [CALL LOGS] Vapi API returned 400 - invalid UUID: ${vapiCallId}`);
                    console.warn(`   This call likely uses a custom session ID, not a Vapi UUID. Using stored logs only.`);
                    
                    // Mark this in call metadata to prevent future retries
                    if (!call.metadata) call.metadata = {};
                    call.metadata.invalidVapiCallId = true;
                    call.metadata.invalidVapiCallIdReason = 'Not a valid UUID format';
                    call.markModified('metadata');
                    try {
                        await call.save();
                    } catch (saveErr) {
                        console.warn('⚠️ [CALL LOGS] Failed to save invalid UUID flag:', saveErr.message);
                    }
                    
                    // Return stored logs immediately - don't retry
                    if (storedLogs.length > 0) {
                        if (maxLogsNum) {
                            storedLogs = storedLogs.slice(-maxLogsNum);
                        }
                        return res.status(200).json({
                            success: true,
                            logs: storedLogs,
                            callDetails: {
                                _id: call._id,
                                leadId: call.leadId,
                                phoneNumber: call.phoneNumber,
                                status: call.status,
                                duration: call.duration,
                                startedAt: call.startedAt,
                                endedAt: call.endedAt,
                                transcript: call.transcript,
                                summary: call.summary,
                            },
                            message: 'Call ID is not a valid Vapi UUID format. Showing stored logs only.'
                        });
                    }
                    
                    // No stored logs - return basic info
                    return res.status(200).json({
                        success: true,
                        logs: [],
                        callDetails: {
                            _id: call._id,
                            leadId: call.leadId,
                            phoneNumber: call.phoneNumber,
                            status: call.status,
                            duration: call.duration,
                            startedAt: call.startedAt,
                            endedAt: call.endedAt,
                            transcript: call.transcript,
                            summary: call.summary,
                        },
                        message: 'Call ID is not a valid Vapi UUID format. No logs available.'
                    });
                }
            }
            
            // If we have stored logs, return them instead of showing error
            // This handles rate limits (429) and other API errors gracefully
            if (storedLogs.length > 0) {
                console.log(`✅ [CALL LOGS] Returning ${storedLogs.length} stored logs instead of API data`);
                
                // Apply maxLogs limit to stored logs
                let finalLogs = storedLogs;
                if (maxLogsNum) {
                    finalLogs = storedLogs.slice(-maxLogsNum);
                }
                
                const storedEndedReason = call.metadata?.vapiEndedReason;
                
                return res.status(200).json({
                    success: true,
                    logs: finalLogs,
                    callDetails: {
                        _id: call._id,
                        leadId: call.leadId,
                        phoneNumber: call.phoneNumber,
                        status: call.status,
                        duration: call.duration,
                        startedAt: call.startedAt,
                        endedAt: call.endedAt,
                        transcript: call.transcript || null,
                        summary: call.summary || null,
                        endedReason: storedEndedReason || call.metadata?.endedReason,
                        vapiEndedReason: call.metadata?.vapiEndedReason,
                        vapiStatus: call.metadata?.vapiStatus,
                        vapiSource: call.metadata?.vapiSource,
                        vapiDuration: call.metadata?.vapiDuration,
                        note: vapiError.response?.status === 429 
                            ? 'Rate limit exceeded. Showing stored logs from webhooks.' 
                            : 'Vapi API error. Showing stored logs from webhooks.'
                    },
                    message: vapiError.response?.status === 429 
                        ? 'Rate limit exceeded. Showing stored logs.' 
                        : 'Vapi API error. Showing stored logs.'
                });
            }
            
            // No stored logs - return error logs with metadata
            const storedEndedReason = call.metadata?.vapiEndedReason;
            const storedError = call.metadata?.vapiError;
            const logs = [];
            
            // Add call creation/start event from stored data
            if (call.startedAt) {
                logs.push({
                    type: 'call_started',
                    timestamp: call.startedAt,
                    message: `Call started - Vapi call ID: ${vapiCallId}`,
                    data: {
                        callId: vapiCallId,
                        startedAt: call.startedAt,
                        status: call.status
                    }
                });
            }
            
            // Add initial status if available
            if (call.status && call.status !== 'in-progress') {
                logs.push({
                    type: 'status',
                    timestamp: call.startedAt || call.createdAt,
                    message: `Call status: ${call.status}`,
                    data: { 
                        status: call.status,
                        timestamp: call.startedAt || call.createdAt
                    }
                });
            }
            
            // Add 404 error as a log entry
            if (vapiError.response && vapiError.response.status === 404) {
                logs.push({
                    type: 'error',
                    timestamp: call.endedAt || call.updatedAt || new Date(),
                    message: `Vapi API Error: Call not found (404) - ${vapiCallId}`,
                    data: { 
                        error: 'Call not found in Vapi AI',
                        errorCode: 404,
                        vapiCallId: vapiCallId,
                        note: 'This call was not found in Vapi AI. It may have been cancelled, deleted, or never started.'
                    }
                });
            } else {
                // Other errors
                logs.push({
                    type: 'error',
                    timestamp: call.endedAt || call.updatedAt || new Date(),
                    message: `Vapi API Error: ${vapiError.message || 'Failed to fetch call details'}`,
                    data: { 
                        error: vapiError.message,
                        errorCode: vapiError.response?.status,
                        vapiCallId: vapiCallId
                    }
                });
            }
            
            // Add ended reason if available
            if (storedEndedReason) {
                logs.push({
                    type: 'ended',
                    timestamp: call.endedAt || call.updatedAt || call.createdAt,
                    message: `Call ended: ${storedEndedReason}`,
                    data: { 
                        endedReason: storedEndedReason,
                        endedAt: call.endedAt,
                        duration: call.duration,
                        note: 'This information was retrieved from stored call metadata. Full logs could not be fetched from Vapi AI.'
                    }
                });
            } else if (call.endedAt) {
                // If call has endedAt but no endedReason, add a generic ended log
                logs.push({
                    type: 'ended',
                    timestamp: call.endedAt,
                    message: `Call ended with status: ${call.status}`,
                    data: { 
                        status: call.status,
                        endedAt: call.endedAt,
                        duration: call.duration,
                        note: 'Call ended but no detailed reason available from Vapi AI.'
                    }
                });
            }
            
            // Sort logs by timestamp
            logs.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
            
            return res.status(200).json({
                success: true,
                logs: logs,
                callDetails: {
                    vapiCallId: vapiCallId,
                    status: call.status,
                    duration: call.duration,
                    startedAt: call.startedAt,
                    endedAt: call.endedAt,
                    endedReason: storedEndedReason || (call.status === 'cancelled' ? 'Call cancelled (not found in Vapi)' : null),
                    error: storedError || vapiError.message,
                    note: 'Limited data - full Vapi logs unavailable',
                    errorMessage: vapiError.message,
                    errorCode: vapiError.response?.status
                },
                message: storedEndedReason ? 
                    'Limited logs available (endedReason from stored data)' : 
                    (vapiError.response?.status === 404 ? 
                        'Call not found in Vapi AI. Showing available logs from stored data.' :
                        'Unable to fetch logs from Vapi AI'),
                error: vapiError.message
            });
        }
    } catch (error) {
        console.error('Error getting call logs:', error);
        return next(new ErrorHandler(error.message || 'Failed to get call logs', 500));
    }
});

// Export queue functions for use in server.js cron jobs
exports.addToCallQueue = (item) => {
    return addToQueueSafely(item); // Return true if added, false if duplicate
};

exports.getQueueStatus = () => ({
    isProcessingQueue,
    queueSize: callQueue.length,
    queuePaused
});

exports.processCallQueue = processCallQueue;

const dgram = require('dgram');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const NetworkManager = require('./networkManager');
const AudioStreamManager = require('./audioStreamManager');
const VoiceInteraction = require('./voiceInteraction');
const ConversationManager = require('./conversationManager');
const DeepgramStreaming = require('./deepgramStreaming');
const VapiIntegration = require('./vapiIntegration');
const logger = require('./logger');
// Load .env file explicitly from CRM config
require('dotenv').config({ path: path.join(__dirname, '../../config/config.env') });

/**
 * SIP/RTP Voice Agent - Uses Standard SIP/RTP Protocol (NOT WebRTC)
 * 
 * NOTE: Despite the filename "webrtcVoiceAgent", this uses:
 * - Standard SIP over UDP (not WebRTC protocol)
 * - RTP for audio transport (not WebRTC media)
 * - Standard SDP for SIP (not WebRTC SDP)
 * 
 * This is the RECOMMENDED implementation for standard SIP/RTP PBX systems.
 */
/**
 * Audio State Manager - Prevents overlapping TTS and STT
 */
class AudioStateManager {
    constructor() {
        this.state = 'IDLE'; // IDLE, TTS_PLAYING, LISTENING, PROCESSING
        this.currentSession = null;
        this.stateChangeCallbacks = new Map();
    }
    
    async waitForState(targetState, timeoutMs = 5000) {
        if (this.state === targetState) {
            return true;
        }
        
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error(`Timeout waiting for state ${targetState} (current: ${this.state})`));
            }, timeoutMs);
            
            const checkState = () => {
                if (this.state === targetState) {
                    clearTimeout(timeout);
                    resolve(true);
                }
            };
            
            // Check immediately
            checkState();
            
            // Set up callback for state change
            const callbackId = Date.now();
            this.stateChangeCallbacks.set(callbackId, () => {
                checkState();
                this.stateChangeCallbacks.delete(callbackId);
            });
        });
    }
    
    setState(newState, sessionId = null) {
        const oldState = this.state;
        this.state = newState;
        this.currentSession = sessionId;
        
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/d116b95a-c785-46dc-bf1d-ba3cfb5de970',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'webrtcVoiceAgent.js:63',message:'Audio state transition',data:{oldState,newState,sessionId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
        // #endregion
        
        // Notify callbacks
        this.stateChangeCallbacks.forEach(callback => callback());
        
        logger.log(`🔄 Audio state: ${oldState} → ${newState}${sessionId ? ` (session: ${sessionId})` : ''}`);
    }
    
    getState() {
        return { state: this.state, sessionId: this.currentSession };
    }
}

/**
 * Audio Lock Manager - Mutual exclusion for TTS and STT operations
 */
class AudioLockManager {
    constructor() {
        this.busy = false;
        this.lock = null;
        this.waitQueue = [];
    }
    
    async acquireLock(operation) {
        while (this.busy) {
            logger.log(`⏳ Waiting for ${operation} - audio system busy (current lock: ${this.lock})...`);
            await new Promise(resolve => {
                this.waitQueue.push({ operation, resolve });
            });
        }
        this.busy = true;
        this.lock = operation;
        logger.log(`🔒 Lock acquired for: ${operation}`);
        
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/d116b95a-c785-46dc-bf1d-ba3cfb5de970',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'webrtcVoiceAgent.js:78',message:'Audio lock acquired',data:{operation},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
        // #endregion
        
        return () => {
            this.busy = false;
            const oldLock = this.lock;
            this.lock = null;
            logger.log(`🔓 Lock released from: ${oldLock}`);
            
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/d116b95a-c785-46dc-bf1d-ba3cfb5de970',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'webrtcVoiceAgent.js:88',message:'Audio lock released',data:{oldLock},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
            // #endregion
            
            // Wake up next waiter
            if (this.waitQueue.length > 0) {
                const next = this.waitQueue.shift();
                next.resolve();
            }
        };
    }
    
    isLocked() {
        return this.busy;
    }
    
    getCurrentLock() {
        return this.lock;
    }
}

class WebRTCVoiceAgent {
    constructor() {
        this.networkManager = new NetworkManager();
        this.audioStreamManager = new AudioStreamManager({
            debugMode: true,
            saveReceivedAudio: true
        });
        this.voiceInteraction = new VoiceInteraction();
        this.conversationManager = new ConversationManager();
        this.currentSession = null;
        this.sessionsByCallId = new Map(); // Map of callId -> session for SIP event lookup
        this.isConversationActive = false;
        this.sipConfig = null;
        this.testMode = false; // PRODUCTION MODE - OpenAI enabled
        this.testModeEndPhrase = 'ENABLE PRODUCTION MODE'; // Say this phrase to end test mode
        
        // Vapi AI Integration
        this.useVapi = process.env.USE_VAPI === 'true' || !!process.env.VAPI_API_KEY;
        if (this.useVapi) {
            try {
                this.vapi = new VapiIntegration();
                // Ensure assistant exists
                this.vapi.createOrGetAssistant().then(assistantId => {
                    console.log(`✅ Vapi assistant ready: ${assistantId}`);
                }).catch(err => {
                    console.error('❌ Failed to create/get Vapi assistant:', err.message);
                });
                console.log('✅ Vapi AI enabled - calls will be handled by Vapi');
            } catch (error) {
                console.error('❌ Failed to initialize Vapi:', error.message);
                this.useVapi = false;
            }
        } else {
            console.log('ℹ️ Vapi AI disabled - using local SIP handling');
        }
        
        // Audio state management to prevent overlaps
        this.audioState = new AudioStateManager();
        
        // Audio lock manager for mutual exclusion
        this.audioLock = new AudioLockManager();
        
        // Track active RTP sockets for cleanup
        this.activeRtpSockets = new Map(); // sessionId -> { receiver, sender }
        
        // Verify OpenAI API key is set
        if (!process.env.OPENAI_API_KEY) {
            console.warn(`\n⚠️ WARNING: OPENAI_API_KEY not found in environment variables!`);
            console.warn(`   OpenAI services will not work. Please set OPENAI_API_KEY in .env file.\n`);
        }
        
        // Check Deepgram configuration
        this.useDeepgramStreaming = process.env.USE_DEEPGRAM_STREAMING === 'true';
        if (this.useDeepgramStreaming && !process.env.DEEPGRAM_API_KEY) {
            console.warn(`\n⚠️ WARNING: DEEPGRAM_API_KEY not found but USE_DEEPGRAM_STREAMING=true!`);
            console.warn(`   Deepgram streaming disabled. Falling back to Whisper.\n`);
            this.useDeepgramStreaming = false;
        } else if (this.useDeepgramStreaming) {
            console.log(`\n✅ Deepgram streaming enabled (Nova-3) - PRIORITY for transcription`);
            console.log(`   ⚠️ Whisper will only be used as fallback if Deepgram fails`);
        }
        
        // Display mode status
        if (this.testMode) {
            console.log(`\n${'='.repeat(60)}`);
            console.log(`🧪 TEST MODE IS ACTIVE`);
            console.log(`   💰 OpenAI API calls are DISABLED to save costs`);
            console.log(`   📝 To enable production mode, say: "${this.testModeEndPhrase}"`);
            console.log(`${'='.repeat(60)}\n`);
        } else {
            console.log(`\n${'='.repeat(60)}`);
            console.log(`✅ PRODUCTION MODE IS ACTIVE`);
            console.log(`   🤖 OpenAI API calls are ENABLED`);
            console.log(`   💰 Full AI conversation with Whisper + GPT-4 + TTS`);
            console.log(`   📡 Protocol: Standard SIP/RTP (NOT WebRTC protocol)`);
            if (process.env.OPENAI_API_KEY) {
                console.log(`   ✅ OpenAI API key is configured`);
            } else {
                console.log(`   ❌ OpenAI API key is MISSING - please set OPENAI_API_KEY`);
            }
            console.log(`${'='.repeat(60)}\n`);
        }
        
        // SIP / NAT override configuration
        this.forcePublicIP = process.env.SIP_FORCE_PUBLIC_IP || null;
        this.forceContactIP = process.env.SIP_FORCE_CONTACT_IP || null;
        this.forceRtpIP = process.env.SIP_FORCE_RTP_IP || null;
        this.forceRtpPort = process.env.SIP_FORCE_RTP_PORT ? parseInt(process.env.SIP_FORCE_RTP_PORT, 10) : null;
        this.symmetricRTP = (process.env.SIP_SYMMETRIC_RTP || 'true').toLowerCase() === 'true';
        this.keepaliveIntervalMs = Math.max(0, parseInt(process.env.SIP_KEEPALIVE_INTERVAL || '25', 10)) * 1000;
        this.keepaliveTimers = new Map();

        // Prepare SIP logs directory
        this.sipLogsDir = path.join(__dirname, '../logs/voip');
        try {
            if (!fs.existsSync(this.sipLogsDir)) {
                fs.mkdirSync(this.sipLogsDir, { recursive: true });
            }
        } catch (error) {
            console.error(`⚠️ Failed to prepare SIP logs directory: ${error.message}`);
        }

        // Prepare call summaries directory
        this.summariesDir = path.join(__dirname, '../logs/summaries');
        try {
            if (!fs.existsSync(this.summariesDir)) {
                fs.mkdirSync(this.summariesDir, { recursive: true });
            }
        } catch (error) {
            console.error(`⚠️ Failed to prepare summaries directory: ${error.message}`);
        }

        // CRM API URL for sending SIP events
        this.crmApiUrl = process.env.CRM_API_URL || 'http://localhost:4000/api/v1';

        this.init();
    }

    init() {
        try {
            if (!process.env.SIP_SERVER || !process.env.SIP_USERNAME || !process.env.SIP_PASSWORD) {
                console.log('⚠️ SIP credentials not found in environment variables');
                return;
            }

            const sipServer = process.env.SIP_SERVER.replace(/^https?:\/\//, '');
            const sipIP = sipServer === 'reg.g-call.tel' ? '65.109.172.127' : sipServer;
            
            this.sipConfig = {
                server: sipIP,
                domain: sipServer,
                username: process.env.SIP_USERNAME,
                password: process.env.SIP_PASSWORD,
                port: parseInt(process.env.SIP_PORT || '5060'),
                // Direct trunk - no registration needed
                useTrunk: true
            };

            console.log('✅ SIP/RTP Voice Agent initialized (Standard SIP, NOT WebRTC protocol)');
            console.log(`   Server: ${this.sipConfig.server}:${this.sipConfig.port}`);
            console.log(`   Username: ${this.sipConfig.username}`);
            console.log(`   Protocol: SIP/RTP over UDP`);
            console.log(`   Mode: Direct Trunk (no registration)`);

        } catch (error) {
            console.error('❌ Error initializing WebRTC Voice Agent:', error);
        }
        
        // Add global error handlers
        process.on('uncaughtException', (error) => {
            console.error('❌ Uncaught Exception:', error.message);
            console.error('Stack:', error.stack);
            // Don't exit, just log and continue
        });
        
        process.on('unhandledRejection', (reason, promise) => {
            console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
            // Don't exit, just log and continue
        });
    }

    /**
     * Normalize phone number for SIP
     */
    normalizePhoneNumber(phoneNumber) {
        // Preserve + sign and digits only
        let normalized = phoneNumber.replace(/[^\d+]/g, '');
        
        // If already has +, return as-is (E.164 format)
        if (normalized.startsWith('+')) {
            return normalized;
        }
        
        // Pakistan country code (92)
        if (normalized.startsWith('92') && normalized.length >= 12) {
            return '+' + normalized;
        }
        
        // US/Canada numbers (if 11 digits starting with 1, or 10 digits)
        if (normalized.length === 11 && normalized.startsWith('1')) {
            return '+' + normalized;
        }
        if (normalized.length === 10) {
            return '+1' + normalized; // Assume US/Canada
        }
        
        // Return as-is if we can't determine (Vapi will validate)
        return normalized;
    }

    /**
     * Create SDP offer with proper codecs and public IP
     * @param {string} publicIP - Public IP address
     * @param {number} rtpPort - RTP port for audio
     * @returns {string} SDP offer
     */
    createSDPOffer(publicIP, rtpSendPort, rtpReceivePort, sipConfig = null) {
        const activeConfig = sipConfig || this.sipConfig;
        const sessionId = Math.floor(Math.random() * 1000000000);
        const sessionVersion = sessionId;
        const username = activeConfig.username;

        // IMPORTANT: m=audio port is where we want to RECEIVE audio from the remote party
        // The PBX will send audio TO this port
        // HD Voice: Prioritize G.722 (16kHz) for high-quality audio, fallback to G.711
        const sdp = `v=0\r
o=${username} ${sessionId} ${sessionVersion} IN IP4 ${publicIP}\r
s=AI Voice Call\r
c=IN IP4 ${publicIP}\r
t=0 0\r
m=audio ${rtpReceivePort} RTP/AVP 9 0 8 101\r
a=rtpmap:9 G722/16000\r
a=rtpmap:0 PCMU/8000\r
a=rtpmap:8 PCMA/8000\r
a=rtpmap:101 telephone-event/8000\r
a=fmtp:101 0-15\r
a=sendrecv\r
a=ptime:20\r
`;

        return sdp;
    }

    /**
     * Parse SDP answer to extract RTP endpoint
     * @param {string} sdpBody - SDP body from 200 OK
     * @returns {Object} {host, port, codec}
     */
    parseSDPAnswer(sdpBody) {
        console.log(`\n🔍 Parsing SDP Answer (${sdpBody.length} chars)`);
        
        const lines = sdpBody.split('\r\n');
        let host = null;
        let port = null;
        let codec = 'G722'; // Default to HD Voice (G.722), fallback to PCMU if not supported

        for (const line of lines) {
            // Parse connection line: c=IN IP4 192.168.1.1
            if (line.startsWith('c=')) {
                const match = line.match(/c=IN IP4 ([0-9.]+)/);
                if (match) {
                    host = match[1];
                    console.log(`   ✅ Found host: ${host}`);
                }
            }

            // Parse media line: m=audio 12345 RTP/AVP 9 0 8 (G.722, PCMU, PCMA)
            if (line.startsWith('m=audio')) {
                const parts = line.split(' ');
                if (parts.length > 1) {
                    port = parseInt(parts[1]);
                    console.log(`   ✅ Found port: ${port}`);
                }
                // Check for codec preference - prioritize HD Voice (G.722)
                if (parts.includes('9')) {
                    codec = 'G722'; // HD Voice (16kHz) - preferred
                    console.log(`   ✅ Using G.722 codec (HD Voice)`);
                } else if (parts.includes('8')) {
                    codec = 'PCMA'; // A-law (8kHz fallback)
                    console.log(`   ✅ Using PCMA codec`);
                } else if (parts.includes('0')) {
                    codec = 'PCMU'; // μ-law (8kHz fallback)
                    console.log(`   ✅ Using PCMU codec`);
                }
            }
        }

        const result = { host, port, codec };
        console.log(`   🎯 Parsed result:`, result);
        return result;
    }

    /**
     * Make outbound call with two-way audio support
     * @param {string} phoneNumber - Phone number to call
     * @param {string} voice - TTS voice to use
     * @param {string} greeting - Initial greeting text
     * @returns {Promise<Object>} Session object
     */
    async makeCall(phoneNumber, voice = 'shimmer', greeting = null, metadata = {}) {
        console.log(`\n${'='.repeat(60)}`);
        console.log(`📞 INITIATING WEBCALL`);
        console.log(`${'='.repeat(60)}`);

        // CRITICAL FIX: Check if there's an active call for THIS SPECIFIC USER
        // Allow multiple admins to make calls simultaneously - only block if same user has active call
        const currentUserId = metadata.userId || metadata.user?._id?.toString();
        
        if (this.currentSession) {
            // Check if the session is actually active (not just lingering)
            const sessionAge = Date.now() - (this.currentSession.startTime?.getTime() || 0);
            const maxSessionAge = 5 * 60 * 1000; // 5 minutes max
            
            // Get the userId from the current session
            const currentSessionUserId = this.currentSession.userId || this.currentSession.metadata?.userId;
            
            // CRITICAL: Only block if it's the SAME user trying to make another call
            // Different users (admins) can make calls simultaneously
            if (currentUserId && currentSessionUserId && currentUserId === currentSessionUserId) {
                console.log(`🔒 Same user (${currentUserId}) has an active call - checking if it's still active...`);
            } else if (currentSessionUserId) {
                // Different user - allow concurrent calls
                console.log(`✅ Different user (current: ${currentSessionUserId}, new: ${currentUserId}) - allowing concurrent call`);
                // Don't block - continue with call
            } else {
                // No userId in current session - legacy behavior, check if session is stale
                console.log(`⚠️ Current session has no userId - checking if stale...`);
            }
            
            // If session is very old, it's likely stale - clean it up
            if (sessionAge > maxSessionAge) {
                console.warn(`⚠️ Stale session detected (${Math.floor(sessionAge / 1000)}s old) - cleaning up`);
                this.currentSession = null;
                this.sessionsByCallId.clear();
            } else if (this.currentSession.vapiCallId) {
                // For Vapi calls, verify actual status from database
                try {
                    const getCallModel = require('../crmDB/models/callModel');
                    const Call = await getCallModel();
                    const vapiCallId = this.currentSession.vapiCallId;
                    
                    // Check database for actual call status
                    const dbCall = await Call.findOne({ 
                        $or: [
                            { sessionId: vapiCallId },
                            { 'metadata.vapiCallId': vapiCallId }
                        ]
                    }).select('status metadata.vapiStatus initiatedBy');
                    
                    if (!dbCall) {
                        // Call doesn't exist in database - session is stale
                        console.warn(`⚠️ Vapi call not found in database - cleaning up stale session`);
                        const oldVapiId = this.currentSession.vapiCallId;
                        const oldSessionId = this.currentSession.id;
                        this.currentSession = null;
                        this.sessionsByCallId.delete(oldVapiId);
                        this.sessionsByCallId.delete(oldSessionId);
                    } else {
                        // Check if call is actually active
                        const dbStatus = dbCall.status;
                        const vapiStatus = dbCall.metadata?.vapiStatus || this.currentSession.vapiStatus;
                        const dbCallUserId = dbCall.initiatedBy?.toString();
                        
                        // Terminal statuses mean call is done
                        const terminalStatuses = ['completed', 'failed', 'cancelled', 'no-answer'];
                        if (terminalStatuses.includes(dbStatus) || 
                            (vapiStatus && ['ended', 'failed', 'cancelled'].includes(vapiStatus))) {
                            console.warn(`⚠️ Vapi call already ended (DB status: ${dbStatus}, Vapi status: ${vapiStatus}) - cleaning up stale session`);
                            const oldVapiId = this.currentSession.vapiCallId;
                            const oldSessionId = this.currentSession.id;
                            this.currentSession = null;
                            this.sessionsByCallId.delete(oldVapiId);
                            this.sessionsByCallId.delete(oldSessionId);
                        } else if (currentUserId && dbCallUserId && currentUserId === dbCallUserId) {
                            // Same user has an active call - block new call
                            console.warn(`⚠️ User ${currentUserId} already has an active call (${vapiCallId})`);
                            throw new Error('Another call is already in progress');
                        } else {
                            // Different user or no userId - allow concurrent calls
                            console.log(`✅ Allowing concurrent call - different user or no user restriction`);
                        }
                    }
                } catch (dbError) {
                    // If database check fails, fall back to in-memory status
                    console.warn(`⚠️ Could not verify call status from database: ${dbError.message}`);
                    const vapiStatus = this.currentSession.vapiStatus;
                    if (vapiStatus === 'ended' || vapiStatus === 'failed' || vapiStatus === 'cancelled') {
                        console.warn(`⚠️ Vapi call already ended (status: ${vapiStatus}) - cleaning up stale session`);
                        const oldVapiId = this.currentSession.vapiCallId;
                        const oldSessionId = this.currentSession.id;
                        this.currentSession = null;
                        this.sessionsByCallId.delete(oldVapiId);
                        this.sessionsByCallId.delete(oldSessionId);
                    } else if (currentUserId && currentSessionUserId && currentUserId === currentSessionUserId) {
                        // Same user - block
                        throw new Error('Another call is already in progress');
                    } else {
                        // Different user - allow
                        console.log(`✅ Allowing concurrent call - different user`);
                    }
                }
            } else if (currentUserId && currentSessionUserId && currentUserId === currentSessionUserId) {
                // Same user has active non-Vapi session - block
                throw new Error('Another call is already in progress');
            } else {
                // Different user or no userId - allow concurrent calls
                console.log(`✅ Allowing concurrent call - different user or no user restriction`);
            }
        }

        const normalizedPhone = this.normalizePhoneNumber(phoneNumber);
        console.log(`   Phone: ${normalizedPhone}`);
        console.log(`   Voice: ${voice}`);
        if (metadata.leadId) {
            console.log(`   Lead ID: ${metadata.leadId}`);
        }

        // VAPI AI INTEGRATION - Route call through Vapi if enabled
        // Check if user has custom Vapi config, otherwise use default
        let vapiInstance = this.vapi;
        // Only create user-specific instance if userVapiConfig is provided (not null/undefined)
        // For superadmin, userVapiConfig will be null, so it uses default this.vapi instance
        if (this.useVapi && metadata.userVapiConfig && metadata.userVapiConfig.enabled && metadata.userVapiConfig.apiKey) {
            // User has custom Vapi config - create instance with user config
            try {
                const VapiIntegration = require('./vapiIntegration');
                vapiInstance = new VapiIntegration(metadata.userVapiConfig);
                console.log(`\n🤖 Using user-specific Vapi AI config for call handling`);
            } catch (error) {
                console.error('❌ Failed to create user-specific Vapi instance:', error.message);
                console.log('🔄 Falling back to default Vapi config...');
                vapiInstance = this.vapi;
            }
        } else if (this.useVapi && this.vapi) {
            // Using default Vapi config (for superadmin or when no user config provided)
            console.log(`\n🤖 Using default Vapi AI config for call handling`);
        }
        
        if (this.useVapi && vapiInstance) {
            console.log(`\n🤖 Using Vapi AI for call handling`);
            try {
                // Ensure assistant exists
                const assistantId = await vapiInstance.createOrGetAssistant();
                console.log(`   ✅ Assistant ID: ${assistantId}`);
                
                // Create call via Vapi API
                const vapiCall = await vapiInstance.createCall(normalizedPhone, assistantId, {
                    leadId: metadata.leadId,
                    callId: metadata.sessionId || `call_${Date.now()}`,
                    voice: voice,
                    ...metadata
                });
                
                const vapiCallId = vapiCall.id || vapiCall.callId;
                console.log(`   ✅ Vapi call created: ${vapiCallId}`);
                console.log(`   📞 Vapi is handling the call - STT, TTS, and LLM all via Vapi`);
                
                // Create a session object for tracking
                // CRITICAL: Store userId to allow concurrent calls from different users
                const sessionInfo = {
                    id: vapiCallId,
                    callId: vapiCallId,
                    phoneNumber: normalizedPhone,
                    vapiCallId: vapiCallId,
                    vapiCall: vapiCall,
                    vapiInstance: vapiInstance, // Store vapiInstance so monitoring can use correct API key
                    status: 'vapi_handled',
                    startTime: new Date(),
                    leadInfo: metadata.leadInfo || {},
                    crmCallId: metadata.callId || null,
                    crmSessionId: metadata.sessionId || null,
                    userId: currentUserId || metadata.userId || null, // Store userId for per-user locking
                    metadata: {
                        userId: currentUserId || metadata.userId || null,
                        ...metadata
                    }
                };
                
                this.currentSession = sessionInfo;
                this.sessionsByCallId.set(vapiCallId, sessionInfo);
                
                // Also store by CRM sessionId if available
                if (metadata.sessionId) {
                    this.sessionsByCallId.set(metadata.sessionId, sessionInfo);
                }
                
                // Update CRM call record with Vapi call ID
                if (metadata.callId) {
                    try {
                        const Call = await require('../crmDB/models/callModel')();
                        const call = await Call.findById(metadata.callId);
                        if (call) {
                            if (!call.metadata) {
                                call.metadata = {};
                            }
                            call.metadata.vapiCallId = vapiCallId;
                            call.status = 'ringing'; // Initial status
                            await call.save();
                            
                            // Emit status update
                            if (global.io) {
                                global.io.emit('call:status:update', {
                                    callId: call._id,
                                    sessionId: call.sessionId,
                                    leadId: call.leadId,
                                    status: 'ringing'
                                });
                            }
                        }
                    } catch (error) {
                        console.error('❌ Error updating CRM call with Vapi ID:', error.message);
                    }
                }
                
                // Monitor call status
                this.monitorVapiCall(vapiCallId, sessionInfo);
                
                return sessionInfo;
            } catch (error) {
                console.error('❌ Vapi call creation failed:', error.message);
                
                // Check if it's an authentication error (401) - invalid API key
                if (error.response && error.response.status === 401) {
                    const errorMessage = error.response.data?.message || error.message || 'Invalid Vapi API key. Please check your Vapi configuration.';
                    throw new Error(`Vapi authentication failed: ${errorMessage}. Please verify your Vapi API key is correct.`);
                }
                
                // Check if it's a configuration error
                if (error.message && (error.message.includes('VAPI_API_KEY not configured') || error.message.includes('not configured'))) {
                    throw new Error('Vapi is not configured. Please configure your Vapi settings before making calls.');
                }
                
                // For other errors, still throw to prevent silent fallback when Vapi is required
                throw new Error(`Vapi call failed: ${error.message || 'Unknown error'}`);
            }
        } else if (this.useVapi && this.vapi) {
            // Vapi is enabled but call failed - check if it's a transport error
            // If so, automatically fall back to SIP
            console.log('⚠️ Vapi enabled but call failed - using local SIP infrastructure');
        }

        // LOCAL SIP HANDLING (fallback or when Vapi disabled)
        // Check if user has custom SIP config, otherwise use default
        let activeConfig = this.sipConfig;
        
        if (metadata.userSipConfig && metadata.userSipConfig.enabled) {
            // User has custom SIP config - use it for this call
            const sipServer = metadata.userSipConfig.server.replace(/^https?:\/\//, '');
            const sipIP = sipServer === 'reg.g-call.tel' ? '65.109.172.127' : sipServer;
            
            activeConfig = {
                server: sipIP,
                domain: sipServer,
                username: metadata.userSipConfig.username,
                password: metadata.userSipConfig.password,
                port: metadata.userSipConfig.port || 5060,
                useTrunk: true
            };
            console.log(`\n📞 Using user-specific SIP config for call handling`);
            console.log(`   Server: ${activeConfig.server}:${activeConfig.port}`);
            console.log(`   Username: ${activeConfig.username}`);
        } else {
            // Use default SIP config (from environment)
            console.log(`\n📞 Using default SIP config from environment for call handling`);
            if (!this.sipConfig) {
                throw new Error('SIP configuration not available');
            }
        }

        let callId;
        let fromTag;
        let branch;

        try {
            // Use sessionId from metadata if provided (for CRM calls), otherwise generate one
            callId = metadata.sessionId || `call_${Date.now()}`;
            fromTag = `tag_${Math.random().toString(36).substr(2, 9)}`;
            branch = `z9hG4bK${Math.random().toString(36).substr(2, 9)}`;
            this.initializeSipLog(callId);
            this.appendSipLog(callId, `Dial request -> phone=${normalizedPhone}, voice=${voice}`);

            // Step 1: Get public IP for NAT traversal
            const detectedIP = await this.networkManager.getPublicIP();
            const signalingIP = this.forcePublicIP || detectedIP;
            const contactIP = this.forceContactIP || signalingIP;
            const rtpAdvertisedIP = this.forceRtpIP || signalingIP;
            console.log(`\n🌐 Network Info:`);
            console.log(`   Detected Public IP: ${detectedIP}`);
            if (this.forcePublicIP) {
                console.log(`   ⚙️  Forcing signaling IP: ${signalingIP}`);
            }
            if (this.forceContactIP) {
                console.log(`   ⚙️  Overriding Contact IP: ${contactIP}`);
            }
            if (this.forceRtpIP) {
                console.log(`   ⚙️  Overriding RTP IP: ${rtpAdvertisedIP}`);
            }
            this.appendSipLog(callId, `Signaling IP=${signalingIP}, Contact IP=${contactIP}, RTP IP=${rtpAdvertisedIP}`);

            // Step 2: Get available ports for SIP and RTP
            // CRITICAL FIX: Use SYMMETRIC RTP - same port for sending and receiving
            // This matches what we advertise in SDP, preventing port mismatch issues
            const sipPort = await this.networkManager.getAvailablePort();
            const rtpReceivePort = this.forceRtpPort || await this.networkManager.getAvailablePort(); // UNIQUE port for this call
            // CRITICAL: Use the SAME port for sending (symmetric RTP)
            // The PBX will send audio TO this port, and we send FROM this port
            const rtpSendPort = rtpReceivePort; // Same port for symmetric RTP

            console.log(`\n🔌 PORT ALLOCATION (Symmetric RTP - FIXED):`);
            console.log(`   SIP Signaling Port: ${sipPort} (Via header - for SIP messages)`);
            console.log(`   RTP Port: ${rtpReceivePort} (SDP m=audio - used for BOTH send and receive)`);
            console.log(`   ✅ SYMMETRIC RTP: Sending FROM and receiving ON the same port (${rtpReceivePort})`);
            console.log(`   ✅ This matches the port advertised in SDP - prevents port mismatch`);
            if (this.forceRtpPort) {
                console.log(`   ⚙️  RTP port forced via env`);
            }
            this.appendSipLog(callId, `Ports -> SIP=${sipPort}, RTP=${rtpReceivePort} (symmetric)`);

            // Step 3: Create SDP offer
            // Note: rtpSendPort and rtpReceivePort are now the same (symmetric RTP)
            const sdpOffer = this.createSDPOffer(rtpAdvertisedIP, rtpSendPort, rtpReceivePort, activeConfig);
            console.log(`\n📋 SDP Offer:`);
            console.log(`   🌐 RTP IP in SDP: ${rtpAdvertisedIP} (PBX will send to this IP:${rtpReceivePort})`);
            console.log(`   🎯 We will RECEIVE audio on port: ${rtpReceivePort}`);
            console.log(`   🎯 We will SEND audio FROM port: ${rtpSendPort} (same port - symmetric RTP)`);
            console.log(`   ⚠️  CRITICAL: PBX must be able to reach ${rtpAdvertisedIP}:${rtpReceivePort} via UDP`);
            console.log(`   ⚠️  Check firewall: Port ${rtpReceivePort}/UDP must be open`);
            console.log(sdpOffer);
            this.appendSipLog(callId, `SDP Offer:\n${sdpOffer}`);

            // Step 4: Create SIP INVITE
            const sipInvite = this.createSIPInvite(
                normalizedPhone,
                sdpOffer,
                signalingIP,
                contactIP,
                sipPort,
                callId,
                fromTag,
                branch,
                activeConfig
            );

            console.log(`\n📤 SIP INVITE DETAILS:`);
            console.log(`   To: ${activeConfig.server}:${activeConfig.port}`);
            console.log(`   Via: SIP/2.0/UDP ${signalingIP}:${sipPort};branch=${branch};rport`);
            console.log(`   Contact: <sip:${activeConfig.username}@${contactIP}:${sipPort}>`);
            console.log(`   SDP m=audio: ${rtpReceivePort} (RTP port - different from SIP port ${sipPort})`);
            this.appendSipLog(callId, `INVITE built with Via IP=${signalingIP}, Contact IP=${contactIP}, RTP port=${rtpReceivePort}`);

            // Step 5: Send INVITE and handle response
            // Create session info object BEFORE sending INVITE so we can store it by callId
            const sessionInfo = {
                phoneNumber: normalizedPhone,
                voice,
                greeting,
                publicIP: signalingIP,
                contactIP,
                rtpAdvertisedIP,
                rtpSendPort,
                leadId: metadata.leadId || null, // Store leadId from metadata
                callId: metadata.callId || null, // Store callId from metadata (MongoDB _id)
                sessionId: metadata.sessionId || callId, // Store CRM sessionId (for CRM tracking)
                leadInfo: metadata.leadInfo || {}, // Store lead information (firstName, lastName, etc.)
                rtpReceivePort,
                sipPort,
                sipConfig: activeConfig // Store SIP config used for this call
            };
            
            // Store session info by callId IMMEDIATELY so SIP events can find it
            this.sessionsByCallId.set(callId, sessionInfo);
            
            const session = await this.sendSIPInvite(
                sipInvite,
                sipPort,
                callId,
                fromTag,
                branch,
                sessionInfo,
                activeConfig
            );

            // Update stored session with full session object
            this.sessionsByCallId.set(callId, session);
            this.currentSession = session;
            return session;

        } catch (error) {
            console.error(`\n❌ CALL ERROR: ${error.message}`);
            if (callId) {
                this.appendSipLog(callId, `Call error: ${error.message}`);
                this.stopSIPKeepalive(callId);
            }
            throw error;
        }
    }

    /**
     * Create SIP INVITE message
     */
    createSIPInvite(phoneNumber, sdpBody, signalingIP, contactIP, localPort, callId, fromTag, branch, sipConfig = null) {
        const activeConfig = sipConfig || this.sipConfig;
        const contentLength = Buffer.byteLength(sdpBody, 'utf8');

        return `INVITE sip:${phoneNumber}@${activeConfig.domain} SIP/2.0\r
Via: SIP/2.0/UDP ${signalingIP}:${localPort};branch=${branch};rport\r
From: <sip:${activeConfig.username}@${activeConfig.domain}>;tag=${fromTag}\r
To: <sip:${phoneNumber}@${activeConfig.domain}>\r
Call-ID: ${callId}\r
CSeq: 1 INVITE\r
Contact: <sip:${activeConfig.username}@${contactIP}:${localPort}>\r
Max-Forwards: 70\r
Allow: INVITE, ACK, CANCEL, BYE, OPTIONS\r
Supported: replaces, timer\r
User-Agent: WebRTC-Voice-Agent/2.0\r
Content-Type: application/sdp\r
Content-Length: ${contentLength}\r
\r
${sdpBody}`;
    }

    /**
     * Send SIP INVITE and handle response
     */
    async sendSIPInvite(sipInvite, localPort, callId, fromTag, branch, sessionInfo, sipConfig = null) {
        const activeConfig = sipConfig || this.sipConfig;
        return new Promise((resolve, reject) => {
            const client = dgram.createSocket('udp4');
            let toTag = '';
            let rtpEndpoint = null;
            let authAttempted = false;
            let callAnswered = false;
            let callProgressing = false; // Track if we received 183 (call is progressing)
            let callTimeout = null; // Store timeout reference so we can clear/extend it

            client.on('message', async (msg, rinfo) => {
                try {
                    const response = msg.toString();
                    console.log(`\n📥 SIP Response from ${rinfo.address}:${rinfo.port}`);
                    console.log(`📋 Raw SIP Response:`);
                    console.log(response);
                    console.log(`📋 End of SIP Response\n`);
                    this.appendSipLog(callId, `RX ${rinfo.address}:${rinfo.port}\n${response}`);
                
                if (response.includes('100 Trying')) {
                    console.log(`   ✅ 100 Trying - PBX processing call`);
                    this.appendSipLog(callId, '100 Trying received');
                    // Send SIP event to CRM
                    this.sendSipEventToCRM(callId, 100, 'Trying', 'trying').catch(err => {
                        console.error('Error sending 100 event to CRM:', err.message);
                    });
                } else if (response.includes('180 Ringing')) {
                    console.log(`   📞 180 Ringing - Phone is ringing`);
                    this.appendSipLog(callId, '180 Ringing received');
                    // Send SIP event to CRM
                    this.sendSipEventToCRM(callId, 180, 'Ringing', 'ringing').catch(err => {
                        console.error('Error sending 180 event to CRM:', err.message);
                    });
                    
                    // Start generating greeting from Assistant API while ringing (non-blocking)
                    if (sessionInfo && !sessionInfo.greetingGenerated) {
                        sessionInfo.greetingGenerated = true; // Mark as started to prevent duplicate generation
                        const leadInfo = sessionInfo.leadInfo || {};
                        console.log(`🤖 Starting greeting generation from Assistant API while call is ringing...`);
                        this.voiceInteraction.generateInitialGreeting(sessionInfo.id, leadInfo)
                            .then(greeting => {
                                if (greeting && greeting.trim().length > 0) {
                                    sessionInfo.greeting = greeting; // Store in session for immediate use
                                    console.log(`✅ Greeting ready from Assistant: "${greeting}"`);
                                    this.appendSipLog(callId, `Greeting generated and ready: ${greeting.substring(0, 50)}...`);
                                } else {
                                    console.error('❌ Assistant returned empty greeting');
                                }
                            })
                            .catch(error => {
                                console.error('❌ Error generating greeting during ringing:', error.message);
                                // Don't set greeting - will generate on the spot when call is answered
                            });
                    }
                } else if (response.includes('183 Session Progress')) {
                    console.log(`   📞 183 Session Progress - Early media (call is progressing)`);
                    this.appendSipLog(callId, '183 Session Progress received');
                    callProgressing = true; // Mark that call is progressing
                    // Send SIP event to CRM
                    this.sendSipEventToCRM(callId, 183, 'Session Progress', 'progress').catch(err => {
                        console.error('Error sending 183 event to CRM:', err.message);
                    });
                    
                    // Start generating greeting from Assistant API while call is progressing (non-blocking)
                    if (sessionInfo && !sessionInfo.greetingGenerated) {
                        sessionInfo.greetingGenerated = true; // Mark as started to prevent duplicate generation
                        const leadInfo = sessionInfo.leadInfo || {};
                        console.log(`🤖 Starting greeting generation from Assistant API while call is progressing...`);
                        this.voiceInteraction.generateInitialGreeting(sessionInfo.id, leadInfo)
                            .then(greeting => {
                                if (greeting && greeting.trim().length > 0) {
                                    sessionInfo.greeting = greeting; // Store in session for immediate use
                                    console.log(`✅ Greeting ready from Assistant: "${greeting}"`);
                                    this.appendSipLog(callId, `Greeting generated and ready: ${greeting.substring(0, 50)}...`);
                                } else {
                                    console.error('❌ Assistant returned empty greeting');
                                }
                            })
                            .catch(error => {
                                console.error('❌ Error generating greeting during progress:', error.message);
                                // Don't set greeting - will generate on the spot when call is answered
                            });
                    }
                    
                    // Extract RTP endpoint from early media SDP
                    const sdpMatch = response.match(/Content-Length: (\d+)\r\n\r\n([\s\S]+)/);
                    if (sdpMatch) {
                        const earlySDP = sdpMatch[2];
                        rtpEndpoint = this.parseSDPAnswer(earlySDP);
                        console.log(`   🎵 Early media RTP: ${rtpEndpoint.host}:${rtpEndpoint.port}`);
                        this.appendSipLog(callId, `Early SDP host=${rtpEndpoint.host} port=${rtpEndpoint.port}`);
                    }
                    
                    // Extend timeout since call is progressing (give more time for 200 OK)
                    if (callTimeout) {
                        clearTimeout(callTimeout);
                        console.log(`   ⏰ Extended timeout - call is progressing, waiting for 200 OK...`);
                        // Reset timeout to 45 seconds from now (15 more seconds)
                        callTimeout = setTimeout(() => {
                            if (!callAnswered) {
                                console.log(`⏰ Call timeout - no 200 OK received (but 183 was received, call may still be connecting)`);
                                this.appendSipLog(callId, 'Call timeout waiting for 200 OK after 183');
                                this.stopSIPKeepalive(callId);
                                client.close();
                                reject(new Error('Call timeout - 200 OK not received'));
                            }
                        }, 45000); // 45 seconds total from INVITE
                    }
                } else if (response.includes('200 OK')) {
                    console.log(`   🎉 200 OK - Call answered!`);
                    
                    // Send SIP event to CRM (call answered)
                    this.sendSipEventToCRM(callId, 200, 'OK', 'answered').catch(err => {
                        console.error('Error sending 200 event to CRM:', err.message);
                    });
                    
                    // Clear timeout since we got 200 OK
                    if (callTimeout) {
                        clearTimeout(callTimeout);
                        callTimeout = null;
                    }
                    
                    // Only process 200 OK once
                    if (callAnswered) {
                        console.log(`   ⚠️ Duplicate 200 OK received, ignoring`);
                        return;
                    }
                    callAnswered = true;
                    
                    // Extract To tag
                    const toTagMatch = response.match(/To:.*tag=([^;\r\n]+)/);
                    if (toTagMatch) {
                        toTag = toTagMatch[1];
                    }

                    // Extract final RTP endpoint from SDP - try multiple patterns
                    let finalSDP = null;
                    
                    // Pattern 1: Content-Length header
                    let sdpMatch = response.match(/Content-Length: (\d+)\r\n\r\n([\s\S]+)/);
                    if (sdpMatch) {
                        finalSDP = sdpMatch[2];
                        console.log(`\n📋 SDP found via Content-Length pattern`);
                    }
                    
                    // Pattern 2: Look for SDP after double CRLF
                    if (!finalSDP) {
                        sdpMatch = response.match(/\r\n\r\n([\s\S]+)/);
                        if (sdpMatch) {
                            const potentialSDP = sdpMatch[1];
                            // Check if it looks like SDP (starts with v=0)
                            if (potentialSDP.trim().startsWith('v=0')) {
                                finalSDP = potentialSDP;
                                console.log(`\n📋 SDP found via double CRLF pattern`);
                            }
                        }
                    }
                    
                    // Pattern 3: Look for SDP anywhere in response
                    if (!finalSDP) {
                        sdpMatch = response.match(/v=0[\s\S]+?m=audio[\s\S]+?(?=\r\n\r\n|\r\n$|$)/);
                        if (sdpMatch) {
                            finalSDP = sdpMatch[0];
                            console.log(`\n📋 SDP found via v=0 pattern`);
                        }
                    }
                    
                    if (finalSDP) {
                        console.log(`\n📋 SDP Answer from PBX (what PBX is telling us):`);
                        console.log(finalSDP);
                        rtpEndpoint = this.parseSDPAnswer(finalSDP);
                        this.appendSipLog(callId, `Answer SDP host=${rtpEndpoint?.host} port=${rtpEndpoint?.port}`);
                        
                        console.log(`\n🔌 PORT VERIFICATION (Symmetric RTP - FIXED):`);
                        console.log(`   Our SIP Via port: ${sessionInfo.sipPort} (for SIP signaling)`);
                        console.log(`   Our SDP RTP port: ${sessionInfo.rtpReceivePort} (advertised in SDP)`);
                        console.log(`   ✅ SYMMETRIC RTP: We send FROM and receive ON port ${sessionInfo.rtpReceivePort}`);
                        console.log(`   PBX RTP send port: ${rtpEndpoint?.port} (PBX will send audio to our port ${sessionInfo.rtpReceivePort})`);
                        console.log(`   PBX RTP host: ${rtpEndpoint?.host}`);
                        console.log(`   ✅ Port mismatch FIXED: Sending from same port as advertised in SDP`);
                        console.log(`   ✅ rport parameter: enabled in Via header`);
                        
                        if (!rtpEndpoint || !rtpEndpoint.host || !rtpEndpoint.port) {
                            console.error(`   ❌ Failed to parse RTP endpoint from SDP!`);
                            console.error(`   Host: ${rtpEndpoint?.host}, Port: ${rtpEndpoint?.port}`);
                            this.appendSipLog(callId, 'Failed to parse RTP endpoint from SDP');
                        }
                    } else {
                        console.error(`   ❌ No SDP found in 200 OK response!`);
                        console.log(`   🔍 Response analysis:`);
                        console.log(`   - Contains Content-Length: ${response.includes('Content-Length')}`);
                        console.log(`   - Contains v=0: ${response.includes('v=0')}`);
                        console.log(`   - Contains m=audio: ${response.includes('m=audio')}`);
                        console.log(`   - Response length: ${response.length} chars`);
                        
                        // Try to use early media RTP endpoint if available
                        if (rtpEndpoint && rtpEndpoint.host && rtpEndpoint.port) {
                            console.log(`   🔄 Using early media RTP endpoint as fallback`);
                            this.appendSipLog(callId, `Using early media endpoint fallback host=${rtpEndpoint.host} port=${rtpEndpoint.port}`);
                        } else {
                            console.error(`   ❌ No valid RTP endpoint found anywhere!`);
                            
                            // Create a fallback RTP endpoint using PBX IP
                            console.log(`   🔄 Creating fallback RTP endpoint using PBX IP`);
                            rtpEndpoint = {
                                host: activeConfig.server, // Use PBX IP
                                port: 10000, // Default RTP port
                                codec: 'PCMU'
                            };
                            console.log(`   🎵 Fallback RTP endpoint: ${rtpEndpoint.host}:${rtpEndpoint.port} (${rtpEndpoint.codec})`);
                            this.appendSipLog(callId, `Fallback RTP endpoint created host=${rtpEndpoint.host} port=${rtpEndpoint.port}`);
                        }
                    }

                    // Extract Contact URI (where ACK should be addressed)
                    let contactUri = null;
                    const contactMatch = response.match(/Contact:\s*(<sip:[^>]+>)/i);
                    if (contactMatch) {
                        contactUri = contactMatch[1];
                        console.log(`   📌 Using Contact URI for ACK: ${contactUri}`);
                    } else {
                        console.log('   ⚠️ No Contact header found in 200 OK, falling back to Request-URI style ACK');
                    }

                    // Extract Record-Route headers (for Route set)
                    const recordRouteMatches = response.match(/^Record-Route:\s*(.*)$/gmi) || [];
                    const routeHeaders = recordRouteMatches.map(h => h.replace(/^Record-Route:\s*/i, '').trim());
                    if (routeHeaders.length > 0) {
                        console.log(`   📌 Using ${routeHeaders.length} Route header(s) for ACK:`, routeHeaders);
                    }

                    // Send ACK
                    const ackMessage = this.createSIPACK(
                        sessionInfo.phoneNumber,
                        toTag,
                        fromTag,
                        callId,
                        branch,
                        sessionInfo.publicIP,
                        localPort,
                        contactUri,
                        routeHeaders,
                        activeConfig
                    );

                    // Determine ACK destination: if Route headers exist, send to first Route header
                    // Otherwise, send to Contact URI or fallback to SIP server
                    let ackHost = activeConfig.server;
                    let ackPort = activeConfig.port;
                    
                    if (routeHeaders.length > 0) {
                        // Extract address from first Route header (will be reversed in ACK, so use last one)
                        const firstRoute = routeHeaders[routeHeaders.length - 1]; // Last in Record-Route = first in Route set
                        // Parse Route header: <sip:host;params> or sip:host;params or <sip:host:port;params>
                        // Extract hostname (before : or ;) and port (after :, before ;)
                        const routeMatch = firstRoute.match(/<sip:([^:;>]+)(?::(\d+))?/i) || firstRoute.match(/sip:([^:;>]+)(?::(\d+))?/i);
                        if (routeMatch) {
                            ackHost = routeMatch[1].trim(); // Hostname only, no parameters
                            ackPort = routeMatch[2] ? parseInt(routeMatch[2], 10) : 5060;
                            console.log(`   📍 ACK destination: ${ackHost}:${ackPort} (from Route header)`);
                        } else {
                            console.error(`   ⚠️ Failed to parse Route header: ${firstRoute}`);
                        }
                    } else if (contactUri) {
                        // Extract address from Contact URI
                        // Format: <sip:user@host:port;params> or sip:user@host:port;params
                        // Need to extract host (before : or ;) and port (after :, before ;)
                        const contactMatch = contactUri.match(/<sip:[^@]+@([^:;>]+)(?::(\d+))?/i) || contactUri.match(/sip:[^@]+@([^:;>]+)(?::(\d+))?/i);
                        if (contactMatch) {
                            ackHost = contactMatch[1].trim(); // Hostname only, no parameters
                            ackPort = contactMatch[2] ? parseInt(contactMatch[2], 10) : 5060;
                            console.log(`   📍 ACK destination: ${ackHost}:${ackPort} (from Contact URI)`);
                        } else {
                            console.error(`   ⚠️ Failed to parse Contact URI: ${contactUri}`);
                        }
                    }

                    console.log(`   📤 Sending ACK to ${ackHost}:${ackPort}...`);
                    console.log(`   📋 ACK Message:`);
                    console.log(ackMessage);
                    this.appendSipLog(callId, `Sending ACK to ${ackHost}:${ackPort}\n${ackMessage}`);
                    
                    client.send(ackMessage, ackPort, ackHost, (err) => {
                        if (err) {
                            console.error(`   ❌ ACK send error: ${err.message}`);
                            this.appendSipLog(callId, `ACK send error: ${err.message}`);
                        } else {
                            console.log(`   ✅ ACK sent - call established!`);
                            this.appendSipLog(callId, 'ACK sent to PBX');
                            
                            // Session already stored on 200 OK, just ensure RTP endpoint is updated
                            if (this.currentSession) {
                                this.currentSession.rtpEndpoint = rtpEndpoint;
                                console.log(`\n🔌 SESSION UPDATED IN ACK:`);
                                console.log(`   RTP Endpoint: ${rtpEndpoint?.host}:${rtpEndpoint?.port}`);
                            }
                            
                            // Start conversation immediately - SIP and RTP use different ports, so no conflict
                            // SIP socket stays open for receiving BYE messages, RTP uses symmetric port
                            setTimeout(async () => {
                                try {
                                    console.log(`\n🚀 Starting conversation (Symmetric RTP enabled)...`);
                                    if (this.currentSession && this.currentSession.rtpEndpoint) {
                                        console.log(`   ✅ Session ready: ${this.currentSession.id}`);
                                        console.log(`   ✅ RTP Endpoint: ${this.currentSession.rtpEndpoint.host}:${this.currentSession.rtpEndpoint.port}`);
                                        console.log(`   ✅ RTP Port: ${this.currentSession.rtpReceivePort} (symmetric - send FROM and receive ON same port)`);
                                        console.log(`   ✅ SIP Port: ${localPort} (separate from RTP port)`);
                                        await this.startConversation(this.currentSession.rtpEndpoint, this.currentSession);
                                    } else {
                                        console.error('❌ Session not ready:', {
                                            sessionExists: !!this.currentSession,
                                            rtpEndpointExists: !!(this.currentSession?.rtpEndpoint)
                                        });
                                    }
                                } catch (error) {
                                    console.error('❌ Conversation error:', error);
                                    console.error(error.stack);
                                    this.endCall();
                                }
                            }, 500); // Small delay to ensure ACK is processed
                        }
                    });

                } else if (response.includes('401') || response.includes('407')) {
                    if (!authAttempted) {
                        authAttempted = true;
                        console.log(`   🔑 Authentication required`);
                        // Handle authentication if needed
                        // For direct trunk, this might not be needed
                    }
                } else if (response.includes('487')) {
                    console.log(`   ❌ 487 Request Terminated`);
                    this.appendSipLog(callId, '487 Request Terminated received');
                    this.stopSIPKeepalive(callId);
                    client.close();
                    reject(new Error('Call terminated'));
                } else if (response.startsWith('BYE')) {
                    console.log(`   📞 BYE received from PBX`);
                    this.appendSipLog(callId, 'BYE received from PBX');
                    
                    // Send BYE event to CRM
                    this.sendSipEventToCRM(callId, 'BYE', 'BYE', 'bye').catch(err => {
                        console.error('Error sending BYE event to CRM:', err.message);
                    });
                    try {
                        // Respond with 200 OK to BYE
                        const byeMatch = response.match(/Call-ID: ([^\r\n]+)/);
                        const byeToTagMatch = response.match(/To:.*tag=([^;\r\n]+)/);
                        
                        if (byeMatch && byeToTagMatch) {
                            const byeCallId = byeMatch[1];
                            const byeToTag = byeToTagMatch[1];
                            
                            const viaMatch = response.match(/Via: ([^\r\n]+)/);
                            const fromMatch = response.match(/From: ([^\r\n]+)/);
                            const toMatch = response.match(/To: ([^\r\n]+)/);
                            const cseqMatch = response.match(/CSeq: ([^\r\n]+)/);
                            
                            const byeResponse = `SIP/2.0 200 OK\r
Via: ${viaMatch ? viaMatch[1] : ''}\r
From: ${fromMatch ? fromMatch[1] : ''}\r
To: ${toMatch ? toMatch[1] : ''}\r
Call-ID: ${byeCallId}\r
CSeq: ${cseqMatch ? cseqMatch[1] : '1 BYE'}\r
Content-Length: 0\r
\r
`;
                            
                            client.send(byeResponse, activeConfig.port, activeConfig.server, (err) => {
                                if (err) {
                                    console.error(`   ❌ BYE response error: ${err.message}`);
                                } else {
                                    console.log(`   ✅ BYE 200 OK sent`);
                                }
                            });
                            
                            // End the call
                            if (this.currentSession && this.currentSession.id === byeCallId) {
                                this.endCall();
                            }
                        }
                    } catch (byeError) {
                        console.error(`   ❌ Error handling BYE: ${byeError.message}`);
                    }
                }

                // Store session info
                // Extract Contact URI and Record-Route headers for later use in BYE
                let contactUri = null;
                const contactMatch = response.match(/Contact:\s*(<sip:[^>]+>)/i);
                if (contactMatch) {
                    contactUri = contactMatch[1];
                }
                
                const recordRouteMatches = response.match(/^Record-Route:\s*(.*)$/gmi) || [];
                const routeHeaders = recordRouteMatches.map(h => h.replace(/^Record-Route:\s*/i, '').trim());
                
                // Extract CSeq from 200 OK to track for BYE
                let lastCSeq = 1;
                const cseqMatch = response.match(/CSeq:\s*(\d+)/i);
                if (cseqMatch) {
                    lastCSeq = parseInt(cseqMatch[1], 10);
                }

                const session = {
                    id: callId,
                    phoneNumber: sessionInfo.phoneNumber,
                    status: 'connected',
                    startTime: new Date(),
                    udpClient: client,
                    toTag,
                    fromTag,
                    leadId: sessionInfo.leadId || null, // Store leadId from metadata
                    branch,
                    rtpEndpoint,
                    localPort,
                    contactUri, // Store Contact URI for BYE
                    routeHeaders, // Store Route headers for BYE
                    lastCSeq, // Store last CSeq for BYE
                    ...sessionInfo,
                    sipLogPath: path.join(this.sipLogsDir, `${callId}.log`)
                };

                // Update stored session in map immediately (even before 200 OK)
                // This allows SIP events to find the session with all its properties
                this.sessionsByCallId.set(callId, session);

                // Only resolve on 200 OK
                    if (response.includes('200 OK')) {
                    // Store session immediately when we get 200 OK
                    this.currentSession = session;
                    console.log(`\n🔌 SESSION CREATED ON 200 OK:`);
                    console.log(`   Session ID: ${session.id}`);
                    console.log(`   RTP Endpoint: ${rtpEndpoint?.host}:${rtpEndpoint?.port}`);
                    console.log(`   RTP Receive Port: ${session.rtpReceivePort}`);
                    console.log(`   SIP Port: ${session.sipPort}`);
                    this.appendSipLog(callId, `Session established. Final RTP endpoint ${rtpEndpoint?.host}:${rtpEndpoint?.port}`);
                    resolve(session);
                }
                } catch (error) {
                    console.error(`❌ Error processing SIP message: ${error.message}`);
                    console.error(`   Stack: ${error.stack}`);
                    // Don't reject here, just log the error and continue
                }
            });

            client.on('error', (err) => {
                console.error(`❌ UDP Error: ${err.message}`);
                this.appendSipLog(callId, `UDP error: ${err.message}`);
                this.stopSIPKeepalive(callId);
                reject(err);
            });

            // Bind and send
            client.bind(localPort, async () => {
                console.log(`\n📤 Sending SIP INVITE...`);
                console.log(`   To: ${activeConfig.server}:${activeConfig.port}`);
                this.appendSipLog(callId, `Sending INVITE -> ${activeConfig.server}:${activeConfig.port} (local ${sessionInfo.publicIP}:${localPort})`);
                
                client.send(sipInvite, activeConfig.port, activeConfig.server, (err) => {
                    if (err) {
                        console.error(`❌ INVITE send error: ${err.message}`);
                        this.appendSipLog(callId, `INVITE send error: ${err.message}`);
                        client.close();
                        reject(err);
                    } else {
                        console.log(`✅ SIP INVITE sent successfully`);
                        this.appendSipLog(callId, 'INVITE sent successfully');
                    }
                });

                this.startSIPKeepalive(callId, client, activeConfig);

                // Timeout after 30 seconds (will be extended if 183 is received)
                // Check for callAnswered (200 OK) instead of rtpEndpoint, since 183 sets rtpEndpoint
                callTimeout = setTimeout(() => {
                    if (!callAnswered) {
                        if (callProgressing) {
                            console.log(`⏰ Call timeout - received 183 but no 200 OK after 30s`);
                            this.appendSipLog(callId, 'Call timeout - 183 received but no 200 OK');
                        } else {
                            console.log(`⏰ Call timeout - no answer (no 183 or 200 OK)`);
                            this.appendSipLog(callId, 'Call timeout - no response from PBX');
                        }
                        this.stopSIPKeepalive(callId);
                        client.close();
                        reject(new Error('Call timeout'));
                    }
                }, 30000);
            });
        });
    }

    /**
     * Create SIP ACK message
     * For 200 OK to INVITE, ACK must target the Contact URI and respect Record-Route/Route set.
     */
    createSIPACK(phoneNumber, toTag, fromTag, callId, branch, publicIP, localPort, contactUri = null, routeHeaders = [], sipConfig = null) {
        const activeConfig = sipConfig || this.sipConfig;
        // Remove angle brackets from Contact URI for Request-URI (Request-URI should not have brackets)
        let requestUri = contactUri || `sip:${phoneNumber}@${activeConfig.domain}`;
        if (requestUri.startsWith('<') && requestUri.endsWith('>')) {
            requestUri = requestUri.slice(1, -1); // Remove < and >
        }

        // Build Route headers if any (Record-Route should be reversed for Route set)
        // RFC 3261: Route set is Record-Route in reverse order
        const routeSet = (routeHeaders || []).slice().reverse();
        const routeLines = routeSet
            .map(r => `Route: ${r}\r\n`)
            .join('');

        console.log(`   🔧 ACK Request-URI: ${requestUri}`);
        if (routeSet.length > 0) {
            console.log(`   🔧 ACK Route set (${routeSet.length} entries):`, routeSet);
        }

        return `ACK ${requestUri} SIP/2.0\r
Via: SIP/2.0/UDP ${publicIP}:${localPort};branch=${branch};rport\r
From: <sip:${activeConfig.username}@${activeConfig.domain}>;tag=${fromTag}\r
To: <sip:${phoneNumber}@${activeConfig.domain}>;tag=${toTag}\r
${routeLines}Call-ID: ${callId}\r
CSeq: 1 ACK\r
Max-Forwards: 70\r
User-Agent: WebRTC-Voice-Agent/2.0\r
Content-Length: 0\r
\r
`;
    }

    /**
     * Create SIP BYE message
     * BYE must follow the same routing as ACK: use Route headers if present, otherwise Contact URI.
     */
    createSIPBYE(phoneNumber, toTag, fromTag, callId, branch, publicIP, localPort, contactUri = null, routeHeaders = [], cSeq = 2, sipConfig = null) {
        const activeConfig = sipConfig || this.sipConfig;
        // Remove angle brackets from Contact URI for Request-URI (Request-URI should not have brackets)
        let requestUri = contactUri || `sip:${phoneNumber}@${activeConfig.domain}`;
        if (requestUri.startsWith('<') && requestUri.endsWith('>')) {
            requestUri = requestUri.slice(1, -1); // Remove < and >
        }

        // Build Route headers if any (Record-Route should be reversed for Route set)
        // RFC 3261: Route set is Record-Route in reverse order
        const routeSet = (routeHeaders || []).slice().reverse();
        const routeLines = routeSet
            .map(r => `Route: ${r}\r\n`)
            .join('');

        console.log(`   🔧 BYE Request-URI: ${requestUri}`);
        if (routeSet.length > 0) {
            console.log(`   🔧 BYE Route set (${routeSet.length} entries):`, routeSet);
        }
        console.log(`   🔧 BYE CSeq: ${cSeq} BYE`);

        return `BYE ${requestUri} SIP/2.0\r
Via: SIP/2.0/UDP ${publicIP}:${localPort};branch=${branch};rport\r
From: <sip:${activeConfig.username}@${activeConfig.domain}>;tag=${fromTag}\r
To: <sip:${phoneNumber}@${activeConfig.domain}>;tag=${toTag}\r
${routeLines}Call-ID: ${callId}\r
CSeq: ${cSeq} BYE\r
Max-Forwards: 70\r
User-Agent: WebRTC-Voice-Agent/2.0\r
Content-Length: 0\r
\r
`;
    }

    /**
     * Start two-way conversation with full loop
     */
    async startConversation(rtpEndpoint, sessionInfo) {
        try {
            if (this.isConversationActive) {
                console.log('⚠️ Conversation already active');
                return;
            }
            this.appendSipLog(sessionInfo.id, 'Conversation loop started');

            // Validate RTP endpoint
            if (!rtpEndpoint || !rtpEndpoint.host || !rtpEndpoint.port) {
                console.error(`❌ Invalid RTP endpoint:`, rtpEndpoint);
                throw new Error('Invalid RTP endpoint - cannot start conversation');
            }

            this.isConversationActive = true;
            console.log(`\n${'='.repeat(60)}`);
            console.log(`🎙️ STARTING TWO-WAY CONVERSATION`);
            console.log(`${'='.repeat(60)}`);
            console.log(`🎵 RTP Endpoint: ${rtpEndpoint.host}:${rtpEndpoint.port} (${rtpEndpoint.codec})`);

            // Get lead information from metadata
            const leadInfo = sessionInfo.leadInfo || {};
            
            // Initialize conversation in manager with lead info
            const conversation = this.conversationManager.startConversation(sessionInfo.id, {
                voice: sessionInfo.voice,
                greeting: sessionInfo.greeting,
                maxTurns: 999999, // Unlimited turns - conversation continues until call ends
                timeout: 60000,
                leadInfo: leadInfo
            });
            
            // CRITICAL: Ensure conversation starts in greeting stage
            // This prevents bot from jumping to questions when user speaks first
            if (conversation && conversation.context) {
                conversation.context.stage = 'greeting';
                conversation.context.leadConfirmed = false;
                conversation.context.timeConfirmed = false;
                conversation.context.greetingUsed = false;
                console.log(`📌 Reset conversation to greeting stage to ensure proper flow`);
            }
            
            // Use pre-generated greeting if available (generated during ringing), otherwise generate now
            let greeting = sessionInfo.greeting;
            
            if (!greeting || greeting.trim().length === 0) {
                // Greeting wasn't ready from ringing phase, generate it now
                console.log(`⏳ Greeting not ready yet, generating now from Assistant API...`);
                try {
                    greeting = await this.voiceInteraction.generateInitialGreeting(sessionInfo.id, leadInfo);
                    if (!greeting || greeting.trim().length === 0) {
                        throw new Error('Assistant returned empty greeting');
                    }
                    console.log(`✅ Greeting generated: "${greeting}"`);
                } catch (error) {
                    console.error('❌ CRITICAL: Failed to generate greeting from Assistant:', error.message);
                    console.error('   This call cannot proceed without a greeting from Assistant.');
                    console.error('   Please check:');
                    console.error('   1. OPENAI_API_KEY is set correctly');
                    console.error('   2. OPENAI_ASSISTANT_ID is set correctly');
                    console.error('   3. Assistant is properly configured on platform.openai.com');
                    console.error('   4. Network connectivity to OpenAI API');
                    
                    // Throw error instead of using hardcoded fallback
                    throw new Error(`Cannot start conversation: Failed to generate greeting from Assistant. ${error.message}`);
                }
            } else {
                console.log(`✅ Using pre-generated greeting from Assistant (ready during ringing): "${greeting}"`);
            }
            
            // SMART CALL START: Wait for client to speak first (10-15 second timeout)
            // If client speaks, process their input naturally
            // If timeout, deliver the greeting
            // Use console.log as fallback if logger is not available
            try {
                if (logger && typeof logger.log === 'function') {
            logger.log(`\n${'='.repeat(60)}`);
            logger.log(`📞 Call connected - waiting for client to speak first...`);
            logger.log(`${'='.repeat(60)}`);
            logger.log(`⏱️ Listening for up to 12 seconds for client to speak first`);
            logger.log(`   If client speaks: process their input naturally`);
            logger.log(`   If timeout: deliver greeting`);
                } else {
                    console.log(`\n${'='.repeat(60)}`);
                    console.log(`📞 Call connected - waiting for client to speak first...`);
                    console.log(`${'='.repeat(60)}`);
                    console.log(`⏱️ Listening for up to 12 seconds for client to speak first`);
                    console.log(`   If client speaks: process their input naturally`);
                    console.log(`   If timeout: deliver greeting`);
                }
            } catch (logError) {
                // Fallback to console if logger fails
                console.log(`\n${'='.repeat(60)}`);
                console.log(`📞 Call connected - waiting for client to speak first...`);
                console.log(`${'='.repeat(60)}`);
                console.log(`⏱️ Listening for up to 12 seconds for client to speak first`);
                console.log(`   If client speaks: process their input naturally`);
                console.log(`   If timeout: deliver greeting`);
            }
            
            // Set up initial listening with timeout
            const initialListeningTimeout = 12000; // 12 seconds timeout
            let userSpokeFirst = false;
            let initialUserAudio = null;
            let initialTranscript = null;
            
            // Create Deepgram stream for initial listening
            let initialDeepgramStream = null;
            if (this.useDeepgramStreaming && process.env.DEEPGRAM_API_KEY) {
                try {
                    const DeepgramStreaming = require('./deepgramStreaming');
                    initialDeepgramStream = new DeepgramStreaming(process.env.DEEPGRAM_API_KEY);
                    
                    initialDeepgramStream.on('finalTranscript', (data) => {
                        logger.log(`✅ Initial Deepgram transcript: "${data.text}"`);
                    });
                    
                    await initialDeepgramStream.startStream(`${sessionInfo.id}_initial`, {
                        model: 'nova-3',
                        language: 'en',
                        smart_format: true,
                        interim_results: true,
                        sample_rate: 8000,
                        channels: 1,
                        encoding: 'linear16'
                    });
                    logger.log(`✅ Deepgram stream started for initial listening`);
                } catch (error) {
                    logger.error(`❌ Failed to start Deepgram for initial listening: ${error.message}`);
                }
            }
            
            // Set up symmetric RTP context
            const symmetricContext = { applied: false };
            
            try {
                // Listen for user input with timeout
                logger.log(`📡 Listening on RTP receive port: ${sessionInfo.rtpReceivePort}`);
                
                const initialAudioResult = await Promise.race([
                    // Audio listening promise
                    this.audioStreamManager.receiveAudioStream(
                        sessionInfo.rtpReceivePort,
                        { 
                            sessionId: sessionInfo.id,
                            codec: rtpEndpoint.codec || 'PCMU'
                        },
                        initialListeningTimeout / 1000, // Convert to seconds
                        0,
                        {
                            deepgramStream: initialDeepgramStream,
                            onFirstPacket: (rinfo) => {
                                if (!this.symmetricRTP || symmetricContext.applied) {
                                    return;
                                }
                                symmetricContext.applied = true;
                                if (!sessionInfo.rtpEndpoint) {
                                    sessionInfo.rtpEndpoint = { host: rinfo.address, port: rinfo.port, codec: rtpEndpoint.codec || 'PCMU' };
                                } else {
                                    sessionInfo.rtpEndpoint.host = rinfo.address;
                                    sessionInfo.rtpEndpoint.port = rinfo.port;
                                }
                                rtpEndpoint.host = rinfo.address;
                                rtpEndpoint.port = rinfo.port;
                                logger.log(`🔁 Symmetric RTP applied. Using ${rinfo.address}:${rinfo.port} for outbound audio`);
                            }
                        }
                    ),
                    // Timeout promise
                    new Promise((resolve) => {
                        setTimeout(() => {
                            resolve({ timeout: true });
                        }, initialListeningTimeout);
                    })
                ]);
                
                // Check if we got audio or timeout
                // If user spoke first, don't deliver pre-generated greeting - let bot respond naturally
                if (initialAudioResult && initialAudioResult.timeout) {
                    logger.log(`⏱️ Timeout reached - client didn't speak, delivering greeting`);
                    userSpokeFirst = false;
                } else if (initialAudioResult && typeof initialAudioResult === 'object' && initialAudioResult.audioBuffer) {
                    initialUserAudio = initialAudioResult.audioBuffer;
                    initialTranscript = initialAudioResult.transcript || null;
                    
                    // Check if we got meaningful audio
                    if (initialUserAudio && initialUserAudio.length >= 100) {
                        userSpokeFirst = true;
                        logger.log(`✅ Client spoke first! Received ${initialUserAudio.length} bytes`);
                        if (initialTranscript && initialTranscript.trim().length > 0) {
                            logger.log(`   Transcript: "${initialTranscript}"`);
                        }
                    } else {
                        logger.log(`⚠️ Received minimal audio (${initialUserAudio?.length || 0} bytes) - treating as timeout`);
                        userSpokeFirst = false;
                    }
                } else if (initialAudioResult && Buffer.isBuffer(initialAudioResult)) {
                    // Old format fallback
                    initialUserAudio = initialAudioResult;
                    if (initialUserAudio && initialUserAudio.length >= 100) {
                        userSpokeFirst = true;
                        logger.log(`✅ Client spoke first! Received ${initialUserAudio.length} bytes`);
                    } else {
                        logger.log(`⚠️ Received minimal audio - treating as timeout`);
                        userSpokeFirst = false;
                    }
                } else {
                    logger.log(`⚠️ No audio received - treating as timeout`);
                    userSpokeFirst = false;
                }
                
                // Get final transcript from Deepgram if available
                if (initialDeepgramStream && initialDeepgramStream.isStreaming) {
                    try {
                        await initialDeepgramStream.stopStream();
                        const finalTranscript = initialDeepgramStream.getCurrentTranscript();
                        if (finalTranscript && finalTranscript.trim().length > 0) {
                            initialTranscript = finalTranscript;
                            logger.log(`✅ Final Deepgram transcript: "${initialTranscript}"`);
                        }
                    } catch (err) {
                        logger.error(`❌ Error stopping initial Deepgram stream: ${err.message}`);
                    }
                }
                
            } catch (error) {
                logger.error(`❌ Error during initial listening: ${error.message}`);
                userSpokeFirst = false;
            }
            
            if (userSpokeFirst && initialUserAudio) {
                // Client spoke first - process their input naturally
                logger.log(`\n${'='.repeat(60)}`);
                logger.log(`✅ Client spoke first - processing their input naturally`);
                logger.log(`${'='.repeat(60)}`);
                
                // Process the user's initial input
                try {
                    const result = await this.processUserInput(initialUserAudio, sessionInfo, rtpEndpoint, initialTranscript);
                    
                    // Add to conversation messages
                    if (conversation && initialTranscript) {
                        conversation.messages.push({
                            timestamp: new Date(),
                            user: initialTranscript.trim(),
                            bot: null
                        });
                    }
                    
                    if (result.shouldEnd) {
                        // User wants to end - handle gracefully
                        const endingMessage = result.finalMessage || result.botResponse || "Thank you for your time. Goodbye.";
                        if (endingMessage) {
                            await this.speakAndWait(rtpEndpoint, sessionInfo, endingMessage);
                        }
                        this.endCall();
                        return; // Exit conversation
                    }
                    
                    // Speak bot response (already limited to maxWords by LLM generation)
                    if (result.botResponse) {
                        await this.speakAndWait(rtpEndpoint, sessionInfo, result.botResponse);
                        
                        // Mark greeting as used if the bot response contains identity confirmation question
                        const botResponseLower = result.botResponse.toLowerCase();
                        const hasIdentityQuestion = /am i speaking with|is this|may i speak with/i.test(result.botResponse);
                        if (hasIdentityQuestion && conversation && conversation.context) {
                            conversation.context.greetingUsed = true;
                            console.log('✅ Bot response contains identity question - greetingUsed set to true');
                        }
                    }
                    
                    // CRITICAL: Only deliver greeting if:
                    // 1. Bot hasn't already responded (if bot responded, don't deliver greeting)
                    // 2. Identity hasn't been confirmed yet
                    // 3. Greeting is available
                    // 4. Greeting hasn't been used yet
                    const botHasResponded = result.botResponse && result.botResponse.trim().length > 0;
                    const botResponseLower = result.botResponse ? result.botResponse.toLowerCase() : '';
                    const botAlreadyAskedIdentity = /am i speaking with|is this|may i speak with/i.test(botResponseLower);
                    
                    // Don't deliver greeting if bot has already responded
                    if (botHasResponded) {
                        logger.log(`⏭️ Skipping initial greeting - bot has already responded: "${result.botResponse.substring(0, 50)}..."`);
                        // Mark greeting as used since bot has spoken
                        if (conversation && conversation.context) {
                            conversation.context.greetingUsed = true;
                        }
                    } else if (conversation && conversation.context && !conversation.context.leadConfirmed && greeting && greeting.trim() && !conversation.context.greetingUsed && !botAlreadyAskedIdentity) {
                        logger.log(`\n${'='.repeat(60)}`);
                        logger.log(`📢 Delivering greeting after user's initial input (identity not confirmed yet, bot didn't ask)`);
                        logger.log(`${'='.repeat(60)}`);
                        
                        // Add initial greeting to conversation messages
                        conversation.messages.push({
                            timestamp: new Date(),
                            user: null,
                            bot: greeting.trim()
                        });
                        console.log(`✅ Initial greeting added to conversation messages`);
                        
                        // Deliver the greeting
                        await this.speakAndWait(rtpEndpoint, sessionInfo, greeting);
                        
                        // Mark greeting as used
                        conversation.context.greetingUsed = true;
                        console.log('✅ Greeting delivered - greetingUsed set to true');
                    } else if (botAlreadyAskedIdentity) {
                        logger.log(`⏭️ Skipping initial greeting - bot response already contains identity question`);
                    } else if (conversation && conversation.context && conversation.context.leadConfirmed) {
                        logger.log(`⏭️ Skipping initial greeting - identity already confirmed`);
                    } else if (conversation && conversation.context && conversation.context.greetingUsed) {
                        logger.log(`⏭️ Skipping initial greeting - greeting already used`);
                    } else {
                        logger.log(`⏭️ Skipping initial greeting - no greeting available or already processed`);
                    }
                    
                } catch (error) {
                    logger.error(`❌ Error processing initial user input: ${error.message}`);
                    // Fall through to deliver greeting as fallback
                    logger.log(`⚠️ Falling back to delivering greeting`);
                    userSpokeFirst = false;
                }
            }
            
            // If user didn't speak or there was an error, deliver the greeting
            if (!userSpokeFirst) {
                logger.log(`\n${'='.repeat(60)}`);
                logger.log(`📢 Client didn't speak - delivering initial greeting`);
                logger.log(`${'='.repeat(60)}`);
                
                // Add initial greeting to conversation messages
                if (conversation && greeting && greeting.trim()) {
                    conversation.messages.push({
                        timestamp: new Date(),
                        user: null,
                        bot: greeting.trim()
                    });
                    console.log(`✅ Initial greeting added to conversation messages`);
                }
                
                // Deliver the greeting (already limited to maxWords by LLM generation)
                await this.speakAndWait(rtpEndpoint, sessionInfo, greeting);
                
                // Mark greeting as used so identity confirmation can be detected properly
                if (conversation && conversation.context) {
                    conversation.context.greetingUsed = true;
                    console.log('✅ Greeting delivered - greetingUsed set to true');
                }
            }

            // Main conversation loop - unlimited turns
            let turnCount = 0;
            
            // Cleanup function (no longer needed since we create new stream per turn)
            // Defined here so it's available in catch block
            const cleanupDeepgram = async () => {
                // Streams are cleaned up per turn, nothing to do here
            };
            
            while (this.isConversationActive && this.currentSession) {
                turnCount++;
                logger.log(`\n${'-'.repeat(60)}`);
                logger.log(`🔄 Conversation Turn ${turnCount} (unlimited)`);
                logger.log(`${'-'.repeat(60)}`);

                // CRITICAL: Ensure TTS has finished before starting to listen
                try {
                    const currentState = this.audioState.getState();
                    // #region agent log
                    fetch('http://127.0.0.1:7242/ingest/d116b95a-c785-46dc-bf1d-ba3cfb5de970',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'webrtcVoiceAgent.js:1417',message:'Checking audio state before listening',data:{currentState:currentState.state,turnCount,sessionId:sessionInfo.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
                    // #endregion
                    
                    if (currentState.state === 'TTS_PLAYING') {
                        logger.log(`⏳ TTS still playing, waiting for completion before listening...`);
                        // #region agent log
                        fetch('http://127.0.0.1:7242/ingest/d116b95a-c785-46dc-bf1d-ba3cfb5de970',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'webrtcVoiceAgent.js:1422',message:'Waiting for TTS to finish before listening',data:{currentState:currentState.state},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
                        // #endregion
                        await this.audioState.waitForState('IDLE', 5000);
                    }
                } catch (err) {
                    logger.warn(`⚠️ Timeout waiting for TTS to finish, proceeding anyway: ${err.message}`);
                }
                
                // Set state to LISTENING
                this.audioState.setState('LISTENING', sessionInfo.id);

                // Step 1: Listen for user response with voice activity detection
                logger.log(`👂 Listening for user...`);
                
                // CRITICAL: Wait a bit after TTS to ensure previous receiver socket is fully closed
                // This prevents port binding conflicts when restarting the receiver
                if (turnCount > 1) {
                    logger.log(`⏳ Waiting 300ms for previous receiver socket to fully close...`);
                    await new Promise(resolve => setTimeout(resolve, 300));
                }
                
                const listeningDuration = turnCount === 1 ? 5 : 5; // Reduced from 12s - completeThought will stop early (1.5s grace)
                
                // Declare variables for this turn
                let receivedAudio = null;
                let transcript = null;
                const symmetricContext = { applied: false };
                
                // Variables for early GPT processing
                let earlyGPTResult = null;
                let earlyGPTProcessing = false;
                let currentProcessingText = null; // Track which text is being processed
                
                // Create a new Deepgram stream for this turn (each turn gets fresh connection)
                let deepgramStream = null;
                if (this.useDeepgramStreaming && process.env.DEEPGRAM_API_KEY) {
                    try {
                        deepgramStream = new DeepgramStreaming(process.env.DEEPGRAM_API_KEY);
                        
                        // Set up event listeners for debugging
                        deepgramStream.on('partialTranscript', (data) => {
                            logger.log(`🎤 Deepgram partial: "${data.text}"`);
                        });
                        deepgramStream.on('finalTranscript', (data) => {
                            logger.log(`✅ Deepgram final: "${data.text}"`);
                        });
                        // CRITICAL FIX: Only process FINAL transcripts, not partial ones
                        // The 'completeThought' event is only emitted for FINAL transcripts (is_final = true)
                        // But we need to ensure we only process ONCE per turn to prevent loops
                        let hasProcessedThisTurn = false; // Track if we've already processed this turn
                        deepgramStream.on('completeThought', async (data) => {
                            // CRITICAL: Only process if we haven't already processed this turn
                            if (hasProcessedThisTurn) {
                                logger.log(`⏭️ Already processed this turn - skipping duplicate completeThought event`);
                                return;
                            }
                            
                            logger.log(`💬 Deepgram complete thought (FINAL transcript): "${data.text}"`);
                            
                            const thoughtText = data.text && data.text.trim();
                            if (!thoughtText || thoughtText.length === 0) {
                                return; // Skip empty thoughts
                            }
                            
                            // Mark that we're processing this turn
                            hasProcessedThisTurn = true;
                            earlyGPTProcessing = true;
                            currentProcessingText = thoughtText;
                            logger.startTiming('earlyGPT');
                            logger.log(`🚀 Starting early GPT processing with FINAL transcript: "${thoughtText}"`);
                            
                            // Process in background - don't await, let audio collection continue
                            // Store a promise to track this processing
                            const earlyGPTPromise = this.processUserInput(null, sessionInfo, rtpEndpoint, thoughtText)
                                .then(result => {
                                    // Only store result if we're still processing the same text
                                    if (currentProcessingText === thoughtText) {
                                        earlyGPTResult = result;
                                        earlyGPTProcessing = false; // Mark as complete
                                        logger.log(`✅ Early GPT processing complete [${logger.endTiming('earlyGPT')}]: "${result.botResponse}"`);
                                        
                                        // Signal to stop audio collection early since GPT is ready
                                        // The audioStreamManager will handle this via completeThought timeout
                                        logger.log(`🚀 GPT ready - audio collection will stop soon (0.5s grace period)`);
                                    } else {
                                        logger.log(`⚠️ Early GPT result discarded - new thought being processed`);
                                        earlyGPTProcessing = false; // Reset flag
                                    }
                                })
                                .catch(err => {
                                    logger.error(`❌ Early GPT processing error: ${err.message}`);
                                    if (currentProcessingText === thoughtText) {
                                        earlyGPTProcessing = false;
                                        currentProcessingText = null;
                                        hasProcessedThisTurn = false; // Reset on error so we can retry
                                    }
                                });
                            
                            // Store the promise so we can check if it's still pending
                            sessionInfo._earlyGPTPromise = earlyGPTPromise;
                        });
                        deepgramStream.on('error', (error) => {
                            logger.error(`❌ Deepgram error event: ${error.message}`);
                        });
                        deepgramStream.on('closed', () => {
                            logger.log(`🔌 Deepgram closed event`);
                        });
                        
                        await deepgramStream.startStream(`${sessionInfo.id}_turn_${turnCount}`, {
                            model: 'nova-3', // Use Nova-3 for better accuracy and speed
                            language: 'en',
                            smart_format: true,
                            interim_results: true,
                            // utterance_end_ms removed - not a valid parameter in SDK v3
                            sample_rate: 8000,
                            channels: 1,
                            encoding: 'linear16'
                        });
                        logger.log(`✅ Deepgram stream started for this turn (Nova-3 model - PRIORITY)`);
                    } catch (error) {
                        logger.error(`❌ Failed to start Deepgram stream: ${error.message}`);
                        logger.warn(`⚠️ Deepgram failed - will fallback to Whisper if needed`);
                        deepgramStream = null;
                    }
                } else {
                    logger.warn(`⚠️ Deepgram streaming disabled - will use Whisper fallback`);
                }
                
                try {
                    // Listen on our allocated receive port
                    logger.log(`📡 Listening on our RTP receive port: ${sessionInfo.rtpReceivePort}`);
                    
                    const audioResult = await this.audioStreamManager.receiveAudioStream(
                        sessionInfo.rtpReceivePort,
                        { 
                            sessionId: sessionInfo.id,
                            codec: rtpEndpoint.codec || 'PCMU'
                        },
                        listeningDuration,
                        0,
                        {
                            deepgramStream: deepgramStream, // Pass Deepgram stream for real-time transcription
                            onFirstPacket: (rinfo) => {
                                if (!this.symmetricRTP || symmetricContext.applied) {
                                    return;
                                }
                                symmetricContext.applied = true;
                                if (!sessionInfo.rtpEndpoint) {
                                    sessionInfo.rtpEndpoint = { host: rinfo.address, port: rinfo.port, codec: rtpEndpoint.codec || 'PCMU' };
                                } else {
                                    sessionInfo.rtpEndpoint.host = rinfo.address;
                                    sessionInfo.rtpEndpoint.port = rinfo.port;
                                }
                                rtpEndpoint.host = rinfo.address;
                                rtpEndpoint.port = rinfo.port;
                                logger.log(`🔁 Symmetric RTP applied. Using ${rinfo.address}:${rinfo.port} for outbound audio`);
                                this.appendSipLog(sessionInfo.id, `Symmetric RTP: outbound destination updated to ${rinfo.address}:${rinfo.port}`);
                            }
                        }
                    );

                    // Handle new return format: { audioBuffer, transcript }
                    if (audioResult && typeof audioResult === 'object' && audioResult.audioBuffer) {
                        receivedAudio = audioResult.audioBuffer;
                        transcript = audioResult.transcript || null;
                    } else {
                        // Fallback for old format (just Buffer)
                        receivedAudio = audioResult;
                        transcript = null;
                    }

                    if (!receivedAudio || receivedAudio.length < 100) {
                        logger.log(`⚠️ No significant audio received (${receivedAudio?.length || 0} bytes)`);
                        
                        // Try one more time or end conversation
                        if (turnCount > 2) {
                            logger.log(`🛑 Ending conversation - no user response after ${turnCount} attempts`);
                            break;
                        }
                        
                        // Send a prompt to encourage user to speak (using Assistant API)
                        try {
                            const promptMsg = await this.voiceInteraction.generateVoiceResponse(
                                "The user hasn't spoken yet. Please encourage them to speak in a friendly way.",
                                sessionInfo.id,
                                sessionInfo.leadInfo || {}
                            );
                            await this.speakAndWait(rtpEndpoint, sessionInfo, promptMsg, 5);
                        } catch (error) {
                            console.error('❌ Error generating prompt message:', error.message);
                            // Fallback
                            const promptMsg = "I'm listening, please go ahead and speak.";
                            await this.speakAndWait(rtpEndpoint, sessionInfo, promptMsg, 5);
                        }
                        continue;
                    }

                    // Set state to PROCESSING
                    this.audioState.setState('PROCESSING', sessionInfo.id);
                    
                    logger.log(`📥 Received ${receivedAudio.length} bytes from user`);
                    
                    // CRITICAL FIX: Only use FINAL transcripts, not partial ones
                    // This prevents loops from processing partial/interim transcripts
                    if (transcript && transcript.trim().length > 0) {
                        logger.log(`   ✅ Deepgram FINAL transcript: "${transcript}"`);
                    } else if (deepgramStream && deepgramStream.isConnected) {
                        // CRITICAL: Only get FINAL transcript, not partial
                        // Use hasFinalTranscript() to check if we have a final one
                        if (deepgramStream.hasFinalTranscript()) {
                            // Get ONLY the final transcript (not partial)
                            const finalTranscript = deepgramStream.finalTranscript || '';
                            if (finalTranscript && finalTranscript.trim().length > 0) {
                                transcript = finalTranscript.trim();
                                logger.log(`   ✅ Using Deepgram FINAL transcript: "${transcript}"`);
                            } else {
                                logger.log(`   ⚠️ Deepgram has final flag but transcript is empty`);
                            }
                        } else {
                            logger.log(`   ⚠️ Deepgram connected but no FINAL transcript yet - will wait a bit longer before fallback`);
                            // Give Deepgram a bit more time to finalize (it might still be processing)
                            await new Promise(resolve => setTimeout(resolve, 500));
                            
                            // Check again for FINAL transcript only
                            if (deepgramStream.hasFinalTranscript()) {
                                const delayedFinalTranscript = deepgramStream.finalTranscript || '';
                                if (delayedFinalTranscript && delayedFinalTranscript.trim().length > 0) {
                                    transcript = delayedFinalTranscript.trim();
                                    logger.log(`   ✅ Deepgram FINAL transcript received after delay: "${transcript}"`);
                                } else {
                                    logger.log(`   ⚠️ Still no FINAL transcript after delay, will use Whisper fallback`);
                                }
                            } else {
                                logger.log(`   ⚠️ Still no FINAL transcript after delay, will use Whisper fallback`);
                            }
                        }
                    } else {
                        logger.log(`   ⚠️ No Deepgram stream available, will use Whisper fallback`);
                    }
                    logger.log(`   ✅ Audio received successfully! Processing...`);
                    
                    // Cleanup Deepgram stream for this turn
                    if (deepgramStream && deepgramStream.isStreaming) {
                        try {
                            await deepgramStream.stopStream();
                        } catch (err) {
                            logger.error(`❌ Error stopping Deepgram after receiving: ${err.message}`);
                        }
                    }
                } catch (error) {
                    logger.error(`❌ Error receiving audio: ${error.message}`);
                    logger.error(`   Error details: ${error.stack}`);
                    
                    // Try one more time or end conversation
                    if (turnCount > 2) {
                        logger.log(`🛑 Ending conversation - audio reception failed`);
                        break;
                    }
                    continue;
                }

                // Step 2: Process user speech and get bot response
                logger.log(`📝 Processing received audio...`);
                try {
                    // Check if we already have early GPT result from completeThought
                    // IMPORTANT: Only use early result if it matches the final transcript
                    // This prevents using results from previous completeThought events
                    let result = null;
                    
                    // Check if early GPT result is already available (don't wait - just check)
                    // Early GPT is an optimization - if it's not ready, proceed immediately
                    // This prevents delays while still benefiting from early GPT when available
                    if (earlyGPTProcessing && !earlyGPTResult && currentProcessingText && transcript) {
                        const normalizeText = (text) => text.trim().toLowerCase().replace(/[.,!?]/g, '').replace(/\s+/g, ' ');
                        const normalizedEarly = normalizeText(currentProcessingText);
                        const normalizedTranscript = normalizeText(transcript);
                        const isSameText = normalizedEarly === normalizedTranscript ||
                                         normalizedTranscript.includes(normalizedEarly) ||
                                         normalizedEarly.includes(normalizedTranscript);
                        
                        if (isSameText) {
                            // Same transcript - early GPT is processing
                            // Just check once (100ms) - don't block, proceed immediately
                            // The active run check in voiceInteraction.js will handle any conflicts
                            logger.log(`⏳ Early GPT processing same transcript, checking once (non-blocking)...`);
                            await new Promise(resolve => setTimeout(resolve, 100)); // Brief check only
                            
                            if (earlyGPTResult) {
                                logger.log(`✅ Early GPT result ready immediately`);
                            } else {
                                // Early GPT not ready yet - proceed immediately
                                // The active run check in voiceInteraction.js will handle it
                                logger.log(`⏭️ Early GPT not ready yet, proceeding immediately (non-blocking)`);
                                // Don't reset flags - let the active run check handle it
                            }
                        } else {
                            // Different transcript - proceed immediately
                            logger.log(`⏭️ Early GPT processing different transcript, proceeding immediately`);
                            earlyGPTProcessing = false;
                            currentProcessingText = null;
                        }
                    }
                    
                    // Use early GPT result if available and matches
                    if (earlyGPTResult) {
                        if (transcript) {
                            // Check if the early result matches the current transcript
                            const earlyUserText = earlyGPTResult.userText || '';
                            const normalizeText = (text) => text.trim().toLowerCase().replace(/[.,!?]/g, '').replace(/\s+/g, ' ');
                            const normalizedEarly = normalizeText(earlyUserText);
                            const normalizedTranscript = normalizeText(transcript);
                            const transcriptMatch = normalizedEarly === normalizedTranscript ||
                                                   normalizedTranscript.includes(normalizedEarly) ||
                                                   normalizedEarly.includes(normalizedTranscript) ||
                                                   transcript.trim().toLowerCase() === earlyUserText.trim().toLowerCase();
                            
                            if (transcriptMatch) {
                                logger.log(`✅ Using early GPT result (matches transcript: "${transcript}")`);
                                result = earlyGPTResult;
                                earlyGPTResult = null; // Clear for next turn
                                earlyGPTProcessing = false; // Reset flag
                                currentProcessingText = null; // Reset tracking
                            } else {
                                logger.log(`⚠️ Early GPT result doesn't match transcript - ignoring early result`);
                                logger.log(`   Early result was for: "${earlyUserText}"`);
                                logger.log(`   Current transcript is: "${transcript}"`);
                                earlyGPTResult = null; // Clear mismatched result
                                earlyGPTProcessing = false; // Reset flag
                                currentProcessingText = null; // Reset tracking
                            }
                        } else {
                            // No transcript available, but we have early result - use it
                            logger.log(`✅ Using early GPT result (no transcript available)`);
                            result = earlyGPTResult;
                            earlyGPTResult = null;
                            earlyGPTProcessing = false;
                            currentProcessingText = null; // Reset tracking
                        }
                    }
                    
                    // Only proceed with normal processing if we don't have a result yet
                    // Also check if early GPT is still processing the same text - if so, wait for it
                    if (!result) {
                        // If early GPT is processing the same text, wait for it to complete (max 5 seconds)
                        if (earlyGPTProcessing && currentProcessingText && transcript) {
                            const normalizeText = (text) => text.trim().toLowerCase().replace(/[.,!?]/g, '').replace(/\s+/g, ' ');
                            const normalizedEarly = normalizeText(currentProcessingText);
                            const normalizedTranscript = normalizeText(transcript);
                            const isSameText = normalizedEarly === normalizedTranscript ||
                                             normalizedTranscript.includes(normalizedEarly) ||
                                             normalizedEarly.includes(normalizedTranscript);
                            
                            if (isSameText) {
                                logger.log(`⏳ Early GPT still processing same transcript, waiting for result (max 5s)...`);
                                const maxWait = 5000; // 5 seconds
                                const startWait = Date.now();
                                while (earlyGPTProcessing && !earlyGPTResult && (Date.now() - startWait) < maxWait) {
                                    await new Promise(resolve => setTimeout(resolve, 100));
                                }
                                
                                // Check if we got the result
                                if (earlyGPTResult) {
                                    const earlyUserText = earlyGPTResult.userText || '';
                                    const normalizedEarlyUser = normalizeText(earlyUserText);
                                    if (normalizedEarlyUser === normalizedTranscript || 
                                        normalizedTranscript.includes(normalizedEarlyUser) ||
                                        normalizedEarlyUser.includes(normalizedTranscript)) {
                                        logger.log(`✅ Early GPT result ready after waiting: "${earlyGPTResult.botResponse}"`);
                                        result = earlyGPTResult;
                                        earlyGPTResult = null;
                                        earlyGPTProcessing = false;
                                        currentProcessingText = null;
                                    }
                                }
                            }
                        }
                        
                        // Only proceed with normal processing if we still don't have a result
                    if (!result) {
                        // Validate receivedAudio only if we don't have early result
                        if (!receivedAudio) {
                            logger.error(`❌ receivedAudio is null or undefined before processing`);
                            throw new Error('receivedAudio is null or undefined');
                        }
                            
                        if (!Buffer.isBuffer(receivedAudio)) {
                            logger.error(`❌ receivedAudio is not a Buffer: ${typeof receivedAudio}`);
                            throw new Error(`receivedAudio is not a Buffer, got ${typeof receivedAudio}`);
                        }
                            
                        // Store in local constant to ensure it's always in scope
                        const audioToProcess = Buffer.from(receivedAudio); // Create a copy to ensure it's a valid Buffer
                        result = await this.processUserInput(audioToProcess, sessionInfo, rtpEndpoint, transcript);
                        }
                    }
                    
                    if (result.shouldEnd) {
                        console.log(`🛑 Conversation ending signal detected`);
                        
                        // Step 1: Speak the goodbye message (from Assistant API)
                        // Use finalMessage if available (generated by Assistant for closing), otherwise use botResponse
                        const endingMessage = result.finalMessage || result.botResponse;
                        if (endingMessage) {
                            await this.speakAndWait(rtpEndpoint, sessionInfo, endingMessage);
                        }
                        
                        // Step 2: Immediately send BYE to PBX to end the call
                        logger.log(`📞 Sending BYE to PBX to end call...`);
                        this.endCall();
                        
                        // Step 3: Break out of conversation loop
                        break;
                    }

                    // Step 3: Speak bot response (for non-ending responses) - already limited to maxWords
                    if (result.botResponse) {
                        // Reset state to IDLE before TTS (will be set to TTS_PLAYING in speakAndWait)
                        this.audioState.setState('IDLE', null);
                        
                        // Anti-loop protection: Check if this response matches the PREVIOUSLY SPOKEN response
                        // (not the current one which was just added to messages)
                        const conversation = this.conversationManager.conversations.get(sessionInfo.id);
                        if (conversation && conversation.messages.length > 1) {
                            // Get the SECOND-TO-LAST message (the one that was actually spoken before)
                            // The last message is the current response that was just generated
                            const previouslySpokenResponse = conversation.messages[conversation.messages.length - 2]?.bot;
                            
                            // Normalize for comparison (remove extra spaces, lowercase)
                            const normalize = (text) => text ? text.trim().toLowerCase().replace(/\s+/g, ' ') : '';
                            const currentNormalized = normalize(result.botResponse);
                            const previousNormalized = normalize(previouslySpokenResponse);
                            
                            if (currentNormalized === previousNormalized && currentNormalized.length > 0) {
                                logger.warn(`⚠️ Preventing loop: Bot response identical to previously spoken response`);
                                logger.warn(`   Previously spoken: "${previouslySpokenResponse}"`);
                                logger.warn(`   Current: "${result.botResponse}"`);
                                logger.warn(`   Skipping speech to prevent repetition loop`);
                                
                                // Skip speaking this duplicate response
                                // The conversation will continue in next turn
                                continue;
                            }
                        }
                        
                        await this.speakAndWait(rtpEndpoint, sessionInfo, result.botResponse);
                        // Listening will start immediately in next loop iteration (no delay)
                    }

                } catch (error) {
                    // Safely log error without referencing receivedAudio
                    const errorMessage = error && error.message ? String(error.message) : 'Unknown error';
                    console.error(`❌ Error processing user input: ${errorMessage}`);
                    
                    // Log error details if available
                    if (error && error.stack) {
                        console.error(`   Stack: ${error.stack.substring(0, 200)}`);
                    }
                    
                    // Send error recovery message via Assistant API
                    try {
                        const errorRecoveryResponse = await this.voiceInteraction.generateVoiceResponse(
                            "I'm having trouble processing that. Could you please repeat?",
                            sessionInfo.id,
                            sessionInfo.leadInfo || {},
                            [],
                            0
                        );
                        await this.speakAndWait(rtpEndpoint, sessionInfo, errorRecoveryResponse, 5);
                    } catch (recoveryError) {
                        console.error(`❌ Error generating recovery message: ${recoveryError.message}`);
                        // Continue conversation - don't block on recovery message failure
                    }
                    
                    // Continue conversation after error
                    continue;
                }

                // No delay between turns - listening starts immediately in next iteration
            }

            console.log(`\n${'='.repeat(60)}`);
            console.log(`✅ CONVERSATION COMPLETED`);
            console.log(`   Turns: ${turnCount}`);
            console.log(`${'='.repeat(60)}\n`);

            // End conversation in manager
            const finalConversation = this.conversationManager.endConversation(sessionInfo.id);
            if (finalConversation) {
                console.log(`📊 Final Conversation Stats:`);
                console.log(`   Messages: ${finalConversation.messages.length}`);
                console.log(`   Duration: ${(finalConversation.duration / 1000).toFixed(2)}s`);
                console.log(`   Context:`, finalConversation.context);
            }

            // Cleanup Deepgram stream
            await cleanupDeepgram();

            // End call if not already ended (fallback - should already be called when shouldEnd was detected)
            // Only call if currentSession still exists (call wasn't ended earlier)
            if (this.currentSession) {
                logger.log(`📞 Ending call (fallback - shouldEnd may not have been detected)`);
                this.endCall();
            } else {
                logger.log(`✅ Call already ended (BYE already sent)`);
            }

            // Generate and save call summary AFTER call ends (non-blocking, doesn't delay call)
            // This runs asynchronously so it doesn't slow down the call ending
            this.generateAndSaveCallSummary(sessionInfo.id, finalConversation).catch(err => {
                logger.error(`⚠️ Failed to generate call summary: ${err.message}`);
            });

        } catch (error) {
            console.error(`\n❌ CONVERSATION ERROR: ${error.message}`);
            console.error(error.stack);
            this.appendSipLog(sessionInfo.id, `Conversation error: ${error.message}`);
            this.isConversationActive = false;
            
            // Cleanup Deepgram on error (if defined in scope)
            if (typeof cleanupDeepgram === 'function') {
                try {
            await cleanupDeepgram();
                } catch (cleanupError) {
                    console.error('❌ Error cleaning up Deepgram:', cleanupError.message);
                }
            }
            
            this.endCall();
        }
    }

    /**
     * Speak audio and wait for completion
     */
    async speakAndWait(rtpEndpoint, sessionInfo, text, listenDuration = 0) {
        const releaseLock = await this.audioLock.acquireLock('TTS');
        try {
            logger.startTiming('speakAndWait');
            logger.log(`💬 Bot says: "${text}"`);

            const sessionId = sessionInfo.id || sessionInfo.sessionId || 'default';
            
            // CRITICAL FIX #1: Wait for any previous operations to complete
            try {
                await this.audioState.waitForState('IDLE', 3000);
            } catch (err) {
                logger.warn(`⚠️ Timeout waiting for IDLE state, proceeding anyway: ${err.message}`);
            }
            
            // Set state to TTS_PLAYING to prevent listening from starting
            this.audioState.setState('TTS_PLAYING', sessionId);
            
            // CRITICAL FIX #2: Stop RTP receiver and Deepgram stream BEFORE TTS starts
            // This prevents PBX echo from being sent to Deepgram while bot is speaking
            logger.log(`🛑 Stopping RTP receiver and Deepgram stream before TTS (session: ${sessionId})`);
            this.audioStreamManager.stopActiveReceiver(sessionId);
            
            // Wait for cleanup to complete - delay to ensure socket is fully closed and port is released
            // This is important for symmetric RTP where we reuse the same port for sending
            await new Promise(resolve => setTimeout(resolve, 300));
            
            // Also stop any Deepgram stream that might be active
            // (This is a safety measure - the receiver should have already stopped it)
            
            let g711Buffer, duration, usedCodec;
            
            // Debug: Log testMode status for TTS
            if (!this.testMode) {
                logger.log(`🔍 DEBUG: speakAndWait - PRODUCTION MODE (OpenAI TTS enabled)`);
            }
            
            logger.startTiming('ttsGeneration');
            
            // For Deepgram, use HTTP POST method (non-streaming, buffered)
            if (this.voiceInteraction.ttsProvider === 'deepgram' && this.voiceInteraction.deepgramApiKey) {
                logger.log(`🎵 Using Deepgram TTS HTTP POST - Buffered mode (non-streaming)`);
                
                // Use HTTP POST to get full audio buffer
                // Determine codec based on negotiated codec (prefer G.722 for HD Voice)
                const negotiatedCodec = (rtpEndpoint && rtpEndpoint.codec) ? rtpEndpoint.codec.toUpperCase() : 'G722';
                
                if (negotiatedCodec === 'G722') {
                    // G.722 HD Voice: Get 16kHz PCM directly from TTS
                    const pcm16kHz = await this.voiceInteraction.textToSpeechDeepgramHTTP(text, true); // Request PCM mode
                    // G.722 payload is 16-bit PCM at 16kHz, use directly
                    g711Buffer = pcm16kHz; // Actually PCM16@16kHz for G.722
                    // Duration: 16-bit PCM at 16kHz = 2 bytes per sample, so duration = bytes / 2 / 16000
                    duration = (pcm16kHz.length / 2) / 16000; // 16-bit PCM @ 16kHz
                    usedCodec = 'G722';
                    logger.log(`✅ TTS generated [HTTP POST] [${logger.endTiming('ttsGeneration')}] - G.722 HD Voice (16kHz)`);
                } else {
                    // Fallback to G.711: Get mulaw directly (8kHz)
                    const mulawBuffer = await this.voiceInteraction.textToSpeechDeepgram(text);
                    g711Buffer = mulawBuffer; // Returns mulaw (8kHz - G.711 standard)
                    duration = mulawBuffer.length / 8000; // G.711 mulaw is 8kHz
                    usedCodec = 'PCMU';
                    logger.log(`✅ TTS generated [HTTP POST] [${logger.endTiming('ttsGeneration')}] - G.711 fallback (8kHz)`);
                }
                
                // CRITICAL FIX: Use SAME port for sending and receiving (symmetric RTP)
                // This is required for proper NAT traversal and PBX compatibility
                const rtpReceivePort = sessionInfo.rtpReceivePort;
                const rtpSendPort = rtpReceivePort; // Use SAME port as receiver (symmetric RTP)
                
                logger.log(`🔌 Using symmetric RTP: Receive=${rtpReceivePort}, Send=${rtpSendPort} (same port)`);
                
                const effectiveCodec = usedCodec;
                const payloadType = (effectiveCodec === 'G722') ? 9 : (effectiveCodec === 'PCMA' ? 8 : 0);
                logger.log(`📤 Sending audio (${duration.toFixed(2)}s)...`);
                logger.log(`   🎯 Destination: ${rtpEndpoint.host}:${rtpEndpoint.port} (${effectiveCodec})`);
                logger.log(`   🔌 Local RTP send port: ${rtpSendPort} (same as receive port ${rtpReceivePort} - symmetric RTP)`);
                logger.log(`   🎚 Payload type: ${payloadType} (codec: ${effectiveCodec})`);
                logger.startTiming('sendAudio');
                await this.audioStreamManager.sendAudioStream(g711Buffer, rtpEndpoint, {
                    sessionId: sessionInfo.id,
                    ssrc: Math.floor(Math.random() * 0xFFFFFFFF),
                    rtpSendPort: rtpSendPort,
                    localPort: rtpSendPort, // Use SAME port as receiver (symmetric RTP)
                    codec: effectiveCodec,
                    payloadType
                });
                logger.log(`✅ Audio sent successfully [${logger.endTiming('sendAudio')}]`);
            } else {
                // Non-streaming mode (for other TTS providers or fallback)
                // Use generateRTPAudio which handles all TTS providers correctly:
                // - Deepgram: Returns mulaw directly (no conversion needed)
                // - Azure: Returns mulaw directly (no conversion needed)
                // - Others: Returns MP3, then converts to G.711
                const rtpAudioResult = await this.voiceInteraction.generateRTPAudio(text, sessionInfo.voice);
                g711Buffer = rtpAudioResult.pcm; // Already in G.711 format (mulaw/PCMU)
                duration = rtpAudioResult.duration;
                usedCodec = 'PCMU'; // Deepgram and Azure both return PCMU (mulaw)
                
                logger.log(`✅ TTS generated [${logger.endTiming('ttsGeneration')}]`);

                // Send audio
                // CRITICAL FIX: Use SAME port for sending and receiving (symmetric RTP)
                // This is required for proper NAT traversal and PBX compatibility
                const rtpReceivePort = sessionInfo.rtpReceivePort;
                const rtpSendPort = rtpReceivePort; // Use SAME port as receiver (symmetric RTP)
                
                logger.log(`🔌 Using symmetric RTP: Receive=${rtpReceivePort}, Send=${rtpSendPort} (same port)`);
                
                const effectiveCodec = (usedCodec || (rtpEndpoint && rtpEndpoint.codec) || 'PCMU').toUpperCase();
                const payloadType = effectiveCodec === 'PCMA' ? 8 : 0;

                logger.log(`📤 Sending audio (${duration.toFixed(2)}s)...`);
                logger.log(`   🎯 Destination: ${rtpEndpoint.host}:${rtpEndpoint.port} (${effectiveCodec})`);
                logger.log(`   🔌 Local RTP send port: ${rtpSendPort} (same port as receiver for symmetric RTP)`);
                logger.log(`   🎚 Payload type: ${payloadType} (codec: ${effectiveCodec})`);
                logger.startTiming('sendAudio');
                
                const sendStartTime = Date.now();
                await this.audioStreamManager.sendAudioStream(g711Buffer, rtpEndpoint, {
                    sessionId: sessionInfo.id,
                    ssrc: Math.floor(Math.random() * 0xFFFFFFFF),
                    rtpSendPort: rtpSendPort,
                    localPort: rtpSendPort, // Use SAME port as receiver (symmetric RTP)
                    codec: effectiveCodec,
                    payloadType
                });
                const sendEndTime = Date.now();
                const sendDuration = (sendEndTime - sendStartTime) / 1000;

                logger.log(`✅ Audio sent successfully [${logger.endTiming('sendAudio')}]`);
            }

            // Reset state to IDLE immediately - don't wait for cleanup
            this.audioState.setState('IDLE', null);
            
            // Cleanup RTP sockets asynchronously (don't block)
            this.cleanupRtpSockets(sessionId).catch(() => {});
            logger.log(`✅ TTS complete - ready for next listening cycle`);
            logger.log(`✅ speakAndWait complete [${logger.endTiming('speakAndWait')}]`);
            
            // Release lock
            releaseLock();

                } catch (error) {
            // Reset state on error
            this.audioState.setState('IDLE', null);
            // Cleanup on error
            await this.cleanupRtpSockets(sessionId).catch(() => {});
            // Release lock on error
            releaseLock();
            logger.error(`❌ Error speaking: ${error.message}`);
            throw error;
        }
    }
    
    /**
     * Cleanup all RTP sockets for a session
     */
    async cleanupRtpSockets(sessionId) {
        try {
            logger.log(`🧹 Cleaning up RTP sockets for session: ${sessionId}`);
            
            const sockets = this.activeRtpSockets.get(sessionId);
            if (sockets) {
                // Close receiver socket
                if (sockets.receiver && sockets.receiver._handle) {
                    try {
                        sockets.receiver.close();
                        logger.log(`✅ RTP receiver socket closed`);
                    } catch (err) {
                        logger.warn(`⚠️ Error closing receiver socket: ${err.message}`);
                    }
                }
                
                // Close sender socket
                if (sockets.sender && sockets.sender._handle) {
                    try {
                        sockets.sender.close();
                        logger.log(`✅ RTP sender socket closed`);
                    } catch (err) {
                        logger.warn(`⚠️ Error closing sender socket: ${err.message}`);
                    }
                }
                
                this.activeRtpSockets.delete(sessionId);
            }
            
            // No delay needed - sockets close immediately
            logger.log(`✅ RTP socket cleanup complete`);
        } catch (error) {
            logger.error(`❌ Error during RTP cleanup: ${error.message}`);
        }
    }

    /**
     * Process user audio input and generate bot response
     */
    async processUserInput(receivedAudio, sessionInfo, rtpEndpoint, transcript = null) {
        try {
            logger.startTiming('processUserInput');
            logger.log(`🔄 Processing user input...`);

            // If transcript is provided and no audio needed, skip audio validation
            if (transcript && transcript.trim().length > 0 && (!receivedAudio || receivedAudio === null)) {
                logger.log(`✅ Using transcript directly (no audio processing needed): "${transcript}"`);
                // Skip audio validation - we have transcript
            } else if (!receivedAudio || !Buffer.isBuffer(receivedAudio)) {
                // Only validate if we need audio (no transcript provided)
                if (!transcript || transcript.trim().length === 0) {
                    logger.error(`❌ Invalid receivedAudio: ${typeof receivedAudio}`);
                    throw new Error('receivedAudio is not defined or invalid');
                } else {
                    logger.log(`⚠️ No audio but transcript available, using transcript: "${transcript}"`);
                }
            }

            // Only convert to WAV if we don't have Deepgram transcript (skip to save time)
            // This is the optimized fallback - only prepare Whisper if Deepgram actually failed
            let wavAudio = null;
            if (!transcript || transcript.trim().length === 0) {
                // No transcript available - fallback to Whisper
                // Note: deepgramStream is not in scope here, so we can't check its status
                // If Deepgram was working, the transcript would have been passed as a parameter
                logger.log(`⚠️ No transcript available, falling back to Whisper transcription`);
                
                // No Deepgram transcript - fallback to Whisper (optimized: only convert if needed)
                const negotiatedCodec = (rtpEndpoint && rtpEndpoint.codec) ? rtpEndpoint.codec : 'PCMU';
                logger.log(`⚠️ Falling back to Whisper (codec: ${negotiatedCodec})...`);
                logger.log(`🎵 Converting to WAV for Whisper fallback...`);
                
                // Only convert if we have audio (optimization: skip if no audio received)
                if (receivedAudio && receivedAudio.length > 0) {
                    wavAudio = await this.audioStreamManager.prepareForWhisper(receivedAudio, negotiatedCodec);
                    
                    // Save WAV for debugging (keep only latest per session)
                    const fs = require('fs');
                    const path = require('path');
                    const tmpDir = path.join(__dirname, '../tmp');
                    
                    // Delete old user_speech files for this session (keep only latest)
                    try {
                        if (fs.existsSync(tmpDir)) {
                            const files = fs.readdirSync(tmpDir);
                            files.forEach(file => {
                                // Delete old user_speech files for this session
                                if (file.startsWith(`user_speech_${sessionInfo.id}_`) && file.endsWith('.wav')) {
                                    const oldFilePath = path.join(tmpDir, file);
                                    try {
                                        fs.unlinkSync(oldFilePath);
                                        console.log(`🗑️ Deleted old user speech file: ${file}`);
                                    } catch (err) {
                                        // Ignore errors during cleanup
                                    }
                                }
                            });
                        }
                    } catch (err) {
                        // Ignore cleanup errors
                    }
                    
                    const wavPath = path.join(tmpDir, `user_speech_${sessionInfo.id}.wav`);
                    fs.writeFileSync(wavPath, wavAudio);
                    console.log(`💾 Saved user speech for Whisper fallback: ${wavPath}`);
                } else {
                    logger.log(`⚠️ No audio received - cannot fallback to Whisper`);
                }
            } else {
                logger.log(`✅ Skipping WAV conversion - using Deepgram transcript`);
            }

            let userText;
            
            // Debug: Log testMode status
            console.log(`\n🔍 DEBUG: Processing user input...`);
            console.log(`   testMode: ${this.testMode} (${this.testMode ? 'TEST MODE - OpenAI DISABLED' : 'PRODUCTION MODE - OpenAI ENABLED'})`);
            
            if (this.testMode) {
                // TEST MODE: Skip Whisper transcription (saves costs)
                console.log(`🧪 TEST MODE: Skipping Whisper transcription (NO OpenAI costs)...`);
                console.log(`💰 SAVED: ~$0.006 Whisper costs + GPT-4 costs`);
                console.log(`   💡 Note: Response will use TTS (~$0.01) so you can hear it`);
                
                // In test mode, just acknowledge that we received audio
                userText = "[TEST MODE - Audio received, no transcription]";
                console.log(`\n${'='.repeat(60)}`);
                const audioSize = receivedAudio && Buffer.isBuffer(receivedAudio) ? receivedAudio.length : 0;
                console.log(`📝 TEST MODE - Audio received (${audioSize} bytes)`);
                console.log(`   To end test mode, say: "${this.testModeEndPhrase}"`);
                console.log(`${'='.repeat(60)}\n`);
                
                // Return test mode response (no OpenAI costs)
                return {
                    userText: userText,
                    botResponse: `I received your audio. Test mode is active. Your voice is working! To enable full AI responses with transcription, say "${this.testModeEndPhrase}".`,
                    shouldEnd: false
                };
            } else {
                // PRODUCTION MODE: Prioritize Deepgram, only use Whisper as fallback
                if (transcript && transcript.trim().length > 0) {
                    // Use Deepgram transcript (PRIORITY - already transcribed, skip Whisper)
                    console.log(`✅ Using Deepgram transcript (PRIORITY - skipping Whisper/GPT): "${transcript}"`);
                    userText = transcript;
                } else {
                    // Fallback to Whisper ONLY if Deepgram completely failed
                    console.log(`⚠️ Deepgram transcript not available, falling back to Whisper...`);
                    try {
                        userText = await this.voiceInteraction.speechToTextWhisper(wavAudio);
                        console.log(`✅ Whisper fallback successful: "${userText}"`);
                    } catch (whisperError) {
                        console.error(`❌ Whisper fallback also failed: ${whisperError.message}`);
                        // Ultimate fallback - return empty to trigger error handling
                        userText = '';
                    }
                }
                
                if (!userText || userText.trim().length === 0) {
                    console.log(`⚠️ No speech detected in audio`);
                    console.log(`   📝 USER SPEECH: [NO SPEECH DETECTED]`);
                    return {
                        shouldEnd: false,
                        botResponse: "I didn't hear anything. Could you please speak again?"
                    };
                }

                console.log(`\n${'='.repeat(60)}`);
                console.log(`📝 USER SPEECH DETECTED:`);
                console.log(`   "${userText}"`);
                console.log(`${'='.repeat(60)}\n`);
                
                // Check if user wants to enable test mode (or disable it)
                if (userText.toUpperCase().includes(this.testModeEndPhrase.toUpperCase())) {
                    this.testMode = false;
                    console.log(`\n🎉 PRODUCTION MODE ENABLED! OpenAI calls will now work normally.`);
                    return {
                        userText: userText,
                        botResponse: "Production mode enabled! OpenAI services are now active.",
                        shouldEnd: false
                    };
                }

                // Process through conversation manager
                // Pass transcript if available from Deepgram (skip Whisper in conversationManager too)
                // Use wavAudio only if no transcript (for fallback), otherwise pass null to skip conversion
                logger.startTiming('gptProcessing');
                const result = await this.conversationManager.processUserSpeech(
                    sessionInfo.id, 
                    transcript ? null : wavAudio, // Skip audio if we have transcript
                    transcript || userText
                );
                logger.log(`✅ GPT processing complete [${logger.endTiming('gptProcessing')}]`);
                logger.log(`🤖 Bot will respond: "${result.botResponse}"`);

                return {
                    userText: result.userText,
                    botResponse: result.botResponse,
                    botAudio: result.botAudio,
                    shouldEnd: result.shouldEnd || false,
                    conversationState: result.conversationState
                };
            }

        } catch (error) {
            // Better error logging
            const errorMsg = error.message || 'Unknown error';
            const isReferenceError = errorMsg.includes('is not defined') || error instanceof ReferenceError;
            
            console.error(`❌ Error processing user input: ${errorMsg}`);
            if (isReferenceError) {
                console.error(`   ⚠️ ReferenceError detected - variable scope issue`);
                console.error(`   📍 This usually means a variable is being accessed outside its scope`);
            }
            console.error(`   Stack trace:`, error.stack);
            
            // Return error recovery response from Assistant API
            try {
                const errorRecoveryResponse = await this.voiceInteraction.generateVoiceResponse(
                    "I'm having trouble understanding. Could you please repeat that?",
                    sessionInfo.id,
                    sessionInfo.leadInfo || {},
                    [],
                    0
                );
            return {
                shouldEnd: false,
                    botResponse: errorRecoveryResponse
                };
            } catch (recoveryError) {
                console.error(`❌ Error generating recovery message: ${recoveryError.message}`);
                // Return empty response if Assistant API fails
                return {
                    shouldEnd: false,
                    botResponse: ""
                };
            }
        }
    }

    /**
     * End current call
     */
    /**
     * Monitor Vapi call status
     * @param {string} vapiCallId - Vapi call ID
     * @param {Object} sessionInfo - Session info
     */
    async monitorVapiCall(vapiCallId, sessionInfo) {
        // Use the vapiInstance from sessionInfo if available (user-specific config),
        // otherwise use default this.vapi instance
        const vapiInstance = sessionInfo?.vapiInstance || this.vapi;
        
        if (!this.useVapi || !vapiInstance) {
            return;
        }
        
        // CRITICAL: Prevent multiple monitoring instances for the same call
        if (!this.activeVapiMonitors) {
            this.activeVapiMonitors = new Map();
        }
        
        // If already monitoring this call, don't start another instance
        if (this.activeVapiMonitors.has(vapiCallId)) {
            console.log(`⚠️ [MONITOR] Already monitoring call ${vapiCallId}, skipping duplicate monitor`);
            return;
        }
        
        // Track this monitoring instance
        this.activeVapiMonitors.set(vapiCallId, {
            startTime: Date.now(),
            errorCount: 0,
            rateLimitCount: 0
        });
        
        let pollInterval = 3000; // 3 seconds for active calls (faster updates to catch end events quickly)
        let consecutiveErrors = 0;
        let consecutiveRateLimits = 0; // Track consecutive 429 errors
        let consecutive404s = 0; // Track consecutive 404 errors
        let lastStatus = null;
        let isMonitoring = true;
        
        // Cleanup function
        const stopMonitoring = () => {
            isMonitoring = false;
            this.activeVapiMonitors.delete(vapiCallId);
            console.log(`🛑 [MONITOR] Stopped monitoring call ${vapiCallId}`);
        };
        
        const checkStatus = async () => {
            if (!isMonitoring) return;
            
            // CRITICAL: Check DB status first - if call is already terminal, stop monitoring
            // This prevents monitoring from continuing when webhook has already updated status
            try {
                const getCallModel = require('../crmDB/models/callModel');
                const Call = await getCallModel();
                const dbCall = await Call.findOne({ sessionId: vapiCallId }) || 
                              await Call.findOne({ 'metadata.vapiCallId': vapiCallId });
                
                if (dbCall) {
                    const terminalStatuses = ['completed', 'failed', 'cancelled', 'no-answer'];
                    if (terminalStatuses.includes(dbCall.status)) {
                        // DB already has terminal status (webhook updated it) - stop monitoring
                        console.log(`✅ [MONITOR] Call ${vapiCallId} already has terminal status in DB (${dbCall.status}) - stopping monitoring`);
                        stopMonitoring();
                        return;
                    }
                }
            } catch (dbCheckError) {
                // If DB check fails, continue with Vapi check
                console.warn(`⚠️ [MONITOR] Error checking DB status: ${dbCheckError.message}`);
            }
            
            try {
                const callStatus = await vapiInstance.getCallStatus(vapiCallId);
                const status = callStatus.status || callStatus.state;
                
                // Log ALL status changes - every status transition is important for logs
                if (status !== lastStatus) {
                    console.log(`📊 Vapi call status transition: ${lastStatus || 'initial'} → ${status}`);
                    console.log(`📊 Vapi call status - FULL RESPONSE:`, JSON.stringify(callStatus, null, 2));
                }
                
                // Log detailed status when call ends
                if (status === 'ended' || status === 'failed' || status === 'cancelled') {
                    // Extract endedReason - use status if endedReason not available
                    const endedReason = callStatus.endedReason || 
                                       callStatus.endReason || 
                                       callStatus.ended_reason || 
                                       callStatus.reason ||
                                       callStatus.end?.reason ||
                                       callStatus.callEnd?.reason ||
                                       status || // Use status as endedReason fallback
                                       callStatus.message ||
                                       null;
                    
                    console.log(`📊 Vapi call ${status} - Detailed monitoring info:`, JSON.stringify({
                        callId: vapiCallId,
                        status: status,
                        endedReason: endedReason,
                        error: callStatus.error,
                        message: callStatus.message,
                        duration: callStatus.duration,
                        startedAt: callStatus.startedAt,
                        endedAt: callStatus.endedAt,
                        transcript: callStatus.transcript ? (typeof callStatus.transcript === 'string' ? `${callStatus.transcript.length} chars` : 'Object') : 'Not available',
                        summary: callStatus.summary ? 'Available' : 'Not available',
                        customer: callStatus.customer ? { number: callStatus.customer.number } : null,
                        fullResponse: callStatus // Include full response for debugging
                    }, null, 2));
                }
                
                // Reset error count on success
                consecutiveErrors = 0;
                consecutiveRateLimits = 0; // Reset rate limit counter on successful call
                consecutive404s = 0; // Reset 404 counter on successful status check
                
                // Update session info
                if (this.currentSession && this.currentSession.id === vapiCallId) {
                    this.currentSession.vapiStatus = status;
                    this.currentSession.vapiCallDetails = callStatus;
                }
                
                // Update CRM immediately if status changed (don't wait)
                if (status !== lastStatus) {
                    lastStatus = status;
                    console.log(`📊 Vapi call status: ${status}`);
                    
                    // CRITICAL: If call ended, await the status update to ensure immediate CRM sync
                    // For active calls, fire-and-forget is OK, but for ended calls we need immediate update
                    if (status === 'ended' || status === 'failed' || status === 'cancelled') {
                        // AWAIT status update for ended calls to ensure immediate CRM sync
                        // This ensures endedReason is stored immediately
                        try {
                            await this.updateVapiCallStatusInCRM(vapiCallId, sessionInfo, status, callStatus);
                            console.log(`✅ CRM status updated immediately for ended call`);
                            console.log(`   EndedReason stored: ${callStatus.endedReason || 'NOT FOUND IN RESPONSE'}`);
                        } catch (err) {
                            console.error('❌ Error updating CRM status for ended call:', err.message);
                        }
                    } else {
                        // For active calls, fire-and-forget is fine (non-blocking)
                        this.updateVapiCallStatusInCRM(vapiCallId, sessionInfo, status, callStatus).catch(err => {
                            console.error('❌ Error updating CRM status:', err.message);
                        });
                    }
                    
                    // Dynamically adjust polling frequency based on Vapi's actual status
                    // Let Vapi's response determine optimal polling interval
                    if (status === 'queued') {
                        // Queued calls don't need frequent checks - Vapi is processing
                        pollInterval = 10000;
                    } else if (status === 'ringing' || status === 'in-progress' || status === 'speaking' || status === 'listening') {
                        // Active calls need frequent checks to catch end events quickly
                        pollInterval = 3000;
                    } else if (status === 'ended' || status === 'failed' || status === 'cancelled') {
                        // Call ended - no need to poll anymore
                        pollInterval = 0; // Will stop monitoring below
                    } else {
                        // Unknown status - use moderate polling, let Vapi guide us
                        pollInterval = 5000;
                    }
                }
                
                // If call ended, get detailed reason and finalize
                if (status === 'ended' || status === 'failed' || status === 'cancelled') {
                    stopMonitoring();
                    
                    // Get full call details including transcript
                    // CRITICAL: Wrap in try-catch to ensure status is updated even if finalize fails
                    try {
                        await this.finalizeVapiCall(vapiCallId, sessionInfo, callStatus);
                    } catch (finalizeError) {
                        console.error('❌ Error in finalizeVapiCall, but call has ended:', finalizeError.message);
                        
                        // Fallback: At least update the status to completed/failed
                        try {
                            const Call = await require('../crmDB/models/callModel')();
                            const call = await Call.findOne({ sessionId: vapiCallId }) || 
                                        await Call.findOne({ 'metadata.vapiCallId': vapiCallId });
                            
                            if (call && (call.status === 'in-progress' || call.status === 'ringing')) {
                                // Determine status from Vapi status and endedReason
                                // Check metadata for endedReason to properly categorize no-answer calls
                                const endedReason = callStatus?.endedReason || call.metadata?.vapiEndedReason || '';
                                const endedReasonLower = (endedReason || '').toLowerCase();
                                
                                if (status === 'failed' || status === 'cancelled') {
                                    call.status = status;
                                } else if (endedReasonLower.includes('customer-did-not-answer') || 
                                          endedReasonLower.includes('did-not-answer') ||
                                          endedReasonLower.includes('no-answer') ||
                                          endedReasonLower.includes('busy') ||
                                          endedReasonLower.includes('voicemail')) {
                                    call.status = 'no-answer';
                                } else {
                                    call.status = 'completed';
                                }
                                call.endedAt = callStatus.endedAt ? new Date(callStatus.endedAt) : new Date();
                                if (call.startedAt) {
                                    call.duration = Math.floor((call.endedAt - call.startedAt) / 1000);
                                }
                                await call.save();
                                
                                console.log(`✅ [FALLBACK] Call ${call._id} status updated to ${call.status} (finalize failed but status saved)`);
                                
                                // Emit status update
                                if (global.io) {
                                    global.io.emit('call:status:update', {
                                        callId: call._id,
                                        sessionId: call.sessionId,
                                        leadId: call.leadId,
                                        status: call.status,
                                        endedAt: call.endedAt,
                                        duration: call.duration
                                    });
                                }
                            }
                        } catch (fallbackError) {
                            console.error('❌ Error in fallback status update:', fallbackError.message);
                        }
                    }
                } else {
                    // Schedule next check with dynamic interval
                    setTimeout(checkStatus, pollInterval);
                }
            } catch (error) {
                consecutiveErrors++;
                
                // Handle 404 - Often a false positive right after call creation (Vapi needs time to register call)
                // Don't stop monitoring immediately - continue monitoring and let webhooks handle final status
                if (error.response && error.response.status === 404) {
                    consecutive404s++;
                    
                    // Only log after multiple 404s to reduce noise (false positives are common)
                    if (consecutive404s >= 5) {
                        // After 5 consecutive 404s, check DB status - if call is already terminal, stop monitoring
                        try {
                            const getCallModel = require('../crmDB/models/callModel');
                            const Call = await getCallModel();
                            let call = await Call.findOne({ sessionId: vapiCallId }) || 
                                      await Call.findOne({ 'metadata.vapiCallId': vapiCallId });
                            
                            if (call) {
                                const terminalStatuses = ['completed', 'failed', 'cancelled', 'no-answer'];
                                if (terminalStatuses.includes(call.status)) {
                                    // Call is already terminal in DB (webhook updated it) - stop monitoring
                                    console.log(`✅ [MONITOR] Call ${vapiCallId} has terminal status (${call.status}) - stopping monitoring`);
                                    stopMonitoring();
                                    return;
                                }
                            }
                            
                            // After 10 consecutive 404s, give up and rely on webhooks
                            if (consecutive404s >= 10) {
                                console.log(`ℹ️ [MONITOR] Multiple 404s for call ${vapiCallId} - relying on webhooks for status updates`);
                                stopMonitoring();
                                return;
                            }
                        } catch (dbError) {
                            // If DB check fails, continue monitoring
                        }
                    }
                    
                    // Continue monitoring - schedule next check with backoff
                    const backoffInterval = Math.min(5000 * consecutive404s, 30000); // Max 30 seconds
                    setTimeout(checkStatus, backoffInterval);
                    return;
                }
                
                // Reset 404 counter on non-404 errors
                consecutive404s = 0;
                
                // Handle rate limiting (429) - CRITICAL: Stop monitoring to prevent infinite loops
                if (error.response && error.response.status === 429) {
                    consecutiveRateLimits++;
                    const monitorInfo = this.activeVapiMonitors.get(vapiCallId);
                    if (monitorInfo) {
                        monitorInfo.rateLimitCount = consecutiveRateLimits;
                    }
                    
                    // CRITICAL: Stop monitoring after 3 consecutive rate limits to prevent infinite loops
                    if (consecutiveRateLimits >= 3) {
                        console.error(`❌ [MONITOR] Too many consecutive rate limits (${consecutiveRateLimits}) - STOPPING monitoring to prevent infinite loop`);
                        console.error(`   Call ${vapiCallId} will rely on webhooks for status updates`);
                        stopMonitoring();
                        
                        // Mark call metadata to indicate monitoring stopped due to rate limit
                        try {
                            const getCallModel = require('../crmDB/models/callModel');
                            const Call = await getCallModel();
                            let call = await Call.findOne({ sessionId: vapiCallId }) || 
                                      await Call.findOne({ 'metadata.vapiCallId': vapiCallId });
                            
                            if (call) {
                                if (!call.metadata) call.metadata = {};
                                call.metadata.monitoringStopped = true;
                                call.metadata.monitoringStoppedReason = 'Rate limit (429) - too many consecutive errors';
                                call.metadata.monitoringStoppedAt = new Date();
                                call.markModified('metadata');
                                await call.save();
                            }
                        } catch (updateError) {
                            console.error('❌ Error updating call metadata after stopping monitoring:', updateError.message);
                        }
                        
                        return; // Stop immediately - don't schedule another check
                    }
                    
                    // Use exponential backoff for rate limits, but stop after 3 consecutive
                    const rateLimitBackoff = Math.min(1000 * Math.pow(2, consecutiveRateLimits), 120000);
                    pollInterval = rateLimitBackoff;
                    console.warn(`⚠️ [MONITOR] Vapi rate limit hit (${consecutiveRateLimits}/3) - backoff: ${pollInterval / 1000}s`);
                } else {
                    // Reset rate limit counter on non-429 errors
                    consecutiveRateLimits = 0;
                    
                    // Other errors - use exponential backoff, let error severity guide timing
                    const errorBackoff = Math.min(1000 * Math.pow(1.5, consecutiveErrors), 60000);
                    pollInterval = errorBackoff;
                    console.error(`❌ [MONITOR] Error monitoring Vapi call (error ${consecutiveErrors}): ${error.message}`);
                    console.log(`   Dynamic backoff: ${pollInterval / 1000}s`);
                }
                
                // Stop monitoring after too many consecutive errors (non-rate-limit)
                if (consecutiveErrors >= 10) {
                    console.error('❌ [MONITOR] Too many consecutive errors - stopping monitoring');
                    stopMonitoring();
                    
                    // CRITICAL: Even if monitoring stops, try to finalize the call one last time
                    // This ensures the call status is updated even if monitoring fails
                    try {
                        const finalStatus = await vapiInstance.getCallStatus(vapiCallId).catch(() => null);
                        if (finalStatus && (finalStatus.status === 'ended' || finalStatus.status === 'failed' || finalStatus.status === 'cancelled')) {
                            console.log(`🔄 [MONITOR] Finalizing call after monitoring errors...`);
                            await this.finalizeVapiCall(vapiCallId, sessionInfo, finalStatus);
                        } else {
                            // If we can't get status, mark as failed
                            const getCallModel = require('../crmDB/models/callModel');
                            const Call = await getCallModel();
                            let call = await Call.findOne({ sessionId: vapiCallId }) || 
                                      await Call.findOne({ 'metadata.vapiCallId': vapiCallId });
                            
                            if (call && (call.status === 'in-progress' || call.status === 'ringing' || call.status === 'queued')) {
                                call.status = 'failed';
                                call.endedAt = new Date();
                                if (call.startedAt) {
                                    call.duration = Math.floor((call.endedAt - call.startedAt) / 1000);
                                }
                                if (!call.metadata) call.metadata = {};
                                call.metadata.vapiError = 'Monitoring failed - too many errors';
                                await call.save();
                                
                                if (global.io) {
                                    global.io.emit('call:status:update', {
                                        callId: call._id,
                                        sessionId: call.sessionId,
                                        leadId: call.leadId,
                                        status: call.status,
                                        endedAt: call.endedAt,
                                        duration: call.duration
                                    });
                                }
                            }
                        }
                    } catch (finalizeError) {
                        console.error('❌ Error finalizing call after monitoring errors:', finalizeError.message);
                    }
                    return;
                }
                
                // Schedule next check with backoff
                if (isMonitoring) {
                    setTimeout(checkStatus, pollInterval);
                }
            }
        };
        
        // Start monitoring IMMEDIATELY - fully dynamic based on Vapi's response
        // No hardcoded delays - let Vapi's actual response determine behavior
        (async () => {
            try {
                // Check status immediately - Vapi will tell us if call exists
                const initialStatus = await vapiInstance.getCallStatus(vapiCallId);
                const status = initialStatus.status || initialStatus.state;
                console.log(`📊 Initial Vapi call status: ${status}`);
                
                // Update CRM immediately with initial status
                lastStatus = status;
                await this.updateVapiCallStatusInCRM(vapiCallId, sessionInfo, status, initialStatus);
                
                // Dynamically determine polling interval based on Vapi's actual status
                // Use Vapi's response to determine optimal polling frequency
                if (status === 'queued') {
                    // For queued calls, poll less frequently (Vapi will process it)
                    pollInterval = 10000;
                } else if (status === 'ringing' || status === 'in-progress' || status === 'speaking' || status === 'listening') {
                    // For active calls, poll more frequently to catch end events
                    pollInterval = 3000;
                } else if (status === 'ended' || status === 'failed' || status === 'cancelled') {
                    // Call already ended - finalize immediately
                    stopMonitoring();
                    await this.finalizeVapiCall(vapiCallId, sessionInfo, initialStatus);
                    return;
                } else {
                    // Unknown status - use default and let Vapi guide us
                    pollInterval = 5000;
                }
                
                // Start monitoring loop with dynamic interval
                setTimeout(checkStatus, pollInterval);
            } catch (error) {
                // Handle 404 - Often a false positive right after call creation
                // Don't stop monitoring - continue monitoring so status can be updated
                if (error.response && error.response.status === 404) {
                    // Silently continue monitoring - 404s are often false positives
                    // Start monitoring loop with initial interval
                    setTimeout(checkStatus, pollInterval);
                    return;
                } else if (error.response && error.response.status === 429) {
                    // Rate limit - use exponential backoff based on error count
                    const backoffDelay = Math.min(1000 * Math.pow(2, consecutiveErrors), 60000);
                    console.warn(`⚠️ Rate limit on initial check - backing off ${backoffDelay}ms`);
                    pollInterval = backoffDelay;
                    if (isMonitoring) {
                        setTimeout(checkStatus, pollInterval);
                    }
                } else {
                    // Other errors - use exponential backoff, let Vapi guide retry timing
                    const backoffDelay = Math.min(1000 * Math.pow(2, consecutiveErrors), 30000);
                    console.error(`❌ Error getting initial Vapi call status: ${error.message}`);
                    console.log(`🔄 Will retry with dynamic backoff: ${backoffDelay}ms`);
                    pollInterval = backoffDelay;
                    if (isMonitoring) {
                        setTimeout(checkStatus, pollInterval);
                    }
                }
            }
        })(); // Execute immediately - no hardcoded delay
        
        // Store monitoring state for cleanup
        if (sessionInfo) {
            sessionInfo.vapiMonitorInterval = { stop: stopMonitoring };
        }
    }
    
    /**
     * Update Vapi call status in CRM database
     */
    async updateVapiCallStatusInCRM(vapiCallId, sessionInfo, status, callStatus) {
        try {
            const getCallModel = require('../crmDB/models/callModel');
            const Call = await getCallModel();
            
            // Find call by sessionId (vapiCallId) or by metadata.vapiCallId
            let call = await Call.findOne({ sessionId: vapiCallId });
            if (!call) {
                // Try to find by metadata.vapiCallId
                call = await Call.findOne({ 'metadata.vapiCallId': vapiCallId });
            }
            if (!call && sessionInfo && sessionInfo.crmSessionId) {
                // Try by CRM sessionId
                call = await Call.findOne({ sessionId: sessionInfo.crmSessionId });
            }
            
            if (!call) {
                return; // Call not found in CRM
            }
            
            return await this.updateCallRecord(call, status, callStatus, sessionInfo);
        } catch (error) {
            console.error('❌ Error updating Vapi call status in CRM:', error.message);
        }
    }
    
    /**
     * Update call record with Vapi status
     */
    async updateCallRecord(call, status, callStatus, sessionInfo = null) {
        try {
            let crmStatus = call.status;
            const now = new Date();
            
            // Map Vapi status to CRM status (more accurate and professional)
            if (status === 'queued') {
                crmStatus = 'ringing'; // Queued = waiting to connect
                if (!call.startedAt) {
                    call.startedAt = now;
                }
            } else if (status === 'ringing') {
                crmStatus = 'ringing';
                if (!call.startedAt) {
                    call.startedAt = now;
                }
            } else if (status === 'in-progress' || status === 'speaking' || status === 'listening' || status === 'connected') {
                crmStatus = 'in-progress';
                if (!call.startedAt) {
                    call.startedAt = now;
                }
            } else if (status === 'ended') {
                // Extract endedReason from multiple possible sources FIRST
                const rawEndedReason = callStatus.endedReason || 
                                      callStatus.endReason || 
                                      callStatus.ended_reason || 
                                      callStatus.reason ||
                                      callStatus.end?.reason ||
                                      callStatus.callEnd?.reason ||
                                      null;
                
                // Get detailed endedReason from Vapi to determine correct status (lowercase for comparison)
                const endedReasonLower = (rawEndedReason || '').toLowerCase();
                const error = (callStatus.error || '').toLowerCase();
                
                // Log detailed Vapi information for debugging
                console.log(`📊 Vapi call ended - Detailed info:`, JSON.stringify({
                    status: status,
                    endedReason: rawEndedReason || 'NOT FOUND',
                    rawEndedReason: rawEndedReason,
                    error: callStatus.error,
                    duration: callStatus.duration,
                    transcript: callStatus.transcript ? 'Available' : 'Not available',
                    _debug_all_fields: {
                        endedReason: callStatus.endedReason,
                        endReason: callStatus.endReason,
                        ended_reason: callStatus.ended_reason,
                        reason: callStatus.reason,
                        'end.reason': callStatus.end?.reason,
                        'callEnd.reason': callStatus.callEnd?.reason
                    }
                }, null, 2));
                
                // CRITICAL: Check if call was cancelled by user first
                // If CRM status is already 'cancelled', keep it as cancelled
                const wasUserCancelled = call.status === 'cancelled' || (sessionInfo && sessionInfo.cancelledByUser);
                if (wasUserCancelled) {
                    crmStatus = 'cancelled';
                    console.log(`✅ Keeping status as 'cancelled' (user cancelled the call)`);
                }
                // Check for busy/no-answer (should be no-answer status, not cancelled)
                else if (endedReasonLower.includes('busy') || endedReasonLower.includes('customer-busy') || 
                         endedReasonLower.includes('no-answer') || endedReasonLower.includes('no answer') ||
                         endedReasonLower.includes('voicemail')) {
                    crmStatus = 'no-answer';
                    console.log(`✅ Status set to 'no-answer' based on endedReason: ${rawEndedReason}`);
                }
                // Check endedReason for cancellation indicators
                else if (endedReasonLower.includes('cancelled') || endedReasonLower.includes('cancel') || 
                         endedReasonLower.includes('user-cancelled') || endedReasonLower.includes('declined') ||
                         endedReasonLower.includes('rejected')) {
                    crmStatus = 'cancelled';
                    console.log(`✅ Status set to 'cancelled' based on endedReason: ${rawEndedReason}`);
                }
                // Check for SIP 403 Forbidden (authentication/authorization issue)
                else if (endedReasonLower.includes('403') || endedReasonLower.includes('forbidden') || 
                         endedReasonLower.includes('sip-403')) {
                    crmStatus = 'failed';
                    console.log(`❌ SIP 403 Forbidden Error - Authentication/Authorization Issue`);
                    console.log(`   EndedReason: ${rawEndedReason}`);
                    console.log(`   This usually means:`);
                    console.log(`   1. SIP credentials (username/password) are incorrect`);
                    console.log(`   2. Vapi IPs are not whitelisted for OUTBOUND calls`);
                    console.log(`   3. SIP trunk is not properly configured in VoIP247`);
                    console.log(`   4. Outbound calling is disabled for this trunk`);
                    console.log(`   → Contact VoIP247 support to verify:`);
                    console.log(`      - SIP credentials are correct`);
                    console.log(`      - Outbound calling is enabled`);
                    console.log(`      - Vapi IPs are whitelisted for outbound: 44.229.228.186/32, 44.238.177.138/32`);
                }
                // Check for errors/failures
                else if (endedReasonLower.includes('error') || endedReasonLower.includes('failed') || 
                         endedReasonLower.includes('transport') || endedReasonLower.includes('timeout') ||
                         error.includes('error') || error.includes('failed')) {
                    crmStatus = 'failed';
                    console.log(`⚠️ Status set to 'failed' based on endedReason: ${rawEndedReason}`);
                }
                // Check for successful completion
                else if (endedReasonLower.includes('customer-ended') || endedReasonLower.includes('assistant-ended') || 
                         endedReasonLower === 'call-finished' || endedReasonLower.includes('finished') ||
                         endedReasonLower.includes('completed') || endedReasonLower === '') {
                    crmStatus = 'completed';
                    console.log(`✅ Status set to 'completed' based on endedReason: ${rawEndedReason || 'none (default)'}`);
                }
                // Default: if we can't determine, check if call had meaningful conversation
                else {
                    // If call was very short (< 10 seconds) and no clear reason, likely cancelled/failed
                    const callDuration = callStatus.duration || 0;
                    if (callDuration < 10) {
                        crmStatus = 'cancelled';
                        console.log(`⚠️ Status set to 'cancelled' (short duration: ${callDuration}s, endedReason: ${rawEndedReason || 'N/A'})`);
                    } else {
                        crmStatus = 'completed';
                        console.log(`✅ Status set to 'completed' (default for ended calls with duration: ${callDuration}s)`);
                    }
                }
                
                call.endedAt = callStatus.endedAt ? new Date(callStatus.endedAt) : now;
                if (call.startedAt) {
                    call.duration = Math.floor((call.endedAt - call.startedAt) / 1000);
                }
                
                // Store detailed Vapi information in metadata
                if (!call.metadata) {
                    call.metadata = {};
                }
                
                // Use the extracted rawEndedReason (already extracted above)
                // Use status as endedReason when endedReason is not available
                // Status often contains the reason (e.g., "failed", "cancelled", "ended")
                const finalEndedReason = rawEndedReason || 
                                        (status && (status === 'ended' || status === 'failed' || status === 'cancelled') ? status : null) ||
                                        callStatus.message ||
                                        null;
                
                call.metadata.vapiEndedReason = finalEndedReason;
                call.metadata.vapiError = callStatus.error;
                call.metadata.vapiDuration = callStatus.duration;
                call.metadata.vapiStatus = status;
                call.metadata.vapiMessage = callStatus.message; // Store message as it may contain reason info
                
                // Log what we stored
                if (finalEndedReason) {
                    console.log(`✅ Stored endedReason: ${finalEndedReason}${rawEndedReason ? '' : ' (from status field)'}`);
                } else {
                    console.warn(`⚠️ endedReason not found in Vapi response for call ${vapiCallId}`);
                    console.warn(`   Status: ${status}`);
                    console.warn(`   Available fields:`, Object.keys(callStatus).join(', '));
                }
                
                // Map to CRM status enum values
                // CRM status enum: 'scheduled', 'initiating', 'ringing', 'in-progress', 'completed', 'failed', 'no-answer', 'cancelled'
                // Use finalEndedReason (which includes status fallback) for mapping
                const endedReasonForMapping = (finalEndedReason || '').toLowerCase();
                if (crmStatus === 'cancelled') {
                    // Already set above
                } else if (endedReasonForMapping.includes('voicemail') || endedReasonForMapping.includes('no-answer') || endedReasonForMapping.includes('no answer')) {
                    crmStatus = 'no-answer';
                    console.log(`✅ Status mapped to 'no-answer' based on endedReason: ${finalEndedReason}`);
                } else if (crmStatus === 'failed') {
                    // Already set above
                } else if (crmStatus === 'completed') {
                    // Already set above
                }
                
                console.log(`✅ Final CRM status: ${crmStatus} (endedReason: ${finalEndedReason || 'N/A'})`);
            } else if (status === 'failed') {
                crmStatus = 'failed';
                call.endedAt = callStatus.endedAt ? new Date(callStatus.endedAt) : now;
                if (call.startedAt) {
                    call.duration = Math.floor((call.endedAt - call.startedAt) / 1000);
                }
                
                // Store error details
                if (!call.metadata) {
                    call.metadata = {};
                }
                call.metadata.vapiEndedReason = callStatus.endedReason || callStatus.error || 'Call failed';
                call.metadata.vapiError = callStatus.error;
                call.metadata.vapiStatus = status;
                console.log(`✅ Status set to: failed (endedReason: ${callStatus.endedReason || 'N/A'})`);
            } else if (status === 'cancelled') {
                crmStatus = 'cancelled';
                call.endedAt = callStatus.endedAt ? new Date(callStatus.endedAt) : now;
                if (call.startedAt) {
                    call.duration = Math.floor((call.endedAt - call.startedAt) / 1000);
                }
                
                // Store cancellation details
                if (!call.metadata) {
                    call.metadata = {};
                }
                call.metadata.vapiEndedReason = callStatus.endedReason || 'Call cancelled';
                call.metadata.vapiStatus = status;
                console.log(`✅ Status set to: cancelled (endedReason: ${callStatus.endedReason || 'N/A'})`);
            }
            
            // CRITICAL: Always save the call to persist endedReason and metadata
            // Mongoose doesn't always detect nested object changes, so explicitly mark as modified
            if (call.metadata) {
                call.markModified('metadata');
            }
            
            // Always save if there are any changes (status, metadata, timestamps, duration)
            const hasChanges = call.isModified() || call.status !== crmStatus;
            
            if (hasChanges) {
                call.status = crmStatus;
                await call.save();
                
                console.log(`✅ CRM call status updated:`, JSON.stringify({
                    callId: call._id,
                    status: call.status,
                    endedReason: call.metadata?.vapiEndedReason || 'NOT STORED',
                    duration: call.duration,
                    error: call.metadata?.vapiError,
                    metadataKeys: call.metadata ? Object.keys(call.metadata) : [],
                    metadataVapiEndedReason: call.metadata?.vapiEndedReason,
                    metadataEndedReason: call.metadata?.endedReason,
                    _debug_metadata: call.metadata
                }, null, 2));
                
                // Emit socket event
                if (global.io) {
                    global.io.emit('call:status:update', {
                        callId: call._id,
                        sessionId: call.sessionId,
                        leadId: call.leadId,
                        status: crmStatus,
                        endedAt: call.endedAt,
                        duration: call.duration,
                        endedReason: call.metadata?.vapiEndedReason
                    });
                }
            }
        } catch (error) {
            console.error('❌ Error updating call record:', error.message);
        }
    }
    
    /**
     * Finalize Vapi call - get transcript and update CRM
     * NOTE: This is now SECONDARY to webhooks. Webhooks are the source of truth.
     * This function is only called if webhook hasn't finalized the call yet.
     */
    async finalizeVapiCall(vapiCallId, sessionInfo, callStatus) {
        try {
            const Call = await require('../crmDB/models/callModel')();
            const call = await Call.findOne({ sessionId: vapiCallId }) || 
                        await Call.findOne({ 'metadata.vapiCallId': vapiCallId });
            
            if (!call) {
                console.warn(`⚠️ Call not found in CRM for Vapi call: ${vapiCallId}`);
                return;
            }
            
            // CRITICAL: Check if webhook already finalized this call
            // If webhook finalized it, don't override - webhook is source of truth
            if (call.metadata?.finalizedBy === 'webhook' && call.metadata?.finalizedAt) {
                console.log(`✅ [FINALIZE] Call already finalized by webhook - skipping (webhook is source of truth)`);
                console.log(`   Finalized at: ${call.metadata.finalizedAt}`);
                console.log(`   EndedReason: ${call.metadata.vapiEndedReason || 'N/A'}`);
                return;
            }
            
            // Get full call details including transcript and endedReason
            // Use vapiInstance from sessionInfo if available, otherwise retrieve from database
            let vapiInstanceForFinalize = sessionInfo?.vapiInstance;
            
            // Fallback: If sessionInfo doesn't have vapiInstance, retrieve user's config from database
            if (!vapiInstanceForFinalize && call.initiatedBy) {
                try {
                    const User = require('../models/userModel');
                    const user = await User.findById(call.initiatedBy).select('vapiConfig role email');
                    if (user && user.vapiConfig && user.vapiConfig.enabled && user.vapiConfig.apiKey) {
                        const VapiIntegration = require('./vapiIntegration');
                        vapiInstanceForFinalize = new VapiIntegration({
                            apiKey: user.vapiConfig.apiKey,
                            assistantId: user.vapiConfig.assistantId || null,
                            phoneNumberId: user.vapiConfig.phoneNumberId || null,
                            enabled: true
                        });
                        console.log(`🔧 [FINALIZE] Using ${user.role} Vapi config from database for user: ${user.email}`);
                    }
                } catch (userError) {
                    console.warn('⚠️ [FINALIZE] Failed to load user Vapi config from database:', userError.message);
                }
            }
            
            // Final fallback to default instance
            if (!vapiInstanceForFinalize) {
                vapiInstanceForFinalize = this.vapi;
            }
            
            const callDetails = await vapiInstanceForFinalize.getCallDetails(vapiCallId);
            
            // Log the full callDetails to see what we got from Vapi
            console.log(`📊 [FINALIZE] Full callDetails from Vapi (fallback - webhook not received yet):`, JSON.stringify(callDetails, null, 2));
            
            // Update call with final details
            // CRITICAL: Preserve cancelled status if user cancelled, otherwise determine from Vapi data
            const wasCancelled = call.status === 'cancelled' || (sessionInfo && sessionInfo.cancelledByUser);
            
            if (!wasCancelled) {
                // Extract endedReason - use the one from getCallDetails (already extracted)
                const endedReason = (callDetails.endedReason || '').toLowerCase();
                console.log(`📊 [FINALIZE] Using endedReason: ${callDetails.endedReason || 'NOT FOUND'}`);
                const error = (callDetails.error || '').toLowerCase();
                
                console.log(`📊 Finalizing call - Vapi details:`, JSON.stringify({
                    status: callDetails.status,
                    endedReason: callDetails.endedReason,
                    error: callDetails.error,
                    duration: callDetails.duration,
                    transcriptLength: callDetails.transcript ? callDetails.transcript.length : 0
                }, null, 2));
                
                // Check endedReason to determine final status
                // Busy/no-answer should be 'no-answer' status, not 'cancelled'
                if (endedReason.includes('busy') || endedReason.includes('customer-busy') ||
                    endedReason.includes('no-answer') || endedReason.includes('no answer') ||
                    endedReason.includes('voicemail')) {
                    call.status = 'no-answer';
                    console.log(`✅ Final status: 'no-answer' (endedReason: ${callDetails.endedReason})`);
                }
                // Cancellation indicators
                else if (endedReason.includes('cancelled') || endedReason.includes('cancel') || 
                    endedReason.includes('user-cancelled') || endedReason.includes('declined') ||
                    endedReason.includes('rejected')) {
                    call.status = 'cancelled';
                    console.log(`✅ Final status: 'cancelled' (endedReason: ${callDetails.endedReason})`);
                } else if (endedReason.includes('403') || endedReason.includes('forbidden') || 
                          endedReason.includes('sip-403')) {
                    call.status = 'failed';
                    call.error = 'SIP 403 Forbidden - Authentication/Authorization Issue';
                    console.log(`❌ SIP 403 Forbidden Error - Authentication/Authorization Issue`);
                    console.log(`   EndedReason: ${callDetails.endedReason}`);
                    console.log(`   → Contact your SIP provider to verify SIP credentials and outbound calling permissions`);
                } else if (endedReason.includes('503') || endedReason.includes('service-unavailable') || 
                          endedReason.includes('sip-503') || error.includes('503') || 
                          error.includes('service-unavailable') || error.includes('sip-503')) {
                    call.status = 'failed';
                    call.error = 'SIP 503 Service Unavailable - SIP trunk or phone number not reachable';
                    console.log(`❌ SIP 503 Service Unavailable Error`);
                    console.log(`   EndedReason: ${callDetails.endedReason || 'N/A'}`);
                    console.log(`   Error: ${callDetails.error || 'N/A'}`);
                    console.log(`   📋 Troubleshooting Steps:`);
                    console.log(`   1. Verify phone number ID is correctly configured in your profile`);
                    console.log(`   2. Check if phone number ID is linked to a valid SIP trunk credential`);
                    console.log(`   3. Verify SIP trunk gateway is reachable and online`);
                    console.log(`   4. Check SIP trunk credentials (username/password) are correct`);
                    console.log(`   5. Ensure SIP trunk is registered and active in your PBX`);
                    console.log(`   6. Verify network connectivity between Vapi and your SIP provider`);
                } else if (endedReason.includes('error') || endedReason.includes('failed') || 
                          endedReason.includes('transport') || endedReason.includes('timeout') ||
                          error.includes('error') || error.includes('failed')) {
                    call.status = 'failed';
                    call.error = callDetails.error || callDetails.endedReason || 'Call failed';
                    console.log(`⚠️ Final status: 'failed' (endedReason: ${callDetails.endedReason})`);
                } else {
                    call.status = 'completed';
                    console.log(`✅ Final status: 'completed' (endedReason: ${callDetails.endedReason || 'none'})`);
                }
            } else {
                // User cancelled - keep as cancelled
                call.status = 'cancelled';
                console.log(`✅ Final status: 'cancelled' (user cancelled)`);
            }
            
            call.endedAt = callDetails.endedAt || new Date();
            if (call.startedAt) {
                call.duration = Math.floor((call.endedAt - call.startedAt) / 1000);
            }
            
            // Save transcript (even if cancelled)
            if (callDetails.transcript) {
                call.transcript = callDetails.transcript;
                console.log(`✅ Transcript retrieved: ${callDetails.transcript.length} characters`);
            }
            
            // Save summary if available, or generate from transcript
            if (callDetails.summary) {
                call.summary = callDetails.summary;
                console.log(`✅ Summary retrieved from Vapi`);
            } else if (callDetails.transcript) {
                // Generate summary from transcript if Vapi didn't provide one
                console.log(`📝 Generating summary from Vapi transcript...`);
                try {
                    const summaryPrompt = `You are analyzing a phone call conversation. Generate a concise, professional summary of this call.

Conversation Transcript:
${callDetails.transcript}

Please provide a summary that includes:
1. Purpose/Reason for the call
2. Key topics discussed
3. Any decisions made or actions agreed upon
4. Next steps (if any)
5. Overall outcome

Format the summary in clear, professional language. Keep it concise but comprehensive.`;
                    
                    const summary = await this.voiceInteraction.generateSummary(summaryPrompt);
                    if (summary) {
                        call.summary = summary;
                        console.log(`✅ Summary generated from transcript`);
                    }
                } catch (summaryError) {
                    console.warn(`⚠️ Failed to generate summary: ${summaryError.message}`);
                }
            }
            
            // Store Vapi metadata - CRITICAL: Store endedReason properly
            if (!call.metadata) {
                call.metadata = {};
            }
            
            // Extract endedReason from callDetails (already extracted in getCallDetails)
            // This should contain values like "Customer Busy", "Customer Did Not Answer", etc.
            const endedReasonToStore = callDetails.endedReason || 
                                      callDetails.endReason || 
                                      callDetails.ended_reason || 
                                      callDetails.reason ||
                                      callDetails.end?.reason ||
                                      callDetails.callEnd?.reason ||
                                      (callDetails.status && (callDetails.status === 'ended' || callDetails.status === 'failed' || callDetails.status === 'cancelled') ? callDetails.status : null) ||
                                      callDetails.message ||
                                      null;
            
            call.metadata.vapiCallId = vapiCallId;
            call.metadata.vapiStatus = callDetails.status || callDetails.state;
            call.metadata.vapiEndedReason = endedReasonToStore; // Store in vapiEndedReason (what frontend uses)
            call.metadata.endedReason = endedReasonToStore; // Also store in legacy field
            call.metadata.vapiError = callDetails.error;
            call.metadata.vapiMessage = callDetails.message;
            call.metadata.vapiDuration = callDetails.duration;
            
            // CRITICAL: Extract and store structured outputs from Vapi API response
            // Check multiple locations: artifact.structuredOutputs (webhook format), structuredOutputs (direct API format)
            const structuredOutputs = callDetails.fullResponse?.structuredOutputs ||
                                      callDetails.fullResponse?.artifact?.structuredOutputs ||
                                      callDetails.structuredOutputs ||
                                      null;
            
            // #region agent log
            if (typeof fetch === 'function') {
                fetch('http://127.0.0.1:7243/ingest/0b7ae174-df61-4914-8ec0-ed47b5d9d381',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'webrtcVoiceAgent.js:3636',message:'Finalize - structured outputs extraction',data:{hasStructuredOutputs:!!structuredOutputs,structuredOutputsKeys:structuredOutputs?Object.keys(structuredOutputs):[],callId:call._id?.toString(),vapiCallId,hasFullResponse:!!callDetails.fullResponse,hasArtifact:!!callDetails.fullResponse?.artifact},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
            }
            // #endregion
            
            if (structuredOutputs) {
                call.metadata.structuredOutputs = structuredOutputs;
                console.log(`✅ [FINALIZE] Stored structured outputs:`, Object.keys(structuredOutputs));
                
                // Extract appointment/callback flag from structured outputs
                let appointmentBooked = false;
                for (const [key, output] of Object.entries(structuredOutputs)) {
                    if (output && typeof output === 'object') {
                        const outputName = (output.name || key || '').toLowerCase();
                        if ((outputName.includes('appointment') || outputName.includes('callback') || outputName.includes('call back')) && 
                            output.result === true) {
                            appointmentBooked = true;
                            console.log(`✅ [FINALIZE] Found appointment booked: ${output.name} = ${output.result}`);
                            break;
                        }
                    }
                }
                // Store as callBack flag for easy filtering
                call.metadata.callBack = appointmentBooked;
                call.callBack = appointmentBooked; // Also store on root for fast access
                console.log(`✅ [FINALIZE] Set callBack flag: ${appointmentBooked}`);
                
                // #region agent log
                if (typeof fetch === 'function') {
                    fetch('http://127.0.0.1:7243/ingest/0b7ae174-df61-4914-8ec0-ed47b5d9d381',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'webrtcVoiceAgent.js:3658',message:'Finalize - callBack flag set',data:{appointmentBooked,callId:call._id?.toString(),callBackOnCall:call.callBack,callBackOnMetadata:call.metadata.callBack},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
                }
                // #endregion
            } else {
                // If no structured outputs found, set callBack to false explicitly
                call.metadata.callBack = false;
                call.callBack = false;
                
                // #region agent log
                if (typeof fetch === 'function') {
                    fetch('http://127.0.0.1:7243/ingest/0b7ae174-df61-4914-8ec0-ed47b5d9d381',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'webrtcVoiceAgent.js:3667',message:'Finalize - No structured outputs, setting callBack to false',data:{callId:call._id?.toString()},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
                }
                // #endregion
            }
            
            console.log(`✅ [FINALIZE] Stored endedReason: ${endedReasonToStore || 'NOT FOUND'}`);
            console.log(`✅ [FINALIZE] callDetails.endedReason: ${callDetails.endedReason || 'NOT FOUND'}`);
            console.log(`✅ [FINALIZE] callDetails.fullResponse:`, JSON.stringify(callDetails.fullResponse || callDetails, null, 2));
            
            // Map to CRM status enum if needed (no-answer, etc.)
            const endedReason = (endedReasonToStore || '').toLowerCase();
            
            // CRITICAL: If call has appointment booked, treat "customer-ended-call" as "completed"
            // This override must happen AFTER structured outputs are extracted
            if (call.callBack === true && endedReason.includes('customer-ended-call')) {
                if (call.status === 'cancelled') {
                    call.status = 'completed'; // Override cancelled to completed if appointment was booked
                    console.log(`✅ [FINALIZE] Overriding status from 'cancelled' to 'completed' - appointment was booked`);
                }
            }
            
            if (call.status !== 'cancelled' && call.status !== 'failed') {
                // Only update if not already cancelled/failed
                if (endedReason.includes('busy') || endedReason.includes('customer-busy') ||
                    endedReason.includes('voicemail') || endedReason.includes('no-answer') || 
                    endedReason.includes('no answer')) {
                    call.status = 'no-answer';
                    console.log(`✅ Status updated to 'no-answer' based on endedReason: ${callDetails.endedReason}`);
                }
            }
            
            console.log(`✅ Final call status: ${call.status} (endedReason: ${callDetails.endedReason})`);
            
            await call.save();
            
            // Emit final status update with correct status
            if (global.io) {
                global.io.emit('call:status:update', {
                    callId: call._id,
                    sessionId: call.sessionId,
                    leadId: call.leadId,
                    status: call.status, // Use actual status (cancelled/completed/failed/no-answer)
                    endedAt: call.endedAt,
                    duration: call.duration,
                    transcript: call.transcript ? 'Available' : null,
                    summary: call.summary ? 'Available' : null,
                    endedReason: call.metadata?.vapiEndedReason || null,
                    error: call.metadata?.vapiError || null
                });
            }
            
            console.log(`✅ Vapi call finalized in CRM: ${call._id}`);
            console.log(`   Status: ${call.status}`);
            console.log(`   Duration: ${call.duration}s`);
            console.log(`   EndedReason: ${call.metadata?.vapiEndedReason || 'N/A'}`);
            console.log(`   Transcript: ${call.transcript ? 'Saved' : 'Not available'}`);
            console.log(`   Summary: ${call.summary ? 'Saved' : 'Not available'}`);
            
            // CRITICAL: Clear currentSession to allow new calls
            if (this.currentSession && (this.currentSession.id === vapiCallId || this.currentSession.vapiCallId === vapiCallId)) {
                console.log(`🧹 Cleaning up Vapi session: ${vapiCallId}`);
                
                // Stop monitoring if still running
                if (this.currentSession.vapiMonitorInterval) {
                    if (typeof this.currentSession.vapiMonitorInterval.stop === 'function') {
                        this.currentSession.vapiMonitorInterval.stop();
                    } else {
                        clearInterval(this.currentSession.vapiMonitorInterval);
                    }
                }
                
                // Clear session
                this.currentSession = null;
                this.sessionsByCallId.delete(vapiCallId);
                
                // Also clear by CRM sessionId if available
                if (sessionInfo && sessionInfo.crmSessionId) {
                    this.sessionsByCallId.delete(sessionInfo.crmSessionId);
                }
                
                console.log(`✅ Vapi session cleaned up - ready for next call`);
            }
            
        } catch (error) {
            console.error('❌ Error finalizing Vapi call:', error.message);
            
            // Still try to clean up session even on error
            if (this.currentSession && (this.currentSession.id === vapiCallId || this.currentSession.vapiCallId === vapiCallId)) {
                console.log(`🧹 Cleaning up Vapi session after error: ${vapiCallId}`);
                this.currentSession = null;
                this.sessionsByCallId.delete(vapiCallId);
                if (sessionInfo && sessionInfo.crmSessionId) {
                    this.sessionsByCallId.delete(sessionInfo.crmSessionId);
                }
            }
        }
    }
    
    /**
     * End call by session ID (for Vapi calls)
     */
    async endCallBySessionId(sessionId) {
        // Check if this is a Vapi call
        const session = this.sessionsByCallId.get(sessionId) || this.currentSession;
        if (session && session.vapiCallId) {
            return await this.endVapiCall(session.vapiCallId, sessionId);
        }
        
        // Fall back to regular SIP end call
        return this.endCall();
    }
    
    /**
     * End Vapi call
     */
    async endVapiCall(vapiCallId, sessionId) {
        try {
            if (!this.useVapi || !this.vapi) {
                return false;
            }
            
            console.log(`📞 Ending Vapi call: ${vapiCallId}`);
            
            // End call via Vapi API (non-blocking - don't wait for response)
            // The endCall method now includes verification internally
            this.vapi.endCall(vapiCallId).then((result) => {
                console.log(`✅ Vapi call termination request sent: ${vapiCallId}`);
            }).catch(apiError => {
                // If API call fails, log but don't block
                console.warn(`⚠️ Vapi API end call failed (non-blocking): ${apiError.message}`);
            });
            
            // Don't await - proceed immediately with CRM update and cleanup
            
            // Update CRM immediately (even if API call failed)
            const Call = await require('../crmDB/models/callModel')();
            let call = await Call.findOne({ sessionId: sessionId });
            if (!call) {
                call = await Call.findOne({ 'metadata.vapiCallId': vapiCallId });
            }
            if (!call && sessionId !== vapiCallId) {
                // Try finding by vapiCallId as sessionId
                call = await Call.findOne({ sessionId: vapiCallId });
            }
            
            // Always update status to cancelled when end is requested (even if already cancelled - ensures cleanup)
            if (call) {
                const wasAlreadyCancelled = call.status === 'cancelled';
                call.status = 'cancelled';
                call.endedAt = new Date();
                if (call.startedAt) {
                    call.duration = Math.floor((call.endedAt - call.startedAt) / 1000);
                }
                
                // Get transcript and summary from Vapi before saving
                try {
                    console.log(`📝 Fetching transcript and summary from Vapi...`);
                    // Get vapiInstance from session if available, otherwise retrieve from database
                    const session = this.sessionsByCallId.get(vapiCallId) || this.sessionsByCallId.get(sessionId);
                    let vapiInstanceForEnd = session?.vapiInstance;
                    
                    // Fallback: If session doesn't have vapiInstance, retrieve user's config from database
                    if (!vapiInstanceForEnd && call.initiatedBy) {
                        try {
                            const User = require('../models/userModel');
                            const user = await User.findById(call.initiatedBy).select('vapiConfig role email');
                            if (user && user.vapiConfig && user.vapiConfig.enabled && user.vapiConfig.apiKey) {
                                const VapiIntegration = require('./vapiIntegration');
                                vapiInstanceForEnd = new VapiIntegration({
                                    apiKey: user.vapiConfig.apiKey,
                                    assistantId: user.vapiConfig.assistantId || null,
                                    phoneNumberId: user.vapiConfig.phoneNumberId || null,
                                    enabled: true
                                });
                                console.log(`🔧 [END CALL] Using ${user.role} Vapi config from database for user: ${user.email}`);
                            }
                        } catch (userError) {
                            console.warn('⚠️ [END CALL] Failed to load user Vapi config from database:', userError.message);
                        }
                    }
                    
                    // Final fallback to default instance
                    if (!vapiInstanceForEnd) {
                        vapiInstanceForEnd = this.vapi;
                    }
                    
                    const callDetails = await vapiInstanceForEnd.getCallDetails(vapiCallId);
                    
                    if (callDetails.transcript) {
                        call.transcript = callDetails.transcript;
                        console.log(`✅ Transcript retrieved: ${callDetails.transcript.length} characters`);
                    }
                    
                    if (callDetails.summary) {
                        call.summary = callDetails.summary;
                        console.log(`✅ Summary retrieved from Vapi`);
                    } else if (callDetails.transcript) {
                        // Generate summary from transcript if Vapi didn't provide one
                        console.log(`📝 Generating summary from Vapi transcript...`);
                        try {
                            // Generate summary directly from transcript using LLM
                            const summaryPrompt = `You are analyzing a phone call conversation. Generate a concise, professional summary of this call.

Conversation Transcript:
${callDetails.transcript}

Please provide a summary that includes:
1. Purpose/Reason for the call
2. Key topics discussed
3. Any decisions made or actions agreed upon
4. Next steps (if any)
5. Overall outcome

Format the summary in clear, professional language. Keep it concise but comprehensive.`;
                            
                            const summary = await this.voiceInteraction.generateSummary(summaryPrompt);
                            if (summary) {
                                call.summary = summary;
                                console.log(`✅ Summary generated from transcript`);
                            }
                        } catch (summaryError) {
                            console.warn(`⚠️ Failed to generate summary: ${summaryError.message}`);
                        }
                    }
                    
                    // Update metadata
                    if (!call.metadata) {
                        call.metadata = {};
                    }
                    call.metadata.vapiCallId = vapiCallId;
                    call.metadata.vapiStatus = callDetails.status;
                    call.metadata.endedReason = callDetails.endedReason || 'user-cancelled';
                } catch (detailsError) {
                    console.warn(`⚠️ Failed to get call details from Vapi: ${detailsError.message}`);
                    // Continue anyway - at least we have the status update
                }
                
                await call.save();
                
                if (wasAlreadyCancelled) {
                    console.log(`ℹ️ Call was already cancelled, but updated timestamp and ensured cleanup`);
                } else {
                    console.log(`✅ CRM call status updated to cancelled: ${call._id}`);
                    if (call.transcript) {
                        console.log(`   Transcript: ${call.transcript.length} characters`);
                    }
                    if (call.summary) {
                        console.log(`   Summary: Available`);
                    }
                }
                
                // Always emit socket event for immediate UI update (even if already cancelled)
                if (global.io) {
                    global.io.emit('call:status:update', {
                        callId: call._id,
                        sessionId: call.sessionId || sessionId,
                        leadId: call.leadId,
                        status: 'cancelled',
                        endedAt: call.endedAt,
                        duration: call.duration,
                        transcript: call.transcript ? 'Available' : null,
                        summary: call.summary ? 'Available' : null
                    });
                }
            } else {
                console.warn(`⚠️ Call not found in CRM for sessionId: ${sessionId} or vapiCallId: ${vapiCallId}`);
            }
            
            // IMPORTANT: Keep monitoring active even after cancel
            // Vapi API doesn't reliably support ending active calls, so the call may continue
            // Monitoring will detect when call actually ends and get transcript/summary
            
            // Clean up session for new calls, but DON'T stop monitoring
            const sessionToClean = this.currentSession;
            if (sessionToClean && (sessionToClean.id === vapiCallId || sessionToClean.id === sessionId || sessionToClean.vapiCallId === vapiCallId)) {
                console.log(`🧹 Cleaning up Vapi session (monitoring continues until call ends)...`);
                
                // DON'T stop monitoring - let it continue to detect when call actually ends
                // The monitoring will call finalizeVapiCall when status becomes 'ended'
                // This ensures we get transcript/summary even if call continues
                
                // Mark session as cancelled so monitoring knows to keep status as cancelled
                sessionToClean.cancelledByUser = true;
                
                // Clear current session (allows new calls to start)
                this.currentSession = null;
                console.log(`✅ Current session cleared (monitoring continues in background)`);
            }
            
            // Remove from sessionsByCallId map (but monitoring will handle finalization)
            this.sessionsByCallId.delete(vapiCallId);
            this.sessionsByCallId.delete(sessionId);
            if (sessionToClean && sessionToClean.crmSessionId) {
                this.sessionsByCallId.delete(sessionToClean.crmSessionId);
            }
            
            console.log(`✅ Vapi call marked as cancelled in CRM - monitoring continues until call ends`);
            console.log(`ℹ️ NOTE: Vapi REST API does not support ending active calls programmatically`);
            console.log(`ℹ️ Call will continue until customer hangs up (this is a Vapi API limitation)`);
            console.log(`ℹ️ Transcript/summary will be fetched automatically when call ends`);
            console.log(`ℹ️ To end calls programmatically, you would need to use Vapi WebSocket SDK (not REST API)`);
            return true;
        } catch (error) {
            console.error('❌ Error ending Vapi call:', error.message);
            
            // Still try to clean up session even on error
            try {
                if (this.currentSession && (this.currentSession.vapiCallId === vapiCallId || this.currentSession.id === sessionId)) {
                    this.currentSession = null;
                    this.sessionsByCallId.delete(vapiCallId);
                    this.sessionsByCallId.delete(sessionId);
                    console.log(`🧹 Emergency cleanup completed`);
                }
            } catch (cleanupError) {
                console.error('❌ Error during emergency cleanup:', cleanupError.message);
            }
            
            return false;
        }
    }

    endCall() {
        this.isConversationActive = false;

        if (!this.currentSession) {
            console.log('⚠️ No active call to end');
            return;
        }

        // Handle Vapi calls
        if (this.currentSession.vapiCallId && this.useVapi && this.vapi) {
            const vapiCallId = this.currentSession.vapiCallId;
            const sessionId = this.currentSession.id;
            
            // Use the dedicated Vapi end call method
            this.endVapiCall(vapiCallId, sessionId).catch(err => {
                console.error('❌ Error ending Vapi call:', err.message);
            });
            return;
        }

        const endingSessionId = this.currentSession.id;
        const endingToTag = this.currentSession.toTag;
        const endingPhoneNumber = this.currentSession.phoneNumber;
        const endingFromTag = this.currentSession.fromTag;
        const endingSipPort = this.currentSession.sipPort;
        const endingBranch = this.currentSession.branch;
        const endingPublicIP = this.currentSession.publicIP || '103.134.3.216';
        const endingUdpClient = this.currentSession.udpClient;
        const endingRtpReceivePort = this.currentSession.rtpReceivePort;
        
        this.stopSIPKeepalive(endingSessionId);
        this.appendSipLog(endingSessionId, 'Call ending requested');

        console.log(`\n${'='.repeat(60)}`);
        console.log(`📞 ENDING CALL: ${endingSessionId}`);
        console.log(`${'='.repeat(60)}`);

        try {
            // Send BYE message (must follow same routing as ACK)
            if (endingUdpClient && endingToTag) {
                // Get Contact URI and Route headers from session (stored during 200 OK)
                const contactUri = this.currentSession?.contactUri || null;
                const routeHeaders = this.currentSession?.routeHeaders || [];
                const lastCSeq = this.currentSession?.lastCSeq || 1;
                const byeCSeq = lastCSeq + 1; // Increment CSeq for BYE

                // Create BYE message with proper routing
                // Use SIP config from session (user-specific or default)
                const sessionSipConfig = this.currentSession?.sipConfig || this.sipConfig;
                const byeMessage = this.createSIPBYE(
                    endingPhoneNumber,
                    endingToTag,
                    endingFromTag,
                    endingSessionId,
                    endingBranch,
                    endingPublicIP,
                    endingSipPort,
                    contactUri,
                    routeHeaders,
                    byeCSeq,
                    sessionSipConfig
                );

                // Determine BYE destination: if Route headers exist, send to first Route header
                // Otherwise, send to Contact URI or fallback to SIP server
                // Use SIP config from session (already declared above)
                let byeHost = sessionSipConfig.server;
                let byePort = sessionSipConfig.port;
                
                if (routeHeaders.length > 0) {
                    // Extract address from first Route header (will be reversed in BYE, so use last one)
                    const firstRoute = routeHeaders[routeHeaders.length - 1]; // Last in Record-Route = first in Route set
                    // Parse Route header: <sip:host;params> or sip:host;params or <sip:host:port;params>
                    // Extract hostname (before : or ;) and port (after :, before ;)
                    const routeMatch = firstRoute.match(/<sip:([^:;>]+)(?::(\d+))?/i) || firstRoute.match(/sip:([^:;>]+)(?::(\d+))?/i);
                    if (routeMatch) {
                        byeHost = routeMatch[1].trim(); // Hostname only, no parameters
                        byePort = routeMatch[2] ? parseInt(routeMatch[2], 10) : 5060;
                        console.log(`   📍 BYE destination: ${byeHost}:${byePort} (from Route header)`);
                    } else {
                        console.error(`   ⚠️ Failed to parse Route header: ${firstRoute}`);
                    }
                } else if (contactUri) {
                    // Extract address from Contact URI
                    // Format: <sip:user@host:port;params> or sip:user@host:port;params
                    // Need to extract host (before : or ;) and port (after :, before ;)
                    const contactMatch = contactUri.match(/<sip:[^@]+@([^:;>]+)(?::(\d+))?/i) || contactUri.match(/sip:[^@]+@([^:;>]+)(?::(\d+))?/i);
                    if (contactMatch) {
                        byeHost = contactMatch[1].trim(); // Hostname only, no parameters
                        byePort = contactMatch[2] ? parseInt(contactMatch[2], 10) : 5060;
                        console.log(`   📍 BYE destination: ${byeHost}:${byePort} (from Contact URI)`);
                    } else {
                        console.error(`   ⚠️ Failed to parse Contact URI: ${contactUri}`);
                    }
                } else {
                    console.log(`   📍 BYE destination: ${byeHost}:${byePort} (fallback to SIP server)`);
                }

                console.log(`   📤 Sending BYE to ${byeHost}:${byePort}...`);
                console.log(`   📋 BYE Message:`);
                console.log(byeMessage);
                this.appendSipLog(endingSessionId, `Sending BYE to ${byeHost}:${byePort}\n${byeMessage}`);

                endingUdpClient.send(byeMessage, byePort, byeHost, (err) => {
                    if (!err) {
                        console.log(`✅ BYE sent to ${byeHost}:${byePort}`);
                        this.appendSipLog(endingSessionId, `BYE sent to ${byeHost}:${byePort}`);
                    } else {
                        console.error(`   ❌ BYE send error: ${err.message}`);
                        this.appendSipLog(endingSessionId, `BYE send error: ${err.message}`);
                    }
                });
            }

            // Release ports
            if (endingSipPort) {
                this.networkManager.releasePort(endingSipPort);
            }
            // Note: rtpSendPort and rtpReceivePort are the same (symmetric RTP), so only release once
            if (endingRtpReceivePort) {
                this.networkManager.releasePort(endingRtpReceivePort);
            }

            // Close UDP client
            if (endingUdpClient) {
                try {
                    // Check if socket is still running before closing
                    if (endingUdpClient.listening) {
                        endingUdpClient.close();
                    }
                } catch (e) {
                    // Ignore socket close errors
                    console.log('Socket already closed or error closing:', e.message);
                }
            }

            // Clear session AFTER all operations complete
            this.currentSession = null;
            this.sessionsByCallId.delete(endingSessionId);
            console.log(`✅ Call ended successfully (Session: ${endingSessionId})`);
            this.appendSipLog(endingSessionId, 'Call ended and resources released');
            console.log(`${'='.repeat(60)}\n`);

        } catch (error) {
            console.error('❌ Error ending call:', error);
            this.currentSession = null;
            // Try to clean up session from map if we have the sessionId
            if (endingSessionId) {
                this.sessionsByCallId.delete(endingSessionId);
            }
            this.isConversationActive = false;
        }
    }

    /**
     * End a call by sessionId (called from API)
     * @param {string} sessionId - Session ID to end (can be CRM sessionId or VoIP session ID)
     * @returns {boolean} - True if call was found and ended, false otherwise
     */
    endCallBySessionId(sessionId) {
        if (!this.currentSession) {
            console.log(`⚠️ No active call to end (sessionId: ${sessionId})`);
            return false;
        }

        // Check if the sessionId matches the current session
        // sessionId can be:
        // 1. The VoIP session ID (this.currentSession.id - the SIP Call-ID)
        // 2. The CRM callId (this.currentSession.callId - MongoDB _id)
        // 3. The CRM sessionId (this.currentSession.sessionId - stored in metadata.sessionId)
        const currentSessionId = this.currentSession.id;
        const currentCallId = this.currentSession.callId;
        const currentCrmSessionId = this.currentSession.sessionId; // CRM sessionId from metadata
        
        // Convert to strings for comparison (handles ObjectId vs string)
        const sessionIdStr = String(sessionId);
        const currentSessionIdStr = String(currentSessionId);
        const currentCallIdStr = currentCallId ? String(currentCallId) : null;
        const currentCrmSessionIdStr = currentCrmSessionId ? String(currentCrmSessionId) : null;
        
        // Match against any of the three possible IDs
        if (currentSessionIdStr === sessionIdStr || 
            (currentCallIdStr && currentCallIdStr === sessionIdStr) ||
            (currentCrmSessionIdStr && currentCrmSessionIdStr === sessionIdStr)) {
            console.log(`📞 Ending call by sessionId: ${sessionId}`);
            console.log(`   Matched session: ${currentSessionIdStr}, callId: ${currentCallIdStr}, crmSessionId: ${currentCrmSessionIdStr}`);
            this.endCall();
            return true;
        } else {
            console.log(`⚠️ Session ID mismatch.`);
            console.log(`   Current session ID: ${currentSessionIdStr}`);
            console.log(`   Current call ID: ${currentCallIdStr}`);
            console.log(`   Current CRM session ID: ${currentCrmSessionIdStr}`);
            console.log(`   Requested session ID: ${sessionIdStr}`);
            return false;
        }
    }

    /**
     * Get conversation debugging info
     */
    getDebugInfo() {
        const session = this.currentSession;
        if (!session) {
            return { active: false };
        }

        const conversation = this.conversationManager.getConversation(session.id);

        return {
            active: true,
            sessionId: session.id,
            phoneNumber: session.phoneNumber,
            status: session.status,
            conversationActive: this.isConversationActive,
            rtpEndpoint: session.rtpEndpoint,
            conversation: conversation ? {
                turnCount: conversation.messages.length,
                stage: conversation.context.stage,
                context: conversation.context
            } : null
        };
    }

    /**
     * Get status
     */
    getStatus() {
        return {
            type: 'sip-rtp', // Standard SIP/RTP protocol (NOT WebRTC)
            protocol: 'SIP/RTP over UDP',
            connected: this.sipConfig ? true : false,
            hasActiveCall: this.currentSession !== null,
            currentSession: this.currentSession ? {
                id: this.currentSession.id,
                phoneNumber: this.currentSession.phoneNumber,
                status: this.currentSession.status
            } : null
        };
    }

    initializeSipLog(callId) {
        if (!callId || !this.sipLogsDir) {
            return;
        }
        try {
            fs.writeFileSync(path.join(this.sipLogsDir, `${callId}.log`), `[${new Date().toISOString()}] Session start\n`, { flag: 'w' });
        } catch (error) {
            console.error(`⚠️ Unable to initialize SIP log for ${callId}: ${error.message}`);
        }
    }

    appendSipLog(callId, message) {
        if (!callId || !this.sipLogsDir) {
            return;
        }
        const logLine = `[${new Date().toISOString()}] ${message}`;
        fs.appendFile(path.join(this.sipLogsDir, `${callId}.log`), `${logLine}\n`, () => {});
    }

    startSIPKeepalive(callId, client, sipConfig = null) {
        if (!client || this.keepaliveIntervalMs <= 0 || !callId) {
            return;
        }
        const activeConfig = sipConfig || this.sipConfig;
        this.stopSIPKeepalive(callId);
        const timer = setInterval(() => {
            try {
                client.send('\r\n', activeConfig.port, activeConfig.server);
            } catch (error) {
                console.error(`⚠️ SIP keepalive send failed: ${error.message}`);
            }
        }, this.keepaliveIntervalMs);
        this.keepaliveTimers.set(callId, timer);
    }

    stopSIPKeepalive(callId) {
        const timer = this.keepaliveTimers.get(callId);
        if (timer) {
            clearInterval(timer);
            this.keepaliveTimers.delete(callId);
        }
    }

    /**
     * Generate and save call summary (called AFTER call ends to avoid delay)
     * @param {string} sessionId - Session ID
     * @param {Object} conversation - Conversation object
     */
    /**
     * Send SIP event to CRM API for tracking
     */
    async sendSipEventToCRM(callId, sipCode, sipMessage, sipType = null) {
        try {
            // Look up session by callId (SIP Call-ID) - this works even before currentSession is set
            let session = this.sessionsByCallId.get(callId);
            
            // Fallback to currentSession if not found in map
            if (!session) {
                session = this.currentSession;
            }
            
            if (!session) {
                logger.warn(`⚠️ [SIP_EVENT] No session found for callId: ${callId} - cannot send SIP event to CRM`);
                logger.warn(`   Available callIds in map: ${Array.from(this.sessionsByCallId.keys()).join(', ')}`);
                return;
            }
            
            if (!session.leadId) {
                logger.log(`ℹ️ [SIP_EVENT] Session has no leadId - not a CRM call, skipping`);
                logger.log(`   Session data: ${JSON.stringify({ callId: callId, sessionId: session.sessionId, hasLeadId: !!session.leadId })}`);
                return; // Not a CRM call, skip
            }

            // Use the CRM sessionId (from metadata.sessionId) or fallback to callId
            // callId parameter is the SIP Call-ID, but we need the CRM sessionId
            const crmSessionId = session.sessionId || session.callId || callId;
            
            logger.log(`📤 [SIP_EVENT] Sending to CRM: SIP Code=${sipCode}, Message=${sipMessage}, CRM SessionId=${crmSessionId}, SIP CallId=${callId}`);
            logger.log(`   Session details: ${JSON.stringify({ 
                hasSession: !!session, 
                sessionId: session.sessionId, 
                callId: session.callId, 
                leadId: session.leadId,
                phoneNumber: session.phoneNumber 
            })}`);
            
            // Determine status from SIP code
            let status = session.status;
            if (sipCode === 183 || sipCode === 180) {
                status = 'ringing';
            } else if (sipCode === 200) {
                status = 'in-progress';
            } else if (sipCode === 'BYE' || (sipCode >= 400 && sipCode < 600)) {
                if (sipCode === 'BYE') {
                    status = 'completed';
                } else {
                    status = 'failed';
                }
            }

            // Use global updateCallStatusInternal function (set in server.js)
            if (global.updateCallStatusInternal) {
                await global.updateCallStatusInternal(crmSessionId, status, {
                    sipCode: sipCode,
                    sipMessage: sipMessage,
                    sipType: sipType || this.getSipEventType(sipCode),
                    startedAt: session.startTime || new Date()
                });
                logger.log(`📤 SIP event sent to CRM: ${sipCode} ${sipMessage} (Status: ${status}, SessionId: ${crmSessionId})`);
            } else {
                logger.warn(`⚠️ updateCallStatusInternal not available - SIP event not sent to CRM`);
            }

        } catch (error) {
            // Use console.error as fallback if logger is not available
            try {
                if (logger && typeof logger.error === 'function') {
            logger.error(`❌ Error sending SIP event to CRM: ${error.message}`);
                } else {
                    console.error(`❌ Error sending SIP event to CRM: ${error.message}`);
                }
            } catch (logError) {
                // Ultimate fallback - logger itself failed
                console.error(`❌ Error sending SIP event to CRM: ${error.message}`);
            }
            // Don't throw - non-critical
        }
    }

    /**
     * Get SIP event type from code
     */
    getSipEventType(code) {
        if (code === 100) return 'trying';
        if (code === 180) return 'ringing';
        if (code === 183) return 'progress';
        if (code === 200) return 'answered';
        if (code >= 400 && code < 500) return 'client_error';
        if (code >= 500 && code < 600) return 'server_error';
        if (code === 'BYE') return 'bye';
        return 'unknown';
    }

    async generateAndSaveCallSummary(sessionId, conversation) {
        if (!conversation || !conversation.messages || conversation.messages.length === 0) {
            logger.warn(`⚠️ No conversation data for summary: ${sessionId}`);
            return;
        }

        try {
            logger.log(`📝 Generating call summary for: ${sessionId}`);
            
            // Generate summary using GPT
            const summary = await this.conversationManager.generateCallSummary(sessionId);
            
            if (!summary) {
                logger.warn(`⚠️ Summary generation returned null for: ${sessionId}`);
                return;
            }

            // Prepare summary data with structured transcript (JSON format for better parsing)
            // Messages can have both user and bot in the same object, so we need to create separate entries
            const transcriptArray = [];
            conversation.messages.forEach((msg, index) => {
                const timestamp = msg.timestamp || new Date().toISOString();
                // Add user message if present
                if (msg.user && msg.user.trim()) {
                    transcriptArray.push({
                        role: 'user',
                        content: msg.user.trim(),
                        timestamp: timestamp
                    });
                }
                // Add bot message if present (separate entry)
                if (msg.bot && msg.bot.trim()) {
                    transcriptArray.push({
                        role: 'bot',
                        content: msg.bot.trim(),
                        timestamp: timestamp
                    });
                }
            });

            // Also create a text version for backward compatibility
            // Messages can have both user and bot, so create separate lines for each
            const transcriptTextLines = [];
            conversation.messages.forEach((msg, index) => {
                if (msg.user && msg.user.trim()) {
                    transcriptTextLines.push(`User: ${msg.user.trim()}`);
                }
                if (msg.bot && msg.bot.trim()) {
                    transcriptTextLines.push(`Bot: ${msg.bot.trim()}`);
                }
            });
            const transcriptText = transcriptTextLines.join('\n');

            const summaryData = {
                sessionId: sessionId,
                timestamp: new Date().toISOString(),
                duration: conversation.duration ? (conversation.duration / 1000).toFixed(2) + 's' : 'N/A',
                turns: conversation.messages.length,
                context: conversation.context,
                summary: summary,
                transcript: JSON.stringify(transcriptArray), // Save as JSON for structured parsing
                transcriptText: transcriptText // Also keep text version for backward compatibility
            };

            // Save summary to file (JSON format)
            const summaryPath = path.join(this.summariesDir, `${sessionId}_summary.json`);
            fs.writeFileSync(summaryPath, JSON.stringify(summaryData, null, 2), 'utf8');
            logger.log(`✅ Call summary saved: ${summaryPath}`);

            // Also save as readable text file
            const textSummaryPath = path.join(this.summariesDir, `${sessionId}_summary.txt`);
            const textSummary = `Call Summary - ${sessionId}
Generated: ${summaryData.timestamp}
Duration: ${summaryData.duration}
Turns: ${summaryData.turns}

${'='.repeat(60)}
SUMMARY
${'='.repeat(60)}

${summary}

${'='.repeat(60)}
FULL TRANSCRIPT
${'='.repeat(60)}

${summaryData.transcriptText}

${'='.repeat(60)}
CONTEXT
${'='.repeat(60)}

${JSON.stringify(summaryData.context, null, 2)}
`;
            fs.writeFileSync(textSummaryPath, textSummary, 'utf8');
            logger.log(`✅ Text summary saved: ${textSummaryPath}`);

            // Send summary to CRM API (leadId optional - backend will resolve from sessionId)
            try {
                const axios = require('axios');
                // Use backend API URL
                // BASE_URL = frontend URL (https://betabase.pro) - used for email links
                // BACKEND_API_URL = backend URL (https://api.betabase.pro) - for API calls
                const backendUrl = process.env.BACKEND_API_URL || 'https://api.betabase.pro';
                const summaryUrl = `${backendUrl}/api/v1/crm/call/summary`;
                logger.log(`📤 Sending summary to backend API: ${summaryUrl}`);
                
                // Try to use leadId from current session if still present
                const leadId = this.currentSession?.leadId || null;
                if (leadId) {
                    logger.log(`📤 Sending call summary to CRM for leadId: ${leadId}`);
                } else {
                    logger.log(`📤 Sending call summary to CRM (leadId not in session, backend will resolve by sessionId)`);
                }

                await axios.post(summaryUrl, {
                    sessionId: sessionId,
                    leadId: leadId || undefined,
                    summary: summary,
                    transcript: summaryData.transcript, // JSON format
                    transcriptText: summaryData.transcriptText, // Text format for backward compatibility
                    metadata: {
                        turns: summaryData.turns,
                        duration: summaryData.duration,
                        context: summaryData.context,
                        summaryFileUrl: summaryPath
                    }
                });
                
                logger.log(`✅ Call summary sent to CRM successfully`);
            } catch (crmError) {
                logger.error(`❌ Error sending summary to CRM: ${crmError.message}`);
                if (crmError.response) {
                    logger.error(`   Status: ${crmError.response.status}`);
                    logger.error(`   URL: ${summaryUrl}`);
                    logger.error(`   Response: ${JSON.stringify(crmError.response.data, null, 2)}`);
                }
                // Don't throw - CRM integration failure shouldn't affect call ending
            }

        } catch (error) {
            logger.error(`❌ Error generating/saving call summary: ${error.message}`);
            // Don't throw - this is non-critical, shouldn't affect call ending
        }
    }
}

module.exports = WebRTCVoiceAgent;


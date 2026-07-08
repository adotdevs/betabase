const axios = require('axios');
const path = require('path');
const fs = require('fs');
const WebSocket = require('ws');
require('dotenv').config({ path: path.join(__dirname, '../../config/config.env') });

/**
 * Vapi AI Integration Module
 * Full integration with Vapi AI platform using WebSocket SDK
 * Creates/manages assistants and handles calls via Vapi API
 */
class VapiIntegration {
    constructor(userConfig = null) {
        // If userConfig provided, use it; otherwise use default from env
        if (userConfig && userConfig.enabled && userConfig.apiKey) {
            this.apiKey = userConfig.apiKey;
            this.assistantId = userConfig.assistantId || null;
            this.phoneNumberId = userConfig.phoneNumberId || null;
            console.log(`🔧 Using custom Vapi config for user`);
        } else {
            // Default config from environment
            this.apiKey = process.env.VAPI_API_KEY;
            this.assistantId = process.env.VAPI_ASSISTANT_ID || null;
            this.phoneNumberId = process.env.SIP_TRUNK_PHONE_NUMBER_ID || process.env.VAPI_PHONE_NUMBER_ID || null;
            console.log(`🔧 Using default Vapi config from environment`);
        }
        
        this.baseUrl = process.env.VAPI_BASE_URL || 'https://api.vapi.ai';
        this.sttProvider = process.env.VAPI_STT_PROVIDER || 'deepgram';
        this.ttsProvider = process.env.VAPI_TTS_PROVIDER || 'deepgram';
        this.llmProvider = process.env.VAPI_LLM_PROVIDER || 'openai';
        this.model = process.env.VAPI_MODEL || 'gpt-4';
        this.voiceId = process.env.VAPI_VOICE_ID || null;
        
        // Map of callId -> Vapi WebSocket client instance
        this.activeCallClients = new Map();
        
        // Load AI instructions for system prompt
        this.instructionsFilePath = path.join(__dirname, '../config/ai-instructions.json');
        this.aiInstructionsCache = null;
        this.loadAiInstructions();
        
        // Watch for file changes
        this.watchInstructionsFile();
        
        if (!this.apiKey) {
            console.warn('⚠️ VAPI_API_KEY not set - Vapi integration will not work');
        } else {
            console.log(`✅ Vapi Integration initialized (WebSocket SDK)`);
            console.log(`   - Base URL: ${this.baseUrl}`);
            console.log(`   - STT Provider: ${this.sttProvider}`);
            console.log(`   - TTS Provider: ${this.ttsProvider}`);
            console.log(`   - LLM Provider: ${this.llmProvider}`);
            console.log(`   - Model: ${this.model}`);
            if (this.assistantId) {
                console.log(`   - Assistant ID: ${this.assistantId}`);
            }
            
            // Initialize SIP trunk if configured (non-blocking)
            if (process.env.SIP_TRUNK_ENABLED === 'true') {
                console.log(`📞 SIP trunk enabled - initializing...`);
                this.initializeSipTrunk().then(config => {
                    if (config) {
                        console.log(`✅ SIP trunk initialized`);
                        console.log(`   - Credential ID: ${config.credentialId || 'Using existing'}`);
                        console.log(`   - Phone Number ID: ${config.phoneNumberId || 'Using existing'}`);
                        console.log(`   - Phone Number: ${config.phoneNumber || 'N/A'}`);
                    }
                }).catch(err => {
                    console.warn(`⚠️ SIP trunk initialization failed: ${err.message}`);
                    console.warn(`   You can run the setup script manually: node BE/scripts/setupSipTrunk.js`);
                });
            }
            
            // Configure webhook URL if enabled (non-blocking)
            if (process.env.VAPI_WEBHOOK_URL) {
                console.log(`🔗 Configuring Vapi webhook...`);
                this.createOrGetAssistant().then(assistantId => {
                    if (assistantId) {
                        return this.configureWebhook(assistantId, process.env.VAPI_WEBHOOK_URL);
                    }
                }).then(() => {
                    console.log(`✅ Vapi webhook configured`);
                    console.log(`   Webhook URL: ${process.env.VAPI_WEBHOOK_URL}`);
                }).catch(err => {
                    console.warn(`⚠️ Webhook configuration failed: ${err.message}`);
                    console.warn(`   You can configure it manually in Vapi dashboard or set VAPI_WEBHOOK_URL in config.env`);
                });
            } else {
                console.log(`ℹ️ Vapi webhook not configured - set VAPI_WEBHOOK_URL in config.env to enable`);
            }
        }
    }
    
    /**
     * Load AI instructions from JSON file
     */
    loadAiInstructions() {
        try {
            if (!fs.existsSync(this.instructionsFilePath)) {
                console.warn(`⚠️ AI instructions file not found: ${this.instructionsFilePath}`);
                return;
            }
            
            const fileContent = fs.readFileSync(this.instructionsFilePath, 'utf8');
            const parsed = JSON.parse(fileContent);
            
            if (parsed.systemPrompt) {
                this.aiInstructionsCache = parsed;
                console.log('✅ Vapi: AI instructions loaded');
            }
        } catch (error) {
            console.error('❌ Error loading AI instructions for Vapi:', error.message);
        }
    }
    
    /**
     * Watch for changes to instructions file
     */
    watchInstructionsFile() {
        // Don't watch/update if using a configured assistant ID
        // The assistant configuration comes from Vapi dashboard, not from ai-instructions.json
        if (this.assistantId) {
            console.log('ℹ️ Using configured assistant ID - ai-instructions.json changes will not update Vapi assistant');
            return;
        }
        
        try {
            fs.watchFile(this.instructionsFilePath, { interval: 1000 }, (curr, prev) => {
                if (curr.mtime !== prev.mtime) {
                    console.log('📝 Vapi: AI instructions file changed, reloading...');
                    this.loadAiInstructions();
                    // Only update if assistant was auto-created (not using configured ID)
                    if (this.assistantId && !process.env.VAPI_ASSISTANT_ID) {
                        this.updateAssistant(this.assistantId).catch(err => {
                            console.error('❌ Failed to update Vapi assistant:', err.message);
                        });
                    }
                }
            });
        } catch (error) {
            // File might not exist yet, ignore
        }
    }
    
    /**
     * Get system prompt from AI instructions
     */
    getSystemPrompt() {
        if (this.aiInstructionsCache && this.aiInstructionsCache.systemPrompt) {
            return this.aiInstructionsCache.systemPrompt;
        }
        return 'You are a helpful assistant.';
    }
    
    /**
     * Get first message from AI instructions
     */
    getFirstMessage() {
        if (this.aiInstructionsCache && this.aiInstructionsCache.greetingTemplate) {
            return this.aiInstructionsCache.greetingTemplate;
        }
        return 'Hello! How can I help you today?';
    }
    
    /**
     * Create or get assistant
     * @returns {Promise<string>} Assistant ID
     */
    async createOrGetAssistant() {
        if (!this.apiKey) {
            throw new Error('VAPI_API_KEY not configured');
        }
        
        // If assistant ID is configured, use it
        if (this.assistantId) {
            try {
                const assistant = await this.getAssistant(this.assistantId);
                console.log(`✅ Using configured Vapi assistant: ${this.assistantId}`);
                console.log(`   Name: ${assistant.name || 'N/A'}`);
                console.log(`   ⚠️ Note: Assistant configuration from dashboard will be used (not from ai-instructions.json)`);
                return this.assistantId;
            } catch (error) {
                console.error('❌ Failed to get configured assistant:', error.message);
                throw error;
            }
        }
        
        // Otherwise, create a new assistant
        try {
            const systemPrompt = this.getSystemPrompt();
            const firstMessage = this.getFirstMessage();
            
            // Map Deepgram voice IDs to Vapi's format
            let vapiVoiceId = this.voiceId;
            if (vapiVoiceId && vapiVoiceId.startsWith('aura-2-')) {
                // Convert Deepgram format (aura-2-selena-es) to Vapi format (selena)
                vapiVoiceId = vapiVoiceId.replace('aura-2-', '').split('-')[0];
                console.log(`🔄 Converting voice ID: ${this.voiceId} → ${vapiVoiceId}`);
            }
            
            // Validate voice ID
            const validVoices = ['asteria', 'luna', 'stella', 'athena', 'hera', 'orion', 'arcas', 'perseus', 'angus', 'orpheus', 'helios', 'zeus', 'thalia', 'andromeda', 'helena', 'apollo', 'aries', 'amalthea', 'atlas', 'aurora', 'callista', 'cora', 'cordelia', 'delia', 'draco', 'electra', 'harmonia', 'hermes', 'hyperion', 'iris', 'janus', 'juno', 'jupiter', 'mars', 'minerva', 'neptune', 'odysseus', 'ophelia', 'pandora', 'phoebe', 'pluto', 'saturn', 'selene', 'theia', 'vesta', 'celeste', 'estrella', 'nestor', 'sirio', 'carina', 'alvaro', 'diana', 'aquila', 'selena', 'javier'];
            if (vapiVoiceId && !validVoices.includes(vapiVoiceId.toLowerCase())) {
                console.warn(`⚠️ Invalid voice ID '${vapiVoiceId}', falling back to 'asteria'`);
                vapiVoiceId = 'asteria';
            }
            
            const url = `${this.baseUrl}/assistant`;
            
            const assistantData = {
                name: 'VIKI Assistant',
                firstMessage: firstMessage,
                model: {
                    provider: this.llmProvider,
                    model: this.model,
                    messages: [
                        {
                            role: 'system',
                            content: systemPrompt
                        }
                    ]
                },
                voice: {
                    provider: this.ttsProvider,
                    voiceId: vapiVoiceId || 'asteria'
                },
                transcriber: {
                    provider: this.sttProvider,
                    model: 'nova-2'
                },
                language: 'en'
            };
            
            const response = await axios.post(url, assistantData, {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 15000
            });
            
            const assistantId = response.data.id || response.data.assistantId;
            console.log(`✅ Vapi assistant created: ${assistantId}`);
            
            // Save assistant ID for future use
            this.assistantId = assistantId;
            
            return assistantId;
        } catch (error) {
            console.error('❌ Vapi assistant creation error:', error.message);
            if (error.response) {
                console.error('   Status:', error.response.status);
                console.error('   Data:', error.response.data);
            }
            throw error;
        }
    }
    
    /**
     * Get assistant details
     * @param {string} assistantId - Assistant ID (optional, uses configured if not provided)
     * @returns {Promise<Object>} Assistant details
     */
    async getAssistant(assistantId = null) {
        if (!this.apiKey) {
            throw new Error('VAPI_API_KEY not configured');
        }
        
        if (!assistantId) {
            assistantId = this.assistantId;
        }
        
        if (!assistantId) {
            throw new Error('Assistant ID is required');
        }
        
        const url = `${this.baseUrl}/assistant/${assistantId}`;
        
        const response = await axios.get(url, {
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json'
            },
            timeout: 10000
        });
        
        return response.data;
    }
    
    /**
     * Configure webhook URL for assistant
     * This sets the Server URL in the assistant which enables webhooks
     * @param {string} assistantId - Assistant ID (optional, uses configured if not provided)
     * @param {string} webhookUrl - Webhook URL to receive events
     * @returns {Promise<Object>} Updated assistant
     */
    async configureWebhook(assistantId = null, webhookUrl) {
        if (!this.apiKey) {
            throw new Error('VAPI_API_KEY not configured');
        }
        
        if (!assistantId) {
            assistantId = this.assistantId;
        }
        
        if (!assistantId) {
            throw new Error('Assistant ID is required');
        }
        
        if (!webhookUrl) {
            throw new Error('Webhook URL is required');
        }
        
        try {
            // Get current assistant to preserve other settings
            const currentAssistant = await this.getAssistant(assistantId);
            
            // Filter out read-only fields that Vapi doesn't allow in updates
            // Vapi returns error if we include: id, orgId, createdAt, updatedAt, isServerUrlSecretSet
            const readOnlyFields = ['id', 'orgId', 'createdAt', 'updatedAt', 'isServerUrlSecretSet'];
            const updateData = {};
            
            // Only include updatable fields
            Object.keys(currentAssistant).forEach(key => {
                if (!readOnlyFields.includes(key)) {
                    updateData[key] = currentAssistant[key];
                }
            });
            
            // Set server URL (webhook endpoint)
            updateData.serverUrl = webhookUrl;
            
            // Update assistant with server URL
            const updateUrl = `${this.baseUrl}/assistant/${assistantId}`;
            
            const response = await axios.patch(updateUrl, updateData, {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            });
            
            console.log(`✅ Webhook configured for assistant ${assistantId}`);
            console.log(`   Server URL: ${webhookUrl}`);
            return response.data;
        } catch (error) {
            console.error('❌ Error configuring webhook:', error.message);
            if (error.response) {
                console.error('   Status:', error.response.status);
                console.error('   Data:', JSON.stringify(error.response.data, null, 2));
            }
            throw error;
        }
    }
    
    /**
     * Update assistant with latest instructions
     * @param {string} assistantId - Assistant ID
     * @returns {Promise<Object>} Updated assistant
     */
    async updateAssistant(assistantId) {
        if (!this.apiKey) {
            throw new Error('VAPI_API_KEY not configured');
        }
        
        try {
            const systemPrompt = this.getSystemPrompt();
            const firstMessage = this.getFirstMessage();
            
            const url = `${this.baseUrl}/assistant/${assistantId}`;
            
            const updateData = {
                firstMessage: firstMessage,
                model: {
                    provider: this.llmProvider,
                    model: this.model,
                    messages: [
                        {
                            role: 'system',
                            content: systemPrompt
                        }
                    ]
                }
            };
            
            const response = await axios.patch(url, updateData, {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 15000
            });
            
            console.log(`✅ Vapi assistant updated: ${assistantId}`);
            return response.data;
        } catch (error) {
            console.error('❌ Vapi assistant update error:', error.message);
            if (error.response) {
                console.error('   Status:', error.response.status);
                console.error('   Data:', error.response.data);
            }
            throw error;
        }
    }
    
    /**
     * Create a call via Vapi REST API (for outbound phone calls)
     * Then establish WebSocket connection for call control
     * @param {string} phoneNumber - Phone number to call
     * @param {string} assistantId - Assistant ID (optional, uses configured if not provided)
     * @param {Object} metadata - Additional metadata
     * @returns {Promise<Object>} Call details with WebSocket client
     */
    async createCall(phoneNumber, assistantId = null, metadata = {}) {
        if (!this.apiKey) {
            throw new Error('VAPI_API_KEY not configured');
        }
        
        try {
            // Ensure phone number is in E.164 format (must start with +)
            let e164Phone = phoneNumber.trim();
            
            // Remove any spaces, dashes, or parentheses
            e164Phone = e164Phone.replace(/[\s\-\(\)]/g, '');
            
            // Ensure it starts with +
            if (!e164Phone.startsWith('+')) {
                // If it starts with country code (e.g., 1 for US), add +
                if (e164Phone.startsWith('1') && e164Phone.length === 11) {
                    e164Phone = '+' + e164Phone;
                } else if (e164Phone.startsWith('92') && e164Phone.length >= 12) {
                    // Pakistan country code
                    e164Phone = '+' + e164Phone;
                } else {
                    // Try to add +1 for US numbers
                    if (e164Phone.length === 10) {
                        e164Phone = '+1' + e164Phone;
                    } else {
                        throw new Error(`Phone number must be in E.164 format (start with +). Got: ${phoneNumber}`);
                    }
                }
            }
            
            // Validate E.164 format: + followed by 1-15 digits
            const e164Regex = /^\+[1-9]\d{1,14}$/;
            if (!e164Regex.test(e164Phone)) {
                throw new Error(`Invalid E.164 phone number format: ${e164Phone}. Must be + followed by country code and number.`);
            }
            
            console.log(`📞 Phone number validation: "${phoneNumber}" → "${e164Phone}" (E.164)`);
            
            const url = `${this.baseUrl}/call`;
            
            // Use user-specific phoneNumberId if set, otherwise use instance phoneNumberId, then fallback to env
            const phoneNumberId = this.phoneNumberId || process.env.SIP_TRUNK_PHONE_NUMBER_ID || process.env.VAPI_PHONE_NUMBER_ID;
            
            if (!phoneNumberId) {
                throw new Error('Phone number ID not configured. Please configure your Vapi phone number ID in your profile settings, or set SIP_TRUNK_PHONE_NUMBER_ID or VAPI_PHONE_NUMBER_ID in config.env');
            }
            
            // Validate phone number ID format (should be a UUID)
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            if (!uuidRegex.test(phoneNumberId)) {
                console.warn(`⚠️ Phone number ID format may be invalid: ${phoneNumberId}`);
                console.warn(`   Expected format: UUID (e.g., d5abafa8-006d-4bc1-aa44-4b187cdba74c)`);
            }
            
            if (this.phoneNumberId) {
                console.log(`📞 Using user-specific phone number ID from profile: ${this.phoneNumberId}`);
            } else if (process.env.SIP_TRUNK_PHONE_NUMBER_ID) {
                console.log(`📞 Using SIP trunk phone number ID from env: ${process.env.SIP_TRUNK_PHONE_NUMBER_ID}`);
                if (process.env.SIP_TRUNK_DYNAMIC_NUMBERS === 'true') {
                    console.log(`   ℹ️ Dynamic numbers enabled - PBX will set caller ID per call`);
                    console.log(`   ℹ️ Placeholder number in Vapi: +15551234567 (display only, PBX overrides)`);
                }
            } else {
                console.log(`📞 Using default Vapi phone number from env: ${process.env.VAPI_PHONE_NUMBER_ID}`);
            }
            
            console.log(`📋 Phone Number ID Validation:`);
            console.log(`   - ID: ${phoneNumberId}`);
            console.log(`   - Format: ${uuidRegex.test(phoneNumberId) ? '✅ Valid UUID' : '⚠️ May be invalid'}`);
            console.log(`   - Source: ${this.phoneNumberId ? 'User Profile' : (process.env.SIP_TRUNK_PHONE_NUMBER_ID ? 'SIP Trunk Env' : 'Vapi Env')}`);
            
            // Extract lead information for variable substitution
            const leadInfo = metadata.leadInfo || {};
            const firstName = leadInfo.firstName || leadInfo.first_name || '';
            const lastName = leadInfo.lastName || leadInfo.last_name || '';
            const email = leadInfo.email || '';
            const phone = leadInfo.phone || '';
            
            // PHONE CALL payload (not web call)
            const callData = {
                phoneNumberId: phoneNumberId, // Your Vapi phone number (caller ID)
                assistantId: assistantId || this.assistantId,
                customer: {
                    number: e164Phone // Customer's phone number in E.164 format
                },
                metadata: metadata,
                // Pass variables to assistant for dynamic substitution
                // Vapi uses assistantOverrides.variableValues for variable substitution
                assistantOverrides: {
                    variableValues: {
                        // Vapi uses snake_case by default: first_name, last_name
                        'first_name': firstName,
                        'last_name': lastName,
                        // Also support camelCase variations
                        'firstName': firstName,
                        'lastName': lastName,
                        // Full name variations
                        'full_name': `${firstName} ${lastName}`.trim(),
                        'name': `${firstName} ${lastName}`.trim() || firstName || lastName,
                        // Additional lead info
                        'email': email,
                        'phone': phone,
                        'lead_id': metadata.leadId || ''
                    }
                }
            };
            
            // Remove empty variable values to keep payload clean
            Object.keys(callData.assistantOverrides.variableValues).forEach(key => {
                if (!callData.assistantOverrides.variableValues[key]) {
                    delete callData.assistantOverrides.variableValues[key];
                }
            });
            
            console.log(`📤 Sending to Vapi:`, JSON.stringify({
                phoneNumberId: callData.phoneNumberId,
                assistantId: callData.assistantId,
                customer: { number: callData.customer.number },
                variableValues: callData.assistantOverrides.variableValues
            }, null, 2));
            
            // Create call via REST API
            const response = await axios.post(url, callData, {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            });
            
            const callId = response.data.id || response.data.callId;
            const callDetails = {
                id: callId,
                status: response.data.status || response.data.state || 'queued',
                customer: response.data.customer || {},
                metadata: response.data.metadata || metadata
            };
            
            console.log(`✅ Vapi call created: ${callId}`);
            console.log(`📋 Call details:`, JSON.stringify({
                id: callDetails.id,
                status: callDetails.status,
                customer: callDetails.customer
            }, null, 2));
            
            // ⚠️ IMPORTANT: WebSocket SDK is NOT available for outbound phone calls created via REST API
            // 
            // Vapi's WebSocket SDK only works for:
            // 1. Web calls (browser-based, created via @vapi-ai/web SDK)
            // 2. Calls that have a listenUrl (typically inbound or web calls)
            // 
            // For outbound phone calls created via REST API:
            // - No WebSocket endpoint is provided (404 error)
            // - No listenUrl is available
            // - Cannot use vapi.stop() or vapi.endCall()
            // 
            // We'll still try to setup WebSocket (in case listenUrl becomes available),
            // but it will fail gracefully and we'll use fallback methods.
            await this.setupWebSocketClient(callId);
            
            return callDetails;
        } catch (error) {
            console.error('❌ Vapi call creation error:', error.message);
            if (error.response) {
                console.error('   Status:', error.response.status);
                console.error('   Data:', JSON.stringify(error.response.data, null, 2));
                
                // Provide specific guidance for common errors
                if (error.response.status === 400) {
                    const errorData = error.response.data;
                    if (errorData?.message?.includes('phoneNumberId') || errorData?.error?.includes('phoneNumberId')) {
                        console.error('   📋 Issue: Phone Number ID is invalid or not found');
                        console.error('   → Verify the phone number ID exists in your Vapi account');
                        console.error('   → Check if the phone number is linked to a valid SIP trunk credential');
                        console.error('   → Ensure the phone number ID in your profile matches your Vapi dashboard');
                    }
                } else if (error.response.status === 401) {
                    console.error('   📋 Issue: Invalid API Key');
                    console.error('   → Verify your Vapi API key is correct in your profile');
                    console.error('   → Check if the API key has proper permissions');
                } else if (error.response.status === 404) {
                    console.error('   📋 Issue: Resource not found');
                    console.error('   → Verify phone number ID or assistant ID exists in your Vapi account');
                }
            } else if (error.message.includes('503') || error.message.includes('service-unavailable')) {
                console.error('   📋 SIP 503 Service Unavailable Error');
                console.error('   → This usually means the SIP trunk or phone number is not reachable');
                console.error('   → Verify your SIP trunk gateway is online and accessible');
                console.error('   → Check if the phone number ID is properly linked to a SIP trunk');
            }
            throw error;
        }
    }
    
    /**
     * Setup WebSocket client for a call
     * @param {string} callId - Call ID
     * @returns {Promise<void>}
     */
    async setupWebSocketClient(callId) {
        try {
            // For outbound phone calls, we need to connect to Vapi's WebSocket endpoint
            // The WebSocket URL format: wss://api.vapi.ai/call/{callId}/websocket
            // We'll establish connection when call becomes active
            
            console.log(`🔌 WebSocket client setup for call: ${callId}`);
            
            // Store callId for WebSocket connection
            // We'll connect when the call becomes active (status: in-progress)
            this.activeCallClients.set(callId, { 
                callId, 
                connected: false,
                ws: null,
                reconnectAttempts: 0
            });
            
            // Try to establish WebSocket connection
            await this.connectWebSocket(callId);
            
        } catch (error) {
            console.error(`❌ Error setting up WebSocket client for call ${callId}:`, error.message);
        }
    }
    
    /**
     * Connect WebSocket for a call
     * @param {string} callId - Call ID
     * @returns {Promise<void>}
     */
    async connectWebSocket(callId) {
        try {
            const clientInfo = this.activeCallClients.get(callId);
            if (!clientInfo) {
                console.warn(`⚠️ No client info found for call: ${callId}`);
                return;
            }
            
            // Get call status to find listenUrl (if available)
            let listenUrl = null;
            try {
                const callStatus = await this.getCallStatus(callId);
                listenUrl = callStatus.listenUrl || callStatus.transport?.listenUrl;
                
                if (listenUrl) {
                    console.log(`✅ Found listenUrl for call ${callId}`);
                } else {
                    console.log(`ℹ️ No listenUrl found for call ${callId} - WebSocket may not be available for outbound phone calls`);
                }
            } catch (statusError) {
                console.warn(`⚠️ Failed to get call status for listenUrl: ${statusError.message}`);
            }
            
            // Use listenUrl if available, otherwise try generic endpoint
            let wsUrl;
            if (listenUrl) {
                // Use the listenUrl from call status (add /transport if needed)
                wsUrl = listenUrl.includes('/transport') ? listenUrl : `${listenUrl}/transport`;
            } else {
                // Try generic endpoint (will likely fail for outbound phone calls)
                wsUrl = `wss://api.vapi.ai/call/${callId}/websocket?token=${this.apiKey}`;
            }
            
            console.log(`🔌 Connecting WebSocket for call: ${callId}`);
            console.log(`   URL: ${wsUrl.substring(0, 80)}...`);
            
            const ws = new WebSocket(wsUrl);
            
            ws.on('open', () => {
                console.log(`✅ WebSocket connected for call: ${callId}`);
                clientInfo.connected = true;
                clientInfo.ws = ws;
                clientInfo.reconnectAttempts = 0;
            });
            
            ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data.toString());
                    console.log(`📨 WebSocket message for call ${callId}:`, message.type || 'unknown');
                    
                    // Handle different message types
                    if (message.type === 'call-end') {
                        console.log(`📞 Call ended via WebSocket: ${callId}`);
                    }
                } catch (error) {
                    console.warn(`⚠️ Failed to parse WebSocket message: ${error.message}`);
                }
            });
            
            ws.on('error', (error) => {
                console.warn(`⚠️ WebSocket error for call ${callId}: ${error.message}`);
                console.warn(`ℹ️ This is expected for outbound phone calls - Vapi may not provide WebSocket endpoint`);
                clientInfo.connected = false;
                
                // Don't try to reconnect - outbound phone calls don't support WebSocket
                // We'll use REST API fallback instead
            });
            
            ws.on('close', () => {
                console.log(`🔌 WebSocket closed for call: ${callId}`);
                clientInfo.connected = false;
                clientInfo.ws = null;
            });
            
            // Store WebSocket instance
            clientInfo.ws = ws;
            
            // Set timeout - if connection doesn't open in 5 seconds, consider it failed
            setTimeout(() => {
                if (!clientInfo.connected) {
                    console.warn(`⚠️ WebSocket connection timeout for call ${callId} - will use REST API fallback`);
                    if (ws.readyState === WebSocket.CONNECTING) {
                        ws.close();
                    }
                }
            }, 5000);
            
        } catch (error) {
            console.error(`❌ Error connecting WebSocket for call ${callId}:`, error.message);
            const clientInfo = this.activeCallClients.get(callId);
            if (clientInfo) {
                clientInfo.connected = false;
            }
        }
    }
    
    /**
     * End a call using WebSocket
     * @param {string} callId - Call ID
     * @returns {Promise<Object>}
     */
    async endCall(callId) {
        if (!this.apiKey) {
            throw new Error('VAPI_API_KEY not configured');
        }
        
        try {
            // Check if we have an active WebSocket client for this call
            const clientInfo = this.activeCallClients.get(callId);
            
            if (clientInfo && clientInfo.ws && clientInfo.connected) {
                // Use WebSocket to send end call command
                console.log(`🛑 Ending call via WebSocket: ${callId}`);
                try {
                    // Send end call tool command via WebSocket (correct format for Vapi)
                    const endMessage = {
                        type: 'tool',
                        tool: 'endCall'
                    };
                    
                    clientInfo.ws.send(JSON.stringify(endMessage));
                    console.log(`✅ EndCall tool command sent via WebSocket: ${callId}`);
                    
                    // Wait a moment for the command to process
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    
                    // Verify call ended
                    try {
                        const status = await this.getCallStatus(callId);
                        if (status && (status.status === 'ended' || status.status === 'cancelled')) {
                            console.log(`✅ Verified: Call ended via WebSocket (status: ${status.status})`);
                            
                            // Clean up WebSocket connection
                            if (clientInfo.ws) {
                                clientInfo.ws.close();
                            }
                            this.activeCallClients.delete(callId);
                            
                            return { success: true, method: 'websocket' };
                        }
                    } catch (verifyError) {
                        // Ignore verification errors
                    }
                    
                    // Clean up WebSocket connection
                    if (clientInfo.ws) {
                        clientInfo.ws.close();
                    }
                    this.activeCallClients.delete(callId);
                    
                    return { success: true, method: 'websocket' };
                } catch (wsError) {
                    console.warn(`⚠️ WebSocket end call failed: ${wsError.message}`);
                    // Fall back to REST API
                }
            } else {
                // Try to establish WebSocket connection if not connected
                if (clientInfo && !clientInfo.connected) {
                    console.log(`🔄 WebSocket not connected, attempting to connect...`);
                    await this.connectWebSocket(callId);
                    
                    // Wait for connection
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    
                    // Try again if now connected
                    const updatedClientInfo = this.activeCallClients.get(callId);
                    if (updatedClientInfo && updatedClientInfo.connected && updatedClientInfo.ws) {
                        return await this.endCall(callId);
                    }
                }
            }
            
            // Fallback: Try to trigger endCall tool via assistant
            // If assistant is configured with endCall tool, we can trigger it via REST API
            console.log(`🔄 Trying to trigger endCall tool via assistant...`);
            try {
                // Get call details to find assistant ID
                const callStatus = await this.getCallStatus(callId);
                const assistantId = callStatus.assistantId || this.assistantId;
                
                if (assistantId) {
                    // Try multiple endpoints for sending tool commands
                    const endpoints = [
                        `${this.baseUrl}/call/${callId}/message`,
                        `${this.baseUrl}/call/${callId}/tool`,
                        `${this.baseUrl}/call/${callId}/command`
                    ];
                    
                    for (const messageUrl of endpoints) {
                        try {
                            // Send endCall tool command
                            const toolCommand = {
                                type: 'tool',
                                tool: 'endCall'
                            };
                            
                            const response = await axios.post(messageUrl, toolCommand, {
                                headers: {
                                    'Authorization': `Bearer ${this.apiKey}`,
                                    'Content-Type': 'application/json'
                                },
                                timeout: 10000,
                                validateStatus: (status) => status < 500 // Don't throw on 404/400
                            });
                            
                            if (response.status === 200 || response.status === 201) {
                                console.log(`✅ EndCall tool command sent via REST API: ${callId} (endpoint: ${messageUrl})`);
                                
                                // Wait and verify
                                await new Promise(resolve => setTimeout(resolve, 2000));
                                const status = await this.getCallStatus(callId);
                                if (status && (status.status === 'ended' || status.status === 'cancelled')) {
                                    console.log(`✅ Verified: Call ended via endCall tool (status: ${status.status})`);
                                    return { success: true, method: 'assistant-tool' };
                                }
                                
                                return { success: true, method: 'assistant-tool', verified: false };
                            }
                        } catch (toolError) {
                            // Try next endpoint
                            if (toolError.response && toolError.response.status === 404) {
                                continue; // Try next endpoint
                            }
                            console.warn(`⚠️ EndCall tool command failed on ${messageUrl}: ${toolError.message}`);
                        }
                    }
                }
            } catch (toolSetupError) {
                console.warn(`⚠️ Failed to setup endCall tool: ${toolSetupError.message}`);
            }
            
            // Final fallback: Try REST API DELETE (may not work for active calls)
            console.log(`⚠️ All methods failed, trying REST API DELETE as last resort...`);
            const url = `${this.baseUrl}/call/${callId}`;
            
            try {
                const response = await axios.delete(url, {
                    headers: {
                        'Authorization': `Bearer ${this.apiKey}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 10000
                });
                console.log(`✅ Call ended via REST API (DELETE): ${callId}`);
                console.warn(`⚠️ NOTE: DELETE may only delete the call record, not hang up an active call`);
                return { success: true, method: 'rest-api-delete' };
            } catch (deleteError) {
                console.warn(`⚠️ REST API DELETE also failed: ${deleteError.message}`);
                console.warn(`⚠️ Vapi does not support programmatically ending outbound phone calls`);
                console.warn(`ℹ️ Call will continue until customer hangs up - transcript/summary will be fetched when call ends`);
                return { success: false, method: 'none', error: deleteError.message };
            }
        } catch (error) {
            console.error(`❌ Vapi end call error: ${error.message}`);
            return { success: false, method: 'none', error: error.message };
        }
    }
    
    /**
     * Get call status
     * @param {string} callId - Call ID
     * @returns {Promise<Object>} Call status
     */
    async getCallStatus(callId) {
        if (!this.apiKey) {
            throw new Error('VAPI_API_KEY not configured');
        }
        
        const url = `${this.baseUrl}/call/${callId}`;
        
        try {
            const response = await axios.get(url, {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 10000
            });
            
            // Extract endedReason from multiple possible field names (Vapi API variations)
            const rawData = response.data;
            const endedReason = rawData.endedReason || 
                               rawData.endReason || 
                               rawData.ended_reason || 
                               rawData.reason ||
                               rawData.end?.reason ||
                               rawData.callEnd?.reason ||
                               null;
            
            // ALWAYS log FULL raw response - Vapi's status contains valuable information
            const status = rawData.status || rawData.state;
            
            // Use status as endedReason when endedReason is not available (status often contains the reason)
            const finalEndedReason = endedReason || 
                                    (status && (status === 'ended' || status === 'failed' || status === 'cancelled') ? status : null) ||
                                    rawData.message ||
                                    null;
            
            // Log FULL raw response for ALL calls - status transitions are important
            console.log(`📊 Vapi call status - FULL RAW RESPONSE:`, JSON.stringify(rawData, null, 2));
            
            // Log extracted details with emphasis on endedReason
            console.log(`📊 Vapi call status - Extracted details:`, JSON.stringify({
                id: rawData.id,
                status: status,
                state: rawData.state,
                endedReason: finalEndedReason || 'NOT FOUND - Check full response above',
                rawEndedReason: rawData.endedReason || 'NOT FOUND',
                error: rawData.error,
                message: rawData.message,
                duration: rawData.duration,
                startedAt: rawData.startedAt,
                endedAt: rawData.endedAt,
                transcript: rawData.transcript ? (typeof rawData.transcript === 'string' ? `${rawData.transcript.length} chars` : 'Object') : 'Not available',
                summary: rawData.summary ? 'Available' : 'Not available',
                customer: rawData.customer ? { number: rawData.customer.number } : null,
                assistantId: rawData.assistantId,
                direction: rawData.direction,
                cost: rawData.cost,
                messages: rawData.messages ? `${rawData.messages.length} messages` : null,
                // Debug: Show all top-level keys to identify field names
                _allKeys: Object.keys(rawData).join(', ')
            }, null, 2));
            
            // Ensure endedReason is always set in the returned data
            // Vapi API returns endedReason as a direct field (e.g., "Customer Busy", "Customer Did Not Answer")
            const responseData = { ...rawData };
            
            // Always set endedReason in responseData for consistency
            // Priority: actual endedReason > message > status
            if (finalEndedReason) {
                responseData.endedReason = finalEndedReason;
            } else if (!responseData.endedReason && status && (status === 'ended' || status === 'failed' || status === 'cancelled')) {
                // Use status as endedReason if no explicit endedReason is provided
                responseData.endedReason = status;
            }
            
            // Log what we're returning
            if (responseData.endedReason) {
                console.log(`✅ [GET CALL STATUS] Returning endedReason: ${responseData.endedReason}`);
            } else {
                console.warn(`⚠️ [GET CALL STATUS] No endedReason found - status: ${status}`);
            }
            
            return responseData;
        } catch (error) {
            // Don't log 404 errors as errors - they're often false positives right after call creation
            if (error.response && error.response.status === 404) {
                // Silently throw 404 - let caller handle it
                throw error;
            }
            
            console.error('❌ Vapi get call status error:', error.message);
            if (error.response) {
                console.error('   Status:', error.response.status);
                console.error('   Data:', JSON.stringify(error.response.data, null, 2));
            }
            throw error;
        }
    }
    
    /**
     * Get call transcript
     * @param {string} callId - Call ID
     * @returns {Promise<string>} Transcript text
     */
    async getCallTranscript(callId) {
        if (!this.apiKey) {
            throw new Error('VAPI_API_KEY not configured');
        }
        
        try {
            const callStatus = await this.getCallStatus(callId);
            
            // Vapi transcript can be in different formats
            if (callStatus.transcript) {
                // If transcript is a string
                if (typeof callStatus.transcript === 'string') {
                    return callStatus.transcript;
                }
                // If transcript is an object with messages
                if (callStatus.transcript.messages) {
                    return callStatus.transcript.messages
                        .map(msg => `${msg.role === 'user' ? 'User' : 'Bot'}: ${msg.content || msg.text || ''}`)
                        .join('\n');
                }
            }
            
            // Try to get from messages array
            if (callStatus.messages && Array.isArray(callStatus.messages)) {
                return callStatus.messages
                    .map(msg => `${msg.role === 'user' ? 'User' : 'Bot'}: ${msg.content || msg.text || ''}`)
                    .join('\n');
            }
            
            return '';
        } catch (error) {
            console.error('❌ Vapi get transcript error:', error.message);
            return '';
        }
    }
    
    /**
     * Get full call details including transcript and summary
     * @param {string} callId - Call ID
     * @returns {Promise<Object>} Full call details
     */
    async getCallDetails(callId) {
        if (!this.apiKey) {
            throw new Error('VAPI_API_KEY not configured');
        }
        
        try {
            const callStatus = await this.getCallStatus(callId);
            const transcript = await this.getCallTranscript(callId);
            
            // Extract endedReason from multiple possible sources (same as getCallStatus)
            const endedReason = callStatus.endedReason || 
                               callStatus.endReason || 
                               callStatus.ended_reason || 
                               callStatus.reason ||
                               callStatus.end?.reason ||
                               callStatus.callEnd?.reason ||
                               null;
            
            // Use status as endedReason fallback if endedReason not available
            const status = callStatus.status || callStatus.state;
            const finalEndedReason = endedReason || 
                                    (status && (status === 'ended' || status === 'failed' || status === 'cancelled') ? status : null) ||
                                    callStatus.message ||
                                    null;
            
            console.log(`📊 [GET CALL DETAILS] Extracted endedReason: ${finalEndedReason || 'NOT FOUND'}`);
            console.log(`📊 [GET CALL DETAILS] Full callStatus:`, JSON.stringify(callStatus, null, 2));
            
            // Extract recording URL from multiple possible locations
            // This mirrors what webhooks provide, and ensures finalizeVapiCall() can store recordingUrl
            const artifact = callStatus.artifact || callStatus.analysis?.artifact || {};
            const recordingObj = artifact.recording || {};
            const recordingUrl = callStatus.recordingUrl ||
                                 artifact.recordingUrl ||
                                 artifact.stereoRecordingUrl ||
                                 recordingObj.mono?.combinedUrl ||
                                 recordingObj.mono?.assistantUrl ||
                                 recordingObj.mono?.customerUrl ||
                                 recordingObj.stereoUrl ||
                                 null;
            
            return {
                id: callStatus.id || callId,
                status: status,
                state: callStatus.state,
                duration: callStatus.duration || 0,
                startedAt: callStatus.startedAt ? new Date(callStatus.startedAt) : null,
                endedAt: callStatus.endedAt ? new Date(callStatus.endedAt) : null,
                endedReason: finalEndedReason, // Use extracted endedReason
                error: callStatus.error,
                message: callStatus.message,
                transcript: transcript,
                summary: callStatus.summary || null,
                recordingUrl: recordingUrl,
                messages: callStatus.messages || [],
                metadata: callStatus.metadata || {},
                customer: callStatus.customer,
                assistantId: callStatus.assistantId,
                direction: callStatus.direction,
                cost: callStatus.cost,
                fullResponse: callStatus // Include full response for debugging
            };
        } catch (error) {
            console.error('❌ Vapi get call details error:', error.message);
            throw error;
        }
    }
    
    /**
     * Create a SIP trunk credential
     * @param {Object} options - SIP trunk configuration
     * @param {string} options.name - Name for the credential
     * @param {string|Array} options.gateways - SIP gateway(s) - can be IP or domain
     * @param {boolean} options.inboundEnabled - Enable inbound calls
     * @param {boolean} options.outboundLeadingPlusEnabled - Enable leading + for outbound
     * @param {Object} options.auth - Authentication details
     * @param {string} options.auth.username - SIP username
     * @param {string} options.auth.password - SIP password
     * @returns {Promise<Object>} Created credential
     */
    async createSipTrunkCredential(options) {
        if (!this.apiKey) {
            throw new Error('VAPI_API_KEY not configured');
        }
        
        try {
            // Process gateways - can be string, IP, or array
            let gateways = options.gateways;
            if (typeof gateways === 'string') {
                // Single gateway string
                gateways = [{ ip: gateways, inboundEnabled: options.inboundEnabled !== false }];
            } else if (!Array.isArray(gateways)) {
                // Single gateway object
                gateways = [gateways];
            }
            
            // Ensure each gateway has the correct format
            gateways = gateways.map(gw => {
                if (typeof gw === 'string') {
                    return { ip: gw, inboundEnabled: options.inboundEnabled !== false };
                }
                return {
                    ip: gw.ip || gw.domain || gw,
                    inboundEnabled: gw.inboundEnabled !== false
                };
            });
            
            const payload = {
                provider: 'byo-sip-trunk',
                name: options.name || 'SIP Trunk',
                gateways: gateways,
                outboundLeadingPlusEnabled: options.outboundLeadingPlusEnabled !== false,
                outboundAuthenticationPlan: {
                    authUsername: options.auth.username,
                    authPassword: options.auth.password
                }
            };
            
            console.log(`📞 Creating SIP trunk credential: ${options.name}`);
            console.log(`   Gateways: ${JSON.stringify(gateways, null, 2)}`);
            console.log(`   Username: ${options.auth.username}`);
            console.log(`   ⚠️ IMPORTANT: Vapi will send auth username as "${options.auth.username}@<vapi-domain>" in SIP messages`);
            console.log(`   ⚠️ If your PBX expects just "${options.auth.username}", you need IP-based authentication (no registration)`);
            
            const response = await axios.post(
                `${this.baseUrl}/credential`,
                payload,
                {
                    headers: {
                        'Authorization': `Bearer ${this.apiKey}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 30000
                }
            );
            
            console.log(`✅ SIP trunk credential created: ${response.data.id}`);
            return response.data;
        } catch (error) {
            console.error('❌ Error creating SIP trunk credential:', error.message);
            if (error.response) {
                console.error('   Status:', error.response.status);
                console.error('   Data:', JSON.stringify(error.response.data, null, 2));
                
                // Provide specific troubleshooting based on error
                if (error.response.status === 400) {
                    const errorMsg = error.response.data?.message || '';
                    if (errorMsg.includes('validate') || errorMsg.includes('gateway')) {
                        console.error('\n🔧 Troubleshooting SIP Gateway Validation Failure:');
                        console.error('   1. ⚠️ CRITICAL: Ensure VoIP247 has whitelisted Vapi IPs:');
                        console.error('      - 44.229.228.186/32');
                        console.error('      - 44.238.177.138/32');
                        console.error('      → Contact VoIP247 support to confirm IPs are whitelisted');
                        console.error('      → Wait 5-10 minutes after whitelisting for changes to propagate');
                        console.error('   2. Verify gateway is accessible:');
                        console.error('      → Run: node BE/scripts/testSipTrunkConnection.js');
                        console.error('   3. Try using IP address instead of domain:');
                        console.error('      → Set SIP_TRUNK_TRY_IP=true in config.env');
                        console.error('      → Or manually set SIP_TRUNK_GATEWAY to the IP address');
                        console.error('   4. Check SIP credentials:');
                        console.error('      → Verify username: 201');
                        console.error('      → Verify password is correct');
                        console.error('   5. Confirm trunk status in VoIP247:');
                        console.error('      → Trunk must be ACTIVE and REGISTERED');
                        console.error('      → SIP port 5060 must be OPEN');
                        console.error('   6. If still failing after IP whitelisting:');
                        console.error('      → Contact VoIP247 support with error details');
                        console.error('      → Ask them to verify SIP trunk is properly configured\n');
                    }
                }
            }
            throw error;
        }
    }
    
    /**
     * Create a phone number linked to a SIP trunk credential
     * @param {Object} options - Phone number configuration
     * @param {string} options.number - Phone number (E.164 format)
     * @param {string} options.name - Name for the phone number
     * @param {string} options.credentialId - SIP trunk credential ID
     * @param {boolean} options.numberE164CheckEnabled - Enable E.164 validation
     * @returns {Promise<Object>} Created phone number
     */
    async createSipTrunkPhoneNumber(options) {
        if (!this.apiKey) {
            throw new Error('VAPI_API_KEY not configured');
        }
        
        try {
            const payload = {
                provider: 'byo-phone-number',
                name: options.name || `SIP Number ${options.number}`,
                number: options.number,
                numberE164CheckEnabled: options.numberE164CheckEnabled !== false,
                credentialId: options.credentialId
            };
            
            console.log(`📞 Creating SIP trunk phone number: ${options.number}`);
            console.log(`   Credential ID: ${options.credentialId}`);
            
            const response = await axios.post(
                `${this.baseUrl}/phone-number`,
                payload,
                {
                    headers: {
                        'Authorization': `Bearer ${this.apiKey}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 30000
                }
            );
            
            console.log(`✅ SIP trunk phone number created: ${response.data.id}`);
            return response.data;
        } catch (error) {
            console.error('❌ Error creating SIP trunk phone number:', error.message);
            if (error.response) {
                console.error('   Status:', error.response.status);
                console.error('   Data:', error.response.data);
            }
            throw error;
        }
    }
    
    /**
     * Get all SIP trunk credentials
     * @returns {Promise<Array>} List of credentials
     */
    async getSipTrunkCredentials() {
        if (!this.apiKey) {
            throw new Error('VAPI_API_KEY not configured');
        }
        
        try {
            const response = await axios.get(
                `${this.baseUrl}/credential`,
                {
                    headers: {
                        'Authorization': `Bearer ${this.apiKey}`,
                        'Content-Type': 'application/json'
                    },
                    params: {
                        provider: 'byo-sip-trunk'
                    }
                }
            );
            
            return response.data || [];
        } catch (error) {
            console.error('❌ Error getting SIP trunk credentials:', error.message);
            throw error;
        }
    }
    
    /**
     * Get all phone numbers
     * @returns {Promise<Array>} List of phone numbers
     */
    async getPhoneNumbers() {
        if (!this.apiKey) {
            throw new Error('VAPI_API_KEY not configured');
        }
        
        try {
            const response = await axios.get(
                `${this.baseUrl}/phone-number`,
                {
                    headers: {
                        'Authorization': `Bearer ${this.apiKey}`,
                        'Content-Type': 'application/json'
                    }
                }
            );
            
            return response.data || [];
        } catch (error) {
            console.error('❌ Error getting phone numbers:', error.message);
            throw error;
        }
    }
    
    /**
     * Initialize SIP trunk if configured
     * @returns {Promise<Object>} SIP trunk configuration
     */
    async initializeSipTrunk() {
        if (process.env.SIP_TRUNK_ENABLED !== 'true') {
            console.log('ℹ️ SIP trunk not enabled');
            return null;
        }
        
        try {
            // Clean gateway format (remove https://, http://, and username if present)
            let gateway = process.env.SIP_TRUNK_GATEWAY || '';
            gateway = gateway.replace(/^https?:\/\//, ''); // Remove http:// or https://
            gateway = gateway.replace(/^[^@]+@/, ''); // Remove username@ if present
            gateway = gateway.trim();
            
            if (!gateway) {
                throw new Error('SIP_TRUNK_GATEWAY is required');
            }
            
            // Try to resolve domain to IP if it's a domain (optional - for troubleshooting)
            const dns = require('dns').promises;
            let gatewayToUse = gateway;
            const isIP = /^\d+\.\d+\.\d+\.\d+$/.test(gateway);
            
            if (!isIP && process.env.SIP_TRUNK_TRY_IP === 'true') {
                try {
                    console.log(`🔍 Resolving gateway domain to IP: ${gateway}`);
                    const addresses = await dns.resolve4(gateway);
                    if (addresses && addresses.length > 0) {
                        gatewayToUse = addresses[0];
                        console.log(`✅ Resolved ${gateway} → ${gatewayToUse}`);
                        console.log(`   Using IP address instead of domain for gateway`);
                    }
                } catch (dnsError) {
                    console.warn(`⚠️ Could not resolve ${gateway} to IP: ${dnsError.message}`);
                    console.warn(`   Using domain name as-is`);
                }
            }
            
            let credentialId = process.env.SIP_TRUNK_CREDENTIAL_ID;
            let phoneNumberId = process.env.SIP_TRUNK_PHONE_NUMBER_ID;
            const isDynamicNumbers = process.env.SIP_TRUNK_DYNAMIC_NUMBERS === 'true';
            
            // Create credential if not exists
            if (!credentialId) {
                console.log('📞 Creating SIP trunk credential...');
                console.log(`   Gateway: ${gatewayToUse}${gatewayToUse !== gateway ? ` (resolved from ${gateway})` : ''}`);
                console.log(`   Username: ${process.env.SIP_TRUNK_USERNAME}`);
                console.log(`   ⚠️ NOTE: Vapi will send auth username as "${process.env.SIP_TRUNK_USERNAME}@<domain>" in SIP messages`);
                console.log(`   ⚠️ If your PBX expects just "${process.env.SIP_TRUNK_USERNAME}", configure IP-based auth (no registration)`);
                
                const credential = await this.createSipTrunkCredential({
                    name: process.env.SIP_TRUNK_NAME || 'PBX SIP Trunk',
                    gateways: gatewayToUse,
                    inboundEnabled: process.env.SIP_TRUNK_INBOUND_ENABLED === 'true',
                    outboundLeadingPlusEnabled: process.env.SIP_TRUNK_OUTBOUND_LEADING_PLUS !== 'false',
                    auth: {
                        username: process.env.SIP_TRUNK_USERNAME,
                        password: process.env.SIP_TRUNK_PASSWORD
                    }
                });
                
                credentialId = credential.id;
                console.log(`✅ SIP trunk credential ID: ${credentialId}`);
                console.log(`⚠️ Add this to your config.env: SIP_TRUNK_CREDENTIAL_ID=${credentialId}`);
            }
            
            // Create phone number if not exists
            // For dynamic numbers, we use the phoneNumberId only (no placeholder number needed)
            if (!phoneNumberId) {
                const phoneNumber = process.env.SIP_TRUNK_PHONE_NUMBER;
                
                if (isDynamicNumbers) {
                    // For dynamic numbers, if no phone number provided, we still need to create a phone number resource
                    // but we'll use a minimal placeholder that won't be used (PBX will override)
                    if (!phoneNumber) {
                        console.log('📞 Dynamic numbers enabled - phone number resource required for Vapi API');
                        console.log(`   ⚠️ Note: Using placeholder number (PBX will set actual caller ID per call)`);
                        console.log(`   ⚠️ The placeholder number is only for Vapi API requirement`);
                        console.log(`   ⚠️ Your PBX must override the From header with actual caller ID per call`);
                        console.log(`   ℹ️ Configured phone number placeholder: +15551234567 (fictional, won't be used)`);
                        
                        // Use a valid E.164 format placeholder that Vapi will accept
                        // Format: +1 (US country code) + 555 (reserved for fictional) + 7 digits
                        // 555 prefix is reserved in North America for fictional numbers, so this won't conflict
                        const dynamicPlaceholder = '+15551234567'; // Valid E.164 format placeholder for dynamic numbers
                        
                        const phoneNumberResult = await this.createSipTrunkPhoneNumber({
                            number: dynamicPlaceholder,
                            name: (process.env.SIP_TRUNK_NAME || 'PBX Phone Number') + ' (Dynamic - PBX Sets Caller ID)',
                            credentialId: credentialId,
                            numberE164CheckEnabled: false
                        });
                        
                        phoneNumberId = phoneNumberResult.id;
                        console.log(`✅ SIP trunk phone number ID created: ${phoneNumberId}`);
                        console.log(`⚠️ Add this to your config.env: SIP_TRUNK_PHONE_NUMBER_ID=${phoneNumberId}`);
                        console.log(`ℹ️ Dynamic numbers enabled - PBX will set actual caller ID per call`);
                        console.log(`ℹ️ Placeholder number ${dynamicPlaceholder} will appear in Vapi dashboard but won't be used for calls`);
                    } else {
                        // User provided a number, use it
                        console.log('📞 Creating SIP trunk phone number...');
                        console.log(`   Number: ${phoneNumber}`);
                        console.log(`   ⚠️ Note: With dynamic numbers, PBX will override caller ID per call`);
                        
                        const phoneNumberResult = await this.createSipTrunkPhoneNumber({
                            number: phoneNumber,
                            name: (process.env.SIP_TRUNK_NAME || 'PBX Phone Number') + ' (Dynamic - PBX Sets Caller ID)',
                            credentialId: credentialId,
                            numberE164CheckEnabled: false
                        });
                        
                        phoneNumberId = phoneNumberResult.id;
                        console.log(`✅ SIP trunk phone number ID: ${phoneNumberId}`);
                        console.log(`⚠️ Add this to your config.env: SIP_TRUNK_PHONE_NUMBER_ID=${phoneNumberId}`);
                    }
                } else {
                    // Not dynamic numbers - require a real phone number
                    if (!phoneNumber) {
                        throw new Error('SIP_TRUNK_PHONE_NUMBER is required when SIP_TRUNK_DYNAMIC_NUMBERS is false');
                    }
                    
                    console.log('📞 Creating SIP trunk phone number...');
                    console.log(`   Number: ${phoneNumber}`);
                    
                    const phoneNumberResult = await this.createSipTrunkPhoneNumber({
                        number: phoneNumber,
                        name: process.env.SIP_TRUNK_NAME || 'PBX Phone Number',
                        credentialId: credentialId,
                        numberE164CheckEnabled: false
                    });
                    
                    phoneNumberId = phoneNumberResult.id;
                    console.log(`✅ SIP trunk phone number ID: ${phoneNumberId}`);
                    console.log(`⚠️ Add this to your config.env: SIP_TRUNK_PHONE_NUMBER_ID=${phoneNumberId}`);
                }
            }
            
            return {
                credentialId,
                phoneNumberId,
                phoneNumber: process.env.SIP_TRUNK_PHONE_NUMBER || (isDynamicNumbers ? '+10000000000' : null),
                isDynamicNumbers: isDynamicNumbers
            };
        } catch (error) {
            console.error('❌ Failed to initialize SIP trunk:', error.message);
            throw error;
        }
    }
}

module.exports = VapiIntegration;

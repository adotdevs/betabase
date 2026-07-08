const axios = require('axios');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../config/config.env') });

class VoiceInteraction {
    constructor() {
        this.openaiApiKey = process.env.OPENAI_API_KEY;
        this.deepgramApiKey = process.env.DEEPGRAM_API_KEY;
        this.useDeepgramStreaming = process.env.USE_DEEPGRAM_STREAMING === 'true';
        this.audioBuffer = new Map();
        this.conversationState = new Map();
        this.activeRuns = new Map(); // Track active runs per thread to prevent concurrent operations
        this.processingLocks = new Map(); // Track processing locks per session to prevent concurrent generateVoiceResponse calls
        
        // Vapi AI Integration - DISABLED (Vapi is a call platform, not individual service API)
        // Using direct provider APIs instead for better control and lower latency
        this.useVapi = false; // Always disabled - use providers directly
        
        // LLM Provider configuration
        this.llmProvider = (process.env.LLM_PROVIDER || 'openai').toLowerCase();
        this.groqApiKey = process.env.GROQ_API_KEY;
        this.groqModel = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
        this.togetherApiKey = process.env.TOGETHER_API_KEY;
        this.togetherModel = process.env.TOGETHER_MODEL || 'meta-llama/Llama-3.1-8B-Instruct-Turbo';
        this.openaiModel = process.env.OPENAI_MODEL || 'gpt-3.5-turbo';
        // Google Gemini API
        this.geminiApiKey = process.env.GEMINI_API_KEY;
        this.geminiModel = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
        // Azure AI (LLM)
        this.azureAiEndpoint = process.env.AZURE_AI_ENDPOINT || '';
        this.azureAiKey = process.env.AZURE_AI_KEY || '';
        this.azureLlmDeployment = process.env.AZURE_LLM_DEPLOYMENT || 'phi-3-mini';
        
        // TTS Provider configuration
        this.ttsProvider = (process.env.TTS_PROVIDER || 'openai').toLowerCase();
        this.elevenlabsApiKey = process.env.ELEVENLABS_API_KEY;
        this.elevenlabsVoiceId = process.env.ELEVENLABS_VOICE_ID || 'pNInz6obpgDQGcFmaJgB';
        // Allow choosing cheaper ElevenLabs models/output via env, with sensible defaults
        // Options (subject to ElevenLabs API): eleven_flash_v2_5 (fast/cheap), eleven_turbo_v2_5 (higher quality)
        this.elevenlabsModelId = process.env.ELEVENLABS_MODEL_ID || 'eleven_flash_v2_5';
        // Lower output format reduces bandwidth and conversion time; cost is typically per character, not bitrate
        // Common options: mp3_22050_64, mp3_44100_128
        this.elevenlabsOutputFormat = process.env.ELEVENLABS_OUTPUT_FORMAT || 'mp3_22050_64';
        // Deepgram TTS configuration
        this.deepgramTtsModel = process.env.DEEPGRAM_TTS_MODEL || 'aura-2-thalia-en';
        // Azure Speech (STT/TTS)
        this.azureSpeechKey = process.env.AZURE_SPEECH_KEY || '';
        this.azureSpeechRegion = process.env.AZURE_SPEECH_REGION || '';
        // Best natural female voices: en-US-AvaMultilingualNeural (most natural), en-US-JennyNeural, en-US-AriaNeural
        this.azureTtsVoice = process.env.AZURE_TTS_VOICE || 'en-US-AvaMultilingualNeural';
        this.azureTtsFormat = process.env.AZURE_TTS_FORMAT || 'audio-8khz-8bit-mulaw';
        
        // AI Instructions cache (loaded from dashboard JSON file)
        this.aiInstructionsCache = null;
        this.instructionsFilePath = path.join(__dirname, '../config/ai-instructions.json');
        
        // Response tracking to prevent repetition
        this.responseHistory = new Map(); // sessionId -> Set of response hashes
        
        // Dynamic LLM Provider Registry (no if-else/switch)
        this.llmProviderRegistry = new Map();
        this.initializeLLMProviders();
        
        // Load instructions at startup
        this.loadAiInstructions();
        
        // Watch for file changes and reload cache
        this.watchInstructionsFile();
        
        console.log(`🔧 LLM Provider: ${this.llmProvider} (instructions from dashboard)`);
        console.log(`🔧 TTS Provider: ${this.ttsProvider}`);
    }
    
    /**
     * Initialize dynamic LLM provider registry (configuration-driven, no if-else)
     */
    initializeLLMProviders() {
        const providerConfigs = [
            {
                name: 'groq',
                handler: this.generateWithGroq.bind(this),
                apiKey: this.groqApiKey,
                model: this.groqModel
            },
            {
                name: 'openai',
                handler: this.generateWithOpenAI.bind(this),
                apiKey: this.openaiApiKey,
                model: this.openaiModel
            },
            {
                name: 'together',
                handler: this.generateWithTogether.bind(this),
                apiKey: this.togetherApiKey,
                model: this.togetherModel
            },
            {
                name: 'gemini',
                handler: this.generateWithGemini.bind(this),
                apiKey: this.geminiApiKey,
                model: this.geminiModel
            },
            {
                name: 'azure',
                handler: this.generateWithAzureLLM.bind(this),
                apiKey: this.azureAiKey,
                model: this.azureLlmDeployment
            }
        ];
        
        providerConfigs.forEach(config => {
            this.llmProviderRegistry.set(config.name, {
                handler: config.handler,
                apiKey: config.apiKey,
                model: config.model,
                enabled: !!config.apiKey
            });
        });
    }
    
    /**
     * Get configured LLM provider handler dynamically
     */
    getLLMProvider() {
        const provider = this.llmProviderRegistry.get(this.llmProvider);
        if (!provider) {
            throw new Error(`LLM provider "${this.llmProvider}" not found in registry. Available: ${Array.from(this.llmProviderRegistry.keys()).join(', ')}`);
        }
        if (!provider.enabled) {
            throw new Error(`LLM provider "${this.llmProvider}" is not configured. Please set the required API key in config.env`);
        }
        return provider;
    }
    
    /**
     * Generate response hash for duplicate detection
     */
    generateResponseHash(response) {
        const crypto = require('crypto');
        const normalized = response.toLowerCase().trim().replace(/[^\w\s]/g, '');
        return crypto.createHash('md5').update(normalized).digest('hex');
    }
    
    /**
     * Check if response was already said (prevents repetition)
     */
    hasSaidResponse(sessionId, response) {
        const history = this.responseHistory.get(sessionId) || new Set();
        const hash = this.generateResponseHash(response);
        return history.has(hash);
    }
    
    /**
     * Mark response as said (track for repetition prevention)
     */
    markResponseAsSaid(sessionId, response) {
        const history = this.responseHistory.get(sessionId) || new Set();
        const hash = this.generateResponseHash(response);
        history.add(hash);
        this.responseHistory.set(sessionId, history);
    }
    
    /**
     * Clear response history for a session
     */
    clearResponseHistory(sessionId) {
        this.responseHistory.delete(sessionId);
    }
    
    /**
     * Load AI instructions from JSON file into memory cache
     * This is called at startup and when file changes (via watcher)
     * Zero delay during calls - instructions are already in memory
     */
    loadAiInstructions() {
        try {
            const absolutePath = path.resolve(this.instructionsFilePath);
            console.log(`📂 Loading AI instructions from: ${absolutePath}`);
            
            if (!fs.existsSync(absolutePath)) {
                console.warn(`⚠️ AI instructions file not found at: ${absolutePath}`);
                console.warn('   It will be created when admin first accesses /admin/crm/ai-instructions');
                console.warn('   Server will continue, but calls may fail until instructions are configured.');
                this.aiInstructionsCache = null;
                return;
            }
            
            const fileContent = fs.readFileSync(absolutePath, 'utf8');
            const parsed = JSON.parse(fileContent);
            
            // Validate required fields
            if (!parsed.systemPrompt || typeof parsed.systemPrompt !== 'string' || parsed.systemPrompt.trim().length === 0) {
                console.error('❌ AI instructions file is missing or has empty systemPrompt field.');
                this.aiInstructionsCache = null;
                return;
            }
            if (!parsed.personality || typeof parsed.personality !== 'string' || parsed.personality.trim().length === 0) {
                console.error('❌ AI instructions file is missing or has empty personality field.');
                this.aiInstructionsCache = null;
                return;
            }
            if (!parsed.tone || typeof parsed.tone !== 'string' || parsed.tone.trim().length === 0) {
                console.error('❌ AI instructions file is missing or has empty tone field.');
                this.aiInstructionsCache = null;
                return;
            }
            if (parsed.maxWords === undefined || parsed.maxWords === null) {
                console.error('❌ AI instructions file is missing maxWords field.');
                this.aiInstructionsCache = null;
                return;
            }
            
            this.aiInstructionsCache = parsed;
            console.log('✅ AI instructions loaded from dashboard file into memory cache');
            console.log(`   - System Prompt: ${parsed.systemPrompt.substring(0, 50)}...`);
            console.log(`   - Personality: ${parsed.personality}`);
            console.log(`   - Tone: ${parsed.tone}`);
            console.log(`   - Max Words: ${parsed.maxWords}`);
        } catch (error) {
            console.error('❌ Error loading AI instructions:', error.message);
            this.aiInstructionsCache = null;
        }
    }
    
    /**
     * Watch for changes to instructions file and reload cache automatically
     */
    watchInstructionsFile() {
        try {
            const absolutePath = path.resolve(this.instructionsFilePath);
            fs.watchFile(absolutePath, { interval: 1000 }, (curr, prev) => {
                if (curr.mtime !== prev.mtime || (curr.mtime.getTime() === 0 && prev.mtime.getTime() === 0 && fs.existsSync(absolutePath))) {
                    console.log('📝 AI instructions file changed, reloading cache...');
                    this.loadAiInstructions();
                }
            });
            console.log(`👀 Watching AI instructions file for changes: ${absolutePath}`);
        } catch (error) {
            console.error('❌ Error setting up file watcher:', error);
        }
    }
    
    /**
     * Get AI instructions from memory cache (zero delay)
     * Throws error if cache is not loaded (file must be configured via admin UI)
     */
    getAiInstructions() {
        if (!this.aiInstructionsCache) {
            throw new Error('AI instructions not loaded. Please configure them via the admin UI at /admin/crm/ai-instructions');
        }
        return this.aiInstructionsCache;
    }

    // Text-to-Speech using Vapi AI or fallback providers
    async textToSpeech(text, voice = 'alloy', streamingCallback = null) {
        try {
            console.log(`Converting to speech: "${text}"`);
            
            // Using direct provider APIs (no Vapi wrapper)
            // Deepgram TTS if selected
            if (this.ttsProvider === 'deepgram' && this.deepgramApiKey) {
                try {
                    return await this.textToSpeechDeepgram(text, streamingCallback);
                } catch (deepgramError) {
                    console.error('❌ Deepgram TTS failed:', deepgramError.message);
                    console.log('🔄 Falling back to OpenAI...');
                    return await this.textToSpeechOpenAI(text, voice);
                }
            }
            
            // Azure first if selected
            if (this.ttsProvider === 'azure' && this.azureSpeechKey && this.azureSpeechRegion) {
                try {
                    return await this.textToSpeechAzure(text);
                } catch (azureError) {
                    console.error('❌ Azure TTS failed:', azureError.message);
                    console.log('🔄 Falling back to ElevenLabs...');
                    // Fallback to ElevenLabs if Azure fails
                    if (this.elevenlabsApiKey) {
                        try {
                            return await this.textToSpeechElevenLabs(text, voice);
                        } catch (elevenLabsError) {
                            console.log('🔄 ElevenLabs also failed, falling back to OpenAI...');
                            return await this.textToSpeechOpenAI(text, voice);
                        }
                    } else {
                        // Fallback to OpenAI if ElevenLabs not configured
                        return await this.textToSpeechOpenAI(text, voice);
                    }
                }
            }
            // Use ElevenLabs if configured, otherwise fallback to OpenAI
            if (this.ttsProvider === 'elevenlabs' && this.elevenlabsApiKey) {
                try {
                    return await this.textToSpeechElevenLabs(text, voice);
                } catch (elevenLabsError) {
                    // If custom voice fails with 400 (voice_limit_reached, invalid voice, etc.), try default voice
                    if (elevenLabsError.response?.status === 400 && this.elevenlabsVoiceId) {
                        console.log('⚠️ Custom ElevenLabs voice failed, trying default voice...');
                        const originalVoiceId = this.elevenlabsVoiceId;
                        this.elevenlabsVoiceId = null; // Use default voice from voiceMap
                        try {
                            const result = await this.textToSpeechElevenLabs(text, voice);
                            this.elevenlabsVoiceId = originalVoiceId; // Restore original
                            return result;
                        } catch (fallbackError) {
                            this.elevenlabsVoiceId = originalVoiceId; // Restore original
                            throw fallbackError; // Re-throw if default voice also fails
                        }
                    }
                    throw elevenLabsError; // Re-throw if not a 400 error
                }
            } else {
                return await this.textToSpeechOpenAI(text, voice);
            }
        } catch (error) {
            console.error('TTS Error:', error);
            // Fallback to OpenAI if provider fails
            if (this.ttsProvider === 'deepgram' || this.ttsProvider === 'elevenlabs') {
                console.log(`⚠️ ${this.ttsProvider} TTS failed, falling back to OpenAI...`);
                return await this.textToSpeechOpenAI(text, voice);
            }
            throw error;
        }
    }
    
    // Text-to-Speech using Azure Neural TTS (returns 16kHz 8-bit µ-law for direct RTP - HD Voice)
    async textToSpeechAzure(text) {
        try {
            const region = this.azureSpeechRegion.trim();
            const url = `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`;
            const ssml = [
                "<speak version='1.0' xml:lang='en-US'>",
                `<voice xml:lang='en-US' name='${this.azureTtsVoice}'>`,
                `${text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}`,
                "</voice>",
                "</speak>"
            ].join('');
            
            const response = await axios.post(url, ssml, {
                headers: {
                    'Ocp-Apim-Subscription-Key': this.azureSpeechKey,
                    'Content-Type': 'application/ssml+xml',
                    'X-Microsoft-OutputFormat': this.azureTtsFormat,
                },
                responseType: 'arraybuffer',
                timeout: 10000
            });
            const buffer = Buffer.from(response.data);
            console.log(`✅ Azure TTS generated: ${buffer.length} bytes (${this.azureTtsFormat})`);
            return buffer;
        } catch (error) {
            console.error('❌ Azure TTS Error:', error.message);
            if (error.response) {
                console.error('   Status:', error.response.status);
                console.error('   Data:', error.response.data?.toString?.() || '[binary]');
            }
            throw error;
        }
    }
    
    async textToSpeechElevenLabs(text, voice = 'alloy') {
        try {
            // Map OpenAI voices to ElevenLabs voice IDs
            const voiceMap = {
                'alloy': 'pNInz6obpgDQGcFmaJgB',
                'echo': 'EXAVITQu4vr4xnSDxMaL',
                'fable': 'ErXwobaYiN019PkySvjV',
                'onyx': 'VR6AewLTigWG4xSOukaG',
                'nova': '21m00Tcm4TlvDq8ikWAM',
                'shimmer': 'TxGEqnHWrfWFTfGW9XjX'
            };
            
            const voiceId = this.elevenlabsVoiceId || voiceMap[voice] || voiceMap['nova'];
            
            // Convert speech rate percentage to ElevenLabs speed parameter (0.7-1.2 range)
            // ELEVENLABS_SPEECH_RATE can be: "80%" (20% slower), "87.5%" (12.5% slower), or "0.8" (direct speed value)
            let speechSpeed = 0.8; // Default: 80% = 20% slower
            const rateEnv = process.env.ELEVENLABS_SPEECH_RATE;
            
            if (rateEnv) {
                if (rateEnv.includes('%')) {
                    // Parse percentage: "80%" -> 0.8, "87.5%" -> 0.875
                    const percent = parseFloat(rateEnv.replace('%', '').trim());
                    if (!isNaN(percent)) {
                        speechSpeed = percent / 100;
                    }
                } else {
                    // Direct speed value: "0.8" -> 0.8
                    const directValue = parseFloat(rateEnv.trim());
                    if (!isNaN(directValue)) {
                        speechSpeed = directValue;
                    }
                }
            }
            
            // Clamp to ElevenLabs valid range (0.7 to 1.2)
            speechSpeed = Math.max(0.7, Math.min(1.2, speechSpeed));
            
            console.log(`🎵 Using ElevenLabs TTS (voice: ${voiceId}, speed: ${speechSpeed.toFixed(2)} = ${(speechSpeed * 100).toFixed(1)}% of normal)`);
            console.log(`   📊 Raw env value: "${rateEnv || 'not set'}" -> Parsed: ${speechSpeed.toFixed(2)}`);
            
            // Build request payload - try speed in BOTH locations (some API versions use different locations)
            const requestPayload = {
                text: text, // Plain text (ElevenLabs doesn't support SSML)
                model_id: this.elevenlabsModelId,
                voice_settings: {
                    stability: 0.7, // Higher stability = more consistent, less skipping
                    similarity_boost: 0.8, // Higher similarity = clearer voice
                    style: 0.2, // Lower style = more natural, less robotic
                    use_speaker_boost: true, // Enhance clarity
                    speed: speechSpeed // ElevenLabs speed parameter (0.7-1.2) - in voice_settings
                },
                speed: speechSpeed, // Also try as top-level parameter (for newer API versions)
                output_format: this.elevenlabsOutputFormat
            };
            
            console.log(`   🔍 Request payload - voice_settings.speed: ${requestPayload.voice_settings.speed}, top-level speed: ${requestPayload.speed}`);
            
            const response = await axios.post(
                `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
                requestPayload,
                {
                    headers: {
                        'Accept': 'audio/mpeg',
                        'Content-Type': 'application/json',
                        'xi-api-key': this.elevenlabsApiKey
                    },
                    responseType: 'arraybuffer',
                    timeout: 15000 // Increased timeout for better quality generation
                }
            );

            let buffer = Buffer.from(response.data);
            console.log(`✅ ElevenLabs TTS generated: ${buffer.length} bytes`);

            // NEW OPTIMISATION: if ElevenLabs returns μ-law 8k we can send it as-is – zero conversion
            if (this.elevenlabsOutputFormat && this.elevenlabsOutputFormat.toLowerCase().includes('ulaw')) {
                console.log('⚡ Skipping audio conversion – ElevenLabs already returned G.711 μ-law');
                return buffer; // ready to send to PBX
            }
            
            // Skip ffmpeg processing - ElevenLabs API speed parameter should be sufficient
            // This removes ~200-300ms of processing time
            if (false && speechSpeed !== 1.0 && speechSpeed < 1.0) { // Disabled - using native API speed
                try {
                    console.log(`🎚 Applying audio slowdown using ffmpeg (speed: ${speechSpeed.toFixed(2)})...`);
                    const tempId = Date.now();
                    const tempInput = path.join(__dirname, '../tmp', `elevenlabs_input_${tempId}.mp3`);
                    const tempOutput = path.join(__dirname, '../tmp', `elevenlabs_output_${tempId}.mp3`);
                    
                    // Ensure temp directory exists
                    if (!fs.existsSync(path.dirname(tempInput))) {
                        fs.mkdirSync(path.dirname(tempInput), { recursive: true });
                    }
                    
                    // Write input MP3
                    fs.writeFileSync(tempInput, buffer);
                    
                    // Use ffmpeg to slow down audio (atempo filter: 0.5 = 50% speed, 0.8 = 80% speed)
                    // atempo can only go from 0.5 to 2.0, so for 0.8 speed we use atempo=0.8
                    await new Promise((resolve, reject) => {
                        ffmpeg(tempInput)
                            .audioFilters(`atempo=${speechSpeed.toFixed(2)}`)
                            .audioCodec('libmp3lame')
                            .audioBitrate(64)
                            .audioFrequency(22050)
                            .format('mp3')
                            .on('end', () => {
                                try {
                                    buffer = fs.readFileSync(tempOutput);
                                    console.log(`✅ Audio slowed down: ${buffer.length} bytes (speed: ${speechSpeed.toFixed(2)})`);
                                    
                                    // Cleanup
                                    if (fs.existsSync(tempInput)) fs.unlinkSync(tempInput);
                                    if (fs.existsSync(tempOutput)) fs.unlinkSync(tempOutput);
                                    
                                    resolve();
                                } catch (error) {
                                    if (fs.existsSync(tempInput)) fs.unlinkSync(tempInput);
                                    if (fs.existsSync(tempOutput)) fs.unlinkSync(tempOutput);
                                    reject(error);
                                }
                            })
                            .on('error', (err) => {
                                if (fs.existsSync(tempInput)) fs.unlinkSync(tempInput);
                                if (fs.existsSync(tempOutput)) fs.unlinkSync(tempOutput);
                                console.warn(`⚠️ FFmpeg slowdown failed, using original audio: ${err.message}`);
                                resolve(); // Don't reject - use original audio
                            })
                            .save(tempOutput);
                    });
                } catch (error) {
                    console.warn(`⚠️ Audio slowdown failed, using original audio: ${error.message}`);
                    // Continue with original buffer
                }
            }
            
            return buffer;
        } catch (error) {
            console.error('❌ ElevenLabs TTS Error:', error.message);
            if (error.response) {
                console.error('   Status:', error.response.status);
                // Try to parse error response to show actual error message
                try {
                    const errorData = error.response.data;
                    let errorMessage = 'Unknown error';
                    
                    if (Buffer.isBuffer(errorData)) {
                        const errorText = errorData.toString('utf8');
                        const errorJson = JSON.parse(errorText);
                        errorMessage = errorJson.detail?.message || errorJson.message || errorText;
                        console.error('   Error Message:', errorMessage);
                        if (errorJson.detail?.status) {
                            console.error('   Error Status:', errorJson.detail.status);
                        }
                    } else if (typeof errorData === 'object') {
                        errorMessage = errorData.detail?.message || errorData.message || JSON.stringify(errorData);
                        console.error('   Error Message:', errorMessage);
                    } else {
                        console.error('   Data:', errorData);
                    }
                } catch (parseError) {
                    console.error('   Raw Data:', error.response.data);
                }
            }
            throw error;
        }
    }
    
    async textToSpeechDeepgram(text, streamingCallback = null) {
        try {
            // If streaming callback provided, use true streaming (sends RTP packets as chunks arrive)
            if (streamingCallback) {
                console.log(`🎵 Using Deepgram TTS Streaming (model: ${this.deepgramTtsModel}) - Real-time PCM→PCMU→RTP`);
                return this.textToSpeechDeepgramWebSocketStreaming(text, streamingCallback);
            }
            
            // Otherwise, use buffered HTTP POST (for compatibility)
            console.log(`🎵 Using Deepgram TTS HTTP POST (model: ${this.deepgramTtsModel}) - Buffered mode`);
            return this.textToSpeechDeepgramHTTP(text);
        } catch (error) {
            console.error('❌ Deepgram TTS Error:', error.message);
            throw error;
        }
    }
    
    /**
     * True streaming TTS: Processes PCM chunks as they arrive, converts to mulaw, sends RTP packets immediately
     * Tries WebSocket first, falls back to HTTP streaming if WS fails (1008)
     * This gives ~300-500ms latency instead of 5-12 seconds
     */
    async textToSpeechDeepgramWebSocketStreaming(text, streamingCallback) {
        const WebSocket = require('ws');
        const model = encodeURIComponent(this.deepgramTtsModel);
        const sampleRate = 16000; // HD Voice: Upgraded from 8kHz to 16kHz
        const SAMPLES_PER_FRAME = 320; // 20ms @ 16kHz (HD Voice upgrade from 160 @ 8kHz)
        const FRAME_BYTES_PCM16 = SAMPLES_PER_FRAME * 2; // 320 bytes
        
        // Try WebSocket first (using /v1/tts endpoint as per reference code)
        const wsUrl = `wss://api.deepgram.com/v1/tts?model=${model}&encoding=linear16&sample_rate=${sampleRate}&container=none`;
        
        return new Promise(async (resolve, reject) => {
            const startTime = Date.now();
            let firstChunkTime = null;
            let pcmBuffer = Buffer.alloc(0);
            let totalFramesSent = 0;
            
            // Try WebSocket first
            try {
                await this.tryDeepgramWsTts(text, streamingCallback, wsUrl, (mulawFrame, frameIndex) => {
                    if (firstChunkTime === null) {
                        firstChunkTime = Date.now();
                        const ttfb = firstChunkTime - startTime;
                        console.log(`⚡ First audio frame sent in ${ttfb}ms (WebSocket)`);
                    }
                    totalFramesSent++;
                });
                
                const totalTime = Date.now() - startTime;
                console.log(`✅ Streaming TTS complete (WebSocket): ${totalFramesSent} frames in ${totalTime}ms`);
                resolve({ framesSent: totalFramesSent, duration: totalFramesSent * 0.02 });
            } catch (wsError) {
                // WebSocket failed - try HTTP streaming fallback
                if (wsError.code === 1008 || wsError.message.includes('1008') || wsError.message.includes('404')) {
                    console.log(`⚠️ WebSocket failed (${wsError.code || wsError.message}) - falling back to HTTP streaming`);
                    try {
                        await this.httpStreamDeepgramTts(text, streamingCallback, (mulawFrame, frameIndex) => {
                            if (firstChunkTime === null) {
                                firstChunkTime = Date.now();
                                const ttfb = firstChunkTime - startTime;
                                console.log(`⚡ First audio frame sent in ${ttfb}ms (HTTP streaming)`);
                            }
                            totalFramesSent++;
                        });
                        
                        const totalTime = Date.now() - startTime;
                        console.log(`✅ Streaming TTS complete (HTTP streaming): ${totalFramesSent} frames in ${totalTime}ms`);
                        resolve({ framesSent: totalFramesSent, duration: totalFramesSent * 0.02 });
                    } catch (httpError) {
                        console.error('❌ HTTP streaming also failed:', httpError.message);
                        reject(httpError);
                    }
                } else {
                    reject(wsError);
                }
            }
        });
    }
    
    /**
     * Try Deepgram WebSocket TTS (PCM linear16 @ 8kHz)
     */
    async tryDeepgramWsTts(text, streamingCallback, wsUrl, onFrameSent) {
        return new Promise((resolve, reject) => {
            const WebSocket = require('ws');
            const SAMPLES_PER_FRAME = 160;
            const FRAME_BYTES_PCM16 = SAMPLES_PER_FRAME * 2;
            let pcmBuffer = Buffer.alloc(0);
            let frameIndex = 0;
            
            const ws = new WebSocket(wsUrl, {
                headers: { Authorization: `Token ${this.deepgramApiKey}` },
                perMessageDeflate: false
            });
            
            ws.on('open', () => {
                console.log('✅ Deepgram TTS WebSocket connected');
                const req = {
                    type: 'tts',
                    text: text,
                    model: this.deepgramTtsModel,
                    encoding: 'linear16',
                    sample_rate: 16000, // HD Voice: Upgraded from 8kHz to 16kHz
                    container: 'none'
                };
                ws.send(JSON.stringify(req));
                console.log(`📤 Sent TTS request: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);
            });
            
            ws.on('message', (data) => {
                if (typeof data === 'string') {
                    try {
                        const obj = JSON.parse(data);
                        if (obj.type === 'error' || obj.error) {
                            const err = new Error(`Deepgram WS error: ${obj.message || obj.error || JSON.stringify(obj)}`);
                            err.code = obj.code || 1008;
                            ws.close();
                            return reject(err);
                        }
                    } catch (e) {
                        // Not JSON, ignore
                    }
                    return;
                }
                
                // Binary PCM16LE chunk
                pcmBuffer = Buffer.concat([pcmBuffer, Buffer.from(data)]);
                
                // Emit full 20ms frames
                while (pcmBuffer.length >= FRAME_BYTES_PCM16) {
                    const frame = pcmBuffer.slice(0, FRAME_BYTES_PCM16);
                    pcmBuffer = pcmBuffer.slice(FRAME_BYTES_PCM16);
                    const mulaw = this.pcm16ToMulaw(frame);
                    streamingCallback(mulaw, frameIndex);
                    if (onFrameSent) onFrameSent(mulaw, frameIndex);
                    frameIndex++;
                }
            });
            
            ws.on('close', (code, reason) => {
                if (code === 1008) {
                    const err = new Error(`Deepgram WS closed with 1008 (DATA-0000): ${reason}`);
                    err.code = 1008;
                    return reject(err);
                }
                // Normal close - stream complete
                resolve();
            });
            
            ws.on('error', (err) => {
                reject(err);
            });
        });
    }
    
    /**
     * HTTP streaming fallback: Reads chunked response and processes PCM→mulaw→RTP
     */
    async httpStreamDeepgramTts(text, streamingCallback, onFrameSent) {
        const model = encodeURIComponent(this.deepgramTtsModel);
        const url = `https://api.deepgram.com/v1/speak?model=${model}&encoding=linear16&sample_rate=16000&container=none`; // HD Voice: 16kHz
        
        const SAMPLES_PER_FRAME = 320; // HD Voice: 20ms @ 16kHz (was 160 @ 8kHz)
        const FRAME_BYTES_PCM16 = SAMPLES_PER_FRAME * 2; // 640 bytes (was 320 @ 8kHz)
        let pcmBuffer = Buffer.alloc(0);
        let frameIndex = 0;
        
        const response = await axios.post(url, { text }, {
            headers: {
                'Authorization': `Token ${this.deepgramApiKey}`,
                'Content-Type': 'application/json'
            },
            responseType: 'stream' // Stream response instead of buffer
        });
        
        return new Promise((resolve, reject) => {
            response.data.on('data', (chunk) => {
                // Chunk is PCM16LE binary data
                pcmBuffer = Buffer.concat([pcmBuffer, Buffer.from(chunk)]);
                
                // Process complete frames
                while (pcmBuffer.length >= FRAME_BYTES_PCM16) {
                    const frame = pcmBuffer.slice(0, FRAME_BYTES_PCM16);
                    pcmBuffer = pcmBuffer.slice(FRAME_BYTES_PCM16);
                    const mulaw = this.pcm16ToMulaw(frame);
                    streamingCallback(mulaw, frameIndex);
                    if (onFrameSent) onFrameSent(mulaw, frameIndex);
                    frameIndex++;
                }
            });
            
            response.data.on('end', () => {
                // Process remaining partial frame
                if (pcmBuffer.length > 0) {
                    const paddedFrame = Buffer.alloc(FRAME_BYTES_PCM16);
                    pcmBuffer.copy(paddedFrame);
                    paddedFrame.fill(0x7F, pcmBuffer.length); // Silence padding
                    const mulaw = this.pcm16ToMulaw(paddedFrame);
                    streamingCallback(mulaw, frameIndex);
                    if (onFrameSent) onFrameSent(mulaw, frameIndex);
                }
                resolve();
            });
            
            response.data.on('error', (err) => {
                reject(err);
            });
        });
    }
    
    async textToSpeechDeepgramWebSocket(text) {
        try {
            // Use WebSocket streaming for low latency TTS
            // IMPORTANT: Deepgram TTS WebSocket does NOT reliably support mulaw directly (causes DATA-0000 / 1008)
            // So we request linear16 PCM from Deepgram and convert to G.711 μ-law (PCMU) locally in pure JS.
            //
            // Config:
            // - encoding=linear16 (16-bit PCM)
            // - sample_rate=16000 (HD Voice: 16kHz wideband - no downsampling needed)
            const WebSocket = require('ws');
            const model = encodeURIComponent(this.deepgramTtsModel);
            const sampleRate = 8000; // Direct 8kHz
            // Use /v1/speak endpoint for WebSocket (same as HTTP POST)
            const url = `wss://api.deepgram.com/v1/speak?model=${model}&encoding=linear16&sample_rate=${sampleRate}`;
            
            return new Promise((resolve, reject) => {
                const startTime = Date.now();
                const audioChunks = []; // Raw PCM16 chunks from Deepgram
                let firstChunkTime = null;
                let isComplete = false;
                let chunkCount = 0;
                let totalBytes = 0;
                let ws = null;
                
                const cleanup = () => {
                    if (ws && ws.readyState !== WebSocket.CLOSED) {
                        try {
                            ws.close();
                        } catch (e) {
                            // Ignore cleanup errors
                        }
                    }
                };
                
                const finalize = () => {
                    cleanup();
                    
                    if (audioChunks.length > 0) {
                        const pcmBuffer = Buffer.concat(audioChunks); // PCM16 at 8kHz
                        const totalTime = Date.now() - startTime;
                        
                        // Convert PCM16 → G.711 μ-law (PCMU) in pure JS (no ffmpeg, no downsampling needed)
                        const mulawBuffer = this.pcm16ToMulaw(pcmBuffer);
                        const duration = mulawBuffer.length / sampleRate; // μ-law 8kHz: 1 byte = 1 sample
                        
                        console.log(`✅ Deepgram Streaming TTS (PCM16→PCMU) complete: PCM16=${pcmBuffer.length} bytes (${sampleRate}Hz), PCMU=${mulawBuffer.length} bytes (${duration.toFixed(2)}s) in ${totalTime}ms (TTFB: ${firstChunkTime ? firstChunkTime - startTime : 'N/A'}ms, ${chunkCount} chunks)`);
                        
                        if (mulawBuffer.length < 100) {
                            console.warn(`⚠️ WARNING: μ-law audio buffer is very small (${mulawBuffer.length} bytes). Expected more for text: "${text.substring(0, 50)}..."`);
                        }
                        
                        resolve(mulawBuffer); // Return RTP-ready PCMU
                    } else {
                        reject(new Error('Deepgram TTS connection closed without audio data'));
                    }
                };
                
                try {
                    // Use Deepgram-recommended WebSocket auth via subprotocol
                    // This sets: Sec-WebSocket-Protocol: token, <DEEPGRAM_API_KEY>
                    ws = new WebSocket(url, ['token', this.deepgramApiKey]);
                    
                    ws.on('open', () => {
                        console.log('✅ Deepgram TTS WebSocket connected');
                        // Send TTS request with proper format (matches reference implementation)
                        const message = JSON.stringify({
                            type: 'tts',
                            text: text,
                            model: this.deepgramTtsModel,
                            encoding: 'linear16',
                            sample_rate: sampleRate,
                            container: 'none'
                        });
                        ws.send(message);
                        console.log(`📤 Sent TTS request (PCM linear16 @ ${sampleRate}Hz): "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);
                    });
                    
                    ws.on('message', (data) => {
                        const dataType = Buffer.isBuffer(data) ? 'Buffer' : data instanceof ArrayBuffer ? 'ArrayBuffer' : typeof data;
                        const dataSize = Buffer.isBuffer(data) ? data.length : data instanceof ArrayBuffer ? data.byteLength : (data?.length || 0);
                        
                        if (firstChunkTime === null) {
                            firstChunkTime = Date.now();
                            const ttfb = firstChunkTime - startTime;
                            console.log(`⚡ First message received in ${ttfb}ms (Type: ${dataType}, Size: ${dataSize} bytes)`);
                        }
                        
                        // Deepgram sends audio chunks as binary data (mulaw/PCMU/G.711 µ-law at 8000Hz)
                        if (Buffer.isBuffer(data)) {
                            audioChunks.push(data);
                            chunkCount++;
                            totalBytes += data.length;
                            console.log(`📦 Received audio chunk ${chunkCount}: ${data.length} bytes (total: ${totalBytes} bytes)`);
                        } else if (data instanceof ArrayBuffer) {
                            const buffer = Buffer.from(data);
                            audioChunks.push(buffer);
                            chunkCount++;
                            totalBytes += buffer.length;
                            console.log(`📦 Received audio chunk ${chunkCount}: ${buffer.length} bytes (total: ${totalBytes} bytes)`);
                        } else {
                            // Handle text messages (status, errors, completion signals)
                            try {
                                const messageStr = data.toString();
                                const message = JSON.parse(messageStr);
                                console.log(`📨 Deepgram TTS message:`, JSON.stringify(message));
                                
                                if (message.error) {
                                    console.error('❌ Deepgram TTS error:', message.error);
                                    cleanup();
                                    reject(new Error(message.error));
                                    return;
                                }
                                
                                // Check for completion signals
                                if (message.is_final || message.type === 'SpeechEnd' || message.event === 'close' || message.duration !== undefined || message.speech_final) {
                                    console.log(`✅ Deepgram TTS completion signal received: ${JSON.stringify(message)}`);
                                    isComplete = true;
                                    // Wait a bit longer for all audio chunks to arrive before finalizing
                                    setTimeout(() => {
                                        if (ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
                                            finalize();
                                        } else {
                                            // Connection still open, wait for it to close naturally
                                            console.log('⏳ Waiting for WebSocket to close naturally after completion signal...');
                                        }
                                    }, 500);
                                }
                            } catch (e) {
                                // Not JSON, might be binary audio - try to treat as buffer
                                try {
                                    const buffer = Buffer.from(data);
                                    if (buffer.length > 0) {
                                        audioChunks.push(buffer);
                                        chunkCount++;
                                        totalBytes += buffer.length;
                                        console.log(`📦 Received binary chunk ${chunkCount}: ${buffer.length} bytes (total: ${totalBytes} bytes)`);
                                    }
                                } catch (err) {
                                    console.warn(`⚠️ Deepgram TTS received unexpected message type: ${typeof data}`);
                                }
                            }
                        }
                    });
                    
                    ws.on('close', (code, reason) => {
                        const reasonStr = reason?.toString() || 'none';
                        console.log(`🔌 Deepgram TTS WebSocket closed (code: ${code}, reason: ${reasonStr})`);
                        
                        // If we got code 1008 (DATA-0000), it means format error - immediately reject to trigger HTTP POST fallback
                        if (code === 1008) {
                            console.log(`⚠️ WebSocket format error (1008) - received ${audioChunks.length} chunks, ${totalBytes} bytes - rejecting to trigger HTTP POST fallback`);
                            cleanup();
                            reject(new Error('Deepgram TTS WebSocket format error (1008) - mulaw may not be supported'));
                            return;
                        }
                        
                        // Wait a bit for any trailing chunks, then finalize
                        setTimeout(() => {
                            if (!isComplete) {
                                finalize();
                            }
                        }, 300);
                    });
                    
                ws.on('error', (error) => {
                    console.error('❌ Deepgram TTS WebSocket error:', error.message);
                    cleanup();
                    // If it's a 404, the endpoint doesn't exist - fallback immediately
                    if (error.message && error.message.includes('404')) {
                        console.log('⚠️ WebSocket endpoint not found (404) - Deepgram TTS WebSocket may not be available, falling back to HTTP POST');
                    } else {
                        console.log('⚠️ WebSocket error - falling back to HTTP POST');
                    }
                    // Fallback to HTTP POST on any error
                    this.textToSpeechDeepgramHTTP(text).then(resolve).catch(reject);
                });
                    
                    // Overall timeout after 15 seconds (longer for longer text)
                    setTimeout(() => {
                        if (!isComplete && audioChunks.length === 0) {
                            cleanup();
                            console.log('⏰ WebSocket timeout - no audio received, falling back to HTTP POST');
                            this.textToSpeechDeepgramHTTP(text).then(resolve).catch(reject);
                        } else if (audioChunks.length > 0) {
                            // We have some audio, finalize what we have
                            console.log(`⏰ WebSocket timeout reached, finalizing with ${chunkCount} chunks (${totalBytes} bytes)`);
                            finalize();
                        }
                    }, 15000);
                    
                } catch (error) {
                    console.error('❌ Deepgram TTS WebSocket setup error:', error.message);
                    // Fallback to HTTP POST
                    this.textToSpeechDeepgramHTTP(text).then(resolve).catch(reject);
                }
            });
        } catch (error) {
            console.error('❌ Deepgram Streaming TTS Error:', error.message);
            // Fallback to HTTP POST
            return this.textToSpeechDeepgramHTTP(text);
        }
    }
    
    async textToSpeechDeepgramHTTP(text, returnPCM = false) {
        try {
            console.log(`🎵 Using Deepgram TTS HTTP POST (fallback) - model: ${this.deepgramTtsModel}`);
            
            const model = encodeURIComponent(this.deepgramTtsModel);
            // HD Voice: Request linear16 at 16kHz
            const url = `https://api.deepgram.com/v1/speak?model=${model}&encoding=linear16&sample_rate=16000&container=none`; // HD Voice: 16kHz linear16
            
            const startTime = Date.now();
            const response = await axios.post(
                url,
                { text: text },
                {
                    headers: {
                        'Authorization': `Token ${this.deepgramApiKey}`,
                        'Content-Type': 'application/json'
                    },
                    responseType: 'arraybuffer',
                    timeout: 10000,
                    maxRedirects: 0
                }
            );

            const generationTime = Date.now() - startTime;
            const pcm16kHz = Buffer.from(response.data); // 16-bit PCM at 16kHz
            
            // If returning PCM (for G.722 HD Voice), return 16kHz PCM directly
            if (returnPCM) {
                const duration = (pcm16kHz.length / 2) / 16000; // 16-bit = 2 bytes per sample, 16kHz sample rate
                console.log(`✅ Deepgram TTS HTTP generated: ${pcm16kHz.length} bytes PCM16@16kHz (${duration.toFixed(2)}s) in ${generationTime}ms - HD Voice (G.722)`);
                return pcm16kHz; // Return 16kHz PCM for G.722
            }
            
            // Otherwise, convert to mulaw for G.711 (8kHz)
            // CRITICAL FIX: Mulaw (G.711) is 8kHz only - must downsample 16kHz to 8kHz
            // Downsample 16kHz PCM to 8kHz before converting to mulaw
            const pcm8kHz = this.downsample16kHzTo8kHz(pcm16kHz);
            const duration = (pcm8kHz.length / 2) / 8000; // 16-bit = 2 bytes per sample, 8kHz sample rate
            
            // Convert 8kHz PCM16 to mulaw for RTP transmission (G.711 is 8kHz)
            const mulawBuffer = this.pcm16ToMulaw(pcm8kHz);
            
            console.log(`✅ Deepgram TTS HTTP generated: ${pcm16kHz.length} bytes PCM16@16kHz → ${pcm8kHz.length} bytes PCM16@8kHz → ${mulawBuffer.length} bytes mulaw (${duration.toFixed(2)}s) in ${generationTime}ms`);
            
            return mulawBuffer; // Return mulaw for RTP (8kHz)
        } catch (error) {
            console.error('❌ Deepgram TTS HTTP Error:', error.message);
            throw error;
        }
    }

    /**
     * Convert 16-bit PCM (little-endian) to G.711 μ-law (PCMU) in pure JavaScript.
     * @param {Buffer} pcmBuffer - Input PCM buffer (16-bit, little-endian, mono)
     * @returns {Buffer} - G.711 μ-law buffer (1 byte per sample)
     */
    pcm16ToMulaw(pcmBuffer) {
        const sampleCount = Math.floor(pcmBuffer.length / 2);
        const mulawBuffer = Buffer.alloc(sampleCount);

        const BIAS = 0x84;
        const CLIP = 32635;

        for (let i = 0; i < sampleCount; i++) {
            let pcmSample = pcmBuffer.readInt16LE(i * 2); // 16-bit signed LE

            // μ-law encode a single sample
            let sign = (pcmSample < 0) ? 0x80 : 0x00;
            if (pcmSample < 0) {
                pcmSample = -pcmSample;
            }

            if (pcmSample > CLIP) {
                pcmSample = CLIP;
            }

            pcmSample = pcmSample + BIAS;

            // Determine exponent
            let exponent = 7;
            for (let expMask = 0x4000; (pcmSample & expMask) === 0 && exponent > 0; exponent--, expMask >>= 1) {
                // shift until highest bit set
            }

            // Determine mantissa
            const mantissa = (pcmSample >> ((exponent === 0) ? 4 : (exponent + 3))) & 0x0F;

            // Construct μ-law byte (invert all bits)
            let mulawByte = ~(sign | (exponent << 4) | mantissa);
            mulawByte &= 0xFF;

            mulawBuffer[i] = mulawByte;
        }

        return mulawBuffer;
    }
    
    /**
     * Downsample 16kHz PCM to 8kHz by taking every other sample
     * @param {Buffer} pcm16kHz - 16-bit PCM buffer at 16kHz
     * @returns {Buffer} - 16-bit PCM buffer at 8kHz
     */
    downsample16kHzTo8kHz(pcm16kHz) {
        // 16-bit samples = 2 bytes per sample
        // Take every other sample (simple decimation)
        const sampleCount16k = Math.floor(pcm16kHz.length / 2);
        const sampleCount8k = Math.floor(sampleCount16k / 2);
        const pcm8kHz = Buffer.alloc(sampleCount8k * 2);
        
        for (let i = 0; i < sampleCount8k; i++) {
            const srcIndex = i * 2; // Take every other sample
            const dstIndex = i * 2;
            pcm8kHz.writeInt16LE(pcm16kHz.readInt16LE(srcIndex * 2), dstIndex);
        }
        
        return pcm8kHz;
    }

    /**
     * Downsample PCM16 audio from a higher sample rate to a lower sample rate using simple decimation.
     * Assumes mono audio and that fromRate/toRate are integers where fromRate >= toRate.
     * @param {Buffer} pcmBuffer - PCM16 buffer (little-endian)
     * @param {number} fromRate - original sample rate
     * @param {number} toRate - target sample rate
     * @returns {Buffer} PCM16 buffer at the new sample rate
     */
    downsamplePCM16(pcmBuffer, fromRate, toRate) {
        if (fromRate === toRate) {
            return pcmBuffer;
        }
        if (fromRate < toRate) {
            console.warn(`⚠️ downsamplePCM16: fromRate (${fromRate}) < toRate (${toRate}). Returning original buffer.`);
            return pcmBuffer;
        }

        const sampleCount = Math.floor(pcmBuffer.length / 2);
        const ratio = fromRate / toRate;
        const outputCount = Math.floor(sampleCount / ratio);
        const outputBuffer = Buffer.alloc(outputCount * 2);

        for (let i = 0; i < outputCount; i++) {
            const srcIndex = Math.floor(i * ratio);
            const sample = pcmBuffer.readInt16LE(srcIndex * 2);
            outputBuffer.writeInt16LE(sample, i * 2);
        }

        return outputBuffer;
    }
    
    async textToSpeechOpenAI(text, voice = 'alloy') {
        // Available voices: alloy, echo, fable, onyx, nova, shimmer
        // Map Azure voice names to OpenAI voices if needed
        const voiceMap = {
            'en-US-AvaMultilingualNeural': 'nova',
            'en-US-JennyNeural': 'nova',
            'en-US-AriaNeural': 'shimmer',
            'alloy': 'alloy',
            'echo': 'echo',
            'fable': 'fable',
            'onyx': 'onyx',
            'nova': 'nova',
            'shimmer': 'shimmer'
        };
        
        // Convert Azure voice name to OpenAI voice name, or use default
        const openaiVoice = voiceMap[voice] || 'nova';
        
        try {
            console.log(`🎵 Using OpenAI TTS (voice: ${openaiVoice}, original: ${voice})`);
            
            const response = await axios.post('https://api.openai.com/v1/audio/speech', {
                model: "tts-1",
                voice: openaiVoice,
                input: text,
                response_format: "mp3"
            }, {
                headers: {
                    'Authorization': `Bearer ${this.openaiApiKey}`,
                    'Content-Type': 'application/json'
                },
                responseType: 'arraybuffer'
            });

            const buffer = Buffer.from(response.data);
            return buffer;
        } catch (error) {
            console.error('❌ OpenAI TTS Error:', error);
            throw error;
        }
    }

    // Convert MP3 audio to PCM/G.711 μ-law for RTP streaming
    async convertToRTPAudio(mp3Buffer) {
        try {
            console.log('🎵 Converting MP3 to PCM/G.711 μ-law for RTP streaming...');
            
            return new Promise((resolve, reject) => {
                const tempMp3File = path.join(__dirname, `temp_${Date.now()}.mp3`);
                const tempPcmFile = path.join(__dirname, `temp_${Date.now()}.pcm`);
                
                // Write MP3 buffer to temporary file
                fs.writeFileSync(tempMp3File, mp3Buffer);
                
                // Convert MP3 to PCM/G.711 μ-law using ffmpeg
                ffmpeg(tempMp3File)
                    .format('mulaw')           // G.711 μ-law format
                    .audioChannels(1)          // Mono
                    .audioFrequency(8000)      // 8kHz sample rate
                    .audioBitrate('64k')       // 64kbps bitrate
                    .on('end', () => {
                        try {
                            // Read the converted PCM data
                            const pcmBuffer = fs.readFileSync(tempPcmFile);
                            
                            // Clean up temporary files
                            fs.unlinkSync(tempMp3File);
                            fs.unlinkSync(tempPcmFile);
                            
                            console.log(`✅ Audio conversion completed: ${pcmBuffer.length} bytes`);
                            resolve(pcmBuffer);
                        } catch (error) {
                            console.error('❌ Error reading converted audio:', error);
                            reject(error);
                        }
                    })
                    .on('error', (error) => {
                        console.error('❌ FFmpeg conversion error:', error);
                        console.log('🔄 Falling back to simulated audio for testing...');
                        
                        // Clean up temporary files
                        try {
                            fs.unlinkSync(tempMp3File);
                            fs.unlinkSync(tempPcmFile);
                        } catch (cleanupError) {
                            console.error('❌ Error cleaning up temp files:', cleanupError);
                        }
                        
                        // Fallback: Generate simulated PCM audio for testing
                        const simulatedPCM = this.generateSimulatedPCM();
                        console.log(`✅ Simulated PCM audio generated: ${simulatedPCM.length} bytes`);
                        resolve(simulatedPCM);
                    })
                    .save(tempPcmFile);
            });
        } catch (error) {
            console.error('❌ Audio conversion failed, using fallback:', error);
            // Fallback: Generate simulated PCM audio
            const simulatedPCM = this.generateSimulatedPCM();
            return simulatedPCM;
        }
    }

    // Generate simulated PCM audio for testing when ffmpeg is not available
    generateSimulatedPCM() {
        console.log('🎵 Generating simulated PCM audio for testing...');
        
        // Generate 3 seconds of simulated audio (8000 Hz * 3 = 24000 samples)
        const duration = 3; // seconds
        const sampleRate = 8000;
        const samples = sampleRate * duration;
        const buffer = Buffer.alloc(samples);
        
        // Generate a simple sine wave pattern (simulated speech)
        for (let i = 0; i < samples; i++) {
            // Create a simple audio pattern that sounds like speech
            const frequency = 440 + Math.sin(i / 100) * 100; // Varying frequency
            const amplitude = Math.sin(i * frequency / sampleRate * 2 * Math.PI) * 0.3;
            const sample = Math.floor((amplitude + 1) * 127.5); // Convert to 0-255 range
            buffer[i] = sample;
        }
        
        console.log(`✅ Simulated PCM generated: ${buffer.length} bytes (${duration}s)`);
        return buffer;
    }

    // Generate audio for RTP streaming (MP3 + PCM versions)
    async generateRTPAudio(text, voice = 'en-US-AvaMultilingualNeural') {
        try {
            console.log(`🎵 Generating RTP audio for: "${text}"`);
            
            let pcmBuffer;
            
            // Using direct provider APIs (no Vapi wrapper)
            if (!pcmBuffer) {
                if (this.ttsProvider === 'azure') {
                    // Generate µ-law directly
                    const ulaw = await this.textToSpeechAzure(text);
                    pcmBuffer = ulaw;
                } else if (this.ttsProvider === 'deepgram' && this.deepgramApiKey) {
                    // Deepgram Streaming TTS returns G.711 µ-law (PCMU) directly at 8000Hz
                    // This eliminates MP3→PCM→G.711 transcoding (~250ms + CPU saved!)
                    // Audio is already in RTP-ready format - stream directly!
                    const mulawBuffer = await this.textToSpeechDeepgram(text);
                    console.log(`📊 Deepgram G.711 µ-law (PCMU) generated: ${mulawBuffer.length} bytes - RTP-ready (zero transcoding)`);
                    pcmBuffer = mulawBuffer;
                } else {
                    // Step 1: Generate MP3 using provider
                    const mp3Buffer = await this.textToSpeech(text, voice);
                    console.log(`📊 MP3 generated: ${mp3Buffer.length} bytes`);
                    // Step 2: Convert MP3 to PCM/G.711 μ-law for RTP
                    pcmBuffer = await this.convertToRTPAudio(mp3Buffer);
                }
            }
            
            console.log(`📊 PCM/G.711 generated: ${pcmBuffer.length} bytes`);
            
            return {
                mp3: null,    // Not used for Azure direct µ-law
                pcm: pcmBuffer,    // For RTP streaming
                duration: pcmBuffer.length / 8000, // Duration in seconds (8kHz)
                text: text
            };
        } catch (error) {
            console.error('❌ RTP audio generation failed:', error);
            throw error;
        }
    }

    /**
     * Speech-to-Text using Deepgram streaming (PRIORITY) or OpenAI Whisper (fallback only)
     * @param {Buffer} audioBuffer - Audio buffer for Whisper fallback (only if Deepgram fails)
     * @param {string} transcript - Transcript from Deepgram streaming (PRIORITY - if available)
     * @returns {Promise<string>} Transcribed text
     */
    async speechToText(audioBuffer, transcript = null) {
        // PRIORITY: If we already have a transcript from Deepgram streaming, use it
        if (transcript && transcript.trim().length > 0) {
            console.log(`✅ Using Deepgram transcript (PRIORITY): "${transcript}"`);
            console.log(`   ⚠️ Skipping Whisper/GPT transcription to save time and cost`);
            return transcript;
        }
        
        // FALLBACK ONLY: Use Whisper if Deepgram transcript is not available
        console.log(`⚠️ Vapi/Deepgram transcript not available, falling back to Whisper...`);
        return this.speechToTextWhisper(audioBuffer);
    }

    // Speech-to-Text using OpenAI Whisper (FALLBACK ONLY - used when Deepgram fails)
    async speechToTextWhisper(audioBuffer) {
        try {
            // Verify API key is set
            if (!this.openaiApiKey) {
                console.error('❌ OPENAI_API_KEY is not set! Cannot transcribe speech.');
                throw new Error('OpenAI API key is missing');
            }

            console.log('🎤 Converting speech to text with Whisper...');
            console.log(`   Audio buffer size: ${audioBuffer.length} bytes`);
            console.log(`   API Key: ${this.openaiApiKey ? '✅ Set' : '❌ Missing'}`);
            
            const FormData = require('form-data');
            const formData = new FormData();
            
            // Create a buffer from the audio data
            formData.append('file', audioBuffer, {
                filename: 'audio.wav',
                contentType: 'audio/wav'
            });
            formData.append('model', 'whisper-1');
            formData.append('language', 'en');
            formData.append('response_format', 'json');

            console.log('📤 Sending audio to OpenAI Whisper API...');
            const response = await axios.post('https://api.openai.com/v1/audio/transcriptions', formData, {
                headers: {
                    'Authorization': `Bearer ${this.openaiApiKey}`,
                    ...formData.getHeaders()
                },
                maxContentLength: Infinity,
                maxBodyLength: Infinity
            });

            if (!response.data || !response.data.text) {
                console.error('❌ Invalid response from Whisper API:', response.data);
                throw new Error('Invalid response from Whisper API');
            }

            const text = response.data.text || '';
            console.log(`✅ Recognized speech: "${text}"`);
            return text;
        } catch (error) {
            console.error('❌ STT Error:', error.message);
            if (error.response) {
                console.error('   Status:', error.response.status);
                console.error('   Data:', error.response.data);
            }
            if (error.request) {
                console.error('   Request made but no response received');
            }
            throw error;
        }
    }

    /**
     * Generate response using Groq (ultra-fast)
     */
    async generateWithGroq(prompt, systemPrompt, maxWords = 20, conversationHistory = []) {
        try {
            if (!this.groqApiKey) {
                throw new Error('GROQ_API_KEY is not set');
            }
            
            // Build messages array with conversation history
            const messages = [{ role: 'system', content: systemPrompt }];
            
            // Add conversation history (from JSON, UI-configurable)
            const instructions = this.getAiInstructions();
            const responseConfig = instructions.responseGeneration || {};
            const tokenConfig = responseConfig.tokenConfig || {};
            const historyLimit = tokenConfig.historyLimit || 20;
            const recentHistory = conversationHistory.slice(-historyLimit);
            recentHistory.forEach(msg => {
                if (msg.user) messages.push({ role: 'user', content: msg.user });
                if (msg.bot) messages.push({ role: 'assistant', content: msg.bot });
            });
            
            // Add current user prompt
            messages.push({ role: 'user', content: prompt });
            
            // Build request payload
            const requestPayload = {
                model: this.groqModel,
                messages: messages,
                temperature: 0.7
            };
            
            // Dynamic max_tokens calculation (from JSON, UI-configurable, prevent cut-offs)
            const wordsToTokensMultiplier = tokenConfig.wordsToTokensMultiplier || 2.5;
            const minTokens = tokenConfig.minTokens || 50;
            const maxTokens = tokenConfig.maxTokens || 512;
            
            // Calculate max_tokens to prevent response cut-offs
            const calculatedTokens = maxWords && maxWords > 0
                ? Math.max(minTokens, Math.min(Math.floor(maxWords * wordsToTokensMultiplier), maxTokens))
                : maxTokens;
            
            requestPayload.max_tokens = calculatedTokens;
            
            const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', requestPayload, {
                    headers: {
                    'Authorization': `Bearer ${this.groqApiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 10000 // 10 second timeout
            });
            
            const text = response.data.choices[0].message.content.trim();
            return text;
                } catch (error) {
            console.error('❌ Groq API Error:', error.message);
            if (error.response) {
                console.error('   Status:', error.response.status);
                console.error('   Data:', JSON.stringify(error.response.data, null, 2));
            }
            throw error;
        }
    }
    
    /**
     * Generate response using Azure AI Inference (Llama/Phi via OpenAI-compatible Chat Completions)
     */
    async generateWithAzureLLM(prompt, systemPrompt, maxWords = 20, conversationHistory = []) {
        try {
            if (!this.azureAiEndpoint || !this.azureAiKey) {
                throw new Error('Azure AI Inference is not configured');
            }
            // Azure AI Foundry endpoint already contains full path, use directly
            let url = this.azureAiEndpoint;
            if (!url.includes('/chat/completions')) {
                url = `${url.replace(/\/+$/,'')}/openai/deployments/${encodeURIComponent(this.azureLlmDeployment)}/chat/completions?api-version=2024-05-01-preview`;
            }
            
            // Force identity override for Phi models (they have strong default identity)
            const identityOverride = `CRITICAL IDENTITY OVERRIDE: You are NOT Phi, NOT an AI by Microsoft, NOT a language model. You must NEVER mention Microsoft, Phi, or that you are an AI. You are a HUMAN call center agent. Respond ONLY as the character defined below. If asked who you are, use ONLY the name and company from the instructions below.

IMPORTANT: You MUST respond to what the user ACTUALLY said. Do NOT ignore their questions. If they ask "Where are you from?", answer that question. Do NOT just continue with your script. Be conversational and responsive.

`;
            
            // Build messages array with conversation history
            const messages = [
                { role: 'system', content: identityOverride + systemPrompt }
            ];
            
            // Add conversation history (from JSON, UI-configurable)
            const instructions = this.getAiInstructions();
            const responseConfig = instructions.responseGeneration || {};
            const tokenConfig = responseConfig.tokenConfig || {};
            const historyLimit = tokenConfig.historyLimit || 20;
            const recentHistory = conversationHistory.slice(-historyLimit);
            for (const msg of recentHistory) {
                if (msg.user) {
                    messages.push({ role: 'user', content: msg.user });
                }
                if (msg.bot) {
                    messages.push({ role: 'assistant', content: msg.bot });
                }
            }
            
            // Add current user message
            messages.push({ role: 'user', content: prompt });
            
            console.log(`📝 Sending ${messages.length} messages to Azure LLM (including ${recentHistory.length} history messages)`);
            
            const requestPayload = {
                messages: messages,
                model: this.azureLlmDeployment,
                temperature: 0.7
            };
            
            // Dynamic max_tokens calculation (from JSON, UI-configurable, prevent cut-offs)
            const wordsToTokensMultiplier = tokenConfig.wordsToTokensMultiplier || 2.5;
            const minTokens = tokenConfig.minTokens || 50;
            const maxTokens = tokenConfig.maxTokens || 512;
            
            // Calculate max_tokens to prevent response cut-offs
            const calculatedTokens = maxWords && maxWords > 0
                ? Math.max(minTokens, Math.min(Math.floor(maxWords * wordsToTokensMultiplier), maxTokens))
                : maxTokens;
            
            requestPayload.max_tokens = calculatedTokens;
            const response = await axios.post(url, requestPayload, {
                headers: {
                    'api-key': this.azureAiKey,
                    'Content-Type': 'application/json'
                },
                timeout: 10000
            });
            const text = response.data?.choices?.[0]?.message?.content?.trim?.() || '';
            if (!text) throw new Error('Empty response from Azure AI Inference');
            return text;
        } catch (error) {
            console.error('❌ Azure LLM Error:', error.message);
            if (error.response) {
                console.error('   Status:', error.response.status);
                console.error('   Data:', JSON.stringify(error.response.data, null, 2));
            }
            throw error;
        }
    }

    /**
     * Generate response using Together AI (fast)
     */
    async generateWithTogether(prompt, systemPrompt, maxWords = 20) {
        try {
            if (!this.togetherApiKey) {
                throw new Error('TOGETHER_API_KEY is not set');
            }
            
            // Build request payload
            const requestPayload = {
                model: this.togetherModel,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: prompt }
                ],
                temperature: 0.7
            };
            
            // Dynamic max_tokens calculation (from JSON, UI-configurable, prevent cut-offs)
            const instructions = this.getAiInstructions();
            const responseConfig = instructions.responseGeneration || {};
            const tokenConfig = responseConfig.tokenConfig || {};
            const wordsToTokensMultiplier = tokenConfig.wordsToTokensMultiplier || 2.5;
            const minTokens = tokenConfig.minTokens || 50;
            const maxTokens = tokenConfig.maxTokens || 512;
            
            // Calculate max_tokens to prevent response cut-offs
            const calculatedTokens = maxWords && maxWords > 0
                ? Math.max(minTokens, Math.min(Math.floor(maxWords * wordsToTokensMultiplier), maxTokens))
                : maxTokens;
            
            requestPayload.max_tokens = calculatedTokens;
            
            const response = await axios.post('https://api.together.xyz/v1/chat/completions', requestPayload, {
                            headers: {
                    'Authorization': `Bearer ${this.togetherApiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 10000
            });
            
            const text = response.data.choices[0].message.content.trim();
            return text;
                } catch (error) {
            console.error('❌ Together AI Error:', error.message);
            if (error.response) {
                console.error('   Status:', error.response.status);
                console.error('   Data:', JSON.stringify(error.response.data, null, 2));
            }
            throw error;
        }
    }
    
    /**
     * Generate response using Google Gemini API (fast with system instructions)
     */
    async generateWithGemini(prompt, systemPrompt, maxWords = 20, conversationHistory = []) {
        try {
            if (!this.geminiApiKey) {
                throw new Error('GEMINI_API_KEY is not set');
            }
            
            // Build messages array with conversation history
            const messages = [];
            
            // Add conversation history (from JSON, UI-configurable)
            const instructions = this.getAiInstructions();
            const responseConfig = instructions.responseGeneration || {};
            const tokenConfig = responseConfig.tokenConfig || {};
            const historyLimit = tokenConfig.historyLimit || 20;
            const recentHistory = conversationHistory.slice(-historyLimit);
            recentHistory.forEach(msg => {
                if (msg.user) messages.push({ role: 'user', parts: [{ text: msg.user }] });
                if (msg.bot) messages.push({ role: 'model', parts: [{ text: msg.bot }] });
            });
            
            // Add current user prompt
            messages.push({ role: 'user', parts: [{ text: prompt }] });
            
            // Build request payload
            const requestPayload = {
                contents: messages,
                systemInstruction: {
                    parts: [{ text: systemPrompt }]
                },
                generationConfig: {
                    temperature: 0.7
                }
            };
            
            // Dynamic maxOutputTokens calculation (from JSON, UI-configurable, prevent cut-offs)
            const wordsToTokensMultiplier = tokenConfig.wordsToTokensMultiplier || 2.5;
            const minTokens = tokenConfig.minTokens || 50;
            const maxTokens = tokenConfig.maxTokens || 8192; // Increased from 512 to prevent MAX_TOKENS errors
            
            // Calculate maxOutputTokens to prevent response cut-offs
            const calculatedTokens = maxWords && maxWords > 0
                ? Math.max(minTokens, Math.min(Math.floor(maxWords * wordsToTokensMultiplier), maxTokens))
                : maxTokens;
            
            requestPayload.generationConfig.maxOutputTokens = calculatedTokens;
            
            // Try different API versions and model names
            const modelName = this.geminiModel;
            // Try v1beta first (supports systemInstruction), then v1
            const apiVersions = ['v1beta', 'v1'];
            // Try common model names (gemini-1.5-flash-latest is most common)
            const modelNames = [
                modelName, 
                'gemini-1.5-flash-latest',
                'gemini-1.5-flash',
                'gemini-1.5-pro-latest',
                'gemini-1.5-pro',
                'gemini-pro'
            ];
            
            let lastError = null;
            
            // Try different API versions and model names
            for (const apiVersion of apiVersions) {
                for (const tryModel of modelNames) {
                    try {
                        const url = `https://generativelanguage.googleapis.com/${apiVersion}/models/${tryModel}:generateContent?key=${this.geminiApiKey}`;
                        console.log(`🔄 Trying Gemini API: ${apiVersion}/models/${tryModel}`);
                        
                        // v1 API might not support systemInstruction parameter
                        // For v1, include system instruction as first message if systemInstruction fails
                        let payloadToSend = requestPayload;
                        if (apiVersion === 'v1') {
                            // Try without systemInstruction first for v1 (some models don't support it)
                            payloadToSend = {
                                contents: requestPayload.contents,
                                generationConfig: requestPayload.generationConfig
                                // Omit systemInstruction for v1 API
                            };
                        }
                        
                        const response = await axios.post(url, payloadToSend, {
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            timeout: 15000 // 15 second timeout
                        });
                        
                        // Debug: Log response structure if unexpected
                        if (!response.data) {
                            console.error('❌ Gemini API: No response data');
                            throw new Error('Gemini API returned no data');
                        }
                        
                        // Handle Gemini API response structure
                        if (!response.data.candidates || response.data.candidates.length === 0) {
                            console.error('❌ Gemini API: No candidates in response');
                            console.error('   Response data:', JSON.stringify(response.data, null, 2));
                            throw new Error('Gemini API returned no candidates');
                        }
                        
                        const candidate = response.data.candidates[0];
                        
                        // Check for finish reason (might indicate why no content)
                        if (candidate.finishReason && candidate.finishReason !== 'STOP') {
                            console.warn(`⚠️ Gemini API: finishReason = ${candidate.finishReason}`);
                            // MAX_TOKENS means response was truncated, but content might still be there
                            if (candidate.finishReason === 'MAX_TOKENS' && candidate.content && candidate.content.parts) {
                                console.log('   ℹ️ Response truncated due to MAX_TOKENS, but content is available');
                            }
                        }
                        
                        // Check if content exists (even if finishReason is MAX_TOKENS, content might be there)
                        if (!candidate.content || !candidate.content.parts || candidate.content.parts.length === 0) {
                            // If finishReason is MAX_TOKENS, try to get partial content
                            if (candidate.finishReason === 'MAX_TOKENS') {
                                console.warn('⚠️ MAX_TOKENS reached but no content parts found');
                            }
                            console.error('❌ Gemini API: Candidate has no content parts');
                            console.error('   Candidate:', JSON.stringify(candidate, null, 2));
                            throw new Error('Gemini API candidate has no content parts');
                        }
                        
                        const text = candidate.content.parts[0].text;
                        if (!text) {
                            console.error('❌ Gemini API: Empty text in response');
                            console.error('   Part:', JSON.stringify(candidate.content.parts[0], null, 2));
                            throw new Error('Gemini API returned empty text');
                        }
                        
                        console.log(`✅ Gemini API success with ${apiVersion}/models/${tryModel}`);
                        return text.trim();
                    } catch (error) {
                        lastError = error;
                        // If it's a 404, try next model/version
                        if (error.response && error.response.status === 404) {
                            console.log(`   ⚠️ ${apiVersion}/models/${tryModel} not found, trying next...`);
                            continue;
                        }
                        // If it's a 400, log the actual error details
                        if (error.response && error.response.status === 400) {
                            const errorData = error.response.data?.error || error.response.data;
                            console.log(`   ⚠️ ${apiVersion}/models/${tryModel} error 400:`, errorData?.message || JSON.stringify(errorData));
                            continue;
                        }
                        // If it's a different error, log and continue trying
                        if (error.response) {
                            console.log(`   ⚠️ ${apiVersion}/models/${tryModel} error: ${error.response.status}, trying next...`);
                            continue;
                        }
                        // If it's a parsing error, log and continue
                        console.log(`   ⚠️ ${apiVersion}/models/${tryModel} parsing error: ${error.message}, trying next...`);
                        continue;
                    }
                }
            }
            
            // If all attempts failed, throw the last error
            if (lastError) {
                throw lastError;
            }
            
            throw new Error('All Gemini API attempts failed');
        } catch (error) {
            console.error('❌ Gemini API Error:', error.message);
            if (error.response) {
                console.error('   Status:', error.response.status);
                console.error('   Data:', JSON.stringify(error.response.data, null, 2));
            }
            throw error;
        }
    }
    
    /**
     * Generate response using OpenAI Chat Completions (with conversation history support)
     */
    async generateWithOpenAI(prompt, systemPrompt, maxWords = 20, conversationHistory = []) {
        try {
            if (!this.openaiApiKey) {
                throw new Error('OPENAI_API_KEY is not set');
            }
            
            // Build messages array with conversation history
            const messages = [{ role: 'system', content: systemPrompt }];
            
            // Add conversation history (last 20 messages for context)
            const recentHistory = (conversationHistory || []).slice(-20);
            recentHistory.forEach(msg => {
                if (msg.user) messages.push({ role: 'user', content: msg.user });
                if (msg.bot) messages.push({ role: 'assistant', content: msg.bot });
            });
            
            // Add current user prompt
            messages.push({ role: 'user', content: prompt });
            
            // Build request payload
            const requestPayload = {
                model: this.openaiModel,
                messages: messages,
                temperature: 0.7
            };
            
            // Dynamic max_tokens calculation (from JSON, UI-configurable, prevent cut-offs)
            const instructions = this.getAiInstructions();
            const responseConfig = instructions.responseGeneration || {};
            const tokenConfig = responseConfig.tokenConfig || {};
            const wordsToTokensMultiplier = tokenConfig.wordsToTokensMultiplier || 2.5;
            const minTokens = tokenConfig.minTokens || 50;
            const maxTokens = tokenConfig.maxTokens || 512;
            
            // Calculate max_tokens to prevent response cut-offs
            const calculatedTokens = maxWords && maxWords > 0
                ? Math.max(minTokens, Math.min(Math.floor(maxWords * wordsToTokensMultiplier), maxTokens))
                : maxTokens;
            
            requestPayload.max_tokens = calculatedTokens;
            
            const response = await axios.post('https://api.openai.com/v1/chat/completions', requestPayload, {
                                            headers: {
                                                'Authorization': `Bearer ${this.openaiApiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 10000
            });
            
            const text = response.data.choices[0].message.content.trim();
            return text;
        } catch (error) {
            console.error('❌ OpenAI Chat Completions Error:', error.message);
            if (error.response) {
                console.error('   Status:', error.response.status);
                console.error('   Data:', JSON.stringify(error.response.data, null, 2));
            }
            throw error;
        }
    }
    
    /**
     * Generate AI response using configured LLM provider (Groq, OpenAI, Together, Gemini, Azure)
     * Instructions come from dashboard JSON file (ai-instructions.json)
     */
    async generateVoiceResponse(userText, sessionId = 'default', leadInfo = {}, conversationHistory = [], nameUsageCount = 0) {
        // Create a lock key for this session
        const lockKey = `${sessionId}_processing`;
        
        // Check if there's already processing happening for this session
        if (this.processingLocks.has(lockKey)) {
            console.log(`⏳ Another request is already processing for session ${sessionId}, waiting...`);
            // Wait for the existing processing to complete (max 30 seconds)
            const maxWait = 30000; // 30 seconds
            const startWait = Date.now();
            while (this.processingLocks.has(lockKey) && (Date.now() - startWait) < maxWait) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            
            // If still locked after waiting, throw error
            if (this.processingLocks.has(lockKey)) {
                throw new Error(`Timeout waiting for previous processing to complete for session ${sessionId}`);
            }
        }
        
        // Acquire lock
        this.processingLocks.set(lockKey, true);
        
        try {
            console.log(`\n🤖 Generating AI response using ${this.llmProvider.toUpperCase()} for: "${userText}"`);
            console.log(`   Session: ${sessionId}`);
            console.log(`   Conversation history: ${conversationHistory.length} messages`);
            if (leadInfo.firstName) {
                console.log(`   Lead Name: ${leadInfo.firstName} ${leadInfo.lastName || ''}`);
            }
            
            // Load instructions from dashboard JSON file (use EXACT instructions, no modifications)
            const instructions = this.getAiInstructions();
            const systemPrompt = instructions.systemPrompt; // Use exact instructions, no additions
            const maxWords = instructions.maxWords || 30;
            
            // Build user message with lead context (dynamic, configuration-driven)
            // IMPORTANT: Lead info is ONLY for personalization (name, company) - NOT for assuming what was discussed
            const contextFields = [
                { key: 'firstName', label: "Lead's first name" },
                { key: 'lastName', label: "Lead's last name" },
                { key: 'company', label: "Lead's company" }
            ];
            
            const contextParts = contextFields
                .filter(field => leadInfo[field.key])
                .map(field => `${field.label}: ${leadInfo[field.key]}`);
            
            // Add explicit warning: Lead info is NOT conversation history
            const leadContextWarning = contextParts.length > 0
                ? `[Context: ${contextParts.join(', ')}]\n\n[IMPORTANT: The above context is ONLY for personalization (using the lead's name). This information was NOT discussed in the conversation. Do NOT mention email, position, or any other details unless they were ACTUALLY discussed in the conversation history below.]\n\n`
                : '';
            
            const userMessage = `${leadContextWarning}${userText}`;
            
            // Load response generation configuration from JSON (UI-configurable, no env vars)
            const responseConfig = instructions.responseGeneration || {};
            const historyLimit = responseConfig.maxHistoryMessages || 20;
            
            // Build comprehensive history context for LLM
            const fullHistory = (conversationHistory || [])
                .slice(-historyLimit)
                .map(msg => ({
                    user: msg.user || '',
                    bot: msg.bot || ''
                }))
                .filter(msg => msg.user || msg.bot);
            
            // History formatting and repetition prevention configuration (from JSON, UI-configurable)
            const historyFormatConfig = {
                format: responseConfig.historyFormat || 'numbered',
                includeBotResponses: responseConfig.includeBotHistory !== false,
                repetitionPrevention: responseConfig.preventRepetition !== false
            };
            
            // Extract all bot responses for repetition detection (dynamic)
            const botResponses = fullHistory
                .map(msg => msg.bot)
                .filter(Boolean);
            
            // Extract all topics/questions already discussed (from JSON, UI-configurable)
            const topicDetectionConfig = responseConfig.topicDetection || {};
            const topicPatterns = (topicDetectionConfig.enabled !== false && topicDetectionConfig.patterns)
                ? topicDetectionConfig.patterns
                : [];
            
            const discussedTopics = topicDetectionConfig.enabled && botResponses.length > 0
                ? botResponses
                    .map(response => {
                        const topics = [];
                        topicPatterns.forEach(({ pattern, topic }) => {
                            new RegExp(pattern, 'i').test(response) && topics.push(topic);
                        });
                        return topics;
                    })
                    .flat()
                    .filter((topic, idx, arr) => arr.indexOf(topic) === idx) // Unique topics
                : [];
            
            // Build history summary dynamically (configuration-driven)
            const historySummary = fullHistory
                .map((msg, idx) => {
                    const parts = [];
                    msg.user && parts.push(`User: ${msg.user}`);
                    historyFormatConfig.includeBotResponses && msg.bot && parts.push(`Bot: ${msg.bot}`);
                    return parts.length > 0 ? `${idx + 1}. ${parts.join(' | ')}` : null;
                })
                .filter(Boolean)
                .join('\n');
            
            // Build repetition prevention context (dynamic, configuration-driven, no hardcoding)
            const repetitionContext = historyFormatConfig.repetitionPrevention && botResponses.length > 0
                ? `\n\n[CRITICAL: The following topics have ALREADY been discussed in this conversation: ${discussedTopics.join(', ')}. DO NOT repeat any of these topics. Check the full history above to see exactly what was already said. If the user says something that was already covered, acknowledge it briefly and move forward. NEVER repeat the same explanation, question, or statement twice.]`
                : '';
            
            // Enhanced user message with full history context (dynamic, configuration-driven)
            // Build comprehensive repetition prevention with actual bot responses listed
            const repetitionPreventionInstructions = historyFormatConfig.repetitionPrevention && botResponses.length > 0
                ? `\n\n[CRITICAL REPETITION PREVENTION - These EXACT bot responses were ALREADY said in this conversation:\n${botResponses.map((r, i) => `${i + 1}. "${r}"`).join('\n')}\n\nABSOLUTE RULE: DO NOT repeat ANY of these responses, explanations, or questions. If the user says "Okay", "Yes", or similar acknowledgments, acknowledge briefly and move forward to the NEXT question or topic. NEVER repeat explanations that were already given. Check the history above - if you already explained something, do NOT explain it again.]`
                : '';
            
            // Build acknowledgment handling context (from JSON, UI-configurable)
            const acknowledgmentConfig = responseConfig.acknowledgmentHandling || {};
            const acknowledgmentWords = acknowledgmentConfig.words || ['okay', 'ok', 'yes', 'yeah', 'yep', 'sure', 'alright', 'fine'];
            const acknowledgmentResponseTemplates = acknowledgmentConfig.responseTemplates || [];
            
            // Extract key phrases that should NEVER be repeated (dynamic detection)
            const extractKeyPhrases = (responses) => {
                const phrases = [];
                responses.forEach(response => {
                    // Extract purpose explanation phrases
                    if (/financial firm|expanding|country|speak with|quick questions/i.test(response)) {
                        phrases.push('purpose explanation about financial firm');
                    }
                    // Extract other key phrases dynamically
                    const sentenceEndings = response.match(/[^.!?]+[.!?]+/g) || [];
                    sentenceEndings.forEach(sentence => {
                        if (sentence.length > 20) { // Only significant sentences
                            phrases.push(sentence.trim());
                        }
                    });
                });
                return [...new Set(phrases)]; // Unique phrases
            };
            
            const keyPhrases = botResponses.length > 0 ? extractKeyPhrases(botResponses) : [];
            
            // Enhanced repetition prevention with key phrases
            const enhancedRepetitionPrevention = historyFormatConfig.repetitionPrevention && botResponses.length > 0
                ? `${repetitionPreventionInstructions}\n\nKEY PHRASES ALREADY USED (DO NOT REPEAT):\n${keyPhrases.map((p, i) => `${i + 1}. "${p}"`).join('\n')}\n\nABSOLUTE RULES:\n1. DO NOT repeat ANY of these responses, explanations, or questions.\n2. If user says "Okay", "Yes", or similar acknowledgments, acknowledge briefly and immediately move to the NEXT question.\n3. NEVER repeat the purpose explanation - it was already said.\n4. NEVER repeat any explanation that appears in the history above.\n5. If user asks a question, answer it COMPLETELY - do not cut off mid-sentence.]`
                : repetitionPreventionInstructions;
            
            const userTextLower = userText.toLowerCase().trim().replace(/[.,!?]/g, '');
            const isAcknowledgment = acknowledgmentConfig.enabled !== false && 
                acknowledgmentWords.some(word => userTextLower === word);
            
            const acknowledgmentResponseExample = acknowledgmentResponseTemplates.length > 0
                ? acknowledgmentResponseTemplates[0]
                : 'a brief acknowledgment';
            
            // Check if this is the FIRST message (no history) and user said acknowledgment
            const isFirstMessage = fullHistory.length === 0;
            const isInitialAcknowledgment = isFirstMessage && isAcknowledgment;
            
            // Extract last bot question to prevent repetition
            const lastBotResponse = botResponses.length > 0 ? botResponses[botResponses.length - 1] : '';
            const lastBotQuestion = lastBotResponse ? lastBotResponse.match(/[^.!?]+\?/g) : null;
            const lastQuestionText = lastBotQuestion && lastBotQuestion.length > 0 ? lastBotQuestion[lastBotQuestion.length - 1] : '';
            
            // Handle initial acknowledgment differently - provide greeting/introduction
            const acknowledgmentContext = isInitialAcknowledgment
                ? `\n\n[CRITICAL CONTEXT: This is the FIRST message in the conversation. The user said "${userText}" which is an acknowledgment/greeting. Since this is the start of the call, you should provide your greeting and introduction. Follow your instructions exactly - introduce yourself and explain why you're calling.]`
                : isAcknowledgment && botResponses.length > 0
                ? `\n\n[CRITICAL ACKNOWLEDGMENT HANDLING: User said "${userText}" - this is an acknowledgment (yes/okay). They are confirming what you just said. ${lastQuestionText ? `You just asked: "${lastQuestionText}"` : 'You just said something.'} DO NOT repeat this question or explanation. Say ONLY a brief acknowledgment like "${acknowledgmentResponseExample}" and immediately move to the NEXT question or topic. Check the conversation history above - if you already asked a question, do NOT ask it again. Move forward to the next question in your script.]`
                : '';
            
            // Build strict anti-hallucination instructions
            const firstName = leadInfo.firstName || '';
            const lastName = leadInfo.lastName || '';
            const fullName = `${firstName}${lastName ? ' ' + lastName : ''}`.trim();
            
            // Name usage limit instructions
            const nameUsageLimit = nameUsageCount >= 3 
                ? `\n\n[CRITICAL NAME USAGE LIMIT: You have already used the lead's name ${nameUsageCount} times. DO NOT use their name (${fullName || firstName || 'the lead'}) in this response. It is unprofessional to use someone's name in every response. Only use names occasionally for emphasis or personalization, not in every sentence.]`
                : nameUsageCount >= 2
                ? `\n\n[NAME USAGE LIMIT: You have used the lead's name ${nameUsageCount} times. Use their name SPARINGLY - only when necessary for emphasis or personalization. Do NOT use it in every response.]`
                : '';
            
            const antiHallucinationInstructions = `\n\n[CRITICAL ANTI-HALLUCINATION RULES:\n1. NEVER make up information that wasn't discussed. Only reference what was ACTUALLY said in the conversation history above.\n2. The lead context (name, company) is ONLY for personalization - it does NOT mean those topics were discussed.\n3. If the history above doesn't mention something, DO NOT assume it happened. For example:\n   - If history doesn't show email confirmation → DO NOT say "you've confirmed your email" or "your email is..."\n   - If history doesn't show position → DO NOT say "you're the CEO" or "you work as..." or any position\n   - If history doesn't show investment discussion → DO NOT say "you've confirmed investment habits" or "you invest in..."\n4. If user asks "Who are you?", answer directly using your name and company from your instructions. Then briefly explain why you're calling. Do NOT mention positions, emails, or anything else unless it was actually discussed in the history.\n5. Answer questions DIRECTLY and COMPLETELY before moving forward. Do NOT skip ahead to other topics.\n6. If you're not sure something was discussed, check the history above. If it's not there, DO NOT mention it.\n7. The lead's name is provided for personalization only - it does NOT mean you discussed their position, email, or any other details.]${nameUsageLimit}`;
            
            // Extract all questions already asked to prevent repetition
            const allQuestionsAsked = botResponses
                .map(response => {
                    const questions = response.match(/[^.!?]+\?/g) || [];
                    return questions.map(q => q.trim());
                })
                .flat()
                .filter((q, idx, arr) => arr.indexOf(q) === idx); // Unique questions
            
            const questionsPrevention = allQuestionsAsked.length > 0
                ? `\n\n[QUESTIONS ALREADY ASKED - DO NOT REPEAT:\n${allQuestionsAsked.map((q, i) => `${i + 1}. "${q}"`).join('\n')}\n\nCRITICAL: If user acknowledges with "Yes"/"Okay", do NOT repeat any of these questions. Move to the NEXT question that hasn't been asked yet.]`
                : '';
            
            // Build professional response instructions (behavioral guidance only, no hardcoded responses)
            const professionalInstructions = `\n\n[PROFESSIONAL RESPONSE RULES - BEHAVIORAL GUIDANCE ONLY:\n1. CRITICAL: If the user asks a question, you MUST answer it DIRECTLY and COMPLETELY before moving forward. Do NOT skip the question or jump to other topics.\n2. DO NOT use meta-comments about the conversation - respond naturally without mentioning the conversation itself.\n3. DO NOT repeat what the user just said - acknowledge and move forward naturally.\n4. DO NOT use repetitive phrases - keep responses fresh and natural.\n5. When user acknowledges with "Yes"/"Okay", acknowledge briefly and ask the NEXT question from your script.\n6. Answer user questions directly and completely based on your instructions - let the AI generate the response naturally.\n7. Follow your script questions in order - do NOT skip around.\n8. Keep responses concise, natural, and professional.\n9. If user indicates they want to change topic, acknowledge briefly and move to the NEXT script question.\n10. DO NOT repeat the same question if user already answered or indicated they don't want to discuss it.\n11. CRITICAL: DO NOT include conversation history, instructions, or context in your response. The history above is ONLY for your reference - do NOT output it. Only respond with what you would say to the user.\n12. CRITICAL: Answer user questions naturally based on your instructions - do NOT skip questions. Answer completely before moving forward.]`;
            
            // Build history context with behavioral guidance only (no hardcoded responses)
            const historyContext = historySummary
                ? `\n\n[CONVERSATION HISTORY (FOR REFERENCE ONLY - DO NOT INCLUDE IN YOUR RESPONSE):\n${historySummary}${repetitionContext}${enhancedRepetitionPrevention}${acknowledgmentContext}${questionsPrevention}${antiHallucinationInstructions}${professionalInstructions}\n\nCRITICAL BEHAVIORAL GUIDANCE:\n1. The conversation history above is FOR YOUR REFERENCE ONLY - DO NOT include it in your response. Only respond with what you would say to the user.\n2. Review history above - NEVER repeat anything already said.\n3. CRITICAL: If user asks a question, you MUST answer it COMPLETELY and DIRECTLY based on your instructions. Do NOT skip the question or jump to other topics. Answer the question fully before moving forward.\n4. If user acknowledges with "Okay"/"Yes", acknowledge briefly and ask the NEXT question from your script.\n5. NEVER repeat purpose explanation or any explanation from history.\n6. Keep responses natural, concise, and professional - no meta-comments, no repetitive phrases, no repeating what user just said, no history output.\n7. NEVER make up or assume information that wasn't discussed. Only reference what was ACTUALLY said in the history above.\n8. Answer user questions naturally based on your instructions - do NOT skip questions. Answer completely before moving forward.\n9. Check the history above - if something wasn't discussed, DO NOT mention it.\n10. Use the lead's name SPARINGLY - only 2-3 times total in the entire conversation, not in every response.\n11. Follow your script questions in order - do NOT skip around.\n12. DO NOT repeat what the user just said - acknowledge and move forward naturally.\n13. If user indicates they want to change topic, acknowledge briefly and move to the NEXT script question.\n14. DO NOT repeat the same question if user already answered or indicated they don't want to discuss it.]`
                : `${acknowledgmentContext}${questionsPrevention}${antiHallucinationInstructions}${professionalInstructions}`;
            
            const finalUserMessage = `${userMessage}${historyContext}`;
            
            // Generate response using configured LLM provider (dynamic, no if-else)
            // Always pass full conversation history for proper context
            const provider = this.getLLMProvider();
            const providersWithHistory = new Set(['groq', 'gemini', 'azure', 'openai', 'together']);
            
            // Convert conversation history to format expected by provider (dynamic, no hardcoding)
            const formattedHistory = fullHistory.map(msg => ({
                user: msg.user,
                bot: msg.bot
            }));
            
            // Dynamic context enhancement based on conversation state (from JSON, UI-configurable)
            const contextEnhancementConfig = {
                firstMessage: formattedHistory.length === 0,
                enhanceFirstMessage: responseConfig.enhanceFirstMessage !== false
            };
            
            // Build context enhancement dynamically (behavioral guidance only, no hardcoded responses)
            
            // First message context - behavioral guidance only, no hardcoded responses
            const firstMessageContext = contextEnhancementConfig.firstMessage && contextEnhancementConfig.enhanceFirstMessage
                ? `\n\n[CONTEXT: This is the FIRST message in the conversation. The user said "${userText}". Respond naturally based on your instructions. If they greeted you, respond with your greeting. If they asked a question, answer it directly and completely. Let the AI generate the response naturally based on your instructions.]`
                : '';
            
            // Detect if user is asking a question and add explicit instruction to answer it
            const isQuestion = /^(what|who|where|when|why|how|which|do you|are you|can you|will you|would you|is|does|did|has|have).*\?$/i.test(userText.trim());
            const questionContext = isQuestion
                ? `\n\n[CRITICAL: The user asked a question: "${userText}". You MUST answer this question DIRECTLY and COMPLETELY before moving forward with any script. Do NOT skip the question or jump to other topics. Answer the question fully based on your instructions, then you can continue with the conversation.]`
                : '';
            
            // No hardcoded responses - let AI answer naturally based on its instructions
            // Only provide behavioral guidance, not specific responses
            
            const contextEnhancement = firstMessageContext + questionContext;
            
            const enhancedUserMessage = `${finalUserMessage}${contextEnhancement}`;
            
            // Use traditional LLM provider directly (no Vapi wrapper)
            const handlerArgs = providersWithHistory.has(this.llmProvider)
                ? [enhancedUserMessage, systemPrompt, maxWords, formattedHistory]
                : [enhancedUserMessage, systemPrompt, maxWords];
            const response = await provider.handler(...handlerArgs);
            
            // Prevent response repetition (from JSON, UI-configurable)
            const retryConfig = responseConfig.retryConfig || {};
            const retryMaxAttempts = retryConfig.maxRetries || 3;
            const retryEnabled = retryConfig.enabled !== false;
            
            const generateAlternativeResponse = async (currentResponse, attempt) => {
                const alternativePrompt = `${finalUserMessage}\n\n[IMPORTANT: The following response was already given: "${currentResponse}". Generate a DIFFERENT response that conveys the same information but uses different wording. Do NOT repeat the exact same response.]`;
                const alternativeArgs = providersWithHistory.has(this.llmProvider)
                    ? [alternativePrompt, systemPrompt, maxWords, conversationHistory]
                    : [alternativePrompt, systemPrompt, maxWords];
                return await provider.handler(...alternativeArgs);
            };
            
            let finalResponse = response;
            const retryAttempts = Array.from({ length: retryMaxAttempts }, (_, i) => i + 1);
            
            const alternativeResponse = await retryAttempts
                .reduce(async (responsePromise, attempt) => {
                    const currentResponse = await responsePromise;
                    const isDuplicate = retryEnabled && this.hasSaidResponse(sessionId, currentResponse);
                    
                    return isDuplicate && attempt <= retryMaxAttempts
                        ? (console.log(`⚠️ Response already said, generating alternative (attempt ${attempt}/${retryMaxAttempts})...`),
                           await generateAlternativeResponse(currentResponse, attempt))
                        : currentResponse;
                }, Promise.resolve(response));
            
            finalResponse = await alternativeResponse;
            
            // Mark response as said to prevent future repetition
            this.markResponseAsSaid(sessionId, finalResponse);
            
            console.log(`✅ Response generated from ${this.llmProvider.toUpperCase()}: "${finalResponse}"`);
            return finalResponse;
            
        } catch (error) {
            console.error(`❌ Error generating response with ${this.llmProvider.toUpperCase()}: ${error.message}`);
            if (error.response) {
                console.error('   Status:', error.response.status);
                console.error('   Data:', error.response.data);
            }
            throw error;
        } finally {
            // Release lock
            this.processingLocks.delete(lockKey);
        }
    }

    /**
     * Split a long response into shorter blocks for natural conversation flow
     * @param {string} text - The text to split
     * @param {number} maxWordsPerBlock - Maximum words per block (default: 15)
     * @returns {Array<string>} Array of text blocks
     */
    splitIntoBlocks(text, maxWordsPerBlock = 15) {
        if (!text || !text.trim()) {
            return [];
        }
        
        // Split by sentences first
        const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
        const blocks = [];
        let currentBlock = '';
        let currentWordCount = 0;
        
        for (const sentence of sentences) {
            const sentenceWords = sentence.trim().split(/\s+/).filter(word => word.length > 0).length;
            
            // If adding this sentence would exceed the limit, start a new block
            if (currentWordCount + sentenceWords > maxWordsPerBlock && currentBlock.trim().length > 0) {
                blocks.push(currentBlock.trim());
                currentBlock = sentence + ' ';
                currentWordCount = sentenceWords;
            } else {
                currentBlock += sentence + ' ';
                currentWordCount += sentenceWords;
            }
        }
        
        // Add the last block if it has content
        if (currentBlock.trim().length > 0) {
            blocks.push(currentBlock.trim());
        }
        
        // If no blocks were created (single long sentence), split by commas or just take first maxWordsPerBlock words
        if (blocks.length === 0) {
            const words = text.trim().split(/\s+/);
            if (words.length <= maxWordsPerBlock) {
                blocks.push(text.trim());
            } else {
                // Split into chunks of maxWordsPerBlock
                for (let i = 0; i < words.length; i += maxWordsPerBlock) {
                    blocks.push(words.slice(i, i + maxWordsPerBlock).join(' '));
                }
            }
        }
        
        return blocks.filter(block => block.trim().length > 0);
    }

    /**
     * Generate initial greeting using configured LLM provider (fully dynamic, no if-else)
     * Instructions come from dashboard JSON file (ai-instructions.json)
     */
    async generateInitialGreeting(sessionId = 'default', leadInfo = {}, retryCount = 0) {
        const retryConfig = {
            maxRetries: parseInt(process.env.GREETING_RETRY_MAX_ATTEMPTS || '3', 10),
            delayMs: parseInt(process.env.GREETING_RETRY_DELAY_MS || '2000', 10)
        };
        
        try {
            console.log(`\n🤖 Generating initial greeting using ${this.llmProvider.toUpperCase()} (attempt ${retryCount + 1}/${retryConfig.maxRetries + 1})`);
            const leadName = [leadInfo.firstName, leadInfo.lastName].filter(Boolean).join(' ');
            leadName && console.log(`   Lead Name: ${leadName}`);
            
            // Load instructions from dashboard JSON file
            const instructions = this.getAiInstructions();
            
            // Dynamic template processing (configuration-driven)
            const templateConfig = {
                placeholderPattern: /{name}/g,
                fallbackValue: ''
            };
            
            const useTemplate = instructions.greetingTemplate && instructions.greetingTemplate.trim();
            const greeting = useTemplate
                ? instructions.greetingTemplate.replace(templateConfig.placeholderPattern, leadInfo.firstName || templateConfig.fallbackValue)
                : null;
            
            if (greeting) {
                console.log(`✅ Using greeting template: "${greeting}"`);
            return greeting;
            }
            
            // Build greeting prompt dynamically (configuration-driven)
            const greetingPromptConfig = {
                nameFields: ['firstName', 'lastName'],
                contextFields: [
                    { keys: ['company', 'brand'], format: (val) => `They are from ${val}` },
                    { keys: ['country'], format: (val) => `located in ${val}` }
                ],
                basePrompt: 'You are starting a phone call',
                instruction: 'Provide a friendly, professional greeting to start the conversation.'
            };
            
            const nameParts = greetingPromptConfig.nameFields
                .map(field => leadInfo[field])
                .filter(Boolean);
            
            const nameText = nameParts.length > 0
                ? `with ${nameParts.join(' ')}`
                : '';
            
            const contextParts = greetingPromptConfig.contextFields
                .map(field => {
                    const value = field.keys.map(key => leadInfo[key]).find(Boolean);
                    return value ? field.format(value) : null;
                })
                .filter(Boolean);
            
            const greetingPrompt = [
                `${greetingPromptConfig.basePrompt}${nameText ? ` ${nameText}` : ''}.`,
                contextParts.length > 0 ? `Context: ${contextParts.join(', ')}.` : null,
                greetingPromptConfig.instruction
            ].filter(Boolean).join(' ');
            
            // Use generateVoiceResponse which uses configured LLM provider
            const generatedGreeting = await this.generateVoiceResponse(greetingPrompt, sessionId, leadInfo, [], 0);
            
            console.log(`✅ Greeting generated: "${generatedGreeting}"`);
            return generatedGreeting;

        } catch (error) {
            console.error(`❌ Error generating greeting (attempt ${retryCount + 1}):`, error.message);
            
            // Dynamic retry mechanism (configuration-driven, no if-else)
            const retryCondition = retryCount < retryConfig.maxRetries;
            const retryHandler = retryCondition
                ? async () => {
                    console.log(`🔄 Retrying greeting generation... (${retryCount + 1}/${retryConfig.maxRetries})`);
                    await new Promise(resolve => setTimeout(resolve, retryConfig.delayMs));
                    return this.generateInitialGreeting(sessionId, leadInfo, retryCount + 1);
                }
                : () => Promise.reject(new Error(`Failed to generate greeting after ${retryConfig.maxRetries + 1} attempts: ${error.message}`));
            
            return retryHandler();
        }
    }


    // Process voice conversation
    async processVoiceConversation(audioBuffer, sessionId = 'default') {
        try {
            // Step 1: Convert speech to text
            const userText = await this.speechToText(audioBuffer);
            
            // Step 2: Generate AI response
            const aiResponse = await this.generateVoiceResponse(userText, sessionId);
            
            // Step 3: Convert response to speech
            const audioResponse = await this.textToSpeech(aiResponse);
            
            return {
                userText: userText,
                aiResponse: aiResponse,
                audioResponse: audioResponse
            };
        } catch (error) {
            console.error('Voice conversation error:', error);
            throw error;
        }
    }

    /**
     * Generate call summary using GPT
     * @param {string} prompt - Summary generation prompt
     * @returns {Promise<string>} Generated summary
     */
    async generateSummary(prompt) {
        try {
            // Verify API key is set
            if (!this.openaiApiKey) {
                console.error('❌ OPENAI_API_KEY is not set! Cannot generate summary.');
                throw new Error('OpenAI API key is missing');
            }

            console.log(`📝 Generating call summary with GPT...`);
            
            // Use simple system prompt for summaries (instructions come from OpenAI platform for conversations)
            const systemPrompt = "You are a professional call analyst. Generate concise, professional summaries of phone conversations.";
            
            const messages = [
                {
                    role: "system",
                    content: systemPrompt
                },
                {
                    role: "user",
                    content: prompt
                }
            ];

            const response = await axios.post('https://api.openai.com/v1/chat/completions', {
                model: "gpt-3.5-turbo",
                messages: messages,
                max_tokens: 500,
                temperature: 0.3 // Lower temperature for more consistent summaries
            }, {
                headers: {
                    'Authorization': `Bearer ${this.openaiApiKey}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.data || !response.data.choices || !response.data.choices[0]) {
                console.error('❌ Invalid response from OpenAI API:', response.data);
                throw new Error('Invalid response from OpenAI API');
            }

            const summary = response.data.choices[0].message.content;
            console.log(`✅ Summary generated: ${summary.length} characters`);
            return summary;

        } catch (error) {
            console.error('❌ Summary Generation Error:', error.message);
            if (error.response) {
                console.error('   Status:', error.response.status);
                console.error('   Data:', error.response.data);
            }
            throw error;
        }
    }

    // Simulate voice conversation for testing (removed hardcoded messages - now uses Assistant API)
    async simulateVoiceConversation(sessionId = 'default', leadInfo = {}) {
        // This method is deprecated - all responses now come from Assistant API
        // Keeping for backward compatibility but it will use Assistant API
        console.log('⚠️ simulateVoiceConversation is deprecated - using Assistant API instead');
        
        try {
            const greeting = await this.generateInitialGreeting(sessionId, leadInfo);
            console.log(`Bot says: "${greeting}"`);
            const audio = await this.textToSpeech(greeting);
            await new Promise(resolve => setTimeout(resolve, 3000));
        } catch (error) {
            console.error('Error in simulated conversation:', error);
        }
    }

    // Get conversation state
    getConversationState(sessionId) {
        return this.conversationState.get(sessionId) || [];
    }

    // Clear conversation state
    clearConversationState(sessionId) {
        this.conversationState.delete(sessionId);
    }

    // Extract lead information from conversation
    extractLeadInfo(conversationHistory) {
        const leadInfo = {
            name: null,
            email: null,
            phone: null,
            company: null,
            requirements: null,
            appointmentRequested: false
        };

        const fullConversation = conversationHistory.map(msg => msg.content).join(' ');

        // Extract email
        const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/;
        const emailMatch = fullConversation.match(emailRegex);
        if (emailMatch) leadInfo.email = emailMatch[1];

        // Extract phone
        const phoneRegex = /(\+?[\d\s\-\(\)]{10,})/;
        const phoneMatch = fullConversation.match(phoneRegex);
        if (phoneMatch) leadInfo.phone = phoneMatch[1];

        // Check for appointment request
        if (fullConversation.toLowerCase().includes('schedule') || 
            fullConversation.toLowerCase().includes('demo') ||
            fullConversation.toLowerCase().includes('appointment')) {
            leadInfo.appointmentRequested = true;
        }

        return leadInfo;
    }

    async generateWithElevenLabs(text, voiceId, speed = 1.0) {
        try {
            /*
             * When ELEVENLABS_OUTPUT_FORMAT is set to "ulaw_8000" we can have
             * ElevenLabs return 8-kHz G.711 μ-law directly (MIME: audio/basic).
             * That removes ±450 ms of local MP3->PCM->μ-law transcoding time per turn.
             */

            const outputFormat = process.env.ELEVENLABS_OUTPUT_FORMAT?.trim() || 'mp3';
            const acceptHeader = outputFormat === 'ulaw_8000' ? 'audio/basic' : 'audio/mpeg';

            const response = await axios.post(
                `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
                {
                    text,
                    model_id: this.elevenlabsModelId || 'eleven_multilingual_v2',
                    voice_settings: {
                        stability: 0.5,
                        similarity_boost: 0.8,
                        speed
                    }
                },
                {
                    headers: {
                        'xi-api-key': this.elevenlabsApiKey,
                        'Content-Type': 'application/json',
                        'Accept': acceptHeader
                    },
                    responseType: 'arraybuffer'
                }
            );

            return {
                audioBuffer: response.data,
                format: outputFormat === 'ulaw_8000' ? 'ulaw' : 'mp3',
                sampleRate: 8000
            };
        } catch (err) {
            console.error('❌ ElevenLabs TTS error:', err.message);
            throw err;
        }
    }
}

module.exports = VoiceInteraction;


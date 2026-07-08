const dgram = require('dgram');
const fs = require('fs');
const path = require('path');
const AudioCodec = require('./audioCodec');
const logger = require('./logger');

// Silence / VAD thresholds (for fallback/timeout scenarios)
const SILENCE_DURATION_MS = 800;    // user stopped speaking after 0.8s
const MAX_LISTEN_DURATION_MS = 5000;
const MIN_SPEECH_DURATION_MS = 200; // ignore very short noise

class AudioStreamManager {
    constructor(options = {}) {
        this.audioCodec = new AudioCodec({
            debugMode: options.debugMode || false,
            saveIntermediateFiles: options.saveIntermediateFiles || false
        });
        this.saveReceivedAudio = options.saveReceivedAudio || false;
        this.tempDir = path.join(__dirname, '../tmp');
        this.ensureTempDir();
        
        // RTP configuration - HD Voice: 16kHz wideband
        this.sampleRate = 16000; // Upgraded from 8kHz to 16kHz for HD Voice quality
        this.samplesPerPacket = 320; // 20ms at 16kHz (was 160 @ 8kHz)
        this.packetInterval = 20; // milliseconds
        
        // Track active RTP receivers by session ID (for stopping during TTS)
        this.activeReceivers = new Map(); // sessionId -> { udpSocket, deepgramStream, finishReceiving }
        
        // Track RTP sender sockets by session ID (for symmetric RTP - reuse receiver socket)
        this.activeSenders = new Map(); // sessionId -> { udpSocket, port }
    }

    ensureTempDir() {
        if (!fs.existsSync(this.tempDir)) {
            fs.mkdirSync(this.tempDir, { recursive: true });
        }
    }

    /**
     * Send audio stream to PBX RTP endpoint
     * @param {Buffer} audioData - G.711 μ-law audio data
     * @param {Object} rtpEndpoint - {host, port}
     * @param {Object} sessionInfo - Session information
     * @returns {Promise<void>}
     */
    async sendAudioStream(audioData, rtpEndpoint, sessionInfo = {}) {
        return new Promise((resolve, reject) => {
            try {
                // CRITICAL FIX: Use the port specified in sessionInfo.localPort (which should be the SDP-advertised port)
                // This ensures symmetric RTP - we send FROM the same port we receive ON
                const localPort = sessionInfo.localPort || sessionInfo.rtpSendPort || 0;
                
                // Determine actual sample rate based on codec
                // G.722 (HD Voice): 16kHz, G.711 (PCMU/PCMA): 8kHz
                const codec = (sessionInfo.codec || 'G722').toUpperCase();
                const actualSampleRate = (codec === 'PCMU' || codec === 'PCMA') ? 8000 : 16000; // G.722 uses 16kHz
                const actualSamplesPerPacket = (codec === 'PCMU' || codec === 'PCMA') ? 160 : 320; // 20ms @ 8kHz = 160, @ 16kHz = 320

                console.log(`\n🎵 Starting audio stream to ${rtpEndpoint.host}:${rtpEndpoint.port}`);
                console.log(`📊 Audio size: ${audioData.length} bytes`);
                console.log(`⏱️ Duration: ${(audioData.length / actualSampleRate).toFixed(2)}s (${actualSampleRate}Hz)`);
                
                // CRITICAL FIX: For symmetric RTP, try to reuse receiver socket if available
                const sessionId = sessionInfo.sessionId || sessionInfo.id || 'default';
                const receiver = this.activeReceivers.get(sessionId);
                let reuseReceiverSocket = false;
                let socketToUse = null;
                
                if (receiver && receiver.udpSocket && receiver.udpSocket._handle && localPort) {
                    try {
                        const receiverAddress = receiver.udpSocket.address();
                        if (receiverAddress && receiverAddress.port === localPort) {
                            console.log(`✅ Reusing receiver socket for sending (symmetric RTP on port ${localPort})`);
                            reuseReceiverSocket = true;
                            socketToUse = receiver.udpSocket;
                            this.activeSenders.set(sessionId, { udpSocket: receiver.udpSocket, port: localPort });
                        }
                    } catch (e) {
                        // Receiver socket not bound yet, continue with new socket
                    }
                }
                
                if (localPort) {
                    if (reuseReceiverSocket) {
                        console.log(`🔌 Using receiver socket for sending (symmetric RTP - same socket for send/receive)`);
                    } else {
                    console.log(`🔌 Using local RTP send port: ${localPort} (SDP-advertised port for symmetric RTP)`);
                    console.log(`   ✅ This matches the port in SDP - prevents port mismatch`);
                    }
                } else {
                    console.log(`⚠️ WARNING: No local port specified, using ephemeral port (may cause port mismatch!)`);
                }

                // Create new socket only if not reusing receiver socket
                const udpSocket = reuseReceiverSocket ? null : dgram.createSocket('udp4');
                socketToUse = socketToUse || udpSocket;
                let sequenceNumber = Math.floor(Math.random() * 0xFFFF);
                let timestamp = 0; // Start from 0, increment by samples per packet
                let currentOffset = 0;
                
                const ssrc = sessionInfo.ssrc || Math.floor(Math.random() * 0xFFFFFFFF);
                // Determine payload type based on codec (9 = G.722, 0 = PCMU, 8 = PCMA)
                // Note: codec is already declared above
                const payloadType = sessionInfo.payloadType !== undefined
                    ? sessionInfo.payloadType
                    : (codec === 'G722' ? 9 : (codec === 'PCMA' ? 8 : 0));

                // Save sent audio for debugging
                if (this.saveReceivedAudio && sessionInfo.sessionId) {
                    const savePath = path.join(this.tempDir, `sent_audio_${sessionInfo.sessionId}.raw`);
                    fs.writeFileSync(savePath, audioData);
                    console.log(`💾 Saved sent audio: ${savePath}`);
                }

                let packetCount = 0;
                const totalPackets = Math.ceil(audioData.length / actualSamplesPerPacket);
                
                // Use setInterval for precise timing instead of setTimeout
                const interval = setInterval(() => {
                    if (currentOffset >= audioData.length) {
                        console.log(`✅ Audio streaming complete (${packetCount}/${totalPackets} packets)`);
                        clearInterval(interval);
                        // Only close socket if we created a new one (not reusing receiver socket)
                        if (!reuseReceiverSocket) {
                        udpSocket.close();
                            // Remove from active senders
                            this.activeSenders.delete(sessionId);
                        }
                        resolve();
                        return;
                    }

                    // Get next chunk - use actual samples per packet based on codec
                    const chunkSize = Math.min(actualSamplesPerPacket, audioData.length - currentOffset);
                    const audioChunk = audioData.slice(currentOffset, currentOffset + chunkSize);

                    // Create RTP packet
                    const rtpPacket = this.createRTPPacket(audioChunk, {
                        sequenceNumber,
                        timestamp,
                        ssrc,
                        payloadType,
                        marker: currentOffset + chunkSize >= audioData.length // Marker on last packet
                    });

                    // Log first 5 and last 5 packets for debugging
                    if (packetCount < 5 || packetCount >= totalPackets - 5) {
                        console.log(`📦 Packet ${packetCount + 1}/${totalPackets}: seq=${sequenceNumber}, ts=${timestamp}, size=${audioChunk.length}`);
                    }

                    // Send packet - use the socket we determined earlier
                    socketToUse.send(rtpPacket, rtpEndpoint.port, rtpEndpoint.host, (err) => {
                        if (err) {
                            console.error(`❌ Failed to send RTP packet: ${err.message}`);
                            clearInterval(interval);
                            if (!reuseReceiverSocket) {
                            udpSocket.close();
                            }
                            reject(err);
                            return;
                        }
                    });

                    // Update counters
                    currentOffset += chunkSize;
                    sequenceNumber = (sequenceNumber + 1) % 0x10000;
                    // Wrap timestamp at 32 bits - increment by actual samples per packet (not chunkSize which may be smaller on last packet)
                    timestamp = ((timestamp + actualSamplesPerPacket) >>> 0) % 0x100000000;
                    packetCount++;
                }, this.packetInterval); // Exactly 20ms

                // Only set up error handler and binding if using new socket (not reusing receiver)
                if (!reuseReceiverSocket && udpSocket) {
                udpSocket.on('error', (err) => {
                    if (err.code === 'EADDRINUSE' && localPort) {
                        console.error(`❌ Port ${localPort} is already in use (likely by receive socket)`);
                        console.error(`   ⚠️ CRITICAL: This breaks symmetric RTP - port mismatch will occur!`);
                        console.error(`   💡 Solution: Use a single socket for both send/receive (requires refactoring)`);
                        console.error(`   🔄 Attempting to send without binding (will use ephemeral port - NOT ideal)`);
                        // Don't reject - try to continue, but this will cause port mismatch
                        // The socket will use an ephemeral port when sending
                        return; // Don't close or reject, let it try to send
                    }
                    console.error(`❌ UDP socket error: ${err.message}`);
                    clearInterval(interval);
                    try {
                        udpSocket.close();
                    } catch (closeErr) {
                        console.error(`❌ Failed to close UDP socket: ${closeErr.message}`);
                    }
                    reject(err);
                });

                    // Start streaming - bind to port
                udpSocket.bind(localPort, (err) => {
                    if (err) {
                        if (err.code === 'EADDRINUSE') {
                            console.error(`❌ Cannot bind to port ${localPort} - already in use`);
                            console.error(`   ⚠️ This will cause port mismatch (sending from ephemeral port)`);
                            console.error(`   💡 For symmetric RTP, the receive socket should also handle sending`);
                            // Try to send anyway (will use ephemeral port)
                            // This is not ideal but allows the call to continue
                            return;
                        }
                        console.error(`❌ Bind error: ${err.message}`);
                        clearInterval(interval);
                        udpSocket.close();
                        reject(err);
                        return;
                    }
                        // Store sender socket
                        this.activeSenders.set(sessionId, { udpSocket, port: localPort });
                    const address = udpSocket.address();
                    console.log(`🔌 RTP sender bound to ${address.address}:${address.port}`);
                    console.log(`📡 Sending to ${rtpEndpoint.host}:${rtpEndpoint.port}`);
                    if (address.port === localPort) {
                        console.log(`   ✅ Successfully bound to SDP-advertised port ${localPort} (symmetric RTP)`);
                    } else {
                        console.log(`   ⚠️ Bound to different port ${address.port} instead of ${localPort}`);
                    }
                    // setInterval will start automatically, no need to call sendNextPacket
                });
                } else if (reuseReceiverSocket) {
                    // Using receiver socket - already bound, ready to send
                    console.log(`🔌 Using receiver socket for sending (symmetric RTP - same socket for send/receive)`);
                }

            } catch (error) {
                console.error('❌ Audio streaming error:', error);
                reject(error);
            }
        });
    }

    /**
     * Receive audio stream from PBX RTP endpoint
     * @param {number} localPort - Local port to listen on
     * @param {Object} sessionInfo - Session information
     * @param {number} duration - Maximum duration to listen (seconds)
     * @param {number} retryCount - Retry attempt number
     * @param {Object} options - Options including deepgramStream for real-time transcription
     * @returns {Promise<Object>} { audioBuffer, transcript } - Audio buffer and transcript (if streaming)
     */
    /**
     * Stop active RTP receiver for a session (called before TTS to prevent echo)
     * @param {string} sessionId - Session identifier
     */
    stopActiveReceiver(sessionId) {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/d116b95a-c785-46dc-bf1d-ba3cfb5de970',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'audioStreamManager.js:202',message:'stopActiveReceiver called',data:{sessionId,hasReceiver:!!this.activeReceivers.get(sessionId)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
        // #endregion
        const receiver = this.activeReceivers.get(sessionId);
        if (receiver) {
            logger.log(`🛑 Stopping active RTP receiver for session ${sessionId} (before TTS)`);
            try {
                // Stop Deepgram stream first
                if (receiver.deepgramStream && receiver.deepgramStream.isStreaming) {
                    // #region agent log
                    fetch('http://127.0.0.1:7242/ingest/d116b95a-c785-46dc-bf1d-ba3cfb5de970',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'audioStreamManager.js:210',message:'Stopping Deepgram in stopActiveReceiver',data:{sessionId,deepgramStreaming:receiver.deepgramStream.isStreaming},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
                    // #endregion
                    receiver.deepgramStream.stopStream().catch(err => {
                        logger.error(`❌ Error stopping Deepgram: ${err.message}`);
                    });
                }
                
                // Remove all event listeners from UDP socket to prevent memory leaks
                if (receiver.udpSocket) {
                    receiver.udpSocket.removeAllListeners();
                }
                
                // Close UDP socket properly
                if (receiver.udpSocket && typeof receiver.udpSocket.close === 'function') {
                    // #region agent log
                    fetch('http://127.0.0.1:7242/ingest/d116b95a-c785-46dc-bf1d-ba3cfb5de970',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'audioStreamManager.js:216',message:'Closing UDP socket in stopActiveReceiver',data:{sessionId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
                    // #endregion
                    try {
                        receiver.udpSocket.close();
                        logger.log(`✅ UDP socket closed for session ${sessionId}`);
                    } catch (closeErr) {
                        logger.warn(`⚠️ Error closing UDP socket: ${closeErr.message}`);
                    }
                }
                
                // Call finishReceiving if available (but don't force it if already finished)
                if (receiver.finishReceiving && typeof receiver.finishReceiving === 'function') {
                    // #region agent log
                    fetch('http://127.0.0.1:7242/ingest/d116b95a-c785-46dc-bf1d-ba3cfb5de970',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'audioStreamManager.js:220',message:'Calling finishReceiving in stopActiveReceiver',data:{sessionId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
                    // #endregion
                    try {
                        receiver.finishReceiving();
                    } catch (finishErr) {
                        // Ignore errors if already finished
                        logger.log(`ℹ️ finishReceiving already completed or not needed`);
                    }
                }
            } catch (err) {
                logger.error(`❌ Error stopping receiver: ${err.message}`);
            }
            // Remove from active receivers map
            this.activeReceivers.delete(sessionId);
            logger.log(`✅ Receiver stopped and removed from active receivers for session ${sessionId}`);
        } else {
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/d116b95a-c785-46dc-bf1d-ba3cfb5de970',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'audioStreamManager.js:227',message:'stopActiveReceiver: no receiver found (already stopped)',data:{sessionId,activeReceiversCount:this.activeReceivers.size},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
            // #endregion
            logger.log(`ℹ️ No active receiver found for session ${sessionId} (may have already been stopped)`);
        }
    }

    async receiveAudioStream(localPort, sessionInfo = {}, duration = 10, retryCount = 0, options = {}) {
        const maxRetries = 3;
        return new Promise((resolve, reject) => {
            try {
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/d116b95a-c785-46dc-bf1d-ba3cfb5de970',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'audioStreamManager.js:225',message:'receiveAudioStream STARTED',data:{localPort,duration,sessionId:sessionInfo.sessionId||sessionInfo.id||'default',hasDeepgram:!!options.deepgramStream},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
                // #endregion
                logger.startTiming('receiveAudioStream');
                if (retryCount > 0) {
                    logger.log(`👂 Retrying audio receiver on port ${localPort} (attempt ${retryCount + 1}/${maxRetries + 1})`);
                } else {
                    logger.log(`👂 Starting audio receiver on port ${localPort}`);
                }
                logger.log(`⏱️ Listening for ${duration} seconds (will stop on Deepgram speech_final)`);

                const udpSocket = dgram.createSocket('udp4');
                
                // Enable SO_REUSEADDR to allow faster port reuse after socket close
                try {
                    udpSocket.setBroadcast(false); // Disable broadcast by default
                    // Note: Node.js dgram doesn't expose SO_REUSEADDR directly, but we can set reuseAddr via bind options
                } catch (err) {
                    // Ignore if not supported
                }
                
                const sessionId = sessionInfo.sessionId || sessionInfo.id || 'default';
                const audioBuffer = [];
                let expectedSequenceNumber = null;
                let startTime = Date.now();
                const maxTime = startTime + (duration * 1000);

                let packetCount = 0;
                let lastPacketTime = Date.now();
                let firstPacketHandled = false;
                
                // Intelligent speech detection: Grace period + energy detection
                const GRACE_PERIOD_MS = 400; // Wait 400ms after speech_final before stopping
                const SILENCE_THRESHOLD_RMS = 500; // RMS threshold for silence detection (adjust based on testing)
                const MIN_SILENCE_DURATION_MS = 300; // Must be silent for 300ms to consider speech ended
                let speechFinalReceived = false;
                let speechFinalTime = null;
                let gracePeriodTimer = null;
                let lastAudioTime = Date.now();
                let lastAudioRMS = 0;
                let silenceStartTime = null;
                let consecutiveSilentPackets = 0;
                const SLIDING_WINDOW_MS = 800; // Keep last 800ms of audio in buffer
                const slidingWindowBuffer = []; // {timestamp, pcmChunk, rms}
                
                // Helper function to calculate RMS (Root Mean Square) for audio energy detection
                const calculateRMS = (pcmBuffer) => {
                    if (!pcmBuffer || pcmBuffer.length === 0) return 0;
                    let sumSquares = 0;
                    for (let i = 0; i < pcmBuffer.length; i += 2) {
                        // PCM is 16-bit signed (little-endian)
                        const sample = pcmBuffer.readInt16LE(i);
                        sumSquares += sample * sample;
                    }
                    return Math.sqrt(sumSquares / (pcmBuffer.length / 2));
                };
                
                // Deepgram streaming setup
                const deepgramStream = options.deepgramStream || null;
                const activeReceiverRecord = {
                    udpSocket,
                    deepgramStream,
                    finishReceiving: null
                };
                this.activeReceivers.set(sessionId, activeReceiverRecord);
                const codec = (sessionInfo.codec || 'G722').toUpperCase(); // G.722 (HD Voice), PCMU, or PCMA
                let transcript = '';
                let transcriptResolved = false;
                
                // Forward declare variables used in event handlers (will be assigned later)
                let isFinishing = false; // Prevent duplicate calls to finishReceiving
                
                // Audio codec for real-time conversion (if streaming)
                let audioCodec = null;
                let deepgramUtteranceEnded = false;
                let utteranceEndHandled = false; // Prevent duplicate handling
                let stopStreamInitiated = false; // Track if we've already initiated stopping
                let deepgramAcceptingChunks = true; // Track if we should still send chunks to Deepgram
                const deepgramAudioBuffer = []; // Buffer audio until Deepgram is ready
                let deepgramReady = false; // Track if Deepgram is ready to receive audio
                let cleanupDeepgramCheck = null; // Cleanup function for Deepgram ready check interval
                if (deepgramStream) {
                    const AudioCodec = require('./audioCodec');
                    audioCodec = new AudioCodec({ debugMode: false, saveIntermediateFiles: false });
                    console.log(`🎙️ Deepgram streaming enabled - will transcribe in real-time`);
                    
                    // Wait for Deepgram to be ready before sending audio
                    const checkDeepgramReady = setInterval(() => {
                        if (deepgramStream && deepgramStream.isStreaming && !deepgramReady) {
                            deepgramReady = true;
                            console.log('✅ Deepgram is ready - sending buffered audio and streaming new packets');
                            clearInterval(checkDeepgramReady);
                            
                            // Send any buffered audio chunks
                            if (deepgramAudioBuffer.length > 0) {
                                console.log(`📤 Sending ${deepgramAudioBuffer.length} buffered audio chunks to Deepgram`);
                                deepgramAudioBuffer.forEach((pcmChunk) => {
                                    deepgramStream.sendAudioChunk(pcmChunk);
                                });
                                deepgramAudioBuffer.length = 0; // Clear buffer
                            }
                        }
                    }, 50); // Check every 50ms
                    
                    // Store cleanup function to be called from finishReceiving
                    cleanupDeepgramCheck = () => {
                        clearInterval(checkDeepgramReady);
                    };
                    
                    /**
                     * INTELLIGENT SPEECH DETECTION SYSTEM
                     * 
                     * Combines three methods to prevent early cutoffs:
                     * 1. Grace Period: Wait 400ms after speech_final to see if user continues
                     * 2. Energy Detection: Monitor RMS to detect if audio is still active
                     * 3. Sliding Window: Keep last 800ms of audio for context
                     * 
                     * Flow:
                     * - speech_final received → Start 400ms grace period
                     * - If new audio arrives during grace → Reset timer, continue listening
                     * - If high energy detected → Reset, user still speaking
                     * - If grace expires + no new audio + low energy → Speech truly ended, stop
                     * 
                     * This prevents cutting off users during natural pauses, "uh...", or breathing.
                     */
                    deepgramStream.on('speechFinal', (data) => {
                        // #region agent log
                        fetch('http://127.0.0.1:7242/ingest/d116b95a-c785-46dc-bf1d-ba3cfb5de970',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'audioStreamManager.js:323',message:'SPEECH_FINAL EVENT FIRED - starting grace period',data:{packetCount,transcript:data.transcript||'',hasTranscript:!!data.transcript,utteranceEndHandled,isFinishing,stopStreamInitiated,timeSinceStart:Date.now()-startTime,lastAudioTime,timeSinceLastAudio:Date.now()-lastAudioTime},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C,F'})}).catch(()=>{});
                        // #endregion
                        if (utteranceEndHandled || isFinishing) {
                            // #region agent log
                            fetch('http://127.0.0.1:7242/ingest/d116b95a-c785-46dc-bf1d-ba3cfb5de970',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'audioStreamManager.js:326',message:'speech_final ignored (already handled)',data:{utteranceEndHandled,isFinishing},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
                            // #endregion
                            return; // Already handled, ignore duplicate events
                        }
                        
                        speechFinalReceived = true;
                        speechFinalTime = Date.now();
                        console.log('🔇 Deepgram speech_final=true - starting grace period (waiting for continuation)');
                        
                        // Use the transcript from speech_final event
                        const speechFinalTranscript = data.transcript || (deepgramStream.hasFinalTranscript() ? deepgramStream.finalTranscript : '') || transcript;
                        if (speechFinalTranscript && speechFinalTranscript.trim().length > 0) {
                            transcript = speechFinalTranscript.trim();
                            logger.log(`✅ Deepgram FINAL transcript from speech_final: "${transcript}"`);
                        }
                        
                        // Clear any existing grace period timer
                        if (gracePeriodTimer) {
                            clearTimeout(gracePeriodTimer);
                            gracePeriodTimer = null;
                        }
                        
                        // Start grace period: wait to see if user continues speaking
                        // If new audio arrives during grace period, we'll reset it
                        gracePeriodTimer = setTimeout(() => {
                            const timeSinceLastAudio = Date.now() - lastAudioTime;
                            const timeSinceSpeechFinal = Date.now() - speechFinalTime;
                            
                            // #region agent log
                            fetch('http://127.0.0.1:7242/ingest/d116b95a-c785-46dc-bf1d-ba3cfb5de970',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'audioStreamManager.js:365',message:'Grace period expired - checking if speech truly ended',data:{packetCount,timeSinceLastAudio,timeSinceSpeechFinal,lastAudioRMS,consecutiveSilentPackets,isFinishing,stopStreamInitiated},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
                            // #endregion
                            
                            // Check if new audio arrived during grace period
                            if (timeSinceLastAudio < GRACE_PERIOD_MS) {
                                // New audio arrived - user is still speaking, reset
                                // #region agent log
                                fetch('http://127.0.0.1:7242/ingest/d116b95a-c785-46dc-bf1d-ba3cfb5de970',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'audioStreamManager.js:370',message:'Grace period: new audio detected - user still speaking, resetting',data:{packetCount,timeSinceLastAudio},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
                                // #endregion
                                speechFinalReceived = false; // Reset to allow new speech_final
                                return; // Don't stop, user is still speaking
                            }
                            
                            // Check energy: if audio is still loud, user might still be speaking
                            if (lastAudioRMS > SILENCE_THRESHOLD_RMS && consecutiveSilentPackets < 5) {
                                // #region agent log
                                fetch('http://127.0.0.1:7242/ingest/d116b95a-c785-46dc-bf1d-ba3cfb5de970',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'audioStreamManager.js:377',message:'Grace period: high energy detected - user might still be speaking',data:{packetCount,lastAudioRMS,consecutiveSilentPackets},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
                                // #endregion
                                speechFinalReceived = false; // Reset
                                return; // Don't stop yet
                            }
                            
                            // Grace period expired AND no new audio AND low energy = speech truly ended
                        if (!stopStreamInitiated && deepgramStream && deepgramStream.isStreaming && !isFinishing) {
                                // #region agent log
                                fetch('http://127.0.0.1:7242/ingest/d116b95a-c785-46dc-bf1d-ba3cfb5de970',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'audioStreamManager.js:385',message:'Grace period: speech truly ended - stopping now',data:{packetCount,transcript,timeSinceLastAudio,lastAudioRMS},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
                                // #endregion
                                utteranceEndHandled = true;
                                deepgramUtteranceEnded = true;
                            stopStreamInitiated = true;
                                deepgramAcceptingChunks = false;
                                logger.log(`🔇 Speech truly ended after grace period (received ${packetCount} packets, ${timeSinceLastAudio}ms since last audio)`);
                            
                                // Stop Deepgram and finish receiving
                            if (deepgramStream && deepgramStream.isStreaming) {
                                logger.startTiming('stopDeepgram');
                                    
                                if (!isFinishing) {
                                    logger.startTiming('finishReceiving');
                                    finishReceiving();
                                }
                                
                                deepgramStream.stopStream().then(finalTranscript => {
                                    logger.log(`✅ Deepgram stopped [${logger.endTiming('stopDeepgram')}]`);
                                    if (finalTranscript && finalTranscript.trim().length > 0) {
                                        transcript = finalTranscript;
                                    }
                                }).catch(err => {
                                    logger.error(`❌ Error stopping Deepgram: ${err.message}`);
                                });
                            } else {
                                if (!isFinishing) {
                                    finishReceiving();
                                }
                            }
                        }
                        }, GRACE_PERIOD_MS);
                    });
                    
                    // Keep utteranceEnd as fallback (but speech_final takes priority)
                    deepgramStream.on('utteranceEnd', (data) => {
                        // Only handle if speech_final hasn't already been handled
                        if (utteranceEndHandled || isFinishing) {
                            return;
                        }
                        // Fallback to utteranceEnd if speech_final wasn't received
                        console.log('🔇 Deepgram utteranceEnd (fallback) - user finished speaking');
                        utteranceEndHandled = true;
                        deepgramUtteranceEnded = true;
                        transcript = data.finalTranscript || (deepgramStream.hasFinalTranscript() ? deepgramStream.finalTranscript : '') || transcript;
                        logger.log(`✅ Deepgram FINAL transcript on utterance end (fallback): "${transcript}"`);
                        
                        if (!stopStreamInitiated && deepgramStream && deepgramStream.isStreaming && !isFinishing) {
                            stopStreamInitiated = true;
                            deepgramAcceptingChunks = false;
                            logger.log(`🔇 Deepgram utterance end detected (fallback) - stopping early (received ${packetCount} packets)`);
                            
                            if (deepgramStream && deepgramStream.isStreaming) {
                                if (!isFinishing) {
                                    finishReceiving();
                                }
                                deepgramStream.stopStream().catch(err => {
                                    logger.error(`❌ Error stopping Deepgram: ${err.message}`);
                                });
                            } else {
                                if (!isFinishing) {
                                    finishReceiving();
                                }
                            }
                        }
                    });
                    
                    // Listen for complete thought - FALLBACK ONLY (speech_final is primary)
                    // This fires when Deepgram detects a natural speech completion (sentence end, pause, etc.)
                    // Only use this if speech_final wasn't received (fallback mechanism)
                    let completeThoughtTime = null;
                    deepgramStream.on('completeThought', (data) => {
                        // Only handle if speech_final hasn't already been handled
                        if (utteranceEndHandled || isFinishing) {
                            return;
                        }
                        
                        console.log(`💬 Deepgram complete thought detected (FALLBACK): "${data.text}"`);
                        transcript = data.text || transcript;
                        completeThoughtTime = Date.now();
                        
                        // Stop audio collection after 0.5 seconds of grace period (fallback only)
                        setTimeout(() => {
                            if (!isFinishing && !stopStreamInitiated && completeThoughtTime && !utteranceEndHandled) {
                                logger.log(`🛑 Stopping audio collection - complete thought detected (FALLBACK) ${((Date.now() - completeThoughtTime) / 1000).toFixed(1)}s ago`);
                                stopStreamInitiated = true;
                                deepgramAcceptingChunks = false;
                                
                                // CRITICAL FIX: Only get FINAL transcript, not partial
                                const finalTranscript = deepgramStream.hasFinalTranscript() 
                                    ? (deepgramStream.finalTranscript || '') 
                                    : '';
                                if (finalTranscript && finalTranscript.trim().length > 0) {
                                    transcript = finalTranscript.trim();
                                }
                                
                                if (!isFinishing) {
                                    finishReceiving();
                                }
                            }
                        }, 500); // 0.5 second grace period after complete thought (fallback only)
                    });
                }
                
                // Helper function to finish receiving and resolve
                // Note: isFinishing is declared at the top with other forward declarations
                const finishReceiving = () => {
                    // #region agent log
                    fetch('http://127.0.0.1:7242/ingest/d116b95a-c785-46dc-bf1d-ba3cfb5de970',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'audioStreamManager.js:461',message:'finishReceiving CALLED',data:{packetCount,transcript:transcript||'',isFinishing,stopStreamInitiated,deepgramUtteranceEnded,timeSinceStart:Date.now()-startTime,audioBufferSize:audioBuffer.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,B,C,E,F'})}).catch(()=>{});
                    // #endregion
                    if (isFinishing) {
                        // #region agent log
                        fetch('http://127.0.0.1:7242/ingest/d116b95a-c785-46dc-bf1d-ba3cfb5de970',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'audioStreamManager.js:464',message:'finishReceiving DUPLICATE CALL IGNORED',data:{packetCount},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
                        // #endregion
                        return; // Already finishing, ignore duplicate calls
                    }
                    isFinishing = true;
                    
                    // Remove from active receivers FIRST (before closing socket)
                    this.activeReceivers.delete(sessionId);
                    
                    // Cleanup Deepgram ready check interval if it exists
                    if (cleanupDeepgramCheck) {
                        cleanupDeepgramCheck();
                    }
                    
                    // Cleanup grace period timer if it exists
                    if (gracePeriodTimer) {
                        clearTimeout(gracePeriodTimer);
                        gracePeriodTimer = null;
                    }
                    
                    // VAD check interval removed (no longer using custom VAD)
                    this.finalizeReceivedAudio(audioBuffer, sessionInfo);
                    
                    logger.log(`✅ Audio receiving complete [${logger.endTiming('receiveAudioStream')}]`);
                    
                    // Close socket properly and wait for it to fully close
                    try {
                        if (udpSocket && typeof udpSocket.close === 'function') {
                            // Remove all listeners first to prevent memory leaks
                            udpSocket.removeAllListeners();
                            // Close the socket
                            udpSocket.close(() => {
                                logger.log(`✅ UDP receiver socket closed and port ${localPort} released`);
                            });
                            // Fallback: Force close after 100ms if callback doesn't fire
                            setTimeout(() => {
                                try {
                                    if (udpSocket && udpSocket._handle) {
                            udpSocket.close();
                                    }
                                } catch (e) {
                                    // Ignore
                                }
                            }, 100);
                        }
                    } catch (err) {
                        // Socket already closed, ignore
                        logger.log(`ℹ️ Socket already closed or not available`);
                    }
                    
                    resolve({
                        audioBuffer: Buffer.concat(audioBuffer),
                        transcript: transcript || ''
                    });
                };
                
                // Store reference for active receivers map (so stopActiveReceiver can invoke it)
                activeReceiverRecord.finishReceiving = finishReceiving;
                // REMOVED: Custom VAD logic (energy-based detection)
                // This was causing false positives and unreliable behavior
                // Now using Deepgram's speech_final event exclusively

                udpSocket.on('message', (msg, rinfo) => {
                    try {
                        packetCount++;
                        lastPacketTime = Date.now();
                        
                        // Reduced logging - only first 5, then every 50 packets
                        if (packetCount <= 5 || packetCount % 50 === 0) {
                            console.log(`📥 Received packet ${packetCount} from ${rinfo.address}:${rinfo.port} (${msg.length} bytes)`);
                        }
                        
                        // Parse RTP packet
                        const rtpData = this.parseRTPPacket(msg);
                        
                        if (!rtpData) {
                            if (packetCount <= 5) {
                            console.log(`⚠️ Invalid RTP packet ${packetCount}`);
                            }
                            return; // Invalid packet
                        }

                        // Check sequence number for continuity
                        if (expectedSequenceNumber !== null) {
                            const gap = (rtpData.sequenceNumber - expectedSequenceNumber + 0x10000) % 0x10000;
                            if (gap > 1 && gap < 0x8000) {
                                console.log(`⚠️ Sequence gap detected: ${gap} packets missing (seq: ${expectedSequenceNumber} -> ${rtpData.sequenceNumber})`);
                            }
                        }
                        expectedSequenceNumber = (rtpData.sequenceNumber + 1) % 0x10000;

                        if (!firstPacketHandled) {
                            firstPacketHandled = true;
                            if (typeof options.onFirstPacket === 'function') {
                                try {
                                    options.onFirstPacket(rinfo);
                                } catch (callbackError) {
                                    console.error('❌ onFirstPacket callback error:', callbackError);
                                }
                            }
                        }

                        if (typeof options.onPacket === 'function') {
                            try {
                                options.onPacket(rinfo, rtpData);
                            } catch (callbackError) {
                                console.error('❌ onPacket callback error:', callbackError);
                            }
                        }

                        // Append audio payload to buffer first (we'll use it for VAD and processing)
                        audioBuffer.push(rtpData.payload);

                        // Stream to Deepgram in real-time if enabled (only if still accepting chunks and streaming)
                        if (deepgramStream && deepgramStream.isConnected && deepgramStream.isStreaming && deepgramAcceptingChunks && !stopStreamInitiated) {
                            try {
                                // CRITICAL: Convert to PCM before sending to Deepgram
                                // Deepgram REQUIRES PCM linear16, NOT compressed formats!
                                let pcmChunk;
                                if (codec === 'G722') {
                                    // G.722 is already PCM (16-bit, 16kHz) - no conversion needed
                                    // G.722 payload is already 16-bit PCM, just use it directly
                                    pcmChunk = rtpData.payload;
                                } else if (codec === 'PCMA') {
                                    // G.711 A-law: convert to PCM (160 bytes → 320 bytes @ 8kHz)
                                    if (!audioCodec) {
                                        audioCodec = new (require('./audioCodec'))();
                                    }
                                    pcmChunk = audioCodec.alawToPCMChunk(rtpData.payload);
                                } else {
                                    // PCMU (μ-law): convert to PCM (160 bytes → 320 bytes @ 8kHz)
                                    if (!audioCodec) {
                                        audioCodec = new (require('./audioCodec'))();
                                    }
                                    pcmChunk = audioCodec.mulawToPCMChunk(rtpData.payload);
                                }
                                
                                // Verify conversion for G.711 (G.722 doesn't need conversion)
                                if (codec !== 'G722' && pcmChunk.length !== rtpData.payload.length * 2) {
                                    console.error(`❌ PCM conversion size mismatch: ${codec}=${rtpData.payload.length} bytes, PCM=${pcmChunk.length} bytes (expected ${rtpData.payload.length * 2})`);
                                }
                                
                                // Calculate RMS for energy detection
                                const rms = calculateRMS(pcmChunk);
                                lastAudioRMS = rms;
                                lastAudioTime = Date.now();
                                
                                // Update sliding window buffer (keep last 800ms)
                                const now = Date.now();
                                slidingWindowBuffer.push({ timestamp: now, pcmChunk, rms });
                                // Remove old entries (older than SLIDING_WINDOW_MS)
                                while (slidingWindowBuffer.length > 0 && (now - slidingWindowBuffer[0].timestamp) > SLIDING_WINDOW_MS) {
                                    slidingWindowBuffer.shift();
                                }
                                
                                // Energy detection: track silence
                                if (rms < SILENCE_THRESHOLD_RMS) {
                                    if (silenceStartTime === null) {
                                        silenceStartTime = now;
                                    }
                                    consecutiveSilentPackets++;
                                } else {
                                    // Audio detected - reset silence tracking
                                    silenceStartTime = null;
                                    consecutiveSilentPackets = 0;
                                    
                                    // If speech_final was received but new audio arrived, reset grace period
                                    if (speechFinalReceived && gracePeriodTimer) {
                                        // #region agent log
                                        fetch('http://127.0.0.1:7242/ingest/d116b95a-c785-46dc-bf1d-ba3cfb5de970',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'audioStreamManager.js:580',message:'New audio after speech_final - resetting grace period',data:{packetCount,rms,timeSinceSpeechFinal:now-speechFinalTime},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
                                        // #endregion
                                        clearTimeout(gracePeriodTimer);
                                        gracePeriodTimer = null;
                                        speechFinalReceived = false; // Reset to allow continuation
                                        deepgramAcceptingChunks = true; // Re-enable if it was disabled
                                        logger.log(`🔄 New audio detected after speech_final - user continuing, grace period reset`);
                                    }
                                }
                                
                                // Buffer audio if Deepgram isn't ready yet, otherwise send immediately
                                if (!deepgramReady) {
                                    // Buffer the chunk until Deepgram is ready
                                    deepgramAudioBuffer.push(pcmChunk);
                                    if (packetCount === 1) {
                                        console.log(`📦 Buffering PCM audio until Deepgram is ready (μ-law: ${rtpData.payload.length} bytes → PCM: ${pcmChunk.length} bytes per chunk)`);
                                    }
                                } else {
                                    // Send PCM to Deepgram immediately
                                    const sent = deepgramStream.sendAudioChunk(pcmChunk);
                                    // Only log errors and first packet to avoid log spam
                                    if (!sent && packetCount <= 10) {
                                        console.log(`⚠️ Failed to send PCM chunk ${packetCount} to Deepgram (connected: ${deepgramStream.isConnected}, streaming: ${deepgramStream.isStreaming})`);
                                    } else if (sent && packetCount === 1) {
                                        console.log(`✅ Streaming PCM to Deepgram (μ-law: ${rtpData.payload.length} bytes → PCM: ${pcmChunk.length} bytes per chunk)`);
                                    }
                                }
                            } catch (error) {
                                // Log errors for debugging
                                if (deepgramAcceptingChunks && !stopStreamInitiated && packetCount <= 10) {
                                    console.error(`❌ Error converting μ-law→PCM or streaming to Deepgram (packet ${packetCount}):`, error.message);
                                }
                            }
                        } else if (deepgramStream && packetCount <= 5) {
                            // Debug why we're not sending
                            const reasons = [];
                            if (!deepgramStream.isConnected) reasons.push('not connected');
                            if (!audioCodec) reasons.push('no audioCodec');
                            if (!deepgramAcceptingChunks) reasons.push('not accepting chunks');
                            if (stopStreamInitiated) reasons.push('stop initiated');
                            if (reasons.length > 0) {
                                console.log(`⚠️ Not sending to Deepgram (packet ${packetCount}): ${reasons.join(', ')}`);
                            }
                        }

                        // CRITICAL FIX: Disabled custom VAD - now using Deepgram's speech_final event
                        // Custom energy-based VAD is unreliable for G.711 and causes false positives
                        // Deepgram's speech_final is the official endpoint for user speech completion
                        
                        // Check if Deepgram detected speech end (via speech_final or utteranceEnd)
                        if (deepgramUtteranceEnded && !isFinishing && stopStreamInitiated) {
                            // Already initiated stopping, just return to stop processing more packets
                            return;
                        }
                        
                        // REMOVED: Custom energy-based VAD logic
                        // This was causing false positives (energy ratio = 99% on silence)
                        // Now relying entirely on Deepgram's speech_final event

                        // REMOVED: RTP marker and timeout triggers - now using intelligent grace period only
                        // RTP markers and fixed timeouts cause early cutoffs
                        // Only use Deepgram speech_final + grace period + energy detection
                        
                        // Only check absolute maximum timeout (safety fallback after very long silence)
                        // This is much longer than the grace period to avoid interference
                        if (Date.now() > maxTime && !isFinishing && !speechFinalReceived) {
                            // #region agent log
                            fetch('http://127.0.0.1:7242/ingest/d116b95a-c785-46dc-bf1d-ba3cfb5de970',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'audioStreamManager.js:700',message:'ABSOLUTE TIMEOUT (safety fallback only)',data:{packetCount,timeoutDuration:duration*1000,timeSinceStart:Date.now()-startTime,speechFinalReceived},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
                            // #endregion
                            console.log(`⏰ Absolute maximum timeout reached (${duration}s) - safety fallback`);
                            
                            // Only stop if we haven't received speech_final (which has its own grace period)
                            if (deepgramStream && deepgramStream.isStreaming && !isFinishing) {
                                console.log('🛑 Stopping Deepgram stream (absolute timeout fallback)...');
                                deepgramStream.stopStream().then(finalTranscript => {
                                    transcript = finalTranscript || (deepgramStream.hasFinalTranscript() ? deepgramStream.finalTranscript : '');
                                    finishReceiving();
                                }).catch(err => {
                                    console.error('❌ Error stopping Deepgram:', err);
                                    transcript = (deepgramStream.hasFinalTranscript() ? deepgramStream.finalTranscript : '');
                                    finishReceiving();
                                });
                            } else {
                                finishReceiving();
                            }
                        }
                        
                        // #region agent log
                        if (packetCount === 46 || packetCount === 48) {
                            fetch('http://127.0.0.1:7242/ingest/d116b95a-c785-46dc-bf1d-ba3cfb5de970',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'audioStreamManager.js:620',message:'Packet count at suspicious threshold',data:{packetCount,hasMarker:!!rtpData.marker,isFinishing,stopStreamInitiated,deepgramUtteranceEnded},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
                        }
                        // #endregion

                    } catch (error) {
                        console.error('❌ Error processing RTP packet:', error);
                    }
                });

                udpSocket.on('error', (err) => {
                    // VAD check interval removed (no longer using custom VAD)
                    if (err.code === 'EADDRINUSE') {
                        console.error(`❌ UDP receiver error: Port ${localPort} is still in use`);
                        console.error(`   ⏳ This usually means the SIP socket hasn't fully released the port yet`);
                        
                        // Close the failed socket
                        try {
                            udpSocket.close();
                        } catch (e) {
                            // Ignore close errors
                        }
                        
                        // Retry if we haven't exceeded max retries - wait longer for port to be released
                        if (retryCount < maxRetries) {
                            const retryDelay = (retryCount + 1) * 1000; // 1s, 2s, 3s
                            console.error(`   🔄 Retrying in ${retryDelay}ms... (${retryCount + 1}/${maxRetries})`);
                            setTimeout(() => {
                                this.receiveAudioStream(localPort, sessionInfo, duration, retryCount + 1, options).then(resolve).catch(reject);
                            }, retryDelay);
                            return;
                        } else {
                            console.error(`   ❌ Max retries (${maxRetries}) exceeded. Port ${localPort} is still in use.`);
                            reject(new Error(`Port ${localPort} is still in use after ${maxRetries} retries`));
                            return;
                        }
                        }
                    // For other errors, log but don't reject immediately - socket might still work
                    logger.warn(`⚠️ UDP receiver error (non-fatal): ${err.message}`);
                    // Don't reject - let the socket continue if it can
                });

                udpSocket.bind(localPort, '0.0.0.0', () => {
                    const address = udpSocket.address();
                    logger.log(`🔌 RTP receiver listening on ${address.address}:${address.port}`);
                    logger.log(`📡 Waiting for RTP packets from PBX...`);
                    logger.log(`📥 Ready to receive audio packets...`);
                    logger.log(`🌐 Listening on ALL interfaces (0.0.0.0) to receive from any source`);
                    logger.log(`⏰ Will timeout after ${duration} seconds if no packets received`);
                    logger.log(`🔇 Using Deepgram speech_final event to detect when user finishes speaking (no custom VAD)`);
                    logger.log(`🔍 DEBUG: If you see NO '📥 Received packet' messages, the PBX cannot reach this port`);
                    logger.log(`🔍 DEBUG: Check firewall rules - port ${localPort} must be open for UDP`);
                    logger.log(`🔍 DEBUG: Verify SDP has correct public IP address for RTP`);
                    
                    // Set socket to receive from any source
                    udpSocket.setBroadcast(true);
                    udpSocket.setMulticastTTL(128);

                    // Helper function to finish on timeout
                    let timeoutHandled = false; // Prevent duplicate timeout handling
                    const finishTimeout = async () => {
                        if (timeoutHandled || isFinishing) {
                            return; // Already handled
                        }
                        timeoutHandled = true;
                        
                        // VAD check interval removed (no longer using custom VAD)
                        
                        // Stop Deepgram stream
                        if (deepgramStream && deepgramStream.isStreaming && !isFinishing) {
                            try {
                                console.log('🛑 Stopping Deepgram stream (timeout)...');
                                const finalTranscript = await deepgramStream.stopStream();
                                // CRITICAL FIX: Only use FINAL transcript from stopStream (it returns final only)
                                // If stopStream fails, only use finalTranscript property, not partial
                                transcript = finalTranscript || (deepgramStream.hasFinalTranscript() ? deepgramStream.finalTranscript : '') || transcript;
                                console.log(`✅ Deepgram FINAL transcript: "${transcript}"`);
                            } catch (err) {
                                console.error('❌ Error stopping Deepgram:', err);
                                // CRITICAL: Only use FINAL transcript on error, not partial
                                transcript = (deepgramStream.hasFinalTranscript() ? deepgramStream.finalTranscript : '') || transcript;
                            }
                        }
                        
                        if (audioBuffer.length > 0) {
                            console.log(`⏰ Stopping receiver after ${duration}s (timeout)`);
                            this.finalizeReceivedAudio(audioBuffer, sessionInfo);
                            
                            // Only close socket if it's still open
                            try {
                                if (udpSocket && typeof udpSocket.close === 'function') {
                            udpSocket.close();
                                }
                            } catch (err) {
                                // Socket already closed, ignore
                            }
                            
                            resolve({
                                audioBuffer: Buffer.concat(audioBuffer),
                                transcript: transcript || ''
                            });
                        } else {
                            console.log(`⚠️ No audio received after ${duration}s`);
                            
                            // Only close socket if it's still open
                            try {
                                if (udpSocket && typeof udpSocket.close === 'function') {
                            udpSocket.close();
                                }
                            } catch (err) {
                                // Socket already closed, ignore
                            }
                            
                            resolve({
                                audioBuffer: Buffer.alloc(0),
                                transcript: transcript || ''
                            });
                        }
                    };
                    
                    // Set timeout to stop receiving (fallback if VAD doesn't trigger)
                    setTimeout(() => {
                        finishTimeout();
                    }, duration * 1000);
                });

            } catch (error) {
                console.error('❌ Audio receiving error:', error);
                reject(error);
            }
        });
    }

    /**
     * Create RTP packet
     * @param {Buffer} payload - Audio payload (G.711)
     * @param {Object} options - RTP header options
     * @returns {Buffer} RTP packet
     */
    createRTPPacket(payload, options = {}) {
        const header = Buffer.alloc(12);
        
        // Validate and clamp values using unsigned 32-bit operations
        const safeSequence = ((options.sequenceNumber || 0) >>> 0) & 0xFFFF;
        // Use unsigned right shift to ensure timestamp is always unsigned 32-bit
        const safeTimestamp = ((options.timestamp || 0) >>> 0) % 0x100000000;
        const safeSSRC = ((options.ssrc || 0) >>> 0);
        
        // Debug only if values are out of range before fixing
        if (options.timestamp !== undefined && (options.timestamp < 0 || options.timestamp >= 0x100000000)) {
            console.log(`🔍 RTP Debug - Timestamp wrapped: ${options.timestamp} -> ${safeTimestamp}`);
        }
        
        // Version (2), Padding (0), Extension (0), CSRC Count (0)
        header[0] = 0x80;
        
        // Marker (1 bit), Payload Type (7 bits)
        header[1] = (options.marker ? 0x80 : 0x00) | ((options.payloadType || 0) & 0x7F);
        
        // Sequence Number (16 bits)
        header.writeUInt16BE(safeSequence, 2);
        
        // Timestamp (32 bits) - safeTimestamp is guaranteed to be in valid range
        header.writeUInt32BE(safeTimestamp, 4);
        
        // SSRC (32 bits)
        header.writeUInt32BE(safeSSRC, 8);
        
        return Buffer.concat([header, payload]);
    }

    /**
     * Parse RTP packet
     * @param {Buffer} packet - RTP packet
     * @returns {Object|null} Parsed RTP data
     */
    parseRTPPacket(packet) {
        if (packet.length < 12) {
            return null; // Invalid packet
        }

        const version = (packet[0] >> 6) & 0x03;
        if (version !== 2) {
            return null; // Not RTP version 2
        }

        const marker = (packet[1] >> 7) & 0x01;
        const payloadType = packet[1] & 0x7F;
        const sequenceNumber = packet.readUInt16BE(2);
        const timestamp = packet.readUInt32BE(4);
        const ssrc = packet.readUInt32BE(8);

        // Extract payload (skip header)
        const payload = packet.slice(12);

        return {
            version,
            marker: marker === 1,
            payloadType,
            sequenceNumber,
            timestamp,
            ssrc,
            payload
        };
    }

    /**
     * Finalize received audio
     * @param {Array<Buffer>} audioBuffer - Array of audio chunks
     * @param {Object} sessionInfo - Session information
     */
    async finalizeReceivedAudio(audioBuffer, sessionInfo) {
        if (audioBuffer.length === 0) {
            console.log(`⚠️ No audio received`);
            return;
        }

        const combinedAudio = Buffer.concat(audioBuffer);
        console.log(`📊 Received ${combinedAudio.length} bytes of audio`);

        // Save received audio for debugging (keep only latest per session)
        if (this.saveReceivedAudio && sessionInfo.sessionId) {
            const savePath = path.join(this.tempDir, `received_audio_${sessionInfo.sessionId}.raw`);
            
            // Delete old files for this session (keep only latest)
            try {
                const files = fs.readdirSync(this.tempDir);
                files.forEach(file => {
                    // Delete old received_audio files for this session
                    if (file.startsWith(`received_audio_${sessionInfo.sessionId}`) && file !== `received_audio_${sessionInfo.sessionId}.raw`) {
                        const oldFilePath = path.join(this.tempDir, file);
                        try {
                            fs.unlinkSync(oldFilePath);
                            console.log(`🗑️ Deleted old audio file: ${file}`);
                        } catch (err) {
                            console.error(`Failed to delete old file ${file}:`, err);
                        }
                    }
                });
            } catch (err) {
                console.error('Error cleaning up old audio files:', err);
            }
            
            fs.writeFileSync(savePath, combinedAudio);
            console.log(`💾 Saved received audio: ${savePath}`);
        }
    }

    /**
     * Convert received G.711 audio to format suitable for OpenAI Whisper
     * @param {Buffer} g711Audio - G.711 audio (μ-law or a-law)
     * @param {string} codec - 'PCMU' (μ-law) or 'PCMA' (a-law)
     * @returns {Promise<Buffer>} WAV audio for Whisper
     */
    async prepareForWhisper(g711Audio, codec = 'PCMU') {
        try {
            let pcm;

            // Decode according to negotiated codec
            if ((codec || '').toUpperCase() === 'PCMA') {
                console.log('🎧 Preparing audio for Whisper using G.711 a-law decoder (PCMA)');
                pcm = await this.audioCodec.alawToPCM(g711Audio);
            } else {
                console.log('🎧 Preparing audio for Whisper using G.711 μ-law decoder (PCMU)');
                pcm = await this.audioCodec.mulawToPCM(g711Audio);
            }
            
            // Convert PCM to WAV (16kHz for Whisper)
            const wav = await this.audioCodec.pcmToWAV(pcm);
            
            return wav;
        } catch (error) {
            console.error('Error preparing audio for Whisper:', error);
            throw error;
        }
    }
}

module.exports = AudioStreamManager;


const VoiceInteraction = require('./voiceInteraction');
const AudioCodec = require('./audioCodec');
const logger = require('./logger');

class ConversationManager {
    constructor() {
        this.voiceInteraction = new VoiceInteraction();
        // Production defaults: no debug temp files to avoid filling tmp/ and constant I/O
        this.audioCodec = new AudioCodec({ debugMode: false, saveIntermediateFiles: false });
        this.conversations = new Map();
        this.recentMessages = new Map(); // Track recent messages for deduplication
        this.messageTimeout = 3000; // 3 seconds timeout for duplicate detection
        this.acknowledgments = [
            "That makes sense.",
            "Got it.",
            "Understood.",
            "Thank you, that's helpful.",
            "I appreciate that.",
            "Perfect.",
            "Thanks for confirming."
        ];
        // Deterministic flow blocks for intro/questions/validation aligned with the script
        this.introBlocks = [
            "I'm calling from One Path Direct, a company based in Canada. This is not a sales call—it's a quick conversation on behalf of one of our clients.",
            "We're reaching out for a financial firm that's expanding in your country. They asked us to speak with a few people and ask a few brief questions.",
            "With your permission, I'll ask a few quick questions and pass your details so they can introduce themselves and share relevant updates. Would that be alright?"
        ];
        this.questionsFlow = [
            'What is your current position at work?',
            'May I ask your age?',
            'On a personal level, do you invest in real estate, stocks, cryptocurrency, or something else?',
            'If the information you receive is interesting, would you be in a financial position to act on it?',
            'Usually, when our partner contacts clients, the typical first‑time trading level is around 20,000 US dollars. Is that something you could handle, or what range would you consider for a first trade?'
        ];
        this.validationFlow = [
            "Great, thank you for that. I'll pass your information to our partners so they can follow up directly. What is usually the best time to reach you—mornings or afternoons?",
            "Is this the best number to call, or do you have another number you prefer?",
            "Could I confirm your email address to complete your profile?"
        ];
    }

    /**
     * Start a new conversation session
     * @param {string} sessionId - Session ID
     * @param {Object} options - Conversation options
     * @returns {Object} Conversation object
     */
    startConversation(sessionId, options = {}) {
        const conversation = {
            sessionId,
            startTime: new Date(),
            status: 'active',
            messages: [],
            nameUsageCount: 0, // Track total name usage across entire conversation (max 2-3 times)
            context: {
                userName: null,
                userEmail: null,
                userPhone: null,
                intent: null,
                stage: 'greeting',          // greeting | intro | questions | validation | security | closing | ending
                leadConfirmed: false,        // becomes true when user confirms identity
                greetingUsed: false,         // set true after initial greeting is delivered
                leadInfo: options.leadInfo || {}, // Store lead information (firstName, lastName, etc.)
                usedAcks: new Set(),         // Track ack phrases used in this call
                timeConfirmed: false,        // Confirmed 2–3 minutes availability
                introStep: 0,                // 0..2 for three intro blocks
                permissionRequested: false,  // Asked "Would that be alright?"
                permissionGiven: false,      // Proceed permission granted
                questionIndex: 0,            // Current question index
                validationIndex: 0           // Current validation step
            },
            options: {
                voice: options.voice || 'en-US-AvaMultilingualNeural',
                greeting: options.greeting || null,
                maxTurns: options.maxTurns || 999999, // Unlimited turns - conversation continues until call ends
                timeout: options.timeout || 60000 // 60 seconds
            }
        };

        this.conversations.set(sessionId, conversation);
        return conversation;
    }

    /**
     * Process user speech and generate bot response
     * @param {string} sessionId - Session ID
     * @param {Buffer} audioBuffer - User audio buffer (for fallback)
     * @param {string} transcript - Pre-transcribed text from Deepgram (if available)
     * @returns {Promise<Object>} { userText, botResponse, botAudio }
     */
    async processUserSpeech(sessionId, audioBuffer, transcript = null) {
        const conversation = this.conversations.get(sessionId);
        if (!conversation) {
            throw new Error(`Conversation ${sessionId} not found`);
        }

        try {
            let userText;
            
            // Step 1: Transcribe user speech (use Deepgram transcript if available, else Whisper)
            // Skip transcription entirely if we have a transcript and no audio buffer
            if (transcript && transcript.trim().length > 0 && (!audioBuffer || audioBuffer.length === 0)) {
                console.log(`✅ Using Deepgram transcript directly (no audio processing needed): "${transcript}"`);
                userText = transcript;
            } else {
                // Need to transcribe (either no transcript or have audio buffer for fallback)
                console.log(`🎤 Transcribing user speech for session ${sessionId}...`);
                userText = await this.voiceInteraction.speechToText(audioBuffer, transcript);
            }
            
            if (!userText || userText.trim().length === 0) {
                console.log(`⚠️ No speech detected`);
                // Use Assistant API for fallback response - NO HARDCODED RESPONSES
                try {
                    const fallbackResponse = await this.voiceInteraction.generateVoiceResponse(
                        "The user didn't say anything or I couldn't hear them. Please ask them to repeat.",
                        sessionId,
                        conversation.context.leadInfo || {},
                        [],
                        conversation.nameUsageCount || 0
                    );
                    return {
                        userText: '',
                        botResponse: fallbackResponse,
                        botAudio: null
                    };
                } catch (error) {
                    console.error(`❌ Error generating fallback response from Assistant: ${error.message}`);
                    // Try one more time with a simpler prompt
                    try {
                        const retryResponse = await this.voiceInteraction.generateVoiceResponse(
                            "Could you please repeat? I didn't catch that.",
                            sessionId,
                            conversation.context.leadInfo || {},
                            [],
                            conversation.nameUsageCount || 0
                        );
                        return {
                            userText: '',
                            botResponse: retryResponse,
                            botAudio: null
                        };
                    } catch (retryError) {
                        console.error(`❌ Error on retry fallback: ${retryError.message}`);
                        throw new Error(`Failed to generate response from Assistant API: ${retryError.message}`);
                    }
                }
            }

            console.log(`✅ User said: "${userText}"`);

            // Step 2: Update conversation context
            this.updateContext(conversation, userText);

            // Step 3: Generate AI response
            logger.startTiming('gptResponse');
            logger.log(`🤖 Generating AI response...`);
            logger.log(`   User said: "${userText}"`);
            logger.log(`   Session: ${sessionId}`);
            if (conversation.context.leadConfirmed) {
                logger.log(`   Context: leadConfirmed = true (will prevent greeting repetition)`);
            }

            // Deterministic flow handler to prevent repetition and enforce script sequencing
            // No deterministic flow - everything goes through OpenAI Assistant API
            
            let botResponse;
            try {
                // Send user text directly to OpenAI Assistant API - no hardcoded logic, directives, or responses
                // All instructions and responses come from OpenAI platform assistant configuration
                botResponse = await this.voiceInteraction.generateVoiceResponse(
                    userText,
                    sessionId,
                    conversation.context.leadInfo || {},
                    conversation.messages || [],  // Pass conversation history
                    conversation.nameUsageCount || 0  // Pass name usage count
                );
                logger.log(`✅ Bot responds: "${botResponse}" [${logger.endTiming('gptResponse')}]`);
                
                // No hardcoded logic - everything handled by OpenAI Assistant based on platform instructions
            } catch (error) {
                console.error(`❌ Error generating AI response: ${error.message}`);
                console.error(`   Stack: ${error.stack}`);
                // Try to get fallback from Assistant API - NO HARDCODED RESPONSES
                try {
                    botResponse = await this.voiceInteraction.generateVoiceResponse(
                        "I'm having trouble processing that. Please ask the user to repeat.",
                        sessionId,
                        conversation.context.leadInfo || {},
                        [],
                        conversation.nameUsageCount || 0
                    );
                    console.log(`⚠️ Using Assistant fallback response: "${botResponse}"`);
                } catch (fallbackError) {
                    console.error(`❌ Error generating Assistant fallback: ${fallbackError.message}`);
                    // Try one more time with a simpler prompt
                    try {
                        botResponse = await this.voiceInteraction.generateVoiceResponse(
                            "Could you please repeat?",
                            sessionId,
                            conversation.context.leadInfo || {},
                            [],
                            conversation.nameUsageCount || 0
                        );
                        console.log(`⚠️ Using Assistant retry response: "${botResponse}"`);
                    } catch (retryError) {
                        console.error(`❌ All Assistant API attempts failed: ${retryError.message}`);
                        throw new Error(`Failed to generate response from Assistant API after multiple attempts: ${retryError.message}`);
                    }
                }
            }

            // Step 4: Skip TTS conversion here - it will be done in speakAndWait
            // This avoids duplicate TTS generation and saves time
            // The botAudio will be generated on-demand in speakAndWait
            logger.log(`⏭️ Skipping TTS conversion here - will be done in speakAndWait to avoid duplication`);
            const mp3Audio = null; // Not generated here
            const g711 = null; // Not generated here
            const codec = null; // Not generated here

            // Step 5: Save conversation turn (audio will be generated in speakAndWait)
            // Enhanced duplicate detection using message cache
            const messageKey = `${sessionId}_${userText.toLowerCase().trim()}`;
            const recentMessage = this.recentMessages.get(messageKey);
            
            // Check if this exact message was processed recently
            if (recentMessage && (Date.now() - recentMessage.timestamp) < this.messageTimeout) {
                console.log(`⚠️ Duplicate message detected within ${this.messageTimeout}ms window: "${userText}"`);
                console.log(`   Previous bot response: "${recentMessage.botResponse}"`);
                console.log(`   Current bot response: "${botResponse}"`);
                
                // Return the previous response to maintain consistency
                return {
                    userText: userText,
                    botResponse: recentMessage.botResponse,
                    botAudio: null, // Will be regenerated in speakAndWait if needed
                    shouldEnd: recentMessage.shouldEnd || false
                };
            }
            
            // Track name usage in this response
            if (conversation.context.leadInfo) {
                const firstName = conversation.context.leadInfo.firstName || '';
                const lastName = conversation.context.leadInfo.lastName || '';
                const fullName = `${firstName}${lastName ? ' ' + lastName : ''}`.trim();
                
                if (fullName && botResponse) {
                    const fullNameRegex = new RegExp(fullName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
                    const firstNameRegex = firstName ? new RegExp(`\\b${firstName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi') : null;
                    const lastNameRegex = lastName ? new RegExp(`\\b${lastName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi') : null;
                    
                    const fullNameMatches = botResponse.match(fullNameRegex);
                    const firstNameMatches = firstNameRegex ? botResponse.match(firstNameRegex) : null;
                    const lastNameMatches = lastNameRegex ? botResponse.match(lastNameRegex) : null;
                    
                    const nameCountInResponse = (fullNameMatches ? fullNameMatches.length : 0) + 
                                             (firstNameMatches ? firstNameMatches.length : 0) + 
                                             (lastNameMatches ? lastNameMatches.length : 0);
                    
                    if (nameCountInResponse > 0) {
                        conversation.nameUsageCount = (conversation.nameUsageCount || 0) + nameCountInResponse;
                        console.log(`📊 Name usage: ${nameCountInResponse} in this response, ${conversation.nameUsageCount} total in conversation`);
                    }
                }
            }
            
            // Not a duplicate, save to conversation history
            conversation.messages.push({
                timestamp: new Date(),
                user: userText,
                bot: botResponse
            });

            // Step 7: Check if conversation should end
            const shouldEnd = this.shouldEndConversation(conversation, userText, botResponse);
            
            // Cache this message for duplicate detection
            this.recentMessages.set(messageKey, {
                userText: userText,
                botResponse: botResponse,
                timestamp: Date.now(),
                shouldEnd: shouldEnd || false
            });
            
            // Clean up old cache entries
            setTimeout(() => {
                this.recentMessages.delete(messageKey);
            }, this.messageTimeout);
            
            // If conversation should end, generate a closing message using Assistant API
            // BUT: Skip if bot response already contains a goodbye/closing message to avoid race conditions
            let finalMessage = null;
            if (shouldEnd) {
                // Check if bot response already contains goodbye/closing language
                const botTextLower = botResponse.toLowerCase();
                const alreadyHasGoodbye = botTextLower.includes('goodbye') || 
                                         botTextLower.includes('bye') ||
                                         botTextLower.includes('take care') ||
                                         botTextLower.includes('have a great day') ||
                                         botTextLower.includes('see you') ||
                                         botTextLower.includes('talk to you later');
                
                if (!alreadyHasGoodbye) {
                    // Bot response doesn't have goodbye - generate a closing message
                    // But first, wait for any active runs to complete to avoid race conditions
                    try {
                        // Wait a bit for the current run to complete
                        await new Promise(resolve => setTimeout(resolve, 1000));
                        
                        finalMessage = await this.voiceInteraction.generateVoiceResponse(
                            "The conversation is ending. Please provide a friendly closing message.",
                            sessionId,
                            conversation.context.leadInfo || {},
                            [],
                            conversation.nameUsageCount || 0
                        );
                    } catch (error) {
                        console.error('❌ Error generating final message:', error.message);
                        // Fallback - use bot response as final message
                        finalMessage = null;
                    }
                } else {
                    // Bot response already has goodbye - use it as final message
                    console.log(`✅ Bot response already contains goodbye - skipping separate final message generation`);
                    finalMessage = null; // Will use botResponse instead
                }
            }

            return {
                userText,
                botResponse,
                finalMessage: finalMessage, // Closing message from Assistant API
                botAudio: g711, // Will be null - generated in speakAndWait
                audioDuration: g711 ? (g711.length / 16000) : 0, // HD Voice: Updated from 8kHz to 16kHz
                shouldEnd,
                conversationState: {
                    stage: conversation.context.stage,
                    turnCount: conversation.messages.length
                }
            };

        } catch (error) {
            console.error(`❌ Error processing user speech: ${error.message}`);
            throw error;
        }
    }

    /**
     * Return next unused acknowledgment phrase; if exhausted, rotate.
     */
    getNextAck(conversation) {
        for (const phrase of this.acknowledgments) {
            if (!conversation.context.usedAcks.has(phrase)) {
                conversation.context.usedAcks.add(phrase);
                return phrase;
            }
        }
        // Rotate: clear and return the first to keep variety
        conversation.context.usedAcks.clear();
        const phrase = this.acknowledgments[0];
        conversation.context.usedAcks.add(phrase);
        return phrase;
    }

    /**
     * Deterministic flow controller that enforces non-repetitive, step-by-step script.
     * Returns { botResponse, shouldEnd } or null to fall back to LLM.
     */
    handleDeterministicFlow(conversation, userText) {
        const ctx = conversation.context;
        const lastBot = conversation.messages.length ? (conversation.messages[conversation.messages.length - 1].bot || '') : '';
        const text = (userText || '').toLowerCase();

        const resolveYesNo = () => {
            const t = text.trim().toLowerCase();
            // Strong yes/no lexicon
            const yesWords = ['yes','yeah','yup','yep','sure','ok','okay','affirmative','go ahead','alright','uh huh','uh-huh','mm hmm','mm-hmm'];
            const noWords  = ['no','nope','negative','not now','dont','don\'t','do not','nah'];
            if (yesWords.some(w => new RegExp(`\\b${w}\\b`).test(t))) return 'yes';
            if (noWords.some(w => new RegExp(`\\b${w}\\b`).test(t))) return 'no';
            // Common STT confusion: "you" instead of "yes" — treat "you" as "yes" ALWAYS in short responses
            // This is a very common misrecognition in telephony audio
            if (/^\s*(you|ya|yah|yea|ye|yas|y)\s*[.!?]?\s*$/i.test(t)) {
                console.log(`🔄 STT correction: "${t}" interpreted as "yes" (common misrecognition)`);
                return 'yes';
            }
            // Words often misheard for "no"
            if (/^\s*(nah|na|noo|now)\s*[.!?]?\s*$/i.test(t)) {
                console.log(`🔄 STT correction: "${t}" interpreted as "no" (common misrecognition)`);
                return 'no';
            }
            return null;
        };
        const yn = resolveYesNo();
        const saidYes = yn === 'yes';
        const saidNo = yn === 'no';
        const saidBusy = /\b(busy|later|another time|not a good time|call back|can't talk)\b/i.test(text);
        
        // Detect if user asked a question — let LLM handle it naturally
        const userAskedQuestion = /\?$/.test(text.trim()) || 
            /\b(who|what|where|why|how|when|which|whose|whom)\b.*\b(you|are|is|do|does|can|will|would)\b/i.test(text) ||
            /\b(where are you|who are you|what is this|what do you|tell me about|what you)\b/i.test(text);
        
        if (userAskedQuestion) {
            console.log(`🔍 User asked a question: "${userText}" — letting LLM handle it`);
            // Mark that we're handling a question so deterministic flow doesn't interfere
            ctx.handlingQuestion = true;
            return null; // Fall back to LLM for natural response
        }
        
        // If we just handled a question via LLM, don't immediately fall back to deterministic flow
        // This prevents the bot from repeating intro blocks after answering a question
        if (ctx.handlingQuestion && lastBot && !lastBot.includes('One Path Direct') && !lastBot.includes('financial firm')) {
            // LLM just answered a question - clear the flag and let conversation continue naturally
            ctx.handlingQuestion = false;
            // If we're in intro stage but user asked a question, advance the stage to prevent repetition
            if (ctx.stage === 'intro' && ctx.introStep < 2) {
                ctx.introStep = Math.min(ctx.introStep + 1, 2);
                if (ctx.introStep === 2) {
                    ctx.permissionRequested = true;
                }
            }
            return null; // Continue with LLM, don't force deterministic flow
        }
        
        // CRITICAL: If user asks questions repeatedly, don't keep repeating intro blocks
        // Check if we've already said intro blocks multiple times
        const introBlockCount = conversation.messages.filter(msg => 
            msg.bot && (msg.bot.includes('One Path Direct') || msg.bot.includes('financial firm'))
        ).length;
        
        // If we've said intro blocks 2+ times and user is asking questions, skip deterministic flow
        if (introBlockCount >= 2 && userAskedQuestion) {
            console.log(`⚠️ Intro blocks repeated ${introBlockCount} times - skipping deterministic flow for question`);
            // Advance stage to prevent getting stuck
            if (ctx.stage === 'intro') {
                ctx.stage = 'main';
                ctx.introStep = 2; // Skip to permission question
                ctx.permissionRequested = true;
            }
            return null; // Let LLM handle it
        }

        // If identity confirmed and time not yet confirmed: handle the time confirmation gate
        if (ctx.leadConfirmed && !ctx.timeConfirmed) {
            // More flexible pattern to catch various time question formats
            const askedTime = lastBot && (
                /(do you|do you still|can you).*(have|got).*(2[\s–-]?3|few|2-3|couple).*minutes.*(to chat|to talk|available|now)/i.test(lastBot.toLowerCase()) ||
                /(2[\s–-]?3|few|2-3).*minutes.*(to chat|to talk|available)/i.test(lastBot.toLowerCase())
            );
            
            // Also check if user explicitly confirmed time availability
            const hasTime = /\b(i have|i've got|i got|i'm available|available|have time|got time|free now|free to talk)\b/i.test(text);
            
            if (askedTime || hasTime) {
                if (saidBusy) {
                    ctx.stage = 'ending';
                    return { botResponse: "I understand. When is a better time for a quick call?" };
                }
                if (saidNo) {
                    ctx.stage = 'ending';
                    return { botResponse: "No problem, thank you for your time. Have a great day.", shouldEnd: true };
                }
                if (saidYes || hasTime) {
                    ctx.timeConfirmed = true;
                    ctx.stage = 'intro';
                    ctx.introStep = 0;
                    console.log(`✅ Time confirmed in deterministic flow (saidYes: ${saidYes}, hasTime: ${hasTime})`);
                    return { botResponse: this.introBlocks[ctx.introStep] };
                }
                // If user said something other than yes/no/busy/time confirmation, let LLM handle naturally
                return null; // Fall back to LLM
            }
            
            // If we haven't asked for time yet and we're in the right stage, ask once
            // But only if we haven't already asked in previous messages
            const alreadyAskedTime = conversation.messages.some(msg => 
                msg.bot && /(do you|do you still|can you).*(have|got).*(2[\s–-]?3|few|2-3|couple).*minutes.*(to chat|to talk|available|now)/i.test(msg.bot.toLowerCase())
            );
            
            if (!alreadyAskedTime && ctx.stage !== 'intro') {
                // Ask for time once
                return { botResponse: "Do you have 2-3 minutes to chat?" };
            }
        }

        // Intro blocks step-by-step - use includes() instead of exact match for flexibility
        if (ctx.timeConfirmed && ctx.stage === 'intro') {
            // Check if we've already said intro block 0 (more flexible matching)
            const saidIntro0 = lastBot.includes('One Path Direct') && lastBot.includes('Canada') && lastBot.includes('not a sales call');
            const saidIntro1 = lastBot.includes('financial firm') && lastBot.includes('expanding');
            const saidIntro2 = lastBot.includes('With your permission') || lastBot.includes('Would that be alright');
            
            // Advance from intro block 0 to 1
            if (ctx.introStep === 0 && saidIntro0) {
                // User gave neutral response (okay, yes, etc.) - advance to next block
                if (saidYes || yn === null || text.includes('okay') || text.includes('ok')) {
                    ctx.introStep = 1;
                    return { botResponse: this.introBlocks[1] };
                }
            }
            // If we're on step 0 but haven't said intro 0 yet, say it
            if (ctx.introStep === 0 && !saidIntro0) {
                return { botResponse: this.introBlocks[0] };
            }
            
            // Advance from intro block 1 to 2
            if (ctx.introStep === 1 && saidIntro1) {
                // User gave neutral response - advance to permission question
                if (saidYes || yn === null || text.includes('okay') || text.includes('ok')) {
                    ctx.introStep = 2;
                    ctx.permissionRequested = true;
                    return { botResponse: this.introBlocks[2] }; // includes permission question
                }
            }
            // If we're on step 1 but haven't said intro 1 yet, say it
            if (ctx.introStep === 1 && !saidIntro1) {
                return { botResponse: this.introBlocks[1] };
            }
            
            // Handle permission request (intro block 2)
            if (ctx.introStep === 2 && ctx.permissionRequested) {
                if (saidNo) {
                    ctx.stage = 'ending';
                    return { botResponse: "Understood. Thank you for your time. Have a great day.", shouldEnd: true };
                }
                if (saidYes || text.includes('okay') || text.includes('ok')) {
                    ctx.permissionGiven = true;
                    ctx.stage = 'questions';
                    ctx.questionIndex = 0;
                    const ack = this.getNextAck(conversation);
                    return { botResponse: `${ack} ${this.questionsFlow[ctx.questionIndex]}` };
                }
                // If user said something other than yes/no/okay, let LLM handle it naturally
                // Don't keep repeating the same question
                return null; // Fall back to LLM
            }
            // If we're on step 2 but haven't said intro 2 yet, say it
            if (ctx.introStep === 2 && !saidIntro2) {
                ctx.permissionRequested = true;
                return { botResponse: this.introBlocks[2] };
            }
        }

        // Questions flow (one-by-one, acknowledge then proceed)
        if (ctx.stage === 'questions') {
            const currentQuestion = this.questionsFlow[ctx.questionIndex] || null;
            // Check if we just asked a question (more flexible matching)
            const justAskedQuestion = currentQuestion && (
                lastBot.includes(currentQuestion.split('?')[0]) || // Match question text
                lastBot.includes('What is your current position') ||
                lastBot.includes('May I ask your age') ||
                lastBot.includes('do you invest') ||
                lastBot.includes('financial position') ||
                lastBot.includes('first trade')
            );
            
            if (justAskedQuestion) {
                // User gave any response (yes, okay, or actual answer) - advance to next question
                // Don't require specific answer, just acknowledge and move forward
                if (yn !== null || text.includes('okay') || text.includes('ok') || text.length > 3) {
                    ctx.questionIndex += 1;
                    if (ctx.questionIndex < this.questionsFlow.length) {
                        const ack = this.getNextAck(conversation);
                        return { botResponse: `${ack} ${this.questionsFlow[ctx.questionIndex]}` };
                    }
                    // Move to validation
                    ctx.stage = 'validation';
                    ctx.validationIndex = 0;
                    const ack = this.getNextAck(conversation);
                    return { botResponse: `${ack} ${this.validationFlow[ctx.validationIndex]}` };
                }
            }
            // If currentQuestion not found in lastBot (e.g., conversation resumed or LLM responded), ask current question
            if (currentQuestion && !justAskedQuestion) {
                return { botResponse: currentQuestion };
            }
        }

        // Validation flow
        if (ctx.stage === 'validation') {
            const currentValidation = this.validationFlow[ctx.validationIndex] || null;
            if (currentValidation && lastBot.includes(currentValidation)) {
                ctx.validationIndex += 1;
                if (ctx.validationIndex < this.validationFlow.length) {
                    const ack = this.getNextAck(conversation);
                    return { botResponse: `${ack} ${this.validationFlow[ctx.validationIndex]}` };
                }
                // Move to security
                ctx.stage = 'security';
                return { botResponse: "Just one more thing. For security, we set a simple answer so you know the call is from our partners. What car do you drive? If you don't drive, what is your favorite car company?" };
            }
            if (currentValidation) {
                return { botResponse: currentValidation };
            }
        }

        // Security → Closing
        if (ctx.stage === 'security') {
            ctx.stage = 'closing';
            const lastName = (ctx.leadInfo && ctx.leadInfo.lastName) ? ctx.leadInfo.lastName : '';
            return { botResponse: `That's everything from my side. Thank you for your time${lastName ? `, Mr./Ms. ${lastName}` : ''}. Please keep an eye out for a call from the investment group. Have a great rest of your day. Goodbye.`, shouldEnd: true };
        }

        // If none of the above matched, fall back to LLM
        return null;
    }

    /**
     * Update conversation context based on user input
     */
    updateContext(conversation, userText) {
        const text = userText.toLowerCase();

        // Extract name
        if (!conversation.context.userName) {
            const nameMatch = userText.match(/\b(?:my name is|i'm|i am|call me)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i);
            if (nameMatch) {
                conversation.context.userName = nameMatch[1];
                console.log(`📝 Extracted name: ${conversation.context.userName}`);
            }
        }

        // Detect explicit identity confirmation (helps stop greeting loops)
        // CRITICAL: Only confirm identity if bot has already asked for it (greeting was delivered)
        // This prevents "Yes" at call start from being misinterpreted as identity confirmation
        if (!conversation.context.leadConfirmed) {
            // Check if bot has already asked for identity (greeting was delivered)
            const botAskedForIdentity = conversation.messages.some(msg => 
                msg.bot && (
                    /am i speaking with/i.test(msg.bot) ||
                    /is this/i.test(msg.bot) ||
                    /may i speak with/i.test(msg.bot) ||
                    conversation.context.greetingUsed // Greeting was already delivered
                )
            );
            
            // Only treat "Yes" as confirmation if bot has asked for identity OR greeting was used
            if (botAskedForIdentity || conversation.context.greetingUsed) {
                // Consider common confirmations even with punctuation and extra words,
                // and ignore negatives like "not"/"no" nearby
                const hasNegative = /\b(no|not|nah|nope)\b/i.test(text);
                const confirmed = !hasNegative && /\b(yes|yeah|yup|correct|speaking|this is|i am|it's me|ya)\b/i.test(text);
                if (confirmed) {
                    conversation.context.leadConfirmed = true;
                    // Move to main conversation after confirmation
                    conversation.context.stage = 'main';
                    console.log('✅ Lead identity confirmed (leadConfirmed = true, stage = main)');
                }
            } else {
                // Bot hasn't asked yet - don't treat "Yes" as identity confirmation
                // This prevents skipping the greeting when user says "Yes" at call start
                console.log(`⚠️ User said "${text}" but bot hasn't asked for identity yet - not treating as confirmation`);
            }
        }

        // Extract email
        if (!conversation.context.userEmail) {
            const emailMatch = userText.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/);
            if (emailMatch) {
                conversation.context.userEmail = emailMatch[0];
                console.log(`📝 Extracted email: ${conversation.context.userEmail}`);
            }
        }

        // Extract phone
        if (!conversation.context.userPhone) {
            const phoneMatch = userText.match(/\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/);
            if (phoneMatch) {
                conversation.context.userPhone = phoneMatch[0];
                console.log(`📝 Extracted phone: ${conversation.context.userPhone}`);
            }
        }

        // Update stage based on conversation flow
        if (conversation.context.stage === 'greeting') {
            // If we already confirmed identity, jump to main; otherwise proceed to conversation
            conversation.context.stage = conversation.context.leadConfirmed ? 'main' : 'conversation';
        }

        // Detect intent
        if (text.includes('schedule') || text.includes('appointment') || text.includes('demo')) {
            conversation.context.intent = 'schedule';
        } else if (text.includes('price') || text.includes('cost') || text.includes('fee')) {
            conversation.context.intent = 'pricing';
        } else if (text.includes('goodbye') || text.includes('bye bye') || 
                   (text.includes('bye') && !text.includes('thank you'))) {
            conversation.context.stage = 'ending';
        }

        const lastBot = conversation.messages.length > 0 ? conversation.messages[conversation.messages.length - 1].bot : '';

        // Enhanced time confirmation detection - catch various ways user confirms availability
        const saidYes = /\b(yes|yeah|yup|sure|ok|okay|affirmative|go ahead|alright|uh huh|mm hmm)\b/i.test(text) || 
                /^\s*(you|ya|yah|yea|ye|yas|y)\s*[.!?]?\s*$/i.test(text); // Include common misrecognitions
        
        // Also detect explicit time availability phrases
        const hasTime = /\b(i have|i've got|i got|i'm available|available|have time|got time|free now|free to talk)\b/i.test(text);

        // More flexible pattern to catch various time question formats from bot
        const askedTime = lastBot && (
            /(do you|do you still|can you).*(have|got).*(2[\s–-]?3|few|2-3|couple).*minutes.*(to chat|to talk|available|now)/i.test(lastBot.toLowerCase()) ||
            /(2[\s–-]?3|few|2-3).*minutes.*(to chat|to talk|available)/i.test(lastBot.toLowerCase())
        );

        // If bot asked about time AND user confirmed (yes OR explicit time availability), mark as confirmed
        if (askedTime && (saidYes || hasTime) && !conversation.context.timeConfirmed) {
            conversation.context.timeConfirmed = true;
            conversation.context.stage = 'intro';
            conversation.context.introStep = 0;
            console.log(`✅ Time availability confirmed via updateContext detection (saidYes: ${saidYes}, hasTime: ${hasTime})`);
        }
        
        // Also check if user explicitly confirms time without bot asking (proactive confirmation)
        if (!conversation.context.timeConfirmed && hasTime && !askedTime) {
            conversation.context.timeConfirmed = true;
            conversation.context.stage = 'intro';
            conversation.context.introStep = 0;
            console.log(`✅ Time availability confirmed proactively (user said: "${text}")`);
        }
    }

    /**
     * Determine if conversation should end
     */
    shouldEndConversation(conversation, userText, botResponse) {
        const text = userText.toLowerCase();
        const botText = botResponse.toLowerCase();

        // Max turns check removed - conversation continues indefinitely until call ends

        // Check for goodbye signals (only explicit goodbyes, not "thank you" alone)
        // "Thank you" is polite but doesn't necessarily mean the conversation should end
        const explicitGoodbye = text.includes('goodbye') || text.includes('bye bye') || 
                               (text.includes('bye') && !text.includes('thank you'));
        const botSaidGoodbye = botText.includes('goodbye') || botText.includes('have a great day');
        
        if (explicitGoodbye || botSaidGoodbye) {
            console.log(`🛑 Goodbye detected`);
            return true;
        }
        
        // "Thank you" alone should not end conversation, but if user says "thank you, goodbye" it should
        if (text.includes('thank you') && (text.includes('goodbye') || text.includes('bye'))) {
            console.log(`🛑 Goodbye detected (thank you + goodbye)`);
            return true;
        }

        // Check if we've captured required info and completed intent
        if (conversation.context.stage === 'ending') {
            return true;
        }

        return false;
    }

    /**
     * End conversation session
     */
    endConversation(sessionId) {
        const conversation = this.conversations.get(sessionId);
        if (conversation) {
            conversation.status = 'ended';
            conversation.endTime = new Date();
            conversation.duration = conversation.endTime - conversation.startTime;

            console.log(`✅ Conversation ended: ${sessionId}`);
            console.log(`   Duration: ${(conversation.duration / 1000).toFixed(2)}s`);
            console.log(`   Turns: ${conversation.messages.length}`);
            console.log(`   Context:`, conversation.context);

            // Keep conversation for a while for analytics
            setTimeout(() => {
                this.conversations.delete(sessionId);
            }, 3600000); // 1 hour

            return conversation;
        }
        return null;
    }

    /**
     * Generate call summary using GPT
     * This is called AFTER the call ends to avoid any delay
     * @param {string} sessionId - Session ID
     * @returns {Promise<string>} Generated summary
     */
    async generateCallSummary(sessionId) {
        const conversation = this.conversations.get(sessionId);
        if (!conversation || !conversation.messages || conversation.messages.length === 0) {
            logger.warn(`⚠️ No conversation data found for summary: ${sessionId}`);
            return null;
        }

        try {
            logger.log(`📝 Generating call summary for session: ${sessionId}`);
            logger.startTiming('callSummary');

            // Build conversation transcript
            // Messages can have both user and bot in the same object, so create separate lines for each
            const transcriptLines = [];
            conversation.messages.forEach((msg, index) => {
                // Messages are stored as { user, bot, timestamp }
                if (msg.user && msg.user.trim()) {
                    transcriptLines.push(`User: ${msg.user.trim()}`);
                }
                if (msg.bot && msg.bot.trim()) {
                    transcriptLines.push(`Bot: ${msg.bot.trim()}`);
                }
            });
            const transcript = transcriptLines.join('\n');

            // Create summary prompt
            const summaryPrompt = `You are analyzing a phone call conversation. Generate a concise, professional summary of this call.

Conversation Transcript:
${transcript}

Please provide a summary that includes:
1. Purpose/Reason for the call
2. Key topics discussed
3. Any decisions made or actions agreed upon
4. Next steps (if any)
5. Overall outcome

Format the summary in clear, professional language. Keep it concise but comprehensive.`;

            // Generate summary using GPT
            const summary = await this.voiceInteraction.generateSummary(summaryPrompt);
            
            logger.log(`✅ Call summary generated [${logger.endTiming('callSummary')}]`);
            return summary;

        } catch (error) {
            logger.error(`❌ Error generating call summary: ${error.message}`);
            return null;
        }
    }

    /**
     * Get conversation details
     */
    getConversation(sessionId) {
        return this.conversations.get(sessionId);
    }

    /**
     * Get all active conversations
     */
    getActiveConversations() {
        const active = [];
        for (const [sessionId, conversation] of this.conversations) {
            if (conversation.status === 'active') {
                active.push({
                    sessionId,
                    startTime: conversation.startTime,
                    turnCount: conversation.messages.length,
                    stage: conversation.context.stage
                });
            }
        }
        return active;
    }
}

module.exports = ConversationManager;


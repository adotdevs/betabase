// controllers/aiInstructionsController.js
const fs = require('fs');
const path = require('path');
const catchAsyncErrors = require('../middlewares/catchAsyncErrors');
const ErrorHandler = require('../utils/errorHandler');

const INSTRUCTIONS_FILE_PATH = path.join(__dirname, '../config/ai-instructions.json');

/**
 * Get AI instructions from JSON file
 */
exports.getAiInstructions = catchAsyncErrors(async (req, res, next) => {
    try {
        // Check if file exists
        if (!fs.existsSync(INSTRUCTIONS_FILE_PATH)) {
            // Return default structure if file doesn't exist
            const defaultInstructions = {
                systemPrompt: "You are a friendly, professional AI assistant helping with customer inquiries. Keep responses concise and natural. Be conversational, not robotic.",
                personality: "Professional and helpful",
                tone: "friendly",
                maxWords: 20,
                assistantName: "Alex",
                greetingTemplate: "Hi {name}! This is {assistantName}. I hope you're doing well today. How can I help you?",
                instructions: "Keep responses short (max 20 words). Be natural and conversational. Ask clarifying questions when needed. Be empathetic and solution-oriented."
            };
            
            // Create file with defaults
            fs.writeFileSync(INSTRUCTIONS_FILE_PATH, JSON.stringify(defaultInstructions, null, 2), 'utf8');
            
            return res.status(200).json({
                success: true,
                instructions: defaultInstructions
            });
        }

        // Read file
        const fileContent = fs.readFileSync(INSTRUCTIONS_FILE_PATH, 'utf8');
        const instructions = JSON.parse(fileContent);

        res.status(200).json({
            success: true,
            instructions: instructions
        });

    } catch (error) {
        console.error('Error reading AI instructions:', error);
        return next(new ErrorHandler('Failed to read AI instructions', 500));
    }
});

/**
 * Update AI instructions in JSON file
 */
exports.updateAiInstructions = catchAsyncErrors(async (req, res, next) => {
    try {
        // Check if request body exists
        if (!req.body || typeof req.body !== 'object') {
            return next(new ErrorHandler('Request body is missing or invalid', 400));
        }
        
        // Debug: Log full request body first
        console.log('📥 Full request body:', JSON.stringify(req.body, null, 2));
        console.log('📥 Request body type:', typeof req.body);
        console.log('📥 Request body keys:', Object.keys(req.body || {}));
        
        const { systemPrompt, personality, tone, maxWords, assistantName, greetingTemplate, instructions, unlimitedWords, responseGeneration } = req.body;
        
        // Debug: Log received data with types
        console.log('📥 Received AI instructions update:');
        console.log('   systemPrompt:', systemPrompt ? `${systemPrompt.substring(0, 50)}...` : 'MISSING', `(type: ${typeof systemPrompt})`);
        console.log('   personality:', personality || 'MISSING', `(type: ${typeof personality})`);
        console.log('   tone:', tone || 'MISSING', `(type: ${typeof tone})`);
        console.log('   maxWords:', maxWords !== undefined ? maxWords : 'MISSING', `(type: ${typeof maxWords})`);
        console.log('   unlimitedWords:', unlimitedWords !== undefined ? unlimitedWords : 'MISSING', `(type: ${typeof unlimitedWords})`);
        console.log('   assistantName:', assistantName || 'MISSING', `(type: ${typeof assistantName})`);
        console.log('   greetingTemplate:', greetingTemplate ? `${greetingTemplate.substring(0, 50)}...` : 'not provided', `(type: ${typeof greetingTemplate})`);
        console.log('   instructions:', instructions ? `${instructions.substring(0, 50)}...` : 'not provided', `(type: ${typeof instructions})`);
        console.log('   responseGeneration:', responseGeneration ? 'provided' : 'not provided');

        // Validate required fields (check for non-empty strings)
        const missingFields = [];
        
        // Check systemPrompt
        if (!systemPrompt) {
            missingFields.push('systemPrompt (missing)');
        } else if (typeof systemPrompt !== 'string') {
            missingFields.push('systemPrompt (wrong type: ' + typeof systemPrompt + ')');
        } else if (systemPrompt.trim().length === 0) {
            missingFields.push('systemPrompt (empty string)');
        }
        
        // Check personality
        if (!personality) {
            missingFields.push('personality (missing)');
        } else if (typeof personality !== 'string') {
            missingFields.push('personality (wrong type: ' + typeof personality + ')');
        } else if (personality.trim().length === 0) {
            missingFields.push('personality (empty string)');
        }
        
        // Check tone
        if (!tone) {
            missingFields.push('tone (missing)');
        } else if (typeof tone !== 'string') {
            missingFields.push('tone (wrong type: ' + typeof tone + ')');
        } else if (tone.trim().length === 0) {
            missingFields.push('tone (empty string)');
        }
        
        // Check maxWords - handle unlimitedWords flag
        let finalMaxWords = maxWords;
        if (unlimitedWords === true || unlimitedWords === 'true') {
            finalMaxWords = 0;
        }
        
        if (finalMaxWords === undefined || finalMaxWords === null) {
            missingFields.push('maxWords (missing)');
        }
        
        if (missingFields.length > 0) {
            console.error('❌ Validation failed. Missing fields:', missingFields);
            return next(new ErrorHandler(`Missing required fields: ${missingFields.join(', ')}`, 400));
        }

        // Validate maxWords is a number
        // Allow 0 for unlimited, or 1-1000 for limited responses
        if (typeof finalMaxWords !== 'number' || (finalMaxWords !== 0 && (finalMaxWords < 1 || finalMaxWords > 1000))) {
            return next(new ErrorHandler('maxWords must be 0 (unlimited) or a number between 1 and 1000', 400));
        }

        // Validate tone is one of allowed values
        const allowedTones = ['friendly', 'professional', 'casual', 'formal', 'empathetic'];
        if (!allowedTones.includes(tone)) {
            return next(new ErrorHandler(`tone must be one of: ${allowedTones.join(', ')}`, 400));
        }

        // Prepare instructions object
        const updatedInstructions = {
            systemPrompt: systemPrompt.trim(),
            personality: personality.trim(),
            tone: tone.trim(),
            maxWords: parseInt(finalMaxWords),
            assistantName: assistantName ? assistantName.trim() : "AI Assistant",
            greetingTemplate: greetingTemplate ? greetingTemplate.trim() : "",
            instructions: instructions ? instructions.trim() : ""
        };

        // Add responseGeneration if provided
        if (responseGeneration && typeof responseGeneration === 'object') {
            updatedInstructions.responseGeneration = responseGeneration;
        }

        // Validate JSON structure by stringifying
        try {
            JSON.stringify(updatedInstructions);
        } catch (jsonError) {
            return next(new ErrorHandler('Invalid JSON structure', 400));
        }

        // Write to file
        fs.writeFileSync(INSTRUCTIONS_FILE_PATH, JSON.stringify(updatedInstructions, null, 2), 'utf8');

        // Notify voiceInteraction to reload cache (if it has a reload method)
        // This will be handled by file watcher in voiceInteraction.js

        res.status(200).json({
            success: true,
            message: 'AI instructions updated successfully',
            instructions: updatedInstructions
        });

    } catch (error) {
        console.error('Error updating AI instructions:', error);
        return next(new ErrorHandler('Failed to update AI instructions', 500));
    }
});


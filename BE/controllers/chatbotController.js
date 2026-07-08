const catchAsyncErrors = require("../middlewares/catchAsyncErrors");
const OpenAI = require("openai");
const ChatbotMessage = require("../models/chatbotMessage");
const ChatbotSession = require("../models/chatbotSession");
const sendEmail = require("../utils/sendEmail");
const { v4: uuidv4 } = require('uuid');
const { getAssistantConfig, generateContextMessage, generateEmailContent } = require("../utils/assistant-config");

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// In-memory storage for active sessions and threads
const sessionThreads = new Map(); // sessionId -> threadId
const activeSessions = new Map(); // sessionId -> sessionData

// Clean response helper
function cleanResponse(response) {
  return response
    .replace(/【.*?】/g, "") // Remove unwanted characters
    .replace(/\*\*(.*?)\*\*/g, "<b>$1</b>") // Replace **bold** with <b> tags
    .replace(/###/g, "") // Remove ###
    .replace(/\n{2,}/g, "<br /><br />") // Preserve paragraph breaks
    .replace(/\n/g, "<br />") // Replace single newlines with <br />
    .trim();
}

// Extract email from messages
function extractUserEmailFromMessages(messages) {
  const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
  
  for (const message of messages) {
    if (message.content) {
      const emailMatch = message.content.match(emailRegex);
      if (emailMatch && emailMatch.length > 0) {
        const email = emailMatch[0];
        if (/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$/.test(email)) {
          return email;
        }
      }
    }
  }
  return null;
}

/**
 * Create or restore a chat session
 */
exports.createSession = catchAsyncErrors(async (req, res, next) => {
  try {
    const { sessionId, useWidgetAssistant, assistantId } = req.body;
    const userId = req.user?._id || null;

    // Resolve which assistant to use (backwards compatible):
    // - Prefer explicit boolean flag when provided
    // - If assistantId matches a known assistant, map to the correct boolean
    let resolvedUseWidgetAssistant = !!useWidgetAssistant;
    if (typeof useWidgetAssistant === 'boolean') {
      resolvedUseWidgetAssistant = useWidgetAssistant;
    } else if (typeof assistantId === 'string' && assistantId.trim()) {
      const requested = assistantId.trim();
      if (requested === process.env.OPENAI_ASSISTANT_ID_TWO) {
        resolvedUseWidgetAssistant = true;
      } else if (requested === process.env.OPENAI_ASSISTANT_ID) {
        resolvedUseWidgetAssistant = false;
      }
    }
    
    let session;
    
    if (sessionId) {
      // Try to restore existing session
      session = await ChatbotSession.findOne({ sessionId });
      
      if (session) {
        // Get messages for this session
        const messages = await ChatbotMessage.find({ sessionId })
          .sort({ timestamp: 1 })
          .lean();
        
        // Restore thread if exists
        if (session.threadId && !sessionThreads.has(sessionId)) {
          sessionThreads.set(sessionId, session.threadId);
        }
        
        // Update active sessions
        activeSessions.set(sessionId, {
          sessionId: session.sessionId,
          messages: messages,
          timestamp: session.lastActivity,
          messageCount: messages.length
        });
        
        return res.status(200).json({
          success: true,
          sessionId: session.sessionId,
          messages: messages,
          restored: true
        });
      }
    }
    
    // Create new session
    const newSessionId = sessionId || uuidv4();
    
    session = await ChatbotSession.create({
      sessionId: newSessionId,
      userId: userId,
      lastActivity: new Date(),
      useWidgetAssistant: resolvedUseWidgetAssistant
    });
    
    // Return session immediately, generate greeting asynchronously in background
    // This prevents blocking the session creation
    activeSessions.set(newSessionId, {
      sessionId: newSessionId,
      messages: [],
      timestamp: new Date(),
      messageCount: 0
    });
    
    // Generate greeting asynchronously (non-blocking)
    (async () => {
      try {
        // Use widget assistant ID if flag is set, otherwise use default
        const OPENAI_ASSISTANT_ID = resolvedUseWidgetAssistant 
          ? process.env.OPENAI_ASSISTANT_ID_TWO 
          : process.env.OPENAI_ASSISTANT_ID;
        if (OPENAI_ASSISTANT_ID) {
          // Create a thread for the greeting
          const thread = await openai.beta.threads.create();
          const threadId = thread.id;
          
          // Store thread ID
          sessionThreads.set(newSessionId, threadId);
          await ChatbotSession.updateOne(
            { sessionId: newSessionId },
            { threadId: threadId }
          );
          
          // Get assistant config for context (use the same assistant ID as the conversation)
          let greetingPrompt = "Please greet the user warmly and introduce yourself. Keep it brief and friendly.";
          try {
            const assistantConfig = await getAssistantConfig(OPENAI_ASSISTANT_ID);
            if (assistantConfig && assistantConfig.name) {
              // Create a greeting prompt with assistant context
              greetingPrompt = `You are ${assistantConfig.name}. Please greet the user warmly and introduce yourself. Keep it brief and friendly.`;
            }
          } catch (configError) {
            console.error("❌ Error loading assistant config for greeting:", configError);
            // Use default greeting prompt
          }
          
          // Add a message to trigger greeting
          await openai.beta.threads.messages.create(threadId, {
            role: "user",
            content: greetingPrompt,
          });
          
          // Run the assistant to generate greeting
          const run = await openai.beta.threads.runs.create(threadId, {
            assistant_id: OPENAI_ASSISTANT_ID,
          });
          
          // Poll for completion
          let runStatus;
          let pollCount = 0;
          const maxPolls = 15; // 30 seconds max
          
          do {
            await new Promise((resolve) => setTimeout(resolve, 2000));
            pollCount++;
            runStatus = await openai.beta.threads.runs.retrieve(run.id, { thread_id: threadId });
            
            if (runStatus.status === "failed") {
              throw new Error("Run failed");
            }
            
            if (pollCount >= maxPolls) {
              throw new Error("Greeting generation timeout");
            }
          } while (runStatus.status !== "completed");
          
          // Get the greeting message
          const messages = await openai.beta.threads.messages.list(threadId);
          const assistantMessage = messages.data.find((msg) => msg.role === "assistant");
          
          if (assistantMessage && assistantMessage.content.length > 0) {
            const firstContent = assistantMessage.content[0];
            if ("text" in firstContent) {
              const greetingText = firstContent.text.value.trim();
              
              // Get bot name from assistant config (use the same assistant ID as the conversation)
              let botName = "AI Assistant";
              try {
                const assistantConfig = await getAssistantConfig(OPENAI_ASSISTANT_ID);
                if (assistantConfig && assistantConfig.name) {
                  botName = assistantConfig.name;
                }
              } catch (error) {
                console.error("Error getting bot name:", error);
              }
              
              // Format greeting with bot name
              const finalGreeting = `${botName}: ${greetingText}`;
              
              // Save greeting message to database
              await ChatbotMessage.create({
                sessionId: newSessionId,
                content: finalGreeting,
                role: 'assistant',
                isBot: true,
                userId: userId,
                timestamp: new Date()
              });
              
              console.log("✅ Generated greeting for new session:", newSessionId);
            }
          }
        }
      } catch (greetingError) {
        console.error("❌ Error generating greeting:", greetingError);
        // Continue without greeting - user will get response on first message
      }
    })();
    
    return res.status(200).json({
      success: true,
      sessionId: newSessionId,
      messages: [],
      restored: false
    });
  } catch (error) {
    console.error('❌ Error creating/restoring session:', error);
    return res.status(500).json({
      success: false,
      msg: 'Failed to create session'
    });
  }
});

/**
 * Get messages for a session
 */
exports.getSessionMessages = catchAsyncErrors(async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    
    if (!sessionId) {
      return res.status(400).json({
        success: false,
        msg: 'Session ID is required'
      });
    }
    
    const messages = await ChatbotMessage.find({ sessionId })
      .sort({ timestamp: 1 })
      .lean();
    
    return res.status(200).json({
      success: true,
      messages: messages
    });
  } catch (error) {
    console.error('❌ Error getting messages:', error);
    return res.status(500).json({
      success: false,
      msg: 'Failed to get messages'
    });
  }
});

/**
 * Clear chat for a session
 */
exports.clearChat = catchAsyncErrors(async (req, res, next) => {
  try {
    const { sessionId } = req.body;
    
    if (!sessionId) {
      return res.status(400).json({
        success: false,
        msg: 'Session ID is required'
      });
    }
    
    // Delete messages
    await ChatbotMessage.deleteMany({ sessionId });
    
    // Clear thread
    if (sessionThreads.has(sessionId)) {
      sessionThreads.delete(sessionId);
    }
    
    // Clear active session
    if (activeSessions.has(sessionId)) {
      activeSessions.delete(sessionId);
    }
    
    // Update session
    await ChatbotSession.updateOne(
      { sessionId },
      { 
        messageCount: 0,
        threadId: null,
        lastActivity: new Date()
      }
    );
    
    return res.status(200).json({
      success: true,
      msg: 'Chat cleared successfully'
    });
  } catch (error) {
    console.error('❌ Error clearing chat:', error);
    return res.status(500).json({
      success: false,
      msg: 'Failed to clear chat'
    });
  }
});

/**
 * Main chatbot message handler using OpenAI Assistant API
 */
exports.chatbotMessage = catchAsyncErrors(async (req, res, next) => {
  try {
    const { message, sessionId, conversationHistory, useWidgetAssistant, assistantId } = req.body;
    const userId = req.user?._id || null;

    // Validate input
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({
        success: false,
        msg: 'Message is required and must be a non-empty string'
      });
    }

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        msg: 'Session ID is required'
      });
    }

    // Get or create session first to determine which assistant to use
    let session = await ChatbotSession.findOne({ sessionId });
    if (!session) {
      // Resolve assistant selection for a new session (backwards compatible)
      let resolvedUseWidgetAssistant = !!useWidgetAssistant;
      if (typeof useWidgetAssistant === 'boolean') {
        resolvedUseWidgetAssistant = useWidgetAssistant;
      } else if (typeof assistantId === 'string' && assistantId.trim()) {
        const requested = assistantId.trim();
        if (requested === process.env.OPENAI_ASSISTANT_ID_TWO) {
          resolvedUseWidgetAssistant = true;
        } else if (requested === process.env.OPENAI_ASSISTANT_ID) {
          resolvedUseWidgetAssistant = false;
        }
      }
      session = await ChatbotSession.create({
        sessionId: sessionId,
        userId: userId,
        lastActivity: new Date(),
        useWidgetAssistant: resolvedUseWidgetAssistant
      });
    }
    
    // Resolve which assistant to use for this request (backwards compatible)
    let shouldUseWidgetAssistant = (session.useWidgetAssistant || false);
    if (typeof useWidgetAssistant === 'boolean') {
      shouldUseWidgetAssistant = useWidgetAssistant;
    } else if (typeof assistantId === 'string' && assistantId.trim()) {
      const requested = assistantId.trim();
      if (requested === process.env.OPENAI_ASSISTANT_ID_TWO) {
        shouldUseWidgetAssistant = true;
      } else if (requested === process.env.OPENAI_ASSISTANT_ID) {
        shouldUseWidgetAssistant = false;
      }
    }

    // Get OpenAI configuration
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    // Use widget assistant ID if flag is set, otherwise use default
    const OPENAI_ASSISTANT_ID = shouldUseWidgetAssistant 
      ? process.env.OPENAI_ASSISTANT_ID_TWO 
      : process.env.OPENAI_ASSISTANT_ID;

    if (!OPENAI_API_KEY) {
      console.error('❌ OpenAI API key is not configured');
      return res.status(500).json({
        success: false,
        msg: 'Chatbot service is not configured. Please contact support.'
      });
    }

    // Store user message
    const userMessage = await ChatbotMessage.create({
      sessionId: sessionId,
      content: message.trim(),
      role: 'user',
      isBot: false,
      userId: userId,
      timestamp: new Date()
    });

    // Update session
    await ChatbotSession.updateOne(
      { sessionId },
      { 
        lastActivity: new Date(),
        $inc: { messageCount: 1 }
      }
    );

    // Refresh session to get latest threadId
    session = await ChatbotSession.findOne({ sessionId });
    
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    
    // Get or create thread - use const to prevent reassignment
    let threadIdValue = sessionThreads.get(sessionId) || (session.threadId || null);
    
    // Validate threadId format if it exists
    if (threadIdValue && (typeof threadIdValue !== 'string' || threadIdValue.trim() === '')) {
      console.warn("⚠️ Invalid threadId format, creating new thread:", threadIdValue);
      threadIdValue = null;
    }
    
    if (!threadIdValue) {
      console.log("🧵 Creating new thread for session:", sessionId);
      try {
        const thread = await openai.beta.threads.create();
        threadIdValue = thread?.id;
        
        if (!threadIdValue || typeof threadIdValue !== 'string' || threadIdValue.trim() === '') {
          throw new Error('Failed to create OpenAI thread - invalid thread ID returned');
        }
        
        sessionThreads.set(sessionId, threadIdValue);
        
        // Store thread ID in database
        await ChatbotSession.updateOne(
          { sessionId },
          { threadId: threadIdValue }
        );
        
        console.log("✅ Created thread:", threadIdValue, "for session:", sessionId);
      } catch (threadError) {
        console.error("❌ Error creating thread:", threadError);
        throw new Error(`Failed to create OpenAI thread: ${threadError.message}`);
      }
    } else {
      console.log("🧵 Using existing thread:", threadIdValue, "for session:", sessionId);
    }

    // Final validation before proceeding - store in const to prevent reassignment
    if (!threadIdValue || typeof threadIdValue !== 'string' || threadIdValue.trim() === '') {
      console.error("❌ Invalid threadId after all checks:", { threadId: threadIdValue, sessionId, type: typeof threadIdValue });
      throw new Error(`Invalid threadId: ${threadIdValue} (type: ${typeof threadIdValue}) for session: ${sessionId}`);
    }
    
    // Store in const to prevent accidental reassignment
    const threadId = threadIdValue;

    // Check if this is the first message in the thread
    const existingMessages = await openai.beta.threads.messages.list(threadId);
    const isFirstMessage = existingMessages.data.length === 0;

    // Add user message to thread
    let messageContent = message.trim();
    
    // For first message, add context from assistant config
    if (isFirstMessage) {
      try {
        console.log("🔍 Fetching assistant configuration for context...");
        const assistantConfig = await getAssistantConfig(OPENAI_ASSISTANT_ID);
        
        // Get conversation history for context
        let historyMessages = [];
        if (conversationHistory && Array.isArray(conversationHistory)) {
          historyMessages = conversationHistory;
        } else {
          // Fallback: get from database
          const dbMessages = await ChatbotMessage.find({ sessionId })
            .sort({ timestamp: 1 })
            .limit(10)
            .lean();
          historyMessages = dbMessages.map(msg => ({
            content: msg.content,
            isBot: msg.isBot
          }));
        }
        
        messageContent = generateContextMessage(messageContent, assistantConfig, historyMessages);
        console.log("✅ Assistant configuration loaded successfully");
      } catch (error) {
        console.error("❌ Error loading assistant config:", error);
        // Continue with original message if config fails
        messageContent = message.trim();
      }
    }
    
    await openai.beta.threads.messages.create(threadId, {
      role: "user",
      content: messageContent,
    });

    // Run the Assistant (requires OPENAI_ASSISTANT_ID)
    if (!OPENAI_ASSISTANT_ID) {
      throw new Error('OpenAI Assistant ID is not configured. Please set OPENAI_ASSISTANT_ID in environment variables.');
    }

    console.log("🚀 Creating run for thread:", threadId, "with assistant:", OPENAI_ASSISTANT_ID);
    console.log("🔍 ThreadId validation:", { 
      threadId, 
      type: typeof threadId, 
      isString: typeof threadId === 'string',
      length: threadId?.length,
      sessionId 
    });
    
    // Validate threadId one more time before creating run
    if (!threadId || typeof threadId !== 'string' || threadId.trim() === '') {
      console.error("❌ CRITICAL: threadId is invalid before run creation:", { 
        threadId, 
        sessionId, 
        type: typeof threadId,
        value: JSON.stringify(threadId)
      });
      throw new Error(`Invalid threadId before run creation: ${threadId} for session: ${sessionId}`);
    }
    
    // Check for active runs before creating a new one
    try {
      const runs = await openai.beta.threads.runs.list(threadId);
      const activeRuns = runs.data.filter(r => 
        r.status === 'queued' || r.status === 'in_progress' || r.status === 'requires_action'
      );
      
      if (activeRuns.length > 0) {
        console.log(`⏳ Found ${activeRuns.length} active run(s), waiting for completion...`);
        
        // Wait for active runs to complete
        for (const activeRun of activeRuns) {
          let runStatus;
          let pollCount = 0;
          const maxPolls = 30; // 60 seconds max
          
          do {
            await new Promise((resolve) => setTimeout(resolve, 2000));
            pollCount++;
            runStatus = await openai.beta.threads.runs.retrieve(activeRun.id, { thread_id: threadId });
            
            if (runStatus.status === "failed") {
              console.warn("⚠️ Active run failed:", runStatus.last_error);
              break; // Continue to create new run
            }
            
            if (pollCount >= maxPolls) {
              console.warn("⚠️ Active run timeout, cancelling and creating new run");
              // Try to cancel the run
              try {
                await openai.beta.threads.runs.cancel(activeRun.id, { thread_id: threadId });
              } catch (cancelError) {
                console.warn("⚠️ Could not cancel active run:", cancelError.message);
              }
              break;
            }
          } while (runStatus.status !== "completed" && runStatus.status !== "failed" && runStatus.status !== "cancelled");
        }
        
        console.log("✅ Active runs completed or cancelled, proceeding with new run");
      }
    } catch (checkError) {
      console.warn("⚠️ Error checking for active runs:", checkError.message);
      // Continue anyway - might be a transient error
    }
    
    let run;
    try {
      console.log("🔍 About to create run with:", {
        threadId: threadId,
        threadIdType: typeof threadId,
        threadIdValue: String(threadId),
        assistantId: OPENAI_ASSISTANT_ID
      });
      
      run = await openai.beta.threads.runs.create(threadId, {
        assistant_id: OPENAI_ASSISTANT_ID,
      });
      
      // IMMEDIATE validation - check run object structure
      if (!run) {
        throw new Error('OpenAI returned null/undefined run object');
      }
      
      console.log("🔍 Run object received - FULL STRUCTURE:", JSON.stringify(run, null, 2));
      console.log("🔍 Run object keys:", Object.keys(run || {}));
      console.log("🔍 Run.id value:", run.id);
      console.log("🔍 Run.id type:", typeof run.id);
      console.log("🔍 Run.thread_id value:", run.thread_id);
      
      // CRITICAL: Check if run.id exists
      if (!('id' in run)) {
        console.error("❌ CRITICAL: run object has no 'id' property!");
        throw new Error(`Run object missing 'id' property. Available keys: ${Object.keys(run).join(', ')}`);
      }
      
      // CRITICAL: Check if run.id is actually a thread ID
      if (run.id && run.id.startsWith('thread_')) {
        console.error("❌ CRITICAL: run.id is a thread ID, not a run ID!", {
          runId: run.id,
          threadId: threadId,
          runThreadId: run.thread_id
        });
        throw new Error(`FATAL: run.id is a thread ID (${run.id}), not a run ID. This should never happen.`);
      }
      
      // CRITICAL: Check if run.id starts with 'run_'
      if (!run.id || !run.id.startsWith('run_')) {
        console.error("❌ CRITICAL: run.id format is invalid!", {
          runId: run.id,
          expectedPrefix: 'run_',
          actualValue: run.id
        });
        throw new Error(`FATAL: Invalid run.id format: ${run.id}. Expected a run ID starting with 'run_'.`);
      }
      
    } catch (createError) {
      console.error("❌ Error creating/validating run:", {
        error: createError.message,
        threadId,
        sessionId,
        assistantId: OPENAI_ASSISTANT_ID,
        errorStack: createError.stack
      });
      throw createError;
    }

    if (!run) {
      console.error("❌ Run creation returned null/undefined:", { threadId, sessionId });
      throw new Error('Failed to create OpenAI run - run object is null');
    }
    
    // CRITICAL: Check if run.id exists
    if (!run.id) {
      console.error("❌ Run object missing id property:", { 
        run: JSON.stringify(run, null, 2),
        runKeys: Object.keys(run || {}),
        runHasId: 'id' in run,
        runThreadId: run.thread_id,
        threadId, 
        sessionId 
      });
      throw new Error(`Failed to create OpenAI run - run.id is missing. Run object keys: ${Object.keys(run || {}).join(', ')}`);
    }
    
    // CRITICAL: Check if run.id is actually a thread ID (should never happen)
    if (run.id.startsWith('thread_')) {
      console.error("❌ CRITICAL: run.id is a thread ID, not a run ID!", {
        runId: run.id,
        threadId: threadId,
        runThreadId: run.thread_id,
        runObject: JSON.stringify(run, null, 2)
      });
      throw new Error(`Invalid run object: run.id is a thread ID (${run.id}), not a run ID. This should never happen.`);
    }
    
    // Validate run.id format (should start with "run_")
    if (!run.id.startsWith('run_')) {
      console.error("❌ CRITICAL: Run ID format is invalid!", {
        runId: run.id,
        expectedPrefix: 'run_',
        actualPrefix: run.id.substring(0, 10),
        threadId,
        runObject: JSON.stringify(run, null, 2)
      });
      throw new Error(`Invalid run ID format: ${run.id}. Expected a run ID starting with 'run_', but got: ${run.id.substring(0, 10)}...`);
    }

    console.log("✅ Run created successfully:", {
      runId: run.id,
      threadId: threadId,
      sessionId: sessionId
    });
    
    // CRITICAL: Validate run object structure
    console.log("🔍 Validating run object structure:", {
      hasId: 'id' in run,
      hasThreadId: 'thread_id' in run,
      runId: run.id,
      runThreadId: run.thread_id,
      runStatus: run.status,
      allKeys: Object.keys(run || {})
    });
    
    // Check if run.id exists and is valid
    if (!run.id) {
      console.error("❌ CRITICAL: run.id is missing!", {
        runObject: JSON.stringify(run, null, 2),
        runKeys: Object.keys(run || {}),
        threadId: threadId
      });
      throw new Error(`Run object is missing 'id' property. Run object keys: ${Object.keys(run || {}).join(', ')}`);
    }
    
    // Check if run.id is actually a thread ID (should never happen)
    if (run.id.startsWith('thread_')) {
      console.error("❌ CRITICAL: run.id is a thread ID, not a run ID!", {
        runId: run.id,
        threadId: threadId,
        runThreadId: run.thread_id,
        runObject: JSON.stringify(run, null, 2)
      });
      throw new Error(`Invalid run object: run.id is a thread ID (${run.id}), not a run ID. Expected a run ID starting with 'run_'.`);
    }
    
    // Validate run.id format (should start with "run_")
    if (!run.id.startsWith('run_')) {
      console.error("❌ CRITICAL: run.id format is invalid!", {
        runId: run.id,
        expectedPrefix: 'run_',
        actualPrefix: run.id.substring(0, 10),
        threadId: threadId
      });
      throw new Error(`Invalid run ID format: ${run.id}. Expected a run ID starting with 'run_'.`);
    }
    
    // Store run.id in const to prevent reassignment
    const runId = String(run.id).trim();
    const validatedThreadId = String(threadId).trim();
    
    // Final validation that both are valid
    if (!validatedThreadId || validatedThreadId === 'undefined' || validatedThreadId === 'null' || !validatedThreadId.startsWith('thread_')) {
      console.error("❌ CRITICAL: validatedThreadId is invalid!", {
        validatedThreadId: validatedThreadId,
        originalThreadId: threadId,
        type: typeof validatedThreadId
      });
      throw new Error(`Invalid threadId after validation: ${validatedThreadId} (original: ${threadId})`);
    }
    
    if (!runId || runId === 'undefined' || runId === 'null' || !runId.startsWith('run_')) {
      console.error("❌ CRITICAL: runId is invalid!", {
        runId: runId,
        originalRunId: run.id,
        type: typeof runId
      });
      throw new Error(`Invalid runId after validation: ${runId} (original: ${run.id})`);
    }
    
    // Final validation of both IDs
    console.log("🔍 Final validation before polling:", {
      threadId: validatedThreadId,
      threadIdType: typeof validatedThreadId,
      threadIdLength: validatedThreadId.length,
      runId: runId,
      runIdType: typeof runId,
      runIdLength: runId.length,
      sessionId: sessionId
    });
    
    // Ensure both are valid strings
    if (!validatedThreadId || validatedThreadId === 'undefined' || validatedThreadId === 'null') {
      throw new Error(`Invalid threadId: ${validatedThreadId} for session: ${sessionId}`);
    }
    if (!runId || runId === 'undefined' || runId === 'null' || runId.startsWith('thread_')) {
      throw new Error(`Invalid runId: ${runId} for session: ${sessionId}`);
    }

    // Poll the run status until it completes
    let runStatus;
    let pollCount = 0;
    const maxPolls = 30; // Maximum 60 seconds (30 * 2 seconds)
    
    do {
      await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait 2 seconds
      pollCount++;
      
      // Validate threadId and runId before retrieving - use the const values directly
      if (!validatedThreadId || typeof validatedThreadId !== 'string' || validatedThreadId.trim() === '' || validatedThreadId === 'undefined' || validatedThreadId === 'null') {
        console.error("❌ CRITICAL: validatedThreadId is invalid during polling:", { 
          validatedThreadId: validatedThreadId, 
          sessionId, 
          type: typeof validatedThreadId
        });
        throw new Error(`ThreadId is invalid during polling for session: ${sessionId}. Value: ${validatedThreadId}, Type: ${typeof validatedThreadId}`);
      }
      if (!runId || typeof runId !== 'string' || runId.trim() === '' || runId === 'undefined' || runId === 'null' || runId.startsWith('thread_')) {
        console.error("❌ CRITICAL: runId is invalid during polling:", { 
          runId: runId, 
          sessionId, 
          type: typeof runId
        });
        throw new Error(`Run ID is invalid during polling for session: ${sessionId}. Value: ${runId}, Type: ${typeof runId}`);
      }
      
      console.log(`🔄 Polling run status (attempt ${pollCount}/${maxPolls}) for thread:`, validatedThreadId, "run:", runId);
      
      // Double-check values right before API call - use const values directly
      console.log("🔍 Pre-retrieve validation:", {
        threadId: validatedThreadId,
        threadIdType: typeof validatedThreadId,
        threadIdLength: validatedThreadId.length,
        runId: runId,
        runIdType: typeof runId,
        runIdLength: runId.length,
        sessionId: sessionId
      });
      
      // CRITICAL: Use the const values directly, don't create new variables
      try {
        // Final check right before API call
        if (!validatedThreadId || validatedThreadId === 'undefined' || validatedThreadId === 'null') {
          throw new Error(`FATAL: validatedThreadId is invalid before API call: ${validatedThreadId}`);
        }
        if (!runId || runId === 'undefined' || runId === 'null') {
          throw new Error(`FATAL: runId is invalid before API call: ${runId}`);
        }
        
        console.log("🔍 Calling runs.retrieve with CORRECT signature:", {
          runId: runId,
          runIdLength: runId.length,
          threadId: validatedThreadId,
          threadIdLength: validatedThreadId.length,
          params: { thread_id: validatedThreadId }
        });
        
        // CORRECT method signature: retrieve(runID, params) where params = { thread_id: threadId }
        runStatus = await openai.beta.threads.runs.retrieve(runId, { thread_id: validatedThreadId });
      } catch (retrieveError) {
        console.error("❌ Error retrieving run:", {
          error: retrieveError.message,
          threadId: threadId,
          threadIdType: typeof threadId,
          threadIdValue: String(threadId),
          runId: runId,
          runIdType: typeof runId,
          runIdValue: String(runId),
          sessionId: sessionId,
          errorStack: retrieveError.stack
        });
        throw retrieveError;
      }
      
      if (runStatus.status === "failed") {
        console.error("❌ Run failed:", runStatus.last_error);
        
        if (runStatus.last_error?.code === 'rate_limit_exceeded') {
          throw new Error("OpenAI rate limit exceeded. Please check your OpenAI billing and quota.");
        }
        
        throw new Error("Run failed: " + (runStatus.last_error?.message || "Unknown error"));
      }
      
      if (pollCount >= maxPolls) {
        throw new Error("Run polling timeout - run did not complete within 60 seconds");
      }
    } while (runStatus.status !== "completed");
    
    console.log("✅ Run completed successfully:", run.id);

    // Retrieve the latest assistant message
    const messages = await openai.beta.threads.messages.list(threadId);
    const responseMessage = messages.data.find((msg) => msg.role === "assistant");

    let botResponse = null;

    if (responseMessage && responseMessage.content.length > 0) {
      const firstContent = responseMessage.content[0];
      if ("text" in firstContent) {
        botResponse = cleanResponse(firstContent.text.value);
      }
    }

    // If no response from OpenAI, return error
    if (!botResponse) {
      throw new Error("No response received from OpenAI Assistant");
    }

    // Get assistant config to add bot name to response (use the same assistant ID as the conversation)
    let botName = null;
    try {
      const assistantConfig = await getAssistantConfig(OPENAI_ASSISTANT_ID);
      botName = assistantConfig.name.split(' - ')[0] || assistantConfig.name || null;
    } catch (error) {
      console.warn("⚠️ Could not fetch assistant config for bot name:", error.message);
    }

    // Store bot response (with bot name prefix if available)
    const botMessageContent = botName ? `${botName}: ${botResponse}` : botResponse;
    
    const botMessage = await ChatbotMessage.create({
      sessionId: sessionId,
      content: botResponse, // Store original response without name prefix in DB
      role: 'assistant',
      isBot: true,
      userId: userId,
      timestamp: new Date()
    });

    // Update session
    await ChatbotSession.updateOne(
      { sessionId },
      { 
        lastActivity: new Date(),
        $inc: { messageCount: 1 }
      }
    );

    // Return response with bot name if available
    const finalResponse = botName ? `${botName}: ${botResponse}` : botResponse;
    
    return res.status(200).json({
      success: true,
      message: finalResponse,
      messageId: botMessage._id
    });
  } catch (error) {
    console.error('❌ Chatbot error:', {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status
    });

    // Handle specific OpenAI API errors
    if (error.response) {
      const status = error.response.status;
      const errorData = error.response.data;

      if (status === 401) {
        return res.status(500).json({
          success: false,
          msg: 'Chatbot authentication failed. Please contact support.'
        });
      } else if (status === 429) {
        return res.status(429).json({
          success: false,
          msg: 'Chatbot is currently busy. Please try again in a moment.'
        });
      } else {
        return res.status(500).json({
          success: false,
          msg: errorData?.error?.message || 'Failed to process chat message. Please try again.'
        });
      }
    }

    // Handle network errors
    if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
      return res.status(504).json({
        success: false,
        msg: 'Chatbot request timed out. Please try again.'
      });
    }

    // Generic error
    return res.status(500).json({
      success: false,
      msg: error.message || 'Failed to process chat message. Please try again later.'
    });
  }
});

/**
 * Send email transcript
 */
exports.sendEmailTranscript = catchAsyncErrors(async (req, res, next) => {
  try {
    const { sessionId, email } = req.body;
    
    if (!sessionId) {
      return res.status(400).json({
        success: false,
        msg: 'Session ID is required'
      });
    }

    // Get session and messages
    const session = await ChatbotSession.findOne({ sessionId });
    if (!session) {
      return res.status(404).json({
        success: false,
        msg: 'Session not found'
      });
    }

    const messages = await ChatbotMessage.find({ sessionId })
      .sort({ timestamp: 1 })
      .lean();

    if (!messages || messages.length === 0) {
      return res.status(400).json({
        success: false,
        msg: 'No messages found to send'
      });
    }
    
    // Only send transcript if user has sent at least one message
    const hasUserMessage = messages.some(msg => msg.role === 'user' || msg.isBot === false);
    if (!hasUserMessage) {
      return res.status(400).json({
        success: false,
        msg: 'No user messages found. Transcript will not be sent for sessions without user interaction.'
      });
    }

    // Extract email from messages if not provided
    let recipientEmail = email || extractUserEmailFromMessages(messages);
    
    if (!recipientEmail) {
      return res.status(400).json({
        success: false,
        msg: 'Email address is required. Please provide an email or include it in your messages.'
      });
    }

    // Get IP address
    let ipAddress = req.ip || req.connection.remoteAddress;
    let ipData = {};
    
    try {
      const ipResponse = await fetch(`http://ip-api.com/json/${ipAddress}`);
      ipData = await ipResponse.json();
    } catch (ipError) {
      console.error('Error fetching IP data:', ipError);
    }

    // Get assistant config for email content (use the assistant ID from the session)
    let emailContent;
    try {
      // Determine which assistant was used for this session
      const sessionAssistantId = session.useWidgetAssistant 
        ? process.env.OPENAI_ASSISTANT_ID_TWO 
        : process.env.OPENAI_ASSISTANT_ID;
      const assistantConfig = await getAssistantConfig(sessionAssistantId);
      const sessionData = {
        sessionId: sessionId,
        messages: messages,
        createdAt: session.createdAt || messages[0]?.timestamp,
        lastActivity: session.lastActivity,
        url: session.url,
        referrer: session.referrer,
        userAgent: session.userAgent
      };
      emailContent = generateEmailContent(sessionData, assistantConfig, sessionId);
    } catch (error) {
      console.error("❌ Error generating email content:", error);
      return res.status(500).json({
        success: false,
        msg: 'Failed to generate email content. Please try again later.'
      });
    }

    // Send email using generated content
    // Use "Chain Assistant" as from name if this is a widget assistant session
    const fromName = session.useWidgetAssistant ? 'Chain Assistant' : null;
    try {
      await sendEmail(recipientEmail, emailContent.subject, emailContent.htmlContent, fromName);
      
      // Update session
      await ChatbotSession.updateOne(
        { sessionId },
        { 
          emailSent: true,
          emailSentAt: new Date()
        }
      );

      return res.status(200).json({
        success: true,
        msg: 'Email sent successfully',
        email: recipientEmail
      });
    } catch (emailError) {
      console.error('Error sending email:', emailError);
      return res.status(500).json({
        success: false,
        msg: 'Failed to send email. Please try again later.'
      });
    }
  } catch (error) {
    console.error('❌ Error sending email transcript:', error);
    return res.status(500).json({
      success: false,
      msg: 'Failed to send email transcript'
    });
  }
});
     
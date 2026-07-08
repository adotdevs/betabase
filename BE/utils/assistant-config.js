const OpenAI = require("openai");
require("dotenv").config({ path: require('path').resolve(__dirname, '../config/config.env') });

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Cache for assistant configuration
let assistantConfigCache = null;
let cacheExpiry = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Fetch assistant configuration from OpenAI API
 * @param {string} assistantId - Optional assistant ID. If not provided, uses default OPENAI_ASSISTANT_ID
 */
async function getAssistantConfig(assistantId = null) {
  try {
    // Use provided assistant ID or default to OPENAI_ASSISTANT_ID
    const targetAssistantId = assistantId || process.env.OPENAI_ASSISTANT_ID;
    
    // Check cache first (but only if using default assistant to avoid cache conflicts)
    if (!assistantId && assistantConfigCache && Date.now() < cacheExpiry) {
      console.log("📋 Using cached assistant configuration");
      return assistantConfigCache;
    }

    console.log("🔍 Fetching assistant configuration from OpenAI...", { assistantId: targetAssistantId });
    
    // Add timeout to prevent hanging
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Assistant config fetch timeout')), 10000);
    });
    
    const fetchPromise = openai.beta.assistants.retrieve(targetAssistantId);
    const assistant = await Promise.race([fetchPromise, timeoutPromise]);
    
    // Parse the instructions to extract structured data
    const config = parseAssistantInstructions(assistant.instructions);
    
    // Cache the result only for default assistant (to avoid conflicts)
    if (!assistantId) {
      assistantConfigCache = config;
      cacheExpiry = Date.now() + CACHE_DURATION;
    }
    
    console.log("✅ Assistant configuration loaded successfully");
    console.log("📋 Config details:", {
      name: config.name,
      services: config.services.length,
      contact: Object.keys(config.contact).length,
      assistantId: targetAssistantId
    });
    
    return config;
  } catch (error) {
    console.error("❌ Error fetching assistant configuration:", error);
    console.log("🔄 Using fallback configuration");
    
    // Return fallback configuration if API fails
    return getFallbackConfig();
  }
}

/**
 * Parse assistant instructions to extract structured data
 */
function parseAssistantInstructions(instructions) {
  console.log("🔍 Parsing assistant instructions...");
  
  const config = {
    name: "",
    website: "",
    services: [],
    contact: {},
    guidelines: []
  };

  try {
    // Extract contact information
    const contactMatch = instructions.match(/CONTACT INFORMATION:([\s\S]*?)(?=\n[A-Z]|$)/i);
    if (contactMatch) {
      const contactSection = contactMatch[1];
      const phoneMatch = contactSection.match(/- Phone: ([^\n]+)/i);
      const emailMatch = contactSection.match(/- Email: ([^\n]+)/i);
      const addressMatch = contactSection.match(/- Address: ([^\n]+)/i);
      const websiteMatch = contactSection.match(/- Website: ([^\n]+)/i);
      
      if (phoneMatch) config.contact.phone = phoneMatch[1].trim();
      if (emailMatch) config.contact.email = emailMatch[1].trim();
      if (addressMatch) config.contact.address = addressMatch[1].trim();
      if (websiteMatch) config.contact.website = websiteMatch[1].trim();
      
      console.log("📞 Extracted contact info:", Object.keys(config.contact));
    }

    // Extract services
    const servicesMatch = instructions.match(/SERVICES YOU PROVIDE:([\s\S]*?)(?=\n[A-Z]|$)/i);
    if (servicesMatch) {
      const servicesSection = servicesMatch[1];
      const serviceLines = servicesSection.split('\n').filter(line => line.trim().startsWith('-'));
      config.services = serviceLines.map(line => line.replace(/^-\s*/, '').trim());
      console.log("🛠️ Extracted services:", config.services.length);
    }

    // Extract guidelines
    const guidelinesMatch = instructions.match(/IMPORTANT INSTRUCTIONS:([\s\S]*?)(?=\n[A-Z]|$)/i);
    if (guidelinesMatch) {
      const guidelinesSection = guidelinesMatch[1];
      const guidelineLines = guidelinesSection.split('\n').filter(line => line.trim().startsWith('-'));
      config.guidelines = guidelineLines.map(line => line.replace(/^-\s*/, '').trim());
      console.log("📋 Extracted guidelines:", config.guidelines.length);
    }

    // Extract name from instructions (usually at the beginning)
    const nameMatch = instructions.match(/You are ([^\n]+)/i) || instructions.match(/I am ([^\n]+)/i);
    if (nameMatch) {
      config.name = nameMatch[1].trim();
    }

    // Fallback to hardcoded values if parsing failed
    if (Object.keys(config.contact).length === 0) {
      console.log("⚠️ No contact info extracted, using fallback");
      config.contact = {
        phone: "",
        email: "",
        address: "",
        website: ""
      };
    }

    if (config.services.length === 0) {
      console.log("⚠️ No services extracted, using fallback");
      config.services = [];
    }

    if (config.guidelines.length === 0) {
      console.log("⚠️ No guidelines extracted, using fallback");
      config.guidelines = [];
    }

    console.log("✅ Assistant configuration parsed successfully");
    return config;
  } catch (error) {
    console.error("❌ Error parsing assistant instructions:", error);
    return getFallbackConfig();
  }
}

/**
 * Fallback configuration if API fails
 */
function getFallbackConfig() {
  return {
    name: "",
    website: "",
    services: [],
    contact: {
      phone: "",
      email: "",
      address: "",
      website: ""
    },
    guidelines: []
  };
}

/**
 * Generate context message from assistant configuration
 */
function generateContextMessage(userMessage, config, conversationHistory = []) {
  const servicesList = config.services.map(service => `- ${service}`).join('\n');
  const guidelinesList = config.guidelines.map(guideline => `- ${guideline}`).join('\n');
  
  let contextMessage = `You are ${config.name || 'an AI assistant'}. ${config.website ? `Website: ${config.website}` : ''}

SERVICES YOU PROVIDE:
${servicesList || 'No specific services listed'}

CONTACT INFORMATION:
- Phone: ${config.contact.phone || 'Not provided'}
- Email: ${config.contact.email || 'Not provided'}
- Address: ${config.contact.address || 'Not provided'}
- Website: ${config.contact.website || 'Not provided'}

IMPORTANT INSTRUCTIONS:
${guidelinesList || 'No specific guidelines'}

CONVERSATION CONTEXT:
- You are having a conversation with a potential client
- Remember what has been discussed previously
- Do NOT ask for email address if it has already been provided
- Continue the conversation naturally based on previous messages
- If the user has already provided their email, acknowledge it and continue helping`;

  // Add conversation history if available
  if (conversationHistory && conversationHistory.length > 0) {
    contextMessage += `\n\nPREVIOUS CONVERSATION:\n`;
    conversationHistory.forEach((msg, index) => {
      const role = msg.isBot ? 'Assistant' : 'User';
      contextMessage += `${role}: ${msg.content}\n`;
    });
  }

  contextMessage += `\n\nCurrent user message: ${userMessage}`;
  
  return contextMessage;
}

/**
 * Generate email content with dynamic contact information
 */
function generateEmailContent(sessionData, config, sessionId = null) {
  const messages = sessionData.messages || [];
  const companyName = config.name.split(' - ')[1] || config.name || 'Company';
  const botName = config.name.split(' - ')[0] || 'AI Assistant';
  
  const textContent = `${companyName} - Chat Transcript
${sessionId ? `Session ID: ${sessionId}\n` : ''}Date: ${new Date().toLocaleString()}
Total Messages: ${messages.length}

Chat Transcript:
${messages.map(msg => {
    const sender = msg.isBot ? botName : 'You';
    const content = msg.content || '';
    return `${sender}: ${content}`;
  }).join('\n')}`;

  const htmlContent = `<h2>${companyName} - Chat Transcript</h2>
<p>Thank you for your interest in our services.</p>
${sessionId ? `<div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin-bottom: 20px;">
  <p><strong>Session ID:</strong> ${sessionId}</p>
  <p><strong>Date:</strong> ${new Date().toLocaleString()}</p>
  <p><strong>Total Messages:</strong> ${messages.length}</p>
</div>` : ''}
<h3>Chat Transcript:</h3>
<div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px;">
  ${messages.map(msg => {
    const sender = msg.isBot ? botName : 'You';
    const content = (msg.content || '').replace(/\n/g, '<br>');
    return `
    <div style="margin-bottom: 10px;">
      <strong>${sender}:</strong> ${content}
    </div>
  `;
  }).join('')}
</div>`;

  return { textContent, htmlContent, subject: `${companyName} - Chat Transcript` };
}

module.exports = {
  getAssistantConfig,
  generateContextMessage,
  generateEmailContent,
  parseAssistantInstructions
};

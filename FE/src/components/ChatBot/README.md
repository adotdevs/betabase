# ChatBot Component

## Overview
A professional GPT-powered chatbot component that appears on all pages with a floating button in the bottom right corner.

## Features
- ✅ Floating chat button in bottom right corner
- ✅ Professional chat window UI
- ✅ GPT integration (via backend API or OpenAI direct)
- ✅ Conversation history
- ✅ Typing indicators
- ✅ Responsive design
- ✅ Smooth animations

## Backend API Endpoint

The chatbot backend endpoint is already implemented at:
```
POST /api/v1/chatbot/message
```

### Request Body:
```json
{
  "message": "User's message text",
  "conversationHistory": [
    {
      "role": "user",
      "content": "Previous user message"
    },
    {
      "role": "assistant",
      "content": "Previous AI response"
    }
  ]
}
```

### Response Format:
```json
{
  "success": true,
  "message": "AI assistant response text"
}
```

### Error Response:
```json
{
  "success": false,
  "msg": "Error message"
}
```

## Backend Implementation

The backend chatbot controller is located at:
- **Controller**: `BE/controllers/chatbotController.js`
- **Route**: `BE/routes/userRoute.js` (line: `/chatbot/message`)

### Environment Variables Required

The backend uses these environment variables from `BE/config/config.env`:
```
OPENAI_API_KEY=sk-proj-...
OPENAI_MODEL=gpt-4o-mini
OPENAI_ASSISTANT_ID=asst_... (optional, for future use)
```

The backend automatically:
- ✅ Uses OpenAI API with the configured API key
- ✅ Uses the specified model (gpt-4o-mini by default)
- ✅ Handles authentication for all users
- ✅ Includes conversation history
- ✅ Provides error handling and user-friendly messages
- ✅ Has proper timeout handling (30 seconds)

### Authentication

The chatbot endpoint requires user authentication:
- Route is protected with `isAuthorizedUser` middleware
- All authenticated users can access the chatbot
- No role restrictions (accessible to all user types)

## Styling

The component uses styled-components and matches the Betabase design system:
- Gradient buttons matching the landing page
- Professional chat interface
- Responsive design for mobile devices

## Usage

The chatbot is automatically included in `App.jsx` and will appear on all pages. No additional setup required!

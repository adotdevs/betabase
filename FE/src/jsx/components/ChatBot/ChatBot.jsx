import React, { useState, useRef, useEffect } from 'react';
import styled from 'styled-components';
import { 
  chatbotApi, 
  createChatbotSessionApi, 
  getChatbotSessionMessagesApi,
  clearChatbotApi
} from '../../Api/Service';
import './ChatBot.css';

const ChatBot = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [sessionId, setSessionId] = useState(null);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [botName, setBotName] = useState('AI Assistant');
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Format timestamp - show time like "10:30 PM"
  const formatTime = (date) => {
    if (!date) return '';
    const messageDate = new Date(date);
    const now = new Date();
    
    // Check if same day
    const isToday = messageDate.toDateString() === now.toDateString();
    const isYesterday = messageDate.toDateString() === new Date(now.getTime() - 24 * 60 * 60 * 1000).toDateString();
    
    // Format time as "10:30 PM"
    const timeStr = messageDate.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    });
    
    if (isToday) {
      return timeStr;
    } else if (isYesterday) {
      return `Yesterday ${timeStr}`;
    } else {
      // Different day - show date and time
      const dateStr = messageDate.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric'
      });
      return `${dateStr} ${timeStr}`;
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Initialize session on mount
  useEffect(() => {
    const initializeSession = async () => {
      try {
        // Try to restore existing session from localStorage
        const savedSessionId = localStorage.getItem('chatbot_sessionId');
        
        const response = await createChatbotSessionApi({ 
          sessionId: savedSessionId || null 
        });
        
        if (response && response.success) {
          setSessionId(response.sessionId);
          localStorage.setItem('chatbot_sessionId', response.sessionId);
          
          if (response.restored && response.messages) {
            // Restore messages with proper timestamp format
            let foundBotName = false;
            const restoredMessages = response.messages.map(msg => {
              const content = msg.content;
              console.log('Content:', content);
              // Extract bot name from first assistant message
              if (msg.isBot && !foundBotName) {
                const botInfo = extractBotName(content);
                console.log('Bot info:', botInfo);
                if (botInfo) {
                  setBotName(botInfo.name);
                  foundBotName = true;
                  return {
                    role: 'assistant',
                    content: botInfo.message, // Remove bot name from content
                    timestamp: new Date(msg.timestamp || msg.createdAt)
                  };
                }
              } else if (msg.isBot) {
                // Remove bot name from content if it exists
                const botInfo = extractBotName(content);
                return {
                  role: 'assistant',
                  content: botInfo ? botInfo.message : content,
                  timestamp: new Date(msg.timestamp || msg.createdAt)
                };
              }
              return {
                role: msg.isBot ? 'assistant' : 'user',
                content: content,
                timestamp: new Date(msg.timestamp || msg.createdAt)
              };
            });
            setMessages(restoredMessages);
          } else if (response.messages) {
            // New session with greeting
            let foundBotName = false;
            const greetingMessages = response.messages.map(msg => {
              const content = msg.content;
              // Extract bot name from first assistant message
              if (msg.isBot && !foundBotName) {
                const botInfo = extractBotName(content);
                if (botInfo) {
                  setBotName(botInfo.name);
                  foundBotName = true;
                  return {
                    role: 'assistant',
                    content: botInfo.message, // Remove bot name from content
                    timestamp: new Date(msg.timestamp || msg.createdAt)
                  };
                }
              } else if (msg.isBot) {
                // Remove bot name from content if it exists
                const botInfo = extractBotName(content);
                return {
                  role: 'assistant',
                  content: botInfo ? botInfo.message : content,
                  timestamp: new Date(msg.timestamp || msg.createdAt)
                };
              }
              return {
                role: msg.isBot ? 'assistant' : 'user',
                content: content,
                timestamp: new Date(msg.timestamp || msg.createdAt)
              };
            });
            setMessages(greetingMessages);
          }
        }
      } catch (error) {
        console.error('Error initializing session:', error);
        // Don't set hardcoded greeting - let OpenAI Assistant handle it
        setMessages([]);
      } finally {
        setIsInitializing(false);
      }
    };

    initializeSession();
  }, []);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Debug: Log when botName changes
  useEffect(() => {
    console.log('🔄 Bot name state updated to:', botName);
  }, [botName]);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!inputMessage.trim() || isLoading) return;

    const userMessage = {
      role: 'user',
      content: inputMessage.trim(),
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setIsLoading(true);

    try {
      // Ensure we have a session
      if (!sessionId) {
        const sessionResponse = await createChatbotSessionApi({});
        if (sessionResponse && sessionResponse.success) {
          setSessionId(sessionResponse.sessionId);
          localStorage.setItem('chatbot_sessionId', sessionResponse.sessionId);
        }
      }

      // Send message to backend chatbot API
      const response = await chatbotApi({
        message: userMessage.content,
        sessionId: sessionId || localStorage.getItem('chatbot_sessionId'),
        conversationHistory: messages
      });

      if (response && response.success && response.message) {
        // Extract bot name from message
        const botInfo = extractBotName(response.message);
        const messageContent = botInfo ? botInfo.message : response.message;
        
        // Set bot name if extracted (always update if we find a bot name)
        if (botInfo) {
          console.log('🔄 Setting bot name state to:', botInfo.name);
          setBotName(botInfo.name);
          console.log('✅ Bot name extracted and set:', botInfo.name);
        } else {
          console.log('⚠️ No bot name found in message. Full message:', response.message);
          // If bot name is still default, try to extract from any previous messages
          if (botName === 'AI Assistant') {
            // Check all existing messages for bot name
            const allMessages = [...messages, { role: 'assistant', content: response.message }];
            for (const msg of allMessages) {
              if (msg.role === 'assistant') {
                const extracted = extractBotName(msg.content);
                if (extracted) {
                  setBotName(extracted.name);
                  console.log('✅ Bot name found in previous message:', extracted.name);
                  break;
                }
              }
            }
          }
        }
        
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: messageContent, // Store message without bot name
          timestamp: new Date()
        }]);
      } else if (response && response.msg) {
        // Handle error message from backend - show technical error, not chatbot message
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: response.msg,
          timestamp: new Date()
        }]);
      } else {
        throw new Error('Invalid response from server');
      }
    } catch (error) {
      // Error handling - show technical error message, not chatbot-style message
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: error.message || 'An error occurred. Please try again.',
        timestamp: new Date()
      }]);
      console.error('Chatbot error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage(e);
    }
  };

  const handleClearChat = async () => {
    if (!sessionId) return;
    
    try {
      const response = await clearChatbotApi({ sessionId });
      if (response && response.success) {
        setMessages([]);
        // Session is cleared, messages will be empty until user sends first message
        // OpenAI Assistant will handle greeting based on its instructions
      }
    } catch (error) {
      console.error('Error clearing chat:', error);
    }
  };

  // Extract bot name from message content
  const extractBotName = (content) => {
    if (!content || typeof content !== 'string') return null;
    
    // Try to match "BotName: message" format
    // Match pattern: any characters (including special chars like commas, periods, dashes, em dashes) 
    // followed by colon and optional space, then the rest of the message
    // This handles long bot names with special characters
    // Use multiline flag and match from start of string
    const match = content.match(/^([^:]+?):\s*(.+)$/s);
    if (match && match[1] && match[2]) {
      const name = match[1].trim();
      const message = match[2].trim();
      
      // Only extract if both name and message have content
      // Allow longer names (up to 150 chars) to handle descriptive bot names
      // The actual bot name is about 100 characters
      if (name.length > 0 && name.length <= 150 && message.length > 0) {
        // Additional validation: name should not be too short (at least 5 chars) and should contain letters
        if (name.length >= 5 && /[a-zA-Z]/.test(name)) {
          console.log('✅ Extracted bot name:', name);
          console.log('✅ Message content:', message.substring(0, 50) + '...');
          return {
            name: name,
            message: message
          };
        } else {
          console.log('❌ Bot name validation failed - name too short or no letters');
        }
      } else {
        console.log('❌ Bot name extraction failed - name length:', name.length, 'message length:', message.length);
      }
    } else {
      // Log first 200 chars to see what we're working with
      console.log('❌ Regex did not match. Content preview:', content.substring(0, 200));
      console.log('❌ Content starts with colon?', content.trim().startsWith(':'));
      console.log('❌ Content has colon?', content.includes(':'));
    }
    return null;
  };

  return (
    <>
      <ChatButton onClick={() => setIsOpen(!isOpen)} isOpen={isOpen}>
        {isOpen ? (
          <CloseIcon>×</CloseIcon>
        ) : (
          <ChatIcon>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M20 2H4C2.9 2 2 2.9 2 4V22L6 18H20C21.1 18 22 17.1 22 16V4C22 2.9 21.1 2 20 2Z" fill="currentColor"/>
            </svg>
          </ChatIcon>
        )}
      </ChatButton>

      {isOpen && (
        <ChatWindow>
          <ChatHeader>
            <ChatHeaderContent>
              <ChatTitle>{(() => {
                console.log('🎨 Rendering header with botName:', botName);
                return botName;
              })()}</ChatTitle> 
            </ChatHeaderContent>
            <HeaderActions>
              <ActionButton onClick={handleClearChat} title="Clear Chat">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M3 6H5H21M8 6V4C8 3.46957 8.21071 2.96086 8.58579 2.58579C8.96086 2.21071 9.46957 2 10 2H14C14.5304 2 15.0391 2.21071 15.4142 2.58579C15.7893 2.96086 16 3.46957 16 4V6M19 6V20C19 20.5304 18.7893 21.0391 18.4142 21.4142C18.0391 21.7893 17.5304 22 17 22H7C6.46957 22 5.96086 21.7893 5.58579 21.4142C5.21071 21.0391 5 20.5304 5 20V6H19Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </ActionButton>
              <CloseButton onClick={() => setIsOpen(false)}>
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M15 5L5 15M5 5L15 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </CloseButton>
            </HeaderActions>
          </ChatHeader>

          <ChatMessages>
            {messages.map((message, index) => {
              const isUser = message.role === 'user';

              return (
                <Message key={index} isUser={isUser}>
                  <MessageWrapper isUser={isUser}>
                    {!isUser && (
                      <BotAvatar>
                        <BotAvatarIcon>
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM12 18C11.45 18 11 17.55 11 17C11 16.45 11.45 16 12 16C12.55 16 13 16.45 13 17C13 17.55 12.55 18 12 18ZM15.5 9C15.5 9.83 14.83 10.5 14 10.5C13.17 10.5 12.5 9.83 12.5 9C12.5 8.17 13.17 7.5 14 7.5C14.83 7.5 15.5 8.17 15.5 9ZM10 9C10 9.83 9.33 10.5 8.5 10.5C7.67 10.5 7 9.83 7 9C7 8.17 7.67 7.5 8.5 7.5C9.33 7.5 10 8.17 10 9ZM12 13.5C10.07 13.5 8.5 14.57 8.5 16V17H15.5V16C15.5 14.57 13.93 13.5 12 13.5Z" fill="currentColor"/>
                          </svg>
                        </BotAvatarIcon>
                      </BotAvatar>
                    )}
                    <MessageContentWrapper>
                      <MessageContent isUser={isUser}>
                        <MessageText>{message.content}</MessageText>
                      </MessageContent>
                      <MessageTime isUser={isUser}>
                        {formatTime(message.timestamp)}
                      </MessageTime>
                    </MessageContentWrapper>
                    {isUser && (
                      <UserAvatar>
                        <UserAvatarIcon>
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M12 12C14.21 12 16 10.21 16 8C16 5.79 14.21 4 12 4C9.79 4 8 5.79 8 8C8 10.21 9.79 12 12 12ZM12 14C9.33 14 4 15.34 4 18V20H20V18C20 15.34 14.67 14 12 14Z" fill="currentColor"/>
                          </svg>
                        </UserAvatarIcon>
                      </UserAvatar>
                    )}
                  </MessageWrapper>
                </Message>
              );
            })}
            {isLoading && (
              <Message isUser={false}>
                <MessageWrapper isUser={false}>
                  <BotAvatar>
                    <BotAvatarIcon>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM12 18C11.45 18 11 17.55 11 17C11 16.45 11.45 16 12 16C12.55 16 13 16.45 13 17C13 17.55 12.55 18 12 18ZM15.89 9.5C15.89 10.38 15.17 11.1 14.29 11.1C13.41 11.1 12.69 10.38 12.69 9.5C12.69 8.62 13.41 7.9 14.29 7.9C15.17 7.9 15.89 8.62 15.89 9.5ZM9.31 9.5C9.31 10.38 8.59 11.1 7.71 11.1C6.83 11.1 6.11 10.38 6.11 9.5C6.11 8.62 6.83 7.9 7.71 7.9C8.59 7.9 9.31 8.62 9.31 9.5ZM12 14C9.24 14 7 15.24 7 17V18H17V17C17 15.24 14.76 14 12 14Z" fill="currentColor"/>
                      </svg>
                    </BotAvatarIcon>
                  </BotAvatar>
                  <MessageContentWrapper>
                    <MessageContent isUser={false}>
                      <TypingIndicator>
                        <span></span>
                        <span></span>
                        <span></span>
                      </TypingIndicator>
                    </MessageContent>
                  </MessageContentWrapper>
                </MessageWrapper>
              </Message>
            )}
            <div ref={messagesEndRef} />
          </ChatMessages>

          <ChatInputContainer>
            <ChatInputForm onSubmit={handleSendMessage}>
              <ChatInput
                ref={inputRef}
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Type your message..."
                disabled={isLoading}
              />
              <SendButton type="submit" disabled={!inputMessage.trim() || isLoading}>
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M18 2L9 11M18 2L12 18L9 11M18 2L2 8L9 11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </SendButton>
            </ChatInputForm>
          </ChatInputContainer>
        </ChatWindow>
      )}
    </>
  );
};

export default ChatBot;

// Styled Components
const ChatButton = styled.button`
  position: fixed;
  bottom: 24px;
  right: 24px;
  width: 60px;
  height: 60px;
  border-radius: 50%;
  background: linear-gradient(139.48deg, #FEA63E 6.99%, #F03131 53.88%, #ED05AC 99.96%);
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  z-index: 9998;
  transition: all 0.3s ease;
  color: white;

  &:hover {
    transform: scale(1.1);
    box-shadow: 0 6px 25px rgba(0, 0, 0, 0.4);
  }

  &:active {
    transform: scale(0.95);
  }

  @media (max-width: 768px) {
    width: 56px;
    height: 56px;
    bottom: 20px;
    right: 20px;
  }
`;

const ChatIcon = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
`;

const CloseIcon = styled.div`
  font-size: 32px;
  font-family:poppins;
  font-weight: 300;
  line-height: 1;
`;

const ChatWindow = styled.div`
  position: fixed;
  bottom: 100px;
  right: 24px;
  width: 380px;
  height: 600px;
  background: #ffffff;
  border-radius: 16px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  display: flex;
  flex-direction: column;
  z-index: 9999;
  overflow: hidden;

  @media (max-width: 768px) {
    width: calc(100vw - 40px);
    height: calc(100vh - 140px);
    max-height: 600px;
    bottom: 100px;
    right: 20px;
    left: 20px;
  }

  @media (max-width: 480px) {
    width: calc(100vw - 32px);
    right: 16px;
    left: 16px;
    height: calc(100vh - 120px);
  }
`;

const ChatHeader = styled.div`
  background: linear-gradient(139.48deg, #FEA63E 6.99%, #F03131 53.88%, #ED05AC 99.96%);
  padding: 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: white;
`;

const ChatHeaderContent = styled.div`
  flex: 1;
`;

const HeaderActions = styled.div`
  display: flex;
  gap: 8px;
  align-items: center;
`;

const ActionButton = styled.button`
  background: rgba(255, 255, 255, 0.2);
  border: none;
  border-radius: 50%;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: white;
  transition: all 0.2s ease;

  &:hover {
    background: rgba(255, 255, 255, 0.3);
    transform: scale(1.05);
  }

  &:active {
    transform: scale(0.95);
  }
`;

const ChatTitle = styled.h3`
  margin: 0;
  font-size: 18px;
  font-family:poppins;
  font-weight: 700;
  color: white;
`;

const ChatSubtitle = styled.p`
  margin: 4px 0 0 0;
  font-size: 12px;
  font-family:poppins;
  opacity: 0.9;
  color: white;
`;

const CloseButton = styled.button`
  background: rgba(255, 255, 255, 0.2);
  border: none;
  border-radius: 50%;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: white;
  transition: all 0.2s ease;

  &:hover {
    background: rgba(255, 255, 255, 0.3);
    transform: rotate(90deg);
  }
`;

const ChatMessages = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  background: #f8f9fa;
  display: flex;
  flex-direction: column;
  gap: 16px;

  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
  }

  &::-webkit-scrollbar-thumb {
    background: #ddd;
    border-radius: 3px;
  }

  &::-webkit-scrollbar-thumb:hover {
    background: #bbb;
  }
`;

const Message = styled.div`
  display: flex;
  flex-direction: column;
  align-items: ${props => props.isUser ? 'flex-end' : 'flex-start'};
  width: 100%;
  margin-bottom: 4px;
`;

const MessageWrapper = styled.div`
  display: flex;
  align-items: flex-end;
  gap: 8px;
  max-width: 85%;
  flex-direction: ${props => props.isUser ? 'row-reverse' : 'row'};
`;

const BotAvatar = styled.div`
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: linear-gradient(139.48deg, #FEA63E 6.99%, #F03131 53.88%, #ED05AC 99.96%);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
`;

const BotAvatarIcon = styled.div`
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const UserAvatar = styled.div`
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: #e0e0e0;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
`;

const UserAvatarIcon = styled.div`
  color: #666;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const MessageContentWrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
`;

const MessageContent = styled.div`
  padding: 12px 16px;
  border-radius: ${props => props.isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px'};
  background: ${props => props.isUser 
    ? 'linear-gradient(139.48deg, #FEA63E 6.99%, #F03131 53.88%, #ED05AC 99.96%)' 
    : '#ffffff'};
  color: ${props => props.isUser ? '#ffffff' : '#333333'};
  font-size: 14px;
  font-family:poppins;
  line-height: 1.6;
  word-wrap: break-word;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  white-space: pre-wrap;
`;

const MessageTime = styled.div`
  font-size: 11px;
  font-family:poppins;
  color: #999;
  padding: 4px 8px 0 8px;
  text-align: ${props => props.isUser ? 'right' : 'left'};
  font-weight: 400;
  margin-top: 4px;
`;

const BotNameLabel = styled.div`
  font-size: 12px;
  font-family:poppins;
  font-weight: 600;
  color: #666;
  margin-bottom: 4px;
  padding: 0 4px;
`;

const BotNameInBubble = styled.div`
  font-size: 13px;
  font-family:poppins;
  font-weight: 700;
  color: ${props => props.isUser ? 'rgba(255, 255, 255, 0.95)' : '#FEA63E'};
  margin-bottom: 8px;
  padding-bottom: 4px;
  border-bottom: 1px solid ${props => props.isUser ? 'rgba(255, 255, 255, 0.2)' : 'rgba(254, 166, 62, 0.2)'};
  text-transform: capitalize;
  letter-spacing: 0.3px;
  display: block;
`;

const MessageText = styled.div`
  word-wrap: break-word;
  white-space: pre-wrap;
`;

const MessageTimeInBubble = styled.div`
  font-size: 10px;
  font-family:poppins;
  color: ${props => props.isUser ? 'rgba(255, 255, 255, 0.75)' : '#999'};
  margin-top: 8px;
  padding-top: 6px;
  border-top: 1px solid ${props => props.isUser ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.08)'};
  font-weight: 400;
`;

const TypingIndicator = styled.div`
  display: flex;
  gap: 4px;
  padding: 8px 0;

  span {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #999;
    animation: typing 1.4s infinite;

    &:nth-child(2) {
      animation-delay: 0.2s;
    }

    &:nth-child(3) {
      animation-delay: 0.4s;
    }
  }

  @keyframes typing {
    0%, 60%, 100% {
      transform: translateY(0);
      opacity: 0.7;
    }
    30% {
      transform: translateY(-10px);
      opacity: 1;
    }
  }
`;

const ChatInputContainer = styled.div`
  padding: 16px;
  background: #ffffff;
  border-top: 1px solid #e0e0e0;
`;

const ChatInputForm = styled.form`
  display: flex;
  gap: 8px;
  align-items: center;
`;

const ChatInput = styled.input`
  flex: 1;
  padding: 12px 16px;
  border: 1px solid #e0e0e0;
  border-radius: 24px;
  font-size: 14px;
  font-family:poppins;
  outline: none;
  transition: all 0.2s ease;

  &:focus {
    border-color: #FEA63E;
    box-shadow: 0 0 0 3px rgba(254, 166, 62, 0.1);
  }

  &:disabled {
    background: #f5f5f5;
    cursor: not-allowed;
  }

  &::placeholder {
    color: #999;
  }
`;

const SendButton = styled.button`
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: linear-gradient(139.48deg, #FEA63E 6.99%, #F03131 53.88%, #ED05AC 99.96%);
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  transition: all 0.2s ease;
  flex-shrink: 0;

  &:hover:not(:disabled) {
    transform: scale(1.05);
    box-shadow: 0 4px 12px rgba(254, 166, 62, 0.4);
  }

  &:active:not(:disabled) {
    transform: scale(0.95);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;


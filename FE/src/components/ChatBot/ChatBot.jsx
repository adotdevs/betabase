import React, { useState, useRef, useEffect } from 'react';
import styled from 'styled-components';
import { 
  chatbotApi, 
  createChatbotSessionApi, 
  getChatbotSessionMessagesApi,
  clearChatbotApi,
  sendChatbotEmailApi
} from '../../Api/Service';
import { API_URL } from '../../config/appConfig';
import './ChatBot.css';
import BotPic from '../../assets/botbeta.jpg'
const ChatBot = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [sessionId, setSessionId] = useState(null);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [botName, setBotName] = useState('AI Assistant');
  const [botAvatar, setBotAvatar] = useState(BotPic);
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [emailInput, setEmailInput] = useState('');
  const [showClearDialog, setShowClearDialog] = useState(false);
  const [hasShownHeroHeading, setHasShownHeroHeading] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const emailInputRef = useRef(null);

  // Format timestamp - show time like "10:30 PM"
  const formatTime = (date) => {
    if (!date) return '';
    const messageDate = new Date(date);
    const now = new Date();
    
    // Format time as "10:30 PM"
    const timeStr = messageDate.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    });
    
    return timeStr;
  };

  // Format date for separators
  const formatDate = (date) => {
    if (!date) return '';
    return new Date(date).toLocaleDateString('en-US', { 
      month: 'long', 
      day: 'numeric' 
    });
  };

  // Check if date changed between messages
  const shouldShowDateSeparator = (currentMsg, previousMsg) => {
    if (!previousMsg) return true;
    const currentDate = new Date(currentMsg.timestamp).toDateString();
    const previousDate = new Date(previousMsg.timestamp).toDateString();
    return currentDate !== previousDate;
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Extract bot name from message content (defined early for use in useEffect)
  const extractBotName = React.useCallback((content) => {
    if (!content || typeof content !== 'string') return null;
    
    // Try to match "BotName: message" format
    const match = content.match(/^([^:]+?):\s*(.+)$/s);
    if (match && match[1] && match[2]) {
      let name = match[1].trim();
      const message = match[2].trim();
      
      // Extract only the actual name part (before comma, dash, or other separators)
      // Split by comma, em-dash, or regular dash and take the first part
      const commaIndex = name.indexOf(',');
      const emDashIndex = name.indexOf('—');
      const dashIndex = name.indexOf('-');
      
      // Find the earliest separator
      let separatorIndex = -1;
      const indices = [commaIndex, emDashIndex, dashIndex].filter(idx => idx !== -1);
      if (indices.length > 0) {
        separatorIndex = Math.min(...indices);
      }
      
      // Extract just the name part before the separator
      if (separatorIndex > 0) {
        name = name.substring(0, separatorIndex).trim();
      }
      
      if (name.length > 0 && name.length <= 100 && message.length > 0) {
        if (name.length >= 3 && /[a-zA-Z]/.test(name)) {
          console.log('✅ Extracted bot name:', name);
          console.log('✅ Message content:', message.substring(0, 50) + '...');
          return {
            name: name,
            message: message
          };
        }
      }
    }
    return null;
  }, []);

  // Initialize session on mount and fetch greeting immediately
  useEffect(() => {
    const initializeSession = async () => {
      setIsInitializing(true);
      // Clear any existing session from localStorage first
      localStorage.removeItem('chatbot_sessionId');
      setMessages([]);
      setSessionId(null);
      setHasShownHeroHeading(false);
      
      try {
        // Always create a new session (don't restore from localStorage)
        // Session is cleared on page refresh/close, so start fresh
        const response = await createChatbotSessionApi({ 
          sessionId: null // Always create new session
        });
        
        if (response && response.success) {
          const newSessionId = response.sessionId;
          setSessionId(newSessionId);
          localStorage.setItem('chatbot_sessionId', newSessionId);
          
          // NEVER restore messages - always start fresh
          // Only handle new greeting messages (ignore restored sessions completely)
          if (response.restored) {
            // If backend tries to restore, ignore it and start fresh
            setMessages([]);
            await pollForGreeting(newSessionId);
          } else if (response.messages && response.messages.length > 0) {
            // New session with greeting already available
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
                    content: botInfo.message,
                    timestamp: new Date(msg.timestamp || msg.createdAt)
                  };
                }
              } else if (msg.isBot) {
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
          } else {
            // New session without greeting yet - poll for greeting
            setMessages([]);
            await pollForGreeting(newSessionId);
          }
        }
      } catch (error) {
        console.error('Error initializing session:', error);
        setMessages([]);
      } finally {
        setIsInitializing(false);
      }
    };

    // Helper function to poll for greeting message
    const pollForGreeting = async (sessionId, maxAttempts = 10, delay = 1000) => {
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
          await new Promise(resolve => setTimeout(resolve, delay));
          const response = await getChatbotSessionMessagesApi(sessionId);
          
          if (response && response.success && response.messages && response.messages.length > 0) {
            let foundBotName = false;
            const fetchedMessages = response.messages.map(msg => {
              const content = msg.content;
              if (msg.isBot && !foundBotName) {
                const botInfo = extractBotName(content);
                if (botInfo) {
                  setBotName(botInfo.name);
                  foundBotName = true;
                  return {
                    role: 'assistant',
                    content: botInfo.message,
                    timestamp: new Date(msg.timestamp || msg.createdAt)
                  };
                }
              } else if (msg.isBot) {
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
            setMessages(fetchedMessages);
            return; // Success, exit polling
          }
        } catch (error) {
          console.error(`Error polling for greeting (attempt ${attempt + 1}):`, error);
        }
      }
      // If we get here, greeting wasn't found after max attempts
      console.warn('Greeting not found after polling');
    };

    initializeSession();
  }, [extractBotName]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    if (showEmailDialog && emailInputRef.current) {
      emailInputRef.current.focus();
    }
  }, [showEmailDialog]);

  // Send transcript to admin email and clear session when user closes tab or reloads page
  useEffect(() => {
    let emailSent = false; // Flag to prevent duplicate emails
    
    const sendTranscriptToAdmin = () => {
      // Prevent duplicate emails
      if (emailSent) {
        return;
      }
      
      // Only send if we have a session and messages
      if (!sessionId || messages.length === 0) {
        // Clear session even if no messages
        localStorage.removeItem('chatbot_sessionId');
        return;
      }
      
      // Only send transcript if user has sent at least one message
      const hasUserMessage = messages.some(msg => msg.role === 'user');
      if (!hasUserMessage) {
        // No user messages, just clear session and don't send transcript
        localStorage.removeItem('chatbot_sessionId');
        return;
      }
      
      // Mark as sent immediately to prevent duplicates
      emailSent = true;
      
      const adminEmail = process.env.REACT_APP_ADMIN_EMAIL || 'admin@betabase.pro';
      const data = {
        sessionId: sessionId,
        email: adminEmail,
        isAdmin: true // Flag to indicate this is an admin notification
      };
      
      // Use sendBeacon for reliable delivery even if page is closing
      if (navigator.sendBeacon) {
        const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
        navigator.sendBeacon(`${API_URL}/chatbot/send-email`, blob);
        console.log('📧 Transcript sent to admin via sendBeacon');
      } else {
        // Fallback: fetch with keepalive (more reliable than regular fetch)
        fetch(`${API_URL}/chatbot/send-email`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(data),
          keepalive: true // Keep request alive even if page closes
        }).catch(err => {
          console.error('Error sending transcript to admin:', err);
        });
        console.log('📧 Transcript sent to admin via fetch (keepalive)');
      }
      
      // Clear session from localStorage after sending transcript
      localStorage.removeItem('chatbot_sessionId');
    };

    const handleBeforeUnload = (e) => {
      sendTranscriptToAdmin();
    };

    // Add event listener for beforeunload
    window.addEventListener('beforeunload', handleBeforeUnload);
    
    // Also handle pagehide (more reliable than beforeunload in some browsers)
    const handlePageHide = (e) => {
      sendTranscriptToAdmin();
    };
    
    window.addEventListener('pagehide', handlePageHide);

    // Cleanup
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [sessionId, messages.length]);

  // Debug: Log when botName changes
  useEffect(() => {
    console.log('🔄 Bot name state updated to:', botName);
  }, [botName]);

  // Track when messages first appear (for hero heading display)
  useEffect(() => {
    if (messages.length > 0 && !hasShownHeroHeading) {
      // Mark as shown - this is just for tracking, hero heading stays visible
      setHasShownHeroHeading(true);
    }
  }, [messages.length, hasShownHeroHeading]);


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
        
        setMessages(prev => {
          return [...prev, {
            role: 'assistant',
            content: messageContent,
            timestamp: new Date()
          }];
        });
      } else if (response && response.msg) {
        // Handle error message from backend
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: response.msg,
          timestamp: new Date()
        }]);
      } else {
        throw new Error('Invalid response from server');
      }
    } catch (error) {
      // Error handling
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
        setHasShownHeroHeading(false); // Reset hero heading for next messages
        setShowClearDialog(false);
      }
    } catch (error) {
      console.error('Error clearing chat:', error);
    }
  };

  const handleSendEmail = async () => {
    const email = emailInput.trim();
    if (!email) return;

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      alert('Please enter a valid email address');
      return;
    }

    try {
      const response = await sendChatbotEmailApi({
        sessionId: sessionId || localStorage.getItem('chatbot_sessionId'),
        email: email
      });

      if (response && response.success) {
        setShowEmailDialog(false);
        setEmailInput('');
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: '✅ Chat transcript has been sent to your email!',
          timestamp: new Date()
        }]);
      } else {
        alert('Failed to send email. Please try again.');
      }
    } catch (error) {
      console.error('Error sending email:', error);
      alert('Failed to send email. Please try again.');
    }
  };

  // Format message content (preserve line breaks, format lists, etc.)
  const formatMessageContent = (content) => {
    if (!content) return '';
    return content
      .replace(/\n/g, '<br>')
      .replace(/(\d+\.)\s/g, '<br><b>$1</b> ')
      .replace(/- (.*?)\n/g, '<li>$1</li>')
      .replace(/Estimated Cost:/g, '<b>Estimated Cost:</b>')
      .replace(/Timeline:/g, '<b>Timeline:</b>');
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
               
              <ChatTitle>Message us</ChatTitle>
            </ChatHeaderContent>
            <HeaderActions>
             
             
              <CloseButton onClick={() => setIsOpen(false)}>✕</CloseButton>
            </HeaderActions>
          </ChatHeader>

          <ChatMessages>
            {/* Hero Heading - Always show when messages exist */}
            {messages.length > 0 && (
              <>
                <HeroHeading>
                  <HeroAvatar src={botAvatar} alt={botName} />
                  <HeroName>{botName}</HeroName>
                  <HeroPara>joined</HeroPara>
                </HeroHeading>
                <DateSeparator>
                  {formatDate(messages[0].timestamp || new Date())}
                </DateSeparator>
              </>
            )}

            {/* Messages */}
            {messages.map((message, index) => {
              const isUser = message.role === 'user';
              const previousMessage = index > 0 ? messages[index - 1] : null;
              // Don't show date separator for first message if hero heading already showed it
              const showDateSeparator = index === 0 
                ? false 
                : shouldShowDateSeparator(message, previousMessage);

              return (
                <React.Fragment key={index}>
                  {showDateSeparator && (
                    <DateSeparator>
                      {formatDate(message.timestamp)}
                    </DateSeparator>
                  )}
                  <Message isUser={isUser}>
                    <MessageWrapper isUser={isUser}>
                      {!isUser && (
                        <BotAvatar>
                          <BotAvatarImg src={botAvatar} alt={botName} />
                        </BotAvatar>
                      )}
                      <MessageContentWrapper>
                        <MessageInfo>
                          <MessageSender>{isUser ? 'You' : botName}</MessageSender>
                          <MessageTime>{formatTime(message.timestamp)}</MessageTime>
                        </MessageInfo>
                        <MessageContent isUser={isUser}>
                          <MessageText dangerouslySetInnerHTML={{ __html: formatMessageContent(message.content) }} />
                        </MessageContent>
                      </MessageContentWrapper>
                       
                    </MessageWrapper>
                  </Message>
                </React.Fragment>
              );
            })}
            
            {/* Typing Indicator */}
            {isLoading && (
              <Message isUser={false}>
                <MessageWrapper isUser={false}>
                  <BotAvatar>
                    <BotAvatarImg src={botAvatar} alt={botName} />
                  </BotAvatar>
                  <MessageContentWrapper>
                    <MessageInfo>
                      <MessageSender>{botName}</MessageSender>
                      <MessageTime>{formatTime(new Date())}</MessageTime>
                    </MessageInfo>
                    <TypingIndicator>
                      <TypingDot style={{ animationDelay: '0s' }} />
                      <TypingDot style={{ animationDelay: '0.15s' }} />
                      <TypingDot style={{ animationDelay: '0.3s' }} />
                    </TypingIndicator>
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

      {/* Email Dialog */}
      {showEmailDialog && (
        <DialogOverlay onClick={() => setShowEmailDialog(false)}>
          <DialogContent onClick={(e) => e.stopPropagation()}>
            <DialogTitle>📧 Send Chat Transcript</DialogTitle>
            <DialogText>Enter your email to receive the chat transcript</DialogText>
            <DialogInput
              ref={emailInputRef}
              type="email"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              placeholder="your@email.com"
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  handleSendEmail();
                }
              }}
            />
            <DialogButtons>
              <DialogButtonCancel onClick={() => setShowEmailDialog(false)}>
                Cancel
              </DialogButtonCancel>
              <DialogButtonConfirm onClick={handleSendEmail}>
                Send Transcript
              </DialogButtonConfirm>
            </DialogButtons>
          </DialogContent>
        </DialogOverlay>
      )}

      {/* Clear Chat Dialog */}
      {showClearDialog && (
        <DialogOverlay onClick={() => setShowClearDialog(false)}>
          <DialogContent onClick={(e) => e.stopPropagation()}>
            <DialogEmoji>🗑️</DialogEmoji>
            <DialogTitle>Clear Chat History</DialogTitle>
            <DialogText>
              Are you sure you want to clear the chat history?<br />
              <strong>This action cannot be undone.</strong>
            </DialogText>
            <DialogButtons>
              <DialogButtonCancel onClick={() => setShowClearDialog(false)}>
                Cancel
              </DialogButtonCancel>
              <DialogButtonDanger onClick={handleClearChat}>
                Clear Chat
              </DialogButtonDanger>
            </DialogButtons>
          </DialogContent>
        </DialogOverlay>
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
  font-family: poppins;
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
  padding: 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: white;
  min-height: 56px;
`;

const ChatHeaderContent = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
`;

const StatusIndicator = styled.div`
  width: 8px;
  height: 8px;
  background: #ffffff;
  border-radius: 50%;
  flex-shrink: 0;
`;

const HeaderActions = styled.div`
  display: flex;
  gap: 8px;
  align-items: center;
`;

const ActionButton = styled.button`
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.3);
  color: white;
  padding: 6px 8px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  transition: background-color 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;

  &:hover {
    background: rgba(255, 255, 255, 0.1);
  }
`;

const ChatTitle = styled.h3`
  margin: 0;
  font-size: 15px;
  font-family: poppins;
  font-weight: 500;
  color: white;
`;

const CloseButton = styled.button`
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 4px;
  color: rgba(255, 255, 255, 0.9);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  width: 24px;
  height: 24px;
  transition: background-color 0.2s;
  font-size: 18px;
  line-height: 1;

  &:hover {
    background: rgba(255, 255, 255, 0.1);
  }
`;

const ChatMessages = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  background: #ffffff;

  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
  }

  &::-webkit-scrollbar-thumb {
    background: #e0e0e0;
    border-radius: 3px;
  }

  &::-webkit-scrollbar-thumb:hover {
    background: #cccccc;
  }
`;

const HeroHeading = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  margin: 5px 0 10px;
`;

const HeroAvatar = styled.img`
  width: 60px;
  height: 60px;
  border-radius: 100%;
  object-fit: cover;
`;

const HeroName = styled.h4`
  font-size: 22px;
  font-weight: 400;
  margin: 5px 0 0;
  font-family: 'Poppins', sans-serif;
  color: #333;
`;

const HeroPara = styled.p`
  font-size: 16px;
  margin: 3px 0 0;
  font-family: 'Poppins', sans-serif;
  color: #777777;
`;

const DateSeparator = styled.div`
  text-align: center;
  color: #888;
  font-size: 12px;
  margin: 16px 0;
  position: relative;
  font-family: poppins;

  &::before,
  &::after {
    content: '';
    position: absolute;
    top: 50%;
    width: 40%;
    height: 1px;
    background-color: #e0e0e0;
  }

  &::before {
    left: 0;
  }

  &::after {
    right: 0;
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
  align-items: flex-start;
  gap: 8px;
  max-width: 85%;
  flex-direction: ${props => props.isUser ? 'row-reverse' : 'row'};
`;

const BotAvatar = styled.div`
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: #f0f0f0;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  overflow: hidden;
`;

const BotAvatarImg = styled.img`
  width: 100%;
  height: 100%;
  object-fit: cover;
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

const MessageInfo = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
`;

const MessageSender = styled.span`
  font-weight: 500;
  font-size: 13px;
  color: #333333;
  font-family: poppins;
`;

const MessageTime = styled.span`
  font-size: 12px;
  color: #888;
  font-family: poppins;
`;

const MessageContent = styled.div`
  padding: 12px 16px;
  border-radius: ${props => props.isUser ? '15px 15px 5px 15px' : '15px 15px 15px 5px'};
  background: ${props => props.isUser 
    ? 'linear-gradient(139.48deg, #FEA63E 6.99%, #F03131 53.88%, #ED05AC 99.96%)' 
    : '#f0f0f0'};
  color: ${props => props.isUser ? '#ffffff' : '#000000'};
  font-size: 14px;
  font-family: poppins;
  line-height: 1.5;
  word-wrap: break-word;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  white-space: pre-wrap;
`;

const MessageText = styled.div`
  word-wrap: break-word;
  white-space: pre-wrap;
  
  b {
    font-weight: 600;
  }
  
  li {
    list-style: none;
    padding-left: 8px;
    position: relative;
    
    &::before {
      content: '•';
      position: absolute;
      left: 0;
    }
  }
`;

const TypingIndicator = styled.div`
  display: flex;
  gap: 4px;
  padding: 12px 16px;
  background: #f0f0f0;
  border-radius: 15px;
  border-bottom-left-radius: 5px;
  width: fit-content;
`;

const TypingDot = styled.div`
  width: 6px;
  height: 6px;
  background: #666;
  border-radius: 50%;
  animation: typing-bounce 0.8s infinite;

  @keyframes typing-bounce {
    0%, 100% {
      transform: translateY(0);
      opacity: 0.5;
    }
    50% {
      transform: translateY(-4px);
      opacity: 1;
    }
  }
`;

const ChatInputContainer = styled.div`
  padding: 16px;
  border-top: 1px solid #e5e5e5;
  display: flex;
  gap: 12px;
  background: #ffffff;
`;

const ChatInputForm = styled.form`
  display: flex;
  gap: 12px;
  align-items: center;
  width: 100%;
`;

const ChatInput = styled.input`
  flex: 1;
  padding: 12px 16px;
  border: 1px solid #e5e5e5;
  border-radius: 24px;
  outline: none;
  font-size: 14px;
  font-family: poppins;
  transition: border-color 0.2s;
  resize: none;

  &:focus {
    border-color: #FEA63E;
  }

  &:disabled {
    background: #f5f5f5;
    cursor: not-allowed;
  }

  &::placeholder {
    color: #999;
  }

  @media (max-width: 768px) {
    font-size: 16px;
    padding: 14px 16px;
  }
`;

const SendButton = styled.button`
  background: linear-gradient(139.48deg, #FEA63E 6.99%, #F03131 53.88%, #ED05AC 99.96%);
  border: none;
  padding: 10px;
  border-radius: 50%;
  cursor: pointer;
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  transition: all 0.2s;
  flex-shrink: 0;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;

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

  @media (max-width: 768px) {
    min-width: 44px;
    min-height: 44px;
    padding: 12px;
  }
`;

// Dialog Styles
const DialogOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
`;

const DialogContent = styled.div`
  background: white;
  padding: 24px;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  max-width: 400px;
  width: 90%;
  text-align: center;
`;

const DialogEmoji = styled.div`
  font-size: 48px;
  margin-bottom: 16px;
`;

const DialogTitle = styled.h3`
  margin: 0 0 16px 0;
  color: #333;
  font-size: 18px;
  font-family: poppins;
  font-weight: 600;
`;

const DialogText = styled.p`
  margin: 0 0 24px 0;
  color: #666;
  font-size: 14px;
  font-family: poppins;
  line-height: 1.5;
`;

const DialogInput = styled.input`
  width: 100%;
  padding: 12px;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  font-size: 16px;
  margin-bottom: 16px;
  box-sizing: border-box;
  font-family: poppins;
  outline: none;
  transition: border-color 0.2s;

  &:focus {
    border-color: #FEA63E;
  }
`;

const DialogButtons = styled.div`
  display: flex;
  gap: 12px;
  justify-content: center;
`;

const DialogButtonCancel = styled.button`
  padding: 10px 20px;
  border: 1px solid #ccc;
  background: #f5f5f5;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  font-family: poppins;
  transition: background-color 0.2s;

  &:hover {
    background: #e0e0e0;
  }
`;

const DialogButtonConfirm = styled.button`
  padding: 10px 20px;
  border: none;
  background: linear-gradient(139.48deg, #FEA63E 6.99%, #F03131 53.88%, #ED05AC 99.96%);
  color: white;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  font-family: poppins;
  transition: opacity 0.2s;

  &:hover {
    opacity: 0.9;
  }
`;

const DialogButtonDanger = styled.button`
  padding: 10px 20px;
  border: none;
  background: #dc3545;
  color: white;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  font-family: poppins;
  transition: opacity 0.2s;

  &:hover {
    opacity: 0.9;
  }
`;
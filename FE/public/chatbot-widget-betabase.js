/**
 * Betabase Chatbot Widget - Standalone Script
 * 
 * Usage:
 * <script src="https://your-domain.com/chatbot-widget.js"></script>
 * 
 * Or with configuration:
 * <script>
 *   window.ChatbotConfig = {
 *     apiUrl: 'https://api.betabase.pro/api/v1',
 *     adminEmail: 'admin@betabase.pro',
 *     botAvatar: 'https://your-domain.com/bot.jpg'
 *   };
 * </script>
 * <script src="https://your-domain.com/chatbot-widget.js"></script>
 */

(function() {
  'use strict';

  // Configuration
  const config = window.ChatbotConfig || {};
  const API_URL = config.apiUrl || 'https://api.betabase.pro/api/v1';
  const ADMIN_EMAIL = config.adminEmail || 'admin@betabase.pro';
  // Get the script's directory to construct the bot avatar path
  const scriptTag = document.currentScript || document.querySelector('script[src*="chatbot-widget.js"]');
  const scriptSrc = scriptTag ? scriptTag.src : '';
  const scriptBaseUrl = scriptSrc ? scriptSrc.substring(0, scriptSrc.lastIndexOf('/')) : '';
  const BOT_AVATAR = config.botAvatar || (scriptBaseUrl ? `${scriptBaseUrl}/img/bot.jpg` : '/img/bot.jpg');

  // Check if React is already loaded, otherwise load from CDN
  function loadDependencies(callback) {
    if (window.React && window.ReactDOM) {
      callback();
      return;
    }

    // Load React from CDN
    const reactScript = document.createElement('script');
    reactScript.src = 'https://unpkg.com/react@18/umd/react.production.min.js';
    reactScript.crossOrigin = 'anonymous';
    
    const reactDOMScript = document.createElement('script');
    reactDOMScript.src = 'https://unpkg.com/react-dom@18/umd/react-dom.production.min.js';
    reactDOMScript.crossOrigin = 'anonymous';

    reactScript.onload = function() {
      reactDOMScript.onload = callback;
      document.head.appendChild(reactDOMScript);
    };
    
    document.head.appendChild(reactScript);
  }

  // API Functions
  const apiCall = async (endpoint, method = 'GET', data = null) => {
    try {
      const options = {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      };

      if (data && method !== 'GET') {
        options.body = JSON.stringify(data);
      }

      const response = await fetch(`${API_URL}/${endpoint}`, options);
      const result = await response.json();
      return result;
    } catch (error) {
      console.error('API Error:', error);
      throw error;
    }
  };

  const chatbotApi = (data) => apiCall('chatbot/message', 'POST', data);
  const createChatbotSessionApi = (data) => apiCall('chatbot/session', 'POST', data);
  const getChatbotSessionMessagesApi = (sessionId) => apiCall(`chatbot/session/${sessionId}/messages`, 'GET');
  const clearChatbotApi = (data) => apiCall('chatbot/clear', 'POST', data);
  const sendChatbotEmailApi = (data) => apiCall('chatbot/send-email', 'POST', data);

  // ChatBot Component (using React.createElement instead of JSX)
  const ChatBot = function() {
    if (!window.React) {
      console.error('React is not loaded');
      return null;
    }
    
    const React = window.React;
    const { useState, useRef, useEffect, useCallback } = React;

    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState([]);
    const [sessionId, setSessionId] = useState(null);
    const [inputMessage, setInputMessage] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isInitializing, setIsInitializing] = useState(true);
    const [botName, setBotName] = useState('AI Assistant');
    const [botAvatar, setBotAvatar] = useState(BOT_AVATAR);
    const [showEmailDialog, setShowEmailDialog] = useState(false);
    const [emailInput, setEmailInput] = useState('');
    const [showClearDialog, setShowClearDialog] = useState(false);
    const [hasShownHeroHeading, setHasShownHeroHeading] = useState(false);
    const messagesEndRef = useRef(null);
    const inputRef = useRef(null);
    const emailInputRef = useRef(null);

    const formatTime = (date) => {
      if (!date) return '';
      const messageDate = new Date(date);
      return messageDate.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit',
        hour12: true 
      });
    };

    const formatDate = (date) => {
      if (!date) return '';
      return new Date(date).toLocaleDateString('en-US', { 
        month: 'long', 
        day: 'numeric' 
      });
    };

    const shouldShowDateSeparator = (currentMsg, previousMsg) => {
      if (!previousMsg) return true;
      const currentDate = new Date(currentMsg.timestamp).toDateString();
      const previousDate = new Date(previousMsg.timestamp).toDateString();
      return currentDate !== previousDate;
    };

    const scrollToBottom = () => {
      if (messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
      }
    };

    useEffect(() => {
      scrollToBottom();
    }, [messages]);

    const extractBotName = useCallback((content) => {
      if (!content || typeof content !== 'string') return null;
      
      const match = content.match(/^([^:]+?):\s*(.+)$/s);
      if (match && match[1] && match[2]) {
        let name = match[1].trim();
        const message = match[2].trim();
        
        const commaIndex = name.indexOf(',');
        const emDashIndex = name.indexOf('—');
        const dashIndex = name.indexOf('-');
        
        let separatorIndex = -1;
        const indices = [commaIndex, emDashIndex, dashIndex].filter(idx => idx !== -1);
        if (indices.length > 0) {
          separatorIndex = Math.min(...indices);
        }
        
        if (separatorIndex > 0) {
          name = name.substring(0, separatorIndex).trim();
        }
        
        if (name.length > 0 && name.length <= 100 && message.length > 0) {
          if (name.length >= 3 && /[a-zA-Z]/.test(name)) {
            return { name: name, message: message };
          }
        }
      }
      return null;
    }, []);

    useEffect(() => {
      const initializeSession = async () => {
        setIsInitializing(true);
        localStorage.removeItem('chatbot_sessionId');
        setMessages([]);
        setSessionId(null);
        setHasShownHeroHeading(false);
        
        try {
          const response = await createChatbotSessionApi({ 
            sessionId: null,
            useWidgetAssistant: true 
          });
          
          if (response && response.success) {
            const newSessionId = response.sessionId;
            setSessionId(newSessionId);
            localStorage.setItem('chatbot_sessionId', newSessionId);
            
            if (response.restored) {
              setMessages([]);
              await pollForGreeting(newSessionId);
            } else if (response.messages && response.messages.length > 0) {
              let foundBotName = false;
              const greetingMessages = response.messages.map(msg => {
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
              setMessages(greetingMessages);
            } else {
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
              return;
            }
          } catch (error) {
            console.error(`Error polling for greeting (attempt ${attempt + 1}):`, error);
          }
        }
        console.warn('Greeting not found after polling');
      };

      initializeSession();
    }, [extractBotName]);

    useEffect(() => {
      let emailSent = false; // Flag to prevent duplicate emails
      
      const sendTranscriptToAdmin = () => {
        // Prevent duplicate emails
        if (emailSent) {
          return;
        }
        
        if (!sessionId || messages.length === 0) {
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
        
        const data = {
          sessionId: sessionId,
          email: ADMIN_EMAIL,
          isAdmin: true,
          useWidgetAssistant: true // Flag to use Chain Assistant as from name
        };
        
        if (navigator.sendBeacon) {
          const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
          navigator.sendBeacon(`${API_URL}/chatbot/send-email`, blob);
        } else {
          fetch(`${API_URL}/chatbot/send-email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
            keepalive: true
          }).catch(err => console.error('Error sending transcript:', err));
        }
        
        localStorage.removeItem('chatbot_sessionId');
      };

      const handleBeforeUnload = () => sendTranscriptToAdmin();
      const handlePageHide = () => sendTranscriptToAdmin();

      window.addEventListener('beforeunload', handleBeforeUnload);
      window.addEventListener('pagehide', handlePageHide);

      return () => {
        window.removeEventListener('beforeunload', handleBeforeUnload);
        window.removeEventListener('pagehide', handlePageHide);
      };
    }, [sessionId, messages.length]);

    useEffect(() => {
      if (messages.length > 0 && !hasShownHeroHeading) {
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
        if (!sessionId) {
          const sessionResponse = await createChatbotSessionApi({
            useWidgetAssistant: true
          });
          if (sessionResponse && sessionResponse.success) {
            setSessionId(sessionResponse.sessionId);
            localStorage.setItem('chatbot_sessionId', sessionResponse.sessionId);
          }
        }

        const response = await chatbotApi({
          message: userMessage.content,
          sessionId: sessionId || localStorage.getItem('chatbot_sessionId'),
          conversationHistory: messages,
          useWidgetAssistant: true
        });

        if (response && response.success && response.message) {
          const botInfo = extractBotName(response.message);
          const messageContent = botInfo ? botInfo.message : response.message;
          
          if (botInfo) {
            setBotName(botInfo.name);
          } else if (botName === 'AI Assistant') {
            const allMessages = [...messages, { role: 'assistant', content: response.message }];
            for (const msg of allMessages) {
              if (msg.role === 'assistant') {
                const extracted = extractBotName(msg.content);
                if (extracted) {
                  setBotName(extracted.name);
                  break;
                }
              }
            }
          }
          
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: messageContent,
            timestamp: new Date()
          }]);
        } else if (response && response.msg) {
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: response.msg,
            timestamp: new Date()
          }]);
        } else {
          throw new Error('Invalid response from server');
        }
      } catch (error) {
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
          setHasShownHeroHeading(false);
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

    const formatMessageContent = (content) => {
      if (!content) return '';
      return content
        .replace(/\n/g, '<br>')
        .replace(/(\d+\.)\s/g, '<br><b>$1</b> ')
        .replace(/- (.*?)\n/g, '<li>$1</li>')
        .replace(/Estimated Cost:/g, '<b>Estimated Cost:</b>')
        .replace(/Timeline:/g, '<b>Timeline:</b>');
    };

    const styles = {
      chatButton: {
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        width: '60px',
        height: '60px',
        borderRadius: '50%',
        background: 'linear-gradient(135deg, var(--primary-navy) 0%, var(--secondary-navy) 100%)',
        border: 'none',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
        zIndex: 9998,
        transition: 'all 0.3s ease',
        color: 'white',
        fontSize: '24px',
        lineHeight: '1'
      },
      chatWindow: {
        position: 'fixed',
        bottom: '100px',
        right: '24px',
        width: '380px',
        height: '600px',
        background: '#ffffff',
        borderRadius: '16px',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 9999,
        overflow: 'hidden'
      },
      chatHeader: {
        background: '#023c5b',
        padding: '5px 15px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        color: 'white',
        minHeight: '56px'
      },
      chatTitle: {
        margin: 0,
        padding:`0`,
        fontSize: '15px',
        fontFamily: 'poppins, sans-serif',
        fontWeight: 500,
        color: 'white'
      },
      closeButton: {
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        padding: '4px',
        color: 'rgba(255, 255, 255, 0.9)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: '50%',
        width: '24px',
        height: '24px',
        fontSize: '18px',
        lineHeight: '1'
      },
      chatMessages: {
        flex: 1,
        overflowY: 'auto',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        background: '#ffffff'
      },
      heroHeading: {
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        margin: '5px 0 10px'
      },
      heroAvatar: {
        width: '60px',
        height: '60px',
        borderRadius: '100%',
        objectFit: 'cover'
      },
      heroName: {
        fontSize: '22px',
        fontWeight: 400,
        margin: '5px 0 0',
        fontFamily: 'Poppins, sans-serif',
        color: '#333'
      },
      heroPara: {
        fontSize: '16px',
        margin: '3px 0 0',
        fontFamily: 'Poppins, sans-serif',
        color: '#777777'
      },
      dateSeparator: {
        textAlign: 'center',
        color: '#888',
        fontSize: '12px',
        margin: '16px 0',
        position: 'relative',
        fontFamily: 'poppins, sans-serif'
      },
      message: {
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        marginBottom: '4px'
      },
      messageWrapper: {
        display: 'flex',
        alignItems: 'flex-start',
        gap: '8px',
        maxWidth: '85%'
      },
      botAvatar: {
        width: '32px',
        height: '32px',
        borderRadius: '50%',
        background: '#f0f0f0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        overflow: 'hidden'
      },
      botAvatarImg: {
        width: '100%',
        height: '100%',
        objectFit: 'cover'
      },
      messageInfo: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        marginBottom: '4px'
      },
      messageSender: {
        fontWeight: 500,
        fontSize: '13px',
        color: '#333333',
        fontFamily: 'poppins, sans-serif'
      },
      messageTime: {
        fontSize: '12px',
        color: '#888',
        fontFamily: 'poppins, sans-serif'
      },
      messageContent: {
        padding: '12px 16px',
        borderRadius: '15px',
        fontSize: '14px',
        fontFamily: 'poppins, sans-serif',
        lineHeight: 1.5,
        wordWrap: 'break-word',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
        whiteSpace: 'pre-wrap'
      },
      chatInputContainer: {
        padding: '16px',
        borderTop: '1px solid #e5e5e5',
        display: 'flex',
        gap: '12px',
        background: '#ffffff'
      },
      chatInput: {
        flex: 1,
        padding: '12px 16px',
        border: '1px solid #e5e5e5',
        borderRadius: '24px',
        outline: 'none',
        fontSize: '14px',
        fontFamily: 'poppins, sans-serif'
      },
      sendButton: {
        background: '#023c5b',
        border: 'none',
        padding: '10px',
        borderRadius: '50%',
        cursor: 'pointer',
        color: '#ffffff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '30px',
        height: '30px',
        flexShrink: 0
      },
      dialogOverlay: {
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000
      },
      dialogContent: {
        background: 'white',
        padding: '24px',
        borderRadius: '12px',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
        maxWidth: '400px',
        width: '90%',
        textAlign: 'center'
      },
      dialogTitle: {
        margin: '0 0 16px 0',
        color: '#333',
        fontSize: '18px',
        fontFamily: 'poppins, sans-serif',
        fontWeight: 600
      },
      dialogText: {
        margin: '0 0 24px 0',
        color: '#666',
        fontSize: '14px',
        fontFamily: 'poppins, sans-serif',
        lineHeight: 1.5
      },
      dialogInput: {
        width: '100%',
        padding: '12px',
        border: '2px solid #e0e0e0',
        borderRadius: '8px',
        fontSize: '16px',
        marginBottom: '16px',
        boxSizing: 'border-box',
        fontFamily: 'poppins, sans-serif',
        outline: 'none'
      },
      dialogButtons: {
        display: 'flex',
        gap: '12px',
        justifyContent: 'center'
      },
      dialogButton: {
        padding: '10px 20px',
        border: '1px solid #ccc',
        background: '#f5f5f5',
        borderRadius: '6px',
        cursor: 'pointer',
        fontSize: '14px',
        fontFamily: 'poppins, sans-serif'
      },
      dialogButtonConfirm: {
        padding: '10px 20px',
        border: 'none',
        background: '#023c5b',
        color: 'white',
        borderRadius: '6px',
        cursor: 'pointer',
        fontSize: '14px',
        fontFamily: 'poppins, sans-serif'
      }
    };

    return React.createElement('div', null,
      React.createElement('button', {
        onClick: () => setIsOpen(!isOpen),
        style: styles.chatButton
      }, isOpen ? '×' : React.createElement('svg', {
        width: '24',
        height: '24',
        viewBox: '0 0 24 24',
        fill: 'none',
        xmlns: 'http://www.w3.org/2000/svg'
      }, React.createElement('path', {
        d: 'M20 2H4C2.9 2 2 2.9 2 4V22L6 18H20C21.1 18 22 17.1 22 16V4C22 2.9 21.1 2 20 2Z',
        fill: 'currentColor'
      }))),
      
      isOpen && React.createElement('div', { style: styles.chatWindow },
        React.createElement('div', { style: styles.chatHeader },
          React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', flex: 1 } },
            React.createElement('h3', { style: styles.chatTitle }, 'Message us')
          ),
          React.createElement('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } },
            React.createElement('button', {
              onClick: () => setIsOpen(false),
              style: styles.closeButton
            }, '✕')
          )
        ),
        
        React.createElement('div', { style: styles.chatMessages },
          messages.length > 0 && React.createElement(React.Fragment, null,
            React.createElement('div', { style: styles.heroHeading },
              React.createElement('img', { src: botAvatar, alt: botName, style: styles.heroAvatar }),
              React.createElement('h4', { style: styles.heroName }, botName),
              React.createElement('p', { style: styles.heroPara }, 'joined')
            ),
            React.createElement('div', { style: styles.dateSeparator },
              formatDate(messages[0].timestamp || new Date())
            )
          ),
          
          messages.map((message, index) => {
            const isUser = message.role === 'user';
            const previousMessage = index > 0 ? messages[index - 1] : null;
            const showDateSeparator = index === 0 ? false : shouldShowDateSeparator(message, previousMessage);

            return React.createElement(React.Fragment, { key: index },
              showDateSeparator && React.createElement('div', { style: styles.dateSeparator },
                formatDate(message.timestamp)
              ),
              React.createElement('div', {
                style: {
                  ...styles.message,
                  alignItems: isUser ? 'flex-end' : 'flex-start'
                }
              },
                React.createElement('div', {
                  style: {
                    ...styles.messageWrapper,
                    flexDirection: isUser ? 'row-reverse' : 'row'
                  }
                },
                  !isUser && React.createElement('div', { style: styles.botAvatar },
                    React.createElement('img', { src: botAvatar, alt: botName, style: styles.botAvatarImg })
                  ),
                  React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 } },
                    React.createElement('div', { style: styles.messageInfo },
                      React.createElement('span', { style: styles.messageSender }, isUser ? 'You' : botName),
                      React.createElement('span', { style: styles.messageTime }, formatTime(message.timestamp))
                    ),
                    React.createElement('div', {
                      style: {
                        ...styles.messageContent,
                        borderRadius: isUser ? '15px 15px 5px 15px' : '15px 15px 15px 5px',
                        background: isUser ? 'linear-gradient(135deg, var(--primary-navy) 0%, var(--secondary-navy) 100%)' : '#f0f0f0',
                        color: isUser ? '#ffffff' : '#000000'
                      },
                      dangerouslySetInnerHTML: { __html: formatMessageContent(message.content) }
                    })
                  )
                )
              )
            );
          }),
          
          isLoading && React.createElement('div', {
            style: {
              ...styles.message,
              alignItems: 'flex-start'
            }
          },
            React.createElement('div', { style: styles.messageWrapper },
              React.createElement('div', { style: styles.botAvatar },
                React.createElement('img', { src: botAvatar, alt: botName, style: styles.botAvatarImg })
              ),
              React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 } },
                React.createElement('div', { style: styles.messageInfo },
                  React.createElement('span', { style: styles.messageSender }, botName),
                  React.createElement('span', { style: styles.messageTime }, formatTime(new Date()))
                ),
                React.createElement('div', {
                  style: {
                    ...styles.messageContent,
                    borderRadius: '15px',
                    borderBottomLeftRadius: '5px',
                    width: 'fit-content',
                    display: 'flex',
                    gap: '4px',
                    padding: '12px 16px'
                  }
                },
                  React.createElement('div', { style: { width: '6px', height: '6px', background: '#666', borderRadius: '50%', animation: 'typing-bounce 0.8s infinite' } }),
                  React.createElement('div', { style: { width: '6px', height: '6px', background: '#666', borderRadius: '50%', animation: 'typing-bounce 0.8s infinite', animationDelay: '0.15s' } }),
                  React.createElement('div', { style: { width: '6px', height: '6px', background: '#666', borderRadius: '50%', animation: 'typing-bounce 0.8s infinite', animationDelay: '0.3s' } })
                )
              )
            )
          ),
          React.createElement('div', { ref: messagesEndRef })
        ),
        
        React.createElement('div', { style: styles.chatInputContainer },
          React.createElement('form', {
            onSubmit: handleSendMessage,
            style: { display: 'flex', gap: '12px', alignItems: 'center', width: '100%' }
          },
            React.createElement('input', {
              ref: inputRef,
              type: 'text',
              value: inputMessage,
              onChange: (e) => setInputMessage(e.target.value),
              onKeyPress: handleKeyPress,
              placeholder: 'Type your message...',
              disabled: isLoading,
              style: styles.chatInput
            }),
            React.createElement('button', {
              type: 'submit',
              disabled: !inputMessage.trim() || isLoading,
              style: {
                ...styles.sendButton,
                opacity: (!inputMessage.trim() || isLoading) ? 0.5 : 1,
                cursor: (!inputMessage.trim() || isLoading) ? 'not-allowed' : 'pointer'
              }
            },
              React.createElement('svg', {
                width: '20',
                height: '20',
                viewBox: '0 0 20 20',
                fill: 'none',
                xmlns: 'http://www.w3.org/2000/svg'
              },
                React.createElement('path', {
                  d: 'M18 2L9 11M18 2L12 18L9 11M18 2L2 8L9 11',
                  stroke: 'currentColor',
                  strokeWidth: '2',
                  strokeLinecap: 'round',
                  strokeLinejoin: 'round'
                })
              )
            )
          )
        )
      ),
      
      showEmailDialog && React.createElement('div', {
        style: styles.dialogOverlay,
        onClick: () => setShowEmailDialog(false)
      },
        React.createElement('div', {
          style: styles.dialogContent,
          onClick: (e) => e.stopPropagation()
        },
          React.createElement('h3', { style: styles.dialogTitle }, '📧 Send Chat Transcript'),
          React.createElement('p', { style: styles.dialogText }, 'Enter your email to receive the chat transcript'),
          React.createElement('input', {
            ref: emailInputRef,
            type: 'email',
            value: emailInput,
            onChange: (e) => setEmailInput(e.target.value),
            placeholder: 'your@email.com',
            onKeyPress: (e) => {
              if (e.key === 'Enter') {
                handleSendEmail();
              }
            },
            style: styles.dialogInput
          }),
          React.createElement('div', { style: styles.dialogButtons },
            React.createElement('button', {
              onClick: () => setShowEmailDialog(false),
              style: styles.dialogButton
            }, 'Cancel'),
            React.createElement('button', {
              onClick: handleSendEmail,
              style: styles.dialogButtonConfirm
            }, 'Send Transcript')
          )
        )
      ),
      
      showClearDialog && React.createElement('div', {
        style: styles.dialogOverlay,
        onClick: () => setShowClearDialog(false)
      },
        React.createElement('div', {
          style: styles.dialogContent,
          onClick: (e) => e.stopPropagation()
        },
          React.createElement('div', { style: { fontSize: '48px', marginBottom: '16px' } }, '🗑️'),
          React.createElement('h3', { style: styles.dialogTitle }, 'Clear Chat History'),
          React.createElement('p', { style: styles.dialogText },
            React.createElement(React.Fragment, null,
              'Are you sure you want to clear the chat history?',
              React.createElement('br'),
              React.createElement('strong', null, 'This action cannot be undone.')
            )
          ),
          React.createElement('div', { style: styles.dialogButtons },
            React.createElement('button', {
              onClick: () => setShowClearDialog(false),
              style: styles.dialogButton
            }, 'Cancel'),
            React.createElement('button', {
              onClick: handleClearChat,
              style: {
                ...styles.dialogButtonConfirm,
                background: '#dc3545'
              }
            }, 'Clear Chat')
          )
        )
      )
    );
  };

  // Add CSS for animations
  const style = document.createElement('style');
  style.textContent = `
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
    @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600&display=swap');
  `;
  document.head.appendChild(style);

  // Initialize when dependencies are loaded
  loadDependencies(function() {
    const root = document.createElement('div');
    root.id = 'betabase-chatbot-root';
    document.body.appendChild(root);
    
    const ReactDOM = window.ReactDOM;
    ReactDOM.render(React.createElement(ChatBot), root);
  });

})();

import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSignOut } from 'react-auth-kit';
import { Box, Button, Typography, Fade, LinearProgress, CircularProgress } from '@mui/material';
import { styled } from '@mui/material/styles';
import LockIcon from '@mui/icons-material/Lock';
import HomeIcon from '@mui/icons-material/Home';
import SecurityIcon from '@mui/icons-material/Security';

const Container = styled(Box)(({ theme }) => ({
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: theme.palette.mode === 'dark' 
    ? 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)'
    : 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)',
  background: theme.palette.mode === 'dark'
    ? 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)'
    : 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)',
  zIndex: 9999,
  minHeight: '100vh',
  padding: theme.spacing(3),
}));

const ContentBox = styled(Box)(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: theme.spacing(4),
  padding: theme.spacing(6),
  textAlign: 'center',
  maxWidth: 500,
  backgroundColor: theme.palette.mode === 'dark'
    ? 'rgba(255, 255, 255, 0.05)'
    : 'rgba(255, 255, 255, 0.8)',
  borderRadius: '24px',
  backdropFilter: 'blur(10px)',
  border: theme.palette.mode === 'dark'
    ? '1px solid rgba(255, 255, 255, 0.1)'
    : '1px solid rgba(255, 255, 255, 0.5)',
  boxShadow: theme.palette.mode === 'dark'
    ? '0 20px 60px rgba(0, 0, 0, 0.5)'
    : '0 20px 60px rgba(0, 0, 0, 0.1)',
}));

const IconContainer = styled(Box)(({ theme }) => ({
  position: 'relative',
  width: 140,
  height: 140,
  marginBottom: theme.spacing(2),
}));

const IconRing = styled(Box)(({ theme }) => ({
  position: 'absolute',
  width: 140,
  height: 140,
  borderRadius: '50%',
  border: `4px solid ${theme.palette.mode === 'dark' ? 'rgba(255, 107, 107, 0.2)' : 'rgba(255, 107, 107, 0.15)'}`,
  animation: 'pulseRing 2s ease-out infinite',
  '@keyframes pulseRing': {
    '0%': {
      transform: 'scale(0.8)',
      opacity: 1,
    },
    '100%': {
      transform: 'scale(1.4)',
      opacity: 0,
    },
  },
}));

const IconCircle = styled(Box)(({ theme }) => ({
  position: 'absolute',
  width: 120,
  height: 120,
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  borderRadius: '50%',
  background: theme.palette.mode === 'dark'
    ? 'linear-gradient(135deg, #ff6b6b 0%, #ee5a6f 100%)'
    : 'linear-gradient(135deg, #ff6b6b 0%, #ee5a6f 100%)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  boxShadow: theme.palette.mode === 'dark'
    ? '0 12px 40px rgba(255, 107, 107, 0.5)'
    : '0 12px 40px rgba(255, 107, 107, 0.4)',
  animation: 'shake 0.6s ease-in-out',
  '@keyframes shake': {
    '0%, 100%': { transform: 'translate(-50%, -50%) rotate(0deg)' },
    '10%, 30%, 50%, 70%, 90%': { transform: 'translate(-50%, -50%) rotate(-5deg)' },
    '20%, 40%, 60%, 80%': { transform: 'translate(-50%, -50%) rotate(5deg)' },
  },
}));

const Title = styled(Typography)(({ theme }) => ({
  fontSize: '36px',
  fontWeight: 800,
  background: theme.palette.mode === 'dark'
    ? 'linear-gradient(135deg, #ff6b6b 0%, #ee5a6f 100%)'
    : 'linear-gradient(135deg, #ff6b6b 0%, #ee5a6f 100%)',
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
  backgroundClip: 'text',
  marginBottom: theme.spacing(1.5),
  letterSpacing: '-1.5px',
}));

const Subtitle = styled(Typography)(({ theme }) => ({
  fontSize: '20px',
  fontWeight: 600,
  color: theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.9)' : 'rgba(26, 32, 44, 0.9)',
  lineHeight: 1.5,
  marginBottom: theme.spacing(1),
}));

const Description = styled(Typography)(({ theme }) => ({
  fontSize: '15px',
  color: theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.6)' : 'rgba(26, 32, 44, 0.7)',
  lineHeight: 1.7,
  marginBottom: theme.spacing(3),
}));

const CountdownBox = styled(Box)(({ theme }) => ({
  width: '100%',
  marginTop: theme.spacing(2),
  padding: theme.spacing(2),
  borderRadius: '12px',
  backgroundColor: theme.palette.mode === 'dark'
    ? 'rgba(255, 107, 107, 0.1)'
    : 'rgba(255, 107, 107, 0.05)',
  border: `1px solid ${theme.palette.mode === 'dark' ? 'rgba(255, 107, 107, 0.2)' : 'rgba(255, 107, 107, 0.15)'}`,
}));

const ProgressBar = styled(LinearProgress)(({ theme }) => ({
  height: 6,
  borderRadius: 3,
  backgroundColor: theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
  '& .MuiLinearProgress-bar': {
    borderRadius: 3,
    background: theme.palette.mode === 'dark'
      ? 'linear-gradient(90deg, #ff6b6b 0%, #ee5a6f 100%)'
      : 'linear-gradient(90deg, #ff6b6b 0%, #ee5a6f 100%)',
  },
}));

const StyledButton = styled(Button)(({ theme }) => ({
  padding: theme.spacing(1.5, 4),
  fontSize: '16px',
  fontWeight: 600,
  borderRadius: '12px',
  textTransform: 'none',
  background: theme.palette.mode === 'dark'
    ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
    : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  color: 'white',
  boxShadow: theme.palette.mode === 'dark'
    ? '0 8px 24px rgba(102, 126, 234, 0.4)'
    : '0 8px 24px rgba(102, 126, 234, 0.3)',
  '&:hover': {
    background: theme.palette.mode === 'dark'
      ? 'linear-gradient(135deg, #764ba2 0%, #667eea 100%)'
      : 'linear-gradient(135deg, #764ba2 0%, #667eea 100%)',
    boxShadow: theme.palette.mode === 'dark'
      ? '0 12px 32px rgba(102, 126, 234, 0.5)'
      : '0 12px 32px rgba(102, 126, 234, 0.4)',
    transform: 'translateY(-2px)',
  },
  transition: 'all 0.3s ease',
}));

const AccessDenied = () => {
  const navigate = useNavigate();
  const signOut = useSignOut();
  const [countdown, setCountdown] = React.useState(5);
  const [isLoggingOut, setIsLoggingOut] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [isFadingOut, setIsFadingOut] = React.useState(false);
  const hasLoggedOutRef = useRef(false);
  const countdownIntervalRef = useRef(null);
  const logoutTimerRef = useRef(null);
  const fallbackTimerRef = useRef(null);
  const hasInitializedRef = useRef(false);
  const signOutRef = useRef(signOut);
  const navigateRef = useRef(navigate);
  
  // Keep refs updated
  useEffect(() => {
    signOutRef.current = signOut;
    navigateRef.current = navigate;
  }, [signOut, navigate]);

  useEffect(() => {
    // Prevent multiple executions - only run once
    if (hasInitializedRef.current) {
      console.log('⚠️ [AccessDenied] Already initialized, skipping');
      return;
    }
    
    if (hasLoggedOutRef.current) {
      console.log('⚠️ [AccessDenied] Already logged out, skipping');
      return;
    }

    hasInitializedRef.current = true;
    console.log('🔄 [AccessDenied] Setting up logout timers...');

    // Countdown timer with progress
    countdownIntervalRef.current = setInterval(() => {
      setCountdown((prev) => {
        const newCount = prev - 1;
        const newProgress = ((5 - newCount) / 5) * 100;
        setProgress(newProgress);
        
        console.log(`⏱️ [AccessDenied] Countdown: ${newCount} seconds, Progress: ${newProgress}%`);
        
        if (newCount <= 0) {
          if (countdownIntervalRef.current) {
            clearInterval(countdownIntervalRef.current);
            countdownIntervalRef.current = null;
          }
          return 0;
        }
        return newCount;
      });
    }, 1000);

    // Delay logout to ensure UI is visible first
    // Show the access denied screen for 5 seconds before logging out
    logoutTimerRef.current = setTimeout(() => {
      console.log('⏰ [AccessDenied] Main logout timer triggered (5 seconds)');
      
      if (hasLoggedOutRef.current) {
        console.log('⚠️ [AccessDenied] Already logged out, skipping main timer');
        return;
      }
      
      hasLoggedOutRef.current = true;
      setIsLoggingOut(true);
      setProgress(100);
      
      // Clear countdown interval
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
      
      const logoutUser = () => {
        try {
          console.log('🚪 [AccessDenied] Starting logout process...');
          
          // Start fade out animation
          setIsFadingOut(true);
          
          // Clear all auth data
          signOutRef.current();
          localStorage.removeItem('token');
          localStorage.removeItem('authToken');
          localStorage.removeItem('authUser');
          localStorage.removeItem('auth_state');
          localStorage.removeItem('jwttoken');
          
          console.log('✅ [AccessDenied] Auth data cleared, navigating to login...');
          
          // Smooth navigation to login without page refresh (after fade out)
          setTimeout(() => {
            navigateRef.current('/auth/login', { replace: true });
          }, 400); // Wait for fade animation
        } catch (error) {
          console.error('❌ [AccessDenied] Error during logout:', error);
          // Smooth navigation even on error
          setTimeout(() => {
            navigateRef.current('/auth/login', { replace: true });
          }, 500);
        }
      };
      logoutUser();
    }, 5000); // Show UI for 5 seconds before logout

    // Fallback: Ensure logout happens even if timers fail
    fallbackTimerRef.current = setTimeout(() => {
      if (!hasLoggedOutRef.current) {
        console.warn('⚠️ [AccessDenied] Fallback logout triggered (6 seconds)');
        hasLoggedOutRef.current = true;
        setIsLoggingOut(true);
        setProgress(100);
        
        // Clear other timers
        if (countdownIntervalRef.current) {
          clearInterval(countdownIntervalRef.current);
          countdownIntervalRef.current = null;
        }
        if (logoutTimerRef.current) {
          clearTimeout(logoutTimerRef.current);
          logoutTimerRef.current = null;
        }
        
        try {
          signOutRef.current();
          localStorage.clear();
          setIsFadingOut(true);
          setTimeout(() => {
            navigateRef.current('/auth/login', { replace: true });
          }, 300);
        } catch (error) {
          console.error('❌ [AccessDenied] Fallback logout error:', error);
          setIsFadingOut(true);
          setTimeout(() => {
            navigateRef.current('/auth/login', { replace: true });
          }, 300);
        }
      }
    }, 6000); // 6 seconds fallback

    return () => {
      // Only cleanup if component is actually unmounting (not just re-rendering)
      // Don't clear timers if we're in the process of logging out
      if (!hasLoggedOutRef.current) {
        console.log('🧹 [AccessDenied] Cleaning up timers (component unmounting)...');
        if (countdownIntervalRef.current) {
          clearInterval(countdownIntervalRef.current);
          countdownIntervalRef.current = null;
        }
        if (logoutTimerRef.current) {
          clearTimeout(logoutTimerRef.current);
          logoutTimerRef.current = null;
        }
        if (fallbackTimerRef.current) {
          clearTimeout(fallbackTimerRef.current);
          fallbackTimerRef.current = null;
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty deps - only run once on mount

  const handleGoHome = () => {
    // Clear timers
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
    }
    if (logoutTimerRef.current) {
      clearTimeout(logoutTimerRef.current);
    }
    
    // Mark as logged out to prevent double execution
    hasLoggedOutRef.current = true;
    setIsFadingOut(true);
    
    // Logout immediately
    try {
      signOut();
      localStorage.removeItem('token');
      localStorage.removeItem('authToken');
      localStorage.removeItem('authUser');
      localStorage.removeItem('auth_state');
      localStorage.removeItem('jwttoken');
    } catch (error) {
      console.error('Error during logout:', error);
    }
    
    // Smooth navigation to login without page refresh (with fade out)
    setTimeout(() => {
      navigate('/auth/login', { replace: true });
    }, 300);
  };

  return (
    <Container>
      <Fade in={!isFadingOut} timeout={isFadingOut ? 300 : 800}>
        <ContentBox>
          <IconContainer>
            <IconRing />
            <IconCircle>
              <SecurityIcon 
                sx={{ 
                  fontSize: 60, 
                  color: 'white',
                }} 
              />
            </IconCircle>
          </IconContainer>
          
          <Box sx={{ width: '100%' }}>
            <Title>Access Revoked</Title>
            <Subtitle>
              Wallet Access Suspended
            </Subtitle>
            <Description>
              Your wallet access permissions have been modified by an administrator. 
              For security reasons, you will be automatically logged out.
            </Description>
            
            <CountdownBox>
              {countdown > 0 ? (
                <>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                    <Typography
                      sx={{
                        fontSize: '16px',
                        fontWeight: 600,
                        color: 'text.primary',
                      }}
                    >
                      Logging out in {countdown} second{countdown !== 1 ? 's' : ''}
                    </Typography>
                    <CircularProgress 
                      size={20} 
                      thickness={4}
                      sx={{ color: 'error.main' }}
                    />
                  </Box>
                  <ProgressBar 
                    variant="determinate" 
                    value={progress}
                    sx={{ width: '100%' }}
                  />
                </>
              ) : (
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1.5 }}>
                  <CircularProgress 
                    size={24} 
                    thickness={4}
                    sx={{ color: 'error.main' }}
                  />
                  <Typography
                    sx={{
                      fontSize: '16px',
                      fontWeight: 600,
                      color: 'error.main',
                    }}
                  >
                    Logging out...
                  </Typography>
                </Box>
              )}
            </CountdownBox>
          </Box>

          <StyledButton
            variant="contained"
            startIcon={isLoggingOut ? <CircularProgress size={18} sx={{ color: 'white' }} /> : <HomeIcon />}
            onClick={handleGoHome}
            size="large"
            disabled={isLoggingOut}
            sx={{ mt: 1 }}
          >
            {isLoggingOut ? 'Logging Out...' : 'Go to Login'}
          </StyledButton>
        </ContentBox>
      </Fade>
    </Container>
  );
};

export default AccessDenied;

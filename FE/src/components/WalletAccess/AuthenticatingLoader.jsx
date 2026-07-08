import React from 'react';
import { Box, CircularProgress, Typography, Fade } from '@mui/material';
import { styled } from '@mui/material/styles';

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
    ? 'linear-gradient(135deg, #0a0e27 0%, #1a1f3a 100%)'
    : 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)',
  background: theme.palette.mode === 'dark'
    ? 'linear-gradient(135deg, #0a0e27 0%, #1a1f3a 100%)'
    : 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)',
  zIndex: 9999,
  minHeight: '100vh',
}));

const ContentBox = styled(Box)(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: theme.spacing(3),
  padding: theme.spacing(5),
  textAlign: 'center',
  maxWidth: 450,
  backgroundColor: theme.palette.mode === 'dark'
    ? 'rgba(255, 255, 255, 0.03)'
    : 'rgba(255, 255, 255, 0.7)',
  borderRadius: '24px',
  backdropFilter: 'blur(20px)',
  border: theme.palette.mode === 'dark'
    ? '1px solid rgba(255, 255, 255, 0.1)'
    : '1px solid rgba(255, 255, 255, 0.8)',
  boxShadow: theme.palette.mode === 'dark'
    ? '0 20px 60px rgba(0, 0, 0, 0.4)'
    : '0 20px 60px rgba(0, 0, 0, 0.1)',
}));

const WalletIconContainer = styled(Box)(({ theme }) => ({
  position: 'relative',
  width: 120,
  height: 120,
  marginBottom: theme.spacing(3),
}));

const OuterRing = styled(Box)(({ theme }) => ({
  position: 'absolute',
  width: 120,
  height: 120,
  borderRadius: '50%',
  border: `3px solid ${theme.palette.mode === 'dark' ? 'rgba(102, 126, 234, 0.3)' : 'rgba(102, 126, 234, 0.2)'}`,
  animation: 'rotate 3s linear infinite',
  '@keyframes rotate': {
    '0%': { transform: 'rotate(0deg)' },
    '100%': { transform: 'rotate(360deg)' },
  },
}));

const MiddleRing = styled(Box)(({ theme }) => ({
  position: 'absolute',
  width: 100,
  height: 100,
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  borderRadius: '50%',
  border: `2px solid ${theme.palette.mode === 'dark' ? 'rgba(102, 126, 234, 0.4)' : 'rgba(102, 126, 234, 0.3)'}`,
  animation: 'rotateReverse 2s linear infinite',
  '@keyframes rotateReverse': {
    '0%': { transform: 'translate(-50%, -50%) rotate(0deg)' },
    '100%': { transform: 'translate(-50%, -50%) rotate(-360deg)' },
  },
}));

const LogoContainer = styled(Box)(({ theme }) => ({
  position: 'absolute',
  width: 80,
  height: 80,
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  borderRadius: '50%',
  background: theme.palette.mode === 'dark'
    ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
    : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  boxShadow: theme.palette.mode === 'dark'
    ? '0 8px 32px rgba(102, 126, 234, 0.4)'
    : '0 8px 32px rgba(102, 126, 234, 0.3)',
  animation: 'pulse 2s ease-in-out infinite',
  '@keyframes pulse': {
    '0%, 100%': {
      transform: 'translate(-50%, -50%) scale(1)',
      opacity: 1,
    },
    '50%': {
      transform: 'translate(-50%, -50%) scale(1.05)',
      opacity: 0.9,
    },
  },
}));

const StyledCircularProgress = styled(CircularProgress)(({ theme }) => ({
  color: theme.palette.mode === 'dark' ? '#667eea' : '#667eea',
  width: '60px !important',
  height: '60px !important',
}));

const Title = styled(Typography)(({ theme }) => ({
  fontSize: '28px',
  fontWeight: 700,
  color: theme.palette.mode === 'dark' ? '#ffffff' : '#1a202c',
  marginBottom: theme.spacing(1),
  letterSpacing: '-0.5px',
  background: theme.palette.mode === 'dark'
    ? 'linear-gradient(135deg, #ffffff 0%, #e0e0e0 100%)'
    : 'linear-gradient(135deg, #1a202c 0%, #4a5568 100%)',
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
  backgroundClip: 'text',
}));

const Subtitle = styled(Typography)(({ theme }) => ({
  fontSize: '16px',
  color: theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.7)' : 'rgba(26, 32, 44, 0.7)',
  lineHeight: 1.6,
  marginTop: theme.spacing(1),
}));

const ConnectingDots = styled(Box)(({ theme }) => ({
  display: 'flex',
  gap: theme.spacing(1),
  marginTop: theme.spacing(2),
  justifyContent: 'center',
  '& .dot': {
    width: 8,
    height: 8,
    borderRadius: '50%',
    backgroundColor: theme.palette.mode === 'dark' ? '#667eea' : '#667eea',
    animation: 'dotPulse 1.4s ease-in-out infinite',
    '&:nth-of-type(1)': { animationDelay: '0s' },
    '&:nth-of-type(2)': { animationDelay: '0.2s' },
    '&:nth-of-type(3)': { animationDelay: '0.4s' },
    '@keyframes dotPulse': {
      '0%, 80%, 100%': { transform: 'scale(0.8)', opacity: 0.5 },
      '40%': { transform: 'scale(1.2)', opacity: 1 },
    },
  },
}));

const AuthenticatingLoader = () => {
  return (
    <Container>
      <Fade in={true} timeout={500}>
        <ContentBox>
          <WalletIconContainer>
            <OuterRing />
            <MiddleRing />
            <LogoContainer>
              <Box
                sx={{
                  width: 50,
                  height: 50,
                  borderRadius: '50%',
                  background: 'rgba(255, 255, 255, 0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Box
                  component="svg"
                  sx={{
                    width: 32,
                    height: 32,
                    fill: 'white',
                  }}
                  viewBox="0 0 24 24"
                >
                  <path d="M21 18v1c0 1.1-.9 2-2 2H5c-1.1 0-2-.9-2-2V5c0-1.1.9-2 2-2h14c1.1 0 2 .9 2 2v1h-9c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h9zm-9-2h10V8H12v8zm4-2.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z" />
                </Box>
              </Box>
            </LogoContainer>
          </WalletIconContainer>
          
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
            <Title>Connecting Wallet</Title>
            <Subtitle>
              Verifying access permissions...
            </Subtitle>
            <ConnectingDots>
              <Box className="dot" />
              <Box className="dot" />
              <Box className="dot" />
            </ConnectingDots>
          </Box>
        </ContentBox>
      </Fade>
    </Container>
  );
};

export default AuthenticatingLoader;

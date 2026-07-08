import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material';

const DarkModeContext = createContext();

export const useDarkMode = () => {
  const context = useContext(DarkModeContext);
  if (!context) {
    throw new Error('useDarkMode must be used within DarkModeProvider');
  }
  return context;
};

const STORAGE_KEY = 'darkModePreference';

// Get system preference
const getSystemPreference = () => {
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }
  return false;
};

// Get initial mode from localStorage or system preference
const getInitialMode = () => {
  if (typeof window === 'undefined') return false;
  
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'true') return true;
  if (stored === 'false') return false;
  // If not stored, use system preference
  return getSystemPreference();
};

export const DarkModeProvider = ({ children }) => {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Mark as mounted on client side to avoid hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  // Listen for system theme changes (if user hasn't manually set preference)
  useEffect(() => {
    if (!mounted) return;

    const stored = localStorage.getItem(STORAGE_KEY);
    // Only listen to system changes if no manual preference is stored
    if (stored === null) {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleChange = (e) => {
        setIsDarkMode(false);
      };

      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
  }, [mounted]);

  // Update body attribute for existing CSS dark mode styles
  useEffect(() => {
    if (!mounted) return;
    
    const body = document.body;
    if (isDarkMode) {
      body.setAttribute('data-theme-version', 'dark');
      body.classList.add('dark-mode');
    } else {
      body.setAttribute('data-theme-version', 'light');
      body.classList.remove('dark-mode');
    }
  }, [isDarkMode, mounted]);

  // Toggle dark mode
  const toggleDarkMode = () => {
    setIsDarkMode(false);
  };

  // Set dark mode explicitly
  const setDarkMode = (value) => {
    setIsDarkMode(false);
    localStorage.setItem(STORAGE_KEY, String(value));
  };

  // Create MUI theme
  const theme = useMemo(
    () =>
      createTheme({
        palette: {
          mode: isDarkMode ? 'dark' : 'light',
          primary: {
            main: '#7634dc',
            dark: '#601dc5',
          },
          secondary: {
            main: '#3693ff',
          },
          background: {
            default: isDarkMode ? '#121212' : '#e7e7e7',
            paper: isDarkMode ? '#1e1e1e' : '#ffffff',
          },
          text: {
            primary: isDarkMode ? '#ffffff' : '#312a2a',
            secondary: isDarkMode ? '#b0b0b0' : '#737b8b',
          },
        },
        components: {
          MuiCssBaseline: {
            styleOverrides: {
              body: {
                backgroundColor: isDarkMode ? '#121212' : '#e7e7e7',
                transition: 'background-color 0.3s ease, color 0.3s ease',
              },
            },
          },
          MuiPaper: {
            styleOverrides: {
              root: {
                backgroundColor: isDarkMode ? '#1e1e1e' : '#ffffff',
                transition: 'background-color 0.3s ease, color 0.3s ease',
              },
            },
          },
          MuiCard: {
            styleOverrides: {
              root: {
                backgroundColor: isDarkMode ? '#1e1e1e' : '#ffffff',
                transition: 'background-color 0.3s ease, color 0.3s ease',
              },
            },
          },
        },
      }),
    [isDarkMode]
  );

  const value = {
    isDarkMode,
    toggleDarkMode,
    setDarkMode,
    mounted,
  };

  return (
    <DarkModeContext.Provider value={value}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </DarkModeContext.Provider>
  );
};

export default DarkModeProvider;





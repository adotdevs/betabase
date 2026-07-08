import React from 'react';
import { IconButton, Tooltip } from '@mui/material';
import { Brightness4, Brightness7 } from '@mui/icons-material';
import { useDarkMode } from '../context/DarkModeContext';

const DarkModeToggle = ({ sx = {} }) => {
  const { isDarkMode, toggleDarkMode, mounted } = useDarkMode();

  // Prevent hydration mismatch
  if (!mounted) {
    return (
      <IconButton
        sx={{
          ...sx,
          opacity: 0,
        }}
        disabled
      >
        <Brightness7 />
      </IconButton>
    );
  }
return null
  // return (
  //   <Tooltip title={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}>
  //     <IconButton
  //       onClick={toggleDarkMode}
  //       color="inherit"
  //       sx={{
  //         ...sx,
  //         transition: 'transform 0.2s ease, opacity 0.2s ease',
  //         '&:hover': {
  //           transform: 'scale(1.1)',
  //           backgroundColor: 'action.hover',
  //         },
  //       }}
  //       aria-label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
  //     >
  //       {isDarkMode ? (
  //         <Brightness7 sx={{ color: '#ffb74d' }} />
  //       ) : (
  //         <Brightness4 sx={{ color: '#424242' }} />
  //       )}
  //     </IconButton>
  //   </Tooltip>
  // );
};

export default DarkModeToggle;


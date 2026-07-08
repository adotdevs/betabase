import React from 'react';
import { Box } from '@mui/material';
import DarkModeToggle from '../../../../components/DarkModeToggle';
import CrmNotificationBell from './CrmNotificationBell';

const CrmAppBarActions = () => (
  <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 0.75, sm: 1 } }}>
    <CrmNotificationBell />
    <DarkModeToggle />
  </Box>
);

export default CrmAppBarActions;

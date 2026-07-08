import React, { useEffect, useState, useRef, useMemo } from 'react';
import {
  Box,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
  IconButton,
  Divider,
  Avatar,
  useMediaQuery,
  useTheme,
  Badge,
  Collapse,
} from '@mui/material';
import {
  ChevronLeft,
  ChevronRight,
  Dashboard,
  People,
  AdminPanelSettings,
  Logout,
  Menu,
  EmailOutlined,
  Phone,
  PhoneMissed,
  Settings,
  Schedule,
  Error as ErrorIcon,
  Cancel,
  ExpandLess,
  ExpandMore,
  NotificationsActive,
  FolderOpen,
  FilterList,
} from '@mui/icons-material';
import DeleteForeverIcon from '@mui/icons-material/DeleteForever';
import { useAuthUser, useSignOut } from "react-auth-kit";
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { logoutApi, getEmailQueueStatusApi, allUsersApi, getCallQueueStatusApi, getCallStatisticsApi, getReminderBadgeCountApi } from '../../../Api/Service';
import { toast } from 'react-toastify';
import io from 'socket.io-client';
import { getBackendUrl } from '../../../config/appConfig';
import {
  fetchLeadStatuses,
  getCachedLeadStatuses,
  subscribeLeadStatuses,
} from './components/leadStatusCache';

const LEADS_LINK = '/admin/dashboard/crm';

const Sidebar = ({ isCollapsed, setIsSidebarCollapsed, isMobileMenu, setisMobileMenu }) => {
  const user = useAuthUser();
  const signOut = useSignOut();
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  
  const [drawerVariant, setDrawerVariant] = useState(isMobile ? "temporary" : "permanent");
  const [emailQueueCount, setEmailQueueCount] = useState(0);
  const [pendingCallsCount, setPendingCallsCount] = useState(0);
  const [failedCallsCount, setFailedCallsCount] = useState(0);
  const [noAnswerCallsCount, setNoAnswerCallsCount] = useState(0);
  const [cancelledCallsCount, setCancelledCallsCount] = useState(0);
  const [reminderBadgeCount, setReminderBadgeCount] = useState(0);
  const [callMenuOpen, setCallMenuOpen] = useState(false);
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [leadStatuses, setLeadStatuses] = useState(() => getCachedLeadStatuses() || []);
  const [internalMobileMenu, setInternalMobileMenu] = useState(false);
  const [currentUserLatest, setCurrentUserLatest] = useState(null);
  const previousPathRef = useRef(location.pathname);
  
  // Use internal state if setisMobileMenu not provided
  const mobileMenuState = isMobileMenu ?? internalMobileMenu;
  const setMobileMenuState = setisMobileMenu ?? setInternalMobileMenu;

  // Fetch latest user with permissions to gate menu items accurately
  useEffect(() => {
    const fetchUser = async () => {
      try {
        const u = user()?.user;
        if (!u?._id) return;
        const resp = await allUsersApi({ search: u._id, limit: 1 });
        if (resp.success && resp.allUsers?.length) {
          setCurrentUserLatest(resp.allUsers[0]);
        } else {
          setCurrentUserLatest(u);
        }
      } catch (e) {
        // Non-blocking; fall back to token payload
        setCurrentUserLatest(user()?.user || null);
      }
    };
    fetchUser();
  }, []);

  useEffect(() => {
    const fetchReminderBadge = async () => {
      try {
        const response = await getReminderBadgeCountApi();
        if (response.success) {
          setReminderBadgeCount(response.data?.badgeCount || 0);
        }
      } catch (error) {
        // Non-blocking
      }
    };

    if (user()?.user?.role) {
      fetchReminderBadge();
      const interval = setInterval(fetchReminderBadge, 60000);
      return () => clearInterval(interval);
    }

    return undefined;
  }, [user]);

  // ✅ Socket.io for real-time email queue updates
  useEffect(() => {
    if (user()?.user?.role !== 'superadmin') return;

    // Connect to Socket.io - Use centralized config
    const backendUrl = getBackendUrl();
     
    
    const socket = io(backendUrl, {
      withCredentials: true,
      transports: ['websocket', 'polling'] // Better compatibility
    });

    socket.on('connect', () => {});

    socket.on('connect_error', (error) => { 
    });

    // Listen for email queue updates
    socket.on('emailQueueUpdate', (data) => {const totalCount = (data.pending || 0) + (data.failed || 0);
      setEmailQueueCount(totalCount);
    });

    // Fetch initial status
    getEmailQueueStatusApi().then(response => {
      if (response.success) {
        const totalCount = (response.data.pending || 0) + (response.data.failed || 0);
        setEmailQueueCount(totalCount);}
    }).catch(err => {
      console.error('Error fetching email queue status:', err);
    });

    return () => {socket.disconnect();
    };
  }, [user]);

  // Build menu based on permissions (focus: restricting admins)
  const effectiveUser = currentUserLatest || user()?.user;
  const role = effectiveUser?.role;
  const isSuperadmin = role === 'superadmin';
  const isAdmin = role === 'admin';
  const isSubadmin = role === 'subadmin';

  const hasCrmAccess =
    isSuperadmin ||
    (isAdmin && effectiveUser?.adminPermissions?.accessCrm === true) ||
    (isSubadmin && effectiveUser?.permissions?.accessCrm === true);

  const canAccessCallDashboard =
    isSuperadmin || (isAdmin && effectiveUser?.adminPermissions?.canAccessCallDashboard === true);

  // ✅ Fetch pending and failed calls counts for badges
  useEffect(() => {
    if (!canAccessCallDashboard) return;

    const fetchCallCounts = async () => {
      try {
        const [queueRes, statsRes] = await Promise.all([
          getCallQueueStatusApi({ scheduledPage: 1, scheduledLimit: 1 }),
          getCallStatisticsApi()
        ]);

        if (queueRes.success && queueRes.queue?.scheduledPagination) {
          setPendingCallsCount(queueRes.queue.scheduledPagination.total || 0);
        }

        if (statsRes.success && statsRes.statistics?.byStatus) {
          const failedStats = statsRes.statistics.byStatus.find(s => s._id === 'failed');
          if (failedStats) {
            setFailedCallsCount(failedStats.count || 0);
          }
          const noAnswerStats = statsRes.statistics.byStatus.find(s => s._id === 'no-answer');
          if (noAnswerStats) {
            setNoAnswerCallsCount(noAnswerStats.count || 0);
          }
          const cancelledStats = statsRes.statistics.byStatus.find(s => s._id === 'cancelled');
          if (cancelledStats) {
            setCancelledCallsCount(cancelledStats.count || 0);
          }
        }
      } catch (error) {
        console.error('Error fetching call counts:', error);
      }
    };

    fetchCallCounts();
    // Refresh every 10 seconds
    const interval = setInterval(fetchCallCounts, 10000);
    return () => clearInterval(interval);
  }, [canAccessCallDashboard, currentUserLatest]);

  const canAccessAiInstructions =
    isSuperadmin || (isAdmin && effectiveUser?.adminPermissions?.canAccessAiInstructions === true);

  const menuItems = [];
  if (hasCrmAccess) {
    menuItems.push({ icon: <Dashboard />, label: 'Dashbaord', link: "/admin/dashboard" });
    menuItems.push({ icon: <People />, label: 'Leads', link: "/admin/dashboard/crm" });
    menuItems.push({
      icon: <NotificationsActive />,
      label: 'Reminders',
      link: '/admin/crm/reminders',
      badge: true,
      badgeCount: reminderBadgeCount,
    });
    menuItems.push({
      icon: <FolderOpen />,
      label: 'Document Library',
      link: '/admin/crm/documents',
    });
  }
  
  // Call-related menu items (will be in dropdown)
  const callMenuItems = [];
  if (canAccessCallDashboard) {
    callMenuItems.push({ icon: <Phone />, label: 'Active Calls', link: "/admin/crm/call-dashboard" });
    callMenuItems.push({ icon: <Schedule />, label: 'Pending Calls Queue', link: "/admin/crm/pending-calls", badge: true, badgeCount: pendingCallsCount });
    callMenuItems.push({ icon: <ErrorIcon />, label: 'Failed Calls', link: "/admin/crm/failed-calls", badge: true, badgeCount: failedCallsCount });
    callMenuItems.push({ icon: <PhoneMissed />, label: 'No Answer Calls', link: "/admin/crm/no-answer-calls", badge: true, badgeCount: noAnswerCallsCount });
    callMenuItems.push({ icon: <Cancel />, label: 'Cancelled Calls', link: "/admin/crm/cancelled-calls", badge: true, badgeCount: cancelledCallsCount });
  }

  useEffect(() => {
    if (!canAccessCallDashboard) {
      setCallMenuOpen(false);
      previousPathRef.current = location.pathname;
      return;
    }

    const isCallRoute = (path) => callMenuItems.some(item => path.startsWith(item.link));
    const currentlyCallRoute = isCallRoute(location.pathname);
    const previouslyCallRoute = isCallRoute(previousPathRef.current);

    if (currentlyCallRoute) {
      setCallMenuOpen(true);
    } else if (previouslyCallRoute) {
      setCallMenuOpen(false);
    }

    previousPathRef.current = location.pathname;
  }, [location.pathname, canAccessCallDashboard, callMenuItems.length]);

  // Add AI Instructions for superadmin and admin
  // if (canAccessAiInstructions) {
  //   menuItems.push({ icon: <Settings />, label: 'AI Instructions', link: "/admin/crm/ai-instructions" });
  // }

  // Admin Management (CRM) - superadmin only
  if (isSuperadmin) {
    menuItems.push({ icon: <AdminPanelSettings />, label: 'Admin Management', link: "/admin/crm/admin-management" });
  }

  // Add Recycle Bin and Email Queue for superadmin
  if (user()?.user?.role === 'superadmin') {  // Commented out for now
    menuItems.push({ icon: <DeleteForeverIcon />, label: 'Recycle Bin', link: "/admin/dashboard/crm/recycle-bin" });
    menuItems.push({ icon: <EmailOutlined />, label: 'Email', link: "/admin/crm/email-queue", badge: true });
  }

  // Add Profile link for all admins and superadmin
  if (user()?.user?.role === 'admin' || user()?.user?.role === 'subadmin' || user()?.user?.role === 'superadmin') {
    menuItems.push({ icon: <Settings />, label: 'My Profile', link: "/admin/crm/profile" });
  }

  const isActiveLink = (link) => location.pathname === link;
  const isLeadsRoute = location.pathname === LEADS_LINK;
  const activeStatusFilter = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get('status') || '';
  }, [location.search]);

  useEffect(() => {
    if (!hasCrmAccess) return undefined;
    return subscribeLeadStatuses(setLeadStatuses);
  }, [hasCrmAccess]);

  useEffect(() => {
    if (!hasCrmAccess) return;
    fetchLeadStatuses().catch(() => {});
  }, [hasCrmAccess]);

  useEffect(() => {
    if (isLeadsRoute && hasCrmAccess) {
      setStatusMenuOpen(true);
    }
  }, [isLeadsRoute, hasCrmAccess]);

  const handleLogout = async () => {
    try {
      const logout = await logoutApi();
      if (logout.success) {
        // Clear localStorage token only when backend is localhost
        // For production backend, cookies handle authentication
        if (typeof window !== 'undefined') {
          try {
            // Dynamic import to avoid circular dependency
            const { isBackendLocalhost, isElectronApp } = require('../../../config/appConfig');
            // Clear localStorage token for Electron OR localhost (both use localStorage, not cookies)
            if (isElectronApp() || isBackendLocalhost()) {
              localStorage.removeItem('jwttoken');
            }
          } catch (e) {
            // Fallback: check API URL directly
            const apiUrl = process.env.REACT_APP_API_URL || 'https://api.betabase.pro/api/v1';
            if (apiUrl.includes('localhost') || apiUrl.includes('127.0.0.1') || apiUrl.startsWith('http://')) {
              localStorage.removeItem('jwttoken');
            }
          }
        }
        signOut();
        navigate("/auth/login/crm");
      } else {
        toast.error(logout.msg);
      }
    } catch (error) {
      toast.error(error.message || "Logout failed");
    }
  };

  const drawerWidth = isCollapsed ? 80 : 280;

  // Handle responsive behavior
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) {
        setDrawerVariant("permanent");
        if (setMobileMenuState) {
          setMobileMenuState(false);
        }
      } else {
        setDrawerVariant("temporary");
      }
    };

    window.addEventListener('resize', handleResize);
    handleResize(); // Initialize on mount

    return () => window.removeEventListener('resize', handleResize);
  }, [setMobileMenuState]);

  return (
    <Drawer
      variant={drawerVariant}
      open={isMobile ? mobileMenuState : true}
      onClose={() => setMobileMenuState && setMobileMenuState(false)}
      sx={{
        width: { xs: 280, md: drawerWidth },
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          width: { xs: 280, md: drawerWidth },
          boxSizing: 'border-box',
          border: 'none',
          boxShadow: '0 0 20px rgba(0,0,0,0.1)',
          transition: 'width 0.3s ease, transform 0.3s ease',
          overflowX: 'hidden',
        },
      }}
    >
      {/* Header / Logo */}
      <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {!isCollapsed && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Avatar sx={{ bgcolor: 'primary.main', width: 32, height: 32 }}>B</Avatar>
              <Typography variant="h6" sx={{ fontWeight: 'bold', color: 'text.primary' }}>
              Betabase
              </Typography>
            </Box>
          )}
          {isCollapsed && (
            <Avatar sx={{ bgcolor: 'primary.main', width: 32, height: 32, mx: 'auto' }}>B</Avatar>
          )}
          <Box>
            {/* Desktop collapse toggle */}
            <IconButton
              onClick={() => setIsSidebarCollapsed(!isCollapsed)}
              size="small"
              sx={{ color: 'text.secondary', display: { xs: 'none', md: 'inline-flex' } }}
            >
              {isCollapsed ? <ChevronRight /> : <ChevronLeft />}
            </IconButton>
            {/* Mobile menu toggle */}
            <IconButton
              onClick={() => setMobileMenuState && setMobileMenuState(false)}
              size="small"
              sx={{ color: 'text.secondary', display: { xs: 'inline-flex', md: 'none' } }}
            >
              <Menu />
            </IconButton>
          </Box>
        </Box>
      </Box>

      {/* Menu Items */}
      <Box sx={{ flex: 1, p: 1, overflow: 'auto' }}>
        <List>
          {menuItems.map((item, index) => {
            // Insert Call Dashboard dropdown after the first item (Leads)
            const shouldShowCallMenu = index === 0 && canAccessCallDashboard && callMenuItems.length > 0;
            
            return (
              <React.Fragment key={index}>
                <ListItem disablePadding sx={{ mb: 0.5 }}>
                  <ListItemButton
                    component={Link}
                    to={item.link}
                    onClick={() => isMobile && setMobileMenuState && setMobileMenuState(false)}
                    sx={{
                      borderRadius: 2,
                      color: isActiveLink(item.link) ? 'primary.main' : 'text.secondary',
                      backgroundColor: isActiveLink(item.link) ? 'action.selected' : 'transparent',
                      '&:hover': { 
                        backgroundColor: isActiveLink(item.link) ? 'action.selected' : 'action.hover' 
                      },
                      justifyContent: isCollapsed ? 'center' : 'flex-start',
                      px: 2,
                      py: 1.5,
                    }}
                  >
                    <ListItemIcon
                      sx={{
                        minWidth: 'auto',
                        color: 'inherit',
                        mr: isCollapsed ? 0 : 2,
                      }}
                    >
                      {item.badge && (
                        (item.badgeCount !== undefined ? item.badgeCount > 0 : emailQueueCount > 0)
                      ) ? (
                        <Badge 
                          badgeContent={item.badgeCount !== undefined ? item.badgeCount : emailQueueCount} 
                          color={item.link?.includes('failed') ? 'error' : item.link?.includes('reminders') ? 'primary' : 'warning'} 
                          max={99}
                        >
                          {item.icon}
                        </Badge>
                      ) : (
                        item.icon
                      )}
                    </ListItemIcon>
                    {!isCollapsed && (
                      <ListItemText
                        primary={item.label}
                        primaryTypographyProps={{
                          fontSize: '0.875rem',
                          fontWeight: isActiveLink(item.link) ? 600 : 500,
                        }}
                      />
                    )}
                    {!isCollapsed && item.badge && (
                      (item.badgeCount !== undefined ? item.badgeCount > 0 : emailQueueCount > 0)
                    ) && (
                      <Badge 
                        badgeContent={item.badgeCount !== undefined ? item.badgeCount : emailQueueCount} 
                        color={item.link?.includes('failed') ? 'error' : item.link?.includes('reminders') ? 'primary' : 'warning'} 
                        max={99}
                      />
                    )}
                  </ListItemButton>
                </ListItem>

                {item.link === LEADS_LINK && hasCrmAccess && (
                  <>
                    <ListItem disablePadding sx={{ mb: 0.5 }}>
                      <ListItemButton
                        onClick={() => {
                          if (isCollapsed) return;
                          setStatusMenuOpen((prev) => {
                            const next = !prev;
                            localStorage.setItem('lead-status-menu-open', JSON.stringify(next));
                            return next;
                          });
                        }}
                        sx={{
                          borderRadius: 2,
                          color: isLeadsRoute ? 'primary.main' : 'text.secondary',
                          backgroundColor: isLeadsRoute ? 'action.selected' : 'transparent',
                          '&:hover': {
                            backgroundColor: 'action.hover',
                          },
                          justifyContent: isCollapsed ? 'center' : 'flex-start',
                          px: 2,
                          py: 1.5,
                        }}
                      >
                        <ListItemIcon
                          sx={{
                            minWidth: 'auto',
                            color: 'inherit',
                            mr: isCollapsed ? 0 : 2,
                          }}
                        >
                          <FilterList />
                        </ListItemIcon>
                        {!isCollapsed && (
                          <>
                            <ListItemText
                              primary="Status"
                              primaryTypographyProps={{
                                fontSize: '0.875rem',
                                fontWeight: isLeadsRoute ? 600 : 500,
                              }}
                            />
                            {statusMenuOpen ? <ExpandLess /> : <ExpandMore />}
                          </>
                        )}
                      </ListItemButton>
                    </ListItem>
                    <Collapse in={statusMenuOpen && !isCollapsed} timeout="auto" unmountOnExit>
                      <List component="div" disablePadding>
                        <ListItem disablePadding sx={{ mb: 0.5, pl: 4 }}>
                          <ListItemButton
                            component={Link}
                            to={LEADS_LINK}
                            onClick={() => isMobile && setMobileMenuState && setMobileMenuState(false)}
                            sx={{
                              borderRadius: 2,
                              color: isLeadsRoute && !activeStatusFilter ? 'primary.main' : 'text.secondary',
                              backgroundColor: isLeadsRoute && !activeStatusFilter ? 'action.selected' : 'transparent',
                              '&:hover': {
                                backgroundColor: isLeadsRoute && !activeStatusFilter ? 'action.selected' : 'action.hover',
                              },
                              px: 2,
                              py: 1.25,
                            }}
                          >
                            <ListItemText
                              primary="All Leads"
                              primaryTypographyProps={{
                                fontSize: '0.8125rem',
                                fontWeight: isLeadsRoute && !activeStatusFilter ? 600 : 500,
                              }}
                            />
                          </ListItemButton>
                        </ListItem>
                        {leadStatuses.map((status) => {
                          const isActive = isLeadsRoute && activeStatusFilter === status.label;
                          return (
                            <ListItem key={status._id} disablePadding sx={{ mb: 0.5, pl: 4 }}>
                              <ListItemButton
                                component={Link}
                                to={`${LEADS_LINK}?status=${encodeURIComponent(status.label)}`}
                                onClick={() => isMobile && setMobileMenuState && setMobileMenuState(false)}
                                sx={{
                                  borderRadius: 2,
                                  color: isActive ? 'primary.main' : 'text.secondary',
                                  backgroundColor: isActive ? 'action.selected' : 'transparent',
                                  '&:hover': {
                                    backgroundColor: isActive ? 'action.selected' : 'action.hover',
                                  },
                                  px: 2,
                                  py: 1.25,
                                }}
                              >
                                <ListItemText
                                  primary={status.label}
                                  primaryTypographyProps={{
                                    fontSize: '0.8125rem',
                                    fontWeight: isActive ? 600 : 500,
                                  }}
                                />
                              </ListItemButton>
                            </ListItem>
                          );
                        })}
                      </List>
                    </Collapse>
                  </>
                )}
                
                {/* Call Dashboard Dropdown Menu - Inserted after first item (Leads) */}
                {shouldShowCallMenu && (
                  <>
                    <ListItem disablePadding sx={{ mb: 0.5 }}>
                      <ListItemButton
                        onClick={() => !isCollapsed && setCallMenuOpen(prev => { const next=!prev; localStorage.setItem('call-menu-open',JSON.stringify(next)); return next; })}
                        sx={{
                          borderRadius: 2,
                          color: (callMenuItems.some(item => isActiveLink(item.link))) ? 'primary.main' : 'text.secondary',
                          backgroundColor: (callMenuItems.some(item => isActiveLink(item.link))) ? 'action.selected' : 'transparent',
                          '&:hover': { 
                            backgroundColor: 'action.hover' 
                          },
                          justifyContent: isCollapsed ? 'center' : 'flex-start',
                          px: 2,
                          py: 1.5,
                        }}
                      >
                        <ListItemIcon
                          sx={{
                            minWidth: 'auto',
                            color: 'inherit',
                            mr: isCollapsed ? 0 : 2,
                          }}
                        >
                          <Phone />
                        </ListItemIcon>
                        {!isCollapsed && (
                          <>
                            <ListItemText
                              primary="Call Dashboard"
                              primaryTypographyProps={{
                                fontSize: '0.875rem',
                                fontWeight: (callMenuItems.some(item => isActiveLink(item.link))) ? 600 : 500,
                              }}
                            />
                            {callMenuOpen ? <ExpandLess /> : <ExpandMore />}
                          </>
                        )}
                      </ListItemButton>
                    </ListItem>
                    <Collapse in={callMenuOpen && !isCollapsed} timeout="auto" unmountOnExit>
                      <List component="div" disablePadding>
                        {callMenuItems.map((item, itemIndex) => {
                          const isActive = isActiveLink(item.link);
                          return (
                            <ListItem key={itemIndex} disablePadding sx={{ mb: 0.5, pl: 4 }}>
                              <ListItemButton
                                component={Link}
                                to={item.link}
                                onClick={() => isMobile && setMobileMenuState && setMobileMenuState(false)}
                                sx={{
                                  borderRadius: 2,
                                  color: isActive ? 'primary.main' : 'text.secondary',
                                  backgroundColor: isActive ? 'action.selected' : 'transparent',
                                  '&:hover': { 
                                    backgroundColor: isActive ? 'action.selected' : 'action.hover' 
                                  },
                                  px: 2,
                                  py: 1.5,
                                }}
                              >
                                <ListItemIcon
                                  sx={{
                                    minWidth: 'auto',
                                    color: 'inherit',
                                    mr: 2,
                                  }}
                                >
                                  {item.badge && item.badgeCount > 0 ? (
                                    <Badge 
                                      badgeContent={item.badgeCount} 
                                      color={item.link?.includes('failed') ? 'error' : item.link?.includes('no-answer') ? 'warning' : 'default'} 
                                      max={99}
                                    >
                                      {item.icon}
                                    </Badge>
                                  ) : (
                                    item.icon
                                  )}
                                </ListItemIcon>
                                <ListItemText
                                  primary={item.label}
                                  primaryTypographyProps={{
                                    fontSize: '0.875rem',
                                    fontWeight: isActive ? 600 : 500,
                                  }}
                                />
                                {item.badge && item.badgeCount > 0 && (
                                  <Badge 
                                    badgeContent={item.badgeCount} 
                                    color={item.link?.includes('failed') ? 'error' : item.link?.includes('no-answer') ? 'warning' : 'default'} 
                                    max={99}
                                  />
                                )}
                              </ListItemButton>
                            </ListItem>
                          );
                        })}
                      </List>
                    </Collapse>
                  </>
                )}
              </React.Fragment>
            );
          })}
        </List>
      </Box>

      <Divider />

      {/* Bottom Section - Logout */}
      <Box sx={{ p: 1 }}>
        <List>
          <ListItem disablePadding>
            <ListItemButton
              onClick={handleLogout}
              sx={{
                borderRadius: 2,
                justifyContent: isCollapsed ? 'center' : 'flex-start',
                px: 2,
                py: 1.5,
                color: 'text.secondary',
                '&:hover': { 
                  backgroundColor: 'error.light',
                  color: 'error.main'
                },
              }}
            >
              <ListItemIcon
                sx={{
                  minWidth: 'auto',
                  color: 'inherit',
                  mr: isCollapsed ? 0 : 2,
                }}
              >
                <Logout />
              </ListItemIcon>
              {!isCollapsed && (
                <ListItemText
                  primary="Logout"
                  primaryTypographyProps={{ fontSize: '0.875rem' }}
                />
              )}
            </ListItemButton>
          </ListItem>
        </List>
      </Box>

      {/* User Profile */}
      {!isCollapsed && (
        <Box sx={{ p: 2, borderTop: 1, borderColor: 'divider' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Avatar sx={{ width: 32, height: 32, bgcolor: 'primary.main' }}>
              {'A'}
            </Avatar>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary' }} noWrap>
                {user()?.user?.firstName}{" "}{user()?.user?.lastName}
                
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary' }} noWrap>
                {user()?.user?.email}
              </Typography>
            </Box>
          </Box>
        </Box>
      )}
    </Drawer>
  );
};

export default Sidebar;

import React, { useEffect, useState } from "react";
import Sidebar from "./Sidebar.js";
import CrmAppBarActions from './components/CrmAppBarActions';
import {
  allUsersApi,
  bypassSingleUserApi,
  deleteEachUserApi,
  updateSignleUsersStatusApi,
  UpdateAdminPermissionsApi,
  UpdateSubAdminPermissionsApi,
  registerSubAdminApi,
  UpdateAdminVapiConfigApi,
  UpdateAdminSipConfigApi,
  restartServerApi,
  getRestrictionsApi,
  UpdateRestrictionsApi
} from "../../../Api/Service";
import { updateSignleUsersApi } from "../../../Api/Service";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { useAuthUser } from "react-auth-kit";
import {
  Card,
  CardContent,
  CardHeader,
  Avatar,
  Typography,
  Box,
  Grid,
  Button,
  Chip,
  LinearProgress,
  Stack,
  Switch,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Divider,
  CircularProgress,
  FormControlLabel,
  TextField
} from '@mui/material';
import {
  Person as PersonIcon,
  Email as EmailIcon,
  CalendarToday as CalendarIcon,
  ManageAccounts as ManageIcon,
  AdminPanelSettings as AdminIcon,
  CheckCircle as CheckIcon,
  Delete as DeleteIcon,
  VerifiedUser as VerifiedIcon,
  Warning as WarningIcon,
  ExpandMore as ExpandMoreIcon,
  Security as SecurityIcon,
  People as PeopleIcon,
  Business as CrmIcon,
  Settings as SettingsIcon,
  RestartAlt as RestartIcon
} from '@mui/icons-material';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions 
   
} from '@mui/material';
import AdminSmtpConfigCardSection from "../components/AdminSmtpConfigCardSection";

const AdminManagementCRM = () => {
  const [users, setUsers] = useState([]);
  const [unVerified, setUnVerified] = useState([]);
  const [subAdmins, setSubAdmins] = useState([]);
  const [unVerifiedSubAdmins, setUnVerifiedSubAdmins] = useState([]);
  const [open, setOpen] = useState(false);
  const [modalData, setModalData] = useState({});
  const [isDisable, setIsDisable] = useState(false);
  const [isUsers, setIsUsers] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isRestarting, setIsRestarting] = useState(false);
  const [globalSettings, setGlobalSettings] = useState({ walletEnabled: true });
  const [updatingGlobalSettings, setUpdatingGlobalSettings] = useState(false);

  const authUser = useAuthUser();
  const navigate = useNavigate();

  // CRM shell layout state (match other CRM pages)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileMenu, setIsMobileMenu] = useState(false);
  // Add Admin dialog state
  const [addOpen, setAddOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newAdmin, setNewAdmin] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: `Admin@${Math.random().toString(36).slice(2,10)}`,
    phone: "",
    note: "",
    address: "",
    city: "",
    country: "",
    postalCode: "",
    currency: "USD",
    AiTradingPercentage: 1.25
  });
  // Manage Admin dialog state
  const [manageOpen, setManageOpen] = useState(false);
  const [managing, setManaging] = useState(false);
  const [editAdmin, setEditAdmin] = useState({
    _id: "",
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    phone: "",
    note: "",
    address: "",
    city: "",
    country: "",
    postalCode: "",
    currency: "USD",
    AiTradingPercentage: 1.25
  });
  
  // Vapi Config dialog state
  const [vapiConfigOpen, setVapiConfigOpen] = useState(false);
  const [vapiConfigLoading, setVapiConfigLoading] = useState(false);
  const [vapiConfig, setVapiConfig] = useState({
    userId: "",
    apiKey: "",
    assistantId: "",
    phoneNumberId: "",
    enabled: false
  });

  // SIP Config dialog state
  const [sipConfigOpen, setSipConfigOpen] = useState(false);
  const [sipConfigLoading, setSipConfigLoading] = useState(false);
  const [sipConfig, setSipConfig] = useState({
    userId: "",
    server: "",
    username: "",
    password: "",
    port: 5060,
    enabled: false
  });

  const getAllUsers = async () => {
    try {
      // Fetch admins with role filter
      const adminParams = { role: 'admin', limit: 1000 };
      const adminResp = await allUsersApi(adminParams);

      // Fetch subadmins with role filter
      const subAdminParams = { role: 'subadmin', limit: 1000 };
      const subAdminResp = await allUsersApi(subAdminParams);

      if (adminResp.success) {
        let filtered;
        let unverified;
        if (authUser().user.role === "superadmin") {
          filtered = adminResp.allUsers.filter((user) => {
            return user.role === "admin" && user.verified === true;
          });
          unverified = adminResp.allUsers.filter((user) => {
            return user.role === "admin" && user.verified === false;
          });
        } else {
          navigate('/admin/dashboard');
          return;
        }
        setUsers(filtered.reverse());
        setUnVerified(unverified.reverse());
      } else {
        toast.dismiss();
        toast.error(adminResp.msg || 'Failed to fetch admins');
      }

      if (subAdminResp.success) {
        let filteredSubAdmins;
        let unverifiedSubAdmins;
        if (authUser().user.role === "superadmin") {
          filteredSubAdmins = subAdminResp.allUsers.filter((user) => {
            return user.role === "subadmin" && user.verified === true;
          });
          unverifiedSubAdmins = subAdminResp.allUsers.filter((user) => {
            return user.role === "subadmin" && user.verified === false;
          });
        }
        setSubAdmins(filteredSubAdmins.reverse());
        setUnVerifiedSubAdmins(unverifiedSubAdmins.reverse());
      } else {
        toast.dismiss();
        toast.error(subAdminResp.msg || 'Failed to fetch sub admins');
      }
    } catch (error) {
      toast.dismiss();
      toast.error(error?.message || 'Error loading users');
    } finally {
      setIsLoading(false);
    }
  };

  const deleteEachUser = async (user) => {
    try {
      setIsDisable(true);
      const res = await deleteEachUserApi(user._id);
      if (res.success) {
        toast.dismiss();
        toast.success(res.msg || 'Admin deleted');
        setOpen(false);
        getAllUsers();
      } else {
        toast.dismiss();
        toast.error(res.msg || 'Failed to delete admin');
        setOpen(false);
        getAllUsers();
      }
    } catch (error) {
      toast.dismiss();
      toast.error(error?.message || 'Error deleting admin');
    } finally {
      setIsDisable(false);
    }
  };

  const bypassSingleUser = async (user) => {
    try {
      setIsUsers(true);
      const res = await bypassSingleUserApi(user._id);
      if (res.success) {
        toast.dismiss();
        getAllUsers();
        toast.success(res.msg || 'Admin verified');
      } else {
        toast.dismiss();
        toast.error(res.msg || 'Failed to verify admin');
      }
    } catch (error) {
      toast.dismiss();
      toast.error(error?.message || 'Error verifying admin');
    } finally {
      setIsUsers(false);
    }
  };

  const onOpenModal = (user) => {
    setOpen(true);
    setModalData(user);
  };
  const onCloseModal = () => setOpen(false);

  const fetchGlobalSettings = async () => {
    try {
      const response = await getRestrictionsApi();
      if (response.success && response.data) {
        setGlobalSettings({
          walletEnabled: response.data.walletEnabled !== false // Default to true if not set
        });
      }
    } catch (error) {
      console.error('Error fetching global settings:', error);
    }
  };

  const handleGlobalWalletToggle = async (enabled) => {
    if (!enabled) {
      const confirmed = window.confirm(
        '⚠️ Warning: This will disable wallet access for ALL users, admins, and sub admins.\n\n' +
        'Only Super Admin will be able to access wallet features.\n\n' +
        'Are you sure you want to proceed?'
      );
      if (!confirmed) {
        return;
      }
    }

    setUpdatingGlobalSettings(true);
    try {
      const response = await UpdateRestrictionsApi({
        walletEnabled: enabled
      });
      if (response.success) {
        setGlobalSettings({ walletEnabled: enabled });
        toast.success(enabled 
          ? 'Wallet platform enabled for all users' 
          : 'Wallet platform disabled for all users'
        );
      } else {
        toast.error(response.msg || 'Failed to update global wallet settings');
      }
    } catch (error) {
      toast.error(error?.message || 'Failed to update global wallet settings');
    } finally {
      setUpdatingGlobalSettings(false);
    }
  };

  useEffect(() => {
    // Gate: Only superadmin may access CRM Admin Management
    const u = authUser()?.user;
    if (!u) {
      navigate('/auth/login/crm');
      return;
    }
    if (u.role !== 'superadmin') {
      navigate('/admin/dashboard');
      return;
    }
    getAllUsers();
    fetchGlobalSettings();
  }, []);

  // CRM-only permission categories
  const [permLoad, setPermLoad] = useState(null);
  const [expandedAccordions, setExpandedAccordions] = useState({}); // Track expanded state per user+category
  
  const handlePermissionChange = async (userId, key, value) => {
    setPermLoad({ userId, key });
    try {
      const body = { [key]: value };
      const res = await UpdateAdminPermissionsApi(userId, body);
      if (res.success) {
        toast.success("Permission updated");
        // ✅ Update local state instead of refetching to keep accordion open
        setUsers(prevUsers => prevUsers.map(user => {
          if (user._id === userId) {
            return {
              ...user,
              adminPermissions: {
                ...user.adminPermissions,
                [key]: value
              }
            };
          }
          return user;
        }));
      } else {
        toast.error(res.msg || "Failed to update permission");
      }
    } catch (error) {
      toast.error(error?.msg || "Failed to update permission");
    } finally {
      setPermLoad(null);
    }
  };

  const handleSubAdminPermissionChange = async (userId, key, value) => {
    setPermLoad({ userId, key });
    try {
      const body = { [key]: value };
      const res = await UpdateSubAdminPermissionsApi(userId, body);
      if (res.success) {
        toast.success("Permission updated");
        // ✅ Update local state instead of refetching to keep accordion open
        setSubAdmins(prevSubAdmins => prevSubAdmins.map(user => {
          if (user._id === userId) {
            return {
              ...user,
              permissions: {
                ...user.permissions,
                [key]: value
              }
            };
          }
          return user;
        }));
        setUnVerifiedSubAdmins(prevSubAdmins => prevSubAdmins.map(user => {
          if (user._id === userId) {
            return {
              ...user,
              permissions: {
                ...user.permissions,
                [key]: value
              }
            };
          }
          return user;
        }));
      } else {
        toast.error(res.msg || "Failed to update permission");
      }
    } catch (error) {
      toast.error(error?.msg || "Failed to update permission");
    } finally {
      setPermLoad(null);
    }
  };
  
  const handleAccordionChange = (userId, categoryIndex) => (event, isExpanded) => {
    setExpandedAccordions(prev => ({
      ...prev,
      [`${userId}-${categoryIndex}`]: isExpanded
    }));
  };
  
  // Handle Vapi Config update
  const handleVapiConfigChange = async () => {
    if (!vapiConfig.apiKey && vapiConfig.enabled) {
      toast.error('API key is required when enabling custom Vapi config');
      return;
    }
    
    setVapiConfigLoading(true);
    try {
      const res = await UpdateAdminVapiConfigApi(vapiConfig.userId, {
        apiKey: vapiConfig.apiKey || null,
        assistantId: vapiConfig.assistantId || null,
        phoneNumberId: vapiConfig.phoneNumberId || null,
        enabled: vapiConfig.enabled
      });
      
      if (res.success) {
        toast.success('Vapi configuration updated successfully');
        setVapiConfigOpen(false);
        getAllUsers(); // Refresh users list
      } else {
        toast.error(res.msg || 'Failed to update Vapi configuration');
      }
    } catch (error) {
      toast.error(error?.msg || 'Failed to update Vapi configuration');
    } finally {
      setVapiConfigLoading(false);
    }
  };
  
  const openVapiConfigDialog = (user) => {
    setVapiConfig({
      userId: user._id,
      apiKey: user.vapiConfig?.apiKey || "",
      assistantId: user.vapiConfig?.assistantId || "",
      phoneNumberId: user.vapiConfig?.phoneNumberId || "",
      enabled: user.vapiConfig?.enabled || false
    });
    setVapiConfigOpen(true);
  };

  // Handle SIP Config update
  const handleSipConfigChange = async () => {
    if (sipConfig.enabled && (!sipConfig.server || !sipConfig.username || !sipConfig.password)) {
      toast.error('Server, username, and password are required when enabling custom SIP config');
      return;
    }
    
    setSipConfigLoading(true);
    try {
      const res = await UpdateAdminSipConfigApi(sipConfig.userId, {
        server: sipConfig.server || null,
        username: sipConfig.username || null,
        password: sipConfig.password || null,
        port: sipConfig.port || 5060,
        enabled: sipConfig.enabled
      });
      
      if (res.success) {
        toast.success('SIP configuration updated successfully');
        setSipConfigOpen(false);
        getAllUsers(); // Refresh users list
      } else {
        toast.error(res.msg || 'Failed to update SIP configuration');
      }
    } catch (error) {
      toast.error(error?.msg || 'Failed to update SIP configuration');
    } finally {
      setSipConfigLoading(false);
    }
  };
  
  const openSipConfigDialog = (user) => {
    setSipConfig({
      userId: user._id,
      server: user.sipConfig?.server || "",
      username: user.sipConfig?.username || "",
      password: user.sipConfig?.password || "",
      port: user.sipConfig?.port || 5060,
      enabled: user.sipConfig?.enabled || false
    });
    setSipConfigOpen(true);
  };

  const handleSmtpUpdated = (userId, smtpConfig) => {
    const applyUpdate = (list) =>
      list.map((user) => (user._id === userId ? { ...user, smtpConfig } : user));

    setUsers(applyUpdate);
    setUnVerified(applyUpdate);
    setSubAdmins(applyUpdate);
    setUnVerifiedSubAdmins(applyUpdate);
  };

  const handleRestartServer = async () => {
    if (!window.confirm('⚠️ Are you sure you want to restart the server?\n\nThis will disconnect all users and the server will be unavailable for a few seconds.\n\nThe page will automatically reload after restart.')) {
      return;
    }

    try {
      setIsRestarting(true);
      const response = await restartServerApi();
      
      if (response.success) {
        toast.success(response.msg || 'Server restart initiated. The server will restart in 2 seconds.');
        
        // Wait a bit, then try to reconnect
        setTimeout(() => {
          // Show message that we're waiting for server to come back
          toast.info('Waiting for server to restart...', { autoClose: false });
          
          // Poll for server to come back online
          let attempts = 0;
          const maxAttempts = 30; // 30 attempts = 30 seconds
          const checkServer = setInterval(async () => {
            attempts++;
            try {
              // Try a simple API call to check if server is back
              const testResponse = await fetch(`${window.location.origin}/api/v1/login`, {
                method: 'OPTIONS',
                signal: AbortSignal.timeout(2000)
              });
              
              if (testResponse.status !== 404) {
                clearInterval(checkServer);
                toast.success('Server restarted successfully! Reloading page...');
                setTimeout(() => {
                  window.location.reload();
                }, 1000);
              }
            } catch (error) {
              // Server still down, continue waiting
              if (attempts >= maxAttempts) {
                clearInterval(checkServer);
                toast.warning('Server is taking longer than expected to restart. Please refresh the page manually.');
                setIsRestarting(false);
              }
            }
          }, 1000);
        }, 3000);
      } else {
        toast.error(response.msg || 'Failed to restart server');
        setIsRestarting(false);
      }
    } catch (error) {
      console.error('Error restarting server:', error);
      toast.error(error.response?.data?.msg || 'Failed to restart server. Please check server logs.');
      setIsRestarting(false);
    }
  };

  const permissionCategories = [
    {
      name: 'Profile',
      icon: <SettingsIcon />,
      color: '#667eea',
      permissions: [
        { key: 'isProfileUpdate', label: 'Edit Profile', desc: "Allow administrator to edit their own profile information, Vapi configuration settings, and SIP configuration settings." }
      ]
    },
    {
      name: 'CRM Access',
      icon: <CrmIcon />,
      color: '#10b981',
      permissions: [
        { key: 'accessCrm', label: 'CRM Access', desc: "Allow access to CRM dashboard and features." },
        { key: 'canManageCrmLeads', label: 'Manage Leads', desc: "Upload leads CSV and assign leads (admins only)." },
        { key: 'canUploadLeads', label: 'Upload Leads CSV', desc: "Allow uploading leads via CSV in CRM." },
        { key: 'canMakeCalls', label: 'Make Calls', desc: "Allow initiating calls from CRM." },
        { key: 'canAccessCallDashboard', label: 'Call Dashboard', desc: "Allow access to Call Dashboard." },
        { key: 'canAccessAiInstructions', label: 'AI Instructions', desc: "Allow access to AI Instructions editor." }
      ]
    },
    {
      name: 'Wallet Access',
      icon: <PeopleIcon />,
      color: '#f59e0b',
      permissions: [
        { key: 'accessWallet', label: 'Wallet Access', desc: "Allow access to wallet platform and all wallet features." },
        { key: 'editWalletAddress', label: 'Wallet Addresses', desc: "Allow administrator to view and edit user wallet deposit addresses." }
      ]
    }
  ];

  const subadminPermissionCategories = [
    {
      name: 'Client Management',
      icon: <PeopleIcon />,
      color: '#667eea',
      permissions: [
        { key: 'viewClientDetails', label: 'View Client Details', desc: "Allow sub-admin to view personal details of assigned clients." },
        { key: 'editUserProfile', label: 'Edit Client Profiles', desc: "Allow sub-admin to edit personal details of assigned clients." }
      ]
    },
    {
      name: 'CRM Access',
      icon: <CrmIcon />,
      color: '#10b981',
      permissions: [
        { key: 'accessCrm', label: 'CRM Access', desc: "Allow sub-admin to access CRM dashboard and features." }
      ]
    },
    {
      name: 'Wallet Access',
      icon: <PeopleIcon />,
      color: '#f59e0b',
      permissions: [
        { key: 'accessWallet', label: 'Wallet Access', desc: "Allow access to wallet platform and all wallet features." },
        { key: 'editUserWallet', label: 'Edit Wallets', desc: "Allow sub-admin to edit user wallet balances and top-ups." },
        { key: 'editWalletAddress', label: 'Wallet Addresses', desc: "Allow sub-admin to view and edit user wallet deposit addresses." }
      ]
    }
  ];

  const darkCardStyles = {
    background: 'linear-gradient(135deg, #1e1e1e 0%, #2d2d2d 100%)',
    border: '1px solid #333',
    color: '#ffffff',
    '&:hover': {
      boxShadow: '0 8px 30px rgba(0,0,0,0.4)',
      transform: 'translateY(-2px)'
    }
  };

  const AdminCard = ({ user, isUnverified = false }) => (
    <Card sx={{ ...darkCardStyles, borderRadius: 3, overflow: 'visible', position: 'relative' }}>
      <Box sx={{ position: 'absolute', top: 16, right: 16, zIndex: 2 }}>
        <Chip
          icon={isUnverified ? <WarningIcon /> : <VerifiedIcon />}
          label={isUnverified ? "Unverified" : "Verified"}
          color={isUnverified ? "warning" : "success"}
          size="small"
          variant="filled"
        />
      </Box>

      <CardHeader
        avatar={
          <Avatar
            sx={{
              width: 60,
              height: 60,
              border: '3px solid',
              borderColor: isUnverified ? 'warning.main' : 'primary.main',
              bgcolor: isUnverified ? 'warning.dark' : 'primary.dark'
            }}
          >
            <AdminIcon />
          </Avatar>
        }
        title={
          <Typography variant="h6" fontWeight={600} sx={{ color: 'grey.100' }} noWrap>
            {user.firstName} {user.lastName}
          </Typography>
        }
        subheader={
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
              <EmailIcon sx={{ fontSize: 16, mr: 1, color: 'grey.400' }} />
              <Typography variant="body2" sx={{ color: 'grey.400' }} noWrap>
                {user.email}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <CalendarIcon sx={{ fontSize: 14, mr: 1, color: 'grey.500' }} />
              <Typography variant="caption" sx={{ color: 'grey.500' }}>
                Registered: {new Date(user.createdAt).toLocaleDateString()}
              </Typography>
            </Box>
          </Box>
        }
        sx={{ pb: 1 }}
      />

      <CardContent>
        <Stack spacing={2}>
          <Box>
            <Button
              variant="outlined"
              fullWidth
              startIcon={<ManageIcon />}
              sx={{
                borderColor: 'primary.main',
                color: 'primary.main',
                mb: 1,
                '&:hover': {
                  backgroundColor: 'primary.dark',
                  borderColor: 'primary.light'
                }
              }}
              onClick={() => {
                setEditAdmin({
                  _id: user._id,
                  firstName: user.firstName || "",
                  lastName: user.lastName || "",
                  email: user.email || "",
                  password: user.password || "",
                  phone: user.phone || "",
                  note: user.note || "",
                  address: user.address || "",
                  city: user.city || "",
                  country: user.country || "",
                  postalCode: user.postalCode || "",
                  currency: user.currency || "USD",
                  AiTradingPercentage: typeof user.AiTradingPercentage === 'number' ? user.AiTradingPercentage : 1.25
                });
                setManageOpen(true);
              }}
            >
              Manage Admin
            </Button>

            {isUnverified && (
              <Button
                disabled={isUsers}
                onClick={() => bypassSingleUser(user)}
                variant="contained"
                fullWidth
                startIcon={<CheckIcon />}
                sx={{
                  backgroundColor: 'warning.dark',
                  mb: 1,
                  '&:hover': {
                    backgroundColor: 'warning.main'
                  }
                }}
              >
                {isUsers ? 'Verifying...' : 'Verify Email'}
              </Button>
            )}

            {/* Delete Button for Superadmin */}
            {(authUser().user.role === "superadmin") && (
              <Button
                onClick={() => onOpenModal(user)}
                variant="outlined"
                fullWidth
                startIcon={<DeleteIcon />}
                sx={{
                  borderColor: 'error.dark',
                  color: 'error.main',
                  '&:hover': {
                    backgroundColor: 'error.dark',
                    borderColor: 'error.light'
                  }
                }}
              >
                Delete Admin
              </Button>
            )}
          </Box>

          <Divider sx={{ borderColor: 'rgba(255, 255, 255, 0.1)', my: 2 }} />

          {/* CRM Permissions */}
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <SecurityIcon sx={{ color: 'primary.main', mr: 1, fontSize: 20 }} />
              <Typography variant="subtitle2" fontWeight={600} sx={{ color: 'grey.100' }}>
                CRM Permissions
              </Typography>
            </Box>

            {permissionCategories.map((category, index) => (
              <Accordion
                key={index}
                expanded={expandedAccordions[`${user._id}-${index}`] || false}
                onChange={handleAccordionChange(user._id, index)}
                sx={{
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '8px !important',
                  mb: 1,
                  '&:before': { display: 'none' },
                  boxShadow: 'none'
                }}
              >
                <AccordionSummary
                  expandIcon={<ExpandMoreIcon sx={{ color: 'grey.400' }} />}
                  sx={{
                    minHeight: '48px',
                    '& .MuiAccordionSummary-content': {
                      my: 1,
                      alignItems: 'center'
                    }
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                    <Box sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 32,
                      height: 32,
                      borderRadius: '50%',
                      bgcolor: `${category.color}20`,
                      color: category.color,
                      mr: 1.5
                    }}>
                      {category.icon}
                    </Box>
                    <Typography variant="body2" fontWeight={600} sx={{ color: 'grey.200' }}>
                      {category.name}
                    </Typography>
                  </Box>
                </AccordionSummary>
                <AccordionDetails sx={{ pt: 0 }}>
                  <Stack spacing={1.5}>
                    {category.permissions.map((permission) => (
                      <Box
                        key={permission.key}
                        sx={{
                          p: 1.5,
                          borderRadius: 1,
                          bgcolor: 'rgba(255, 255, 255, 0.02)',
                          border: '1px solid rgba(255, 255, 255, 0.05)'
                        }}
                      >
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                          <Typography variant="body2" fontWeight={500} sx={{ color: 'grey.100' }}>
                            {permission.label}
                          </Typography>
                          {permLoad?.userId === user._id && permLoad?.key === permission.key ? (
                            <CircularProgress size={20} />
                          ) : (
                            <Switch
                              size="small"
                              checked={user.adminPermissions?.[permission.key] || false}
                              onChange={(e) => handlePermissionChange(user._id, permission.key, e.target.checked)}
                              sx={{
                                '& .MuiSwitch-switchBase.Mui-checked': {
                                  color: category.color
                                },
                                '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                                  backgroundColor: category.color
                                }
                              }}
                            />
                          )}
                        </Box>
                        <Typography variant="caption" sx={{ color: 'grey.500', display: 'block' }}>
                          {permission.desc}
                        </Typography>
                      </Box>
                    ))}
                  </Stack>
                </AccordionDetails>
              </Accordion>
            ))}
          </Box>

          <Divider sx={{ borderColor: 'rgba(255, 255, 255, 0.1)', my: 2 }} />

          {/* Vapi AI Configuration */}
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <SettingsIcon sx={{ color: 'primary.main', mr: 1, fontSize: 20 }} />
                <Typography variant="subtitle2" fontWeight={600} sx={{ color: 'text.secondary' }}>
                  Vapi AI Configuration
                </Typography>
              </Box>
              <Button
                size="small"
                variant="outlined"
                startIcon={<SettingsIcon />}
                onClick={() => openVapiConfigDialog(user)}
                sx={{ textTransform: 'none' }}
              >
                {user.vapiConfig?.enabled ? 'Edit Config' : 'Configure'}
              </Button>
            </Box>
            
            {user.vapiConfig?.enabled ? (
              <Box sx={{ 
                p: 2, 
                borderRadius: 1, 
                bgcolor: 'background.default', 
                
                border: '1px solid',
                borderColor: 'divider'
              }}>
                <Typography variant="body2" sx={{ color: 'text.primary', mb: 1 }}>
                  <strong>Status:</strong> Custom Vapi config enabled
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                  This admin uses their own Vapi assistant and phone number
                </Typography>
                {user.vapiConfig?.assistantId && (
                  <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.5 }}>
                    Assistant ID: {user.vapiConfig.assistantId.substring(0, 20)}...
                  </Typography>
                )}
              </Box>
            ) : (
              <Box sx={{ 
                p: 2, 
                borderRadius: 1, 
                bgcolor: 'background.default',
                border: '1px solid',
                borderColor: 'divider'
              }}>
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                  Vapi configuration not enabled
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.5 }}>
                  Click "Configure" to set up Vapi API key, assistant ID, and phone number from profile
                </Typography>
              </Box>
            )}
          </Box>

          <Divider sx={{ borderColor: 'rgba(255, 255, 255, 0.1)', my: 2 }} />

          {/* SIP Configuration */}
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <SettingsIcon sx={{ color: 'primary.main', mr: 1, fontSize: 20 }} />
                <Typography variant="subtitle2" fontWeight={600} sx={{ color: 'text.secondary' }}>
                  SIP Configuration
                </Typography>
              </Box>
              <Button
                size="small"
                variant="outlined"
                startIcon={<SettingsIcon />}
                onClick={() => openSipConfigDialog(user)}
                sx={{ textTransform: 'none' }}
              >
                {user.sipConfig?.enabled ? 'Edit Config' : 'Configure'}
              </Button>
            </Box>
            
            {user.sipConfig?.enabled ? (
              <Box sx={{ 
                p: 2, 
                borderRadius: 1, 
                bgcolor: 'background.default', 
                
                border: '1px solid',
                borderColor: 'divider'
              }}>
                <Typography variant="body2" sx={{ color: 'text.primary', mb: 1 }}>
                  <strong>Status:</strong> Custom SIP config enabled
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                  This admin uses their own SIP credentials for calls
                </Typography>
                {user.sipConfig?.server && (
                  <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.5 }}>
                    Server: {user.sipConfig.server}
                  </Typography>
                )}
              </Box>
            ) : (
              <Box sx={{ 
                p: 2, 
                borderRadius: 1, 
                bgcolor: 'background.default',
                border: '1px solid',
                borderColor: 'divider'
              }}>
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                  SIP configuration not enabled
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.5 }}>
                  Click "Configure" to set up custom SIP credentials. If disabled, default environment SIP credentials will be used.
                </Typography>
              </Box>
            )}
          </Box>

          <AdminSmtpConfigCardSection user={user} onUpdated={handleSmtpUpdated} />
        </Stack>
      </CardContent>
    </Card>
  );

  // SubAdminCard component - similar to AdminCard but uses permissions instead of adminPermissions
  const SubAdminCard = ({ user, isUnverified = false }) => (
    <Card sx={{ ...darkCardStyles, borderRadius: 3, overflow: 'visible', position: 'relative' }}>
      <Box sx={{ position: 'absolute', top: 16, right: 16, zIndex: 2 }}>
        <Chip
          icon={isUnverified ? <WarningIcon /> : <VerifiedIcon />}
          label={isUnverified ? "Unverified" : "Verified"}
          color={isUnverified ? "warning" : "success"}
          size="small"
          variant="filled"
        />
      </Box>

      <CardHeader
        avatar={
          <Avatar
            sx={{
              width: 60,
              height: 60,
              border: '3px solid',
              borderColor: isUnverified ? 'warning.main' : 'secondary.main',
              bgcolor: isUnverified ? 'warning.dark' : 'secondary.dark'
            }}
          >
            <PeopleIcon />
          </Avatar>
        }
        title={
          <Typography variant="h6" fontWeight={600} sx={{ color: 'grey.100' }} noWrap>
            {user.firstName} {user.lastName}
          </Typography>
        }
        subheader={
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
              <EmailIcon sx={{ fontSize: 16, mr: 1, color: 'grey.400' }} />
              <Typography variant="body2" sx={{ color: 'grey.400' }} noWrap>
                {user.email}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <CalendarIcon sx={{ fontSize: 14, mr: 1, color: 'grey.500' }} />
              <Typography variant="caption" sx={{ color: 'grey.500' }}>
                Registered: {new Date(user.createdAt).toLocaleDateString()}
              </Typography>
            </Box>
          </Box>
        }
        sx={{ pb: 1 }}
      />

      <CardContent>
        <Stack spacing={2}>
          <Box>
            <Button
              variant="outlined"
              fullWidth
              startIcon={<ManageIcon />}
              sx={{
                borderColor: 'secondary.main',
                color: 'secondary.main',
                mb: 1,
                '&:hover': {
                  backgroundColor: 'secondary.dark',
                  borderColor: 'secondary.light'
                }
              }}
              onClick={() => {
                setEditAdmin({
                  _id: user._id,
                  firstName: user.firstName || "",
                  lastName: user.lastName || "",
                  email: user.email || "",
                  password: user.password || "",
                  phone: user.phone || "",
                  note: user.note || "",
                  address: user.address || "",
                  city: user.city || "",
                  country: user.country || "",
                  postalCode: user.postalCode || "",
                  currency: user.currency || "USD",
                  AiTradingPercentage: typeof user.AiTradingPercentage === 'number' ? user.AiTradingPercentage : 1.25
                });
                setManageOpen(true);
              }}
            >
              Manage Sub Admin
            </Button>

            {isUnverified && (
              <Button
                disabled={isUsers}
                onClick={() => bypassSingleUser(user)}
                variant="contained"
                fullWidth
                startIcon={<CheckIcon />}
                sx={{
                  backgroundColor: 'warning.dark',
                  mb: 1,
                  '&:hover': {
                    backgroundColor: 'warning.main'
                  }
                }}
              >
                {isUsers ? 'Verifying...' : 'Verify Email'}
              </Button>
            )}

            {/* Delete Button for Superadmin */}
            {(authUser().user.role === "superadmin") && (
              <Button
                onClick={() => onOpenModal(user)}
                variant="outlined"
                fullWidth
                startIcon={<DeleteIcon />}
                sx={{
                  borderColor: 'error.dark',
                  color: 'error.main',
                  '&:hover': {
                    backgroundColor: 'error.dark',
                    borderColor: 'error.light'
                  }
                }}
              >
                Delete Sub Admin
              </Button>
            )}
          </Box>

          <Divider sx={{ borderColor: 'rgba(255, 255, 255, 0.1)', my: 2 }} />

          {/* CRM Permissions for Sub Admin */}
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <SecurityIcon sx={{ color: 'secondary.main', mr: 1, fontSize: 20 }} />
              <Typography variant="subtitle2" fontWeight={600} sx={{ color: 'grey.100' }}>
                Permissions
              </Typography>
            </Box>

            {subadminPermissionCategories.map((category, index) => (
              <Accordion
                key={index}
                expanded={expandedAccordions[`${user._id}-${index}`] || false}
                onChange={handleAccordionChange(user._id, index)}
                sx={{
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '8px !important',
                  mb: 1,
                  '&:before': { display: 'none' },
                  boxShadow: 'none'
                }}
              >
                <AccordionSummary
                  expandIcon={<ExpandMoreIcon sx={{ color: 'grey.400' }} />}
                  sx={{
                    minHeight: '48px',
                    '& .MuiAccordionSummary-content': {
                      my: 1,
                      alignItems: 'center'
                    }
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                    <Box sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 32,
                      height: 32,
                      borderRadius: '50%',
                      bgcolor: `${category.color}20`,
                      color: category.color,
                      mr: 1.5
                    }}>
                      {category.icon}
                    </Box>
                    <Typography variant="body2" fontWeight={600} sx={{ color: 'grey.200' }}>
                      {category.name}
                    </Typography>
                  </Box>
                </AccordionSummary>
                <AccordionDetails sx={{ pt: 0 }}>
                  <Stack spacing={1.5}>
                    {category.permissions.map((permission) => (
                      <Box
                        key={permission.key}
                        sx={{
                          p: 1.5,
                          borderRadius: 1,
                          bgcolor: 'rgba(255, 255, 255, 0.02)',
                          border: '1px solid rgba(255, 255, 255, 0.05)'
                        }}
                      >
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                          <Typography variant="body2" fontWeight={500} sx={{ color: 'grey.100' }}>
                            {permission.label}
                          </Typography>
                          {permLoad?.userId === user._id && permLoad?.key === permission.key ? (
                            <CircularProgress size={20} />
                          ) : (
                            <Switch
                              size="small"
                              checked={user.permissions?.[permission.key] || false}
                              onChange={(e) => handleSubAdminPermissionChange(user._id, permission.key, e.target.checked)}
                              sx={{
                                '& .MuiSwitch-switchBase.Mui-checked': {
                                  color: category.color
                                },
                                '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                                  backgroundColor: category.color
                                }
                              }}
                            />
                          )}
                        </Box>
                        <Typography variant="caption" sx={{ color: 'grey.500', display: 'block' }}>
                          {permission.desc}
                        </Typography>
                      </Box>
                    ))}
                  </Stack>
                </AccordionDetails>
              </Accordion>
            ))}
          </Box>

          <AdminSmtpConfigCardSection
            user={user}
            onUpdated={handleSmtpUpdated}
            accentColor="secondary.main"
          />
        </Stack>
      </CardContent>
    </Card>
  );

  return (
    <Box sx={{ display: "block", height: "100vh", bgcolor: "background.default", position: "relative" }}>
      {/* Sidebar */}
      <Box>
        <Sidebar
          setisMobileMenu={setIsMobileMenu}
          isMobileMenu={isMobileMenu}
          isCollapsed={isSidebarCollapsed}
          setIsSidebarCollapsed={setIsSidebarCollapsed}
        />
      </Box>

      {/* Overlay for mobile - closes sidebar when clicked */}
      {isMobileMenu && (
        <Box
          onClick={() => setIsMobileMenu(false)}
          sx={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            zIndex: 1199,
            display: { xs: 'block', md: 'none' },
            cursor: 'pointer'
          }}
        />
      )}

      {/* Main Content */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          display: "flex",
          flexDirection: "column",
          ml: {
            xs: 0,
            md: isSidebarCollapsed ? "80px" : "280px",
          },
          transition: "margin-left 0.3s ease",
        }}
      >
        {/* Content */}
        {isLoading ? (
          <Box sx={{ width: '100%', p: 4, textAlign: 'center' }}>
            <LinearProgress sx={{ height: 8, borderRadius: 4 }} />
            <Typography variant="h6" sx={{ mt: 2, color: 'grey.700' }}>
              Loading Admins...
            </Typography>
          </Box>
        ) : (
          <Box sx={{ p: 3 }}>
            {/* Page Header */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
              <Box>
                <Typography variant="h4" fontWeight="700">
                  Admin Management (CRM)
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Superadmin can add/remove admins and manage CRM permissions
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <CrmAppBarActions />
                {(authUser().user.role === "superadmin") && (
                  <Button
                    variant="outlined"
                    color="warning"
                    startIcon={<RestartIcon />}
                    onClick={handleRestartServer}
                    disabled={isRestarting}
                    sx={{ textTransform: 'none' }}
                  >
                    {isRestarting ? 'Restarting...' : 'Restart Server'}
                  </Button>
                )}
                <Button
                  variant="contained"
                  color="primary"
                  startIcon={<AdminIcon />}
                  onClick={() => setAddOpen(true)}
                >
                  Add Admin
                </Button>
              </Box>
            </Box>

            {/* Global Wallet Settings */}
            {(authUser().user.role === "superadmin") && (
              <Box sx={{ mb: 4, p: 3, borderRadius: 2, bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                  <Box>
                    <Typography variant="h6" fontWeight="600" gutterBottom>
                      Global Wallet Settings
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Control wallet platform access for all users globally
                    </Typography>
                  </Box>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 2, borderRadius: 1, bgcolor: 'background.default' }}>
                  <Box>
                    <Typography variant="body1" fontWeight="500">
                      Enable Wallet Platform
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {globalSettings.walletEnabled 
                        ? 'Wallet platform is enabled for all users with permissions' 
                        : 'Wallet platform is disabled. Only Super Admin can access wallet features.'}
                    </Typography>
                  </Box>
                  {updatingGlobalSettings ? (
                    <CircularProgress size={24} />
                  ) : (
                    <Switch
                      checked={globalSettings.walletEnabled}
                      onChange={(e) => handleGlobalWalletToggle(e.target.checked)}
                      color="primary"
                    />
                  )}
                </Box>
              </Box>
            )}

            {/* Verified Admins */}
            <Box sx={{ mb: 6 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
                <VerifiedIcon sx={{ mr: 2, fontSize: 32, color: 'success.main' }} />
                <Box>
                  <Typography variant="h4" fontWeight="700" gutterBottom sx={{ color: 'text.primary' }}>
                    Verified Admins
                  </Typography>
                  <Typography variant="subtitle1" sx={{ color: 'text.secondary' }}>
                    {users.length} admins with verified email addresses
                  </Typography>
                </Box>
              </Box>

              <Grid container spacing={3}>
                {users.map((user, index) => (
                  <Grid item xs={12} sm={6} md={4} key={index}>
                    <AdminCard user={user} />
                  </Grid>
                ))}
              </Grid>
            </Box>

            {/* Unverified Admins */}
            {unVerified.length > 0 && (
              <Box sx={{ mb: 6 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
                  <WarningIcon sx={{ mr: 2, fontSize: 32, color: 'warning.main' }} />
                  <Box>
                    <Typography variant="h4" fontWeight="700" gutterBottom sx={{ color: 'text.primary' }}>
                      Unverified Admins
                    </Typography>
                    <Typography variant="subtitle1" sx={{ color: 'text.secondary' }}>
                      {unVerified.length} admins pending email verification
                    </Typography>
                  </Box>
                </Box>

                <Grid container spacing={3}>
                  {unVerified.map((user, index) => (
                    <Grid item xs={12} sm={6} md={4} key={index}>
                      <AdminCard user={user} isUnverified />
                    </Grid>
                  ))}
                </Grid>
              </Box>
            )}

            {/* Verified Sub Admins */}
            <Box sx={{ mb: 6 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
                <PeopleIcon sx={{ mr: 2, fontSize: 32, color: 'secondary.main' }} />
                <Box>
                  <Typography variant="h4" fontWeight="700" gutterBottom sx={{ color: 'text.primary' }}>
                    Verified Sub Admins
                  </Typography>
                  <Typography variant="subtitle1" sx={{ color: 'text.secondary' }}>
                    {subAdmins.length} sub admins with verified email addresses
                  </Typography>
                </Box>
              </Box>

              {subAdmins.length > 0 ? (
                <Grid container spacing={3}>
                  {subAdmins.map((user, index) => (
                    <Grid item xs={12} sm={6} md={4} key={index}>
                      <SubAdminCard user={user} />
                    </Grid>
                  ))}
                </Grid>
              ) : (
                <Typography variant="body2" sx={{ color: 'text.secondary', p: 2 }}>
                  No verified sub admins found.
                </Typography>
              )}
            </Box>

            {/* Unverified Sub Admins */}
            <Box sx={{ mb: 6 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
                <WarningIcon sx={{ mr: 2, fontSize: 32, color: 'warning.main' }} />
                <Box>
                  <Typography variant="h4" fontWeight="700" gutterBottom sx={{ color: 'text.primary' }}>
                    Unverified Sub Admins
                  </Typography>
                  <Typography variant="subtitle1" sx={{ color: 'text.secondary' }}>
                    {unVerifiedSubAdmins.length} sub admins pending email verification
                  </Typography>
                </Box>
              </Box>

              {unVerifiedSubAdmins.length > 0 ? (
                <Grid container spacing={3}>
                  {unVerifiedSubAdmins.map((user, index) => (
                    <Grid item xs={12} sm={6} md={4} key={index}>
                      <SubAdminCard user={user} isUnverified />
                    </Grid>
                  ))}
                </Grid>
              ) : (
                <Typography variant="body2" sx={{ color: 'text.secondary', p: 2 }}>
                  No unverified sub admins found.
                </Typography>
              )}
            </Box>

            {/* Delete Confirmation Dialog */}
            <Dialog
              open={open}
              onClose={() => !isDisable && onCloseModal()}
              fullWidth
              maxWidth="xs"
            >
              <DialogTitle>Delete Admin</DialogTitle>
              <DialogContent>
                <Typography variant="body2">
                  Are you sure you want to delete <strong>{modalData?.firstName} {modalData?.lastName}</strong>? This action cannot be undone.
                </Typography>
              </DialogContent>
              <DialogActions>
                <Button onClick={() => onCloseModal()} disabled={isDisable}>
                  Cancel
                </Button>
                <Button
                  variant="contained"
                  color="error"
                  onClick={() => deleteEachUser(modalData)}
                  disabled={isDisable}
                  startIcon={isDisable ? <CircularProgress size={18} /> : <DeleteIcon />}
                >
                  {isDisable ? 'Deleting...' : 'Delete'}
                </Button>
              </DialogActions>
            </Dialog>

            {/* Add Admin Dialog */}
            <Dialog
              open={addOpen}
              onClose={() => !adding && setAddOpen(false)}
              fullWidth
              maxWidth="sm"
            >
              <DialogTitle>Add New Admin</DialogTitle>
              <DialogContent dividers>
                <Grid container spacing={2}>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      size="small"
                      fullWidth
                      label="First Name"
                      value={newAdmin.firstName}
                      onChange={(e) => setNewAdmin({ ...newAdmin, firstName: e.target.value })}
                      required
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      size="small"
                      fullWidth
                      label="Last Name"
                      value={newAdmin.lastName}
                      onChange={(e) => setNewAdmin({ ...newAdmin, lastName: e.target.value })}
                      required
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      size="small"
                      fullWidth
                      label="Email"
                      type="email"
                      value={newAdmin.email}
                      onChange={(e) => setNewAdmin({ ...newAdmin, email: e.target.value })}
                      required
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      size="small"
                      fullWidth
                      label="Password"
                      type="text"
                      value={newAdmin.password}
                      onChange={(e) => setNewAdmin({ ...newAdmin, password: e.target.value })}
                      required
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      size="small"
                      fullWidth
                      label="Phone"
                      value={newAdmin.phone}
                      onChange={(e) => setNewAdmin({ ...newAdmin, phone: e.target.value })}
                      required
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <TextField
                      size="small"
                      fullWidth
                      label="Address"
                      value={newAdmin.address}
                      onChange={(e) => setNewAdmin({ ...newAdmin, address: e.target.value })}
                      required
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      size="small"
                      fullWidth
                      label="City"
                      value={newAdmin.city}
                      onChange={(e) => setNewAdmin({ ...newAdmin, city: e.target.value })}
                      required
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      size="small"
                      fullWidth
                      label="Country"
                      value={newAdmin.country}
                      onChange={(e) => setNewAdmin({ ...newAdmin, country: e.target.value })}
                      required
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      size="small"
                      fullWidth
                      label="Postal Code"
                      value={newAdmin.postalCode}
                      onChange={(e) => setNewAdmin({ ...newAdmin, postalCode: e.target.value })}
                      required
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <TextField
                      size="small"
                      fullWidth
                      multiline
                      minRows={2}
                      label="Note (optional)"
                      value={newAdmin.note}
                      onChange={(e) => setNewAdmin({ ...newAdmin, note: e.target.value })}
                    />
                  </Grid>
                </Grid>
              </DialogContent>
              <DialogActions>
                <Button onClick={() => setAddOpen(false)} disabled={adding}>
                  Cancel
                </Button>
                <Button
                  variant="contained"
                  onClick={async () => {
                    try {
                      // Validate required fields similar to AddAdmin.js
                      const required = ['firstName','lastName','email','password','phone','address','city','country','postalCode'];
                      const missing = required.filter(k => !String(newAdmin[k] || '').trim());
                      if (missing.length) {
                        toast.error('Please fill all required fields');
                        return;
                      }
                      setAdding(true);
                      const body = { ...newAdmin, role: 'admin' };
                      const res = await registerSubAdminApi(body);
                      if (res.success) {
                        toast.info(res.msg || 'Admin created');
                        setAddOpen(false);
                        setNewAdmin({
                          firstName: "", lastName: "", email: "", password: "",
                          phone: "", note: "", address: "", city: "", country: "", postalCode: ""
                        });
                        getAllUsers();
                      } else {
                        toast.error(res.msg || 'Failed to create admin');
                      }
                    } catch (err) {
                      toast.error(err?.message || 'Error creating admin');
                    } finally {
                      setAdding(false);
                    }
                  }}
                  disabled={adding}
                  startIcon={adding ? <CircularProgress size={18} /> : <CheckIcon />}
                >
                  {adding ? 'Creating...' : 'Create Admin'}
                </Button>
              </DialogActions>
            </Dialog>

            {/* Vapi Config Dialog */}
            <Dialog
              open={vapiConfigOpen}
              onClose={() => !vapiConfigLoading && setVapiConfigOpen(false)}
              fullWidth
              maxWidth="md"
            >
              <DialogTitle>Configure Vapi AI for Admin</DialogTitle>
              <DialogContent dividers>
                <Stack spacing={3} sx={{ mt: 1 }}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={vapiConfig.enabled}
                        onChange={(e) => setVapiConfig(prev => ({ ...prev, enabled: e.target.checked }))}
                      />
                    }
                    label="Enable Custom Vapi Configuration"
                  />
                  <Typography variant="caption" color="text.secondary">
                    When enabled, this admin will use their own Vapi API key, assistant ID, and phone number from their profile configuration.
                  </Typography>
                  
                  {vapiConfig.enabled && (
                    <>
                      <TextField
                        fullWidth
                        label="Vapi API Key"
                        value={vapiConfig.apiKey}
                        onChange={(e) => setVapiConfig(prev => ({ ...prev, apiKey: e.target.value }))}
                        required
                        helperText="Required: Vapi API key for this admin"
                        type="password"
                      />
                      
                      <TextField
                        fullWidth
                        label="Assistant ID"
                        value={vapiConfig.assistantId}
                        onChange={(e) => setVapiConfig(prev => ({ ...prev, assistantId: e.target.value }))}
                        helperText="Optional: Custom assistant ID. If not provided, a new assistant will be created."
                      />
                      
                      <TextField
                        fullWidth
                        label="Phone Number ID"
                        value={vapiConfig.phoneNumberId}
                        onChange={(e) => setVapiConfig(prev => ({ ...prev, phoneNumberId: e.target.value }))}
                        helperText="Phone number ID from your Vapi account"
                      />
                      
                      <Box sx={{ 
                        p: 2, 
                        bgcolor: 'background.default', 
                        
                        borderRadius: 1,
                        border: '1px solid',
                        borderColor: 'divider'
                      }}>
                        <Typography variant="caption" sx={{ color: 'text.primary', display: 'block', fontWeight: 'bold', mb: 0.5 }}>
                          ℹ️ Important Notes:
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                          • All users (including superadmin) must configure their own Vapi settings from profile
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                          • Each admin can have their own Vapi assistant and phone number
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                          • When making calls, the system will use the admin's custom config if enabled
                        </Typography>
                      </Box>
                    </>
                  )}
                </Stack>
              </DialogContent>
              <DialogActions>
                <Button 
                  onClick={() => setVapiConfigOpen(false)} 
                  disabled={vapiConfigLoading}
                >
                  Cancel
                </Button>
                <Button
                  variant="contained"
                  onClick={handleVapiConfigChange}
                  disabled={vapiConfigLoading || (vapiConfig.enabled && !vapiConfig.apiKey)}
                >
                  {vapiConfigLoading ? <CircularProgress size={20} /> : 'Save Configuration'}
                </Button>
              </DialogActions>
            </Dialog>

            {/* SIP Config Dialog */}
            <Dialog
              open={sipConfigOpen}
              onClose={() => !sipConfigLoading && setSipConfigOpen(false)}
              fullWidth
              maxWidth="md"
            >
              <DialogTitle>Configure SIP for Admin</DialogTitle>
              <DialogContent dividers>
                <Stack spacing={3} sx={{ mt: 1 }}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={sipConfig.enabled}
                        onChange={(e) => setSipConfig(prev => ({ ...prev, enabled: e.target.checked }))}
                      />
                    }
                    label="Enable Custom SIP Configuration"
                  />
                  <Typography variant="caption" color="text.secondary">
                    When enabled, this admin will use their own SIP credentials for calls. If disabled, default environment SIP credentials will be used.
                  </Typography>
                  
                  {sipConfig.enabled && (
                    <>
                      <TextField
                        fullWidth
                        label="SIP Server"
                        value={sipConfig.server}
                        onChange={(e) => setSipConfig(prev => ({ ...prev, server: e.target.value }))}
                        required
                        helperText="Required: SIP server address (e.g., sip.example.com)"
                      />
                      
                      <TextField
                        fullWidth
                        label="SIP Username"
                        value={sipConfig.username}
                        onChange={(e) => setSipConfig(prev => ({ ...prev, username: e.target.value }))}
                        required
                        helperText="Required: SIP username for authentication"
                      />
                      
                      <TextField
                        fullWidth
                        label="SIP Password"
                        value={sipConfig.password}
                        onChange={(e) => setSipConfig(prev => ({ ...prev, password: e.target.value }))}
                        required
                        helperText="Required: SIP password for authentication"
                        type="password"
                      />
                      
                      <TextField
                        fullWidth
                        label="SIP Port"
                        type="number"
                        value={sipConfig.port}
                        onChange={(e) => setSipConfig(prev => ({ ...prev, port: parseInt(e.target.value) || 5060 }))}
                        helperText="SIP port (default: 5060)"
                      />
                      
                      <Box sx={{ 
                        p: 2, 
                        bgcolor: 'background.default', 
                         
                        borderRadius: 1,
                        border: '1px solid',
                        borderColor: 'divider'
                      }}>
                        <Typography variant="caption" sx={{ color: 'text.primary', display: 'block', fontWeight: 'bold', mb: 0.5 }}>
                          ℹ️ Important Notes:
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                          • Server, username, and password are required when enabling custom SIP config
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                          • Each admin can have their own SIP credentials
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                          • When making calls, the system will use the admin's custom SIP config if enabled
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                          • If disabled, default environment SIP credentials will be used for all calls
                        </Typography>
                      </Box>
                    </>
                  )}
                </Stack>
              </DialogContent>
              <DialogActions>
                <Button 
                  onClick={() => setSipConfigOpen(false)} 
                  disabled={sipConfigLoading}
                >
                  Cancel
                </Button>
                <Button
                  variant="contained"
                  onClick={handleSipConfigChange}
                  disabled={sipConfigLoading || (sipConfig.enabled && (!sipConfig.server || !sipConfig.username || !sipConfig.password))}
                >
                  {sipConfigLoading ? <CircularProgress size={20} /> : 'Save Configuration'}
                </Button>
              </DialogActions>
            </Dialog>

            {/* Manage Admin Dialog */}
            <Dialog
              open={manageOpen}
              onClose={() => !managing && setManageOpen(false)}
              fullWidth
              maxWidth="sm"
            >
              <DialogTitle>Edit Admin</DialogTitle>
              <DialogContent dividers>
                <Grid container spacing={2}>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      size="small"
                      fullWidth
                      label="First Name"
                      value={editAdmin.firstName}
                      onChange={(e) => setEditAdmin({ ...editAdmin, firstName: e.target.value })}
                      required
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      size="small"
                      fullWidth
                      label="Last Name"
                      value={editAdmin.lastName}
                      onChange={(e) => setEditAdmin({ ...editAdmin, lastName: e.target.value })}
                      required
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      size="small"
                      fullWidth
                      label="Email"
                      type="email"
                      value={editAdmin.email}
                      onChange={(e) => setEditAdmin({ ...editAdmin, email: e.target.value })}
                      required
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      size="small"
                      fullWidth
                      label="Password (optional)"
                      type="text"
                      value={editAdmin.password}
                      onChange={(e) => setEditAdmin({ ...editAdmin, password: e.target.value })}
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      size="small"
                      fullWidth
                      label="Phone"
                      value={editAdmin.phone}
                      onChange={(e) => setEditAdmin({ ...editAdmin, phone: e.target.value })}
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <TextField
                      size="small"
                      fullWidth
                      label="Address"
                      value={editAdmin.address}
                      onChange={(e) => setEditAdmin({ ...editAdmin, address: e.target.value })}
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      size="small"
                      fullWidth
                      label="City"
                      value={editAdmin.city}
                      onChange={(e) => setEditAdmin({ ...editAdmin, city: e.target.value })}
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      size="small"
                      fullWidth
                      label="Country"
                      value={editAdmin.country}
                      onChange={(e) => setEditAdmin({ ...editAdmin, country: e.target.value })}
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      size="small"
                      fullWidth
                      label="Postal Code"
                      value={editAdmin.postalCode}
                      onChange={(e) => setEditAdmin({ ...editAdmin, postalCode: e.target.value })}
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <TextField
                      size="small"
                      fullWidth
                      multiline
                      minRows={2}
                      label="Note"
                      value={editAdmin.note}
                      onChange={(e) => setEditAdmin({ ...editAdmin, note: e.target.value })}
                    />
                  </Grid>
                </Grid>
              </DialogContent>
              <DialogActions>
                <Button onClick={() => setManageOpen(false)} disabled={managing}>
                  Cancel
                </Button>
                <Button
                  variant="contained"
                  onClick={async () => {
                    try {
                      const required = ['firstName','lastName','email'];
                      const missing = required.filter(k => !String(editAdmin[k] || '').trim());
                      if (missing.length) {
                        toast.error('Please fill required fields (first, last, email)');
                        return;
                      }
                      setManaging(true);
                      const body = {
                        firstName: editAdmin.firstName,
                        lastName: editAdmin.lastName,
                        email: editAdmin.email,
                        phone: editAdmin.phone,
                        note: editAdmin.note,
                        address: editAdmin.address,
                        city: editAdmin.city,
                        country: editAdmin.country,
                        postalCode: editAdmin.postalCode,
                        currency: editAdmin.currency,
                        AiTradingPercentage: editAdmin.AiTradingPercentage
                      };
                      if (String(editAdmin.password || '').trim()) {
                        body.password = editAdmin.password;
                      }
                      const res = await updateSignleUsersApi(editAdmin._id, body);
                      if (res.success) {
                        toast.success(res.msg || 'Admin updated');
                        setManageOpen(false);
                        getAllUsers();
                      } else {
                        toast.error(res.msg || 'Failed to update admin');
                      }
                    } catch (err) {
                      toast.error(err?.message || 'Error updating admin');
                    } finally {
                      setManaging(false);
                    }
                  }}
                  disabled={managing}
                  startIcon={managing ? <CircularProgress size={18} /> : <CheckIcon />}
                >
                  {managing ? 'Saving...' : 'Save Changes'}
                </Button>
              </DialogActions>
            </Dialog>

          </Box>
        )}
      </Box>
    </Box>
  );
};

export default AdminManagementCRM;

// Add Admin Dialog State and Handlers (placed after export to keep component clean)
// Using module-level vars would be bad; integrate into component instead:


import React, { useState, useEffect } from 'react';
import {
    Box,
    Card,
    CardContent,
    Typography,
    Button,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Paper,
    Chip,
    IconButton,
    Checkbox,
    Alert,
    CircularProgress,
    Pagination,
    Stack,
    Badge,
    Grid,
    Tabs,
    Tab,
    AppBar,
    Toolbar,
    TextField,
    MenuItem,
    Select,
    FormControl,
    InputLabel,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
} from '@mui/material';
import {
    Email as EmailIcon,
    Refresh as RefreshIcon,
    Delete as DeleteIcon,
    SelectAll,
    Send as SendIcon,
    HourglassEmpty,
    CheckCircle,
    Error as ErrorIcon,
    Menu as MenuIcon,
    Visibility,
} from '@mui/icons-material';
import { htmlToPlainText } from '../../../utils/emailTemplateUtils';
import { 
    getEmailQueueStatusApi, 
    getFailedEmailsApi, 
    resendFailedEmailsApi, 
    deleteFailedEmailsApi,
    processEmailQueueApi,
    clearEmailQueueApi,
    getLeadEmailHistoryApi,
    deleteLeadEmailHistoryApi,
} from '../../../Api/Service';
import { toast } from 'react-toastify';
import Sidebar from './Sidebar';
import CrmAppBarActions from './components/CrmAppBarActions';
import { useNavigate } from 'react-router-dom';
import { useAuthUser } from 'react-auth-kit';
import io from 'socket.io-client';
import { getBackendUrl } from '../../../config/appConfig';

const EmailQueue = () => {
    const [pendingEmails, setPendingEmails] = useState([]);
    const [failedEmails, setFailedEmails] = useState([]);
    const [loading, setLoading] = useState(false);
    const [selectedEmails, setSelectedEmails] = useState(new Set());
    const [resending, setResending] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [clearingQueue, setClearingQueue] = useState(false);
    const [tabValue, setTabValue] = useState(0);
    const [queueStatus, setQueueStatus] = useState({
        pending: 0,
        processing: 0,
        failed: 0,
        total: 0
    });
    const [pagination, setPagination] = useState({
        currentPage: 1,
        totalPages: 1,
        total: 0,
        limit: 50
    });
    const [leadEmailLogs, setLeadEmailLogs] = useState([]);
    const [leadEmailLoading, setLeadEmailLoading] = useState(false);
    const [leadEmailPagination, setLeadEmailPagination] = useState({
        currentPage: 1,
        totalPages: 1,
        total: 0,
        limit: 20,
    });
    const [leadEmailSearch, setLeadEmailSearch] = useState('');
    const [leadEmailRoleFilter, setLeadEmailRoleFilter] = useState('');
    const [viewEmailLog, setViewEmailLog] = useState(null);
    const [selectedLeadEmailLogs, setSelectedLeadEmailLogs] = useState(new Set());
    const [deletingLeadEmailLogs, setDeletingLeadEmailLogs] = useState(false);
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
    const [isMobileMenu, setisMobileMenu] = useState(false);
    
    const navigate = useNavigate();
    const authUser = useAuthUser();

    // Handle mobile menu
    useEffect(() => {
        const handleResize = () => {
            if (window.innerWidth < 768) {
                setisMobileMenu(false);
                setIsSidebarCollapsed(false);
            } else {
                setisMobileMenu(true);
            }
        };

        handleResize();
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, []);

    useEffect(() => {
        if (authUser()?.user?.role !== 'superadmin') {
            navigate('/dashboard');
            return;
        }
        
        fetchQueueStatus();
        fetchFailedEmails();
    }, []);

    useEffect(() => {
        if (tabValue === 2) {
            fetchLeadEmailHistory(1);
        }
    }, [tabValue]);

    // ✅ Socket.io for real-time updates
    useEffect(() => { 
        // Use centralized backend URL from appConfig
        const backendUrl = getBackendUrl();
        
        const socket = io(backendUrl, {
            withCredentials: true,
            transports: ['websocket', 'polling'] // Better compatibility
        });

        socket.on('connect', () => {});

        socket.on('emailQueueUpdate', (data) => {
            setQueueStatus({
                pending: data.pending || 0,
                processing: data.processing || 0,
                failed: data.failed || 0,
                total: data.total || 0
            });

            fetchQueueStatus();
            if (tabValue === 1) {
                fetchFailedEmails();
            }
        });

        return () => {
            socket.disconnect();
        };
    }, [tabValue]);

    const fetchQueueStatus = async () => {
        try {
            const response = await getEmailQueueStatusApi();
            if (response.success) {
                setQueueStatus({
                    pending: response.data.pending || 0,
                    processing: response.data.processing || 0,
                    failed: response.data.failed || 0,
                    total: response.data.total || 0
                });
                setPendingEmails(response.data.pendingEmails || []);
            }
        } catch (error) {
            console.error('Error fetching queue status:', error);
        }
    };

    const fetchFailedEmails = async (page = 1) => {
        try {
            setLoading(true);
            // Don't pass status filter - backend will show 'pending' and 'retrying', exclude 'sent'
            const response = await getFailedEmailsApi({ page, limit: pagination.limit });
            if (response.success) {
                setFailedEmails(response.data.emails);
                setPagination(response.data.pagination);
            }
        } catch (error) {
            console.error('Error fetching failed emails:', error);
            toast.error('Failed to load emails');
        } finally {
            setLoading(false);
        }
    };

    const fetchLeadEmailHistory = async (page = 1) => {
        try {
            setLeadEmailLoading(true);
            const response = await getLeadEmailHistoryApi({
                page,
                limit: leadEmailPagination.limit,
                search: leadEmailSearch.trim() || undefined,
                role: leadEmailRoleFilter || undefined,
            });
            if (response.success) {
                setLeadEmailLogs(response.logs || []);
                setLeadEmailPagination(response.pagination || leadEmailPagination);
            }
        } catch (error) {
            console.error('Error fetching lead email history:', error);
            toast.error('Failed to load lead email history');
        } finally {
            setLeadEmailLoading(false);
        }
    };

    const ROLE_CHIP_STYLES = {
        superadmin: { bgcolor: '#6a1b9a', color: '#fff' },
        admin: { bgcolor: '#1565c0', color: '#fff' },
        subadmin: { bgcolor: '#00695c', color: '#fff' },
        manager: { bgcolor: '#ef6c00', color: '#fff' },
        user: { bgcolor: '#455a64', color: '#fff' },
    };

    const getRoleChipSx = (role) => {
        const key = String(role || '').toLowerCase();
        return {
            fontWeight: 600,
            fontSize: '0.75rem',
            textTransform: 'capitalize',
            ...(ROLE_CHIP_STYLES[key] || { bgcolor: '#757575', color: '#fff' }),
        };
    };

    const handleSelectAllLeadEmailLogs = () => {
        if (selectedLeadEmailLogs.size === leadEmailLogs.length) {
            setSelectedLeadEmailLogs(new Set());
        } else {
            setSelectedLeadEmailLogs(new Set(leadEmailLogs.map((log) => log._id)));
        }
    };

    const handleSelectLeadEmailLog = (logId) => {
        setSelectedLeadEmailLogs((prev) => {
            const next = new Set(prev);
            if (next.has(logId)) {
                next.delete(logId);
            } else {
                next.add(logId);
            }
            return next;
        });
    };

    const handleDeleteLeadEmailLogs = async (ids) => {
        const idList = Array.from(ids || []);
        if (idList.length === 0) {
            toast.warning('Please select email records to delete');
            return;
        }

        if (!window.confirm(`Delete ${idList.length} email record(s) from history?`)) {
            return;
        }

        try {
            setDeletingLeadEmailLogs(true);
            const response = await deleteLeadEmailHistoryApi(idList);
            if (response.success) {
                toast.success(response.msg || 'Email history deleted');
                setSelectedLeadEmailLogs(new Set());
                if (viewEmailLog && idList.includes(viewEmailLog._id)) {
                    setViewEmailLog(null);
                }
                fetchLeadEmailHistory(leadEmailPagination.currentPage);
            } else {
                toast.error(response.msg || 'Failed to delete email history');
            }
        } catch (error) {
            toast.error('Error deleting email history');
        } finally {
            setDeletingLeadEmailLogs(false);
        }
    };

    const handleSelectAll = () => {
        if (selectedEmails.size === failedEmails.length) {
            setSelectedEmails(new Set());
        } else {
            setSelectedEmails(new Set(failedEmails.map(email => email._id)));
        }
    };

    const handleSelectEmail = (emailId) => {
        setSelectedEmails(prev => {
            const newSelected = new Set(prev);
            if (newSelected.has(emailId)) {
                newSelected.delete(emailId);
            } else {
                newSelected.add(emailId);
            }
            return newSelected;
        });
    };

    const handleResend = async () => {
        if (selectedEmails.size === 0) {
            toast.warning('Please select emails to resend');
            return;
        }

        try {
            setResending(true);
            const response = await resendFailedEmailsApi(Array.from(selectedEmails));
            if (response.success) {
                toast.success(response.msg || 'Emails are being resent');
                setSelectedEmails(new Set());
                fetchFailedEmails(pagination.currentPage);
                fetchQueueStatus();
            } else {
                toast.error(response.msg || 'Failed to resend emails');
            }
        } catch (error) {
            toast.error('Error resending emails');
        } finally {
            setResending(false);
        }
    };

    const handleDelete = async () => {
        if (selectedEmails.size === 0) {
            toast.warning('Please select emails to delete');
            return;
        }

        try {
            setDeleting(true);
            const response = await deleteFailedEmailsApi(Array.from(selectedEmails));
            if (response.success) {
                toast.success(response.msg || 'Emails deleted successfully');
                setSelectedEmails(new Set());
                fetchFailedEmails(pagination.currentPage);
                fetchQueueStatus();
            } else {
                toast.error(response.msg || 'Failed to delete emails');
            }
        } catch (error) {
            toast.error('Error deleting emails');
        } finally {
            setDeleting(false);
        }
    };

    const handleProcessQueue = async () => {
        try {
            const response = await processEmailQueueApi();
            if (response.success) {
                toast.info(response.msg || 'Email queue is being processed');
            }
        } catch (error) {
            toast.error('Error triggering queue processing');
        }
    };

    const handleClearQueue = async () => {
        if (!window.confirm('⚠️ Clear all pending emails from queue?\n\nThis will remove all pending email entries from database.\n\nOnly do this if emails were already sent successfully via Resend/SendGrid.')) {
            return;
        }

        try {
            setClearingQueue(true);
            toast.info('Clearing email queue...');

            const response = await clearEmailQueueApi();
            
            if (response.success) {
                toast.success(response.msg || 'Email queue cleared successfully!');
                
                // Refresh queue status
                fetchQueueStatus();
            } else {
                toast.error(response.msg || 'Failed to clear email queue');
            }
        } catch (error) {
            console.error('Clear queue error:', error);
            toast.error('Error clearing email queue');
        } finally {
            setClearingQueue(false);
        }
    };

    return (
        <Box sx={{ display: "block", height: "100vh", bgcolor: "background.default", position: "relative" }}>
            {/* Sidebar */}
            <Box>
                <Sidebar
                    setisMobileMenu={setisMobileMenu}
                    isMobileMenu={isMobileMenu}
                    isCollapsed={isSidebarCollapsed}
                    setIsSidebarCollapsed={setIsSidebarCollapsed}
                />
            </Box>

            {/* Overlay for mobile - closes sidebar when clicked */}
            {isMobileMenu && (
                <Box
                    onClick={() => setisMobileMenu(false)}
                    sx={{
                        position: "fixed",
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        backgroundColor: "rgba(0, 0, 0, 0.5)",
                        zIndex: 1199,
                        display: { xs: "block", md: "none" },
                        cursor: "pointer"
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
                {/* Header */}
                <AppBar
                    position="static"
                    elevation={0}
                    sx={{ bgcolor: "background.paper", borderBottom: 1, borderColor: "divider" }}
                >
                    <Toolbar sx={{ justifyContent: "space-between" }}>
                        <Box sx={{ display: "flex", alignItems: "center", gap: "10px" }}>
                            <IconButton
                                onClick={() => setisMobileMenu(!isMobileMenu)}
                                size="small"
                                sx={{
                                    color: 'text.secondary',
                                    display: { xs: 'block', md: 'none' }
                                }}
                            >
                                <MenuIcon />
                            </IconButton>
                            <Box>
                                <Typography variant="h5" fontWeight="bold" color="text.primary">
                                    Email
                                </Typography>
                                <Typography variant="body2" color="text.secondary">
                                    Activation queue, failures, and lead email history
                                </Typography>
                            </Box>
                        </Box>
                        <Box sx={{ display: "flex", alignItems: "center" }}>
                            <CrmAppBarActions />
                        </Box>
                    </Toolbar>
                </AppBar>

                {/* Main Content Area */}
                <Box sx={{ flex: 1, overflow: "auto", p: { xs: 2, sm: 3 } }}>
                    {/* Statistics Cards */}
                    <Grid container spacing={2} sx={{ mb: 3 }}>
                        <Grid item xs={12} sm={6} md={3}>
                            <Card elevation={2}>
                                <CardContent sx={{ textAlign: 'center' }}>
                                    <HourglassEmpty sx={{ fontSize: 40, color: 'warning.main', mb: 1 }} />
                                    <Typography variant="h4" fontWeight="bold" color="warning.main">
                                        {queueStatus.pending}
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        Pending Emails
                                    </Typography>
                                </CardContent>
                            </Card>
                        </Grid>
                        <Grid item xs={12} sm={6} md={3}>
                            <Card elevation={2}>
                                <CardContent sx={{ textAlign: 'center' }}>
                                    <CircularProgress size={40} sx={{ mb: 1 }} />
                                    <Typography variant="h4" fontWeight="bold" color="info.main">
                                        {queueStatus.processing}
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        Processing
                                    </Typography>
                                </CardContent>
                            </Card>
                        </Grid>
                        <Grid item xs={12} sm={6} md={3}>
                            <Card elevation={2}>
                                <CardContent sx={{ textAlign: 'center' }}>
                                    <ErrorIcon sx={{ fontSize: 40, color: 'error.main', mb: 1 }} />
                                    <Typography variant="h4" fontWeight="bold" color="error.main">
                                        {queueStatus.failed}
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        Failed Emails
                                    </Typography>
                                </CardContent>
                            </Card>
                        </Grid>
                        <Grid item xs={12} sm={6} md={3}>
                            <Card elevation={2}>
                                <CardContent sx={{ textAlign: 'center' }}>
                                    <EmailIcon sx={{ fontSize: 40, color: 'primary.main', mb: 1 }} />
                                    <Typography variant="h4" fontWeight="bold" color="primary.main">
                                        {queueStatus.total}
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        Total Queue
                                    </Typography>
                                </CardContent>
                            </Card>
                        </Grid>
                    </Grid>

                    {/* Info Alert */}
                    <Alert severity="info" sx={{ mb: 3 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
                            <Typography variant="body2" sx={{ flex: 1 }}>
                                📧 Emails are processed automatically every 30 seconds in the background. 
                                You can refresh the page anytime - the email sending will continue.
                            </Typography>
                            {queueStatus.total > 0 && (
                                <Button
                                    variant="contained"
                                    color="warning"
                                    size="small"
                                    onClick={handleClearQueue}
                                    disabled={clearingQueue}
                                    startIcon={clearingQueue ? <CircularProgress size={16} color="inherit" /> : <DeleteIcon />}
                                >
                                    {clearingQueue ? 'Clearing...' : `Clear Queue (${queueStatus.total})`}
                                </Button>
                            )}
                        </Box>
                    </Alert>

                    {/* Tabs */}
                    <Card elevation={2}>
                        <Tabs value={tabValue} onChange={(e, newValue) => setTabValue(newValue)} sx={{ borderBottom: 1, borderColor: 'divider' }}>
                            <Tab label={
                                <Badge badgeContent={queueStatus.pending} color="warning" max={999}>
                                    Pending Emails
                                </Badge>
                            } />
                            <Tab label={
                                <Badge badgeContent={queueStatus.failed} color="error" max={999}>
                                    Failed Emails
                                </Badge>
                            } />
                            <Tab label="Lead Emails Sent" />
                        </Tabs>

                        <CardContent>
                            {/* Pending Emails Tab */}
                            {tabValue === 0 && (
                                <Box>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                                        <Typography variant="h6">
                                            Pending Emails ({pendingEmails.length})
                                        </Typography>
                                        <Button
                                            variant="outlined"
                                            startIcon={<RefreshIcon />}
                                            onClick={fetchQueueStatus}
                                            size="small"
                                        >
                                            Refresh
                                        </Button>
                                    </Box>

                                    {pendingEmails.length === 0 ? (
                                        <Alert severity="success">
                                            <Typography variant="body2">
                                                ✅ No pending emails! All activation emails have been sent.
                                            </Typography>
                                        </Alert>
                                    ) : (
                                        <TableContainer component={Paper} variant="outlined">
                                            <Table>
                                                <TableHead>
                                                    <TableRow>
                                                        <TableCell>Email</TableCell>
                                                        <TableCell>Name</TableCell>
                                                        <TableCell>Status</TableCell>
                                                        <TableCell>Attempts</TableCell>
                                                        <TableCell>Created</TableCell>
                                                    </TableRow>
                                                </TableHead>
                                                <TableBody>
                                                    {pendingEmails.map((email) => (
                                                        <TableRow key={email._id}>
                                                            <TableCell>{email.email}</TableCell>
                                                            <TableCell>{email.firstName} {email.lastName}</TableCell>
                                                            <TableCell>
                                                                <Chip 
                                                                    label={email.status} 
                                                                    color={email.status === 'processing' ? 'info' : 'warning'}
                                                                    size="small"
                                                                />
                                                            </TableCell>
                                                            <TableCell>{email.attempts || 0}</TableCell>
                                                            <TableCell>
                                                                {new Date(email.createdAt).toLocaleString()}
                                                            </TableCell>
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                        </TableContainer>
                                    )}
                                </Box>
                            )}

                            {/* Failed Emails Tab */}
                            {tabValue === 1 && (
                                <Box>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                                        <Typography variant="h6">
                                            Failed Emails ({failedEmails.length})
                                        </Typography>
                                        <Stack direction="row" spacing={1}>
                                            <Button
                                                variant="outlined"
                                                startIcon={<RefreshIcon />}
                                                onClick={() => fetchFailedEmails(pagination.currentPage)}
                                                size="small"
                                            >
                                                Refresh
                                            </Button>
                                            {selectedEmails.size > 0 && (
                                                <>
                                                    <Button
                                                        variant="contained"
                                                        color="primary"
                                                        startIcon={resending ? <CircularProgress size={20} /> : <SendIcon />}
                                                        onClick={handleResend}
                                                        disabled={resending}
                                                        size="small"
                                                    >
                                                        Resend ({selectedEmails.size})
                                                    </Button>
                                                    <Button
                                                        variant="outlined"
                                                        color="error"
                                                        startIcon={deleting ? <CircularProgress size={20} /> : <DeleteIcon />}
                                                        onClick={handleDelete}
                                                        disabled={deleting}
                                                        size="small"
                                                    >
                                                        Delete ({selectedEmails.size})
                                                    </Button>
                                                </>
                                            )}
                                        </Stack>
                                    </Box>

                                    {loading ? (
                                        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                                            <CircularProgress />
                                        </Box>
                                    ) : failedEmails.length === 0 ? (
                                        <Alert severity="success">
                                            <Typography variant="body2">
                                                ✅ No failed emails! All activation emails were sent successfully.
                                            </Typography>
                                        </Alert>
                                    ) : (
                                        <>
                                            <TableContainer component={Paper} variant="outlined">
                                                <Table>
                                                    <TableHead>
                                                        <TableRow>
                                                            <TableCell padding="checkbox">
                                                                <Checkbox
                                                                    indeterminate={selectedEmails.size > 0 && selectedEmails.size < failedEmails.length}
                                                                    checked={failedEmails.length > 0 && selectedEmails.size === failedEmails.length}
                                                                    onChange={handleSelectAll}
                                                                />
                                                            </TableCell>
                                                            <TableCell>Email</TableCell>
                                                            <TableCell>Name</TableCell>
                                                            <TableCell>Error</TableCell>
                                                            <TableCell>Type</TableCell>
                                                            <TableCell>Attempts</TableCell>
                                                            <TableCell>Last Attempt</TableCell>
                                                        </TableRow>
                                                    </TableHead>
                                                    <TableBody>
                                                        {failedEmails.map((email) => (
                                                            <TableRow key={email._id} hover>
                                                                <TableCell padding="checkbox">
                                                                    <Checkbox
                                                                        checked={selectedEmails.has(email._id)}
                                                                        onChange={() => handleSelectEmail(email._id)}
                                                                    />
                                                                </TableCell>
                                                                <TableCell>{email.email}</TableCell>
                                                                <TableCell>{email.leadName || `${email.firstName || ''} ${email.lastName || ''}`}</TableCell>
                                                                <TableCell>
                                                                    <Typography variant="caption" color="error" sx={{ display: 'block', maxWidth: 300, whiteSpace: 'normal' }}>
                                                                        {email.failureReason || email.error || 'Unknown error'}
                                                                    </Typography>
                                                                </TableCell>
                                                                <TableCell>
                                                                    <Chip 
                                                                        label={email.errorType || 'other'} 
                                                                        size="small"
                                                                        color={
                                                                            email.errorType === 'rate_limit' ? 'error' :
                                                                            email.errorType === 'authentication' ? 'warning' :
                                                                            'default'
                                                                        }
                                                                    />
                                                                </TableCell>
                                                                <TableCell>
                                                                    <Chip label={email.retryCount || email.attempts || 0} size="small" />
                                                                </TableCell>
                                                                <TableCell>
                                                                    {email.lastRetryAt || email.lastAttemptDate
                                                                        ? new Date(email.lastRetryAt || email.lastAttemptDate).toLocaleString()
                                                                        : 'N/A'}
                                                                </TableCell>
                                                            </TableRow>
                                                        ))}
                                                    </TableBody>
                                                </Table>
                                            </TableContainer>

                                            {/* Pagination */}
                                            {pagination.totalPages > 1 && (
                                                <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
                                                    <Pagination
                                                        count={pagination.totalPages}
                                                        page={pagination.currentPage}
                                                        onChange={(e, page) => fetchFailedEmails(page)}
                                                        color="primary"
                                                    />
                                                </Box>
                                            )}
                                        </>
                                    )}
                                </Box>
                            )}

                            {/* Lead Emails Sent Tab */}
                            {tabValue === 2 && (
                                <Box>
                                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
                                        <TextField
                                            size="small"
                                            label="Search lead, subject, sender..."
                                            value={leadEmailSearch}
                                            onChange={(e) => setLeadEmailSearch(e.target.value)}
                                            sx={{ flex: 1 }}
                                        />
                                        <FormControl size="small" sx={{ minWidth: 160 }}>
                                            <InputLabel>Sender role</InputLabel>
                                            <Select
                                                label="Sender role"
                                                value={leadEmailRoleFilter}
                                                onChange={(e) => setLeadEmailRoleFilter(e.target.value)}
                                            >
                                                <MenuItem value="">All roles</MenuItem>
                                                <MenuItem value="superadmin">Superadmin</MenuItem>
                                                <MenuItem value="admin">Admin</MenuItem>
                                                <MenuItem value="subadmin">Subadmin</MenuItem>
                                                <MenuItem value="manager">Manager</MenuItem>
                                            </Select>
                                        </FormControl>
                                        <Button
                                            variant="contained"
                                            onClick={() => fetchLeadEmailHistory(1)}
                                            disabled={leadEmailLoading}
                                        >
                                            Search
                                        </Button>
                                        <Button
                                            variant="outlined"
                                            startIcon={<RefreshIcon />}
                                            onClick={() => fetchLeadEmailHistory(leadEmailPagination.currentPage)}
                                            disabled={leadEmailLoading}
                                        >
                                            Refresh
                                        </Button>
                                        {selectedLeadEmailLogs.size > 0 && (
                                            <Button
                                                variant="outlined"
                                                color="error"
                                                startIcon={deletingLeadEmailLogs ? <CircularProgress size={18} /> : <DeleteIcon />}
                                                onClick={() => handleDeleteLeadEmailLogs(selectedLeadEmailLogs)}
                                                disabled={deletingLeadEmailLogs}
                                            >
                                                Delete ({selectedLeadEmailLogs.size})
                                            </Button>
                                        )}
                                    </Stack>

                                    {leadEmailLoading ? (
                                        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                                            <CircularProgress />
                                        </Box>
                                    ) : leadEmailLogs.length === 0 ? (
                                        <Alert severity="info">
                                            No lead emails sent yet. Emails sent from CRM leads will appear here.
                                        </Alert>
                                    ) : (
                                        <>
                                            <TableContainer component={Paper} variant="outlined">
                                                <Table>
                                                    <TableHead>
                                                        <TableRow>
                                                            <TableCell padding="checkbox">
                                                                <Checkbox
                                                                    indeterminate={selectedLeadEmailLogs.size > 0 && selectedLeadEmailLogs.size < leadEmailLogs.length}
                                                                    checked={leadEmailLogs.length > 0 && selectedLeadEmailLogs.size === leadEmailLogs.length}
                                                                    onChange={handleSelectAllLeadEmailLogs}
                                                                />
                                                            </TableCell>
                                                            <TableCell>Sent at</TableCell>
                                                            <TableCell>Sent by</TableCell>
                                                            <TableCell>Role</TableCell>
                                                            <TableCell>Lead</TableCell>
                                                            <TableCell>Subject</TableCell>
                                                            <TableCell>Message</TableCell>
                                                            <TableCell>Status</TableCell>
                                                            <TableCell align="right">Actions</TableCell>
                                                        </TableRow>
                                                    </TableHead>
                                                    <TableBody>
                                                        {leadEmailLogs.map((log) => {
                                                            const leadName = `${log.leadFirstName || ''} ${log.leadLastName || ''}`.trim() || '—';
                                                            const preview = htmlToPlainText(log.body || '').slice(0, 80);
                                                            return (
                                                                <TableRow key={log._id} hover>
                                                                    <TableCell padding="checkbox">
                                                                        <Checkbox
                                                                            checked={selectedLeadEmailLogs.has(log._id)}
                                                                            onChange={() => handleSelectLeadEmailLog(log._id)}
                                                                        />
                                                                    </TableCell>
                                                                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                                                                        {new Date(log.createdAt).toLocaleString()}
                                                                    </TableCell>
                                                                    <TableCell>
                                                                        <Typography variant="body2" fontWeight={600}>{log.sentByName}</Typography>
                                                                        <Typography variant="caption" color="text.secondary">{log.sentByEmail}</Typography>
                                                                    </TableCell>
                                                                    <TableCell>
                                                                        <Chip label={log.sentByRole || 'Unknown'} size="small" sx={getRoleChipSx(log.sentByRole)} />
                                                                    </TableCell>
                                                                    <TableCell>
                                                                        <Typography variant="body2" fontWeight={600}>{leadName}</Typography>
                                                                        <Typography variant="caption" color="text.secondary">{log.leadEmail}</Typography>
                                                                    </TableCell>
                                                                    <TableCell sx={{ maxWidth: 180 }}>
                                                                        <Typography variant="body2" noWrap title={log.subject}>{log.subject}</Typography>
                                                                    </TableCell>
                                                                    <TableCell sx={{ maxWidth: 220 }}>
                                                                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                                                                            {preview}{preview.length >= 80 ? '…' : ''}
                                                                        </Typography>
                                                                        <Button
                                                                            size="small"
                                                                            startIcon={<Visibility />}
                                                                            onClick={() => setViewEmailLog(log)}
                                                                            sx={{ mt: 0.5, textTransform: 'none' }}
                                                                        >
                                                                            View
                                                                        </Button>
                                                                    </TableCell>
                                                                    <TableCell>
                                                                        <Chip
                                                                            label={log.status}
                                                                            size="small"
                                                                            color={log.status === 'sent' ? 'success' : 'error'}
                                                                        />
                                                                    </TableCell>
                                                                    <TableCell align="right">
                                                                        <IconButton
                                                                            size="small"
                                                                            color="error"
                                                                            title="Delete"
                                                                            disabled={deletingLeadEmailLogs}
                                                                            onClick={() => handleDeleteLeadEmailLogs([log._id])}
                                                                        >
                                                                            <DeleteIcon fontSize="small" />
                                                                        </IconButton>
                                                                    </TableCell>
                                                                </TableRow>
                                                            );
                                                        })}
                                                    </TableBody>
                                                </Table>
                                            </TableContainer>

                                            {leadEmailPagination.totalPages > 1 && (
                                                <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
                                                    <Pagination
                                                        count={leadEmailPagination.totalPages}
                                                        page={leadEmailPagination.currentPage}
                                                        onChange={(e, page) => fetchLeadEmailHistory(page)}
                                                        color="primary"
                                                    />
                                                </Box>
                                            )}
                                        </>
                                    )}
                                </Box>
                            )}
                        </CardContent>
                    </Card>

                    <Dialog open={Boolean(viewEmailLog)} onClose={() => setViewEmailLog(null)} maxWidth="md" fullWidth>
                        <DialogTitle>Email details</DialogTitle>
                        <DialogContent dividers>
                            {viewEmailLog && (
                                <Stack spacing={2}>
                                    <Box>
                                        <Typography variant="caption" color="text.secondary">To</Typography>
                                        <Typography variant="body2">
                                            {`${viewEmailLog.leadFirstName || ''} ${viewEmailLog.leadLastName || ''}`.trim()} &lt;{viewEmailLog.leadEmail}&gt;
                                        </Typography>
                                    </Box>
                                    <Box>
                                        <Typography variant="caption" color="text.secondary">From</Typography>
                                        <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" sx={{ mt: 0.5 }}>
                                            <Typography variant="body2">
                                                {viewEmailLog.sentByName} — {viewEmailLog.sentByEmail}
                                            </Typography>
                                            <Chip label={viewEmailLog.sentByRole || 'Unknown'} size="small" sx={getRoleChipSx(viewEmailLog.sentByRole)} />
                                        </Stack>
                                    </Box>
                                    <Box>
                                        <Typography variant="caption" color="text.secondary">Subject</Typography>
                                        <Typography variant="body2" fontWeight={600}>{viewEmailLog.subject}</Typography>
                                    </Box>
                                    <Box>
                                        <Typography variant="caption" color="text.secondary">Message</Typography>
                                        <Box
                                            sx={{ mt: 1, p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 1, bgcolor: 'background.default' }}
                                            dangerouslySetInnerHTML={{ __html: viewEmailLog.body || '' }}
                                        />
                                    </Box>
                                    {viewEmailLog.status === 'failed' && viewEmailLog.failureReason && (
                                        <Alert severity="error">{viewEmailLog.failureReason}</Alert>
                                    )}
                                </Stack>
                            )}
                        </DialogContent>
                        <DialogActions>
                            <Button onClick={() => setViewEmailLog(null)}>Close</Button>
                            {viewEmailLog && (
                                <Button
                                    color="error"
                                    startIcon={deletingLeadEmailLogs ? <CircularProgress size={18} /> : <DeleteIcon />}
                                    disabled={deletingLeadEmailLogs}
                                    onClick={() => handleDeleteLeadEmailLogs([viewEmailLog._id])}
                                >
                                    Delete
                                </Button>
                            )}
                        </DialogActions>
                    </Dialog>
                </Box>
            </Box>
        </Box>
    );
};

export default EmailQueue;

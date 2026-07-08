import React, { useState, useEffect, useCallback } from 'react';
import {
    Box,
    Card,
    CardContent,
    Typography,
    CircularProgress,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    IconButton,
    Button,
    Tooltip,
    Avatar,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Select,
    MenuItem,
    FormControl,
    Chip,
} from '@mui/material';
import {
    Phone,
    Schedule,
    Delete as DeleteIcon,
    ChevronLeft,
    ChevronRight,
    Refresh,
    Menu as MenuIcon,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import {
    getCallQueueStatusApi,
    deleteCallApi,
} from '../../../Api/Service';
import { allUsersApi } from '../../../Api/Service';
import { useAuthUser } from 'react-auth-kit';
import { useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar.js';
import CrmAppBarActions from './components/CrmAppBarActions';

const PendingCallsQueue = () => {
    const authUser = useAuthUser();
    const navigate = useNavigate();
    const [queueStatus, setQueueStatus] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
    const [isMobileMenu, setIsMobileMenu] = useState(false);
    const [deletingPendingCall, setDeletingPendingCall] = useState(null);
    const [deletePendingCallConfirm, setDeletePendingCallConfirm] = useState(null);
    const [deletingByStatus, setDeletingByStatus] = useState(null);

    // Pagination for scheduled (pending) calls
    const [scheduledPagination, setScheduledPagination] = useState({
        page: 1,
        limit: 20,
        total: 0,
        totalPages: 1
    });

    // Permission gate: restrict admin without Call Dashboard access
    useEffect(() => {
        const checkPermissions = async () => {
            try {
                const me = authUser && authUser();
                if (me?.user?.role === 'admin') {
                    const resp = await allUsersApi({ search: me.user._id, limit: 1 });
                    const updated = resp?.success && resp?.allUsers?.length ? resp.allUsers[0] : me.user;
                    if (!updated?.adminPermissions?.canAccessCallDashboard) {
                        toast.error('Access denied to Pending Calls Queue');
                        navigate('/admin/dashboard');
                        return;
                    }
                }
            } catch (e) {
                // If check fails, rely on backend 403
            }
        };
        checkPermissions();
    }, []);

    // OPTIMIZED: Fetch queue status
    const fetchQueueStatus = useCallback(async () => {
        try {
            setRefreshing(true);
            const queueRes = await getCallQueueStatusApi({
                scheduledPage: scheduledPagination.page,
                scheduledLimit: scheduledPagination.limit
            });

            if (queueRes.success) {
                setQueueStatus(queueRes.queue);
                if (queueRes.queue?.scheduledPagination) {
                    setScheduledPagination(prev => ({
                        ...prev,
                        page: queueRes.queue.scheduledPagination.page || prev.page,
                        limit: queueRes.queue.scheduledPagination.limit || prev.limit,
                        total: queueRes.queue.scheduledPagination.total || prev.total,
                        totalPages: queueRes.queue.scheduledPagination.totalPages || prev.totalPages
                    }));
                }
            }
        } catch (error) {
            console.error('Error fetching queue status:', error);
            toast.error('Error loading queue status');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [scheduledPagination.page, scheduledPagination.limit]);

    useEffect(() => {
        fetchQueueStatus();

        // OPTIMIZED: Set up auto-refresh every 15 seconds (reduced from 5 seconds for better performance)
        const interval = setInterval(() => {
            fetchQueueStatus();
        }, 15000); // Increased to 15 seconds to reduce server load

        return () => clearInterval(interval);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [scheduledPagination.page, scheduledPagination.limit]); // Only re-run when pagination changes

    const formatDateTime = (dateString) => {
        if (!dateString) return 'N/A';
        const date = new Date(dateString);
        return date.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    // Handle delete pending/scheduled call
    const handleDeletePendingCall = async (callId) => {
        try {
            setDeletingPendingCall(callId);
            const response = await deleteCallApi(callId);
            if (response.success) {
                toast.success(response.message || 'Scheduled call deleted successfully');
                fetchQueueStatus();
            } else {
                toast.error(response.message || 'Failed to delete scheduled call');
            }
        } catch (error) {
            console.error('Error deleting scheduled call:', error);
            toast.error(error.response?.data?.msg || 'Failed to delete scheduled call');
        } finally {
            setDeletingPendingCall(null);
            setDeletePendingCallConfirm(null);
        }
    };

    // Handle delete all pending calls
    const handleDeleteAllPendingCalls = async () => {
        if (!queueStatus?.pendingCalls || queueStatus.pendingCalls.length === 0) {
            toast.warning('No pending calls to delete');
            return;
        }

        if (!window.confirm(`Are you sure you want to delete all ${queueStatus.pendingCalls.length} pending call(s) currently in queue? This action cannot be undone.`)) {
            return;
        }

        try {
            setDeletingByStatus('pending');
            const deletePromises = queueStatus.pendingCalls.map(call => 
                deleteCallApi(call.callId || call._id)
            );
            const results = await Promise.allSettled(deletePromises);
            
            const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
            const failed = results.length - successful;

            if (successful > 0) {
                toast.success(`Successfully deleted ${successful} pending call(s)`);
                fetchQueueStatus();
            }
            if (failed > 0) {
                toast.error(`Failed to delete ${failed} call(s)`);
            }
        } catch (error) {
            console.error('Error deleting all pending calls:', error);
            toast.error('Error deleting pending calls');
        } finally {
            setDeletingByStatus(null);
        }
    };

    useEffect(() => {
        if (authUser().user.role === "admin" || authUser().user.role === "superadmin") {
            return;
        } else if (authUser().user.role === "user") {
            navigate("/dashboard");
            return;
        } else {
            navigate("/admin/dashboard");
            return;
        }
    }, []);

    return (
        <Box
            sx={{
                display: 'flex',
                height: '100vh',
                overflow: 'hidden',
            }}
        >
            {/* Sidebar */}
            <Sidebar
                setisMobileMenu={setIsMobileMenu}
                isMobileMenu={isMobileMenu}
                isCollapsed={isSidebarCollapsed}
                setIsSidebarCollapsed={setIsSidebarCollapsed}
            />

            {/* Mobile Menu Overlay */}
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
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    ml: {
                        xs: 0,
                        md: isSidebarCollapsed ? '0' : '0',
                    },
                    transition: 'margin-left 0.3s ease',
                    height: '100vh',
                    overflow: 'auto',
                }}
            >
                {loading ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1 }}>
                        <CircularProgress />
                    </Box>
                ) : (
                    <Box sx={{ p: 3 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                <IconButton
                                    onClick={() => setIsMobileMenu(!isMobileMenu)}
                                    sx={{
                                        color: 'text.primary',
                                        display: { xs: 'block', md: 'none' },
                                    }}
                                >
                                    <MenuIcon />
                                </IconButton>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <Schedule color="warning" />
                                    <Typography variant="h4" sx={{ fontWeight: 700 }}>
                                        Pending Calls Queue
                                    </Typography>
                                    {scheduledPagination.total > 0 && (
                                        <Chip
                                            label={scheduledPagination.total}
                                            color="warning"
                                            sx={{ fontWeight: 600, fontSize: '0.875rem', height: 28 }}
                                        />
                                    )}
                                </Box>
                            </Box>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <CrmAppBarActions />
                                <Button
                                    variant="outlined"
                                    startIcon={refreshing ? <CircularProgress size={16} /> : <Refresh />}
                                    onClick={fetchQueueStatus}
                                    disabled={refreshing}
                                >
                                    Refresh
                                </Button>
                            </Box>
                        </Box>

                        {/* Pending Calls Queue */}
                        {queueStatus?.pendingCalls && queueStatus.pendingCalls.length > 0 ? (
                            <Card elevation={3} sx={{ borderRadius: 3, border: '1px solid', borderColor: 'warning.light' }}>
                                <CardContent>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                                        <Typography variant="body2" color="text.secondary">
                                            {scheduledPagination.total} scheduled call(s) in queue
                                        </Typography>
                                        <Tooltip title="Delete all pending calls">
                                            <Button
                                                variant="outlined"
                                                color="error"
                                                size="small"
                                                startIcon={deletingByStatus === 'pending' ? <CircularProgress size={16} /> : <DeleteIcon />}
                                                onClick={handleDeleteAllPendingCalls}
                                                disabled={deletingByStatus === 'pending'}
                                            >
                                                {deletingByStatus === 'pending' ? 'Deleting...' : 'Delete All'}
                                            </Button>
                                        </Tooltip>
                                    </Box>
                                    <TableContainer>
                                        <Table size="small">
                                            <TableHead>
                                                <TableRow sx={{ bgcolor: 'warning.50' }}>
                                                    <TableCell sx={{ fontWeight: 700, fontSize: '0.875rem' }}>Lead</TableCell>
                                                    <TableCell sx={{ fontWeight: 700, fontSize: '0.875rem' }}>Phone</TableCell>
                                                    <TableCell sx={{ fontWeight: 700, fontSize: '0.875rem' }}>Scheduled At</TableCell>
                                                    <TableCell sx={{ fontWeight: 700, fontSize: '0.875rem' }}>Status</TableCell>
                                                    <TableCell sx={{ fontWeight: 700, fontSize: '0.875rem', textAlign: 'center' }}>Actions</TableCell>
                                                </TableRow>
                                            </TableHead>
                                            <TableBody>
                                                {queueStatus.pendingCalls.map((call) => (
                                                    <TableRow key={call.callId || call.sessionId || call._id} hover>
                                                        <TableCell>
                                                            {call.leadInfo ? (
                                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                                    <Avatar sx={{ width: 28, height: 28, fontSize: '0.7rem' }}>
                                                                        {call.leadInfo.firstName?.[0]}{call.leadInfo.lastName?.[0]}
                                                                    </Avatar>
                                                                    <Box>
                                                                        <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.875rem' }}>
                                                                            {call.leadInfo.firstName} {call.leadInfo.lastName}
                                                                        </Typography>
                                                                        <Typography variant="caption" color="text.secondary">
                                                                            {call.leadInfo.email}
                                                                        </Typography>
                                                                    </Box>
                                                                </Box>
                                                            ) : (
                                                                <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.875rem' }}>
                                                                    Unknown Lead
                                                                </Typography>
                                                            )}
                                                        </TableCell>
                                                        <TableCell>
                                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                                <Phone sx={{ fontSize: 14, color: 'text.secondary' }} />
                                                                <Typography variant="body2" sx={{ fontSize: '0.875rem' }}>
                                                                    {call.phoneNumber}
                                                                </Typography>
                                                            </Box>
                                                        </TableCell>
                                                        <TableCell>
                                                            <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.875rem' }}>
                                                                {formatDateTime(call.scheduledAt)}
                                                            </Typography>
                                                        </TableCell>
                                                        <TableCell>
                                                            <Chip
                                                                label={call.status?.replace('-', ' ').toUpperCase() || 'SCHEDULED'}
                                                                size="small"
                                                                color="warning"
                                                                sx={{ fontWeight: 600, fontSize: '0.7rem' }}
                                                            />
                                                        </TableCell>
                                                        <TableCell sx={{ textAlign: 'center' }}>
                                                            <Tooltip title="Delete Scheduled Call">
                                                                <IconButton
                                                                    size="small"
                                                                    color="error"
                                                                    onClick={() => setDeletePendingCallConfirm(call.callId || call._id)}
                                                                    disabled={deletingPendingCall === (call.callId || call._id)}
                                                                >
                                                                    {deletingPendingCall === (call.callId || call._id) ? (
                                                                        <CircularProgress size={16} />
                                                                    ) : (
                                                                        <DeleteIcon fontSize="small" />
                                                                    )}
                                                                </IconButton>
                                                            </Tooltip>
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </TableContainer>
                                    {/* Pagination for Pending Calls */}
                                    {scheduledPagination.total > scheduledPagination.limit && (
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 2, pt: 2, borderTop: 1, borderColor: 'divider' }}>
                                            <Typography variant="body2" color="text.secondary">
                                                Showing {((scheduledPagination.page - 1) * scheduledPagination.limit) + 1}-
                                                {Math.min(scheduledPagination.page * scheduledPagination.limit, scheduledPagination.total)} of {scheduledPagination.total}
                                            </Typography>
                                            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                                                <FormControl size="small" sx={{ minWidth: 80 }}>
                                                    <Select
                                                        value={scheduledPagination.limit}
                                                        onChange={(e) => {
                                                            setScheduledPagination(prev => ({ ...prev, limit: e.target.value, page: 1 }));
                                                        }}
                                                    >
                                                        <MenuItem value={10}>10</MenuItem>
                                                        <MenuItem value={20}>20</MenuItem>
                                                        <MenuItem value={50}>50</MenuItem>
                                                        <MenuItem value={100}>100</MenuItem>
                                                    </Select>
                                                </FormControl>
                                                <IconButton
                                                    size="small"
                                                    onClick={() => setScheduledPagination(prev => ({ ...prev, page: Math.max(1, prev.page - 1) }))}
                                                    disabled={scheduledPagination.page === 1}
                                                >
                                                    <ChevronLeft />
                                                </IconButton>
                                                <Typography variant="body2">
                                                    Page {scheduledPagination.page} of {scheduledPagination.totalPages}
                                                </Typography>
                                                <IconButton
                                                    size="small"
                                                    onClick={() => setScheduledPagination(prev => ({ ...prev, page: Math.min(prev.totalPages, prev.page + 1) }))}
                                                    disabled={scheduledPagination.page >= scheduledPagination.totalPages}
                                                >
                                                    <ChevronRight />
                                                </IconButton>
                                            </Box>
                                        </Box>
                                    )}
                                </CardContent>
                            </Card>
                        ) : (
                            <Card elevation={3} sx={{ borderRadius: 3, border: '1px solid', borderColor: 'divider' }}>
                                <CardContent>
                                    <Box sx={{ textAlign: 'center', py: 8 }}>
                                        <Schedule sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
                                        <Typography variant="h6" color="text.secondary" gutterBottom>
                                            No Pending Calls
                                        </Typography>
                                        <Typography variant="body2" color="text.secondary">
                                            There are no scheduled calls in the queue at the moment
                                        </Typography>
                                    </Box>
                                </CardContent>
                            </Card>
                        )}

                        {/* Delete Pending Call Confirmation Dialog */}
                        <Dialog
                            open={deletePendingCallConfirm !== null}
                            onClose={() => !deletingPendingCall && setDeletePendingCallConfirm(null)}
                            maxWidth="sm"
                            fullWidth
                        >
                            <DialogTitle>
                                <Box display="flex" alignItems="center" gap={1}>
                                    <DeleteIcon color="error" />
                                    <Typography variant="h6">Confirm Delete Scheduled Call</Typography>
                                </Box>
                            </DialogTitle>
                            <DialogContent>
                                <Typography>
                                    Are you sure you want to delete this scheduled/pending call? This action cannot be undone and the call will be removed from the queue.
                                </Typography>
                            </DialogContent>
                            <DialogActions>
                                <Button onClick={() => setDeletePendingCallConfirm(null)} disabled={deletingPendingCall}>
                                    Cancel
                                </Button>
                                <Button
                                    variant="contained"
                                    color="error"
                                    onClick={() => handleDeletePendingCall(deletePendingCallConfirm)}
                                    disabled={deletingPendingCall}
                                    startIcon={deletingPendingCall ? <CircularProgress size={20} /> : <DeleteIcon />}
                                >
                                    {deletingPendingCall ? 'Deleting...' : 'Delete'}
                                </Button>
                            </DialogActions>
                        </Dialog>
                    </Box>
                )}
            </Box>
        </Box>
    );
};

export default PendingCallsQueue;


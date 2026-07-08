import React, { useEffect, useRef, useState } from 'react';
import profile from "../../assets/images/7309681.jpg";
import adminDp from "../../assets/admin.jpg";
import { format, isWithinInterval, subDays, differenceInDays } from 'date-fns';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuthUser } from 'react-auth-kit';
import { allUsersApi, getIndivTicketApi, signleUsersApi, updateMessageApi, updateTicketStatusApi, editTicketMessageApi, deleteTicketMessageApi } from '../../Api/Service';
import InlineTicketStatusCell from './components/InlineTicketStatusCell';
import { toast } from 'react-toastify';
import SideBar from "../layouts/AdminSidebar/Sidebar";
import AdminHeader from "./adminHeader";
import EmailTemplatesDialog from './components/EmailTemplatesDialog';
import { isEmptyRichText, messageContainsHtml } from '../../utils/emailTemplateUtils';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import './TicketDetails.css';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  Button,
  Paper,
  Avatar,
  Stack,
  LinearProgress,
  FormControl,
  Select,
  MenuItem,
  Divider,
  IconButton
} from '@mui/material';
import {
  Send as SendIcon,
  ArrowBack as ArrowBackIcon,
  Person as PersonIcon,
  Email as EmailIcon,
  CalendarToday as CalendarIcon,
  Support as SupportIcon,
  AdminPanelSettings as AdminIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Check as CheckIcon,
  Close as CloseIcon,
  History as HistoryIcon,
  Description as TemplateIcon
} from '@mui/icons-material';

const AllTicket = () => {
    const messagesEndRef = useRef(null);
    const Navigate = useNavigate();
    const authUser = useAuthUser();
    const [isDisable, setIsDisable] = useState(false);
    const [Admin, setAdmin] = useState("");
    const [isLoading, setisLoading] = useState(true);
    const [Ticket, setTicket] = useState({});
    const { ticketId, id } = useParams();
    const [messages, setMessages] = useState([]);
    const [status, setStatus] = useState("");
    const [newMessage, setNewMessage] = useState("");
    const [TicketUser, setTicketUser] = useState("");
    const [Active, setActive] = useState(false);
    const [canChangeTicketStatus, setCanChangeTicketStatus] = useState(true);
    const [editingMessageId, setEditingMessageId] = useState(null);
    const [editingText, setEditingText] = useState("");
    const [actionLoading, setActionLoading] = useState(false);
    const [openHistoryIds, setOpenHistoryIds] = useState({});
    const [templatesDialogOpen, setTemplatesDialogOpen] = useState(false);
    const [staffProfile, setStaffProfile] = useState(null);
    const [statusUpdating, setStatusUpdating] = useState(false);

    const isSuperAdmin = authUser()?.user?.role === 'superadmin';

    const loadStaffProfile = async (user) => {
        try {
            const res = await signleUsersApi(user._id);
            if (res.success) {
                setStaffProfile(res.signleUser);
            } else {
                setStaffProfile(user);
            }
        } catch {
            setStaffProfile(user);
        }
    };

    const toggleBar = () => {
        setActive(!Active);
    };
    const loadTicketStatusPermission = async (user) => {
        if (user.role === "admin" || user.role === "superadmin") {
            setCanChangeTicketStatus(true);
            return;
        }

        if (user.role === "subadmin") {
            try {
                const subadminDetails = await signleUsersApi(user._id);
                if (subadminDetails.success) {
                    setCanChangeTicketStatus(subadminDetails.signleUser?.permissions?.changeTicketStatus === true);
                } else {
                    setCanChangeTicketStatus(false);
                }
            } catch {
                setCanChangeTicketStatus(false);
            }
        }
    };

    const getTickets = async (showLoading = true) => {
        try {
            if (showLoading) setisLoading(true);
            
            if (authUser().user.role === "subadmin") {
                // Get user ID from params
                const allUsers = await allUsersApi();

                if (!allUsers || !Array.isArray(allUsers.allUsers) || allUsers.allUsers.length === 0) {
                    toast.error("Unable to fetch users");
                    if (showLoading) setisLoading(false);
                    return;
                }

                // Find the specific user by ID and check permissions
                const user = allUsers.allUsers.find(user => user._id === id);

                if (!user) {
                    toast.error("User not found");
                    if (showLoading) setisLoading(false);
                    return;
                }

                const hasPermission = user.isShared === true ||
                    (user.isShared === false && user.assignedSubAdmin === authUser().user._id);

                if (!hasPermission) {
                    toast.error("You don't have permission to view this ticket");
                    if (showLoading) setisLoading(false);
                    Navigate("/admin/support");
                    return;
                }
            }

            const indivTicket = await getIndivTicketApi(id, ticketId);if (indivTicket.success) {
                if (!indivTicket.ticket || indivTicket.ticket.length <= 0) {
                    toast.error("Ticket not found");
                    if (showLoading) setisLoading(false);
                    Navigate("/admin/support");
                    return;
                }
                
                const ticketData = indivTicket.ticket[0];
                setTicket(ticketData);
                setMessages(ticketData.ticketContent || []);
                setStatus(ticketData.status || "open");

                const userDetails = await signleUsersApi(ticketData.user);
                if (userDetails.success) {
                    setTicketUser(userDetails.signleUser);
                } else {
                    setTicketUser(null);
                }
            } else {
                toast.dismiss();
                toast.error(indivTicket.msg || 'Failed to fetch ticket');
            }
        } catch (error) {
            console.error('Error fetching ticket:', error);
            toast.dismiss();
            toast.error(error?.message || 'An error occurred while fetching the ticket');
        } finally {
            if (showLoading) setisLoading(false);
        }
    };

    useEffect(() => {
        const user = authUser()?.user;
        if (!user) {
            Navigate("/login");
            return;
        }

        if (user.role === "admin" || user.role === "subadmin" || user.role === "superadmin") {
            setAdmin(user);
            loadTicketStatusPermission(user);
            loadStaffProfile(user);
            getTickets();
        } else if (user.role === "user") {
            Navigate("/dashboard");
        } else {
            Navigate("/login");
        }
    }, []);

    const formatDate = (dateString) => {
        const date = new Date(dateString);
        const now = new Date();
        const diffInTime = now - date; // Difference in milliseconds

        const diffInSeconds = Math.floor(diffInTime / 1000); // Convert to seconds
        const diffInMinutes = Math.floor(diffInSeconds / 60); // Convert to minutes
        const diffInHours = Math.floor(diffInMinutes / 60); // Convert to hours
        const diffInDays = Math.floor(diffInHours / 24); // Convert to days

        if (diffInSeconds < 60) {
            return "just now"; // Less than 1 minute
        } else if (diffInMinutes < 60) {
            return `${diffInMinutes} minute${diffInMinutes === 1 ? '' : 's'} ago`; // Less than 60 minutes
        } else if (diffInHours < 24) {
            return `${diffInHours} hour${diffInHours === 1 ? '' : 's'} ago`; // Less than 24 hours
        } else if (diffInDays < 30) {
            return `${diffInDays} day${diffInDays === 1 ? '' : 's'} ago`; // Less than 30 days
        } else {
            return date.toLocaleDateString(); // Fallback to formatted date
        }
    };
    const formatMessage = (message) => {
        return message.split('\n').map((line, index) => (
            <React.Fragment key={index}>
                {line}
                <br />
            </React.Fragment>
        ));
    };

    const formatDateNew = (dateString) => {
        const date = new Date(dateString);

        // Check for valid date
        if (isNaN(date.getTime())) {
            console.error("Invalid date value:", dateString);
            return "Invalid date"; // or return a default string
        }

        const now = new Date();

        // Check if the date is within the last week
        if (isWithinInterval(date, { start: subDays(now, 7), end: now })) {
            // Format for last week
            return format(date, 'EEEE \'at\' HH:mm');
        } else {
            // Format for older dates
            return format(date, 'MMMM d, yyyy HH:mm');
        }
    };
    const handleSendMessage = async () => {
        if (isEmptyRichText(newMessage)) {
            toast.error("Message cannot be empty");
            return;
        }
        const ticketStatus = status || Ticket.status;
        try {
            setIsDisable(true)
            const messageData = {
                status: ticketStatus,
                userId: id,
                ticketId,
                sender: "admin",
                description: newMessage
            };

            const response = await updateMessageApi(messageData);

            if (response.success) {
                toast.success("Ticket updated successfully!");
                setNewMessage("");
                setStatus(ticketStatus);
                setTimeout(() => {
                    getTickets(false);
                }, 2000);
            } else {
                toast.error(response.msg);
            }
        } catch (error) {
            toast.error("Failed to submit the ticket.");
        } finally {
            setIsDisable(false)
        }
    };

    const handleDirectStatusChange = async (_ticket, nextStatus) => {
        if (!canChangeTicketStatus || !Ticket?._id || nextStatus === Ticket.status) {
            return;
        }

        setStatusUpdating(true);

        try {
            const response = await updateTicketStatusApi({
                userId: id,
                ticketId,
                status: nextStatus,
            });

            if (response.success) {
                toast.success("Ticket status updated and user notified by email");
                setTicket((prev) => ({ ...prev, status: nextStatus, updatedAt: new Date().toISOString() }));
                setStatus(nextStatus);
            } else {
                toast.error(response.msg || "Failed to update ticket status");
            }
        } catch (error) {
            console.error("Error updating ticket status:", error);
            toast.error("Failed to update ticket status");
        } finally {
            setStatusUpdating(false);
        }
    };

    const handleStartEdit = (message) => {
        setEditingMessageId(message._id);
        setEditingText(message.description);
    };

    const handleCancelEdit = () => {
        setEditingMessageId(null);
        setEditingText("");
    };

    const handleSaveEdit = async (messageId) => {
        if (isEmptyRichText(editingText)) {
            toast.error("Message cannot be empty");
            return;
        }
        try {
            setActionLoading(true);
            const response = await editTicketMessageApi(id, ticketId, messageId, {
                description: editingText.trim(),
            });
            if (response.success) {
                toast.success("Message updated");
                handleCancelEdit();
                getTickets(false);
            } else {
                toast.error(response.msg || "Failed to update message");
            }
        } catch {
            toast.error("Failed to update message");
        } finally {
            setActionLoading(false);
        }
    };

    const toggleHistory = (messageId) => {
        setOpenHistoryIds((prev) => ({
            ...prev,
            [messageId]: !prev[messageId],
        }));
    };

    const handleDeleteMessage = async (messageId) => {
        if (!window.confirm("Delete this message? This cannot be undone.")) {
            return;
        }
        try {
            setActionLoading(true);
            const response = await deleteTicketMessageApi(id, ticketId, messageId);
            if (response.success) {
                toast.success("Message deleted");
                if (editingMessageId === messageId) {
                    handleCancelEdit();
                }
                getTickets(false);
            } else {
                toast.error(response.msg || "Failed to delete message");
            }
        } catch {
            toast.error("Failed to delete message");
        } finally {
            setActionLoading(false);
        }
    };

    const isTicketClosed = () => {
        if (Ticket.status === "open") {
            return false; // Ticket cannot be closed if its status is "open"
        }
        const lastActivityDate = new Date(Ticket.updatedAt);
        const currentDate = new Date();
        const daysSinceLastActivity = differenceInDays(currentDate, lastActivityDate);
        return daysSinceLastActivity > 30; // Ticket is closed if last activity was more than 30 days ago
    };
    useEffect(() => {
        setTimeout(() => {
            if (messagesEndRef.current) {
                messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
            }
        }, 500);
    }, [messages]);

    return (
        <div className="admin dark-new-ui">
            <div className="bg-gray-900 min-h-screen">
                <SideBar state={Active} toggle={toggleBar} />
                
                <div className="bg-gray-900 relative min-h-screen w-full overflow-x-hidden px-4 transition-all duration-300 xl:px-10 lg:max-w-[calc(100%_-_280px)] lg:ms-[280px]">
                    <div className="mx-auto w-full max-w-7xl">
                        <AdminHeader toggle={toggleBar} pageName="Ticket Details" />

                        {isLoading ? (
                            <Box sx={{ width: '100%', p: 4 }}>
                                <LinearProgress
                                    sx={{
                                        height: 8,
                                        borderRadius: 4,
                                        backgroundColor: 'grey.800',
                                        '& .MuiLinearProgress-bar': {
                                            backgroundColor: 'primary.main'
                                        }
                                    }}
                                />
                                <Typography variant="h6" align="center" sx={{ mt: 2, color: 'grey.300' }}>
                                    Loading ticket details...
                                </Typography>
                            </Box>
                        ) : (
                            <Box sx={{ px: { xs: 2, md: 4 }, py: 3 }}>
                                {/* Back Button & Ticket Title */}
                                <Box sx={{ mb: 4, display: 'flex', alignItems: 'center', gap: 2 }}>
                                    <IconButton 
                                        onClick={() => Navigate("/admin/support")}
                                        sx={{ 
                                            color: 'primary.main',
                                            bgcolor: 'rgba(66, 165, 245, 0.1)',
                                            '&:hover': { bgcolor: 'rgba(66, 165, 245, 0.2)' }
                                        }}
                                    >
                                        <ArrowBackIcon />
                                    </IconButton>
                                    <Typography variant="h4" sx={{ color: 'white', fontWeight: 700, flex: 1 }}>
                                        {Ticket.title}
                                    </Typography>
                                    <InlineTicketStatusCell
                                        ticket={Ticket}
                                        onStatusChange={handleDirectStatusChange}
                                        saving={statusUpdating}
                                        disabled={!canChangeTicketStatus}
                                        chipSize="medium"
                                    />
                                </Box>

                                <Grid container spacing={3}>
                                    {/* Left Side: Messages */}
                                    <Grid item xs={12} md={8}>
                                        <Paper
                                            elevation={0}
                                            sx={{
                                                background: 'rgba(255, 255, 255, 0.02)',
                                                border: '1px solid rgba(255, 255, 255, 0.08)',
                                                borderRadius: 3,
                                                p: 3,
                                                mb: 3
                                            }}
                                        >
                                            <Typography variant="h6" sx={{ color: 'white', fontWeight: 600, mb: 3 }}>
                                                Messages
                                            </Typography>

                                            {/* Messages List */}
                                            <Stack spacing={3} sx={{ mb: 4 }}>
                                                {messages.map((message, index) => (
                                                    <Card
                                                        key={message._id || index}
                                                        elevation={0}
                                                        sx={{
                                                            background: message.sender === 'admin' 
                                                                ? 'linear-gradient(135deg, #1e3a5f 0%, #2d5a8c 100%)'
                                                                : 'linear-gradient(135deg, #1e1e1e 0%, #2d2d2d 100%)',
                                                            border: message.sender === 'admin'
                                                                ? '1px solid rgba(66, 165, 245, 0.2)'
                                                                : '1px solid rgba(255, 255, 255, 0.1)',
                                                            borderRadius: 2,
                                                            position: 'relative'
                                                        }}
                                                    >
                                                        <CardContent>
                                                            <Stack direction="row" spacing={2} alignItems="flex-start">
                                                                <Avatar
                                                                    src={message.sender === 'user' ? profile : adminDp}
                                                                    sx={{
                                                                        width: 48,
                                                                        height: 48,
                                                                        border: '2px solid',
                                                                        borderColor: message.sender === 'admin' ? 'primary.main' : 'grey.600'
                                                                    }}
                                                                >
                                                                    {message.sender === 'admin' ? <AdminIcon /> : <PersonIcon />}
                                                                </Avatar>
                                                                <Box sx={{ flex: 1 }}>
                                                                    <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                                                                        <Typography 
                                                                            variant="subtitle1" 
                                                                            sx={{ 
                                                                                color: 'white', 
                                                                                fontWeight: 600,
                                                                                textTransform: 'capitalize',
                                                                                cursor: message.sender === 'user' ? 'pointer' : 'default'
                                                                            }}
                                                                            onClick={message.sender === 'user' ? () => Navigate(`/admin/user/${TicketUser?._id}/general`) : undefined}
                                                                        >
                                                                            {message.sender === 'user' 
                                                                                ? (TicketUser ? `${TicketUser.firstName} ${TicketUser.lastName}` : 'User')
                                                                                : 'Support Team'
                                                                            }
                                                                        </Typography>
                                                                        <Stack direction="row" spacing={0.5} className="ticket-msg-actions">
                                                                            {message.sender === 'admin' && editingMessageId !== message._id && (
                                                                                <Button
                                                                                    size="small"
                                                                                    className="ticket-msg-action-btn ticket-msg-action-btn--edit"
                                                                                    onClick={() => handleStartEdit(message)}
                                                                                    disabled={actionLoading}
                                                                                    startIcon={<EditIcon />}
                                                                                >
                                                                                    Edit
                                                                                </Button>
                                                                            )}
                                                                            <Button
                                                                                size="small"
                                                                                className="ticket-msg-action-btn ticket-msg-action-btn--delete"
                                                                                onClick={() => handleDeleteMessage(message._id)}
                                                                                disabled={actionLoading}
                                                                                startIcon={<DeleteIcon />}
                                                                            >
                                                                                Delete
                                                                            </Button>
                                                                        </Stack>
                                                                    </Stack>
                                                                    {editingMessageId === message._id ? (
                                                                        <Box>
                                                                            <Box className="ticket-compose-quill" sx={{ mb: 1 }}>
                                                                                <ReactQuill
                                                                                    theme="snow"
                                                                                    value={editingText}
                                                                                    onChange={setEditingText}
                                                                                    modules={{
                                                                                        toolbar: [
                                                                                            ['bold', 'italic', 'underline'],
                                                                                            [{ list: 'ordered' }, { list: 'bullet' }],
                                                                                            [{ color: [] }],
                                                                                            ['link', 'clean'],
                                                                                        ],
                                                                                    }}
                                                                                />
                                                                            </Box>
                                                                            <Stack direction="row" spacing={1} className="ticket-msg-actions">
                                                                                <Button
                                                                                    size="small"
                                                                                    className="ticket-msg-action-btn ticket-msg-action-btn--save"
                                                                                    onClick={() => handleSaveEdit(message._id)}
                                                                                    disabled={actionLoading}
                                                                                    startIcon={<CheckIcon />}
                                                                                >
                                                                                    Save
                                                                                </Button>
                                                                                <Button
                                                                                    size="small"
                                                                                    className="ticket-msg-action-btn ticket-msg-action-btn--cancel"
                                                                                    onClick={handleCancelEdit}
                                                                                    disabled={actionLoading}
                                                                                    startIcon={<CloseIcon />}
                                                                                >
                                                                                    Cancel
                                                                                </Button>
                                                                            </Stack>
                                                                        </Box>
                                                                    ) : messageContainsHtml(message.description) ? (
                                                                        <Box
                                                                            className="ticket-message-html"
                                                                            sx={{
                                                                                color: 'rgba(255, 255, 255, 0.9)',
                                                                                mb: 2,
                                                                                lineHeight: 1.6,
                                                                                '& p': { margin: '0 0 8px' },
                                                                                '& ul, & ol': { pl: 2.5, mb: 1 },
                                                                            }}
                                                                            dangerouslySetInnerHTML={{ __html: message.description }}
                                                                        />
                                                                    ) : (
                                                                        <Typography 
                                                                            variant="body1" 
                                                                            sx={{ 
                                                                                color: 'rgba(255, 255, 255, 0.9)', 
                                                                                whiteSpace: 'pre-wrap',
                                                                                mb: 2,
                                                                                lineHeight: 1.6
                                                                            }}
                                                                        >
                                                                            {message.description}
                                                                        </Typography>
                                                                    )}
                                                                    <Typography variant="caption" sx={{ color: 'grey.400' }}>
                                                                        {formatDate(message.createdAt)}
                                                                        {message.editedAt ? " (edited)" : ""}
                                                                    </Typography>
                                                                    {Array.isArray(message.editHistory) && message.editHistory.length > 0 && (
                                                                        <Box className="ticket-edit-history" sx={{ mt: 1.5 }}>
                                                                            <Button
                                                                                size="small"
                                                                                className="ticket-msg-action-btn ticket-msg-action-btn--cancel"
                                                                                onClick={() => toggleHistory(message._id)}
                                                                                startIcon={<HistoryIcon />}
                                                                            >
                                                                                Edit history ({message.editHistory.length})
                                                                            </Button>
                                                                            {openHistoryIds[message._id] && (
                                                                                <Stack spacing={1.25} sx={{ mt: 1.25 }}>
                                                                                    {[...message.editHistory].reverse().map((entry, historyIndex) => (
                                                                                        <Box key={historyIndex} className="ticket-edit-history-item">
                                                                                            <Typography variant="caption" sx={{ color: 'grey.400', display: 'block', mb: 0.5 }}>
                                                                                                {formatDateNew(entry.editedAt)} · {entry.editedBy === "admin" ? "Support" : "User"}
                                                                                            </Typography>
                                                                                            <Typography
                                                                                                variant="body2"
                                                                                                sx={{ color: 'rgba(255, 255, 255, 0.78)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}
                                                                                            >
                                                                                                {entry.previousDescription}
                                                                                            </Typography>
                                                                                        </Box>
                                                                                    ))}
                                                                                </Stack>
                                                                            )}
                                                                        </Box>
                                                                    )}
                                                                </Box>
                                                            </Stack>
                                                        </CardContent>
                                                        
                                                        {/* Email Failure Indicator - Admin Only */}
                                                        {message.emailFailed && (
                                                            <Box
                                                                sx={{
                                                                    position: 'absolute',
                                                                    top: 8,
                                                                    right: 8,
                                                                    bgcolor: 'error.main',
                                                                    color: 'white',
                                                                    borderRadius: '50%',
                                                                    width: 24,
                                                                    height: 24,
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    justifyContent: 'center',
                                                                    fontSize: '12px',
                                                                    fontWeight: 'bold',
                                                                    border: '2px solid rgba(255, 255, 255, 0.1)',
                                                                    boxShadow: '0 2px 8px rgba(244, 67, 54, 0.3)'
                                                                }}
                                                                title="Email notification failed to send"
                                                            >
                                                                ⚠️
                                                            </Box>
                                                        )}
                                                    </Card>
                                                ))}
                                                <div ref={messagesEndRef} />
                                            </Stack>

                                            {/* Send Message Section */}
                                            <Divider sx={{ my: 3, borderColor: 'rgba(255, 255, 255, 0.08)' }} />
                                            
                                            <Typography variant="h6" sx={{ color: 'white', fontWeight: 600, mb: 2 }}>
                                                Send a Message
                                            </Typography>

                                            <Box className="ticket-compose-quill" sx={{ mb: 2 }}>
                                                <ReactQuill
                                                    theme="snow"
                                                    value={newMessage}
                                                    onChange={setNewMessage}
                                                    placeholder="Type your message here..."
                                                    modules={{
                                                        toolbar: [
                                                            ['bold', 'italic', 'underline'],
                                                            [{ list: 'ordered' }, { list: 'bullet' }],
                                                            [{ color: [] }],
                                                            ['link', 'clean'],
                                                        ],
                                                    }}
                                                />
                                            </Box>

                                            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 3 }}>
                                                <Button
                                                    variant="contained"
                                                    style={{ backgroundColor: '#f0f0f0', color: '#111 !important', textTransform: 'none', fontWeight: 600, boxShadow: 'none' }}
                                                    startIcon={<TemplateIcon />}
                                                    onClick={() => setTemplatesDialogOpen(true)}
                                                    sx={{
                                                        flex: 1,
                                                        bgcolor: '#f0f0f0',
                                                        color: '#111 !important',
                                                        textTransform: 'none',
                                                        fontWeight: 600,
                                                        boxShadow: 'none',
                                                        '&:hover': {
                                                            bgcolor: '#f0f0f0',
                                                            color: '#111 !important',
                                                            boxShadow: 'none',
                                                        },
                                                    }}
                                                >
                                                    Ticket Templates
                                                </Button>

                                            {canChangeTicketStatus && (
                                                <FormControl fullWidth sx={{ flex: 1 }} size="small">
                                                    <Select
                                                        value={status || Ticket.status || "open"}
                                                        onChange={(e) => setStatus(e.target.value)}
                                                        displayEmpty
                                                        sx={{
                                                            color: 'grey.100',
                                                            backgroundColor: 'rgba(255, 255, 255, 0.05)',
                                                            borderRadius: 2,
                                                            height: '40px',
                                                            '& .MuiOutlinedInput-notchedOutline': {
                                                                borderColor: 'rgba(255, 255, 255, 0.1)',
                                                            },
                                                            '&:hover .MuiOutlinedInput-notchedOutline': {
                                                                borderColor: 'rgba(255, 255, 255, 0.2)',
                                                            },
                                                            '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                                                                borderColor: 'primary.main',
                                                                borderWidth: '2px'
                                                            },
                                                            '& .MuiSvgIcon-root': {
                                                                color: 'grey.400',
                                                            }
                                                        }}
                                                    >
                                                        <MenuItem value="open">Open</MenuItem>
                                                        <MenuItem value="solved">Solved</MenuItem>
                                                        <MenuItem value="awaiting reply">Awaiting Reply</MenuItem>
                                                    </Select>
                                                </FormControl>
                                            )}
                                            </Stack>

                                            <Button
                                                fullWidth
                                                variant="contained"
                                                startIcon={<SendIcon />}
                                                onClick={handleSendMessage}
                                                disabled={isDisable}
                                                sx={{
                                                    background: 'linear-gradient(45deg, #1976d2, #42a5f5)',
                                                    color: 'white !important',
                                                    textTransform: 'none',
                                                    fontWeight: 600,
                                                    height: '48px',
                                                    borderRadius: 2,
                                                    boxShadow: '0 4px 12px rgba(33, 150, 243, 0.3)',
                                                    '&:hover': {
                                                        background: 'linear-gradient(45deg, #1565c0, #1e88e5)',
                                                        color: 'white !important',
                                                        boxShadow: '0 6px 16px rgba(33, 150, 243, 0.4)'
                                                    },
                                                    '&:disabled': {
                                                        background: 'grey.600 !important',
                                                        color: 'grey.400 !important'
                                                    }
                                                }}
                                            >
                                                {isDisable ? 'Submitting...' : 'Submit'}
                                            </Button>
                                        </Paper>
                                    </Grid>

                                    {/* Right Side: Ticket Info */}
                                    <Grid item xs={12} md={4}>
                                        <Paper
                                            elevation={0}
                                            sx={{
                                                background: 'rgba(255, 255, 255, 0.02)',
                                                border: '1px solid rgba(255, 255, 255, 0.08)',
                                                borderRadius: 3,
                                                p: 3,
                                                position: 'sticky !important',
                                                top: '100px !important',
                                                height: 'fit-content !important',
                                                maxHeight: 'calc(100vh - 120px) !important',
                                                overflow: 'auto !important',
                                                zIndex: '10 !important'
                                            }}
                                        >
                                            <Typography variant="h6" sx={{ color: 'white', fontWeight: 600, mb: 3 }}>
                                                Ticket Information
                                            </Typography>

                                            <Stack spacing={2.5}>
                                                {/* Ticket ID */}
                                                <Box>
                                                    <Typography variant="caption" sx={{ color: 'grey.400', textTransform: 'uppercase', fontWeight: 600 }}>
                                                        Ticket ID
                                                    </Typography>
                                                    <Typography variant="body1" sx={{ color: 'primary.light', fontWeight: 600, mt: 0.5 }}>
                                                        {Ticket.ticketId}
                                                    </Typography>
                                                </Box>

                                                <Divider sx={{ borderColor: 'rgba(255, 255, 255, 0.08)' }} />

                                                {/* User Info */}
                                                {TicketUser && (
                                                    <Box 
                                                        onClick={() => Navigate(`/admin/user/${TicketUser._id}/general`)}
                                                        sx={{ 
                                                            cursor: 'pointer',
                                                            p: 2,
                                                            borderRadius: 2,
                                                            background: 'rgba(66, 165, 245, 0.05)',
                                                            border: '1px solid rgba(66, 165, 245, 0.1)',
                                                            transition: 'all 0.2s',
                                                            '&:hover': {
                                                                background: 'rgba(66, 165, 245, 0.1)',
                                                                border: '1px solid rgba(66, 165, 245, 0.2)',
                                                            }
                                                        }}
                                                    >
                                                        <Stack direction="row" spacing={2} alignItems="center">
                                                            <Avatar 
                                                                src={profile}
                                                                sx={{ 
                                                                    width: 40, 
                                                                    height: 40,
                                                                    border: '2px solid rgba(66, 165, 245, 0.3)'
                                                                }}
                                                            >
                                                                <PersonIcon />
                                                            </Avatar>
                                                            <Box>
                                                                <Typography variant="body2" sx={{ color: 'white', fontWeight: 600 }}>
                                                                    {TicketUser.firstName} {TicketUser.lastName}
                                                                </Typography>
                                                                <Typography variant="caption" sx={{ color: 'grey.400' }}>
                                                                    {TicketUser.email}
                                                                </Typography>
                                                            </Box>
                                                        </Stack>
                                                    </Box>
                                                )}

                                                <Divider sx={{ borderColor: 'rgba(255, 255, 255, 0.08)' }} />

                                                {/* Created Date */}
                                                <Box>
                                                    <Typography variant="caption" sx={{ color: 'grey.400', textTransform: 'uppercase', fontWeight: 600 }}>
                                                        Created
                                                    </Typography>
                                                    <Typography variant="body2" sx={{ color: 'white', mt: 0.5 }}>
                                                        {formatDateNew(Ticket.createdAt)}
                                                    </Typography>
                                                </Box>

                                                {/* Last Activity */}
                                                <Box>
                                                    <Typography variant="caption" sx={{ color: 'grey.400', textTransform: 'uppercase', fontWeight: 600 }}>
                                                        Last Activity
                                                    </Typography>
                                                    <Typography variant="body2" sx={{ color: 'white', mt: 0.5 }}>
                                                        {formatDateNew(Ticket.updatedAt)}
                                                    </Typography>
                                                </Box>

                                                <Divider sx={{ borderColor: 'rgba(255, 255, 255, 0.08)' }} />

                                                {/* Status */}
                                                <Box>
                                                    <Typography variant="caption" sx={{ color: 'grey.400', textTransform: 'uppercase', fontWeight: 600, mb: 1, display: 'block' }}>
                                                        Current Status
                                                    </Typography>
                                                    <InlineTicketStatusCell
                                                        ticket={Ticket}
                                                        onStatusChange={handleDirectStatusChange}
                                                        saving={statusUpdating}
                                                        disabled={!canChangeTicketStatus}
                                                        chipSize="medium"
                                                        fullWidth
                                                    />
                                                </Box>

                                                {/* Messages Count */}
                                                <Box>
                                                    <Typography variant="caption" sx={{ color: 'grey.400', textTransform: 'uppercase', fontWeight: 600 }}>
                                                        Total Messages
                                                    </Typography>
                                                    <Typography variant="h4" sx={{ color: 'primary.light', fontWeight: 700, mt: 0.5 }}>
                                                        {messages.length}
                                                    </Typography>
                                                </Box>
                                            </Stack>
                                        </Paper>
                                    </Grid>
                                </Grid>
                            </Box>
                        )}
                    </div>
                </div>
            </div>

            <EmailTemplatesDialog
                open={templatesDialogOpen}
                onClose={() => setTemplatesDialogOpen(false)}
                isSuperAdmin={isSuperAdmin}
                staffUser={staffProfile || Admin}
                recipient={TicketUser}
                mode="ticket"
                onApplyTemplate={(content) => setNewMessage(content)}
            />
        </div>
    );
}

export default AllTicket;

import React, { useContext, useEffect, useRef, useState } from 'react';
import './AllTicket.css';
import profile from "../../../assets/images/7309681.jpg";
import adminDp from "../../../assets/admin.jpg";
import { format, isWithinInterval, subDays, differenceInDays } from 'date-fns';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Spinner } from 'react-bootstrap';
import { useAuthUser } from 'react-auth-kit';
import { useSelector } from 'react-redux';
import Nav from '../../layouts/nav';
import RightWalletBar from '../../layouts/nav/RightWalletBar_my';
import Footer from '../../layouts/Footer';
import { ThemeContext } from '../../../context/ThemeContext';
import { getIndivTicketApi, updateMessageApi, editTicketMessageApi } from '../../../Api/Service';
import { messageContainsHtml } from '../../../utils/emailTemplateUtils';
import { toast } from 'react-toastify';
import {
  TicketAttachmentInput,
  TicketMessageAttachments,
  TicketEditAttachments,
  appendTicketAttachments,
} from '../../components/tickets/TicketAttachments';

const USER_MESSAGE_EDIT_WINDOW_MS = 15 * 60 * 1000;

const canUserEditMessage = (message) => {
    if (!message || message.sender !== "user" || !message.createdAt) return false;
    const createdAt = new Date(message.createdAt).getTime();
    if (Number.isNaN(createdAt)) return false;
    return Date.now() - createdAt <= USER_MESSAGE_EDIT_WINDOW_MS;
};

const AllTicket = () => {
    const { sidebariconHover, headWallet } = useContext(ThemeContext);
    const sideMenu = useSelector((state) => state.sideMenu);
    const messagesEndRef = useRef(null);
    let Navigate = useNavigate()
    const authUser = useAuthUser();
    const [isDisable, setIsDisable] = useState(false);
    const [Admin, setAdmin] = useState("");
    const [isLoading, setisLoading] = useState(true);
    const [Ticket, setTicket] = useState({});
    let { ticketId } = useParams()
    const [messages, setMessages] = useState([]); // New state for messages
    const [newMessage, setNewMessage] = useState("");
    const [replyAttachments, setReplyAttachments] = useState([]);
    const [editingMessageId, setEditingMessageId] = useState(null);
    const [editingText, setEditingText] = useState("");
    const [editingRemovedAttachmentIndexes, setEditingRemovedAttachmentIndexes] = useState([]);
    const [actionLoading, setActionLoading] = useState(false);
    const [, setEditTick] = useState(0);

    useEffect(() => {
        const interval = setInterval(() => setEditTick((t) => t + 1), 30000);
        return () => clearInterval(interval);
    }, []);
    const getTickets = async () => {
        try {
            // setisLoading(true);

            let id = authUser().user._id

            const indivTicket = await getIndivTicketApi(id, ticketId);

            if (indivTicket.success) {
                if (indivTicket.ticket.length <= 0 || indivTicket === undefined) {
                    Navigate("/support")
                    return
                }
                setisLoading(false);
                const ticketData = indivTicket.ticket[0];setTicket(ticketData);
                setMessages(ticketData.ticketContent);return;
            } else {
                toast.dismiss();
                toast.error(indivTicket.msg);
            }
        } catch (error) {
            toast.dismiss();
            toast.error(error);
        } finally {
        }
    };
    useEffect(() => {
        if (authUser().user.role === "user") {
            setAdmin(authUser().user);
            getTickets()
            return;
        } else if (authUser().user.role === "admin"|| authUser().user.role === "superadmin"|| authUser().user.role === "subadmin") {
            Navigate("/admin/dashboard");
            return;
        }}, []);
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
    const renderMessageContent = (description) => {
        const text = String(description || "").trim();
        if (!text || text === "(Attachment)") return null;

        if (messageContainsHtml(description)) {
            return (
                <div
                    className="ticket-message-html card-text py-4 text-white mb-0"
                    dangerouslySetInnerHTML={{ __html: description }}
                />
            );
        }

        return (
            <p className="card-text py-4 text-white mb-0" style={{ whiteSpace: 'pre-wrap' }}>
                {description}
            </p>
        );
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
        if (!newMessage.trim() && replyAttachments.length === 0) {
            toast.error("Add a message or at least one attachment");
            return;
        }

        try {
            setIsDisable(true)
            const formData = new FormData();
            formData.append("status", "open");
            formData.append("userId", authUser().user._id);
            formData.append("ticketId", ticketId);
            formData.append("sender", "user");
            formData.append("description", newMessage.trim());
            appendTicketAttachments(formData, replyAttachments);

            const response = await updateMessageApi(formData);

            if (response.success) {
                toast.success("Ticket updated successfully!");
                setNewMessage("");
                setReplyAttachments([]);
                getTickets()
            } else {
                toast.error(response.msg);
            }
        } catch (error) {
            toast.error("Failed to submit the ticket.");
        } finally {
            setIsDisable(false)

        }
    };

    const handleStartEdit = (message) => {
        if (!canUserEditMessage(message)) {
            toast.error("Messages can only be edited within 15 minutes of sending.");
            return;
        }
        setEditingMessageId(message._id);
        setEditingText(message.description === "(Attachment)" ? "" : message.description);
        setEditingRemovedAttachmentIndexes([]);
    };

    const handleCancelEdit = () => {
        setEditingMessageId(null);
        setEditingText("");
        setEditingRemovedAttachmentIndexes([]);
    };

    const handleRemoveEditAttachment = (index) => {
        setEditingRemovedAttachmentIndexes((prev) =>
            prev.includes(index) ? prev : [...prev, index]
        );
    };

    const handleSaveEdit = async (message) => {
        const remainingAttachments =
            (message.attachments?.length || 0) - editingRemovedAttachmentIndexes.length;

        if (!editingText.trim() && remainingAttachments <= 0) {
            toast.error("Message cannot be empty");
            return;
        }
        try {
            setActionLoading(true);
            const userId = authUser().user._id;
            const response = await editTicketMessageApi(userId, ticketId, message._id, {
                description: editingText.trim(),
                removedAttachmentIndexes: editingRemovedAttachmentIndexes,
            });
            if (response.success) {
                toast.success("Message updated");
                handleCancelEdit();
                getTickets();
            } else {
                toast.error(response.msg || "Failed to update message");
            }
        } catch {
            toast.error("Failed to update message");
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
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages]);

    const ticketContent = (
        <div className="user-ticket-page saasasa">
            <div className="row">
                <div className="col-md-8 mb-3">
                    <h2 className="mb-4 fla text-white">
                        <span
                            style={{ marginRight: "20px", cursor: "pointer" }}
                            onClick={() => Navigate("/support")}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => e.key === "Enter" && Navigate("/support")}
                        >
                            <i style={{ fontSize: "23px" }} className="fa-solid fa-arrow-left" />
                        </span>
                        {Ticket.title}
                        {Ticket.status === "open" ? (
                            <span className="badge-open badgea">{Ticket.status}</span>
                        ) : Ticket.status === "solved" ? (
                            <span className="badge-solved badgea">{Ticket.status}</span>
                        ) : Ticket.status === "awaiting reply" ? (
                            <span className="bg-warning badgea badge">{Ticket.status}</span>
                        ) : (
                            "Unknown"
                        )}
                    </h2>
                    {messages.map((message, index) => (
                        <div key={message._id || index} className="mb-4 p-4 tckt0mn">
                            <div className="d-flex align-items-start">
                                <div className="w-100">
                                    <div className="d-flex justify-content-between align-items-start gap-2">
                                        {message.sender === "user" ? (
                                            <h5 className="card-title text-white mb-0" style={{ display: "flex", alignItems: "center", textTransform: "capitalize" }}>
                                                <img src={profile} alt="Profile" className="profile-pic me-3" />
                                                <span>{Admin.firstName} {Admin.lastName}</span>
                                            </h5>
                                        ) : message.sender === "admin" ? (
                                            <h5 className="card-title text-white mb-0" style={{ display: "flex", alignItems: "center", textTransform: "capitalize" }}>
                                                <img src={adminDp} alt="Profile" className="profile-pic me-3" />
                                                <span>Support Team</span>
                                            </h5>
                                        ) : null}
                                        {message.sender === "user" && editingMessageId !== message._id && !isTicketClosed() && canUserEditMessage(message) && (
                                            <button
                                                type="button"
                                                className="ticket-user-action-btn ticket-user-action-btn--edit"
                                                onClick={() => handleStartEdit(message)}
                                                disabled={actionLoading}
                                            >
                                                Edit
                                            </button>
                                        )}
                                    </div>
                                    {editingMessageId === message._id ? (
                                        <div className="py-3">
                                            <textarea
                                                className="form-control new-bg-light mb-2"
                                                rows="3"
                                                value={editingText}
                                                onChange={(e) => setEditingText(e.target.value)}
                                            />
                                            <TicketEditAttachments
                                                attachments={message.attachments}
                                                removedIndexes={editingRemovedAttachmentIndexes}
                                                onRemove={handleRemoveEditAttachment}
                                                disabled={actionLoading}
                                            />
                                            <button
                                                type="button"
                                                className="ticket-user-action-btn ticket-user-action-btn--save me-2"
                                                onClick={() => handleSaveEdit(message)}
                                                disabled={actionLoading}
                                            >
                                                Save
                                            </button>
                                            <button
                                                type="button"
                                                className="ticket-user-action-btn ticket-user-action-btn--cancel"
                                                onClick={handleCancelEdit}
                                                disabled={actionLoading}
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    ) : (
                                        <>
                                            {renderMessageContent(message.description)}
                                            <TicketMessageAttachments
                                                attachments={message.attachments}
                                                userId={authUser().user._id}
                                                ticketId={ticketId}
                                                messageId={message._id}
                                            />
                                        </>
                                    )}
                                    <p className="card-text mb-0">
                                        <small className="ticket-msg-time">{formatDate(message.createdAt)}</small>
                                    </p>
                                </div>
                            </div>
                            <div ref={messagesEndRef} />
                        </div>
                    ))}

                    {isTicketClosed() ? (
                        <h5 className="font-bold text-white">
                            This request is closed for comments. You can{" "}
                            <Link style={{ textDecoration: "underline" }} to="/create-ticket">create a new ticket</Link>.
                        </h5>
                    ) : (
                        <>
                            <div className="form-group mb-4 mt-5">
                                <p className="bold mb-1 text-white">Send a Message:</p>
                                <textarea
                                    value={newMessage}
                                    onChange={(e) => setNewMessage(e.target.value)}
                                    className="form-control new-bg-light"
                                    id="message"
                                    rows="3"
                                    placeholder="Type your message here..."
                                />
                            </div>
                            <TicketAttachmentInput
                                files={replyAttachments}
                                onChange={setReplyAttachments}
                                disabled={isDisable}
                            />
                            <button disabled={isDisable} onClick={handleSendMessage} className="btn btn-primary mt-3">
                                {isDisable ? (
                                    <>
                                        <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" /> Submitting...
                                    </>
                                ) : (
                                    "Submit"
                                )}
                            </button>
                        </>
                    )}
                </div>

                <div className="col-md-4">
                    <h2 className="mb-4 text-white">Ticket Info</h2>
                    <div className="card mb-4 border-infoas">
                        <div className="card-body">
                            <p><strong>ID:</strong> <span>{Ticket.ticketId}</span></p>
                            <p><strong>Created:</strong> <span>{formatDateNew(Ticket.createdAt)}</span></p>
                            <p><strong>Last Activity:</strong> <span>{formatDateNew(Ticket.updatedAt)}</span></p>
                            <p>
                                <strong>Status:</strong>{" "}
                                {Ticket.status === "open" ? (
                                    <span className="badge-open badgea">{Ticket.status}</span>
                                ) : Ticket.status === "solved" ? (
                                    <span className="badge-solved badgea">{Ticket.status}</span>
                                ) : Ticket.status === "awaiting reply" ? (
                                    <span className="bg-warning badgea badge">{Ticket.status}</span>
                                ) : (
                                    "Unknown"
                                )}
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );

    return (
        <>
            {isLoading ? (
                <div className="d-flex new-bg-light justify-content-center align-items-center" style={{ height: "100vh" }}>
                    <Spinner animation="border" variant="primary" />
                </div>
            ) : (
                <div
                    id="main-wrapper"
                    className={`show wallet-open ${headWallet ? "" : "active"} ${sidebariconHover ? "iconhover-toggle" : ""} ${sideMenu ? "menu-toggle" : ""}`}
                >
                    <Nav />
                    <RightWalletBar />
<div className="content-body new-bg-light">
                        <div className="container-fluid" style={{ minHeight: window.screen.height - 45, paddingBottom: "3rem", paddingTop: "1.5rem" }}>
                            {ticketContent}
                        </div>
                    </div>
                    <Footer />
                </div>
            )}
        </>
    );
}

export default AllTicket;

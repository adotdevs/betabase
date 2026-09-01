import React, { useEffect, useRef, useState } from 'react';
import Log from "../../assets/images/img/log.jpg";
import './card.css';
import { deleteAllNotificationsApi, deleteNotificationApi, getNotificationsApi, updateNotificationStatusApi, userCryptoCardApi } from '../../Api/Service';
import { toast } from 'react-toastify';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthUser } from 'react-auth-kit';
import { IconButton, Tooltip, CircularProgress, Button } from '@mui/material';
import { useAdminTheme } from './theme/adminTheme';
import headerStyles from './adminHeader.module.css';
import {
  Notifications as NotificationsIcon,
  NotificationsActive as NotificationsActiveIcon,
  Delete as DeleteIcon,
  DeleteSweep as DeleteSweepIcon,
  MarkEmailRead as MarkEmailReadIcon,
  MarkEmailUnread as MarkEmailUnreadIcon,
  Email as EmailIcon,
  Schedule as ScheduleIcon,
  ExpandMore as ExpandMoreIcon,
  CreditCard as CreditCardIcon,
  Support as SupportIcon,
  VerifiedUser as VerifiedUserIcon,
  AccountBalanceWallet as AccountBalanceWalletIcon,
  AccountBalance as AccountBalanceIcon,
  CurrencyBitcoin as CurrencyBitcoinIcon
} from '@mui/icons-material';

const AdminHeader = (props) => {
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [isDisable, setisDisable] = useState(false);
    const [isLoading, setisLoading] = useState(false);
    const [notificationsData, setnotificationsData] = useState([]);
    const [hasUnread, setHasUnread] = useState(false);
    const [temporaryUser, settemporaryUser] = useState(null);
    const [isAdmin, setisAdmin] = useState(null);
    const dropdownRef = useRef(null);
    let Navigate = useNavigate();
    const [modal3, setModal3] = useState(false);

    // Pagination state
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [hasMore, setHasMore] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);

    // Form state for crypto card
    const [errors, setErrors] = useState({});
    const [formData, setFormData] = useState({
        cardNumber: "",
        cardHolder: "",
        expiryDate: "",
        cvv: ""
    });

    let authUser = useAuthUser();
    const adminTheme = useAdminTheme();

    const notifications = async (page = 1, limit = 10, loadMore = false) => {
        try {
            if (loadMore) {
                setLoadingMore(true);
            } else {
                setisLoading(true);
            }
            
            const response = await getNotificationsApi({ page, limit });

            if (response.success) {
                const { notifications: newNotifications, pagination } = response;
                
                setCurrentPage(pagination.currentPage);
                setTotalPages(pagination.totalPages);
                setHasMore(pagination.hasMore);
                
                const unreadExists = newNotifications.some(n => n.isRead === false);
                setHasUnread(unreadExists);

                if (loadMore) {
                    setnotificationsData(prev => [...prev, ...newNotifications]);
                } else {
                    setnotificationsData(newNotifications);
                }
            } else {
                toast.error(response.msg);
            }
        } catch (error) {
            console.error('Notification fetch error:', error);
            toast.error('Failed to load notifications');
        } finally {
            setisLoading(false);
            setLoadingMore(false);
        }
    };
    
    const loadMoreNotifications = () => {
        if (!loadingMore && hasMore) {
            notifications(currentPage + 1, 10, true);
        }
    };

    let markAsRead = async (id, status) => {
        setisDisable(true);
        const updateNotificationStatus = await updateNotificationStatusApi(id, status);

        if (updateNotificationStatus.success) {
            setnotificationsData((prevData) => {
                const updated = prevData.map((n) =>
                    n._id === id ? { ...n, isRead: status } : n
                );
                const anyUnread = updated.some(n => !n.isRead);
                setHasUnread(anyUnread);
                return updated;
            });
        } else {
            toast.error("Failed to update notification status");
        }
        setisDisable(false);
    };

    const deleteNotification = async (id) => {
        try {
            setisDisable(true);
            const response = await deleteNotificationApi(id);

            if (response.success) {
                setnotificationsData(prevData => {
                    const updated = prevData.filter(n => n._id !== id);
                    const anyUnread = updated.some(n => !n.isRead);
                    setHasUnread(anyUnread);
                    return updated;
                });
                toast.success("Notification deleted successfully");
            } else {
                toast.error(response.msg);
            }
        } catch (error) {
            toast.error("Error deleting notification");
        } finally {
            setisDisable(false);
        }
    };

    const deleteAllNotifications = async () => {
        try {
            setisDisable(true);
            const response = await deleteAllNotificationsApi();

            if (response.success) {
                setnotificationsData([]);
                setHasUnread(false);
                toast.success("All notifications deleted successfully");
            } else {
                toast.error(response.msg);
            }
        } catch (error) {
            toast.error("Error deleting all notifications");
        } finally {
            setisDisable(false);
        }
    };

    let toggleModelOpen = async (notification) => {
        setFormData({
            cardNumber: "",
            cardHolder: notification.userName || "",
            expiryDate: "",
            cvv: ""
        });
        settemporaryUser(notification);
        setModal3(true);
    };

    let toggleModelClose = () => {
        settemporaryUser(null);
        setModal3(false);
        setErrors({});
    };

    const timeAgo = (date) => {
        const seconds = Math.floor((new Date() - new Date(date)) / 1000);
        const intervals = [
            { label: 'year', seconds: 31536000 },
            { label: 'month', seconds: 2592000 },
            { label: 'week', seconds: 604800 },
            { label: 'day', seconds: 86400 },
            { label: 'hour', seconds: 3600 },
            { label: 'minute', seconds: 60 },
            { label: 'second', seconds: 1 }
        ];

        for (const interval of intervals) {
            const count = Math.floor(seconds / interval.seconds);
            if (count >= 1) {
                return `${count} ${interval.label}${count > 1 ? 's' : ''} ago`;
            }
        }
        return 'just now';
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
        setErrors(prev => ({ ...prev, [name]: '' }));
    };

    const handleSubmit = async () => {
        const newErrors = {};
        if (!formData.cardNumber) newErrors.cardNumber = "Card number is required";
        if (!formData.cardHolder) newErrors.cardHolder = "Card holder is required";
        if (!formData.expiryDate) newErrors.expiryDate = "Expiry date is required";
        if (!formData.cvv) newErrors.cvv = "CVV is required";

        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors);
            return;
        }

        try {
            setisDisable(true);
            const response = await userCryptoCardApi({
                userId: temporaryUser.userId,
                ticketId: temporaryUser._id,
                cardNumber: formData.cardNumber,
                cardName: formData.cardHolder,
                cardExpiry: formData.expiryDate,
                cardCvv: formData.cvv,
            });
            if (response.success) {
                toast.success(response.msg || "Card created successfully!");
                toggleModelClose();
                notifications(1, 10);
            } else {
                toast.error(response.msg || "Failed to activate card");
            }
        } catch (error) {
            toast.error(error?.response?.data?.msg || error?.message || "Error creating card");
        } finally {
            setisDisable(false);
        }
    };

    useEffect(() => {
        notifications(1, 10);
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    useEffect(() => {
        if (authUser().user.role === "admin") {
            setisAdmin("admin");
        } else if (authUser().user.role === "superadmin") {
            setisAdmin("superadmin");
        } else if (authUser().user.role === "subadmin") {
            setisAdmin("subadmin");
        } else {
            setisAdmin(null);
        }
    }, []);

    // Render notification item
    const renderNotificationItem = (notification, index) => {
        const getNotificationIcon = (type) => {
            switch (type) {
                case "card_request":
                    return <CreditCardIcon />;
                case "ticket_message":
                    return <SupportIcon />;
                case "KYC_request":
                    return <VerifiedUserIcon />;
                case "withdraw_request":
                    return <AccountBalanceWalletIcon />;
                case "loan_request":
                    return <AccountBalanceIcon />;
                case "coin_activation_request":
                    return <CurrencyBitcoinIcon />;
                default:
                    return <NotificationsIcon />;
            }
        };

        const getAvatarClass = (type) => {
            switch (type) {
                case "card_request":
                    return "card";
                case "ticket_message":
                    return "ticket";
                case "KYC_request":
                    return "kyc";
                case "withdraw_request":
                    return "withdraw";
                case "loan_request":
                    return "kyc";
                case "coin_activation_request":
                    return "coin-activation";
                default:
                    return "card";
            }
        };

        const isUnread = !notification.isRead;
        const linkPath = 
            notification.type === "card_request" ? `/admin/users/${notification.userId}/crypto-card` :
            notification.type === "ticket_message" ? `/admin/ticket/user/${notification.userId}/${notification.ticketId}` :
            notification.type === "KYC_request" ? `/admin/users/${notification.userId}/verifications` :
            notification.type === "loan_request" ? `/admin/users/${notification.userId}/loan-application` :
            notification.type === "coin_activation_request" ? `/admin/users/${notification.userId}/assets` :
            notification.type === "withdraw_request" ? `/admin/users/${notification.userId}/transactions` :
            `/admin/dashboard`;

        const handleClick = () => {
            if (notification.type === "card_request") {
                toggleModelOpen(notification);
            } else if (linkPath) {
                Navigate(linkPath);
                markAsRead(notification._id, true);
            }
        };

        return (
            <div 
                key={index} 
                className={`${headerStyles.item} ${isUnread ? headerStyles.unread : ''} notification-item ${isUnread ? 'unread' : ''}`}
                onClick={handleClick}
            >
                <div className={`${headerStyles.avatarIcon} notification-avatar ${getAvatarClass(notification.type)}`}>
                    {getNotificationIcon(notification.type)}
                </div>
                
                <div className="notification-details">
                    <div className={`${headerStyles.itemMessage} notification-message`}>
                        {notification.content}
                    </div>
                    
                    <div className={`${headerStyles.itemMeta} notification-meta`}>
                        <Link 
                            to={`/admin/user/${notification.userId}/general`}
                            className="notification-email text-white"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <EmailIcon style={{ fontSize: 14 }} />
                            {notification.userEmail || 'N/A'}
                        </Link>
                        
                        {notification.status && (
                            <span className={`notification-status-chip ${notification.status.toLowerCase()}`}>
                                {notification.status}
                            </span>
                        )}
                        
                        <span className="notification-time">
                            <ScheduleIcon style={{ fontSize: 12 }} />
                            {timeAgo(notification.createdAt)}
                        </span>
                    </div>
                </div>
                
                <div className={`${headerStyles.itemActions} notification-actions`}>
                    <Tooltip title={isUnread ? "Mark as Read" : "Mark as Unread"} arrow>
                        <button
                            className={`${headerStyles.actionBtn} notification-action-btn mark-read`}
                            disabled={isDisable}
                            onClick={(e) => {
                                e.stopPropagation();
                                markAsRead(notification._id, !isUnread);
                            }}
                        >
                            {isUnread ? <MarkEmailReadIcon /> : <MarkEmailUnreadIcon />}
                        </button>
                    </Tooltip>
                    
                    <Tooltip title="Delete Notification" arrow>
                        <button
                            className={`${headerStyles.actionBtn} notification-action-btn delete`}
                            disabled={isDisable}
                            onClick={(e) => {
                                e.stopPropagation();
                                deleteNotification(notification._id);
                            }}
                        >
                            <DeleteIcon />
                        </button>
                    </Tooltip>
                </div>
            </div>
        );
    };

    // Skeleton Loader
    const renderSkeleton = () => (
        <div className={headerStyles.skelList} aria-hidden="true">
            {[1, 2, 3, 4].map((i) => (
                <div key={i} className={headerStyles.skelItem}>
                    <span className={headerStyles.skelAvatar} />
                    <div className={headerStyles.skelContent}>
                        <span className={headerStyles.skelLine} />
                        <span className={`${headerStyles.skelLine} ${headerStyles.skelShort}`} />
                        <span className={`${headerStyles.skelLine} ${headerStyles.skelMed}`} />
                    </div>
                </div>
            ))}
        </div>
    );

    return (
        <>
            <div className={`${headerStyles.bar} relative topakd z-50`}>
                <button 
                    onClick={() => Navigate(-1)} 
                    type="button" 
                    className={`${headerStyles.iconBtn} ${headerStyles.desktopBack} groupas for-desk`}
                    aria-label="Go back"
                >
                    <svg className={headerStyles.headerIcon} viewBox="0 0 24 24" aria-hidden="true">
                        <path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M15 18l-6-6 6-6" />
                    </svg>
                </button>

                <button 
                    onClick={props.toggle} 
                    type="button" 
                    className={`${headerStyles.iconBtn} ${headerStyles.mobileMenu} groupas for-mbl`}
                    aria-label="Open navigation"
                >
                    <svg className={headerStyles.headerIcon} viewBox="0 0 24 24" aria-hidden="true">
                        <path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16" />
                    </svg>
                </button>

                <h1 className={`${headerStyles.title} font-heading groupas`}>
                    {props.pageName}
                </h1>

                <div className={headerStyles.actions}>
                    {adminTheme ? (
                        <div className={headerStyles.themeSwitch} role="group" aria-label="Admin theme">
                            <button
                                type="button"
                                className={adminTheme.preference === "system" ? headerStyles.themeOn : headerStyles.themeBtn}
                                onClick={() => adminTheme.setThemePreference("system")}
                            >
                                System
                            </button>
                            <button
                                type="button"
                                className={adminTheme.preference === "light" ? headerStyles.themeOn : headerStyles.themeBtn}
                                onClick={() => adminTheme.setThemePreference("light")}
                            >
                                Light
                            </button>
                            <button
                                type="button"
                                className={adminTheme.preference === "dark" ? headerStyles.themeOn : headerStyles.themeBtn}
                                onClick={() => adminTheme.setThemePreference("dark")}
                            >
                                Dark
                            </button>
                        </div>
                    ) : null}
                    {/* Notification Dropdown */}
                    {(isAdmin === "admin" || isAdmin === "superadmin" || isAdmin === "subadmin") && (
                        <div ref={dropdownRef} className={headerStyles.bellWrap}>
                            <Tooltip title="Notifications" arrow>
                                <IconButton
                                    onClick={() => setDropdownOpen(!dropdownOpen)}
                                    className={`${headerStyles.bellBtn} notification-bell-btn`}
                                >
                                    {hasUnread && <span className={`${headerStyles.badge} notification-badge`}>!</span>}
                                    {hasUnread ? 
                                        <NotificationsActiveIcon style={{ fontSize: 22 }} /> : 
                                        <NotificationsIcon style={{ fontSize: 22 }} />
                                    }
                                </IconButton>
                            </Tooltip>

                            {dropdownOpen && (
                                <div className={`${headerStyles.dropdown} notification-dropdown`}>
                                    {/* Header */}
                                    <div className={`${headerStyles.dropHead} notification-header`}>
                                        <div className="notification-header-left">
                                            <div className="notification-header-icon">
                                                <NotificationsIcon style={{ fontSize: 20, color: '#64b5f6' }} />
                                            </div>
                                            <h3 className={`${headerStyles.dropTitle} notification-header-title`}>Notifications</h3>
                                            {notificationsData.length > 0 && (
                                                <span className={`${headerStyles.dropCount} notification-count-badge`}>
                                                    {notificationsData.length}
                                                </span>
                                            )}
                                        </div>
                                        {notificationsData.length > 0 && isAdmin !== "subadmin" && (
                                            <Tooltip title="Delete All Notifications" arrow>
                                                <button 
                                                    className={`${headerStyles.deleteAll} delete-all-btn`}
                                                    onClick={deleteAllNotifications}
                                                    disabled={isDisable}
                                                >
                                                    <DeleteSweepIcon style={{ fontSize: 18 }} />
                                                    Delete All
                                                </button>
                                            </Tooltip>
                                        )}
                                    </div>

                                    {/* Content */}
                                    <div className={`${headerStyles.dropBody} notification-content`}>
                                        {isLoading ? (
                                            renderSkeleton()
                                        ) : notificationsData.length === 0 ? (
                                            <div className={`${headerStyles.empty} notification-empty`}>
                                                <NotificationsIcon className="notification-empty-icon" />
                                                <h4 className="notification-empty-title">No notifications yet</h4>
                                                <p className="notification-empty-subtitle">You're all caught up!</p>
                                            </div>
                                        ) : (
                                            notificationsData.map((notification, index) => 
                                                renderNotificationItem(notification, index)
                                            )
                                        )}
                                    </div>
                                    
                                    {/* Load More Button */}
                                    {hasMore && !isLoading && (
                                        <div className={`${headerStyles.loadMore} load-more-container`}>
                                            <button
                                                className={`${headerStyles.loadMoreBtn} load-more-btn`}
                                                onClick={loadMoreNotifications}
                                                disabled={loadingMore}
                                            >
                                                {loadingMore ? (
                                                    <div  className='flex items-center justify-center'>
                                                        <CircularProgress size={16} style={{ color: 'white', marginRight: 8 }} />
                                                        Loading...
                                                    </div>
                                                ) : (
                                                    <div className='flex items-center justify-center'>
                                                        <ExpandMoreIcon style={{ fontSize: 20 }} />
                                                       <p> Load More ({currentPage}/{totalPages})</p>
                                                    </div>
                                                )}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* User Avatar */}
                    <div className="group groupas inline-flex items-center justify-center text-right">
                        <div className="relative h-9 w-9 text-left">
                            <button type="button" className={headerStyles.iconBtn}>
                                <img src={Log} className={headerStyles.avatar} alt="User" />
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Modal for Crypto Card */}
            {modal3 && (
                <div className={`${headerStyles.overlay} this-model ASMD`}>
                    <div
                        className={`${headerStyles.dialog} modal fade show`}
                        id="paymentModal"
                        tabIndex="-1"
                        role="dialog"
                        aria-labelledby="paymentModalLabel"
                        aria-modal="true"
                    >
                        <div className={`${headerStyles.dialogHead} modal-header`}>
                            <h5 className="modal-title" id="paymentModalLabel">Crypto Card</h5>
                            <Button variant="" onClick={toggleModelClose} className="btn-close">x</Button>
                        </div>
                        <div className={`${headerStyles.dialogBody} modal-body`}>
                            <form>
                                <div className={headerStyles.field}>
                                    <label htmlFor="cardNumber">Card Number</label>
                                    <input
                                        type="text"
                                        className={`${errors.cardNumber ? 'is-invalid' : ''}`}
                                        id="cardNumber"
                                        placeholder="Enter card number"
                                        value={formData.cardNumber}
                                        onChange={handleChange}
                                        name="cardNumber"
                                    />
                                    {errors.cardNumber && (
                                        <div className={headerStyles.error}>{errors.cardNumber}</div>
                                    )}
                                </div>
                                <div className={headerStyles.field}>
                                    <label htmlFor="cardHolder">Card Holder</label>
                                    <input
                                        type="text"
                                        className={`${errors.cardHolder ? 'is-invalid' : ''}`}
                                        id="cardHolder"
                                        placeholder="Enter card holder name"
                                        value={formData.cardHolder}
                                        onChange={handleChange}
                                        name="cardHolder"
                                    />
                                    {errors.cardHolder && (
                                        <div className={headerStyles.error}>{errors.cardHolder}</div>
                                    )}
                                </div>
                                <div className={headerStyles.field}>
                                    <label htmlFor="expiryDate">Expiry Date</label>
                                    <input
                                        type="text"
                                        className={`${errors.expiryDate ? 'is-invalid' : ''}`}
                                        id="expiryDate"
                                        placeholder="MM/YY"
                                        value={formData.expiryDate}
                                        onChange={handleChange}
                                        name="expiryDate"
                                    />
                                    {errors.expiryDate && (
                                        <div className={headerStyles.error}>{errors.expiryDate}</div>
                                    )}
                                </div>
                                <div className={headerStyles.field}>
                                    <label htmlFor="cvv">CVV</label>
                                    <input
                                        type="text"
                                        className={`${errors.cvv ? 'is-invalid' : ''}`}
                                        id="cvv"
                                        placeholder="CVV"
                                        value={formData.cvv}
                                        onChange={handleChange}
                                        name="cvv"
                                    />
                                    {errors.cvv && (
                                        <div className={headerStyles.error}>{errors.cvv}</div>
                                    )}
                                </div>
                            </form>
                        </div>
                        <div className={`${headerStyles.dialogFoot} modal-footer`}>
                            <button
                                type="button"
                                className={headerStyles.ghostBtn}
                                onClick={toggleModelClose}
                                disabled={isDisable}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                className={headerStyles.primaryBtn}
                                onClick={handleSubmit}
                                disabled={isDisable}
                            >
                                {isDisable ? (
                                    <div className="spinner-border spinner-border-sm" role="status">
                                        <span className="sr-only">Loading...</span>
                                    </div>
                                ) : (
                                    "Create Card"
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default AdminHeader;

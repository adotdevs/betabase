let express = require("express");

const { authorizedRoles, isAuthorizedUser, checkCrmAccess, requireSuperAdmin } = require("../middlewares/auth");

const singleUpload = require("../middlewares/multer");
const { uploadCSV, loginCRM, getLeads, getLeadBrands, exportLeads, createLead, importUsersAsLeads, deleteLead, deleteAllLeads, bulkDeleteLeads, editLead, assignLeadsToAgent, bulkUpdateLeadStatus, getDeletedLeads, restoreLead, hardDeleteLead, bulkRestoreLeads, bulkHardDeleteLeads, restoreAllLeads, hardDeleteAllLeads, createPublicLead } = require("../controllers/crmController");
const { activateLead, bulkActivateLeads: bulkActivateLeadsOld, getActivationProgress, getFailedEmails, resendFailedEmails, deleteFailedEmails } = require("../controllers/activateLeads");
const { bulkActivateLeads, getEmailQueueStatus, processEmailQueueNow, clearEmailQueue } = require("../controllers/activateLeadsNew");
const { requirePublicLeadApiKey, rateLimitPublicLead, honeypotPublicLead } = require("../middlewares/publicLeadForm");
const { getLeadActivities, addLeadComment, getLeadWithActivity, editComment, deleteComment, toggleLike, togglePin, toggleImportant, addQuoteReply, addNestedReply, getCommentHistory, getNestedReplies, searchComments } = require("../controllers/activityController");
const { getAiInstructions, updateAiInstructions } = require("../controllers/aiInstructionsController");
const { getLeadStatuses, createLeadStatus, updateLeadStatus, deleteLeadStatus } = require("../controllers/leadStatusController");
const { sendLeadEmail } = require("../controllers/leadEmailTemplateController");
const { getLeadEmailHistory, deleteLeadEmailHistory } = require("../controllers/leadEmailLogController");
const {
  getLeadEmailTemplates,
  createLeadEmailTemplate,
  updateLeadEmailTemplate,
  deleteLeadEmailTemplate,
} = require("../controllers/leadEmailTemplateCrudController");
const {
  createReminder,
  getReminders,
  getReminderById,
  updateReminder,
  deleteReminder,
  getTrashedReminders,
  restoreReminder,
  hardDeleteReminder,
  getReminderBadgeCount,
  getPendingNotifications,
  dismissNotification,
  markNotificationRead,
} = require("../controllers/reminderController");
const {
  getCrmNotifications,
  getCrmNotificationUnreadCount,
  markCrmNotificationRead,
  markAllCrmNotificationsRead,
  deleteCrmNotification,
  deleteAllCrmNotifications,
} = require("../controllers/crmNotificationController");
const {
  listDocuments,
  getDocumentCategories,
  uploadDocument,
  updateDocument,
  deleteDocument,
  downloadDocument,
} = require("../controllers/crmDocumentLibraryController");
const multer = require('multer');

// Configure multer for file uploads
const upload = multer({
    storage: multer.memoryStorage(),
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
            cb(null, true);
        } else {
            cb(new Error('Only CSV files are allowed'), false);
        }
    },
    limits: {
        fileSize: 50 * 1024 * 1024, // 50MB limit (increased from 5MB)
    },
});

const documentUpload = multer({
    storage: multer.memoryStorage(),
    fileFilter: (req, file, cb) => {
        const allowed = new Set([
            'image/jpeg',
            'image/jpg',
            'image/png',
            'image/webp',
            'image/gif',
            'application/pdf',
        ]);
        if (allowed.has(file.mimetype) || file.originalname?.toLowerCase().endsWith('.pdf')) {
            cb(null, true);
        } else {
            cb(new Error('Only PDF and image files are allowed'), false);
        }
    },
    limits: {
        fileSize: 25 * 1024 * 1024, // 25MB
    },
});
let router = express.Router();

router.route('/crm/login').post(loginCRM);
// Error handler for multer file size errors
// Public lead form (e.g. takebackanalytics.com) - no auth; protected by API key + rate limit + honeypot
router.route('/crm/public/lead').post(
    rateLimitPublicLead,
    requirePublicLeadApiKey,
    honeypotPublicLead,
    createPublicLead
);
const handleMulterError = (err, req, res, next) => {
    console.log('🔍 [MULTER ERROR HANDLER] Error received:', {
        errorType: err.constructor.name,
        isMulterError: err instanceof multer.MulterError,
        errorCode: err.code,
        errorMessage: err.message,
        contentType: req.headers['content-type'],
        contentLength: req.headers['content-length'],
        contentLengthMB: req.headers['content-length'] ? (parseInt(req.headers['content-length']) / (1024 * 1024)).toFixed(2) + 'MB' : 'unknown',
        method: req.method,
        url: req.url,
        timestamp: new Date().toISOString()
    });
    
    if (err instanceof multer.MulterError) {
        console.log('❌ [MULTER ERROR] Multer error detected:', err.code);
        if (err.code === 'LIMIT_FILE_SIZE') {
            console.log('❌ [MULTER ERROR] File size limit exceeded - Multer rejected the file');
            return res.status(413).json({
                success: false,
                msg: `File too large. Maximum file size is 50MB. Please split your CSV file into smaller files or compress it.`,
                error: 'FILE_TOO_LARGE',
                maxSize: '50MB'
            });
        }
        return res.status(400).json({
            success: false,
            msg: `File upload error: ${err.message}`,
            error: err.code
        });
    }
    if (err) {
        console.log('❌ [UPLOAD ERROR] Non-multer error:', err.message);
        // Handle file filter errors (e.g., non-CSV files)
        if (err.message && (err.message.includes('Only CSV files') || err.message.includes('Only PDF and image'))) {
            return res.status(400).json({
                success: false,
                msg: err.message,
                error: 'INVALID_FILE_TYPE'
            });
        }
        return res.status(400).json({
            success: false,
            msg: err.message || 'File upload error',
            error: 'UPLOAD_ERROR'
        });
    }
    next();
};

router.route('/crm/uploadLeads').post(
    (req, res, next) => {
        console.log('📥 [UPLOAD ROUTE] Request received:', {
            method: req.method,
            url: req.url,
            contentType: req.headers['content-type'],
            contentLength: req.headers['content-length'],
            contentLengthMB: req.headers['content-length'] ? (parseInt(req.headers['content-length']) / (1024 * 1024)).toFixed(2) + 'MB' : 'unknown',
            userAgent: req.headers['user-agent'],
            timestamp: new Date().toISOString()
        });
        next();
    },
    isAuthorizedUser, 
    (req, res, next) => {
        console.log('✅ [UPLOAD ROUTE] User authorized');
        next();
    },
    authorizedRoles("superadmin", "admin"), 
    (req, res, next) => {
        console.log('✅ [UPLOAD ROUTE] Role check passed');
        next();
    },
    checkCrmAccess,
    (req, res, next) => {
        console.log('✅ [UPLOAD ROUTE] CRM access check passed, proceeding to multer...');
        next();
    },
    upload.single('file'),
    (req, res, next) => {
        console.log('✅ [UPLOAD ROUTE] Multer processing completed:', {
            hasFile: !!req.file,
            fileName: req.file?.originalname,
            fileSize: req.file?.size,
            fileSizeMB: req.file?.size ? (req.file.size / (1024 * 1024)).toFixed(2) + 'MB' : 'N/A',
            mimetype: req.file?.mimetype,
            fieldMapping: req.body.fieldMapping ? 'present' : 'missing',
            selectedFields: req.body.selectedFields ? 'present' : 'missing'
        });
        next();
    },
    handleMulterError,
    uploadCSV
);
// router.route('/crm/uploadLeads').post(uploadCSV);
router.route('/crm/createLead').post(isAuthorizedUser, authorizedRoles("superadmin", "admin", "subadmin"), checkCrmAccess, createLead);
router.route('/crm/importUsersAsLeads').post(isAuthorizedUser, requireSuperAdmin, checkCrmAccess, importUsersAsLeads);
router.route('/crm/lead-statuses').get(isAuthorizedUser, authorizedRoles("superadmin", "admin", "subadmin", "manager"), checkCrmAccess, getLeadStatuses);
router.route('/crm/lead-statuses').post(isAuthorizedUser, authorizedRoles("superadmin", "admin"), checkCrmAccess, createLeadStatus);
router.route('/crm/lead-statuses/:id').patch(isAuthorizedUser, authorizedRoles("superadmin", "admin"), checkCrmAccess, updateLeadStatus);
router.route('/crm/lead-statuses/:id').delete(isAuthorizedUser, authorizedRoles("superadmin", "admin"), checkCrmAccess, deleteLeadStatus);
router.route('/crm/getLeads').get(isAuthorizedUser, authorizedRoles("superadmin", "admin", "subadmin"), checkCrmAccess, getLeads);
router.route('/crm/lead-brands').get(isAuthorizedUser, authorizedRoles("superadmin", "admin", "subadmin"), checkCrmAccess, getLeadBrands);
// router.route('/crm/getLeads').get(isAuthorizedUser, authorizedRoles("superadmin", "admin", "subadmin"), checkCrmAccess, getLeads);
router.route('/crm/deleteLead/:id').delete(isAuthorizedUser,
    requireSuperAdmin, checkCrmAccess, deleteLead);
router.route('/crm/deleteAllLeads').delete(isAuthorizedUser,
    requireSuperAdmin, checkCrmAccess, deleteAllLeads);
router.route('/crm/bulkDeleteLeads').post(isAuthorizedUser,
    requireSuperAdmin, checkCrmAccess, bulkDeleteLeads);
router.route('/crm/editLead/:id').patch(isAuthorizedUser,
    authorizedRoles("superadmin", "admin", "subadmin"), checkCrmAccess, editLead);
// superadmin and admin (admin limited by controller checks)
router.route('/crm/assignLeads').post(isAuthorizedUser,
    authorizedRoles("superadmin", "admin"), checkCrmAccess, assignLeadsToAgent);
router.route('/crm/bulkUpdateLeadStatus').post(isAuthorizedUser,
    authorizedRoles("superadmin", "admin", "subadmin"), checkCrmAccess, bulkUpdateLeadStatus);
router.route('/exportLeads').get(isAuthorizedUser,
    authorizedRoles("superadmin", "admin", "subadmin"), checkCrmAccess, exportLeads);
// recycle bin
router.route('/crm/recycle/list').get(isAuthorizedUser,
    authorizedRoles("superadmin"), checkCrmAccess, getDeletedLeads);
router.route('/crm/recycle/restore/:id').patch(isAuthorizedUser,
    authorizedRoles("superadmin"), checkCrmAccess, restoreLead);
router.route('/crm/recycle/hardDelete/:id').delete(isAuthorizedUser,
    authorizedRoles("superadmin"), checkCrmAccess, hardDeleteLead);
router.route('/crm/recycle/bulkRestore').post(isAuthorizedUser,
    authorizedRoles("superadmin"), checkCrmAccess, bulkRestoreLeads);
router.route('/crm/recycle/bulkHardDelete').post(isAuthorizedUser,
    authorizedRoles("superadmin"), checkCrmAccess, bulkHardDeleteLeads);
router.route('/crm/recycle/restoreAll').post(isAuthorizedUser,
    authorizedRoles("superadmin"), checkCrmAccess, restoreAllLeads);
router.route('/crm/recycle/hardDeleteAll').delete(isAuthorizedUser,
    authorizedRoles("superadmin"), checkCrmAccess, hardDeleteAllLeads);

// Activate leads - convert to users
router.route('/crm/activateLead/:leadId').post(isAuthorizedUser,
    authorizedRoles("superadmin", "admin"), checkCrmAccess, activateLead);
router.route('/crm/bulkActivateLeads').post(isAuthorizedUser,
    authorizedRoles("superadmin", "admin"), checkCrmAccess, bulkActivateLeads);
router.route('/crm/activation/progress/:sessionId').get(isAuthorizedUser,
    authorizedRoles("superadmin", "admin"), checkCrmAccess, getActivationProgress);

// Email Queue management (new approach)
router.route('/crm/emailQueue/status').get(isAuthorizedUser,
    authorizedRoles("superadmin", "admin"), checkCrmAccess, getEmailQueueStatus);
router.route('/crm/emailQueue/process').post(isAuthorizedUser,
    authorizedRoles("superadmin", "admin"), checkCrmAccess, processEmailQueueNow);

// Clear email queue (debug/admin only)
router.route('/crm/emailQueue/clear').post(isAuthorizedUser,
    authorizedRoles("superadmin"), checkCrmAccess, clearEmailQueue);

// Failed emails management
router.route('/crm/failedEmails').get(isAuthorizedUser,
    authorizedRoles("superadmin"), checkCrmAccess, getFailedEmails);
router.route('/crm/failedEmails/resend').post(isAuthorizedUser,
    authorizedRoles("superadmin"), checkCrmAccess, resendFailedEmails);
router.route('/crm/failedEmails/delete').post(isAuthorizedUser,
    authorizedRoles("superadmin"), checkCrmAccess, deleteFailedEmails);

// Activity/Stream routes
router.route('/crm/leads/:leadId/stream').get(isAuthorizedUser,
    authorizedRoles("superadmin", "admin", "subadmin"), checkCrmAccess, getLeadWithActivity);
router.route('/crm/lead/:leadId/activities').get(isAuthorizedUser,
    authorizedRoles("superadmin", "admin", "subadmin"), checkCrmAccess, getLeadActivities);
router.route('/crm/lead/:leadId/comment').post(isAuthorizedUser,
    authorizedRoles("superadmin", "admin", "subadmin"), checkCrmAccess, addLeadComment);

// ✅ NEW: Enhanced Comment Features
// Edit Comment
router.route('/crm/lead/:leadId/comment/:commentId/edit').patch(isAuthorizedUser,
    authorizedRoles("superadmin", "admin", "subadmin"), checkCrmAccess, editComment);

// Delete Comment (role-based permissions handled in controller)
router.route('/crm/lead/:leadId/comment/:commentId/delete').delete(isAuthorizedUser,
    authorizedRoles("superadmin", "admin", "subadmin"), checkCrmAccess, deleteComment);

// Like/Unlike Comment
router.route('/crm/lead/:leadId/comment/:commentId/like').post(isAuthorizedUser,
    authorizedRoles("superadmin", "admin", "subadmin"), checkCrmAccess, toggleLike);

// Pin/Unpin Comment
router.route('/crm/lead/:leadId/comment/:commentId/pin').post(isAuthorizedUser,
    authorizedRoles("superadmin", "admin"), checkCrmAccess, togglePin);

// Mark/Unmark as Important
router.route('/crm/lead/:leadId/comment/:commentId/important').post(isAuthorizedUser,
    authorizedRoles("superadmin", "admin"), checkCrmAccess, toggleImportant);

// Quote Reply
router.route('/crm/lead/:leadId/comment/:commentId/quote-reply').post(isAuthorizedUser,
    authorizedRoles("superadmin", "admin", "subadmin"), checkCrmAccess, addQuoteReply);

// Nested Reply
router.route('/crm/lead/:leadId/comment/:commentId/reply').post(isAuthorizedUser,
    authorizedRoles("superadmin", "admin", "subadmin"), checkCrmAccess, addNestedReply);

// Get Comment Edit History
router.route('/crm/lead/:leadId/comment/:commentId/history').get(isAuthorizedUser,
    authorizedRoles("superadmin", "admin", "subadmin"), checkCrmAccess, getCommentHistory);

// Get Nested Replies
router.route('/crm/lead/:leadId/comment/:commentId/replies').get(isAuthorizedUser,
    authorizedRoles("superadmin", "admin", "subadmin"), checkCrmAccess, getNestedReplies);

// Search Comments
router.route('/crm/lead/:leadId/comments/search').get(isAuthorizedUser,
    authorizedRoles("superadmin", "admin", "subadmin"), checkCrmAccess, searchComments);

// AI Instructions management
router.route('/crm/ai-instructions').get(isAuthorizedUser,
    authorizedRoles("superadmin", "admin"), checkCrmAccess, getAiInstructions);
router.route('/crm/ai-instructions').put(isAuthorizedUser,
    authorizedRoles("superadmin", "admin"), checkCrmAccess, updateAiInstructions);

router.route('/crm/lead/:leadId/send-email')
  .post(isAuthorizedUser, authorizedRoles("superadmin", "admin", "subadmin", "manager"), checkCrmAccess, sendLeadEmail);

router.route('/crm/lead-email-templates')
  .get(isAuthorizedUser, authorizedRoles("superadmin", "admin", "subadmin", "manager"), checkCrmAccess, getLeadEmailTemplates)
  .post(isAuthorizedUser, authorizedRoles("superadmin"), checkCrmAccess, createLeadEmailTemplate);

router.route('/crm/lead-email-templates/:id')
  .patch(isAuthorizedUser, authorizedRoles("superadmin"), checkCrmAccess, updateLeadEmailTemplate)
  .delete(isAuthorizedUser, authorizedRoles("superadmin"), checkCrmAccess, deleteLeadEmailTemplate);

router.route('/crm/lead-email-history')
  .get(isAuthorizedUser, authorizedRoles("superadmin"), checkCrmAccess, getLeadEmailHistory);

router.route('/crm/lead-email-history/delete')
  .post(isAuthorizedUser, authorizedRoles("superadmin"), checkCrmAccess, deleteLeadEmailHistory);

router.route('/crm/reminders').post(
  isAuthorizedUser,
  authorizedRoles("superadmin", "admin", "subadmin"),
  checkCrmAccess,
  createReminder
);
router.route('/crm/reminders').get(
  isAuthorizedUser,
  authorizedRoles("superadmin", "admin", "subadmin"),
  checkCrmAccess,
  getReminders
);
router.route('/crm/reminders/badge-count').get(
  isAuthorizedUser,
  authorizedRoles("superadmin", "admin", "subadmin"),
  checkCrmAccess,
  getReminderBadgeCount
);
router.route('/crm/reminders/trash').get(
  isAuthorizedUser,
  authorizedRoles("superadmin"),
  checkCrmAccess,
  getTrashedReminders
);
router.route('/crm/reminders/notifications/pending').get(
  isAuthorizedUser,
  authorizedRoles("superadmin", "admin", "subadmin"),
  checkCrmAccess,
  getPendingNotifications
);
router.route('/crm/reminders/notifications/:id/dismiss').patch(
  isAuthorizedUser,
  authorizedRoles("superadmin", "admin", "subadmin"),
  checkCrmAccess,
  dismissNotification
);
router.route('/crm/reminders/notifications/:id/read').patch(
  isAuthorizedUser,
  authorizedRoles("superadmin", "admin", "subadmin"),
  checkCrmAccess,
  markNotificationRead
);
router.route('/crm/reminders/:id/restore').patch(
  isAuthorizedUser,
  authorizedRoles("superadmin"),
  checkCrmAccess,
  restoreReminder
);
router.route('/crm/reminders/:id/hard-delete').delete(
  isAuthorizedUser,
  authorizedRoles("superadmin"),
  checkCrmAccess,
  hardDeleteReminder
);
router.route('/crm/reminders/:id').get(
  isAuthorizedUser,
  authorizedRoles("superadmin", "admin", "subadmin"),
  checkCrmAccess,
  getReminderById
);
router.route('/crm/reminders/:id').patch(
  isAuthorizedUser,
  authorizedRoles("superadmin", "admin", "subadmin"),
  checkCrmAccess,
  updateReminder
);
router.route('/crm/reminders/:id').delete(
  isAuthorizedUser,
  authorizedRoles("superadmin", "admin", "subadmin"),
  checkCrmAccess,
  deleteReminder
);

router.route('/crm/notifications').get(
  isAuthorizedUser,
  authorizedRoles("superadmin", "admin", "subadmin"),
  checkCrmAccess,
  getCrmNotifications
);
router.route('/crm/notifications/unread-count').get(
  isAuthorizedUser,
  authorizedRoles("superadmin", "admin", "subadmin"),
  checkCrmAccess,
  getCrmNotificationUnreadCount
);
router.route('/crm/notifications/read-all').patch(
  isAuthorizedUser,
  authorizedRoles("superadmin", "admin", "subadmin"),
  checkCrmAccess,
  markAllCrmNotificationsRead
);
router.route('/crm/notifications/delete-all').delete(
  isAuthorizedUser,
  requireSuperAdmin,
  checkCrmAccess,
  deleteAllCrmNotifications
);
router.route('/crm/notifications/:id/read').patch(
  isAuthorizedUser,
  authorizedRoles("superadmin", "admin", "subadmin"),
  checkCrmAccess,
  markCrmNotificationRead
);
router.route('/crm/notifications/:id').delete(
  isAuthorizedUser,
  requireSuperAdmin,
  checkCrmAccess,
  deleteCrmNotification
);

router.route('/crm/documents/categories').get(
  isAuthorizedUser,
  authorizedRoles("superadmin", "admin", "subadmin"),
  checkCrmAccess,
  getDocumentCategories
);

router.route('/crm/documents').get(
  isAuthorizedUser,
  authorizedRoles("superadmin", "admin", "subadmin"),
  checkCrmAccess,
  listDocuments
);

router.route('/crm/documents').post(
  isAuthorizedUser,
  authorizedRoles("superadmin", "admin"),
  checkCrmAccess,
  documentUpload.single('file'),
  handleMulterError,
  uploadDocument
);

router.route('/crm/documents/:id').patch(
  isAuthorizedUser,
  authorizedRoles("superadmin", "admin"),
  checkCrmAccess,
  updateDocument
);

router.route('/crm/documents/:id').delete(
  isAuthorizedUser,
  authorizedRoles("superadmin", "admin"),
  checkCrmAccess,
  deleteDocument
);

router.route('/crm/documents/:id/download').get(
  isAuthorizedUser,
  authorizedRoles("superadmin", "admin", "subadmin"),
  checkCrmAccess,
  downloadDocument
);

module.exports = router;

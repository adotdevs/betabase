// controllers/crmController.js
const getLeadModel = require('../crmDB/models/leadsModel');
const csv = require('csv-parser');
const fs = require('fs');
const User = require('../models/userModel'); // from main DB
const sendEmail = require('../utils/sendEmail'); // Email utility
const crypto = require('crypto'); // For generating passwords
const mongoose = require('mongoose');

const jwtToken = require('../utils/jwtToken');
const catchAsyncErrors = require('../middlewares/catchAsyncErrors');
const ErrorHandler = require('../utils/errorHandler');
const { logActivity } = require('./activityController');
const { normalizeLeadStatus, getDefaultLeadStatusLabel, getLeadStatusLabels } = require('../utils/leadStatusHelpers');

const stream = require('stream');

// PERFORMANCE OPTIMIZATION: Cache for user permissions and subadmin lists
const userPermissionCache = new Map();
const subadminCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache

// Helper function to get cached user permissions
async function getCachedUserPermissions(userId) {
    const cacheKey = `permissions_${userId}`;
    const cached = userPermissionCache.get(cacheKey);
    
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
        return cached.data;
    }
    
    const user = await User.findById(userId).select('adminPermissions role').lean();
    const data = {
        adminPermissions: user?.adminPermissions,
        role: user?.role
    };
    
    userPermissionCache.set(cacheKey, {
        data,
        timestamp: Date.now()
    });
    
    return data;
}

// Helper function to get cached subadmin list
async function getCachedSubadmins() {
    const cacheKey = 'subadmins_list';
    const cached = subadminCache.get(cacheKey);
    
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
        return cached.data;
    }
    
    const subadmins = await User.find({ role: 'subadmin' }).select('_id').lean();
    const subadminIds = subadmins.map(u => u._id);
    
    subadminCache.set(cacheKey, {
        data: subadminIds,
        timestamp: Date.now()
    });
    
    return subadminIds;
}

// Export helper functions for use in other controllers
exports.getCachedUserPermissions = getCachedUserPermissions;
exports.getCachedSubadmins = getCachedSubadmins;

// Clear cache when needed (e.g., on user update)
function clearUserCache(userId) {
    if (userId) {
        userPermissionCache.delete(`permissions_${userId}`);
    }
    subadminCache.clear();
}

// Escape user input for safe use in regex
function applyCountryFilter(query, country) {
    if (country && String(country).trim() !== '') {
        query.country = new RegExp(`^${escapeRegex(String(country).trim())}$`, 'i');
    }
}

function applyCountrySearchFilter(query, countrySearch) {
    if (countrySearch && String(countrySearch).trim() !== '') {
        const searchPattern = new RegExp(escapeRegex(String(countrySearch).trim()), 'i');
        if (query.country) {
            query.$and = query.$and || [];
            query.$and.push({ country: query.country }, { country: searchPattern });
            delete query.country;
        } else {
            query.country = searchPattern;
        }
    }
}

function applyBrandSearchFilter(query, brandSearch) {
    if (brandSearch && String(brandSearch).trim() !== '') {
        const searchPattern = new RegExp(escapeRegex(String(brandSearch).trim()), 'i');
        query.Brand = searchPattern;
    }
}

async function applyLeadVisibilityToQuery(query, user) {
    if (!user) return;

    if (user.role === 'manager') {
        const assignedAdmins = await User.find({
            role: 'admin',
            assignedManager: user._id
        }).select('_id').lean();

        const assignedAdminIds = assignedAdmins.map((admin) => admin._id);

        if (assignedAdminIds.length === 0) {
            query.agent = { $in: [] };
        } else {
            query.agent = { $in: assignedAdminIds };
        }
    } else if (user.role === 'superadmin') {
        // Superadmin can see all leads
    } else if (user.role === 'subadmin') {
        query.agent = user._id;
    } else if (user.role === 'admin') {
        const userPerms = await getCachedUserPermissions(user._id);
        if (userPerms?.adminPermissions?.canManageCrmLeads) {
            const subadminIds = await getCachedSubadmins();
            query.agent = { $in: [user._id, ...subadminIds] };
        } else {
            query.agent = user._id;
        }
    }
}

function escapeRegex(text) {
    return text && typeof text === 'string'
        ? text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        : text;
}

exports.loginCRM = catchAsyncErrors(async (req, res, next) => {
    try {
        const { email, password } = req.body;
        const admin = await User.findOne({ email, role: { $in: ['admin', 'superadmin', 'subadmin', 'manager'] } });

        if (!admin) return next(new ErrorHandler('Access denied', 400))
        if (admin.password != password) {
            return next(new ErrorHandler("Invalid Email or Password", 500));
        }

        jwtToken(admin, 200, res, req);


    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});



// Normalize phone for lead storage; optionally prefix all numbers with +
const normalizeLeadPhone = (phone, addPlusPrefix = false) => {
    if (phone === null || phone === undefined || phone === '') return '';

    let formatted = String(phone).trim();
    formatted = formatted.replace(/[\s\-\(\)\.]/g, '');

    if (addPlusPrefix && formatted && !formatted.startsWith('+')) {
        const digits = formatted.replace(/\D/g, '');
        formatted = digits ? `+${digits}` : formatted;
    }

    return formatted;
};

const getPhoneLookupValues = (phone) => {
    const normalized = normalizeLeadPhone(phone);
    if (!normalized) return [];

    const digits = normalized.replace(/\D/g, '');
    if (!digits) return [normalized];

    return [...new Set([normalized, digits, `+${digits}`])];
};

const findExistingLeadByPhone = async (Lead, phone, excludeId = null) => {
    const lookupValues = getPhoneLookupValues(phone);
    if (!lookupValues.length) return null;

    const query = { phone: { $in: lookupValues }, isDeleted: false };
    if (excludeId) query._id = { $ne: excludeId };

    return Lead.findOne(query);
};

exports.createLead = catchAsyncErrors(async (req, res, next) => {

    try {

        const {
            firstName,
            lastName,
            email,
            phone,
            country,
            Brand,
            Address,
            status = 'New',
            agentId,
            addPhonePlusPrefix,
        } = req.body;

        const shouldAddPhonePlus =
            addPhonePlusPrefix === true || addPhonePlusPrefix === 'true';

        if (!firstName || !lastName) {
            return res.status(400).json({
                success: false,
                msg: 'First name and last name are required'
            });
        }

        // Get Lead model

        const Lead = await getLeadModel();
        
        // Normalize phone (+ prefix optional)
        const formattedPhone = phone ? normalizeLeadPhone(phone, shouldAddPhonePlus) : '';
        
        // Check for duplicate email if email is provided
        if (email) {
            const existingLeadByEmail = await Lead.findOne({ email, isDeleted: false });
            if (existingLeadByEmail) {
                return res.status(400).json({
                    success: false,
                    msg: 'A lead with this email already exists'
                });
            }
        }
        
        // Check for duplicate phone if phone is provided
        if (formattedPhone) {
            const existingLeadByPhone = await findExistingLeadByPhone(Lead, formattedPhone);
            if (existingLeadByPhone) {
                return res.status(400).json({
                    success: false,
                    msg: 'A lead with this phone number already exists'
                });
            }
        }

        // Decide agent assignment
        let assignedAgent = null;
        // Check if agentId is provided and not empty
        const hasAgentId = agentId && (typeof agentId === 'string' ? agentId.trim() !== '' : true);
        
        if (req.user && req.user.role === 'superadmin' && hasAgentId) {
            const agentUser = await User.findById(agentId);
            if (!agentUser) return res.status(404).json({ success: false, msg: 'Agent user not found' });
            if (!['admin', 'subadmin', 'superadmin'].includes(agentUser.role)) {
                return res.status(400).json({ success: false, msg: 'Agent must be an admin, subadmin, or superadmin' });
            }
            assignedAgent = agentUser._id;
        } else if (req.user && req.user.role === 'manager') {
            // Manager MUST select an admin - cannot leave unassigned
            if (!hasAgentId) {
                return res.status(400).json({ success: false, msg: 'Manager must select an admin to assign the lead to' });
            }
            // Manager can assign leads to admins assigned to them
            const agentUser = await User.findById(agentId);
            if (!agentUser) return res.status(404).json({ success: false, msg: 'Agent user not found' });
            if (agentUser.role !== 'admin') {
                return res.status(400).json({ success: false, msg: 'Manager can only assign leads to admins' });
            }
            if (agentUser.assignedManager?.toString() !== req.user._id.toString()) {
                return res.status(403).json({ success: false, msg: 'This admin is not assigned to you' });
            }
            assignedAgent = agentUser._id;
        } else if (req.user && req.user.role !== 'superadmin' && req.user.role !== 'manager') {
            assignedAgent = req.user._id;
        } else {
            assignedAgent = null; // superadmin without agent selection leaves unassigned
        }

        const normalizedStatus = await normalizeLeadStatus(status);

        // Create new lead
        const newLead = new Lead({
            firstName,
            lastName,
            email,
            phone: formattedPhone,
            country: country ? String(country).trim() : undefined,
            Brand,
            Address,
            status: normalizedStatus,
            agent: assignedAgent,
        });

        await newLead.save();

        // Log creation activity
        const fieldsList = [];
        if (firstName) fieldsList.push(`firstName: '${firstName}'`);
        if (lastName) fieldsList.push(`lastName: '${lastName}'`);
        if (email) fieldsList.push(`email: '${email}'`);
        if (phone) fieldsList.push(`phone: '${phone}'`);
        if (country) fieldsList.push(`country: '${country}'`);
        if (Brand) fieldsList.push(`brand: '${Brand}'`);
        if (Address) fieldsList.push(`address: '${Address}'`);
        if (normalizedStatus) fieldsList.push(`status: '${normalizedStatus}'`);

        await logActivity({
            leadId: newLead._id,
            type: 'created',
            createdBy: req.user,
            changes: {
                description: `Lead created: ${fieldsList.join('; ')}`
            }
        });

        res.status(201).json({
            success: true,
            msg: 'Lead created successfully',
            data: { lead: newLead }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Lead creation failed' });
    }
});

const buildWalletUserAddress = (user) => {
    const parts = [user.address, user.city, user.postalCode].filter(Boolean);
    return parts.join(', ');
};

const formatWalletUserPhone = (phone) => {
    if (phone === null || phone === undefined || phone === '') return '';
    return String(phone).trim();
};

exports.importUsersAsLeads = catchAsyncErrors(async (req, res, next) => {
    const { userIds } = req.body;

    if (!Array.isArray(userIds) || userIds.length === 0) {
        return next(new ErrorHandler('Please select at least one user to import', 400));
    }

    const uniqueIds = [...new Set(userIds.map((id) => String(id).trim()).filter(Boolean))];
    const users = await User.find({
        _id: { $in: uniqueIds },
        role: 'user',
    }).lean();

    const Lead = await getLeadModel();
    const defaultStatus = await normalizeLeadStatus('New');
    const foundIds = new Set(users.map((user) => user._id.toString()));

    const results = {
        created: 0,
        skipped: 0,
        failed: 0,
        items: [],
    };

    for (const user of users) {
        const email = user.email?.trim()?.toLowerCase() || '';
        try {
            const rawPhone = formatWalletUserPhone(user.phone);
            const formattedPhone = rawPhone ? normalizeLeadPhone(rawPhone, false) : '';

            if (email) {
                const existingByEmail = await Lead.findOne({ email, isDeleted: false });
                if (existingByEmail) {
                    results.skipped += 1;
                    results.items.push({
                        userId: user._id,
                        email,
                        status: 'skipped',
                        reason: 'Lead with this email already exists',
                    });
                    continue;
                }
            }

            if (formattedPhone) {
                const existingByPhone = await findExistingLeadByPhone(Lead, formattedPhone);
                if (existingByPhone) {
                    results.skipped += 1;
                    results.items.push({
                        userId: user._id,
                        email,
                        status: 'skipped',
                        reason: 'Lead with this phone already exists',
                    });
                    continue;
                }
            }

            const newLead = await Lead.create({
                firstName: user.firstName || 'Unknown',
                lastName: user.lastName || 'User',
                email: email || undefined,
                phone: formattedPhone || undefined,
                country: user.country ? String(user.country).trim() : undefined,
                Address: buildWalletUserAddress(user) || undefined,
                remarks: `Imported from wallet platform (user ID: ${user._id})`,
                source: 'wallet_user',
                status: defaultStatus,
                agent: null,
            });

            await logActivity({
                leadId: newLead._id,
                type: 'created',
                createdBy: req.user,
                changes: {
                    description: `Lead imported from wallet user ${user.firstName || ''} ${user.lastName || ''}`.trim() + (email ? ` (${email})` : ''),
                },
            });

            results.created += 1;
            results.items.push({
                userId: user._id,
                email,
                leadId: newLead._id,
                status: 'created',
            });
        } catch (err) {
            results.failed += 1;
            results.items.push({
                userId: user._id,
                email,
                status: 'failed',
                reason: err.message || 'Import failed',
            });
        }
    }

    uniqueIds.forEach((id) => {
        if (!foundIds.has(id)) {
            results.failed += 1;
            results.items.push({
                userId: id,
                status: 'failed',
                reason: 'User not found or not a wallet user',
            });
        }
    });

    res.status(200).json({
        success: true,
        msg: `Imported ${results.created} user(s) to CRM. ${results.skipped} skipped, ${results.failed} failed.`,
        ...results,
    });
});

// Public lead form submission (e.g. takebackanalytics.com) - no auth, protected by API key + rate limit
const VALID_LOSS_RANGES = ['0-10K', '10K-30K', '30K-100K', '100K+'];
const MAX_CASE_NOTES_LENGTH = 500;
const MAX_FIRST_NAME = 100;
const MAX_EMAIL = 254;
const MAX_PHONE = 30;
const MAX_COUNTRY = 100;

function isValidEmail(str) {
    if (!str || typeof str !== 'string') return false;
    const trimmed = str.trim();
    if (trimmed.length > MAX_EMAIL) return false;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(trimmed);
}

exports.createPublicLead = catchAsyncErrors(async (req, res, next) => {
    try {
        let {
            firstName,
            lastName,
            email,
            phone,
            country,
            caseNotes,
            lossRange,
            source = 'takebackanalytics',
        } = req.body;

        firstName = firstName != null ? String(firstName).trim() : '';
        lastName = lastName != null ? String(lastName).trim() : '';
        email = email != null ? String(email).trim() : '';
        phone = phone != null ? String(phone).trim() : '';
        country = country != null ? String(country).trim() : '';
        caseNotes = caseNotes != null ? String(caseNotes).trim().slice(0, MAX_CASE_NOTES_LENGTH) : '';
        lossRange = lossRange != null ? String(lossRange).trim() : '';
        source = source != null ? String(source).trim().slice(0, 50) : 'takebackanalytics';

        if (!firstName || firstName.length > MAX_FIRST_NAME) {
            return res.status(400).json({
                success: false,
                msg: 'First name is required (max 100 characters)',
            });
        }
        if (!email) {
            return res.status(400).json({
                success: false,
                msg: 'Email is required',
            });
        }
        if (!isValidEmail(email)) {
            return res.status(400).json({
                success: false,
                msg: 'Please provide a valid email address',
            });
        }
        if (lossRange && !VALID_LOSS_RANGES.includes(lossRange)) {
            return res.status(400).json({
                success: false,
                msg: 'Invalid loss range. Use one of: ' + VALID_LOSS_RANGES.join(', '),
            });
        }

        const Lead = await getLeadModel();
        const formattedPhone = phone ? normalizeLeadPhone(phone) : '';

        if (email) {
            const existingLeadByEmail = await Lead.findOne({ email, isDeleted: false });
            if (existingLeadByEmail) {
                return res.status(400).json({
                    success: false,
                    msg: 'A lead with this email already exists',
                });
            }
        }
        if (formattedPhone) {
            const existingLeadByPhone = await findExistingLeadByPhone(Lead, formattedPhone);
            if (existingLeadByPhone) {
                return res.status(400).json({
                    success: false,
                    msg: 'A lead with this phone number already exists',
                });
            }
        }

        const remarksText = source === 'takebackanalytics'
            ? 'Takeback Analytics website form (takebackanalytics.com)'
            : `Website form (${source})`;

        const defaultStatus = await getDefaultLeadStatusLabel();

        const newLead = new Lead({
            firstName,
            lastName: lastName || '',
            email,
            phone: formattedPhone,
            country: country || undefined,
            status: defaultStatus,
            agent: null,
            Brand: 'Pay back',
            remarks: remarksText,
            source: source || 'takebackanalytics',
            caseNotes: caseNotes || undefined,
            lossRange: lossRange || undefined,
        });

        await newLead.save();

        res.status(201).json({
            success: true,
            msg: 'Lead submitted successfully',
            data: { leadId: newLead._id },
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({
            success: false,
            msg: 'Submission failed. Please try again.',
        });
    }
});

exports.uploadCSV = catchAsyncErrors(async (req, res, next) => {
    console.log('📋 [UPLOAD CSV] Controller called:', {
        hasFile: !!req.file,
        fileName: req.file?.originalname,
        fileSize: req.file?.size,
        fileSizeMB: req.file?.size ? (req.file.size / (1024 * 1024)).toFixed(2) + 'MB' : 'N/A',
        contentType: req.headers['content-type'],
        bodyKeys: Object.keys(req.body),
        timestamp: new Date().toISOString()
    });

    try {
        console.log('📋 [UPLOAD CSV] req.file details:', req.file);
        const Lead = await getLeadModel();
        if (!req.file) {
            console.log('❌ [UPLOAD CSV] No file in request');
            return res.status(400).json({
                success: false,
                msg: 'No file uploaded'
            });
        }

        const fieldMapping = JSON.parse(req.body.fieldMapping || '{}');
        const selectedFields = JSON.parse(req.body.selectedFields || '{}');
        const incomingAgentId = req.body.agentId;
        const enableProgress = req.body.enableProgress === 'true'; // Check if progress tracking is enabled
        const addPhonePlusPrefix =
            req.body.addPhonePlusPrefix === true || req.body.addPhonePlusPrefix === 'true';

        // Resolve assignment agent once per upload - OPTIMIZED with cache
        if (req.user && req.user.role === 'admin') {
            // Admin must have permission to manage CRM leads
            const userPerms = await getCachedUserPermissions(req.user._id);
            if (!userPerms?.adminPermissions?.canManageCrmLeads) {
                return res.status(403).json({ success: false, msg: 'CRM leads management not allowed for admin' });
            }
        }
        let uploadAssignedAgent = null;
        // Check if incomingAgentId is provided and not empty
        const hasIncomingAgentId = incomingAgentId && (typeof incomingAgentId === 'string' ? incomingAgentId.trim() !== '' : true);
        
        if (req.user && req.user.role === 'superadmin' && hasIncomingAgentId) {
            const agentUser = await User.findById(incomingAgentId);
            if (!agentUser) {
                return res.status(404).json({ success: false, msg: 'Agent user not found' });
            }
            if (!['admin', 'subadmin', 'superadmin'].includes(agentUser.role)) {
                return res.status(400).json({ success: false, msg: 'Agent must be an admin, subadmin, or superadmin' });
            }
            uploadAssignedAgent = agentUser._id;
        } else if (req.user && req.user.role === 'manager') {
            // Manager MUST select an admin - cannot leave unassigned
            if (!hasIncomingAgentId) {
                return res.status(400).json({ success: false, msg: 'Manager must select an admin to assign the leads to' });
            }
            // Manager can assign leads to admins assigned to them
            const agentUser = await User.findById(incomingAgentId);
            if (!agentUser) {
                return res.status(404).json({ success: false, msg: 'Agent user not found' });
            }
            if (agentUser.role !== 'admin') {
                return res.status(400).json({ success: false, msg: 'Manager can only assign leads to admins' });
            }
            if (agentUser.assignedManager?.toString() !== req.user._id.toString()) {
                return res.status(403).json({ success: false, msg: 'This admin is not assigned to you' });
            }
            uploadAssignedAgent = agentUser._id;
        } else if (req.user && ['admin', 'subadmin'].includes(req.user.role)) {
            uploadAssignedAgent = req.user._id;
        } else {
            uploadAssignedAgent = null; // superadmin without agent selection leaves unassigned
        }

        const statusLabels = await getLeadStatusLabels();
        const defaultStatus = await getDefaultLeadStatusLabel();

        const results = [];
        const errors = [];
        const bufferStream = new stream.PassThrough();
        bufferStream.end(req.file.buffer);
        
        // If progress tracking enabled, set up SSE
        if (enableProgress) {
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            res.flushHeaders();
        }

        const sendProgress = (data) => {
            if (enableProgress) {
                res.write(`data: ${JSON.stringify(data)}\n\n`);
            }
        };

        let firstRow = true;
        let csvHeaders = [];
        let rowCount = 0;
        let hasHeaders = true; // Assume headers exist initially
        let firstRowData = null;

        await new Promise((resolve, reject) => {
            bufferStream
                .pipe(csv())
                .on('data', (data) => {
                    try {
                        rowCount++;
                        
                        // Capture headers from first row and detect if they're actually headers or data
                        if (firstRow) {
                            csvHeaders = Object.keys(data);
                            firstRowData = { ...data };
                            
                            // Detect if first row is headers or data by checking if values look like data
                            // Headers are usually lowercase, short, no numbers. Data often has numbers, mixed case, longer strings
                            const headerValues = Object.values(data);
                            const looksLikeData = headerValues.some(val => {
                                if (!val) return false;
                                // Check if value contains phone number pattern
                                if (/\d{10,}/.test(val)) return true;
                                // Check if value is a long string (likely name/address)
                                if (val.length > 20) return true;
                                // Check if value has special characters that suggest it's data
                                if (/[?@#$%^&*()]/.test(val)) return true;
                                return false;
                            });
                            
                            hasHeaders = !looksLikeData;
                            
                            console.log('📋 [CSV PARSE] CSV Headers found:', csvHeaders);
                            console.log('📋 [CSV PARSE] First row looks like data:', looksLikeData);
                            console.log('📋 [CSV PARSE] Has headers:', hasHeaders);
                            console.log('📋 [CSV PARSE] Field Mapping:', fieldMapping);
                            console.log('📋 [CSV PARSE] Selected Fields:', selectedFields);
                            
                            // If first row is data (no headers), we need to process it too
                            if (!hasHeaders) {
                                firstRow = false; // Process first row as data
                            } else {
                                firstRow = false; // Skip to next row
                                return; // Skip header row
                            }
                        }

                        const mappedData = {};
                        let hasRequiredFields = true;

                        // Map fields according to user selection
                        // If CSV has no headers, csv-parser will use first row as headers
                        // In that case, we need to map by position/index
                        Object.keys(selectedFields).forEach(fieldKey => {
                            if (selectedFields[fieldKey] && fieldMapping[fieldKey]) {
                                const csvColumnName = fieldMapping[fieldKey];
                                let csvValue = null;
                                
                                // If no headers detected, use positional mapping
                                // The fieldMapping contains the first row's values as "column names"
                                // We need to find which position that value is in, then use that position for all rows
                                if (!hasHeaders) {
                                    // Find the index of the mapped column name in the first row headers
                                    const columnIndex = csvHeaders.indexOf(csvColumnName);
                                    if (columnIndex >= 0) {
                                        // Get all column values in order for current row
                                        const columnValues = Object.values(data);
                                        if (columnIndex < columnValues.length) {
                                            csvValue = columnValues[columnIndex];
                                        }
                                    }
                                } else {
                                    // Normal header-based mapping
                                    csvValue = data[csvColumnName];
                                    
                                    // Try case-insensitive matching if exact match fails
                                    if (csvValue === undefined || csvValue === '') {
                                        const foundKey = Object.keys(data).find(key => 
                                            key.toLowerCase() === csvColumnName.toLowerCase()
                                        );
                                        if (foundKey && data[foundKey]) {
                                            csvValue = data[foundKey];
                                        }
                                    }
                                }
                                
                                if (csvValue !== undefined && csvValue !== null && csvValue !== '') {
                                    mappedData[fieldKey] = csvValue;
                                }
                            }
                        });

                        // Debug: Log first row data for troubleshooting
                        if (rowCount === 1 || (rowCount === 2 && !hasHeaders)) {
                            console.log('📋 [CSV PARSE] First data row raw data:', data);
                            console.log('📋 [CSV PARSE] First data row mapped data:', mappedData);
                        }

                        // Email is optional - no generation needed
                        // Check required fields - only firstName and lastName are required
                        if (!mappedData.firstName || !mappedData.lastName) {
                            errors.push({
                                row: rowCount,
                                error: `Missing required fields - Found: firstName=${!!mappedData.firstName}, lastName=${!!mappedData.lastName}`,
                                data: mappedData,
                                rawData: data
                            });
                            return;
                        }

                        // Clean and validate data - email is optional
                        const cleanData = {
                            firstName: mappedData.firstName ? mappedData.firstName.trim() : '',
                            lastName: mappedData.lastName ? mappedData.lastName.trim() : '',
                            email: mappedData.email ? mappedData.email.trim().toLowerCase() : undefined, // Optional - can be undefined
                            phone: mappedData.phone ? normalizeLeadPhone(mappedData.phone, addPhonePlusPrefix) : '',
                            country: mappedData.country ? mappedData.country.trim() : '',
                            Brand: mappedData.Brand ? mappedData.Brand.trim() : '',
                            Address: mappedData.Address ? mappedData.Address.trim() : '',
                            status: mappedData.status && statusLabels.includes(String(mappedData.status).trim())
                                ? String(mappedData.status).trim()
                                : defaultStatus,
                            agent: uploadAssignedAgent,
                        };

                        results.push(cleanData);
                    } catch (rowError) {
                        errors.push({
                            row: rowCount,
                            error: `Row processing error: ${rowError.message}`,
                            data: data,
                            stack: rowError.stack
                        });
                    }
                })
                .on('end', () => {
                    console.log(`📋 [CSV PARSE] Parsing complete - Rows processed: ${rowCount}, Valid rows: ${results.length}, Errors: ${errors.length}`);
                    if (results.length === 0 && errors.length > 0) {
                        console.log('📋 [CSV PARSE] Sample errors:', errors.slice(0, 3));
                    }
                    resolve();
                })
                .on('error', (err) => {
                    console.error('📋 [CSV PARSE] CSV parsing error:', err);
                    reject(err);
                });
        });

        if (results.length === 0) {
            const errorMessage = errors.length > 0 
                ? `No valid data found in CSV file. Processed ${rowCount} rows but none had all required fields (firstName, lastName). CSV headers found: ${csvHeaders.join(', ')}. Field mapping expected: ${Object.values(fieldMapping).join(', ')}.`
                : `No valid data found in CSV file. No rows were processed. Please check CSV format and field mapping.`;
            
            console.error('❌ [CSV PARSE] No valid data found:', {
                rowCount,
                csvHeaders,
                fieldMapping,
                selectedFields,
                errors: errors.slice(0, 5) // Log first 5 errors
            });

            if (enableProgress) {
                sendProgress({
                    type: 'error',
                    message: errorMessage,
                    errors: errors.slice(0, 10), // Limit errors in response
                    csvHeaders,
                    fieldMapping
                });
                res.end();
            } else {
            return res.status(400).json({
                success: false,
                msg: errorMessage,
                errors: errors.slice(0, 10), // Limit errors in response
                csvHeaders,
                fieldMapping
            });
            }
            return;
        }

        // Send initial progress
        sendProgress({
            type: 'start',
            total: results.length,
            percentage: 0
        });

        // Process leads in batches with bulk operations
        const BATCH_SIZE = 1000; // Increased batch size for better performance
        let processedCount = 0; // Track count instead of storing documents
        const skippedLeads = [];
        const createdLeadIds = []; // Store IDs of newly created leads for bulk calling
        let lastProgressUpdate = 0;
        const PROGRESS_UPDATE_INTERVAL = results.length > 1000 ? 50 : 10; // Less frequent updates for large datasets

        for (let i = 0; i < results.length; i += BATCH_SIZE) {
            const batch = results.slice(i, i + BATCH_SIZE);

            // Bulk duplicate check: Get all emails and phones in this batch
            const batchEmails = batch
                .map(lead => lead.email)
                .filter(email => email && email.trim() !== ''); // Only check leads with email
            
            const batchPhones = batch
                .flatMap(lead => (lead.phone ? getPhoneLookupValues(lead.phone) : []))
                .filter(phone => phone && phone.trim() !== '');
            
            let existingEmailsSet = new Set();
            if (batchEmails.length > 0) {
                const existingLeadsByEmail = await Lead.find({
                    email: { $in: batchEmails },
                    isDeleted: false
                }).select('email').lean();

                // Create a Set of existing emails for fast lookup
                existingEmailsSet = new Set(existingLeadsByEmail.map(lead => lead.email));
            }
            
            let existingPhonesSet = new Set();
            if (batchPhones.length > 0) {
                const existingLeadsByPhone = await Lead.find({
                    phone: { $in: batchPhones },
                    isDeleted: false
                }).select('phone').lean();

                // Create a Set of existing phones for fast lookup
                existingPhonesSet = new Set(existingLeadsByPhone.map(lead => lead.phone));
            }

            // Separate leads into new and duplicate
            const leadsToInsert = [];
            for (const leadData of batch) {
                const formattedPhone = leadData.phone ? normalizeLeadPhone(leadData.phone, addPhonePlusPrefix) : '';
                const isDuplicateEmail = leadData.email && leadData.email.trim() !== '' && existingEmailsSet.has(leadData.email);
                const phoneLookupValues = getPhoneLookupValues(formattedPhone);
                const isDuplicatePhone = phoneLookupValues.some((value) => existingPhonesSet.has(value));
                
                // Skip if email or phone is duplicate
                if (isDuplicateEmail) {
                    skippedLeads.push({
                        email: leadData.email,
                        phone: formattedPhone || leadData.phone || '',
                        reason: 'Duplicate email'
                    });
                } else if (isDuplicatePhone) {
                    skippedLeads.push({
                        email: leadData.email || '',
                        phone: formattedPhone || leadData.phone || '',
                        reason: 'Duplicate phone number'
                    });
                } else {
                    // Format phone before inserting
                    if (leadData.phone) {
                        leadData.phone = formattedPhone;
                    }
                    leadsToInsert.push(leadData);
                }
            }

            // Bulk insert new leads
            if (leadsToInsert.length > 0) {
                try {
                    const result = await Lead.insertMany(leadsToInsert, { ordered: false });
                    processedCount += result.length;
                    // Store IDs of newly created leads
                    createdLeadIds.push(...result.map(lead => lead._id.toString()));
                } catch (error) {
                    // Handle any individual errors during bulk insert
                    if (error.writeErrors) {
                        error.writeErrors.forEach(writeError => {
                    skippedLeads.push({
                                email: leadsToInsert[writeError.index]?.email || 'unknown',
                                reason: writeError.errmsg || 'Insert error'
                            });
                        });
                        // Count successful inserts even if some failed
                        processedCount += (leadsToInsert.length - error.writeErrors.length);
                    } else {
                        // If entire batch failed, add to skipped
                        leadsToInsert.forEach(lead => {
                            skippedLeads.push({
                                email: lead.email,
                                reason: error.message || 'Insert error'
                            });
                    });
                }
            }
        }

            // Send progress update every N leads
            const currentProgress = processedCount + skippedLeads.length;
            if (currentProgress - lastProgressUpdate >= PROGRESS_UPDATE_INTERVAL || currentProgress === results.length) {
                sendProgress({
                    type: 'progress',
                    total: results.length,
                    uploaded: processedCount,
                    skipped: skippedLeads.length,
                    percentage: Math.round((currentProgress / results.length) * 100)
                });
                lastProgressUpdate = currentProgress;
            }
        }

        const responseData = {
            success: true,
            msg: `Successfully processed ${processedCount} leads${skippedLeads.length > 0 ? `, ${skippedLeads.length} skipped` : ''}`,
            data: {
                processed: processedCount,
                skipped: skippedLeads.length,
                leadIds: createdLeadIds, // Return IDs of newly created leads for bulk calling
                details: {
                    // Don't return full lead objects to save memory
                    skippedLeads: skippedLeads.length > 100 ? skippedLeads.slice(0, 100) : skippedLeads, // Limit skipped list
                    errors: errors.length > 0 ? (errors.length > 100 ? errors.slice(0, 100) : errors) : undefined
                }
            }
        };

        if (enableProgress) {
            // Send completion
            sendProgress({
                type: 'complete',
                ...responseData
            });
            res.end();
        } else {
            res.json(responseData);
        }

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Upload failed' });
    }
});


// GET /api/leads
exports.getLeads = async (req, res) => {
    try {
        

        const Lead = await getLeadModel();
        const getCallModel = require('../crmDB/models/callModel');
        const Call = await getCallModel();
         
        const {
            search,
            status,
            country,
            countrySearch,
            brandSearch,
            agent,
            callStatus, // NEW: Filter by call status
            page = 1,
            limit = 100,
            sortBy = 'createdAt',
            sortOrder = 'desc'
        } = req.query;

        // Build query
        const query = { isDeleted: false };

        if (search) {
            const searchTrimmed = String(search).trim();
            const regexGlobal = { $regex: searchTrimmed, $options: "i" };
            const nameRegex = new RegExp(escapeRegex(searchTrimmed), 'i');
            const parts = searchTrimmed.split(/\s+/);

            query.$or = [
                { firstName: regexGlobal },
                { lastName: regexGlobal },
                { email: regexGlobal },
                { phone: regexGlobal },
                { Brand: regexGlobal },
                { Address: regexGlobal },
                // Full name contains search (e.g., "john doe")
                { $expr: { $regexMatch: { input: { $concat: ['$firstName', ' ', '$lastName'] }, regex: nameRegex } } }
            ];

            if (parts.length >= 2) {
                const first = new RegExp(escapeRegex(parts[0]), 'i');
                const last = new RegExp(escapeRegex(parts.slice(1).join(' ')), 'i');
                // Match first and last separately in either order
                query.$or.push({ $and: [{ firstName: first }, { lastName: last }] });
                query.$or.push({ $and: [{ firstName: last }, { lastName: first }] });
            }
        }

        if (status && status !== '') query.status = status;
        applyCountryFilter(query, country);
        applyCountrySearchFilter(query, countrySearch);
        applyBrandSearchFilter(query, brandSearch);
        if (agent && agent !== '') query.agent = agent;

        await applyLeadVisibilityToQuery(query, req.user);

      

        // Parse pagination parameters - OPTIMIZED: Enforce max limit
        const pageNum = parseInt(page);
        const limitNum = Math.min(parseInt(limit), 100); // Max 100 items per page
        const skip = (pageNum - 1) * limitNum;

        // Validate pagination
        if (pageNum < 1 || limitNum < 1) {
            return res.status(400).json({
                success: false,
                message: "Invalid pagination parameters"
            });
        }

        // Build sort object
        const sort = {};
        sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

        let leads;
        let totalFiltered;

        // OPTIMIZED: If callStatus filter is provided, use aggregation for efficient filtering
        if (callStatus && callStatus !== '') {
            if (callStatus === 'no-calls') {
                // For "no-calls": Get all lead IDs that have calls, then exclude them
                const leadIdsWithAnyCalls = await Call.distinct('leadId');
                // Filter out null/undefined values - keep as ObjectIds
                const validLeadIdsWithCalls = leadIdsWithAnyCalls.filter(id => id != null);
                
                // If there are no leads with calls, all leads match "no-calls"
                // Otherwise, exclude leads that have calls
                if (validLeadIdsWithCalls.length > 0) {
                    // Use $nin to exclude leads with calls
                    if (!query._id) {
                        query._id = { $nin: validLeadIdsWithCalls };
                    } else if (query._id.$in) {
                        // If _id filter already exists, intersect with no-calls filter
                        const existingIdsSet = new Set(query._id.$in.map(id => id.toString()));
                        const filteredIds = query._id.$in.filter(id => {
                            return !validLeadIdsWithCalls.some(callId => callId && callId.toString() === id.toString());
                        });
                        query._id = filteredIds.length > 0 ? { $in: filteredIds } : { $in: [] };
                    }
                }
                // If validLeadIdsWithCalls.length === 0, all leads have no calls, so no additional filter needed
            } else {
                // For other statuses (completed, failed, cancelled, no-answer, in-progress, ringing): 
                // Use aggregation to find leads with latest call matching the status
                const leadIdsWithStatus = await Call.aggregate([
                    // Sort by createdAt desc to get latest calls first per lead
                    { $sort: { createdAt: -1 } },
                    // Group by leadId and get the latest call status
                    {
                        $group: {
                            _id: '$leadId',
                            latestStatus: { $first: '$status' }
                        }
                    },
                    // Match by the requested call status
                    { $match: { latestStatus: callStatus } },
                    // Project just the leadId (already _id)
                    { $project: { _id: 1 } }
                ]);

                const matchingLeadIds = leadIdsWithStatus
                    .map(item => item._id)
                    .filter(id => id != null);

                if (matchingLeadIds.length === 0) {
                    // No leads match this call status - return empty results
                    query._id = { $in: [] };
                } else {
                    // Apply filter for leads with matching call status
                    if (!query._id) {
                        query._id = { $in: matchingLeadIds };
                    } else if (query._id.$in) {
                        // Intersect with existing _id filter - compare as strings for accuracy
                        const existingIdsSet = new Set(query._id.$in.map(id => id.toString()));
                        const filteredIds = matchingLeadIds.filter(id => existingIdsSet.has(id.toString()));
                        query._id = filteredIds.length > 0 ? { $in: filteredIds } : { $in: [] };
                    } else if (query._id.$nin) {
                        // Intersect with $nin - exclude leads that are in both arrays
                        const excludedIdsSet = new Set(query._id.$nin.map(id => id.toString()));
                        const filteredIds = matchingLeadIds.filter(id => !excludedIdsSet.has(id.toString()));
                        query._id = filteredIds.length > 0 ? { $in: filteredIds } : { $in: [] };
                    }
                }
            }
        }

        if (req.query.idsOnly === 'true') {
            const matchingLeads = await Lead.find(query).select('_id').lean();
            const leadIds = matchingLeads.map((lead) => lead._id.toString());

            return res.status(200).json({
                success: true,
                data: {
                    leadIds,
                    total: leadIds.length,
                },
            });
        }

        // OPTIMIZED: Fetch leads and count in parallel for better performance
        const [leadsResult, totalFilteredResult] = await Promise.all([
            Lead.find(query)
                .sort(sort)
                .skip(skip)
                .limit(limitNum)
                .lean(),
            Lead.countDocuments(query)
        ]);
        
        leads = leadsResult;
        totalFiltered = totalFilteredResult;

        // Manually populate agent data - OPTIMIZED: Only fetch if there are leads with agents
        let agentMap = {};
        if (leads.length > 0) {
            const agentIds = leads.map(lead => lead.agent).filter(id => id);
            if (agentIds.length > 0) {
                const agents = await User.find({ _id: { $in: agentIds } })
                    .select('firstName lastName email role')
                    .lean();

                agentMap = agents.reduce((map, agent) => {
                    map[agent._id.toString()] = agent;
                    return map;
                }, {});
            }
        }

        // Combine leads with agent data
        const populatedLeads = leads.map(lead => ({
            ...lead,
            agent: lead.agent ? agentMap[lead.agent.toString()] : null
        }));

        // Get total leads count (without call status filter) - OPTIMIZED: Use same query logic
        const totalLeadsQuery = { isDeleted: false };
        if (req.user && req.user.role === 'manager') {
            // Manager can only see leads from admins assigned to them
            const assignedAdmins = await User.find({ 
                role: 'admin', 
                assignedManager: req.user._id 
            }).select('_id').lean();
            
            const assignedAdminIds = assignedAdmins.map(admin => admin._id);
            
            if (assignedAdminIds.length === 0) {
                // Manager has no assigned admins - return empty results
                totalLeadsQuery.agent = { $in: [] };
            } else {
                // Filter leads to only show those assigned to the manager's admins
                totalLeadsQuery.agent = { $in: assignedAdminIds };
            }
        } else if (req.user && req.user.role === 'subadmin') {
            totalLeadsQuery.agent = req.user._id;
        } else if (req.user && req.user.role === 'admin') {
            // Reuse cached permissions
            const userPerms = await getCachedUserPermissions(req.user._id);
            if (userPerms?.adminPermissions?.canManageCrmLeads) {
                const subadminIds = await getCachedSubadmins();
                totalLeadsQuery.agent = { $in: [req.user._id, ...subadminIds] };
            } else {
                totalLeadsQuery.agent = req.user._id;
            }
        }
        
        // OPTIMIZED: Run count in parallel with leads fetch if not already done
        const totalLeads = await Lead.countDocuments(totalLeadsQuery);

        // Calculate pagination info
        const totalPages = Math.ceil(totalFiltered / limitNum);
        const hasNextPage = pageNum < totalPages;
        const hasPrevPage = pageNum > 1;

        res.status(200).json({
            success: true,
            data: {
                leads: populatedLeads,
                pagination: {
                    currentPage: pageNum,
                    totalPages,
                    totalLeads,
                    totalFiltered,
                    hasNextPage,
                    hasPrevPage,
                    limit: limitNum,
                    nextPage: hasNextPage ? pageNum + 1 : null,
                    prevPage: hasPrevPage ? pageNum - 1 : null
                }
            }
        });
    } catch (err) {
        console.error("Error fetching leads:", err);
        res.status(500).json({
            success: false,
            message: "Server Error",
            error: err.message
        });
    }
};
// Assign or reassign multiple leads to a specific agent (admin or subadmin)
exports.assignLeadsToAgent = async (req, res) => {
    try {
        const Lead = await getLeadModel();
      
        const { leadIds, agentId } = req.body;

        if (!Array.isArray(leadIds) || leadIds.length === 0 || !agentId) {
            return res.status(400).json({ success: false, msg: 'agentId and leadIds are required' });
        }

        // Validate target agent exists and has appropriate role
        const agentUser = await User.findById(agentId);
        if (!agentUser) {
            return res.status(404).json({ success: false, msg: 'Agent user not found' });
        }
        if (!['admin', 'subadmin', 'superadmin'].includes(agentUser.role)) {
            return res.status(400).json({ success: false, msg: 'Agent must be an admin, subadmin, or superadmin' });
        }

        // If requester is admin, ensure they have permission and can only assign to subadmins - OPTIMIZED with cache
        if (req.user && req.user.role === 'admin') {
            const userPerms = await getCachedUserPermissions(req.user._id);
            if (!userPerms?.adminPermissions?.canManageCrmLeads) {
                return res.status(403).json({ success: false, msg: 'CRM leads assignment not allowed for admin' });
            }
            if (agentUser.role !== 'subadmin') {
                return res.status(400).json({ success: false, msg: 'Admins can assign only to subadmins' });
            }
        }

        // Get leads before update to track old agents
        const leadsToUpdate = await Lead.find({ _id: { $in: leadIds }, isDeleted: false }).select('_id agent');

        // Update leads in bulk
        const result = await Lead.updateMany(
            { _id: { $in: leadIds }, isDeleted: false },
            { $set: { agent: agentId, updatedAt: new Date() } }
        );

        // Log assignment change activities
        for (const lead of leadsToUpdate) {
            let oldAgentName = 'Unassigned';
            if (lead.agent) {
                const oldAgent = await User.findById(lead.agent).select('firstName lastName');
                if (oldAgent) {
                    oldAgentName = `${oldAgent.firstName} ${oldAgent.lastName}`;
                }
            }
            
            await logActivity({
                leadId: lead._id,
                type: 'assignment_change',
                createdBy: req.user,
                changes: {
                    field: 'agent',
                    oldValue: oldAgentName,
                    newValue: `${agentUser.firstName} ${agentUser.lastName}`
                }
            });
        }

        return res.status(200).json({
            success: true,
            msg: `${result.modifiedCount} lead(s) assigned to ${agentUser.firstName} ${agentUser.lastName}`,
            data: { modifiedCount: result.modifiedCount }
        });
    } catch (err) {
        console.error('Error assigning leads:', err);
        return res.status(500).json({ success: false, message: 'Server Error', error: err.message });
    }
};

const getAuthorizedLeadsForBulkAction = async (req, leads) => {
    if (req.user.role === 'superadmin') {
        return leads;
    }

    if (req.user.role === 'admin') {
        const userPerms = await getCachedUserPermissions(req.user._id);
        if (userPerms?.adminPermissions?.canManageCrmLeads) {
            const subadminIds = await getCachedSubadmins();
            const allowedAgents = [req.user._id.toString(), ...subadminIds.map(s => s.toString())];
            return leads.filter(lead => !lead.agent || allowedAgents.includes(lead.agent.toString()));
        }

        return leads.filter(lead => lead.agent && lead.agent.toString() === req.user._id.toString());
    }

    if (req.user.role === 'subadmin') {
        return leads.filter(lead => lead.agent && lead.agent.toString() === req.user._id.toString());
    }

    return [];
};

exports.bulkUpdateLeadStatus = async (req, res) => {
    try {
        const Lead = await getLeadModel();
        const { leadIds, status } = req.body;

        if (!leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
            return res.status(400).json({
                success: false,
                msg: 'No lead IDs provided',
            });
        }

        if (!status || String(status).trim() === '') {
            return res.status(400).json({
                success: false,
                msg: 'Status is required',
            });
        }

        const normalizedStatus = await normalizeLeadStatus(status);
        const leads = await Lead.find({ _id: { $in: leadIds }, isDeleted: false }).select('_id agent status');

        if (leads.length === 0) {
            return res.status(404).json({
                success: false,
                msg: 'No leads found',
            });
        }

        const authorizedLeads = await getAuthorizedLeadsForBulkAction(req, leads);

        if (authorizedLeads.length === 0) {
            return res.status(403).json({
                success: false,
                msg: 'Unauthorized: You do not have permission to update these leads',
            });
        }

        const authorizedLeadIds = authorizedLeads.map(lead => lead._id);
        const leadsWithStatusChange = authorizedLeads.filter(lead => lead.status !== normalizedStatus);

        const result = await Lead.updateMany(
            { _id: { $in: authorizedLeadIds } },
            { $set: { status: normalizedStatus, updatedAt: new Date() } }
        );

        for (const lead of leadsWithStatusChange) {
            await logActivity({
                leadId: lead._id,
                type: 'status_change',
                createdBy: req.user,
                changes: {
                    field: 'status',
                    oldValue: lead.status,
                    newValue: normalizedStatus,
                },
            });
        }

        const skippedCount = leadIds.length - authorizedLeadIds.length;
        const message = skippedCount > 0
            ? `${result.modifiedCount} lead(s) updated to "${normalizedStatus}" (${skippedCount} skipped due to permissions)`
            : `${result.modifiedCount} lead(s) updated to "${normalizedStatus}"`;

        return res.status(200).json({
            success: true,
            msg: message,
            data: {
                modifiedCount: result.modifiedCount,
                skippedCount,
                status: normalizedStatus,
            },
        });
    } catch (err) {
        console.error('Error bulk updating lead status:', err);
        return res.status(500).json({ success: false, message: 'Server Error', error: err.message });
    }
};

exports.deleteLead = async (req, res) => {
    try {
        if (req.user?.role !== 'superadmin') {
            return res.status(403).json({
                success: false,
                msg: 'Unauthorized: Only superadmin can delete leads',
            });
        }

        const Lead = await getLeadModel();
        const lead = await Lead.findById(req.params.id);
        console.log('req.params.id: ', req.params.id);

        if (!lead) {
            return res.status(404).json({
                success: false,
                msg: 'Lead not found'
            });
        }

        // Soft delete by setting isDeleted to true and timestamp
        lead.isDeleted = true;
        lead.deletedAt = new Date();
        await lead.save();

        res.status(200).json({
            success: true,
            msg: 'Lead deleted successfully'
        });
    } catch (err) {
        console.error("Error deleting lead:", err);
        res.status(500).json({
            success: false,
            message: "Server Error",
            error: err.message
        });
    }
};
exports.bulkDeleteLeads = async (req, res) => {
    try {
        if (req.user?.role !== 'superadmin') {
            return res.status(403).json({
                success: false,
                msg: 'Unauthorized: Only superadmin can delete leads',
            });
        }

        const { leadIds } = req.body;
        console.log('req.body: ', req.body);
        const Lead = await getLeadModel();

        if (!leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
            return res.status(400).json({
                success: false,
                msg: 'No lead IDs provided'
            });
        }

        const leads = await Lead.find({ _id: { $in: leadIds } }).select('_id');

        if (leads.length === 0) {
            return res.status(404).json({
                success: false,
                msg: 'No leads found'
            });
        }

        const authorizedLeadIds = leads.map(lead => lead._id);

        const result = await Lead.updateMany(
            { _id: { $in: authorizedLeadIds } },
            { $set: { isDeleted: true, deletedAt: new Date() } }
        );

        res.status(200).json({
            success: true,
            msg: `${result.modifiedCount} leads deleted successfully`,
            data: { 
                deletedCount: result.modifiedCount,
                skippedCount: 0
            }
        });

    } catch (err) {
        console.error("Error bulk deleting leads:", err);
        res.status(500).json({
            success: false,
            message: "Server Error",
            error: err.message
        });
    }
};
exports.deleteAllLeads = async (req, res) => {
    try {
        if (req.user?.role !== 'superadmin') {
            return res.status(403).json({
                success: false,
                msg: 'Unauthorized: Only superadmin can delete leads',
            });
        }

        const Lead = await getLeadModel();
        
        // Check if progress tracking is requested
        const enableProgress = req.query.enableProgress === 'true';

        const query = { isDeleted: false };

        // If progress tracking is enabled, use SSE with batch processing
        if (enableProgress) {
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            res.flushHeaders();

            const sendProgress = (data) => {
                res.write(`data: ${JSON.stringify(data)}\n\n`);
            };

            // Get total count
            const total = await Lead.countDocuments(query);

            if (total === 0) {
                sendProgress({
                    type: 'complete',
                    total: 0,
                    deleted: 0,
                    msg: 'No leads to delete'
                });
                res.end();
                return;
            }

            sendProgress({
                type: 'start',
                total,
                percentage: 0,
                msg: `Starting deletion of ${total} leads...`
            });

            // Process in batches for better performance
            const BATCH_SIZE = 5000; // Larger batch for soft deletes (faster than hard delete)
            let deletedCount = 0;
            let hasMore = true;

            while (hasMore) {
                // Find batch of leads to delete
                const batch = await Lead.find(query)
                    .limit(BATCH_SIZE)
                    .select('_id')
                    .lean();

                if (batch.length === 0) {
                    hasMore = false;
                    break;
                }

                const batchIds = batch.map(lead => lead._id);

                // Soft delete this batch
                const result = await Lead.updateMany(
                    { _id: { $in: batchIds }, isDeleted: false },
                    { $set: { isDeleted: true, deletedAt: new Date() } }
                );

                deletedCount += result.modifiedCount;

                // Send progress update
                const percentage = Math.min(Math.round((deletedCount / total) * 100), 100);
                sendProgress({
                    type: 'progress',
                    total,
                    deleted: deletedCount,
                    remaining: total - deletedCount,
                    percentage,
                    msg: `Deleted ${deletedCount} of ${total} leads...`
                });

                // If we processed less than batch size, we're done
                if (batch.length < BATCH_SIZE) {
                    hasMore = false;
                }
            }

            // Send completion
            sendProgress({
                type: 'complete',
                total,
                deleted: deletedCount,
                percentage: 100,
                success: true,
                msg: `All ${deletedCount} leads deleted successfully`
            });

            res.end();
        } else {
            // Fallback: non-progress version for backward compatibility
            const result = await Lead.updateMany(
                query,
                { $set: { isDeleted: true, deletedAt: new Date() } }
            );

            res.status(200).json({
                success: true,
                msg: `All ${result.modifiedCount} leads deleted successfully`,
                data: { deletedCount: result.modifiedCount }
            });
        }

    } catch (err) {
        console.error("Error deleting all leads:", err);
        
        // Try to send error through SSE if using progress
        if (req.query.enableProgress === 'true') {
            try {
                res.write(`data: ${JSON.stringify({
                    type: 'error',
                    message: err.message || 'Failed to delete leads'
                })}\n\n`);
                res.end();
            } catch (e) {
                if (!res.headersSent) {
                    res.status(500).json({
                        success: false,
                        message: "Server Error",
                        error: err.message
                    });
                }
            }
        } else {
            res.status(500).json({
                success: false,
                message: "Server Error",
                error: err.message
            });
        }
    }
};
exports.editLead = async (req, res) => {
    try {
        const Lead = await getLeadModel();
        const {
            firstName,
            lastName,
            email,
            phone,
            country,
            Brand,
            Address,
            status,
            remarks,
        } = req.body;

        // Validation
        if (!firstName || !lastName) {
            return res.status(400).json({
                success: false,
                msg: 'First name and last name are required'
            });
        }

        const lead = await Lead.findById(req.params.id);
        if (!lead) {
            return res.status(404).json({
                success: false,
                msg: 'Lead not found'
            });
        }

        // ✅ SECURITY: Check record-level authorization
        if (req.user.role === 'subadmin') {
            // Subadmin can only edit their own leads
            if (!lead.agent || lead.agent.toString() !== req.user._id.toString()) {
                return res.status(403).json({
                    success: false,
                    msg: 'Unauthorized: You can only edit your own leads'
                });
            }
        } else if (req.user.role === 'admin') {
            // Admin can edit own leads + subadmin leads (if they have permission) - OPTIMIZED with cache
            const userPerms = await getCachedUserPermissions(req.user._id);
            if (userPerms?.adminPermissions?.canManageCrmLeads) {
                // Admin with permission can edit own + subadmin leads
                const subadminIds = await getCachedSubadmins();
                const allowedAgents = [req.user._id.toString(), ...subadminIds.map(s => s.toString())];
                
                if (lead.agent && !allowedAgents.includes(lead.agent.toString())) {
                    return res.status(403).json({
                        success: false,
                        msg: 'Unauthorized: You can only edit your own leads or subadmin leads'
                    });
                }
            } else {
                // Admin without permission can only edit own leads
                if (!lead.agent || lead.agent.toString() !== req.user._id.toString()) {
                    return res.status(403).json({
                        success: false,
                        msg: 'Unauthorized: You can only edit your own leads'
                    });
                }
            }
        }
        // Superadmin can edit any lead (no check needed)

        // Check if email is being changed and if it conflicts with another lead (only if email is provided)
        if (email && email.trim() !== '' && email !== lead.email) {
            const existingLead = await Lead.findOne({
                email,
                isDeleted: false,
                _id: { $ne: req.params.id }
            });
            if (existingLead) {
                return res.status(400).json({
                    success: false,
                    msg: 'Another lead with this email already exists'
                });
            }
        }

        const formattedPhone = phone ? normalizeLeadPhone(phone) : '';

        // Track changes for activity log
        const changes = [];
        if (lead.firstName !== firstName) changes.push(`firstName: from '${lead.firstName || 'N/A'}' to '${firstName}'`);
        if (lead.lastName !== lastName) changes.push(`lastName: from '${lead.lastName || 'N/A'}' to '${lastName}'`);
        if (lead.email !== email) changes.push(`email: from '${lead.email || 'N/A'}' to '${email}'`);
        if (lead.phone !== formattedPhone) changes.push(`phone: from '${lead.phone || 'N/A'}' to '${formattedPhone}'`);
        if (lead.country !== country) changes.push(`country: from '${lead.country || 'N/A'}' to '${country}'`);
        if (lead.Brand !== Brand) changes.push(`brand: from '${lead.Brand || 'N/A'}' to '${Brand}'`);
        if (lead.Address !== Address) changes.push(`address: from '${lead.Address || 'N/A'}' to '${Address}'`);
        if (lead.remarks !== remarks) changes.push(`remarks: from '${lead.remarks || 'N/A'}' to '${remarks || ''}'`);
        
        // Track status change separately
        const normalizedStatus = await normalizeLeadStatus(status);
        const statusChanged = lead.status !== normalizedStatus;
        const oldStatus = lead.status;

        // Update lead
        lead.firstName = firstName;
        lead.lastName = lastName;
        lead.email = email;
        lead.phone = formattedPhone;
        lead.country = country;
        lead.Brand = Brand;
        lead.Address = Address;
        lead.status = normalizedStatus;
        if (remarks !== undefined) lead.remarks = remarks || null;

        await lead.save();

        // Log activities
        if (changes.length > 0) {
            await logActivity({
                leadId: lead._id,
                type: 'field_update',
                createdBy: req.user,
                changes: {
                    description: changes.join('; ')
                }
            });
        }

        if (statusChanged) {
            await logActivity({
                leadId: lead._id,
                type: 'status_change',
                createdBy: req.user,
                changes: {
                    field: 'status',
                    oldValue: oldStatus,
                    newValue: normalizedStatus
                }
            });
        }

        res.status(200).json({
            success: true,
            msg: 'Lead updated successfully',
            data: { lead }
        });

    } catch (err) {
        console.error("Error updating lead:", err);
        res.status(500).json({
            success: false,
            message: "Server Error",
            error: err.message
        });
    }
};
exports.getLeadBrands = async (req, res) => {
    try {
        const Lead = await getLeadModel();
        const query = {
            isDeleted: false,
            Brand: { $exists: true, $nin: [null, ''] },
        };

        await applyLeadVisibilityToQuery(query, req.user);

        const brandsRaw = await Lead.distinct('Brand', query);
        const brands = [...new Set(
            brandsRaw
                .map((brand) => String(brand).trim())
                .filter(Boolean)
        )].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

        res.status(200).json({ success: true, brands });
    } catch (err) {
        console.error('Error fetching lead brands:', err);
        res.status(500).json({
            success: false,
            message: 'Server Error',
            error: err.message,
        });
    }
};

exports.exportLeads = async (req, res) => {
    try {
        console.log("an", req.query);
        const Lead = await getLeadModel();
        const { search, status, country, countrySearch, brandSearch, agent, fields } = req.query;

        // Build query (same as getLeads)
        const query = { isDeleted: false };

        if (search) {
            query.$or = [
                { firstName: { $regex: search, $options: "i" } },
                { lastName: { $regex: search, $options: "i" } },
                { email: { $regex: search, $options: "i" } },
                { phone: { $regex: search, $options: "i" } },
                { Brand: { $regex: search, $options: "i" } },
                { Address: { $regex: search, $options: "i" } }
            ];
        }

        if (status && status !== '') query.status = status;
        applyCountryFilter(query, country);
        applyCountrySearchFilter(query, countrySearch);
        applyBrandSearchFilter(query, brandSearch);
        if (agent && agent !== '') query.agent = agent;

        await applyLeadVisibilityToQuery(query, req.user);

        // Get all leads matching the filters (no pagination for export)
        const leads = await Lead.find(query).sort({ createdAt: -1 });

        // Define available fields and their headers
        const availableFields = {
            firstName: 'First Name',
            lastName: 'Last Name',
            email: 'Email',
            phone: 'Phone',
            country: 'Country',
            Brand: 'Brand',
            Address: 'Address',
            status: 'Status',
            createdAt: 'Created Date'
        };

        // Determine which fields to export
        let exportFields = Object.keys(availableFields);
        if (fields) {
            exportFields = fields.split(',').filter(field => availableFields[field]);
        }

        // Create CSV headers
        const headers = exportFields.map(field => availableFields[field]);
        let csvContent = headers.join(',') + '\n';

        // Create CSV rows
        leads.forEach(lead => {
            const row = exportFields.map(field => {
                let value = lead[field] || '';

                // Format dates
                if (field === 'createdAt') {
                    value = new Date(value).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric'
                    });
                }

                // Format phone numbers to prevent scientific notation
                if (field === 'phone') {
                    // Convert to string and ensure it's treated as text
                    // Add a tab character prefix to force Excel to treat it as text
                    if (value) {
                        return `"\t${String(value).replace(/"/g, '""')}"`;
                    }
                    return '""';
                }

                // Escape CSV special characters and wrap in quotes
                return `"${String(value).replace(/"/g, '""')}"`;
            });
            csvContent += row.join(',') + '\n';
        });

        // Set response headers for file download
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=leads-export-${new Date().toISOString().split('T')[0]}.csv`);

        res.status(200).send(csvContent);



    } catch (err) {
        console.error("Error fetching leads:", err);
        res.status(500).json({
            success: false,
            message: "Server Error",
            error: err.message
        });
    }
};

// List deleted leads (recycle bin)
exports.getDeletedLeads = async (req, res) => {
    try {
        const Lead = await getLeadModel();
        const { page = 1, limit = 100, search, status, agent } = req.query;

        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const skip = (pageNum - 1) * limitNum;

        const query = { isDeleted: true };

        if (search) {
            const searchTrimmed = String(search).trim();
            const regexGlobal = { $regex: searchTrimmed, $options: "i" };
            const nameRegex = new RegExp(escapeRegex(searchTrimmed), 'i');
            const parts = searchTrimmed.split(/\s+/);
            query.$or = [
                { firstName: regexGlobal },
                { lastName: regexGlobal },
                { email: regexGlobal },
                { phone: regexGlobal },
                { Brand: regexGlobal },
                { Address: regexGlobal },
                { $expr: { $regexMatch: { input: { $concat: ['$firstName', ' ', '$lastName'] }, regex: nameRegex } } }
            ];
            if (parts.length >= 2) {
                const first = new RegExp(escapeRegex(parts[0]), 'i');
                const last = new RegExp(escapeRegex(parts.slice(1).join(' ')), 'i');
                query.$or.push({ $and: [{ firstName: first }, { lastName: last }] });
                query.$or.push({ $and: [{ firstName: last }, { lastName: first }] });
            }
        }
        if (status && status !== '') query.status = status;
        if (agent && agent !== '') query.agent = agent;

        // Visibility: subadmin only self; admin self + subadmins (if allowed)
        if (req.user && req.user.role === 'subadmin') {
            query.agent = req.user._id;
        } else if (req.user && req.user.role === 'admin') {
            const userPerms = await getCachedUserPermissions(req.user._id);
            if (userPerms?.adminPermissions?.canManageCrmLeads) {
                const subadminIds = await getCachedSubadmins();
                query.agent = { $in: [req.user._id, ...subadminIds] };
            } else {
                query.agent = req.user._id;
            }
        }

        const [leadsRaw, totalFiltered] = await Promise.all([
            Lead.find(query).sort({ deletedAt: -1 }).skip(skip).limit(limitNum).lean(),
            Lead.countDocuments(query)
        ]);

        // Manual populate agent from main DB
        const agentIds = leadsRaw.map(l => l.agent).filter(Boolean);
        const agents = await User.find({ _id: { $in: agentIds } }).select('firstName lastName email role').lean();
        const agentMap = agents.reduce((m, a) => { m[a._id.toString()] = a; return m; }, {});
        const leads = leadsRaw.map(l => ({
            ...l,
            agent: l.agent ? agentMap[l.agent.toString()] || null : null,
        }));

        const totalPages = Math.ceil(totalFiltered / limitNum);

        res.status(200).json({
            success: true,
            data: {
                leads,
                pagination: {
                    currentPage: pageNum,
                    totalPages,
                    totalFiltered,
                    limit: limitNum,
                }
            }
        });
    } catch (err) {
        console.error('Error fetching deleted leads:', err);
        res.status(500).json({ success: false, message: 'Server Error', error: err.message });
    }
};

// Restore a soft-deleted lead
exports.restoreLead = async (req, res) => {
    try {
        const Lead = await getLeadModel();
        const lead = await Lead.findById(req.params.id);
        if (!lead || !lead.isDeleted) return res.status(404).json({ success: false, msg: 'Lead not found or not deleted' });
        lead.isDeleted = false;
        lead.deletedAt = null;
        await lead.save();
        res.status(200).json({ success: true, msg: 'Lead restored successfully' });
    } catch (err) {
        console.error('Error restoring lead:', err);
        res.status(500).json({ success: false, message: 'Server Error', error: err.message });
    }
};

// Permanently delete a lead
exports.hardDeleteLead = async (req, res) => {
    try {
        const Lead = await getLeadModel();
        const result = await Lead.deleteOne({ _id: req.params.id, isDeleted: true });
        if (result.deletedCount === 0) return res.status(404).json({ success: false, msg: 'Lead not found or not in recycle bin' });
        res.status(200).json({ success: true, msg: 'Lead permanently deleted' });
    } catch (err) {
        console.error('Error hard deleting lead:', err);
        res.status(500).json({ success: false, message: 'Server Error', error: err.message });
    }
};

exports.bulkRestoreLeads = async (req, res) => {
    try {
        const { leadIds } = req.body;
        const Lead = await getLeadModel();
        const result = await Lead.updateMany({ _id: { $in: leadIds }, isDeleted: true }, { $set: { isDeleted: false, deletedAt: null } });
        res.status(200).json({ success: true, msg: `${result.modifiedCount} lead(s) restored`, data: { restored: result.modifiedCount } });
    } catch (err) {
        console.error('Error bulk restoring leads:', err);
        res.status(500).json({ success: false, message: 'Server Error', error: err.message });
    }
};

exports.bulkHardDeleteLeads = async (req, res) => {
    try {
        const { leadIds } = req.body;
        const Lead = await getLeadModel();
        const result = await Lead.deleteMany({ _id: { $in: leadIds }, isDeleted: true });
        res.status(200).json({ success: true, msg: `${result.deletedCount} lead(s) permanently deleted`, data: { deleted: result.deletedCount } });
    } catch (err) {
        console.error('Error bulk hard deleting leads:', err);
        res.status(500).json({ success: false, message: 'Server Error', error: err.message });
    }
};

// Restore ALL deleted leads with batch processing and progress tracking
exports.restoreAllLeads = async (req, res) => {
    try {
        const Lead = await getLeadModel();
        
        // Enable Server-Sent Events for progress tracking
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders();

        const sendProgress = (data) => {
            res.write(`data: ${JSON.stringify(data)}\n\n`);
        };

        // Get total count of deleted leads
        const total = await Lead.countDocuments({ isDeleted: true });

        if (total === 0) {
            sendProgress({
                type: 'complete',
                total: 0,
                restored: 0,
                msg: 'No leads to restore'
            });
            res.end();
            return;
        }

        sendProgress({
            type: 'start',
            total,
            percentage: 0,
            msg: `Starting restore of ${total} leads...`
        });

        // Process in batches for better performance
        const BATCH_SIZE = 2000;
        let restoredCount = 0;
        let hasMore = true;

        while (hasMore) {
            // Find batch of deleted leads
            const batch = await Lead.find({ isDeleted: true })
                .limit(BATCH_SIZE)
                .select('_id')
                .lean();

            if (batch.length === 0) {
                hasMore = false;
                break;
            }

            const batchIds = batch.map(lead => lead._id);

            // Restore this batch
            const result = await Lead.updateMany(
                { _id: { $in: batchIds }, isDeleted: true },
                { $set: { isDeleted: false, deletedAt: null } }
            );

            restoredCount += result.modifiedCount;

            // Send progress update
            const percentage = Math.min(Math.round((restoredCount / total) * 100), 100);
            sendProgress({
                type: 'progress',
                total,
                restored: restoredCount,
                remaining: total - restoredCount,
                percentage,
                msg: `Restored ${restoredCount} of ${total} leads...`
            });

            // If we restored less than batch size, we're done
            if (batch.length < BATCH_SIZE) {
                hasMore = false;
            }
        }

        // Send completion
        sendProgress({
            type: 'complete',
            total,
            restored: restoredCount,
            percentage: 100,
            success: true,
            msg: `All ${restoredCount} lead(s) restored from recycle bin`
        });

        res.end();
    } catch (err) {
        console.error('Error restoring all leads:', err);
        
        // Try to send error through SSE if headers not sent yet
        try {
            res.write(`data: ${JSON.stringify({
                type: 'error',
                message: err.message || 'Failed to restore leads'
            })}\n\n`);
            res.end();
        } catch (e) {
            // If SSE fails, send regular error response
            if (!res.headersSent) {
                res.status(500).json({ 
                    success: false, 
                    message: 'Server Error', 
                    error: err.message 
                });
            }
        }
    }
};

// Permanently delete ALL leads from recycle bin with batch processing and progress tracking
exports.hardDeleteAllLeads = async (req, res) => {
    try {
        const Lead = await getLeadModel();
        
        // Enable Server-Sent Events for progress tracking
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders();

        const sendProgress = (data) => {
            res.write(`data: ${JSON.stringify(data)}\n\n`);
        };

        // Get total count of deleted leads
        const total = await Lead.countDocuments({ isDeleted: true });

        if (total === 0) {
            sendProgress({
                type: 'complete',
                total: 0,
                deleted: 0,
                msg: 'No leads to delete'
            });
            res.end();
            return;
        }

        sendProgress({
            type: 'start',
            total,
            percentage: 0,
            msg: `Starting permanent deletion of ${total} leads...`
        });

        // Process in batches for better performance
        const BATCH_SIZE = 2000;
        let deletedCount = 0;
        let hasMore = true;

        while (hasMore) {
            // Find batch of deleted leads
            const batch = await Lead.find({ isDeleted: true })
                .limit(BATCH_SIZE)
                .select('_id')
                .lean();

            if (batch.length === 0) {
                hasMore = false;
                break;
            }

            const batchIds = batch.map(lead => lead._id);

            // Permanently delete this batch
            const result = await Lead.deleteMany({ _id: { $in: batchIds }, isDeleted: true });

            deletedCount += result.deletedCount;

            // Send progress update
            const percentage = Math.min(Math.round((deletedCount / total) * 100), 100);
            sendProgress({
                type: 'progress',
                total,
                deleted: deletedCount,
                remaining: total - deletedCount,
                percentage,
                msg: `Deleted ${deletedCount} of ${total} leads...`
            });

            // If we deleted less than batch size, we're done
            if (batch.length < BATCH_SIZE) {
                hasMore = false;
            }
        }

        // Send completion
        sendProgress({
            type: 'complete',
            total,
            deleted: deletedCount,
            percentage: 100,
            success: true,
            msg: `All ${deletedCount} lead(s) permanently deleted from recycle bin`
        });

        res.end();
    } catch (err) {
        console.error('Error permanently deleting all leads:', err);
        
        // Try to send error through SSE if headers not sent yet
        try {
            res.write(`data: ${JSON.stringify({
                type: 'error',
                message: err.message || 'Failed to delete leads'
            })}\n\n`);
            res.end();
        } catch (e) {
            // If SSE fails, send regular error response
            if (!res.headersSent) {
                res.status(500).json({ 
                    success: false, 
                    message: 'Server Error', 
                    error: err.message 
                });
            }
        }
    }
};
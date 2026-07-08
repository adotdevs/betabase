import React, { useState, useEffect } from 'react';
import {
    Box,
    Card,
    CardContent,
    Typography,
    TextField,
    Button,
    Stack,
    Select,
    MenuItem,
    FormControl,
    InputLabel,
    CircularProgress,
    Alert,
    Divider,
    Accordion,
    AccordionSummary,
    AccordionDetails,
    Chip,
    IconButton,
    AppBar,
    Toolbar,
} from '@mui/material';
import {
    Save,
    Settings,
    Refresh,
    ExpandMore,
    Add,
    Delete,
    Menu as MenuIcon,
} from '@mui/icons-material';
import { Checkbox, FormControlLabel } from '@mui/material';
import { toast } from 'react-toastify';
import { getAiInstructionsApi, updateAiInstructionsApi, allUsersApi } from '../../../Api/Service';
import Sidebar from './Sidebar.js';
import CrmAppBarActions from './components/CrmAppBarActions';
import { useAuthUser } from 'react-auth-kit';
import { useNavigate } from 'react-router-dom';

const AIInstructions = () => {
    const authUser = useAuthUser();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
    const [isMobileMenu, setIsMobileMenu] = useState(false);
    
    const [formData, setFormData] = useState({
        systemPrompt: '',
        personality: '',
        tone: 'friendly',
        maxWords: 20,
        unlimitedWords: false,
        assistantName: 'Alex',
        greetingTemplate: '',
        instructions: '',
        responseGeneration: {
            maxHistoryMessages: 20,
            historyFormat: 'numbered',
            includeBotHistory: true,
            preventRepetition: true,
            topicDetection: {
                enabled: true,
                patterns: []
            },
            acknowledgmentHandling: {
                enabled: true,
                words: ['okay', 'ok', 'yes', 'yeah', 'yep', 'sure', 'alright', 'fine'],
                responseTemplates: ['Great', 'Perfect', 'Thanks', 'Got it']
            },
            enhanceFirstMessage: true,
            retryConfig: {
                maxRetries: 3,
                enabled: true
            },
            tokenConfig: {
                wordsToTokensMultiplier: 2.5,
                minTokens: 50,
                maxTokens: 512,
                historyLimit: 20
            }
        }
    });

    const [errors, setErrors] = useState({});

    useEffect(() => {
        // Permission gate for admin
        const checkPermissions = async () => {
            try {
                const me = authUser && authUser();
                if (me?.user?.role === 'admin') {
                    const resp = await allUsersApi({ search: me.user._id, limit: 1 });
                    const updated = resp?.success && resp?.allUsers?.length ? resp.allUsers[0] : me.user;
                    if (!updated?.adminPermissions?.canAccessAiInstructions) {
                        toast.error('Access denied to AI Instructions');
                        navigate('/admin/dashboard');
                        return;
                    }
                }
            } catch (e) {
                // Rely on backend 403 if this fails
            }
        };
        checkPermissions();
        loadInstructions();
    }, []);

    const loadInstructions = async () => {
        try {
            setLoading(true);
            const response = await getAiInstructionsApi();
            if (response.success) {
                const maxWords = response.instructions.maxWords;
                const unlimitedWords = maxWords === 0 || maxWords === null || maxWords === -1;
                setFormData({
                    systemPrompt: response.instructions.systemPrompt || '',
                    personality: response.instructions.personality || '',
                    tone: response.instructions.tone || 'friendly',
                    maxWords: unlimitedWords ? 20 : (maxWords || 20),
                    unlimitedWords: unlimitedWords,
                    assistantName: response.instructions.assistantName || 'Alex',
                    greetingTemplate: response.instructions.greetingTemplate || '',
                    instructions: response.instructions.instructions || '',
                    responseGeneration: response.instructions.responseGeneration || {
                        maxHistoryMessages: 20,
                        historyFormat: 'numbered',
                        includeBotHistory: true,
                        preventRepetition: true,
                        topicDetection: {
                            enabled: true,
                            patterns: []
                        },
                        acknowledgmentHandling: {
                            enabled: true,
                            words: ['okay', 'ok', 'yes', 'yeah', 'yep', 'sure', 'alright', 'fine'],
                            responseTemplates: ['Great', 'Perfect', 'Thanks', 'Got it']
                        },
                        enhanceFirstMessage: true,
                        retryConfig: {
                            maxRetries: 3,
                            enabled: true
                        },
                        tokenConfig: {
                            wordsToTokensMultiplier: 2.5,
                            minTokens: 50,
                            maxTokens: 512,
                            historyLimit: 20
                        }
                    }
                });
                setErrors({});
            } else {
                toast.error(response.msg || 'Failed to load instructions');
            }
        } catch (error) {
            console.error('Error loading instructions:', error);
            toast.error('Failed to load AI instructions');
        } finally {
            setLoading(false);
        }
    };

    const handleChange = (field) => (event) => {
        if (field === 'unlimitedWords') {
            const checked = event.target.checked;
            setFormData(prev => ({
                ...prev,
                unlimitedWords: checked,
                maxWords: checked ? 0 : (prev.maxWords || 20)
            }));
            if (errors.maxWords) {
                setErrors(prev => {
                    const newErrors = { ...prev };
                    delete newErrors.maxWords;
                    return newErrors;
                });
            }
        } else if (field.startsWith('responseGeneration.')) {
            const path = field.split('.');
            setFormData(prev => {
                const newData = { ...prev };
                let current = newData;
                for (let i = 0; i < path.length - 1; i++) {
                    if (!current[path[i]]) current[path[i]] = {};
                    current = current[path[i]];
                }
                const value = path[path.length - 1] === 'enabled' || path[path.length - 1] === 'includeBotHistory' || path[path.length - 1] === 'preventRepetition' || path[path.length - 1] === 'enhanceFirstMessage'
                    ? event.target.checked
                    : path.includes('maxHistoryMessages') || path.includes('maxRetries') || path.includes('wordsToTokensMultiplier') || path.includes('minTokens') || path.includes('maxTokens') || path.includes('historyLimit')
                    ? parseFloat(event.target.value) || 0
                    : event.target.value;
                current[path[path.length - 1]] = value;
                return newData;
            });
        } else {
            const value = field === 'maxWords' ? parseInt(event.target.value) || 0 : event.target.value;
            setFormData(prev => ({
                ...prev,
                [field]: value,
                unlimitedWords: field === 'maxWords' && value > 0 ? false : prev.unlimitedWords
            }));
            if (errors[field]) {
                setErrors(prev => {
                    const newErrors = { ...prev };
                    delete newErrors[field];
                    return newErrors;
                });
            }
        }
    };

    const handleAddTopicPattern = () => {
        setFormData(prev => ({
            ...prev,
            responseGeneration: {
                ...prev.responseGeneration,
                topicDetection: {
                    ...prev.responseGeneration.topicDetection,
                    patterns: [...(prev.responseGeneration.topicDetection.patterns || []), { pattern: '', topic: '' }]
                }
            }
        }));
    };

    const handleRemoveTopicPattern = (index) => {
        setFormData(prev => ({
            ...prev,
            responseGeneration: {
                ...prev.responseGeneration,
                topicDetection: {
                    ...prev.responseGeneration.topicDetection,
                    patterns: prev.responseGeneration.topicDetection.patterns.filter((_, i) => i !== index)
                }
            }
        }));
    };

    const handleTopicPatternChange = (index, field, value) => {
        setFormData(prev => {
            const newPatterns = [...prev.responseGeneration.topicDetection.patterns];
            newPatterns[index] = { ...newPatterns[index], [field]: value };
            return {
                ...prev,
                responseGeneration: {
                    ...prev.responseGeneration,
                    topicDetection: {
                        ...prev.responseGeneration.topicDetection,
                        patterns: newPatterns
                    }
                }
            };
        });
    };

    const handleAddAcknowledgmentWord = () => {
        setFormData(prev => ({
            ...prev,
            responseGeneration: {
                ...prev.responseGeneration,
                acknowledgmentHandling: {
                    ...prev.responseGeneration.acknowledgmentHandling,
                    words: [...(prev.responseGeneration.acknowledgmentHandling.words || []), '']
                }
            }
        }));
    };

    const handleRemoveAcknowledgmentWord = (index) => {
        setFormData(prev => ({
            ...prev,
            responseGeneration: {
                ...prev.responseGeneration,
                acknowledgmentHandling: {
                    ...prev.responseGeneration.acknowledgmentHandling,
                    words: prev.responseGeneration.acknowledgmentHandling.words.filter((_, i) => i !== index)
                }
            }
        }));
    };

    const handleAcknowledgmentWordChange = (index, value) => {
        setFormData(prev => {
            const newWords = [...prev.responseGeneration.acknowledgmentHandling.words];
            newWords[index] = value;
            return {
                ...prev,
                responseGeneration: {
                    ...prev.responseGeneration,
                    acknowledgmentHandling: {
                        ...prev.responseGeneration.acknowledgmentHandling,
                        words: newWords
                    }
                }
            };
        });
    };

    const handleAddResponseTemplate = () => {
        setFormData(prev => ({
            ...prev,
            responseGeneration: {
                ...prev.responseGeneration,
                acknowledgmentHandling: {
                    ...prev.responseGeneration.acknowledgmentHandling,
                    responseTemplates: [...(prev.responseGeneration.acknowledgmentHandling.responseTemplates || []), '']
                }
            }
        }));
    };

    const handleRemoveResponseTemplate = (index) => {
        setFormData(prev => ({
            ...prev,
            responseGeneration: {
                ...prev.responseGeneration,
                acknowledgmentHandling: {
                    ...prev.responseGeneration.acknowledgmentHandling,
                    responseTemplates: prev.responseGeneration.acknowledgmentHandling.responseTemplates.filter((_, i) => i !== index)
                }
            }
        }));
    };

    const handleResponseTemplateChange = (index, value) => {
        setFormData(prev => {
            const newTemplates = [...prev.responseGeneration.acknowledgmentHandling.responseTemplates];
            newTemplates[index] = value;
            return {
                ...prev,
                responseGeneration: {
                    ...prev.responseGeneration,
                    acknowledgmentHandling: {
                        ...prev.responseGeneration.acknowledgmentHandling,
                        responseTemplates: newTemplates
                    }
                }
            };
        });
    };

    const validate = () => {
        const newErrors = {};
        
        if (!formData.systemPrompt.trim()) {
            newErrors.systemPrompt = 'System prompt is required';
        }
        
        if (!formData.personality.trim()) {
            newErrors.personality = 'Personality is required';
        }
        
        if (!formData.tone) {
            newErrors.tone = 'Tone is required';
        }
        
        if (!formData.unlimitedWords) {
            if (!formData.maxWords || formData.maxWords < 1 || formData.maxWords > 1000) {
                newErrors.maxWords = 'Max words must be between 1 and 1000';
            }
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSave = async () => {
        if (!validate()) {
            toast.error('Please fix the errors before saving');
            return;
        }

        try {
            setSaving(true);
            
            const dataToSend = {
                systemPrompt: formData.systemPrompt,
                personality: formData.personality,
                tone: formData.tone,
                maxWords: formData.unlimitedWords ? 0 : formData.maxWords,
                assistantName: formData.assistantName || 'AI Assistant',
                greetingTemplate: formData.greetingTemplate || '',
                instructions: formData.instructions || '',
                unlimitedWords: formData.unlimitedWords,
                responseGeneration: formData.responseGeneration
            };
            
            const response = await updateAiInstructionsApi(dataToSend);
            if (response.success) {
                toast.success('AI instructions updated successfully! Changes will be applied to new calls.');
                setTimeout(() => {
                    console.log('✅ Instructions saved and cache should be reloaded');
                }, 1000);
            } else {
                toast.error(response.msg || 'Failed to update instructions');
            }
        } catch (error) {
            console.error('Error saving instructions:', error);
            if (error.response?.data?.message) {
                toast.error(error.response.data.message);
            } else {
                toast.error('Failed to save AI instructions');
            }
        } finally {
            setSaving(false);
        }
    };

    useEffect(() => {
        if (authUser().user.role === "admin" ||  authUser().user.role === "superadmin") {
            return;
        } else if (authUser().user.role === "user") {
            navigate("/dashboard");
            return;
        }else{
            navigate("/admin/dashboard");
            return;
        }
    }, []);

    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
                <CircularProgress />
            </Box>
        );
    }

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
                                onClick={() => setIsMobileMenu(!isMobileMenu)}
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
                                    AI Instructions Editor
                                </Typography>
                                <Typography variant="body2" color="text.secondary">
                                    Configure how your AI assistant behaves during calls
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
                    <Card>
                        <CardContent>

                        <Alert severity="info" sx={{ mb: 3 }}>
                            <Typography variant="body2" component="div">
                                <strong>📚 How This Works:</strong> This page controls how your AI assistant behaves during phone calls. 
                                All settings are saved automatically and apply to new calls immediately. 
                                <strong> Zero delay during calls</strong> - instructions are cached in memory for instant access.
                            </Typography>
                        </Alert>

                        <Stack spacing={3}>
                            <Card variant="outlined" sx={{ 
                                bgcolor: (theme) => theme.palette.mode === 'dark' 
                                    ? 'rgba(118, 52, 220, 0.15)' 
                                    : 'rgba(118, 52, 220, 0.08)', 
                                p: 2, 
                                mb: 2,
                                borderColor: 'primary.main',
                                borderWidth: 1
                            }}>
                                <Typography variant="h6" gutterBottom sx={{ color: 'primary.main', fontWeight: 'bold' }}>
                                    🎯 System Prompt (Most Important!)
                                </Typography>
                                <Typography variant="body2" sx={{ mb: 1, color: 'text.primary' }}>
                                    <strong>What it does:</strong> This is the MAIN instruction file that tells your AI assistant how to behave during calls.
                                </Typography>
                                <Typography variant="body2" sx={{ mb: 1, color: 'text.primary' }}>
                                    <strong>What to include:</strong> Write instructions like "You are Helen, a friendly assistant. Always greet customers warmly. Ask about their work position. Never repeat questions you already asked."
                                </Typography>
                                <Typography variant="body2" sx={{ color: 'error.main', fontWeight: 'bold' }}>
                                    ⚠️ IMPORTANT: Only write INSTRUCTIONS (how to behave), NOT example conversations. If you write "Say: Hello, how are you?", the AI will literally say that every time!
                                </Typography>
                            </Card>
                            <TextField
                                label="System Prompt"
                                multiline
                                rows={8}
                                fullWidth
                                value={formData.systemPrompt}
                                onChange={handleChange('systemPrompt')}
                                error={!!errors.systemPrompt}
                                helperText={errors.systemPrompt || 'Write clear instructions on HOW the AI should behave. Example: "You are Helen. Always greet customers. Ask about their work position. Never repeat questions." Do NOT write example conversations or things to say word-for-word.'}
                                required
                            />

                            <TextField
                                label="Personality"
                                fullWidth
                                value={formData.personality}
                                onChange={handleChange('personality')}
                                error={!!errors.personality}
                                helperText={errors.personality || '💡 What it does: Describes the AI\'s character. Example: "Warm, friendly, and professional" or "Casual and approachable". This helps the AI match the right tone.'}
                                required
                            />

                            <FormControl fullWidth error={!!errors.tone}>
                                <InputLabel>Tone</InputLabel>
                                <Select
                                    value={formData.tone}
                                    onChange={handleChange('tone')}
                                    label="Tone"
                                    required
                                >
                                    <MenuItem value="friendly">Friendly - Warm and approachable</MenuItem>
                                    <MenuItem value="professional">Professional - Business-like and formal</MenuItem>
                                    <MenuItem value="casual">Casual - Relaxed and informal</MenuItem>
                                    <MenuItem value="formal">Formal - Very proper and official</MenuItem>
                                    <MenuItem value="empathetic">Empathetic - Understanding and caring</MenuItem>
                                </Select>
                                <Typography variant="caption" sx={{ mt: 0.5, ml: 1.75, color: 'text.secondary' }}>
                                    💡 What it does: Sets the overall communication style. Choose based on your business type and customer expectations.
                                </Typography>
                                {errors.tone && <Typography variant="caption" color="error" sx={{ mt: 0.5, ml: 1.75 }}>{errors.tone}</Typography>}
                            </FormControl>

                            <Card variant="outlined" sx={{ 
                                bgcolor: (theme) => theme.palette.mode === 'dark' 
                                    ? 'rgba(237, 108, 2, 0.15)' 
                                    : 'rgba(237, 108, 2, 0.08)', 
                                p: 2, 
                                mb: 2,
                                borderColor: 'warning.main',
                                borderWidth: 1
                            }}>
                                <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 'bold', color: 'text.primary' }}>
                                    📏 Response Length Control
                                </Typography>
                                <Typography variant="body2" sx={{ mb: 1, color: 'text.primary' }}>
                                    <strong>What it does:</strong> Controls how long the AI's responses can be. Shorter responses (20-30 words) are better for phone calls - they're faster and keep customers engaged.
                                </Typography>
                                <Typography variant="body2" sx={{ color: 'text.primary' }}>
                                    <strong>Recommendation:</strong> Use 20-30 words for phone calls. Only use "Unlimited" if you need very detailed explanations.
                                </Typography>
                            </Card>
                            <FormControlLabel
                                control={
                                    <Checkbox
                                        checked={formData.unlimitedWords}
                                        onChange={handleChange('unlimitedWords')}
                                    />
                                }
                                label="Unlimited words (no response length limit) - Use only if you need very long responses"
                            />
                            
                            <TextField
                                label="Max Words Per Response"
                                type="number"
                                fullWidth
                                value={formData.maxWords}
                                onChange={handleChange('maxWords')}
                                error={!!errors.maxWords}
                                helperText={
                                    formData.unlimitedWords 
                                        ? '✅ Unlimited words enabled - AI can give very long responses'
                                        : (errors.maxWords || '💡 Recommended: 20-30 words for phone calls. This limits how many words the AI can say in one response. Shorter = faster calls.')
                                }
                                inputProps={{ min: 1, max: 1000 }}
                                disabled={formData.unlimitedWords}
                                required={!formData.unlimitedWords}
                            />

                            <TextField
                                label="Assistant Name"
                                fullWidth
                                value={formData.assistantName}
                                onChange={handleChange('assistantName')}
                                helperText="💡 What it does: The name your AI will use when introducing itself. Example: 'Helen' or 'Sarah'. You can use {'{'}assistantName{'}'} in the greeting template below to automatically insert this name."
                            />

                            <Card variant="outlined" sx={{ 
                                bgcolor: (theme) => theme.palette.mode === 'dark' 
                                    ? 'rgba(46, 125, 50, 0.15)' 
                                    : 'rgba(46, 125, 50, 0.08)', 
                                p: 2, 
                                mb: 2,
                                borderColor: 'success.main',
                                borderWidth: 1
                            }}>
                                <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 'bold', color: 'text.primary' }}>
                                    👋 Greeting Template
                                </Typography>
                                <Typography variant="body2" sx={{ mb: 1, color: 'text.primary' }}>
                                    <strong>What it does:</strong> This is the EXACT first thing your AI will say when a call starts. Write it word-for-word as you want it spoken.
                                </Typography>
                                <Typography variant="body2" sx={{ color: 'text.primary' }}>
                                    <strong>Example:</strong> "Hello {'{'}name{'}'}, this is {'{'}assistantName{'}'} from One Path Direct. How are you today?"
                                </Typography>
                                <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1 }}>
                                    💡 Tip: Use placeholders like {'{'}name{'}'} or {'{'}assistantName{'}'} to personalize the greeting. See the placeholders guide below.
                                </Typography>
                            </Card>
                            <TextField
                                label="Greeting Template"
                                multiline
                                rows={4}
                                fullWidth
                                value={formData.greetingTemplate}
                                onChange={handleChange('greetingTemplate')}
                                helperText="💡 Write the EXACT greeting text here. Use placeholders like {'{'}name{'}'} or {'{'}assistantName{'}'} to personalize. This is what the AI will say word-for-word at the start of calls."
                            />

                            <Card variant="outlined" sx={{ bgcolor: 'background.default', p: 2 }}>
                                <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 'bold', mb: 1 }}>
                                    📝 Available Placeholders for Greeting Template:
                                </Typography>
                                <Typography variant="caption" sx={{ mb: 2, display: 'block', color: 'text.secondary' }}>
                                    <strong>Case-insensitive:</strong> All placeholders work regardless of case, spaces, or format. Examples: {'{'}firstName{'}'}, {'{'}FirstName{'}'}, {'{'}first name{'}'}, {'{'}FIRST NAME{'}'}, [FirstName], [first name] all work!
                                </Typography>
                                <Stack spacing={1}>
                                    <Typography variant="body2">
                                        <strong>First Name:</strong> {'{'}name{'}'}, {'{'}firstName{'}'}, {'{'}FirstName{'}'}, {'{'}first name{'}'}, {'{'}FIRST NAME{'}'}, [FirstName], [first name], [FIRST NAME] → Lead's first name
                                    </Typography>
                                    <Typography variant="body2">
                                        <strong>Last Name:</strong> {'{'}lastName{'}'}, {'{'}LastName{'}'}, {'{'}last name{'}'}, {'{'}LAST NAME{'}'}, [LastName], [last name], [LAST NAME] → Lead's last name
                                    </Typography>
                                    <Typography variant="body2">
                                        <strong>Full Name:</strong> {'{'}fullName{'}'}, {'{'}FullName{'}'}, {'{'}full name{'}'}, {'{'}FULL NAME{'}'}, [Name], [FullName], [full name] → Lead's full name (first + last)
                                    </Typography>
                                    <Typography variant="body2">
                                        <strong>Assistant Name:</strong> {'{'}assistantName{'}'}, {'{'}AssistantName{'}'}, {'{'}assistant name{'}'}, {'{'}ASSISTANT NAME{'}'}, [Your Name], [your name], [YOUR NAME] → Assistant name (set above)
                                    </Typography>
                                    <Typography variant="body2">
                                        <strong>Company/Brand:</strong> {'{'}companyName{'}'}, {'{'}CompanyName{'}'}, {'{'}company name{'}'}, {'{'}company{'}'}, {'{'}brand{'}'}, [COMPANY NAME], [Company Name], [company name] → Lead's company/brand name
                                    </Typography>
                                </Stack>
                            </Card>

                            <TextField
                                label="Additional Instructions (Optional)"
                                multiline
                                rows={3}
                                fullWidth
                                value={formData.instructions}
                                onChange={handleChange('instructions')}
                                helperText="💡 What it does: Extra rules or instructions that get added to the System Prompt. Use this for special cases, exceptions, or additional guidelines. Example: 'If customer says they're under 18, end the call immediately.'"
                            />

                            <Divider />

                            {/* Response Generation Configuration */}
                            <Accordion>
                                <AccordionSummary expandIcon={<ExpandMore />}>
                                    <Typography variant="h6">⚙️ Advanced Response Generation Settings</Typography>
                                </AccordionSummary>
                                <AccordionDetails>
                                    <Alert severity="info" sx={{ mb: 3 }}>
                                        <Typography variant="body2">
                                            <strong>What this section does:</strong> These settings control how the AI remembers past conversations and prevents repeating itself. 
                                            Most users can leave these at default values. Only change if you notice the AI repeating responses or forgetting context.
                                        </Typography>
                                    </Alert>
                                    <Stack spacing={3}>
                                        <Card variant="outlined" sx={{ bgcolor: 'background.default', p: 2 }}>
                                            <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 'bold' }}>
                                                📚 Max History Messages
                                            </Typography>
                                            <Typography variant="body2" sx={{ mb: 1, color: 'text.primary' }}>
                                                <strong>What it does:</strong> Controls how many past messages the AI remembers during a call. Higher = better memory but slower responses.
                                            </Typography>
                                            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                                                💡 Recommended: 20 messages. This means the AI remembers the last 10 exchanges (10 from customer + 10 from AI).
                                            </Typography>
                                        </Card>
                                        <TextField
                                            label="Max History Messages"
                                            type="number"
                                            fullWidth
                                            value={formData.responseGeneration.maxHistoryMessages}
                                            onChange={handleChange('responseGeneration.maxHistoryMessages')}
                                            helperText="💡 How many past messages to remember (default: 20). Higher = better memory but slower. Lower = faster but may forget context."
                                            inputProps={{ min: 1, max: 100 }}
                                        />

                                        <FormControl fullWidth>
                                            <InputLabel>History Format</InputLabel>
                                            <Select
                                                value={formData.responseGeneration.historyFormat}
                                                onChange={handleChange('responseGeneration.historyFormat')}
                                                label="History Format"
                                            >
                                                <MenuItem value="numbered">Numbered - Shows messages as "1. User: ... 2. Bot: ..."</MenuItem>
                                                <MenuItem value="simple">Simple - Shows messages without numbers</MenuItem>
                                            </Select>
                                            <Typography variant="caption" sx={{ mt: 0.5, ml: 1.75, color: 'text.secondary' }}>
                                                💡 How past messages are formatted when sent to AI. "Numbered" is easier for AI to understand.
                                            </Typography>
                                        </FormControl>

                                        <FormControlLabel
                                            control={
                                                <Checkbox
                                                    checked={formData.responseGeneration.includeBotHistory}
                                                    onChange={handleChange('responseGeneration.includeBotHistory')}
                                                />
                                            }
                                            label={
                                                <Box>
                                                    <Typography variant="body2" fontWeight="bold">Include Bot Responses in History</Typography>
                                                    <Typography variant="caption" color="text.secondary">
                                                        💡 When ON: AI remembers what IT said before. When OFF: AI only remembers what customer said. Recommended: ON (helps prevent repetition)
                                                    </Typography>
                                                </Box>
                                            }
                                        />

                                        <FormControlLabel
                                            control={
                                                <Checkbox
                                                    checked={formData.responseGeneration.preventRepetition}
                                                    onChange={handleChange('responseGeneration.preventRepetition')}
                                                />
                                            }
                                            label={
                                                <Box>
                                                    <Typography variant="body2" fontWeight="bold">Prevent Response Repetition</Typography>
                                                    <Typography variant="caption" color="text.secondary">
                                                        💡 When ON: AI will NOT repeat responses it already gave. When OFF: AI might say the same thing twice. Recommended: ON
                                                    </Typography>
                                                </Box>
                                            }
                                        />

                                        <FormControlLabel
                                            control={
                                                <Checkbox
                                                    checked={formData.responseGeneration.enhanceFirstMessage}
                                                    onChange={handleChange('responseGeneration.enhanceFirstMessage')}
                                                />
                                            }
                                            label={
                                                <Box>
                                                    <Typography variant="body2" fontWeight="bold">Enhance First Message Handling</Typography>
                                                    <Typography variant="caption" color="text.secondary">
                                                        💡 When ON: AI handles the first customer message specially (better greeting detection). When OFF: Treats first message like any other. Recommended: ON
                                                    </Typography>
                                                </Box>
                                            }
                                        />

                                        {/* Topic Detection */}
                                        <Card variant="outlined" sx={{ 
                                            p: 2, 
                                            bgcolor: (theme) => theme.palette.mode === 'dark' 
                                                ? 'rgba(211, 47, 47, 0.15)' 
                                                : 'rgba(211, 47, 47, 0.08)',
                                            borderColor: 'error.main',
                                            borderWidth: 1
                                        }}>
                                            <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
                                                <Box>
                                                    <Typography variant="subtitle1" fontWeight="bold" sx={{ color: 'text.primary' }}>🔍 Topic Detection Patterns</Typography>
                                                    <Typography variant="caption" color="text.secondary">
                                                        💡 What it does: Helps AI detect when certain topics were already discussed (like "purpose explanation" or "age question") so it doesn't repeat them.
                                                    </Typography>
                                                </Box>
                                                <FormControlLabel
                                                    control={
                                                        <Checkbox
                                                            checked={formData.responseGeneration.topicDetection.enabled}
                                                            onChange={handleChange('responseGeneration.topicDetection.enabled')}
                                                        />
                                                    }
                                                    label="Enabled"
                                                />
                                            </Stack>
                                            <Typography variant="body2" sx={{ mb: 2, color: 'text.primary' }}>
                                                <strong>How to use:</strong> Add patterns (like "financial firm|expanding") and give them a topic name (like "purpose explanation"). 
                                                When AI detects this pattern in past responses, it knows not to repeat that topic.
                                            </Typography>
                                            {formData.responseGeneration.topicDetection.patterns.map((pattern, index) => (
                                                <Stack direction="row" spacing={2} key={index} mb={2}>
                                                    <TextField
                                                        label="Pattern (regex)"
                                                        fullWidth
                                                        value={pattern.pattern}
                                                        onChange={(e) => handleTopicPatternChange(index, 'pattern', e.target.value)}
                                                        size="small"
                                                    />
                                                    <TextField
                                                        label="Topic Name"
                                                        fullWidth
                                                        value={pattern.topic}
                                                        onChange={(e) => handleTopicPatternChange(index, 'topic', e.target.value)}
                                                        size="small"
                                                    />
                                                    <IconButton onClick={() => handleRemoveTopicPattern(index)} color="error">
                                                        <Delete />
                                                    </IconButton>
                                                </Stack>
                                            ))}
                                            <Button startIcon={<Add />} onClick={handleAddTopicPattern} variant="outlined" size="small">
                                                Add Pattern
                                            </Button>
                                        </Card>

                                        {/* Acknowledgment Handling */}
                                        <Card variant="outlined" sx={{ 
                                            p: 2, 
                                            bgcolor: (theme) => theme.palette.mode === 'dark' 
                                                ? 'rgba(2, 136, 209, 0.15)' 
                                                : 'rgba(2, 136, 209, 0.08)',
                                            borderColor: 'info.main',
                                            borderWidth: 1
                                        }}>
                                            <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
                                                <Box>
                                                    <Typography variant="subtitle1" fontWeight="bold" sx={{ color: 'text.primary' }}>✅ Acknowledgment Handling</Typography>
                                                    <Typography variant="caption" color="text.secondary">
                                                        💡 What it does: When customer says "Okay", "Yes", etc., AI responds briefly (like "Great!") and moves forward instead of repeating explanations.
                                                    </Typography>
                                                </Box>
                                                <FormControlLabel
                                                    control={
                                                        <Checkbox
                                                            checked={formData.responseGeneration.acknowledgmentHandling.enabled}
                                                            onChange={handleChange('responseGeneration.acknowledgmentHandling.enabled')}
                                                        />
                                                    }
                                                    label="Enabled"
                                                />
                                            </Stack>
                                            <Typography variant="body2" mb={1} fontWeight="bold" sx={{ color: 'text.primary' }}>Acknowledgment Words:</Typography>
                                            <Typography variant="caption" color="text.secondary" sx={{ mb: 2, display: 'block' }}>
                                                These are words that mean "yes" or "I understand". When customer says these, AI will acknowledge briefly and move forward.
                                            </Typography>
                                            <Stack direction="row" spacing={1} flexWrap="wrap" mb={2}>
                                                {formData.responseGeneration.acknowledgmentHandling.words.map((word, index) => (
                                                    <Chip
                                                        key={index}
                                                        label={word}
                                                        onDelete={() => handleRemoveAcknowledgmentWord(index)}
                                                        size="small"
                                                    />
                                                ))}
                                            </Stack>
                                            <Stack direction="row" spacing={2} mb={2}>
                                                <TextField
                                                    label="Add Word"
                                                    size="small"
                                                    onKeyPress={(e) => {
                                                        if (e.key === 'Enter' && e.target.value.trim()) {
                                                            handleAcknowledgmentWordChange(formData.responseGeneration.acknowledgmentHandling.words.length, e.target.value.trim());
                                                            e.target.value = '';
                                                        }
                                                    }}
                                                />
                                                <Button startIcon={<Add />} onClick={handleAddAcknowledgmentWord} variant="outlined" size="small">
                                                    Add
                                                </Button>
                                            </Stack>
                                            <Typography variant="body2" mb={1} fontWeight="bold" sx={{ color: 'text.primary' }}>Response Templates:</Typography>
                                            <Typography variant="caption" color="text.secondary" sx={{ mb: 2, display: 'block' }}>
                                                These are short responses AI will use when customer acknowledges (like "Great!", "Perfect!", "Thanks!"). AI picks one randomly.
                                            </Typography>
                                            <Stack spacing={1} mb={2}>
                                                {formData.responseGeneration.acknowledgmentHandling.responseTemplates.map((template, index) => (
                                                    <Stack direction="row" spacing={1} key={index}>
                                                        <TextField
                                                            fullWidth
                                                            value={template}
                                                            onChange={(e) => handleResponseTemplateChange(index, e.target.value)}
                                                            size="small"
                                                            placeholder="e.g., Great, Perfect, Thanks"
                                                        />
                                                        <IconButton onClick={() => handleRemoveResponseTemplate(index)} color="error">
                                                            <Delete />
                                                        </IconButton>
                                                    </Stack>
                                                ))}
                                            </Stack>
                                            <Button startIcon={<Add />} onClick={handleAddResponseTemplate} variant="outlined" size="small">
                                                Add Template
                                            </Button>
                                        </Card>

                                        {/* Retry Configuration */}
                                        <Card variant="outlined" sx={{ 
                                            p: 2, 
                                            bgcolor: (theme) => theme.palette.mode === 'dark' 
                                                ? 'rgba(237, 108, 2, 0.15)' 
                                                : 'rgba(237, 108, 2, 0.08)',
                                            borderColor: 'warning.main',
                                            borderWidth: 1
                                        }}>
                                            <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
                                                <Box>
                                                    <Typography variant="subtitle1" fontWeight="bold" sx={{ color: 'text.primary' }}>🔄 Retry Configuration</Typography>
                                                    <Typography variant="caption" color="text.secondary">
                                                        💡 What it does: If AI generates a response it already said before, it will try again (up to Max Retries times) to generate a different response.
                                                    </Typography>
                                                </Box>
                                                <FormControlLabel
                                                    control={
                                                        <Checkbox
                                                            checked={formData.responseGeneration.retryConfig.enabled}
                                                            onChange={handleChange('responseGeneration.retryConfig.enabled')}
                                                        />
                                                    }
                                                    label="Enabled"
                                                />
                                            </Stack>
                                            <TextField
                                                label="Max Retries"
                                                type="number"
                                                fullWidth
                                                value={formData.responseGeneration.retryConfig.maxRetries}
                                                onChange={handleChange('responseGeneration.retryConfig.maxRetries')}
                                                helperText="💡 How many times AI will try to generate a different response if it detects a duplicate. Recommended: 3 attempts."
                                                inputProps={{ min: 1, max: 10 }}
                                            />
                                        </Card>

                                        {/* Token Configuration */}
                                        <Card variant="outlined" sx={{ p: 2, bgcolor: 'background.default' }}>
                                            <Typography variant="subtitle1" fontWeight="bold" mb={1}>
                                                ⚙️ Token Configuration (Technical Settings)
                                            </Typography>
                                            <Alert severity="warning" sx={{ mb: 2 }}>
                                                <Typography variant="body2">
                                                    <strong>⚠️ Advanced Settings:</strong> These control how AI processes responses internally. 
                                                    <strong> Only change if you're experiencing issues</strong> like responses being cut off mid-sentence or AI forgetting context. 
                                                    Default values work well for most cases.
                                                </Typography>
                                            </Alert>
                                            <Typography variant="body2" sx={{ mb: 2, color: 'text.secondary' }}>
                                                <strong>What tokens are:</strong> AI thinks in "tokens" (pieces of words). These settings convert your "Max Words" setting into tokens that AI understands. 
                                                These settings apply to ALL AI providers (Groq, OpenAI, Gemini, etc.).
                                            </Typography>
                                            <Stack spacing={2}>
                                                <TextField
                                                    label="Words to Tokens Multiplier"
                                                    type="number"
                                                    fullWidth
                                                    value={formData.responseGeneration.tokenConfig.wordsToTokensMultiplier}
                                                    onChange={handleChange('responseGeneration.tokenConfig.wordsToTokensMultiplier')}
                                                    helperText="💡 Converts words to tokens. Default: 2.5 (means 1 word ≈ 2.5 tokens). Only change if responses are being cut off or too short."
                                                    inputProps={{ min: 1, max: 10, step: 0.1 }}
                                                />
                                                <TextField
                                                    label="Min Tokens"
                                                    type="number"
                                                    fullWidth
                                                    value={formData.responseGeneration.tokenConfig.minTokens}
                                                    onChange={handleChange('responseGeneration.tokenConfig.minTokens')}
                                                    helperText="💡 Minimum tokens AI must generate. Default: 50. Lower = shorter minimum responses. Higher = ensures longer responses."
                                                    inputProps={{ min: 10, max: 1000 }}
                                                />
                                                <TextField
                                                    label="Max Tokens"
                                                    type="number"
                                                    fullWidth
                                                    value={formData.responseGeneration.tokenConfig.maxTokens}
                                                    onChange={handleChange('responseGeneration.tokenConfig.maxTokens')}
                                                    helperText="💡 Maximum tokens AI can generate. Default: 512. If responses are being cut off mid-sentence, increase this (try 1024 or 2048)."
                                                    inputProps={{ min: 50, max: 4096 }}
                                                />
                                                <TextField
                                                    label="History Limit"
                                                    type="number"
                                                    fullWidth
                                                    value={formData.responseGeneration.tokenConfig.historyLimit}
                                                    onChange={handleChange('responseGeneration.tokenConfig.historyLimit')}
                                                    helperText="💡 How many past messages to include when generating responses. Default: 20. Higher = better memory but slower. Lower = faster but may forget context."
                                                    inputProps={{ min: 1, max: 100 }}
                                                />
                                            </Stack>
                                        </Card>
                                    </Stack>
                                </AccordionDetails>
                            </Accordion>

                            <Divider />

                            <Stack direction="row" spacing={2} justifyContent="flex-end">
                                <Button
                                    variant="outlined"
                                    startIcon={<Refresh />}
                                    onClick={loadInstructions}
                                    disabled={saving}
                                >
                                    Reload
                                </Button>
                                <Button
                                    variant="contained"
                                    startIcon={<Save />}
                                    onClick={handleSave}
                                    disabled={saving}
                                    sx={{ minWidth: 120 }}
                                >
                                    {saving ? <CircularProgress size={20} /> : 'Save Changes'}
                                </Button>
                            </Stack>
                        </Stack>
                    </CardContent>
                </Card>
                </Box>
            </Box>
        </Box>
    );
};

export default AIInstructions;

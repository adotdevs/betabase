import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactQuill from "react-quill";
import "react-quill/dist/quill.snow.css";
import {
    Box,
    Button,
    Chip,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Divider,
    FormControl,
    IconButton,
    InputLabel,
    MenuItem,
    Select,
    Stack,
    TextField,
    Typography,
} from "@mui/material";
import { Add, Close, Delete, Edit, Save } from "@mui/icons-material";
import { toast } from "react-toastify";
import {
    getTicketEmailTemplatesApi,
    createTicketEmailTemplateApi,
    updateTicketEmailTemplateApi,
    deleteTicketEmailTemplateApi,
    getLeadEmailTemplatesApi,
    createLeadEmailTemplateApi,
    updateLeadEmailTemplateApi,
    deleteLeadEmailTemplateApi,
} from "../../../Api/Service";
import {
    EMAIL_TEMPLATE_VARIABLES,
    applyEmailTemplate,
    buildEmailTemplateContext,
    isEmptyRichText,
} from "../../../utils/emailTemplateUtils";

const VARIABLE_GROUPS = [
    {
        title: "Sender — name, email, phone, role",
        keys: ["{{name}}", "{{firstName}}", "{{lastName}}", "{{email}}", "{{phone}}", "{{role}}"],
    },
    {
        title: "Customer / lead — name, email, phone",
        keys: ["{{customerName}}", "{{customerFirstName}}", "{{customerLastName}}", "{{customerEmail}}", "{{customerPhone}}"],
    },
];

const TEMPLATE_API = {
    ticket: {
        get: getTicketEmailTemplatesApi,
        create: createTicketEmailTemplateApi,
        update: updateTicketEmailTemplateApi,
        delete: deleteTicketEmailTemplateApi,
    },
    lead: {
        get: getLeadEmailTemplatesApi,
        create: createLeadEmailTemplateApi,
        update: updateLeadEmailTemplateApi,
        delete: deleteLeadEmailTemplateApi,
    },
};

const TEMPLATE_LABELS = {
    ticket: "Ticket templates",
    lead: "Lead email templates",
};

const TEMPLATE_QUILL_MODULES = {
    toolbar: [
        ["bold", "italic", "underline"],
        [{ list: "ordered" }, { list: "bullet" }],
        [{ color: [] }],
        ["link", "clean"],
    ],
};

const getVariableLabel = (key) =>
    EMAIL_TEMPLATE_VARIABLES.find((item) => item.key === key)?.label || key;

const EmailTemplatesDialog = ({
    open,
    onClose,
    isSuperAdmin,
    staffUser,
    recipient,
    mode = "ticket",
    onApplyTemplate,
}) => {
    const fillSubject = mode === "lead";
    const primaryType = mode;
    const secondaryType = mode === "ticket" ? "lead" : "ticket";

    const [ticketTemplates, setTicketTemplates] = useState([]);
    const [leadTemplates, setLeadTemplates] = useState([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [editingType, setEditingType] = useState(primaryType);
    const [formTemplateType, setFormTemplateType] = useState(primaryType);
    const [formTitle, setFormTitle] = useState("");
    const [formBody, setFormBody] = useState("");
    const quillRef = useRef(null);
    const formSectionRef = useRef(null);

    const contextMap = useMemo(
        () => buildEmailTemplateContext({ staffUser, recipient }),
        [staffUser, recipient]
    );

    const templatesByType = useMemo(
        () => ({ ticket: ticketTemplates, lead: leadTemplates }),
        [ticketTemplates, leadTemplates]
    );

    const setTemplatesByType = (type, list) => {
        if (type === "ticket") setTicketTemplates(list);
        else setLeadTemplates(list);
    };

    const loadType = useCallback(async (type) => {
        const res = await TEMPLATE_API[type].get();
        if (res.success) {
            setTemplatesByType(type, res.templates || []);
            return true;
        }
        toast.error(res.msg || `Failed to load ${TEMPLATE_LABELS[type].toLowerCase()}`);
        return false;
    }, []);

    const loadTemplates = useCallback(async () => {
        setLoading(true);
        try {
            if (isSuperAdmin) {
                await Promise.all([loadType("ticket"), loadType("lead")]);
            } else {
                await loadType(primaryType);
            }
        } catch (err) {
            toast.error(err?.msg || "Failed to load templates");
        } finally {
            setLoading(false);
        }
    }, [isSuperAdmin, primaryType, loadType]);

    useEffect(() => {
        if (open) {
            loadTemplates();
            resetForm();
        }
    }, [open, loadTemplates]);

    const resetForm = () => {
        setEditingId(null);
        setEditingType(primaryType);
        setFormTemplateType(primaryType);
        setFormTitle("");
        setFormBody("");
    };

    const handleSaveTemplate = async () => {
        const title = formTitle.trim();
        const body = formBody.trim();
        if (!title || isEmptyRichText(body)) {
            toast.error("Title and message are required");
            return;
        }

        const api = TEMPLATE_API[editingId ? editingType : formTemplateType];
        setSaving(true);
        try {
            const payload = { title, body };
            const res = editingId
                ? await api.update(editingId, payload)
                : await api.create(payload);

            if (res.success) {
                toast.success(editingId ? "Template updated" : "Template added");
                resetForm();
                await loadTemplates();
            } else {
                toast.error(res.msg || "Failed to save template");
            }
        } catch (err) {
            toast.error(err?.msg || "Failed to save template");
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteTemplate = async (templateId, type) => {
        if (!window.confirm("Delete this template?")) return;
        setSaving(true);
        try {
            const res = await TEMPLATE_API[type].delete(templateId);
            if (res.success) {
                toast.success("Template deleted");
                if (editingId === templateId) resetForm();
                await loadTemplates();
            } else {
                toast.error(res.msg || "Failed to delete template");
            }
        } catch (err) {
            toast.error(err?.msg || "Failed to delete template");
        } finally {
            setSaving(false);
        }
    };

    const handleUseTemplate = (template, type) => {
        const useFillSubject = type === "lead";
        const filledBody = applyEmailTemplate(template.body, contextMap);
        if (useFillSubject) {
            onApplyTemplate?.({
                subject: applyEmailTemplate(template.title, contextMap),
                body: filledBody,
            });
        } else {
            onApplyTemplate?.(filledBody);
        }
        toast.success("Template applied");
        onClose();
    };

    const startEdit = (template, type) => {
        setEditingId(template._id);
        setEditingType(type);
        setFormTemplateType(type);
        setFormTitle(template.title);
        setFormBody(template.body || "");
        setTimeout(() => {
            formSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 0);
    };

    const insertVariable = (variable) => {
        const editor = quillRef.current?.getEditor?.();
        if (editor) {
            editor.focus();
            const range = editor.getSelection(true);
            const index = range?.index ?? Math.max(0, editor.getLength() - 1);
            editor.insertText(index, variable);
            editor.setSelection(index + variable.length);
            return;
        }
        setFormBody((prev) => `${prev || ""}${variable}`);
    };

    const renderTemplateList = (type, { allowUse }) => {
        const list = templatesByType[type];
        if (!list.length) {
            return (
                <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
                    No {TEMPLATE_LABELS[type].toLowerCase()} yet.
                </Typography>
            );
        }

        return (
            <Stack spacing={1}>
                {list.map((template) => {
                    const isEditing = editingId === template._id && editingType === type;
                    return (
                        <Box
                            key={template._id}
                            sx={{
                                display: "flex",
                                alignItems: "center",
                                gap: 1,
                                p: 1.5,
                                border: "2px solid",
                                borderColor: isEditing ? "primary.main" : "divider",
                                borderRadius: 1,
                                bgcolor: isEditing ? "action.selected" : "transparent",
                            }}
                        >
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                                <Stack direction="row" alignItems="center" spacing={1}>
                                    <Typography variant="subtitle2" noWrap sx={{ fontWeight: isEditing ? 700 : 500 }}>
                                        {template.title}
                                    </Typography>
                                    {isEditing && (
                                        <Chip label="Editing" size="small" color="primary" sx={{ height: 22, fontSize: "0.7rem" }} />
                                    )}
                                </Stack>
                            </Box>
                            {allowUse && (
                                <Button
                                    size="small"
                                    variant="contained"
                                    onClick={() => handleUseTemplate(template, type)}
                                    disabled={isEditing}
                                >
                                    Use
                                </Button>
                            )}
                            {isSuperAdmin && (
                                <>
                                    <IconButton
                                        size="small"
                                        onClick={() => startEdit(template, type)}
                                        sx={{
                                            bgcolor: isEditing ? "primary.main" : "transparent",
                                            color: isEditing ? "primary.contrastText" : "inherit",
                                        }}
                                        title="Edit template"
                                    >
                                        <Edit fontSize="small" />
                                    </IconButton>
                                    <IconButton
                                        size="small"
                                        color="error"
                                        onClick={() => handleDeleteTemplate(template._id, type)}
                                    >
                                        <Delete fontSize="small" />
                                    </IconButton>
                                </>
                            )}
                        </Box>
                    );
                })}
            </Stack>
        );
    };

    const primaryTemplates = templatesByType[primaryType];

    return (
        <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
            <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                {mode === "ticket" ? "Ticket Templates" : "Lead Email Templates"}
                <IconButton onClick={onClose} size="small">
                    <Close />
                </IconButton>
            </DialogTitle>

            <DialogContent dividers>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Click <strong>Use</strong> on a {TEMPLATE_LABELS[primaryType].slice(0, -1).toLowerCase()} below.
                    Variables like <Box component="span" sx={{ fontFamily: "monospace" }}>{"{{customerName}}"}</Box> are filled in automatically.
                </Typography>

                {loading ? (
                    <Typography variant="body2">Loading...</Typography>
                ) : (
                    <>
                        <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 700 }}>
                            {TEMPLATE_LABELS[primaryType]}
                        </Typography>
                        {renderTemplateList(primaryType, { allowUse: true })}

                        {isSuperAdmin && (
                            <>
                                <Divider sx={{ my: 2.5 }} />
                                <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 700, color: "text.secondary" }}>
                                    {TEMPLATE_LABELS[secondaryType]} (manage only here)
                                </Typography>
                                <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                                    These templates are used on the {secondaryType === "ticket" ? "ticket reply" : "CRM lead email"} screen.
                                </Typography>
                                {renderTemplateList(secondaryType, { allowUse: false })}
                            </>
                        )}
                    </>
                )}

                {isSuperAdmin && (
                    <Box
                        ref={formSectionRef}
                        sx={{
                            mt: 3,
                            pt: 2,
                            borderTop: "1px solid",
                            borderColor: "divider",
                            ...(editingId ? {
                                p: 2,
                                borderRadius: 2,
                                border: "2px solid",
                                borderColor: "primary.main",
                                bgcolor: "action.selected",
                            } : {}),
                        }}
                    >
                        <Typography variant="subtitle2" sx={{ mb: 1.5, fontWeight: 700 }}>
                            {editingId ? "Edit template" : "Add template"}
                        </Typography>

                        {!editingId && (
                            <FormControl size="small" fullWidth sx={{ mb: 2 }}>
                                <InputLabel>Save as</InputLabel>
                                <Select
                                    label="Save as"
                                    value={formTemplateType}
                                    onChange={(e) => setFormTemplateType(e.target.value)}
                                >
                                    <MenuItem value="ticket">Ticket template</MenuItem>
                                    <MenuItem value="lead">Lead email template</MenuItem>
                                </Select>
                            </FormControl>
                        )}

                        {editingId && (
                            <Chip
                                label={TEMPLATE_LABELS[editingType]}
                                size="small"
                                color="primary"
                                variant="outlined"
                                sx={{ mb: 1.5 }}
                            />
                        )}

                        <Box sx={{ mb: 1.5, p: 1.5, borderRadius: 1, bgcolor: "action.hover", border: "1px solid", borderColor: "divider" }}>
                            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                                Click a variable to insert it. Lead templates use the title as the email subject.
                            </Typography>
                            <Stack spacing={1.25}>
                                {VARIABLE_GROUPS.map((group) => (
                                    <Box key={group.title}>
                                        <Typography variant="caption" sx={{ fontWeight: 600, display: "block", mb: 0.5 }}>
                                            {group.title}
                                        </Typography>
                                        <Stack direction="row" flexWrap="wrap" gap={0.75}>
                                            {group.keys.map((key) => (
                                                <Chip
                                                    key={key}
                                                    label={key}
                                                    size="small"
                                                    clickable
                                                    onClick={() => insertVariable(key)}
                                                    title={getVariableLabel(key)}
                                                    sx={{ fontFamily: "monospace", fontSize: "0.7rem", height: 24 }}
                                                />
                                            ))}
                                        </Stack>
                                    </Box>
                                ))}
                            </Stack>
                        </Box>

                        <Stack spacing={1.5}>
                            <TextField
                                label={(editingId ? editingType : formTemplateType) === "lead" ? "Title (email subject)" : "Title"}
                                value={formTitle}
                                onChange={(e) => setFormTitle(e.target.value)}
                                size="small"
                                fullWidth
                            />
                            <Box sx={{ "& .ql-editor": { minHeight: 120 } }}>
                                <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: "block" }}>
                                    Message
                                </Typography>
                                <ReactQuill
                                    ref={quillRef}
                                    theme="snow"
                                    value={formBody}
                                    onChange={setFormBody}
                                    modules={TEMPLATE_QUILL_MODULES}
                                    placeholder="Hi {{customerName}}, ..."
                                />
                            </Box>
                        </Stack>
                    </Box>
                )}

                {!isSuperAdmin && !loading && primaryTemplates.length === 0 && (
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                        No templates available. Ask a superadmin to add some.
                    </Typography>
                )}
            </DialogContent>

            <DialogActions>
                {isSuperAdmin ? (
                    <>
                        {editingId && (
                            <Button onClick={resetForm} disabled={saving} color="inherit">
                                Cancel editing
                            </Button>
                        )}
                        <Button
                            variant="contained"
                            startIcon={editingId ? <Save /> : <Add />}
                            onClick={handleSaveTemplate}
                            disabled={saving}
                        >
                            {editingId ? "Save changes" : "Add template"}
                        </Button>
                    </>
                ) : (
                    <Button onClick={onClose}>Close</Button>
                )}
            </DialogActions>
        </Dialog>
    );
};

export default EmailTemplatesDialog;

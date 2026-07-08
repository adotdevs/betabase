import React, { useEffect, useState } from "react";
import ReactQuill from "react-quill";
import "react-quill/dist/quill.snow.css";
import {
    Box,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    FormControl,
    FormControlLabel,
    IconButton,
    Radio,
    RadioGroup,
    Stack,
    TextField,
    Typography,
    CircularProgress,
    Alert,
} from "@mui/material";
import { Close, Email as EmailIcon, Description as TemplateIcon, Send as SendIcon } from "@mui/icons-material";
import { toast } from "react-toastify";
import { GetMySmtpConfigApi, sendLeadEmailApi } from "../../../../Api/Service";
import { isEmptyRichText } from "../../../../utils/emailTemplateUtils";
import EmailTemplatesDialog from "../../components/EmailTemplatesDialog";

const COMPOSE_QUILL_MODULES = {
    toolbar: [
        ["bold", "italic", "underline"],
        [{ list: "ordered" }, { list: "bullet" }],
        [{ color: [] }],
        ["link", "clean"],
    ],
};

const SendLeadEmailDialog = ({ open, onClose, lead, staffUser, isSuperAdmin }) => {
    const [subject, setSubject] = useState("");
    const [message, setMessage] = useState("");
    const [sending, setSending] = useState(false);
    const [templatesOpen, setTemplatesOpen] = useState(false);
    const [emailSender, setEmailSender] = useState("default");
    const [smtpInfo, setSmtpInfo] = useState({
        loading: false,
        hasPersonal: false,
        defaultConfigured: false,
        personalFromEmail: "",
        defaultFromEmail: "",
    });

    useEffect(() => {
        if (!open) return;

        setSubject("");
        setMessage("");
        setTemplatesOpen(false);
        setEmailSender("default");

        const loadSmtpInfo = async () => {
            setSmtpInfo((prev) => ({ ...prev, loading: true }));
            try {
                const res = await GetMySmtpConfigApi();
                if (res.success) {
                    const hasPersonal = !!res.hasActiveSmtpCredentials;
                    setSmtpInfo({
                        loading: false,
                        hasPersonal,
                        defaultConfigured: !!res.defaultEmailConfigured,
                        personalFromEmail: res.smtpConfig?.fromEmail || res.smtpConfig?.user || "",
                        defaultFromEmail: res.defaultFromEmail || "",
                    });
                    setEmailSender(hasPersonal ? "personal" : "default");
                } else {
                    setSmtpInfo({
                        loading: false,
                        hasPersonal: false,
                        defaultConfigured: false,
                        personalFromEmail: "",
                        defaultFromEmail: "",
                    });
                }
            } catch (error) {
                setSmtpInfo({
                    loading: false,
                    hasPersonal: false,
                    defaultConfigured: false,
                    personalFromEmail: "",
                    defaultFromEmail: "",
                });
            }
        };

        loadSmtpInfo();
    }, [open, lead?._id]);

    const handleSend = async () => {
        if (!lead?.email) {
            toast.error("This lead has no email address");
            return;
        }
        if (!subject.trim()) {
            toast.error("Subject is required");
            return;
        }
        if (isEmptyRichText(message)) {
            toast.error("Message is required");
            return;
        }
        if (emailSender === "personal" && !smtpInfo.hasPersonal) {
            toast.error("Your personal SMTP is not configured");
            return;
        }

        setSending(true);
        try {
            const res = await sendLeadEmailApi(lead._id, {
                subject: subject.trim(),
                body: message.trim(),
                emailSender,
            });
            if (res.success) {
                toast.success(res.msg || "Email sent successfully");
                onClose();
            } else {
                toast.error(res.msg || "Failed to send email");
            }
        } catch (err) {
            toast.error(err?.msg || err?.errorMessage || "Failed to send email");
        } finally {
            setSending(false);
        }
    };

    if (!lead) return null;

    const leadName = `${lead.firstName || ""} ${lead.lastName || ""}`.trim() || "Lead";
    const showSenderChoice = smtpInfo.hasPersonal && smtpInfo.defaultConfigured;

    return (
        <>
            <Dialog open={open} onClose={sending ? undefined : onClose} maxWidth="md" fullWidth>
                <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <Stack direction="row" alignItems="center" spacing={1}>
                        <EmailIcon color="primary" />
                        <Typography variant="h6">Send Email</Typography>
                    </Stack>
                    <IconButton onClick={onClose} size="small" disabled={sending}>
                        <Close />
                    </IconButton>
                </DialogTitle>

                <DialogContent dividers>
                    <Stack spacing={2} sx={{ pt: 0.5 }}>
                        <Box>
                            <Typography variant="caption" color="text.secondary">To</Typography>
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                {leadName} &lt;{lead.email || "no email"}&gt;
                            </Typography>
                        </Box>

                        {smtpInfo.loading ? (
                            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                                <CircularProgress size={18} />
                                <Typography variant="body2" color="text.secondary">
                                    Checking email settings...
                                </Typography>
                            </Box>
                        ) : showSenderChoice ? (
                            <Box
                                sx={{
                                    p: 2,
                                    borderRadius: 2,
                                    border: "1px solid",
                                    borderColor: "divider",
                                    bgcolor: "action.hover",
                                }}
                            >
                                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                                    Send from
                                </Typography>
                                <FormControl component="fieldset" fullWidth>
                                    <RadioGroup
                                        value={emailSender}
                                        onChange={(e) => setEmailSender(e.target.value)}
                                    >
                                        <FormControlLabel
                                            value="personal"
                                            control={<Radio size="small" />}
                                            label={
                                                <Box>
                                                    <Typography variant="body2" fontWeight={600}>
                                                        My email
                                                    </Typography>
                                                    <Typography variant="caption" color="text.secondary">
                                                        {smtpInfo.personalFromEmail || "Your configured SMTP address"}
                                                    </Typography>
                                                </Box>
                                            }
                                        />
                                        <FormControlLabel
                                            value="default"
                                            control={<Radio size="small" />}
                                            label={
                                                <Box>
                                                    <Typography variant="body2" fontWeight={600}>
                                                        Default system email
                                                    </Typography>
                                                    <Typography variant="caption" color="text.secondary">
                                                        {smtpInfo.defaultFromEmail || "Platform default sender"}
                                                    </Typography>
                                                </Box>
                                            }
                                        />
                                    </RadioGroup>
                                </FormControl>
                            </Box>
                        ) : smtpInfo.hasPersonal ? (
                            <Alert severity="info" sx={{ alignItems: "center" }}>
                                This email will be sent using your personal SMTP
                                {smtpInfo.personalFromEmail ? ` (${smtpInfo.personalFromEmail})` : ""}.
                            </Alert>
                        ) : (
                            <Alert severity="info" sx={{ alignItems: "center" }}>
                                This email will be sent using the default system email
                                {smtpInfo.defaultFromEmail ? ` (${smtpInfo.defaultFromEmail})` : ""}.
                            </Alert>
                        )}

                        <TextField
                            label="Subject"
                            value={subject}
                            onChange={(e) => setSubject(e.target.value)}
                            fullWidth
                            size="small"
                            disabled={sending}
                        />

                        <Box>
                            <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: "block" }}>
                                Message
                            </Typography>
                            <Box sx={{ "& .ql-editor": { minHeight: 160 } }}>
                                <ReactQuill
                                    theme="snow"
                                    value={message}
                                    onChange={setMessage}
                                    modules={COMPOSE_QUILL_MODULES}
                                    placeholder="Write your message..."
                                    readOnly={sending}
                                />
                            </Box>
                        </Box>

                        <Button
                            variant="contained"
                            startIcon={<TemplateIcon />}
                            onClick={() => setTemplatesOpen(true)}
                            disabled={sending}
                            style={{ border: "1px solid #e0e0e0" }}
                            sx={{
                                alignSelf: "flex-start",
                                bgcolor: "#fff",
                                color: "#111 !important",
                                textTransform: "none",
                                fontWeight: 600,
                                boxShadow: "none",
                                "&:hover": { bgcolor: "#f0f0f0", color: "#111 !important", boxShadow: "none" },
                            }}
                        >
                            Email Templates
                        </Button>
                    </Stack>
                </DialogContent>

                <DialogActions>
                    <Button onClick={onClose} disabled={sending}>Cancel</Button>
                    <Button
                        variant="contained"
                        startIcon={sending ? <CircularProgress size={18} color="inherit" /> : <SendIcon />}
                        onClick={handleSend}
                        disabled={sending || !lead.email || smtpInfo.loading}
                    >
                        {sending ? "Sending..." : "Send Email"}
                    </Button>
                </DialogActions>
            </Dialog>

            <EmailTemplatesDialog
                open={templatesOpen}
                onClose={() => setTemplatesOpen(false)}
                isSuperAdmin={isSuperAdmin}
                staffUser={staffUser}
                recipient={lead}
                mode="lead"
                onApplyTemplate={({ subject: templateSubject, body }) => {
                    setSubject(templateSubject || "");
                    setMessage(body || "");
                }}
            />
        </>
    );
};

export default SendLeadEmailDialog;

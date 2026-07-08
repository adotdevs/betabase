import React, { useCallback, useEffect, useState } from "react";
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
    List,
    ListItem,
    ListItemSecondaryAction,
    ListItemText,
    MenuItem,
    Select,
    TextField,
    Tooltip,
    Typography,
} from "@mui/material";
import {
    Add,
    Delete,
    Edit,
    Settings,
    Star,
    StarBorder,
    Check,
    Close,
} from "@mui/icons-material";
import { toast } from "react-toastify";
import {
    createLeadStatusApi,
    updateLeadStatusApi,
    deleteLeadStatusApi,
} from "../../../../Api/Service";
import {
    fetchLeadStatuses,
    getCachedLeadStatuses,
    invalidateLeadStatuses,
    subscribeLeadStatuses,
} from "./leadStatusCache";

const MANAGE_STATUS_VALUE = "__manage_statuses__";

const LeadStatusSelect = ({
    value,
    onChange,
    label = "Status",
    size = "small",
    fullWidth = true,
    showAllOption = false,
    allowManage = false,
    disabled = false,
    onStatusesChange,
    manageButtonOnly = false,
}) => {
    const [statuses, setStatuses] = useState(() => getCachedLeadStatuses() || []);
    const [initialLoading, setInitialLoading] = useState(() => !getCachedLeadStatuses());
    const [selectOpen, setSelectOpen] = useState(false);
    const [manageOpen, setManageOpen] = useState(false);
    const [newLabel, setNewLabel] = useState("");
    const [saving, setSaving] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [editLabel, setEditLabel] = useState("");

    useEffect(() => {
        return subscribeLeadStatuses((nextStatuses) => {
            setStatuses(nextStatuses);
            setInitialLoading(false);
        });
    }, []);

    useEffect(() => {
        let cancelled = false;

        fetchLeadStatuses()
            .catch((err) => {
                if (!cancelled) {
                    toast.error(err?.msg || "Failed to load lead statuses");
                }
            })
            .finally(() => {
                if (!cancelled) {
                    setInitialLoading(false);
                }
            });

        return () => {
            cancelled = true;
        };
    }, []);

    const reloadAfterMutation = useCallback(async () => {
        invalidateLeadStatuses();
        const nextStatuses = await fetchLeadStatuses({ force: true });
        onStatusesChange?.(nextStatuses);
    }, [onStatusesChange]);

    const handleAddStatus = async () => {
        const statusLabel = newLabel.trim();
        if (!statusLabel) return;
        setSaving(true);
        try {
            const res = await createLeadStatusApi({ label: statusLabel });
            if (res.success) {
                toast.success("Status added");
                setNewLabel("");
                await reloadAfterMutation();
                onChange?.({ target: { value: statusLabel } });
            } else {
                toast.error(res.msg || "Failed to add status");
            }
        } catch (err) {
            toast.error(err?.msg || "Failed to add status");
        } finally {
            setSaving(false);
        }
    };

    const handleSaveEdit = async (status) => {
        const nextLabel = editLabel.trim();
        if (!nextLabel) return;
        setSaving(true);
        try {
            const res = await updateLeadStatusApi(status._id, { label: nextLabel });
            if (res.success) {
                toast.success("Status updated");
                if (value === status.label) {
                    onChange?.({ target: { value: nextLabel } });
                }
                setEditingId(null);
                setEditLabel("");
                await reloadAfterMutation();
            } else {
                toast.error(res.msg || "Failed to update status");
            }
        } catch (err) {
            toast.error(err?.msg || "Failed to update status");
        } finally {
            setSaving(false);
        }
    };

    const handleSetDefault = async (status) => {
        setSaving(true);
        try {
            const res = await updateLeadStatusApi(status._id, { label: status.label, isDefault: true });
            if (res.success) {
                toast.success(`"${status.label}" set as default`);
                await reloadAfterMutation();
            } else {
                toast.error(res.msg || "Failed to set default");
            }
        } catch (err) {
            toast.error(err?.msg || "Failed to set default");
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (status) => {
        if (!window.confirm(`Delete status "${status.label}"? Leads with this status will be reassigned.`)) {
            return;
        }
        setSaving(true);
        try {
            const res = await deleteLeadStatusApi(status._id);
            if (res.success) {
                toast.success(res.msg || "Status deleted");
                if (value === status.label) {
                    onChange?.({ target: { value: res.reassignedTo || "" } });
                }
                await reloadAfterMutation();
            } else {
                toast.error(res.msg || "Failed to delete status");
            }
        } catch (err) {
            toast.error(err?.msg || "Failed to delete status");
        } finally {
            setSaving(false);
        }
    };

    const openManage = () => {
        setSelectOpen(false);
        window.setTimeout(() => setManageOpen(true), 0);
    };

    const handleSelectChange = (event) => {
        const nextValue = event.target.value;
        if (nextValue === MANAGE_STATUS_VALUE) {
            openManage();
            return;
        }
        if (nextValue === value) {
            return;
        }
        onChange?.(event);
    };

    const labels = statuses.map((s) => s.label);
    const selectDisabled = disabled;
    const selectValue = value ?? (showAllOption ? "" : "");
    const labelShrunk = showAllOption || Boolean(selectValue);

    const manageDialog = (
        <Dialog
            open={manageOpen}
            onClose={() => !saving && setManageOpen(false)}
            maxWidth="sm"
            fullWidth
            disableRestoreFocus
            sx={{ zIndex: (theme) => theme.zIndex.modal + 2 }}
        >
            <DialogTitle>Manage Lead Statuses</DialogTitle>
            <DialogContent dividers>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Add, rename, or remove statuses. Deleting reassigns affected leads to the default status.
                </Typography>

                <List dense disablePadding>
                    {statuses.map((status) => (
                        <ListItem key={status._id} sx={{ px: 0 }}>
                            {editingId === status._id ? (
                                <Box sx={{ display: "flex", alignItems: "center", gap: 1, width: "100%" }}>
                                    <TextField
                                        size="small"
                                        fullWidth
                                        value={editLabel}
                                        onChange={(e) => setEditLabel(e.target.value)}
                                        disabled={saving}
                                        autoFocus
                                    />
                                    <IconButton size="small" color="success" onClick={() => handleSaveEdit(status)} disabled={saving}>
                                        <Check fontSize="small" />
                                    </IconButton>
                                    <IconButton size="small" onClick={() => { setEditingId(null); setEditLabel(""); }} disabled={saving}>
                                        <Close fontSize="small" />
                                    </IconButton>
                                </Box>
                            ) : (
                                <>
                                    <ListItemText
                                        primary={
                                            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                                                {status.label}
                                                {status.isDefault && (
                                                    <Chip label="Default" size="small" color="primary" variant="outlined" />
                                                )}
                                            </Box>
                                        }
                                    />
                                    <ListItemSecondaryAction>
                                        <Tooltip title={status.isDefault ? "Default status" : "Set as default"}>
                                            <span>
                                                <IconButton
                                                    size="small"
                                                    onClick={() => handleSetDefault(status)}
                                                    disabled={saving || status.isDefault}
                                                >
                                                    {status.isDefault ? <Star fontSize="small" color="primary" /> : <StarBorder fontSize="small" />}
                                                </IconButton>
                                            </span>
                                        </Tooltip>
                                        <IconButton
                                            size="small"
                                            onClick={() => { setEditingId(status._id); setEditLabel(status.label); }}
                                            disabled={saving}
                                        >
                                            <Edit fontSize="small" />
                                        </IconButton>
                                        <IconButton
                                            size="small"
                                            color="error"
                                            onClick={() => handleDelete(status)}
                                            disabled={saving || statuses.length <= 1}
                                        >
                                            <Delete fontSize="small" />
                                        </IconButton>
                                    </ListItemSecondaryAction>
                                </>
                            )}
                        </ListItem>
                    ))}
                </List>

                <Box sx={{ display: "flex", gap: 1, mt: 2 }}>
                    <TextField
                        size="small"
                        fullWidth
                        placeholder="New status name"
                        value={newLabel}
                        onChange={(e) => setNewLabel(e.target.value)}
                        disabled={saving}
                        onKeyDown={(e) => e.key === "Enter" && handleAddStatus()}
                    />
                    <Button
                        variant="contained"
                        startIcon={<Add />}
                        onClick={handleAddStatus}
                        disabled={saving || !newLabel.trim()}
                    >
                        Add
                    </Button>
                </Box>
            </DialogContent>
            <DialogActions>
                <Button onClick={() => setManageOpen(false)} disabled={saving}>
                    Done
                </Button>
            </DialogActions>
        </Dialog>
    );

    if (manageButtonOnly) {
        return (
            <>
                <Button
                    variant="outlined"
                    size="medium"
                    startIcon={<Settings />}
                    onClick={() => setManageOpen(true)}
                    disabled={selectDisabled}
                    sx={{
                        height: 36,
                        borderRadius: '999px',
                        px: 2,
                        fontSize: '0.9375rem',
                        fontWeight: 600,
                        textTransform: 'none',
                    }}
                >
                    Manage statuses
                </Button>
                {manageDialog}
            </>
        );
    }

    return (
        <>
            <FormControl fullWidth={fullWidth} size={size} disabled={selectDisabled}>
                <InputLabel id="lead-status-select-label" shrink={labelShrunk}>
                    {label}
                </InputLabel>
                <Select
                    labelId="lead-status-select-label"
                    value={selectValue}
                    label={label}
                    open={selectOpen}
                    onOpen={() => setSelectOpen(true)}
                    onClose={() => setSelectOpen(false)}
                    onChange={handleSelectChange}
                    MenuProps={{
                        disablePortal: false,
                        PaperProps: { sx: { maxHeight: 320 } },
                    }}
                >
                    {showAllOption && <MenuItem value="">All Statuses</MenuItem>}
                    {labels.map((statusLabel) => (
                        <MenuItem key={statusLabel} value={statusLabel}>
                            {statusLabel}
                        </MenuItem>
                    ))}
                    {selectValue && !labels.includes(selectValue) && (
                        <MenuItem value={selectValue}>{selectValue}</MenuItem>
                    )}
                    {allowManage && [
                        <Divider key="divider" />,
                        <MenuItem
                            key="manage"
                            value={MANAGE_STATUS_VALUE}
                            onMouseDown={(e) => e.preventDefault()}
                        >
                            <Box sx={{ display: "flex", alignItems: "center", gap: 1, color: "primary.main" }}>
                                <Settings fontSize="small" />
                                Manage statuses...
                            </Box>
                        </MenuItem>,
                    ]}
                </Select>
            </FormControl>

            {manageDialog}
        </>
    );
};

export default LeadStatusSelect;

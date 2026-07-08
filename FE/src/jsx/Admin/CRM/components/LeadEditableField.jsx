import React from "react";
import {
    Box,
    CircularProgress,
    FormControl,
    IconButton,
    MenuItem,
    Select,
    TextField,
    Tooltip,
    Typography,
} from "@mui/material";
import { Check, Close, Edit } from "@mui/icons-material";
import LeadStatusSelect from "./LeadStatusSelect";

const LeadEditableField = ({
    label,
    field,
    value,
    icon: Icon,
    multiline = false,
    type = "text",
    options = null,
    isEditing = false,
    isSaving = false,
    editValue,
    onEditToggle,
    onEditChange,
    onSave,
    onCancel,
    canEdit = false,
    allowManageStatuses = false,
}) => (
    <Box>
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 0.5 }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                {Icon && <Icon sx={{ fontSize: 14 }} />}
                {label}
            </Typography>
            {canEdit && !isEditing ? (
                <Tooltip title={`Edit ${label}`}>
                    <IconButton size="small" onClick={onEditToggle} sx={{ p: 0.5 }}>
                        <Edit sx={{ fontSize: 16, color: "action.active" }} />
                    </IconButton>
                </Tooltip>
            ) : canEdit && isEditing ? (
                <Box sx={{ display: "flex", gap: 0.5 }}>
                    <Tooltip title="Save">
                        <IconButton size="small" onClick={onSave} disabled={isSaving} sx={{ p: 0.5 }}>
                            {isSaving ? <CircularProgress size={14} /> : <Check sx={{ fontSize: 16, color: "success.main" }} />}
                        </IconButton>
                    </Tooltip>
                    <Tooltip title="Cancel">
                        <IconButton size="small" onClick={onCancel} disabled={isSaving} sx={{ p: 0.5 }}>
                            <Close sx={{ fontSize: 16, color: "error.main" }} />
                        </IconButton>
                    </Tooltip>
                </Box>
            ) : null}
        </Box>
        {isEditing ? (
            field === "status" ? (
                <LeadStatusSelect
                    value={editValue}
                    onChange={(e) => onEditChange(e.target.value)}
                    disabled={isSaving}
                    allowManage={allowManageStatuses}
                />
            ) : options ? (
                <FormControl fullWidth size="small">
                    <Select
                        value={editValue}
                        onChange={(e) => onEditChange(e.target.value)}
                        disabled={isSaving}
                    >
                        {options.map((option) => (
                            <MenuItem key={option} value={option}>
                                {option}
                            </MenuItem>
                        ))}
                    </Select>
                </FormControl>
            ) : (
                <TextField
                    fullWidth
                    size="small"
                    multiline={multiline}
                    rows={multiline ? 2 : 1}
                    type={type}
                    value={editValue}
                    onChange={(e) => onEditChange(e.target.value)}
                    disabled={isSaving}
                    sx={{
                        bgcolor: "background.paper",
                        "& .MuiOutlinedInput-root": {
                            fontSize: "0.875rem",
                        },
                    }}
                />
            )
        ) : (
            <Typography variant="body2" sx={{ fontWeight: 500, wordBreak: "break-word" }}>
                {value || "Not provided"}
            </Typography>
        )}
    </Box>
);

export default LeadEditableField;

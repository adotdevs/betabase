import React, { memo, useState } from "react";
import {
    Chip,
    CircularProgress,
    FormControl,
    MenuItem,
    Select,
} from "@mui/material";
import { KeyboardArrowDown } from "@mui/icons-material";

export const TICKET_STATUS_OPTIONS = [
    { value: "open", label: "Open" },
    { value: "solved", label: "Solved" },
    { value: "awaiting reply", label: "Awaiting Reply" },
];

export const getTicketStatusColors = (status) => {
    switch (status) {
        case "open":
            return { bg: "rgba(255, 152, 0, 0.2)", color: "#ff9800" };
        case "solved":
            return { bg: "rgba(76, 175, 80, 0.2)", color: "#4caf50" };
        case "awaiting reply":
            return { bg: "rgba(33, 150, 243, 0.2)", color: "#2196f3" };
        default:
            return { bg: "rgba(255, 255, 255, 0.1)", color: "#bdbdbd" };
    }
};

const formatStatusLabel = (status) => {
    const match = TICKET_STATUS_OPTIONS.find((option) => option.value === status);
    return match?.label || status;
};

const InlineTicketStatusCell = memo(({ ticket, onStatusChange, saving = false, disabled = false, chipSize = "small", fullWidth = false }) => {
    const [open, setOpen] = useState(false);
    const currentStatus = ticket?.status || "open";
    const statusColors = getTicketStatusColors(currentStatus);
    const isDisabled = disabled || saving;

    const handleChange = (event) => {
        const nextStatus = event.target.value;
        if (!nextStatus || nextStatus === currentStatus) {
            return;
        }
        onStatusChange?.(ticket, nextStatus);
    };

    if (disabled) {
        return (
            <Chip
                label={formatStatusLabel(currentStatus)}
                size={chipSize}
                sx={{
                    bgcolor: statusColors.bg,
                    color: statusColors.color,
                    fontWeight: 600,
                    textTransform: "capitalize",
                    width: fullWidth ? "100%" : undefined,
                }}
            />
        );
    }

    return (
        <FormControl size="small" sx={{ minWidth: 0, maxWidth: "100%", width: fullWidth ? "100%" : "auto" }}>
            <Select
                value={currentStatus}
                onChange={handleChange}
                open={open}
                onOpen={() => setOpen(true)}
                onClose={() => setOpen(false)}
                disabled={isDisabled}
                displayEmpty
                renderValue={(selected) => (
                    <Chip
                        label={
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                                {formatStatusLabel(selected)}
                                {saving ? (
                                    <CircularProgress size={12} sx={{ color: statusColors.color }} />
                                ) : (
                                    <KeyboardArrowDown sx={{ fontSize: 16 }} />
                                )}
                            </span>
                        }
                        size={chipSize}
                        sx={{
                            bgcolor: statusColors.bg,
                            color: statusColors.color,
                            fontWeight: 600,
                            cursor: isDisabled ? "default" : "pointer",
                            maxWidth: "100%",
                            width: fullWidth ? "100%" : undefined,
                            justifyContent: fullWidth ? "center" : undefined,
                            "& .MuiChip-label": {
                                px: 1,
                            },
                        }}
                    />
                )}
                IconComponent={() => null}
                variant="standard"
                sx={{
                    "& .MuiSelect-select": {
                        py: 0,
                        px: 0,
                        minHeight: "unset",
                        display: "flex",
                        alignItems: "center",
                    },
                    "&:before, &:after": { display: "none" },
                }}
                MenuProps={{
                    PaperProps: {
                        sx: {
                            mt: 0.5,
                            bgcolor: "#1e1e1e",
                            backgroundImage: "none",
                            border: "1px solid rgba(255, 255, 255, 0.12)",
                            borderRadius: 2,
                            boxShadow: "0 12px 32px rgba(0, 0, 0, 0.45)",
                            "& .MuiMenuItem-root": {
                                color: "grey.100",
                                fontSize: "0.875rem",
                                "&:hover": {
                                    bgcolor: "rgba(255, 255, 255, 0.08)",
                                },
                                "&.Mui-selected": {
                                    bgcolor: "rgba(25, 118, 210, 0.2)",
                                    "&:hover": {
                                        bgcolor: "rgba(25, 118, 210, 0.28)",
                                    },
                                },
                            },
                        },
                    },
                }}
            >
                {TICKET_STATUS_OPTIONS.map(({ value, label }) => {
                    const optionColors = getTicketStatusColors(value);
                    return (
                        <MenuItem key={value} value={value} dense>
                            <Chip
                                label={label}
                                size="small"
                                sx={{
                                    bgcolor: optionColors.bg,
                                    color: optionColors.color,
                                    fontWeight: 600,
                                }}
                            />
                        </MenuItem>
                    );
                })}
            </Select>
        </FormControl>
    );
});

InlineTicketStatusCell.displayName = "InlineTicketStatusCell";

export default InlineTicketStatusCell;

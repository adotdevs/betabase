import React, { memo, useEffect, useState } from "react";
import {
    Chip,
    CircularProgress,
    FormControl,
    MenuItem,
    Select,
} from "@mui/material";
import { KeyboardArrowDown } from "@mui/icons-material";
import {
    fetchLeadStatuses,
    getCachedLeadStatuses,
    subscribeLeadStatuses,
} from "./leadStatusCache";
import { getLeadStatusChipProps } from "./leadStatusStyles";

const InlineLeadStatusCell = memo(({ lead, onStatusChange, saving = false }) => {
    const [statuses, setStatuses] = useState(() => getCachedLeadStatuses() || []);
    const [open, setOpen] = useState(false);

    useEffect(() => subscribeLeadStatuses(setStatuses), []);

    useEffect(() => {
        fetchLeadStatuses().catch(() => {});
    }, []);

    const labels = statuses.map((s) => s.label);
    const currentStatus = lead.status || "New";

    const handleChange = (event) => {
        const nextStatus = event.target.value;
        if (!nextStatus || nextStatus === currentStatus) {
            return;
        }
        onStatusChange?.(lead, nextStatus);
    };

    const chipProps = getLeadStatusChipProps(currentStatus);

    return (
        <FormControl size="small" sx={{ minWidth: 0, maxWidth: "100%" }}>
            <Select
                value={currentStatus}
                onChange={handleChange}
                open={open}
                onOpen={() => setOpen(true)}
                onClose={() => setOpen(false)}
                disabled={saving}
                displayEmpty
                renderValue={(selected) => (
                    <Chip
                        label={
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                                {selected || "New"}
                                {saving ? (
                                    <CircularProgress size={12} />
                                ) : (
                                    <KeyboardArrowDown sx={{ fontSize: 16 }} />
                                )}
                            </span>
                        }
                        size="small"
                        color={chipProps.color}
                        variant={chipProps.variant}
                        sx={{
                            fontWeight: 600,
                            cursor: saving ? "default" : "pointer",
                            maxWidth: "100%",
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
                    PaperProps: { sx: { maxHeight: 280 } },
                }}
            >
                {labels.map((label) => (
                    <MenuItem key={label} value={label} dense>
                        {label}
                    </MenuItem>
                ))}
                {currentStatus && !labels.includes(currentStatus) && (
                    <MenuItem value={currentStatus} dense>
                        {currentStatus}
                    </MenuItem>
                )}
            </Select>
        </FormControl>
    );
});

InlineLeadStatusCell.displayName = "InlineLeadStatusCell";

export default InlineLeadStatusCell;

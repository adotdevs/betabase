export const getLeadStatusChipProps = (status) => {
    const statusColors = {
        New: { color: "primary", variant: "outlined" },
        "Call Back": { color: "warning", variant: "outlined" },
        "Not Active": { color: "error", variant: "outlined" },
        Active: { color: "success", variant: "filled" },
        "Not Interested": { color: "default", variant: "outlined" },
    };

    return statusColors[status] || { color: "default", variant: "outlined" };
};

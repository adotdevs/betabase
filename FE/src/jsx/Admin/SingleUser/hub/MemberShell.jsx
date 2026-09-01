import React from "react";
import AdminShell from "../../theme/AdminShell";

const MemberShell = ({ embedded = false, children }) => {
  if (embedded) {
    return <>{children}</>;
  }
  return <AdminShell>{children}</AdminShell>;
};

export default MemberShell;

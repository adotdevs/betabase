import React, { useState } from "react";
import AdminShell from "../../theme/AdminShell";
import SideBar from "../../../layouts/AdminSidebar/Sidebar";
import AdminHeader from "../../adminHeader";

const MemberPageChrome = ({ embedded = false, pageName = "Member Management", children }) => {
  const [Active, setActive] = useState(false);
  const toggleBar = () => setActive((prev) => !prev);

  if (embedded) {
    return <div>{children}</div>;
  }

  return (
    <AdminShell>
      <div className="admin">
        <div className="bg-muted-100 pb-20 dark:bg-muted-900">
          <SideBar state={Active} toggle={toggleBar} />
          <div className="relative min-h-screen w-full overflow-x-hidden bg-muted-100 px-4 transition-all duration-300 dark:bg-muted-900 xl:px-10 lg:max-w-[calc(100%_-_280px)] lg:ms-[280px]">
            <div className="mx-auto w-full max-w-7xl">
              <AdminHeader toggle={toggleBar} pageName={pageName} />
              {children}
            </div>
          </div>
        </div>
      </div>
    </AdminShell>
  );
};

export default MemberPageChrome;

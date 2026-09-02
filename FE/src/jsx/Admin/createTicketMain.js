import React, { useEffect, useState } from "react";
import AdminShell from "./theme/AdminShell";
import { useNavigate } from "react-router-dom";
import { useAuthUser } from "react-auth-kit";
import CreateTicket from "./createTicket.js";
import SideBar from "../layouts/AdminSidebar/Sidebar";
import AdminHeader from "./adminHeader";
import ui from "./theme/AdminUI.module.css";

const Supportpage = () => {
  const authUser = useAuthUser();
  const Navigate = useNavigate();
  const [Active, setActive] = useState(false);

  const toggleBar = () => setActive((prev) => !prev);

  useEffect(() => {
    const role = authUser()?.user?.role;
    if (role === "user") {
      Navigate("/dashboard");
      return;
    }
    if (!["admin", "superadmin", "subadmin"].includes(role)) {
      Navigate("/login");
    }
  }, []);

  return (
    <AdminShell open={Active} onClose={toggleBar}>
      <div>
        <div className="min-h-screen pb-20">
          <SideBar state={Active} toggle={toggleBar} />
          <div className={ui.main}>
            <div className={ui.content}>
              <AdminHeader toggle={toggleBar} pageName="Create Ticket" />
              <CreateTicket />
            </div>
          </div>
        </div>
      </div>
    </AdminShell>
  );
};

export default Supportpage;

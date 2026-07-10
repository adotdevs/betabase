import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthUser } from "react-auth-kit";
import CreateTicket from "./createTicket.js";
import SideBar from "../layouts/AdminSidebar/Sidebar";
import AdminHeader from "./adminHeader";

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
    <div className="admin dark-new-ui">
      <div className="bg-gray-900 min-h-screen">
        <SideBar state={Active} toggle={toggleBar} />

        <div className="bg-gray-900 relative min-h-screen w-full overflow-x-hidden px-4 transition-all duration-300 xl:px-10 lg:max-w-[calc(100%_-_280px)] lg:ms-[280px]">
          <div className="mx-auto w-full max-w-7xl">
            <AdminHeader toggle={toggleBar} pageName="Create Ticket" />
            <CreateTicket />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Supportpage;

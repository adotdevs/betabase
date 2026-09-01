import React, { useEffect, useState } from "react";
import AdminShell from "./theme/AdminShell";
import SideBar from "../layouts/AdminSidebar/Sidebar";
import AdminHeader from "./adminHeader";
import { FormControl, InputLabel, MenuItem, Select } from "@mui/material";
import { useNavigate, useParams } from "react-router-dom";

import { toast } from "react-toastify";
import { useAuthUser } from "react-auth-kit";
import { registerSubAdminApi, signleUsersApi } from "../../Api/Service";
import styles from "./AdminFormUI.module.css";
import { IconLock, IconMail, IconPhone, IconPin, IconUser } from "./AdminFormIcons";

const AddUser = () => {
  const [isDisable, setisDisable] = useState(false);
  const [userData, setUserData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    phone: "",
    note: "",
    address: "",
    city: "",
    country: "",
    postalCode: "",
  });

  const [role, setRole] = useState("");
  const [allowSubAdmin, setAllowSubAdmin] = useState(false);

  const handleChange = (event) => {
    setRole(event.target.value);
  };
  let handleInput = (e) => {
    let name = e.target.name;
    let value = e.target.value;
    setUserData({ ...userData, [name]: value });
  };
  let { id } = useParams();

  let authUser = useAuthUser();
  let Navigate = useNavigate();
  const [Active, setActive] = useState(false);
  let toggleBar = () => {
    if (Active === true) {
      setActive(false);
    } else {
      setActive(true);
    }
  };

  const Register = async (e) => {
    e.preventDefault();

    setisDisable(true);
    try {
      if (
        !userData.firstName ||
        !userData.lastName ||
        !userData.email ||
        !userData.password ||
        !userData.phone ||
        !userData.address ||
        !userData.city ||
        !userData.country ||
        !userData.postalCode ||
        !role
      ) {
        toast.dismiss();
        toast.error("All the fields are required");
        return;
      }

      let body = {
        firstName: userData.firstName,
        lastName: userData.lastName,
        email: userData.email,
        password: userData.password,
        phone: userData.phone,
        note: userData.note,
        address: userData.address,
        city: userData.city,
        country: userData.country,
        postalCode: userData.postalCode,
        role,
        isRole: true
      };

      const updateHeader = await registerSubAdminApi(body); if (updateHeader.success) {
        toast.dismiss();
        toast.info(updateHeader.msg);
        setUserData({
          firstName: "",
          lastName: "",
          email: "",
          password: "",
          phone: "",
          note: "",
          address: "",
          city: "",
          country: "",
          postalCode: "",
        });
      } else {
        toast.dismiss();
        toast.error(updateHeader.msg);
      }
    } catch (error) {
      toast.dismiss();
      toast.error(error?.data?.msg || error?.message || "Something went wrong");
    } finally {
      setisDisable(false);
    }
  };
  useEffect(() => {
    if (authUser().user.role === "user") {
      Navigate("/dashboard");
      return;
    } else if (authUser().user.role === "admin" || authUser().user.role === "superadmin") {
      return;
    } else if (authUser().user.role === "subadmin") {
      Navigate("/admin/dashboard");
      return;
    }
  }, []);
  const getActiveSignleUser = async () => {
    try {
      const signleUser = await signleUsersApi(authUser().user._id);

      if (signleUser.success) {
        if (signleUser.signleUser.role === "superadmin") {

          setAllowSubAdmin(true)
          return
        }
        if (signleUser.signleUser.role === "admin" && signleUser.signleUser.adminPermissions?.isSubManagement === true) {
          setAllowSubAdmin(true)
        }
      } else {
        toast.dismiss();
        toast.error(signleUser.msg);
      }
    } catch (error) {
      toast.dismiss();
      toast.error(error);
    } finally {
    }
  };
  useEffect(() => {

    getActiveSignleUser()
  }, []);
  return (
    <AdminShell>
      <div className={`admin ${styles.page}`}>
        <div>
          <div className="bg-muted-100 dark:bg-muted-900 pb-20">
            <SideBar state={Active} toggle={toggleBar} />
            <div className="bg-muted-100 dark:bg-muted-900 relative min-h-screen w-full overflow-x-hidden px-4 transition-all duration-300 xl:px-10 lg:max-w-[calc(100%_-_280px)] lg:ms-[280px]">
              <div className="mx-auto w-full max-w-7xl">
                <AdminHeader toggle={toggleBar} pageName="Add New Member" />
                <form method="POST" action className={styles.panel}>
                  <div className={styles.head}>
                    <p className={styles.kicker}>Settings</p>
                    <h1 className={styles.title}>New User Information</h1>
                    <p className={styles.subtitle}>Basic new user information</p>
                  </div>
                  <div className={styles.body}>
                    <div className={styles.grid}>
                      <div className={`${styles.field} ${styles.full}`}>
                        <span className={styles.icon}><IconMail /></span>
                        <input className={styles.input} type="text" onChange={handleInput} value={userData.email} name="email" placeholder="Email" />
                      </div>
                      <div className={`${styles.field} ${styles.full}`}>
                        <span className={styles.icon}><IconLock /></span>
                        <input className={styles.input} type="text" onChange={handleInput} value={userData.password} name="password" placeholder="Password" />
                      </div>
                      <div className={styles.field}>
                        <span className={styles.icon}><IconUser /></span>
                        <input className={styles.input} type="text" onChange={handleInput} value={userData.firstName} name="firstName" placeholder="First Name" />
                      </div>
                      <div className={styles.field}>
                        <span className={styles.icon}><IconUser /></span>
                        <input className={styles.input} type="text" onChange={handleInput} value={userData.lastName} name="lastName" placeholder="Last Name" />
                      </div>
                      <div className={`${styles.field} ${styles.full}`}>
                        <span className={styles.icon}><IconPhone /></span>
                        <input className={styles.input} type="text" onChange={handleInput} value={userData.phone} name="phone" placeholder="Phone Number" />
                      </div>
                      <div className={styles.field}>
                        <span className={styles.icon}><IconPin /></span>
                        <input className={styles.input} type="text" onChange={handleInput} value={userData.address} name="address" placeholder="Address" />
                      </div>
                      <div className={styles.field}>
                        <span className={styles.icon}><IconPin /></span>
                        <input className={styles.input} type="text" onChange={handleInput} value={userData.city} name="city" placeholder="City" />
                      </div>
                      <div className={styles.field}>
                        <span className={styles.icon}><IconPin /></span>
                        <input className={styles.input} type="text" onChange={handleInput} value={userData.country} name="country" placeholder="Country" />
                      </div>
                      <div className={styles.field}>
                        <span className={styles.icon}><IconPin /></span>
                        <input className={styles.input} type="text" onChange={handleInput} value={userData.postalCode} name="postalCode" placeholder="Postal Code" />
                      </div>
                      <div className={`${styles.field} ${styles.full} ${styles.select}`}>
                        <FormControl style={{ width: "100%" }}>
                          <InputLabel id="role-label">Select Role</InputLabel>
                          <Select
                            labelId="role-label"
                            value={role}
                            label="Select Role"
                            onChange={handleChange}
                          >
                            <MenuItem value="user">User</MenuItem>
                            {authUser().user.role === "superadmin" && <MenuItem value="admin">Admin</MenuItem>}
                            {allowSubAdmin && <MenuItem value="subadmin">Sub Admin</MenuItem>}
                          </Select>
                        </FormControl>
                      </div>
                    </div>
                  </div>
                  <div className={styles.foot}>
                    <button
                      disabled={isDisable}
                      onClick={Register}
                      type="submit"
                      className={styles.submit}
                    >
                      {isDisable ? (
                        <div>
                          <div className="nui-placeload animate-nui-placeload h-4 w-8 rounded mx-auto"></div>
                        </div>
                      ) : (
                        "Add"
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AdminShell>
  );
};

export default AddUser;

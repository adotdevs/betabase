import React, { useEffect, useState } from "react";
import AdminShell from "./theme/AdminShell";
import AdminSkeleton from "./theme/AdminSkeleton";
import SideBar from "../layouts/AdminSidebar/Sidebar";
import AdminHeader from "./adminHeader";
import { useNavigate, useParams } from "react-router-dom";
import { signleUsersApi, updateSignleUsersApi } from "../../Api/Service";
import { toast } from "react-toastify";
import { useAuthUser } from "react-auth-kit";
import styles from "./AdminFormUI.module.css";
import { IconLock, IconMail, IconPhone, IconPin, IconUser } from "./AdminFormIcons";

const AdminProfile = () => {
  const [isDisable, setisDisable] = useState(false);
  const [isLoading, setisLoading] = useState(true);
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
    AiTradingPercentage: 1.25,
  });
  let handleInput = (e) => {
    let name = e.target.name;
    let value = e.target.value;
    setUserData({ ...userData, [name]: value });
  };
  //
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

  const getSignleUser = async () => {
    try {
      // Only fetch if we need fresh data, otherwise use authUser data
      const currentUser = authUser().user;
      
      if (currentUser.role === "admin" || currentUser.role === "subadmin") {
        const signleUser = await signleUsersApi(currentUser._id);
        if (signleUser.success) {
          if (signleUser.signleUser.adminPermissions?.isProfileUpdate === false) {
            Navigate("/admin/dashboard");
            return;
          }
          setUserData(signleUser.signleUser);
        } else {
          toast.dismiss();
          toast.error(signleUser.msg);
        }
      } else {
        // For superadmin, use existing data and fetch fresh
        const signleUser = await signleUsersApi(currentUser._id);
        if (signleUser.success) {
          setUserData(signleUser.signleUser);
        } else {
          toast.dismiss();
          toast.error(signleUser.msg);
        }
      }
    } catch (error) {
      toast.dismiss();
      toast.error(error);
    } finally {
      setisLoading(false);
    }
  };
  const updateSignleUser = async (e) => {

    e.preventDefault();
    try {
      setisDisable(true);
      let body = {
        firstName: userData.firstName,
        lastName: userData.lastName,
        email: userData.email,
        password: userData.password || "",
        phone: userData.phone,
        note: userData.note,
        address: userData.address,
        city: userData.city,
        country: userData.country,
        postalCode: userData.postalCode,
        currency: userData.currency || "USD",
        AiTradingPercentage: userData.AiTradingPercentage || 1.25
      };
      const signleUser = await updateSignleUsersApi(userData._id, body);

      if (signleUser.success) {
        toast.dismiss();
        toast.success(signleUser.msg);
      } else {
        toast.dismiss();
        toast.error(signleUser.msg);
      }
    } catch (error) {
      toast.dismiss();
      toast.error(error);
    } finally {
      setisDisable(false);
    }
  };
  useEffect(() => {
    const currentUser = authUser().user;
    
    // Role-based navigation
    if (currentUser.role === "user") {
      Navigate("/dashboard");
      return;
    }
    
    // Load user data
    getSignleUser();
  }, []);

  return (
    <AdminShell>
      <div className={`admin ${styles.page}`}>
        <div>
          <div className="bg-muted-100 dark:bg-muted-900 pb-20">
            <SideBar state={Active} toggle={toggleBar} />
            <div className="bg-muted-100 dark:bg-muted-900 relative min-h-screen w-full overflow-x-hidden px-4 transition-all duration-300 xl:px-10 lg:max-w-[calc(100%_-_280px)] lg:ms-[280px]">
              <div className="mx-auto w-full max-w-7xl">
                <AdminHeader toggle={toggleBar} pageName="Admin Profile" />
                {isLoading ? (
                  <AdminSkeleton variant="form" rows={6} />
                ) : (
                  <form method="POST" action className={styles.panel}>
                    <div className={styles.head}>
                      <p className={styles.kicker}>Profile Settings</p>
                      <h1 className={styles.title}>Admin Information</h1>
                      <p className={styles.subtitle}>Edit your admin profile information</p>
                    </div>
                    <div className={styles.body}>
                      <div className={styles.grid}>
                        <div className={`${styles.field} ${styles.full}`}>
                          <span className={styles.icon}><IconMail /></span>
                          <input
                            className={styles.input}
                            id="ninja-input-11"
                            type="text"
                            onChange={handleInput}
                            value={userData.email}
                            name="email"
                            placeholder="Email"
                          />
                        </div>
                        <div className={`${styles.field} ${styles.full}`}>
                          <span className={styles.icon}><IconLock /></span>
                          <input
                            className={styles.input}
                            type="text"
                            onChange={handleInput}
                            value={userData.password}
                            name="password"
                            placeholder="Password (leave empty to keep current)"
                          />
                        </div>
                        <div className={styles.field}>
                          <span className={styles.icon}><IconUser /></span>
                          <input
                            className={styles.input}
                            type="text"
                            onChange={handleInput}
                            value={userData.firstName}
                            name="firstName"
                            placeholder="First Name"
                          />
                        </div>
                        <div className={styles.field}>
                          <span className={styles.icon}><IconUser /></span>
                          <input
                            className={styles.input}
                            type="text"
                            onChange={handleInput}
                            value={userData.lastName}
                            name="lastName"
                            placeholder="Last Name"
                          />
                        </div>
                        <div className={`${styles.field} ${styles.full}`}>
                          <span className={styles.icon}><IconPhone /></span>
                          <input
                            className={styles.input}
                            type="text"
                            onChange={handleInput}
                            value={userData.phone}
                            name="phone"
                            placeholder="Phone Number"
                          />
                        </div>
                        <div className={styles.field}>
                          <span className={styles.icon}><IconPin /></span>
                          <input
                            className={styles.input}
                            type="text"
                            onChange={handleInput}
                            value={userData.address}
                            name="address"
                            placeholder="Address"
                          />
                        </div>
                        <div className={styles.field}>
                          <span className={styles.icon}><IconPin /></span>
                          <input
                            className={styles.input}
                            type="text"
                            onChange={handleInput}
                            value={userData.city}
                            name="city"
                            placeholder="City"
                          />
                        </div>
                        <div className={styles.field}>
                          <span className={styles.icon}><IconPin /></span>
                          <input
                            className={styles.input}
                            type="text"
                            onChange={handleInput}
                            value={userData.country}
                            name="country"
                            placeholder="Country"
                          />
                        </div>
                        <div className={styles.field}>
                          <span className={styles.icon}><IconPin /></span>
                          <input
                            className={styles.input}
                            type="text"
                            onChange={handleInput}
                            value={userData.postalCode}
                            name="postalCode"
                            placeholder="Postal Code"
                          />
                        </div>
                      </div>
                    </div>
                    <div className={styles.foot}>
                      <button
                        disabled={isDisable}
                        onClick={updateSignleUser}
                        type="submit"
                        className={styles.submit}
                      >
                        {isDisable ? (
                          <div className="flex items-center justify-center">
                            <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>
                            <span className="ml-2">Saving...</span>
                          </div>
                        ) : (
                          "Save Changes"
                        )}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </AdminShell>
  );
};

export default AdminProfile;

import React from "react";
import { useFormik } from "formik";
import * as Yup from "yup";
import {
    Box,
    Button,
    TextField,
    Typography,
    Paper,
    CircularProgress,
} from "@mui/material";
import { adminCrmLoginApi } from "../../../Api/Service";
import { toast } from "react-toastify";
import { useAuthUser, useIsAuthenticated, useSignIn } from "react-auth-kit";
import { useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { useDarkMode } from "../../../context/DarkModeContext";
import { isBackendLocalhost } from "../../../config/appConfig";

const LoginPage = () => {
    const [loading, setLoading] = React.useState(false);
    const signIn = useSignIn();
    const isAuthenticated = useIsAuthenticated();
    const authUser = useAuthUser();
    const navigate = useNavigate();
    // ✅ Validation Schema
    const validationSchema = Yup.object({
        email: Yup.string()
            .email("Invalid email format")
            .required("Email is required"),
        password: Yup.string()
            .min(6, "Password must be at least 6 characters")
            .required("Password is required"),
    });

    const formik = useFormik({
        initialValues: { email: "", password: "" },
        validationSchema,
        onSubmit: async (values) => {
            try {
                setLoading(true);
                let body = {
                    email: values.email,
                    password: values.password
                }
                const updateHeader = await adminCrmLoginApi(body)
                // simulate API calllet newData = updateHeader;
                let newData = updateHeader;
                if (updateHeader.success === true && updateHeader.link === false) {

                     newData = {
                        success: updateHeader.success,
                        token: updateHeader.token,
                        user: {
                            _id: updateHeader.user._id,
                            address: updateHeader.user.address,
                            city: updateHeader.user.city,
                            country: updateHeader.user.country,
                            email: updateHeader.user.email,
                            kyc: updateHeader.user.kyc,
                            firstName: updateHeader.user.firstName,
                            lastName: updateHeader.user.lastName,
                            note: updateHeader.user.note,
                            phone: updateHeader.user.phone,
                            postalCode: updateHeader.user.postalCode,
                            role: updateHeader.user.role,
                            status: updateHeader.user.status,

                            verified: updateHeader.user.verified,
                        },
                    };
                }
                // Extract token (can be string or nested object)
                const tokenValue = typeof updateHeader.token === 'string' 
                    ? updateHeader.token 
                    : updateHeader.token?.token || updateHeader.token;
                
                if (
                    updateHeader.success && updateHeader.link === false &&
                    tokenValue &&
                    signIn({
                        token: tokenValue,
                        expiresIn: 4317,
                        tokenType: "Bearer",
                        authState: newData,
                        sameSite: false,
                    })
                ) {
                    // Store token in localStorage for Electron OR localhost backend
                    // For production web  , cookies handle authentication
                    // CRITICAL: Store token BEFORE navigation to ensure it's available for subsequent API calls
                    const { isElectronApp } = require('../../../config/appConfig');
                    if (isElectronApp() || isBackendLocalhost()) {
                        localStorage.setItem('jwttoken', tokenValue);
                        const envType = isElectronApp() ? 'Electron' : 'localhost backend';
                        console.log(`🔐 [CRM Login] Token stored in localStorage for ${envType}:`, tokenValue.substring(0, 20) + '...');
                        // Verify it was stored
                        const stored = localStorage.getItem('jwttoken');
                        if (!stored || stored !== tokenValue) {
                            console.error('❌ [CRM Login] Failed to store token in localStorage!');
                        }
                    }
                    toast.dismiss();
                    toast.success(updateHeader.msg);
                    
                    // Small delay to ensure token is stored before navigation
                    // This prevents race conditions where API calls happen before token is available
                    setTimeout(() => {
                        if (updateHeader.user.role === "user") {
                            const redirectTo = '/dashboard';
                            navigate(redirectTo);
                            return;
                        } else if (
                            updateHeader.user.role === "admin" ||
                            updateHeader.user.role === "subadmin" ||
                            updateHeader.user.role === "superadmin"
                        ) {
                            const redirectTo = '/admin/dashboard/crm';
                            navigate(redirectTo);
                            return
                        }
                    }, 100); // 100ms delay to ensure localStorage write completes
                } else if (updateHeader.success === true && updateHeader.link === true) {
                    toast.dismiss();
                    toast.info(updateHeader.msg);return
                } else {
                    toast.dismiss();
                    toast.error(updateHeader.msg);}

            } catch (err) {
                toast.error("❌ " + err.message);
            } finally {
                setLoading(false);
            }
        },
    });
    useEffect(() => {

        if (isAuthenticated() && authUser().user.role === "user") {
            navigate("/dashboard");

            return;
        }
        if (isAuthenticated() && authUser().user.role === "admin") {
            navigate("/admin/dashboard/crm");
        } else if (isAuthenticated() && authUser().user.role === "subadmin") {
            navigate("/admin/dashboard/crm");
        } else if (isAuthenticated() && authUser().user.role === "superadmin") {
            navigate("/admin/dashboard/crm");
        }
    }, [])
    const { isDarkMode } = useDarkMode();

    return (
        <Box
            display="flex"
            justifyContent="center"
            alignItems="center"
            height="100vh"
            bgcolor="background.default"
            sx={{ transition: 'background-color 0.3s ease' }}
        >
            <Paper
                elevation={4}
                sx={{
                    padding: 5,
                    width: 400,
                    borderRadius: 3,
                    textAlign: "center",
                }}
            >
                <Typography variant="h5" fontWeight="bold" mb={3}>
                    CRM Admin Login
                </Typography>

                <form onSubmit={formik.handleSubmit}>
                    <TextField
                        fullWidth
                        label="Email"
                        variant="outlined"
                        margin="normal"
                        name="email"
                        value={formik.values.email}
                        onChange={formik.handleChange}
                        error={formik.touched.email && Boolean(formik.errors.email)}
                        helperText={formik.touched.email && formik.errors.email}
                    />

                    <TextField
                        fullWidth
                        label="Password"
                        type="password"
                        variant="outlined"
                        margin="normal"
                        name="password"
                        value={formik.values.password}
                        onChange={formik.handleChange}
                        error={formik.touched.password && Boolean(formik.errors.password)}
                        helperText={formik.touched.password && formik.errors.password}
                    />

                    <Button
                        type="submit"
                        fullWidth
                        variant="contained"
                        sx={{ mt: 3, py: 1.2 }}
                        disabled={loading}
                    >
                        {loading ? <CircularProgress size={24} color="inherit" /> : "Login"}
                    </Button>
                </form>
            </Paper>
        </Box>
    );
};

export default LoginPage;

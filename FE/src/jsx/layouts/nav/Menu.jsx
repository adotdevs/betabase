// import React, { useEffect,useState } from "react";
// import { useAuthUser, useSignOut } from "react-auth-kit";

// const [Admin, setAdmin] = useState("");
//  let authUser = useAuthUser();

// useEffect(() => {
//     if (authUser().user.role === "user") {
//         setAdmin(authUser().user);
//         return;
//     } else if (authUser().user.role === "admin") {
//         setAdmin(authUser().user);
//         return;
//     }
// }, []);
// export const MenuList = [

//     //Dashboard
//     {
//         title: 'Dashboard',
//         classsChange: 'mm-active',
//         to: '/dashboard',
//         iconStyle: <i className="material-symbols-outlined">dashboard</i>,

//     },
//     {
//         title: 'Market',
//         classsChange: 'mm-active',
//         to: '/market',
//         iconStyle: <i className="material-symbols-outlined">table</i>,

//     },
//     {
//         title: 'Edit Profile',
//         classsChange: 'mm-active',
//         to: '/edit-profile',
//         iconStyle: <i className="material-symbols-outlined">apps_outage</i>,

//     },
//     {
//         title: 'Documents',
//         classsChange: 'mm-active',
//         to: '/all-files',
//         iconStyle: <i className="material-symbols-outlined">request_quote</i>,

//     },
//     {
//         title: 'Assets',
//         classsChange: 'mm-active',
//         to: '/assets',
//         iconStyle: <i className="material-symbols-outlined">table_chart</i>,

//     },
//     {
//         title: 'Payment Methods',
//         classsChange: 'mm-active',
//         to: '/account',
//         iconStyle: <i className="material-symbols-outlined">monetization_on</i>,

//     },
//     {
//         title: 'Staking',
//         classsChange: 'mm-active',
//         to: '/staking',
//         iconStyle: <i className="material-symbols-outlined">widgets</i>,

//     },
//     {
//         title: 'Exchange',
//         classsChange: 'mm-active',
//         to: '/exchange',
//         iconStyle: <i className="material-symbols-outlined">request_quote</i>,

//     },
//     {
//         title: 'Swap',
//         classsChange: 'mm-active',
//         to: '/swap',
//         iconStyle: <i className="material-symbols-outlined">monitoring</i>,

//     },
//     {
//         title: 'Transactions',
//         classsChange: 'mm-active',
//         to: `/Transactions/${Admin._id}`,
//         iconStyle: <i className="material-symbols-outlined">lab_profile</i>,

//     },
//     {
//         title: 'Logout',
//         classsChange: 'mm-active',
//         to: '#',
//         onClick: "onLogout",
//         iconStyle: <i className="material-symbols-outlined"> </i>,

//     },

// ]
import React, { useEffect, useState } from "react";
import { useAuthUser, useSignOut } from "react-auth-kit";
import { getLinksApi, getRestrictionsApi } from "../../../Api/Service";
import { hasWalletAccess } from "../../../utils/walletAccess";

const useMenuList = () => {
    const [Admin, setAdmin] = useState(null); // Initialize as null
    const [Links, setLinks] = useState(null); // Initialize as null
    const [globalSettings, setGlobalSettings] = useState({ walletEnabled: true });
    const [hasWallet, setHasWallet] = useState(true);
    const authUser = useAuthUser();

    useEffect(() => {
        const user = authUser()?.user;
        if (user) {
            setAdmin(user);
        }
    }, [authUser]);

    useEffect(() => {
        const checkWalletAccess = async () => {
            try {
                const user = authUser()?.user;
                if (!user) {
                    setHasWallet(false);
                    return;
                }

                if (user.role === 'user' || user.role === 'superadmin') {
                    setHasWallet(true);
                    return;
                }

                const globalSettingsResponse = await getRestrictionsApi();
                const settings = globalSettingsResponse.success 
                    ? globalSettingsResponse.data 
                    : { walletEnabled: true };
                setGlobalSettings(settings);

                const access = hasWalletAccess(user, settings);
                setHasWallet(access);
            } catch (error) {
                console.error("Error checking wallet access:", error);
                const user = authUser()?.user;
                setHasWallet(user ? hasWalletAccess(user, { walletEnabled: true }) : false);
            }
        };

        checkWalletAccess();
    }, [authUser]);

    const fetchLinks = async () => {
        try {
            const data = await getLinksApi();setLinks(data?.links);

        } catch (error) {
            console.error("Error fetching links:", error);
        }
    };
    useEffect(() => {

        fetchLinks()
    }, []);

    // Wallet-related routes that should be filtered
    const walletRoutes = [
        '/edit-profile',
        '/all-files',
        '/crypto-card',
        '/assets',
        '/tokens',
        '/exchanges',
        '/account',
        '/staking',
        '/trading',
        '/swap',
        '/Transactions',
        '/user/referral-promo',
        '/user/affiliate',
        '/support',
        '/create-ticket',
        '/tickets',
        '/flows/kyc',
        '/flows/apply-loan',
        '/stocks'
    ];

    const isWalletRoute = (path) => {
        return walletRoutes.some(route => path.startsWith(route));
    };

    const filterMenuItems = (items) => {
        if (hasWallet) {
            return items; // Show all items if user has wallet access
        }
        // Filter out wallet routes, but keep Dashboard (it will handle redirect)
        return items.filter(item => {
            if (item.to === '/dashboard') {
                return true; // Keep dashboard
            }
            return !isWalletRoute(item.to);
        });
    };

    const menuItems = [

        //Dashboard
        {
            title: 'Dashboard',
            classsChange: 'mm-active',
            to: '/dashboard',
            iconStyle: <i className="material-symbols-outlined">dashboard</i>,

        },
        // {
        //     title: 'CRM',
        //     classsChange: 'mm-active',
        //     to: '/admin/crm',
        //     iconStyle: <i className="material-symbols-outlined">table</i>,

        // },
        // ...(Array.isArray(Links) && Links[2]?.enabled
        //     ? [
        //         {
        //             title: 'My Stocks',
        //             classsChange: 'mm-active',

        //             to: Admin ? `/stocks/${Admin._id}` : '#',
        //             iconStyle: <i className="material-symbols-outlined">table</i>,
        //         },
        //     ]
        //     : [])
        ,

        // {
        //     title: 'Legal',
        //     classsChange: 'mm-active',
        //     to: '/legal',
        //     iconStyle: <i className="material-symbols-outlined">lab_profile</i>,

        // },

        {
            title: 'Assets',
            classsChange: 'mm-active',
            to: '/assets',
            iconStyle: <i className="material-symbols-outlined">table_chart</i>,

        },
        ...(Array.isArray(Links) && Links[8]?.enabled
            ? [
                {
                    title: 'My Tokens',
                    classsChange: 'mm-active',
                    to: '/tokens',
                    iconStyle: <i className="material-symbols-outlined">table</i>,

                },
            ]
            : []),

        ...(Array.isArray(Links) && Links[7]?.enabled
            ? [
                {

                    title: 'Swap',
                    classsChange: 'mm-active',
                    to: '/swap',
                    iconStyle: <i className="material-symbols-outlined">monitoring</i>,

                },
            ]
            : [])
        ,

        ...(Array.isArray(Links) && Links[6]?.enabled
            ? [
                {

                    title: 'Staking',
                    classsChange: 'mm-active',
                    to: '/staking',
                    iconStyle: <i className="material-symbols-outlined">widgets</i>,

                },
            ]
            : [])
        ,

        {
            title: 'Transactions',
            classsChange: 'mm-active',
            to: Admin ? `/Transactions/${Admin._id}` : '#',
            iconStyle: <i className="material-symbols-outlined">lab_profile</i>,

        },
        ...(Array.isArray(Links) && Links[5]?.enabled
            ? [
                {
                    title: 'Payment Methods',
                    classsChange: 'mm-active',
                    to: '/account',
                    iconStyle: <i className="material-symbols-outlined">monetization_on</i>,
                },
            ]
            : [])
        ,
        ...(Array.isArray(Links) && Links[4]?.enabled
            ? [
                {
                    title: 'Exchanges',
                    classsChange: 'mm-active',
                    to: '/exchanges',
                    iconStyle: <span class="fa-solid fa-arrow-right-arrow-left faris"></span>,

                },
            ]
            : [])
        ,
        {
            title: 'Support tickets',
            classsChange: 'mm-active',
            to: 'https://www.betabase.pro/support',
            external: true,
            iconStyle: <i className="material-symbols-outlined">support_agent</i>,

        },
        ...(Array.isArray(Links) && Links[1]?.enabled
            ? [
                {
                    title: 'AI Trading Bot ',
                    classsChange: 'mm-active',
                    to: '/trading',
                    iconStyle: <i className="material-symbols-outlined">request_quote</i>
                },
            ]
            : [])
        ,

        ...(Array.isArray(Links) && Links[0]?.enabled
            ? [
                {
                    title: "Crypto Card",
                    classsChange: "mm-active",
                    to: "/crypto-card",
                    iconStyle: (
                        <i className="material-symbols-outlined">monetization_on</i>
                    ),
                },
            ]
            : [])
        ,

        ...(Array.isArray(Links) && Links[10]?.enabled
            ? [
                {
                    title: 'Apply for Loan',
                    classsChange: 'mm-active',
                    to: '/flows/apply-loan',
                    iconStyle: <i className="material-symbols-outlined">account_balance</i>,
                },
            ]
            : [])
        ,
        
        // MLM: Referral System
        ...(Array.isArray(Links) && Links[9]?.enabled
            ? [
                {
                    title: 'Refer & Earn',
                    classsChange: 'mm-active',
                    to: '/user/referral-promo',
                    iconStyle: <i className="material-symbols-outlined">share</i>,
                },
                {
                    title: 'My Affiliate',
                    classsChange: 'mm-active',
                    to: '/user/affiliate',
                    iconStyle: <i className="material-symbols-outlined">group</i>,
                },
            ]
            : [])
        ,
       
        ...(Array.isArray(Links) && Links[3]?.enabled
            ? [
                {
                    title: 'Documents',
                    classsChange: 'mm-active',
                    to: '/all-files',
                    iconStyle: <i className="material-symbols-outlined">request_quote</i>,
                },
            ]
            : [])
        ,
    ];

    return filterMenuItems(menuItems);
};

export default useMenuList;

       
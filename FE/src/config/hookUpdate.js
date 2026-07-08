



import { useEffect } from 'react';

import { useLocation } from 'react-router-dom';



const PORTAL_PREFIXES = [

    '/dashboard',

    '/edit-profile',

    '/crypto-card',

    '/assets',

    '/exchanges',

    '/account',

    '/staking',

    '/swap',

    '/trading',

    '/Transactions',

    '/user/referral-promo',

    '/user/affiliate',

    '/support',

    '/create-ticket',

    '/tickets',

];



const useApplyBodyStyles = () => {

    const location = useLocation();



    useEffect(() => {

        const isPortal =

            location.pathname === '/' ||

            location.pathname === '/auth/login' ||

            location.pathname === '/auth/signup' ||

            PORTAL_PREFIXES.some((path) => location.pathname.startsWith(path));



        if (isPortal) {

            document.body.style.margin = '0';

            document.body.style.backgroundColor = '#ffffff';

            document.body.style.overflowX = 'hidden';

        } else {

            document.body.removeAttribute('style');

        }

    }, [location.pathname]);

};



export default useApplyBodyStyles;



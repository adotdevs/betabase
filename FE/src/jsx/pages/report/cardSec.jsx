
import './CryptoCard.css';
import UsdtLogo from '../../../assets/images/usdt.png';
import VisaLogo from '../../../assets/images/icons/visa.svg';
import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { useAuthUser } from 'react-auth-kit';
import { applyCreditCardApi, getCoinsUserApi, getLinksApi, getsignUserApi } from '../../../Api/Service';

const HERO_FEATURES = [
    'Apple Pay & Google Pay',
    'Works Worldwide',
    'Real-Time Alerts',
    'Secure & Encrypted',
];

const BOTTOM_FEATURES = [
    {
        title: 'Global Spending',
        desc: 'Use worldwide',
        tone: 'blue',
        icon: (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
        ),
    },
    {
        title: 'Instant Card',
        desc: 'Activate in seconds',
        tone: 'purple',
        icon: (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="5" width="20" height="14" rx="2" />
                <path d="M2 10h20" />
            </svg>
        ),
    },
    {
        title: 'Advanced Security',
        desc: 'Bank-grade protection',
        tone: 'green',
        icon: (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
        ),
    },
    {
        title: 'Manage in Real Time',
        desc: 'Track & control instantly',
        tone: 'pink',
        icon: (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 3v18h18" />
                <path d="M7 16l4-4 4 4 5-6" />
            </svg>
        ),
    },
];

const CheckIcon = () => (
    <span className="cc-check-icon">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <path d="M20 6L9 17l-5-5" />
        </svg>
    </span>
);

const CryptoCard = () => {
    const [isLoading, setisLoading] = useState(true);
    const [usdtBalance, setusdtBalance] = useState(null);
    const [isDisable, setisDisable] = useState(false);
    const [isCardDetails, setisCardDetails] = useState(false);
    const [secLoading, setsecLoading] = useState(true);

    const authUser = useAuthUser();
    const Navigate = useNavigate();
    const [isUser, setIsUser] = useState({});

    const cardStatus = isUser.cryptoCard?.status;
    const isActive = cardStatus === 'active';
    const isApplied = cardStatus === 'applied';
    const hasCardOnFile = Boolean(isUser.cryptoCard?.cardNumber);
    const isDeactivated = cardStatus === 'inactive' && hasCardOnFile;
    const canApply = (!cardStatus || cardStatus === 'inactive') && !hasCardOnFile;

    const displayName = `${isUser.firstName || ''} ${isUser.lastName || ''}`.trim()
        || authUser()?.user?.firstName
        || 'User';

    const cardHolderName = (isUser.cryptoCard?.cardName || displayName).toUpperCase();

    const fetchLinks = async () => {
        try {
            const data = await getLinksApi();
            if (data?.links[0]?.enabled) {
                setsecLoading(false);
            } else {
                Navigate(-1);
            }
        } catch (error) {
            console.error('Error fetching links:', error);
        }
    };

    const getsignUser = async () => {
        setisLoading(true);
        try {
            const formData = new FormData();
            formData.append('id', authUser().user._id);
            const userCoins = await getsignUserApi(formData);
            if (userCoins.success) {
                setIsUser(userCoins.signleUser);
                setisLoading(false);
            } else {
                toast.dismiss();
                toast.error(userCoins.msg);
            }
        } catch (error) {
            toast.dismiss();
            toast.error(error);
        }
    };

    useEffect(() => {
        getsignUser();
        if (authUser().user.role === 'user') {
            getCoins(authUser().user);
            fetchLinks();
            return;
        }
        if (authUser().user.role === 'admin') {
            Navigate('/admin/dashboard');
        }
    }, []);

    const applyCard = async () => {
        try {
            setisDisable(true);
            const body = {
                userId: authUser().user._id,
                type: 'card_request',
                status: 'applied',
            };
            const cardRequest = await applyCreditCardApi(body);
            if (cardRequest.success) {
                toast.dismiss();
                toast.success('Card Applied Successfully');
                setIsUser((prev) => ({
                    ...prev,
                    cryptoCard: { status: 'applied' },
                }));
            } else {
                toast.dismiss();
                toast.error(cardRequest.msg);
            }
        } catch (error) {
            toast.dismiss();
            toast.error(error);
        } finally {
            setisDisable(false);
        }
    };

    const formatCardNumber = (number) => {
        if (!number) return '•••• •••• •••• ••••';
        const stringNumber = number.toString().replace(/\D/g, '');
        if (stringNumber.length !== 16) return 'Invalid Card Number';
        return stringNumber.replace(/(.{4})/g, '$1 ').trim();
    };

    const getDisplayCardNumber = () => {
        if (isActive && isUser.cryptoCard?.cardNumber) {
            const formatted = formatCardNumber(isUser.cryptoCard.cardNumber);
            if (isCardDetails) return formatted;
            const lastFour = isUser.cryptoCard.cardNumber.toString().slice(-4);
            return `**** **** **** ${lastFour}`;
        }
        return '**** **** **** 4242';
    };

    const getCoins = async (data) => {
        const id = data._id;
        try {
            const userCoins = await getCoinsUserApi(id);
            if (userCoins.success) {
                setisLoading(false);
                const usdt = userCoins.getCoin.transactions.filter((transaction) =>
                    transaction.trxName.includes('tether')
                );
                const usdtcomplete = usdt.filter((transaction) =>
                    transaction.status.includes('completed')
                );
                let usdtValueAdded = 0;
                for (let i = 0; i < usdtcomplete.length; i++) {
                    usdtValueAdded += usdtcomplete[i].amount;
                }
                setusdtBalance(usdtValueAdded);
            } else {
                toast.dismiss();
                toast.error(userCoins.msg);
            }
        } catch (error) {
            toast.dismiss();
            toast.error(error);
        }
    };

    const handlePrimaryAction = () => {
        if (canApply) {
            applyCard();
            return;
        }
        if (isActive) {
            setisCardDetails((prev) => !prev);
        }
    };

    const getButtonLabel = () => {
        if (isDeactivated) return 'Card Deactivated';
        if (canApply) return 'Apply Now';
        if (isApplied) return 'Applied';
        if (isActive) return isCardDetails ? 'Hide Details' : 'View Details';
        return 'Apply Now';
    };

    const renderVirtualCard = () => (
        <div className="cc-showcase">
            <div className="cc-showcase-glow" />
            {isActive && (
                <div className="cc-float-chip cc-float-chip--active">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M20 6L9 17l-5-5" />
                    </svg>
                    Card Active
                </div>
            )}
            {isActive && (
                <>
                    <div className="cc-float-chip cc-float-chip--instant">
                        <span>⚡</span> Instant Activation
                    </div>
                    <div className="cc-float-chip cc-float-chip--alert">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                        </svg>
                        Spending Alert
                    </div>
                    <div className="cc-float-chip cc-float-chip--pay">
                        <span style={{ fontSize: '0.65rem', color: '#94a3b8' }}>Apple Pay</span>
                        <div className="cc-pay-logos">
                            <span> Pay</span>
                            <span>G Pay</span>
                        </div>
                    </div>
                </>
            )}
            <div className="cc-virtual-card">
                <div className="cc-virtual-card-top">
                    <img src={UsdtLogo} alt="USDT" className="cc-virtual-card-logo" />
                    <div className="cc-virtual-card-badge">
                        <span>VIRTUAL</span>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M5 12.55a11 11 0 0 1 14.08 0" />
                            <path d="M1.42 9a16 16 0 0 1 21.16 0" />
                            <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
                            <circle cx="12" cy="20" r="1" fill="currentColor" />
                        </svg>
                    </div>
                </div>
                <p className="cc-virtual-card-number">{getDisplayCardNumber()}</p>
                <div className="cc-virtual-card-bottom">
                    <div className="cc-virtual-card-meta">
                        <div className="cc-virtual-card-meta-group">
                            <span className="cc-virtual-card-label">Valid Thru</span>
                            <span className="cc-virtual-card-value">
                                {isActive && isCardDetails && isUser.cryptoCard?.Exp
                                    ? isUser.cryptoCard.Exp
                                    : '**/**'}
                            </span>
                        </div>
                        <div className="cc-virtual-card-meta-group">
                            <span className="cc-virtual-card-label">Cardholder</span>
                            <span className="cc-virtual-card-value">{cardHolderName}</span>
                        </div>
                    </div>
                    <img src={VisaLogo} alt="Visa" className="cc-virtual-card-visa" />
                </div>
            </div>
            <div className="cc-pedestal" />
        </div>
    );

    if (isLoading || secLoading) {
        return (
            <div className="cc-page cc-skeleton">
                <div className="cc-page-header">
                    <div className="cc-skeleton-block" style={{ width: 220, height: 36 }} />
                    <div className="cc-skeleton-block" style={{ width: 160, height: 20 }} />
                </div>
                <div className="cc-hero">
                    <div>
                        <div className="cc-skeleton-block" style={{ width: '90%', height: 48, marginBottom: 16 }} />
                        <div className="cc-skeleton-block" style={{ width: '60%', height: 28, marginBottom: 24 }} />
                        <div className="cc-skeleton-block" style={{ width: '80%', height: 120, marginBottom: 24 }} />
                        <div className="cc-skeleton-block" style={{ width: 160, height: 44, borderRadius: 999 }} />
                    </div>
                    <div className="cc-skeleton-block" style={{ width: '100%', height: 380, borderRadius: 18 }} />
                </div>
            </div>
        );
    }

    return (
        <div className="cc-page">
            <header className="cc-page-header">
               
                <nav className="cc-breadcrumb" aria-label="Breadcrumb">
                    <Link to="/dashboard">Dashboard</Link>
                    <span>›</span>
                    <span>Crypto Card</span>
                </nav>
            </header>

            <section className="cc-hero">
                <div className="cc-hero-left">
                    <h2 className="cc-hero-headline">The Ultimate Crypto-Powered Card</h2>
                    <p className="cc-hero-tagline">Active. Global. Instant.</p>
                    <ul className="cc-feature-list">
                        {HERO_FEATURES.map((feature) => (
                            <li key={feature}>
                                <CheckIcon />
                                {feature}
                            </li>
                        ))}
                    </ul>
                    <button
                        type="button"
                        className={`cc-cta-btn ${isApplied ? 'cc-cta-btn--applied' : ''} ${isDeactivated ? 'cc-cta-btn--deactivated' : ''}`}
                        disabled={isApplied || isDeactivated || isDisable}
                        onClick={handlePrimaryAction}
                    >
                        {!isApplied && canApply && (
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                            </svg>
                        )}
                        {getButtonLabel()}
                    </button>
                </div>
                {renderVirtualCard()}
            </section>

            <section className="cc-features-grid">
                {BOTTOM_FEATURES.map(({ title, desc, tone, icon }) => (
                    <article key={title} className="cc-feature-card">
                        <div className={`cc-feature-card-icon cc-feature-card-icon--${tone}`}>
                            {icon}
                        </div>
                        <div>
                            <h3 className="cc-feature-card-title">{title}</h3>
                            <p className="cc-feature-card-desc">{desc}</p>
                        </div>
                    </article>
                ))}
            </section>

            {isActive && isCardDetails && (
                <section className="cc-details-panel">
                    <h3>Card Details</h3>
                    {usdtBalance !== null && (
                        <div className="cc-details-balance">
                            <img src={UsdtLogo} alt="" width={22} height={22} style={{ borderRadius: '50%' }} />
                            {Number(usdtBalance).toLocaleString()} USDT
                        </div>
                    )}
                    <div className="cc-details-grid">
                        <div className="cc-detail-item">
                            <span className="cc-detail-label">Card Number</span>
                            <span className="cc-detail-value">
                                {formatCardNumber(isUser.cryptoCard?.cardNumber)}
                            </span>
                        </div>
                        <div className="cc-detail-item">
                            <span className="cc-detail-label">Cardholder Name</span>
                            <span className="cc-detail-value">{isUser.cryptoCard?.cardName || cardHolderName}</span>
                        </div>
                        <div className="cc-detail-item">
                            <span className="cc-detail-label">Expiry Date</span>
                            <span className="cc-detail-value">{isUser.cryptoCard?.Exp || '—'}</span>
                        </div>
                        <div className="cc-detail-item">
                            <span className="cc-detail-label">CVV</span>
                            <span className="cc-detail-value">{isUser.cryptoCard?.cvv || '—'}</span>
                        </div>
                    </div>
                    <div className="cc-terms">
                        <h4>General Terms of Use and Restrictions</h4>
                        <p>
                            Use of our crypto-based credit card services is subject to applicable laws and our internal policies.
                            By using our services, you agree not to engage in fraudulent, illegal, or prohibited activities,
                            including but not limited to money laundering, terrorism financing, or unauthorized transactions.
                            Users must be at least 18 years old and comply with all identity verification requirements.
                            We reserve the right to modify or restrict access to our services at our sole discretion.
                        </p>
                    </div>
                </section>
            )}
        </div>
    );
};

export default CryptoCard;

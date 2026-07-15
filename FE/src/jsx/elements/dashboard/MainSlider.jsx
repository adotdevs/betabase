import React, { useEffect, useState } from 'react';
import { Swiper, SwiperSlide } from 'swiper/react';
import 'swiper/css';
import axios from 'axios';
import SwiperLineChart from './SwiperLineChart';
import { useAuthUser } from 'react-auth-kit';
import { getsignUserApi } from '../../../Api/Service';
import { toast } from 'react-toastify';
import styles from './MainSlider.module.css';

const COIN_META = {
    bitcoin: { name: 'Bitcoin', chartcolor: 'rgba(247, 215, 168, 1)' },
    ethereum: { name: 'Ethereum', chartcolor: 'rgba(148, 150, 176, 1)' },
    binancecoin: { name: 'BNB', chartcolor: 'rgba(247, 215, 168, 1)' },
    solana: { name: 'Solana', chartcolor: 'rgba(247, 215, 168, 1)' },
};

const COIN_ORDER = ['bitcoin', 'ethereum', 'binancecoin', 'solana'];

const COIN_LOGO_FALLBACK = {
    bitcoin: 'https://assets.coingecko.com/coins/images/1/small/bitcoin.png',
    ethereum: 'https://assets.coingecko.com/coins/images/279/small/ethereum.png',
    binancecoin: 'https://assets.coingecko.com/coins/images/825/small/bnb-icon2_2x.png',
    solana: 'https://assets.coingecko.com/coins/images/4128/small/solana.png',
};

const buildInitialSlides = () =>
    COIN_ORDER.map((key) => ({
        key,
        name: COIN_META[key].name,
        chartcolor: COIN_META[key].chartcolor,
        price: 0,
        logo: COIN_LOGO_FALLBACK[key],
    }));

const MainSlider = () => {
    const [isUser, setIsUser] = useState({});
    const authUser = useAuthUser();
    const [slides, setSlides] = useState(buildInitialSlides);

    const getsignUser = async () => {
        try {
            const formData = new FormData();
            formData.append('id', authUser().user._id);
            const userCoins = await getsignUserApi(formData);

            if (userCoins.success) {
                setIsUser(userCoins.signleUser);
                return;
            }

            toast.dismiss();
            toast.error(userCoins.msg);
        } catch (error) {
            toast.dismiss();
            toast.error(error);
        }
    };

    useEffect(() => {
        getsignUser();

        const fetchCryptoPrices = async () => {
            try {
                const response = await axios.get('https://api.coingecko.com/api/v3/coins/markets', {
                    params: {
                        vs_currency: 'usd',
                        ids: COIN_ORDER.join(','),
                        order: 'market_cap_desc',
                        per_page: COIN_ORDER.length,
                        page: 1,
                        sparkline: false,
                    },
                });

                const markets = Array.isArray(response.data) ? response.data : [];
                setSlides(
                    COIN_ORDER.map((key) => {
                        const market = markets.find((coin) => coin.id === key);
                        return {
                            key,
                            name: COIN_META[key].name,
                            chartcolor: COIN_META[key].chartcolor,
                            price: market?.current_price ?? 0,
                            logo: market?.image || COIN_LOGO_FALLBACK[key],
                        };
                    })
                );
            } catch (error) {
                console.error('Error fetching crypto prices:', error);
            }
        };

        fetchCryptoPrices();
        const interval = setInterval(fetchCryptoPrices, 60000);
        return () => clearInterval(interval);
    }, []);

    const formatDisplayPrice = (amount, user, eurConversionRate = 0.92) => {
        const raw = Number(amount) || 0;
        const isEur = user?.currency === 'EUR';
        const converted = isEur ? raw * eurConversionRate : raw;

        if (converted >= 10000) {
            return {
                symbol: isEur ? '€' : '$',
                value: Math.round(converted).toLocaleString(undefined, { maximumFractionDigits: 0 }),
            };
        }

        return {
            symbol: isEur ? '€' : '$',
            value: converted.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
            }),
        };
    };

    return (
        <Swiper
            className="mySwiper-counter position-relative overflow-hidden"
            slidesPerView={4}
            speed={1500}
            spaceBetween={40}
            parallax={true}
            loop={false}
            autoplay={{
                delay: 5000,
            }}
            breakpoints={{
                300: { slidesPerView: 1, spaceBetween: 30 },
                480: { slidesPerView: 2, spaceBetween: 30 },
                768: { slidesPerView: 3, spaceBetween: 30 },
                991: { slidesPerView: 3, spaceBetween: 30 },
                1200: { slidesPerView: 4, spaceBetween: 30 },
            }}
        >
            {slides.map((coin) => {
                const convertedAmount = formatDisplayPrice(coin.price, isUser);

                return (
                    <SwiperSlide key={coin.key}>
                        <div className={`card card-box bg- card-primary ${styles.slideCard}`}>
                            <div className={`card-header border-0 pb-0 ${styles.header}`}>
                                <div className={`chart-num ${styles.price}`}>
                                    <h2 className={styles.priceAmount}>
                                        {convertedAmount.symbol}
                                        {convertedAmount.value}
                                    </h2>
                                </div>
                                <div className={styles.iconWrap}>
                                    <span className={styles.iconRing} aria-hidden="true" />
                                    <img
                                        className={styles.iconLogo}
                                        src={coin.logo}
                                        alt={coin.name}
                                        loading="lazy"
                                    />
                                </div>
                            </div>
                            <div className="card-body p-0">
                                <div id="widgetChart1" className="chart-primary">
                                    <SwiperLineChart chartcolor={coin.chartcolor} />
                                </div>
                            </div>
                        </div>
                    </SwiperSlide>
                );
            })}
        </Swiper>
    );
};

export default MainSlider;

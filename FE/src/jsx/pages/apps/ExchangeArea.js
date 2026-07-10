import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import MoonPay from "../../../assets/images/logos/3.png";
import CoinBase from "../../../assets/images/logos/coinbase.svg";
import Bitpanda from "../../../assets/images/logos/bitpanda-fcb-acm-nfl-logos.gif";
import Binance from "../../../assets/images/logos/binance.png";
import Crypto from "../../../assets/images/logos/crypto-com-vector-logo.png";
import Kraken from "../../../assets/images/logos/kraken-logo@logotyp.us.svg";
import Kucoin from "../../../assets/images/logos/kucoin.svg";
import Paybis from "../../../assets/images/logos/5.png";
import coinspot from "../../../assets/images/logos/6.png";
import bybit from "../../../assets/images/logos/8.png";
import gateio from "../../../assets/images/logos/gateio.png";
import Mercury from "../../../assets/images/logos/mercuryo.png";
import bitvao from "../../../assets/images/logos/4.png";
import Ramp from "../../../assets/images/logos/7.png";
import safello from "../../../assets/images/logos/9.png";
import bitpay from "../../../assets/logo/bitpay.svg";
import transak from "../../../assets/logo/transak-logo.svg";
import bit2me from "../../../assets/logo/bit2me-logo-light.svg";
import bitget from "../../../assets/images/logos/10.png";
import bingx from "../../../assets/logo/bingx-logo-0C09A379A0-seeklogo.com.png";
import gemini from "../../../assets/images/logos/11.png";
import valr from "../../../assets/logo/valr.jpg";
import Upbit from "../../../assets/logo/upbit_logo.35a5b2a.svg";
import { getLinksApi } from "../../../Api/Service";
import "./ExchangeArea.css";
import styles from "./ExchangeArea.module.css";

const exchanges = [
  { name: "MoonPay", logo: MoonPay, link: "https://www.moonpay.com" },
  { name: "Coinbase", logo: CoinBase, link: "https://www.coinbase.com" },
  { name: "Bitpanda", logo: Bitpanda, link: "https://www.bitpanda.com" },
  { name: "Binance", logo: Binance, link: "https://www.binance.com" },
  { name: "Mercuryo", logo: Mercury, link: "https://www.mercuryo.io" },
  { name: "Crypto.com", logo: Crypto, link: "https://crypto.com" },
  { name: "Kraken", logo: Kraken, link: "https://www.kraken.com" },
  { name: "Bitvavo", logo: bitvao, link: "https://bitvavo.com" },
  { name: "KuCoin", logo: Kucoin, link: "https://www.kucoin.com" },
  { name: "Paybis", logo: Paybis, link: "https://paybis.com" },
  { name: "CoinSpot", logo: coinspot, link: "https://www.coinspot.com.au" },
  { name: "Bybit", logo: bybit, link: "https://www.bybit.com" },
  { name: "Gate.io", logo: gateio, link: "https://www.gate.io" },
  { name: "Bitget", logo: bitget, link: "https://www.bitget.com" },
  { name: "Ramp", logo: Ramp, link: "https://ramp.network/" },
  { name: "Safello", logo: safello, link: "https://safello.com/" },
  { name: "BitPay", logo: bitpay, link: "https://bitpay.com/" },
  { name: "Transak", logo: transak, link: "https://transak.com/" },
  { name: "Bit2Me", logo: bit2me, link: "https://bit2me.com/", lightLogo: true },
  { name: "BingX", logo: bingx, link: "https://bingx.com/en/" },
  { name: "Gemini", logo: gemini, link: "https://www.gemini.com/" },
  { name: "VALR", logo: valr, link: "https://www.valr.com/" },
  { name: "Upbit", logo: Upbit, link: "https://upbit.com" },
];

const ExchangeArea = () => {
  const [secLoading, setsecLoading] = useState(true);
  const navigate = useNavigate();

  const fetchLinks = async () => {
    try {
      const data = await getLinksApi();
      if (data?.links[4]?.enabled) {
        setsecLoading(false);
      } else {
        navigate(-1);
      }
    } catch (error) {
      console.error("Error fetching links:", error);
    }
  };

  useEffect(() => {
    fetchLinks();
  }, []);

  if (secLoading) {
    return (
      <div className={styles.page}>
        <div className={styles.panel}>
          <div className={styles.skeletonGrid}>
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className={styles.skeletonCard} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Partner Exchanges</h1>
        <p className={styles.subtitle}>
          Choose a trusted platform to buy, sell, or transfer crypto. All logos are
          shown at a consistent size without stretching.
        </p>
      </header>

      <section className={styles.panel}>
        <div className={styles.grid}>
          {exchanges.map((exchange) => (
            <Link
              key={exchange.name}
              to={exchange.link}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.card}
            >
              <div
                className={`${styles.logoWrap} ${
                  exchange.lightLogo ? styles.logoWrapDark : ""
                }`}
              >
                <img
                  src={exchange.logo}
                  alt={`${exchange.name} logo`}
                  loading="lazy"
                />
              </div>
              <div className={styles.footer}>
                <span className={styles.name}>{exchange.name}</span>
                <span className={styles.arrow} aria-hidden="true">
                  ↗
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
};

export default ExchangeArea;

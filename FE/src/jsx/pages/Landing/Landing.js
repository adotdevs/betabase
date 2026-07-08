import React, { useEffect } from 'react';
import styled from 'styled-components';
import { colorWhite, landingLightTextColor, landingBackground } from './BasicLandingElements';
import Header from './components/Header';
import Features from './components/Features';
import Security from './components/Security';
import Referral from './components/Referral';
import MorePossibilities from './components/MorePossibilities';
import MultiToken from './components/MultiToken';
import Purchase from './components/Purchase';
import Footer from './components/Footer';
import Testimonials from './components/Testimonials';
import Menu from './components/Menu';
import FAQ from './components/FAQ';
import scrollAnimation, { splitText } from './utils/animateOnScroll';
import noiseBg from '../../../../assets/noise_bg.png';

const Landing = () => {
  useEffect(() => {
    splitText();
    window.addEventListener('scroll', scrollAnimation);
    window.addEventListener('resize', splitText);

    return () => {
      window.removeEventListener('scroll', scrollAnimation);
      window.removeEventListener('resize', splitText);
    };
  }, []);

  return (
    <LandingWrap>
      <Menu />
      <Header />
      <Features />
      <Security />
      <Referral />
      <MorePossibilities />
      <MultiToken />
      <Testimonials />
      <FAQ />
      <Purchase />
      <Footer />
    </LandingWrap>
  );
};

export default Landing;

// region STYLES

const LandingWrap = styled.div`
  font-family: 'Poppins', sans-serif;
  width: 100%;
  background: ${landingBackground};
  background-image: url(${noiseBg});
  position: relative;
  z-index: 0;
  overflow-x: hidden;
  min-height: 100vh; 

  h1 {
    color: ${colorWhite};
    font-weight: 700;
    font-size: 36px;
    line-height: 40px;
  };
  
  h2 {
    color: ${colorWhite};
    font-weight: 700;
    font-size: 36px;
    line-height: 44px;
  };

  h3 {
    font-weight: 600;
    font-size: 18px;
    line-height: 27px;
    color: ${landingLightTextColor};
  };

  p {
    color: ${landingLightTextColor};
  };

  .animate-on-scroll {
    opacity: 0;

    &.scrolled {
      opacity: 1;

      .line {
        overflow: hidden;
        white-space: nowrap;

        &:last-child {
          animation-delay: 0.1s;
        }
      }

      .word {
        opacity: 0;
        animation: slide-in 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94);
        animation-fill-mode: forwards;
      }
    }
  }

  @keyframes slide-in {
    from {
      transform: translateY(40px);
      opacity: 0;
    }

    to {
      transform: translateY(0);
      opacity: 1;
    }
  }
  
  @media screen and (min-width: 576px) {
    
    h1 {
      font-size: 60px;
      line-height: 70px;
    }
  }
`;

// endregion


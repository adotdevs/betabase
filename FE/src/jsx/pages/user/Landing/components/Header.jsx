import React, { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { Col, Row } from 'react-bootstrap';
import styled from 'styled-components';
import { colorWhite, landingDarkTextColor } from '../BasicLandingElements';
import {
  LandingButton,
  LandingButtonGradient,
  LandingContainer,
} from '../BasicLandingElements';
import headerBg from '../../../../../assets/header_bg.png';
import googlePlayLogo from '../../../../../assets/StoreGoogle-Play-TypeLight-240x80-1 (1).png';
import appStoreLogo from '../../../../../assets/StoreApp-Store-TypeLight-240x80-1 (2).png';
import apkLogo from '../../../../../assets/Solid-logo-Light-APK-240x80- (1).png';
import webBrowserLogo from '../../../../../assets/Solid-logo-Light-web-browser-262x80- (3).png';

const WINDOWS_APP_URL = '/downloads/Betabase-Setup.exe';

export const SECTION_NAV_LINKS = [
  { label: 'Features', id: 'features' },
  { label: 'Security', id: 'security' },
  { label: 'Referral', id: 'referral' },
  { label: 'Stake', id: 'stake' },
  { label: 'Multi-Token', id: 'multi-token' },
  { label: 'Reviews', id: 'reviews' },
  { label: 'FAQ', id: 'faq' },
];

export const scrollToSection = (id) => {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

export const SectionNavLinks = ({ onNavigate, vertical = false }) => (
  <SectionNavList vertical={vertical}>
    {SECTION_NAV_LINKS.map(({ label, id }) => (
      <SectionNavLink
        key={id}
        type="button"
        onClick={() => {
          scrollToSection(id);
          if (onNavigate) onNavigate();
        }}
      >
        {label}
      </SectionNavLink>
    ))}
  </SectionNavList>
);

export const SectionNavMenu = () => {
  const [open, setOpen] = useState(false);

  const closeMenu = useCallback(() => setOpen(false), []);

  return (
    <>
      <SectionNavToggle
        type="button"
        aria-label={open ? 'Close section menu' : 'Open section menu'}
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span />
        <span />
        <span />
      </SectionNavToggle>
      {open && (
        <>
          <SectionNavBackdrop onClick={closeMenu} />
          <SectionNavDrawer>
            <SectionNavLinks onNavigate={closeMenu} vertical />
          </SectionNavDrawer>
        </>
      )}
    </>
  );
};

const Header = () => (
  <LandingHeader>
    <LandingContainer>
      <Row>
        <Col md={12}> 
          <LandingHeaderTitle className="animate-on-scroll scrolled">
          A trusted platform to streamline your crypto journey
          </LandingHeaderTitle>
          <LandingHeaderSubhead className="animate-on-scroll scrolled">
            Offering secure wallets, lightning-fast exchanges, and real-time market insights
            <br />
            we empower you to explore the crypto world with confidence and ease.
          </LandingHeaderSubhead>
          <LandingHeaderButtonWrap>
            <LandingButtonGradient as={Link} to="/auth/signup">
              Start now
            </LandingButtonGradient>
            <LandingButton as={Link} to="/auth/login">
              Sign In
            </LandingButton>
            <LandingButton
              as="a"
              href={WINDOWS_APP_URL}
              download
              target="_blank"
              rel="noopener noreferrer"
            >
              Download for Windows
            </LandingButton>
          </LandingHeaderButtonWrap>
          <AppStoreLogosWrap>
            <AppStoreLogoLink as="a" href={WINDOWS_APP_URL} download target="_blank" rel="noopener noreferrer">
              <AppStoreLogo src={webBrowserLogo} alt="Download Betabase for Windows" />
            </AppStoreLogoLink>
            <AppStoreLogoLink as={Link} to="/auth/login">
              <AppStoreLogo src={googlePlayLogo} alt="Get it on Google Play" />
            </AppStoreLogoLink>
            <AppStoreLogoLink as={Link} to="/auth/login">
              <AppStoreLogo src={appStoreLogo} alt="Download on the App Store" />
            </AppStoreLogoLink>
            <AppStoreLogoLink as={Link} to="/auth/login">
              <AppStoreLogo src={apkLogo} alt="APK File" />
            </AppStoreLogoLink>
          </AppStoreLogosWrap>
        </Col>
      </Row>
    </LandingContainer>
  </LandingHeader>
);

export default Header;

// region STYLES

const SectionNavList = styled.nav`
  display: ${({ vertical }) => (vertical ? 'flex' : 'none')};
  flex-direction: ${({ vertical }) => (vertical ? 'column' : 'row')};
  align-items: ${({ vertical }) => (vertical ? 'stretch' : 'center')};
  gap: ${({ vertical }) => (vertical ? '4px' : '4px')};
  flex-wrap: nowrap;

  @media screen and (min-width: 1100px) {
    display: flex;
    flex-direction: row;
    flex-wrap: wrap;
    justify-content: center;
    gap: 6px;
  }
`;

const SectionNavLink = styled.button`
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.82);
  font-family: 'Poppins', sans-serif;
  font-size: 13px;
  font-weight: 500;
  line-height: 1.2;
  padding: 8px 12px;
  border-radius: 100px;
  cursor: pointer;
  white-space: nowrap;
  transition: color 0.2s ease, background 0.2s ease;

  &:hover,
  &:focus-visible {
    color: ${colorWhite};
    background: rgba(255, 255, 255, 0.1);
    outline: none;
  }

  @media screen and (min-width: 1100px) {
    font-size: 13px;
    padding: 7px 11px;
  }

  @media screen and (min-width: 1280px) {
    font-size: 14px;
    padding: 8px 14px;
  }
`;

const SectionNavToggle = styled.button`
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 5px;
  width: 40px;
  height: 40px;
  padding: 0;
  border: 1px solid rgba(255, 255, 255, 0.35);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.08);
  cursor: pointer;
  flex-shrink: 0;

  span {
    display: block;
    width: 18px;
    height: 2px;
    background: ${colorWhite};
    border-radius: 2px;
    transition: transform 0.2s ease;
  }

  @media screen and (min-width: 1100px) {
    display: none;
  }
`;

const SectionNavBackdrop = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  z-index: 8;

  @media screen and (min-width: 1100px) {
    display: none;
  }
`;

const SectionNavDrawer = styled.div`
  position: fixed;
  top: 72px;
  right: 16px;
  left: 16px;
  z-index: 9;
  padding: 12px;
  border-radius: 16px;
  background: rgba(22, 22, 28, 0.96);
  border: 1px solid rgba(255, 255, 255, 0.12);
  backdrop-filter: blur(12px);
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.35);

  @media screen and (min-width: 576px) {
    left: auto;
    width: 280px;
  }

  @media screen and (min-width: 1100px) {
    display: none;
  }
`;

const LandingHeader = styled.div`
  padding-top: 100px;
  text-align: center;
  background-repeat: no-repeat;
  background-image: url(${headerBg});
  background-position: top right;
  padding-bottom: 96px;
  
  @media screen and (min-width: 576px) {
    padding-bottom: 152px;
  }
`;

const LandingHeaderTitle = styled.h1`
  text-align: center;
  max-width: 100%;
  width: 100%;
  color: ${colorWhite};
  margin: 0 auto 24px;
  box-sizing: border-box;
  padding: 0 0px;
  word-wrap: break-word;
  overflow-wrap: break-word;
  word-break: break-word;
  box-sizing: border-box;
  
  @media screen and (min-width: 576px) {
    max-width: 680px;
    margin: 0 auto 32px;
    padding: 0 0px;
  }
  
  @media screen and (min-width: 768px) {
    padding: 0 0px;
  }
`;

const LandingHeaderSubhead = styled.p`
  color: ${landingDarkTextColor};
  font-size: 16px;
  line-height: 24px;
  font-weight: 400;
  margin-bottom: 24px;
  padding: 0 16px;
  word-wrap: break-word;
  overflow-wrap: break-word;
  word-break: break-word;
  max-width: 100%;
  width: 100%;
  box-sizing: border-box;
  
  @media screen and (min-width: 576px) {
    font-size: 20px;
    line-height: 30px;
    margin-bottom: 48px;
    padding: 0 20px;
    max-width: 700px;
    margin-left: auto;
    margin-right: auto;
  }
  
  @media screen and (min-width: 768px) {
    font-size: 24px;
    line-height: 36px;
    padding: 0 24px;
  }
`;

const LandingHeaderButtonWrap = styled.div`
  display: flex;
  justify-content: center;
  flex-direction: column;
  margin-bottom: 48px;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 0 16px;
  box-sizing: border-box;
  flex-wrap: wrap;

  a {
    width: auto;
    min-width: 140px;
    max-width: 100%;
    padding-left: 18px;
    padding-right: 18px;
  }
  
  @media screen and (min-width: 576px) {
    flex-direction: row;
    gap: 16px;
    margin-bottom: 128px;
    padding: 0 20px;
    
    a {
      min-width: 150px;
    }
  }
  
  @media screen and (min-width: 768px) {
    padding: 0 24px;
    gap: 20px;
    
    a {
      min-width: 160px;
    }
  }
`;

const AppStoreLogosWrap = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: center;
  gap: 16px;
  width: 100%;
  padding: 0 16px;
  margin-top: 32px;
  box-sizing: border-box;
  
  @media screen and (min-width: 576px) {
    gap: 20px;
    padding: 0 20px;
    margin-top: 40px;
  }
  
  @media screen and (min-width: 768px) {
    gap: 24px;
    padding: 0 24px;
    margin-top: 48px;
  }
`;

const AppStoreLogoLink = styled(Link)`
  display: inline-block;
  transition: transform 0.2s ease, opacity 0.2s ease;
  
  &:hover {
    transform: translateY(-2px);
    opacity: 0.9;
  }
  
  &:active {
    transform: translateY(0);
  }
`;

const AppStoreLogo = styled.img`
  height: 40px;
  width: auto;
  max-width: 100%;
  object-fit: contain;
  
  @media screen and (min-width: 576px) {
    height: 45px;
  }
  
  @media screen and (min-width: 768px) {
    height: 50px;
  }
  
  @media screen and (min-width: 992px) {
    height: 55px;
  }
`;

// endregion

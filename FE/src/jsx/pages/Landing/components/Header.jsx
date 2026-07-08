import React from 'react';
import { Link } from 'react-router-dom';
import { Col, Row } from 'react-bootstrap';
import styled from 'styled-components';
import { colorWhite, landingDarkTextColor } from '../BasicLandingElements';
import {
  LandingButton,
  LandingButtonGradient,
  LandingContainer,
} from '../BasicLandingElements';
import LogoNew from '../../../../../assets/newlogo/logo.png';
import headerBg from '../../../../../assets/header_bg.png';
import heroImage from '../../../../../assets/images/img/home-hero-gradient.jpg';
import googlePlayLogo from '../../../../../assets/StoreGoogle-Play-TypeLight-240x80-1 (1).png';
import appStoreLogo from '../../../../../assets/StoreApp-Store-TypeLight-240x80-1 (2).png';
import apkLogo from '../../../../../assets/Solid-logo-Light-APK-240x80- (1).png';
import webBrowserLogo from '../../../../../assets/Solid-logo-Light-web-browser-262x80- (3).png';

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
          </LandingHeaderButtonWrap>
          <AppStoreLogosWrap>
            <AppStoreLogoLink as={Link} to="/auth/login">
              <AppStoreLogo src={googlePlayLogo} alt="Get it on Google Play" />
            </AppStoreLogoLink>
            <AppStoreLogoLink as={Link} to="/auth/login">
              <AppStoreLogo src={appStoreLogo} alt="Download on the App Store" />
            </AppStoreLogoLink>
            <AppStoreLogoLink as={Link} to="/auth/login">
              <AppStoreLogo src={webBrowserLogo} alt="Web Browser" />
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

const LandingHeaderLogo = styled.img`
  width: 92px;
  margin-bottom: 8px;
  
  @media screen and (min-width: 576px) {
    width: 162px;
    margin-bottom: 12px;
  }
  
  @media screen and (min-width: 992px) {
    width: 186px;
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

  a {
    width: 140px;
    max-width: 100%;
  }
  
  @media screen and (min-width: 576px) {
    flex-direction: row;
    gap: 20px;
    margin-bottom: 128px;
    padding: 0 20px;
    
    a {
      width: 150px;
    }
  }
  
  @media screen and (min-width: 768px) {
    padding: 0 24px;
    
    a {
      width: 160px;
    }
  }
`;

const LandingHeaderImage = styled.img`
  max-width: 100%;
  height: auto;
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


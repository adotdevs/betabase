import React from 'react';
import styled from 'styled-components';
import { LandingContainer } from '../BasicLandingElements';
import { landingGreenColor } from '../BasicLandingElements';
import LogoNew from '../../../../../assets/newlogo/logo.png';
import EULogo from '../../../../../assets/f1.png';
import AustraliaLogo from '../../../../../assets/f2.png';
import ESMA from '../../../../../assets/f3.png';
import FCA from '../../../../../assets/f4.png';

const Footer = () => (
  <LandingFooter>
    <LandingContainer>
      <FooterInfo>
        <FooterInfoBlock style={{ flexDirection: 'column', alignItems: 'flex-start', width: "30%" }}>
          <div><img src={LogoNew} alt="betabase Logo" style={{ height: '80px' }} /> </div>
          <FooterInfoBlock style={{ paddingLeft: "10px", justifyContent: "start" }}>
            <p><a href="mailto:support@betabase.io">support@betabase.io</a></p>
          </FooterInfoBlock>
        </FooterInfoBlock>

        <FooterInfoBlock style={{ justifyContent: 'left', width: "70%" }}>
          <PartnersLogos>
            <div className="logoItem"><img src={EULogo} alt="EU" /></div>
            <div className="logoItem"><img src={AustraliaLogo} alt="Australian Government - The Treasury" /></div>
            <div className="logoItem"><img src={ESMA} alt="ESMA" /></div>
            <div className="logoItem"><img src={FCA} alt="FCA" /></div>
          </PartnersLogos>
        </FooterInfoBlock>

      </FooterInfo>
      <CaptionBlock>
        <p>Copyright ©2025 Betabase. All rights reserved.</p>
      </CaptionBlock>
    </LandingContainer>
  </LandingFooter>
);

export default Footer;

// region STYLES

const LandingFooter = styled.footer`
  border-top: 1px solid #454554;
  padding: 48px 0 24px;

  @media screen and (min-width: 576px) {
    padding: 68px 0 32px;
  }
`;

const FooterInfo = styled.div`
  width: 100%;
  margin-bottom: 36px;
  
  @media screen and (min-width: 576px) {
    display: flex;
    margin-bottom: 56px;
  }
     @media screen and (max-width: 768px) {
  flex-direction: column;
  }
`;

const FooterInfoBlock = styled.div`
  width: 100%;
  display: flex;
  align-items: center;
  font-weight: 400;
  font-size: 14px;
  line-height: 22px;
  color: #DDDDDD;
  
  a {
    color: #DDDDDD;
    
    &:hover {
      color: ${landingGreenColor};
    }
  }

  &:not(:last-of-type) {
    margin-bottom: 28px;
  }

 
  @media screen and (max-width: 768px) {
  width: 100% !important;
  border:none !important;
  padding:0 !important;
  }
  @media screen and (min-width: 576px) {
    border-right: 1px solid #454554;
    padding-right: 64px;
    padding-left: 64px;

    &:first-of-type {
      padding-left: 0;
    }

    &:last-of-type {
      border-right: none;
      justify-content: flex-end;
      padding-right: 0;
    }

    &:not(:last-of-type) {
      margin-bottom: 0;
    }
  }
`;

const PartnersLogos = styled.div`
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  justify-content: center;
  gap: 24px;
width: 100%;
  .logoItem {
    flex: 0 0 25%;
    display: flex;
    justify-content: center;
    padding: 8px 0;

    img { 
      max-width: 100%;
      opacity: 0.9;
      transition: opacity 0.2s ease, transform 0.2s ease;
    }

    img:hover {
      opacity: 1;
      transform: scale(1.03);
    }
  }

  @media screen and (max-width: 768px) {
  flex-wrap: wrap;
  
  .logoItem {
  flex: 0 0 50%;
  width: 100% !important;}
   
`;

const CaptionBlock = styled.div`
  opacity: 0.6;
  font-weight: 400;
  font-size: 13px;
  line-height: 20px;
  width: 100%;
  text-align: center;
  
  & > p:not(:last-of-type) {
    margin-bottom: 16px;
  }
  
  @media screen and (min-width: 576px) {
    display: flex;
    justify-content: space-between;

    & > p:not(:last-of-type) {
      margin-bottom: 0;
    }
  }
`;

// endregion


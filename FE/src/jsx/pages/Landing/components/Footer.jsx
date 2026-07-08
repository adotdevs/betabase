import React from 'react';
import styled from 'styled-components';
import { LandingContainer } from '../BasicLandingElements';
import { landingGreenColor } from '../BasicLandingElements';
import LogoNew from '../../../../../assets/newlogo/logo.png';

const Footer = () => (
  <LandingFooter>
    <LandingContainer>
      <FooterInfo>
        <FooterInfoBlock>
          <img src={LogoNew} alt="betabase Logo" style={{ height: '80px' }} />
        </FooterInfoBlock>
        <FooterInfoBlock>
          <p className="animate-on-scroll">
            Place de La Defense, Puteaux, 92400<br />
            France
          </p>
        </FooterInfoBlock>
        <FooterInfoBlock>
          <p><a href="mailto:support@betabase.io">support@betabase.io</a></p>
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


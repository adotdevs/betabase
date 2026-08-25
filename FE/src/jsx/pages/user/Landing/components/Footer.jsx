import React from 'react';
import { Link } from 'react-router-dom';
import styled from 'styled-components';
import { LandingContainer } from '../BasicLandingElements';
import { landingGreenColor } from '../BasicLandingElements';
import LogoNew from '../../../../../assets/newlogo/logo.png';
import EULogo from '../../../../../assets/f1.png';
import AustraliaLogo from '../../../../../assets/f2.png';
import ESMA from '../../../../../assets/f3.png';
import FCA from '../../../../../assets/f4.png';

const FOOTER_GROUPS = [
  {
    title: 'Legal',
    links: [
      { to: '/terms-of-use', label: 'Terms of Use' },
      { to: '/privacy-policy', label: 'Privacy Policy' },
      { to: '/risk-warning', label: 'Risk Warning' },
    ],
  },
  {
    title: 'Programs',
    links: [
      { to: '/affiliate-program-terms', label: 'Affiliate Program' },
      { to: '/referral-program-terms', label: 'Referral Program' },
      { to: '/law-enforcement', label: 'Law Enforcement' },
    ],
  },
  {
    title: 'Support',
    links: [
      { to: '/help/', label: 'Help Center' },
      { to: '/tax-assessment-questionnaire', label: 'Tax Assessment' },
    ],
  },
];

const Footer = () => (
  <LandingFooter>
    <LandingContainer>
      <FooterNav>
        {FOOTER_GROUPS.map((group) => (
          <FooterGroup key={group.title}>
            <FooterGroupTitle>{group.title}</FooterGroupTitle>
            <FooterLinkList>
              {group.links.map((link) => (
                <Link key={link.to} to={link.to}>
                  {link.label}
                </Link>
              ))}
            </FooterLinkList>
          </FooterGroup>
        ))}
      </FooterNav>

      <FooterInfo>
        <FooterInfoBlock style={{ flexDirection: 'column', alignItems: 'flex-start', width: "30%" }}>
          <div><img src={LogoNew} alt="betabase Logo" style={{ height: '80px' }} /> </div>
          <FooterInfoBlock style={{ paddingLeft: "10px", justifyContent: "start" }}>
            <p><a href="mailto:support@betabase.pro">support@betabase.pro</a></p>
          </FooterInfoBlock>
          <SocialLinks>
            <a
              href="https://www.facebook.com/profile.php?id=61593554224020"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Follow Betabase on Facebook"
              title="Facebook"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M14.5 8.5H16V6h-1.6C12.1 6 11 7.3 11 9.2V11H9v2.5h2V20h3v-6.5h2.1l.4-2.5H14V9.5c0-.6.3-1 1-1Z" />
              </svg>
            </a>
          </SocialLinks>
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

const FooterNav = styled.nav`
  display: grid;
  grid-template-columns: 1fr;
  gap: 28px;
  width: 100%;
  align-self: stretch;
  margin-bottom: 32px;
  padding-bottom: 28px;
  border-bottom: 1px solid #454554;

  @media screen and (min-width: 576px) {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 24px 40px;
    margin-bottom: 40px;
  }
`;

const FooterGroup = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
  min-width: 0;
`;

const FooterGroupTitle = styled.span`
  display: block;
  margin: 0;
  color: #ffffff !important;
  font-size: 11px !important;
  font-weight: 700 !important;
  line-height: 1 !important;
  letter-spacing: 0.14em;
  text-transform: uppercase;
`;

const FooterLinkList = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;

  a {
    color: #c7cccf;
    font-size: 14px;
    font-weight: 400;
    line-height: 1.35;
    text-decoration: none;
    transition: color 0.2s ease;

    &:hover {
      color: ${landingGreenColor};
    }
  }
`;

const SocialLinks = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 14px;
  padding-left: 10px;

  a {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    border: 1px solid #5a5a6a;
    background: rgba(255, 255, 255, 0.04);
    color: #dddddd;
    transition: color 0.2s ease, border-color 0.2s ease, background 0.2s ease, transform 0.2s ease;

    svg {
      width: 18px;
      height: 18px;
      fill: currentColor;
    }

    &:hover {
      color: #ffffff;
      border-color: ${landingGreenColor};
      background: ${landingGreenColor};
      transform: translateY(-1px);
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

  @media screen and (min-width: 576px) {
    text-align: right;
  }

  a {
    color: #DDDDDD;
    text-decoration: none;

    &:hover {
      color: ${landingGreenColor};
    }
  }
  
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


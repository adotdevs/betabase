import React from 'react';
import { Link } from 'react-router-dom';
import styled from 'styled-components';
import PsPhone from '../../../../../assets/psphone.png';
import {
  LandingButtonGradient,
  LandingSection,
  LandingContainer,
} from '../BasicLandingElements';
import Refer from '../../../../../assets/refer.jpg';

const Security = () => (
  <LandingSection>
    <SecurityContainer>
      <SecurityContentWrapper>
        <SecurityContent>
          <SecurityTitle className="animate-on-scroll">Uncompromising Security</SecurityTitle>
          <SecuritySubtitle className="animate-on-scroll">Backup with ultra-high security</SecuritySubtitle>
          <SecurityDescription className="animate-on-scroll">
            We prioritizes your safety with advanced encryption,
            multi-layer authentication, and cold storage solutions.
            Rest assured, your digital assets are protected.
          </SecurityDescription>
          <ButtonWrapper>
            <LandingButtonGradient as={Link} to="/auth/signup">
              Start now
            </LandingButtonGradient>
          </ButtonWrapper>
        </SecurityContent>
        <SecurityImageWrapper>
          <SecurityImage src={PsPhone} alt="Security" />
        </SecurityImageWrapper>
      </SecurityContentWrapper>
    </SecurityContainer>
  </LandingSection>
);

export default Security;

// region STYLES

const SecurityContainer = styled(LandingContainer)`
  display: block !important;
  flex-direction: row !important;
  align-items: stretch !important;
`;

const SecurityContentWrapper = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 32px;
  width: 100%;
  
  @media screen and (min-width: 768px) {
    flex-direction: row;
    align-items: center;
    gap: 48px;
  }
`;

const SecurityContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: 24px;
  flex: 1;
  padding: 20px 16px;
  width: 100%;
  
  @media screen and (min-width: 768px) {
    padding: 40px 24px 40px 0;
    max-width: 50%;
    width: auto;
  }
  
  @media screen and (min-width: 992px) {
    padding: 40px 32px 40px 0;
  }
`;

const SecurityTitle = styled.h2`
  color: #ffffff;
  font-size: 28px;
  font-weight: 700;
  line-height: 36px;
  margin: 0;
  word-wrap: break-word;
  overflow-wrap: break-word;
  word-break: break-word;
  max-width: 100%;
  
  @media screen and (min-width: 576px) {
    font-size: 36px;
    line-height: 44px;
  }
  
  @media screen and (min-width: 992px) {
    font-size: 42px;
    line-height: 50px;
  }
`;

const SecuritySubtitle = styled.h3`
  color: #DDDDDD;
  font-size: 20px;
  font-weight: 600;
  line-height: 28px;
  margin: 0;
  
  @media screen and (min-width: 576px) {
    font-size: 24px;
    line-height: 32px;
  }
`;

const SecurityDescription = styled.p`
  color: #DDDDDD;
  font-size: 15px;
  line-height: 23px;
  margin: 0;
  word-wrap: break-word;
  overflow-wrap: break-word;
  word-break: break-word;
  max-width: 100%;
  
  @media screen and (min-width: 576px) {
    font-size: 16px;
    line-height: 24px;
  }
`;

const ButtonWrapper = styled.div`
  margin-top: 8px;
`;

const SecurityImageWrapper = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  flex: 1;
  padding: 20px 16px;
  
  @media screen and (min-width: 768px) {
    padding: 40px 0 40px 24px;
    max-width: 50%;
    width: auto;
  }
  
  @media screen and (min-width: 992px) {
    padding: 40px 0 40px 32px;
  }
`;

const SecurityImage = styled.img`
  width: 100%;
  max-width: 400px;
  height: auto;
  object-fit: contain;
  
  @media screen and (min-width: 768px) {
    max-width: 450px;
  }
  
  @media screen and (min-width: 992px) {
    max-width: 500px;
  }
`;

// endregion


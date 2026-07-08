import React from 'react';
import { Link } from 'react-router-dom';
import styled from 'styled-components';
import {
  LandingButtonGradient,
  LandingSection,
  LandingContainer,
} from '../BasicLandingElements';
import Refer from '../../../../../assets/refer.jpg';

const Referral = () => (
  <LandingSection>
    <ReferralContainer>
      <ReferralContentWrapper>
        <ReferralImageWrapper>
          <ReferralImage src={Refer} alt="Refer a Friend" />
        </ReferralImageWrapper>
        <ReferralContent>
          <ReferralTitle className="animate-on-scroll">Refer a Friend</ReferralTitle>
          <ReferralSubtitle className="animate-on-scroll">Refer Friends and Get 100 USDT Trading Fee Credit.</ReferralSubtitle>
          <ReferralDescription className="animate-on-scroll">
            Invite your friends to join our crypto exchange and both of you get 100 USDT in trading credit. More friends = more rewards. Start sharing!
          </ReferralDescription>
          <ButtonWrapper>
            <LandingButtonGradient as={Link} to="/auth/signup">
              Start now
            </LandingButtonGradient>
          </ButtonWrapper>
        </ReferralContent>
      </ReferralContentWrapper>
    </ReferralContainer>
  </LandingSection>
);

export default Referral;

// region STYLES

const ReferralContainer = styled(LandingContainer)`
  display: block !important;
  flex-direction: row !important;
  align-items: stretch !important;
`;

const ReferralContentWrapper = styled.div`
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

const ReferralContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: 24px;
  flex: 1;
  padding: 20px 16px;
  width: 100%;
  order: 2;
  
  @media screen and (min-width: 768px) {
    padding: 40px 24px 40px 0;
    max-width: 50%;
    width: auto;
    order: 2;
  }
  
  @media screen and (min-width: 992px) {
    padding: 40px 32px 40px 0;
  }
`;

const ReferralTitle = styled.h2`
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

const ReferralSubtitle = styled.h3`
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

const ReferralDescription = styled.p`
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

const ReferralImageWrapper = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  flex: 1;
  padding: 20px 16px;
  order: 1;
  
  @media screen and (min-width: 768px) {
    padding: 40px 0 40px 24px;
    max-width: 50%;
    width: auto;
    order: 1;
  }
  
  @media screen and (min-width: 992px) {
    padding: 40px 0 40px 32px;
  }
`;

const ReferralImage = styled.img`
  width: 100%;
  max-width: 400px;
  height: auto;
  border-radius: 20px;
  object-fit: contain;
  
  @media screen and (min-width: 768px) {
    max-width: 450px;
  }
  
  @media screen and (min-width: 992px) {
    max-width: 500px;
  }
`;

// endregion


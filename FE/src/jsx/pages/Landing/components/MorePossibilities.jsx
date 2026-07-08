import React from 'react';
import styled from 'styled-components';
import MobilesPic from '../../../../../assets/mobiles.png';
import {
  LandingSection,
  LandingContainer,
} from '../BasicLandingElements';

const MorePossibilities = () => (
  <LandingSection>
    <MorePossibilitiesContainer>
      <MorePossibilitiesContentWrapper>
        <MorePossibilitiesImageWrapper>
          <MorePossibilitiesImage 
            src={MobilesPic}
            alt="More possibilities" 
          />
        </MorePossibilitiesImageWrapper>
        <MorePossibilitiesContent>
          <MorePossibilitiesTitle className="animate-on-scroll">More possibilities</MorePossibilitiesTitle>
          <MorePossibilitiesSubtitle className="animate-on-scroll">Stake, swap and trade in one place</MorePossibilitiesSubtitle>
          <MorePossibilitiesDescription className="animate-on-scroll">
            Manage, trade, stake, and grow your crypto portfolio all in one secure and intuitive platform. Explore the future of finance with confidence.
          </MorePossibilitiesDescription>
        </MorePossibilitiesContent>
      </MorePossibilitiesContentWrapper>
    </MorePossibilitiesContainer>
  </LandingSection>
);

export default MorePossibilities;

// region STYLES

const MorePossibilitiesContainer = styled(LandingContainer)`
  display: block !important;
  flex-direction: row !important;
  align-items: stretch !important;
`;

const MorePossibilitiesContentWrapper = styled.div`
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

const MorePossibilitiesContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: 24px;
  flex: 1;
  padding: 20px 16px;
  width: 100%;
  order: 2;
  
  @media screen and (min-width: 768px) {
    padding: 40px 0 40px 24px;
    max-width: 50%;
    width: auto;
    order: 2;
  }
  
  @media screen and (min-width: 992px) {
    padding: 40px 0 40px 32px;
  }
`;

const MorePossibilitiesTitle = styled.h2`
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

const MorePossibilitiesSubtitle = styled.h3`
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

const MorePossibilitiesDescription = styled.p`
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

const MorePossibilitiesImageWrapper = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  flex: 1;
  padding: 20px 16px;
  order: 1;
  
  @media screen and (min-width: 768px) {
    padding: 40px 24px 40px 0;
    max-width: 50%;
    width: auto;
    order: 1;
  }
  
  @media screen and (min-width: 992px) {
    padding: 40px 32px 40px 0;
  }
`;

const MorePossibilitiesImage = styled.img`
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


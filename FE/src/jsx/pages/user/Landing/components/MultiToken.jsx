import React from 'react';
import styled from 'styled-components';
import Coinspic from '../../../../../assets/coins.png';
import {
  LandingSection,
  LandingContainer,
} from '../BasicLandingElements';

const MultiToken = () => (
  <LandingSection>
    <MultiTokenContainer>
      <MultiTokenContentWrapper>
        <MultiTokenContent>
          <MultiTokenTitle className="animate-on-scroll">Multi-Token Support</MultiTokenTitle>
          <MultiTokenSubtitle className="animate-on-scroll">Effortlessly store a wide range of cryptocurrencies</MultiTokenSubtitle>
          <MultiTokenDescription className="animate-on-scroll">
            Whether you're managing Bitcoin, Ethereum,
            or altcoins, we provide seamless compatibility for your diverse digital assets.
          </MultiTokenDescription>
        </MultiTokenContent>
        <MultiTokenImageWrapper>
          <MultiTokenImage 
            src={Coinspic}
            alt="Multi-Token Support" 
          />
        </MultiTokenImageWrapper>
      </MultiTokenContentWrapper>
    </MultiTokenContainer>
  </LandingSection>
);

export default MultiToken;

// region STYLES

const MultiTokenContainer = styled(LandingContainer)`
  display: block !important;
  flex-direction: row !important;
  align-items: stretch !important;
`;

const MultiTokenContentWrapper = styled.div`
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

const MultiTokenContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: 24px;
  flex: 1;
  padding: 20px 16px;
  width: 100%;
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

const MultiTokenTitle = styled.h2`
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

const MultiTokenSubtitle = styled.h3`
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

const MultiTokenDescription = styled.p`
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

const MultiTokenImageWrapper = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  flex: 1;
  padding: 20px 16px;
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

const MultiTokenImage = styled.img`
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


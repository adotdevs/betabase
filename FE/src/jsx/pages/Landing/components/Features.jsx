import React from 'react';
import styled from 'styled-components';
import Ewrb from '../../../../../assets/ewfvrb.png';
import {
  LandingButton,
  LandingSection,
  LandingContainer,
} from '../BasicLandingElements';

const Features = () => (
  <LandingSection>
    <LandingFeatureContainer>
      <FeaturesHeader>
        <LandingFeatureSubtitle className="animate-on-scroll">Main Features</LandingFeatureSubtitle>
        <LandingFeatureMainTitle className="animate-on-scroll">A new generation wallet</LandingFeatureMainTitle>
        <LandingFeatureDescription className="animate-on-scroll">
          Experience the ultimate combination of security, simplicity, and speed for all your crypto needs.
        </LandingFeatureDescription>
      </FeaturesHeader>
      <LandingFeaturesWrap>
        <LandingFeatureWrap>
          <LandingFeatureImage src={Ewrb} alt="User-Friendly Design" />
          <LandingFeatureContent>
            <h3 className="animate-on-scroll">User-Friendly Design</h3>
            <p>Effortlessly manage your crypto with an intuitive interface.</p>
          </LandingFeatureContent>
        </LandingFeatureWrap>
        <LandingFeatureWrap>
          <LandingFeatureImage src={Ewrb} alt="Top-Tier Security" />
          <LandingFeatureContent>
            <h3 className="animate-on-scroll">Top-Tier Security</h3>
            <p>Advanced encryption to safeguard your digital assets.</p>
          </LandingFeatureContent>
        </LandingFeatureWrap>
        <LandingFeatureWrap>
          <LandingFeatureImage src={Ewrb} alt="Password Protection" />
          <LandingFeatureContent>
            <h3 className="animate-on-scroll">Password Protection</h3>
            <p>Secure access with robust, customizable password options.</p>
          </LandingFeatureContent>
        </LandingFeatureWrap>
        <LandingFeatureWrap>
          <LandingFeatureImage src={Ewrb} alt="Multi-Token" />
          <LandingFeatureContent>
            <h3 className="animate-on-scroll">Multi-Token</h3>
            <p>Store, send, and Stake a wide variety of cryptocurrencies.</p>
          </LandingFeatureContent>
        </LandingFeatureWrap>
        <LandingFeatureWrap>
          <LandingFeatureImage src={Ewrb} alt="Unmatched Safety" />
          <LandingFeatureContent>
            <h3 className="animate-on-scroll">Unmatched Safety</h3>
            <p>Cold storage solutions to keep your funds secure from threats.</p>
          </LandingFeatureContent>
        </LandingFeatureWrap>
        <LandingFeatureWrap>
          <LandingFeatureImage src={Ewrb} alt="Staking+" />
          <LandingFeatureContent>
            <h3 className="animate-on-scroll">Staking+</h3>
            <p>Earn rewards by staking your tokens directly in the wallet.</p>
          </LandingFeatureContent>
        </LandingFeatureWrap>
      </LandingFeaturesWrap>
      <LandingButtonWrapper>
        <LandingButton as="a" href="/auth/signup">Start now</LandingButton>
      </LandingButtonWrapper>
    </LandingFeatureContainer>
  </LandingSection>
);

export default Features;

// region STYLES

const LandingFeatureContainer = styled(LandingContainer)`
  padding: 0 16px;
`;

const FeaturesHeader = styled.div`
  text-align: center;
  margin-bottom: 90px;
  max-width: 800px;
  margin-left: auto;
  margin-right: auto;
`;

const LandingFeaturesWrap = styled.div`
  display: grid;
  grid-template-columns: calc(50% - 32px) calc(50% - 32px);
  max-width: 784px;
  min-width: 768px;
  width: 100%;
  margin-bottom: 92px;
  gap: 64px;

  @media screen and (max-width: 1000px) {
    grid-template-columns: calc(50% - 26px) calc(50% - 26px);
    gap: 64px 51px;
    max-width: 100%;
    min-width: 0px;
  }

  @media screen and (max-width: 767px) {
    grid-template-columns: 100%;
    margin-bottom: 64px;
    gap: 24px;
  }
`;

const LandingFeatureWrap = styled.div`
  display: flex;
  align-items: center;
  gap: 20px;

  @media screen and (max-width: 992px) {
    gap: 24px;
    flex-direction: column;
    text-align: center;
  }
  
  @media screen and (min-width: 992px) {
    gap: 36px;
  }
`;

const LandingFeatureImage = styled.img`
  width: 60px;
  height: 60px;
  flex-shrink: 0;
  object-fit: contain;
  
  @media screen and (max-width: 992px) {
    width: 80px;
    height: 80px;
  }
`;

const LandingFeatureContent = styled.div`
  flex: 1;
  
  h3 {
    margin: 0 0 8px 0;
    color: #ffffff;
  }

  p {
    margin: 0;
    color: #DDDDDD;
    font-size: 14px;
    line-height: 20px;
  }
`;

const LandingFeatureSubtitle = styled.p`
  text-align: center;
  color: #DDDDDD;
  font-size: 14px;
  font-weight: 500;
  margin-bottom: 16px;
  text-transform: uppercase;
  letter-spacing: 1px;
`;

const LandingFeatureMainTitle = styled.h2`
  text-align: center;
  color: #ffffff;
  font-size: 36px;
  font-weight: 700;
  line-height: 44px;
  margin-bottom: 24px;
  
  @media screen and (min-width: 576px) {
    font-size: 48px;
    line-height: 56px;
  }
`;

const LandingFeatureDescription = styled.p`
  text-align: center;
  color: #DDDDDD;
  font-size: 18px;
  line-height: 27px;
  max-width: 600px;
  margin: 0 auto;
`;

const LandingButtonWrapper = styled.div`
  display: flex;
  justify-content: center;
  margin-top: 48px;
`;

// endregion


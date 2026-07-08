import React from 'react';
import { Link } from 'react-router-dom';
import styled from 'styled-components';
import {
  LandingButtonGradient,
  LandingSection,
  LandingContainer,
} from '../BasicLandingElements';

const Purchase = () => (
  <LandingSection>
    <LandingContainer>
      <PurchaseTitle className="animate-on-scroll">
        Ready to Take Control of Your Crypto?
      </PurchaseTitle>
      <PurchaseSubtitle className="animate-on-scroll">
        Sign up for Betabase Wallet today and start managing, securing, and growing your digital assets with confidence. Experience seamless transactions, top-notch security, and a wide range of features designed to help you succeed in the world of cryptocurrency. Take action now and unlock the future of finance!
      </PurchaseSubtitle>
      <LandingButtonGradient as={Link} to="/auth/signup">
        Start now
      </LandingButtonGradient>
    </LandingContainer>
  </LandingSection>
);

export default Purchase;

// region STYLES

const PurchaseTitle = styled.h2`
  text-align: center;
  margin-bottom: 24px;
`;

const PurchaseSubtitle = styled.p`
  text-align: center;
  margin-bottom: 48px;
  max-width: 600px;
  margin-left: auto;
  margin-right: auto;
`;

// endregion


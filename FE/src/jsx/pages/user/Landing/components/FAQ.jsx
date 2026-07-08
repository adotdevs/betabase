import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import styled from 'styled-components';
import {
  LandingContainer,
  LandingSection,
  LandingButtonGradient,
} from '../BasicLandingElements';

const faqData = [
  {
    id: 1,
    question: "What is Betabase Wallet?",
    answer:
      "Betabase Wallet is a secure, easy-to-use platform for managing, sending, and receiving cryptocurrencies. It supports multiple tokens and offers advanced security features to protect your digital assets.",
  },
  {
    id: 2,
    question: "How do I get started?",
    answer:
      "Simply register online or download the Windows app, create an account, and follow the setup instructions. You'll be able to securely store, send, and receive a wide range of cryptocurrencies in just a few steps.",
  },
  {
    id: 3,
    question: "Is my crypto safe in Betabase Wallet?",
    answer:
      "Yes, your crypto is protected with top-level encryption, multi-layer authentication, and cold storage solutions, ensuring maximum security for your digital assets.",
  },
  {
    id: 4,
    question: "What crypto is supported?",
    answer:
      "Betabase Wallet supports a wide variety of cryptocurrencies, including Bitcoin, Ethereum, and many popular altcoins. Check our supported tokens list for the full range of assets you can store and manage.",
  },
  {
    id: 5,
    question: "Can I stake my crypto in Betabase Wallet?",
    answer:
      "Yes, Betabase Wallet offers a simple staking option that allows you to earn rewards by staking your tokens directly within the app. Just choose your desired crypto, and start staking to maximize your returns.",
  },
  {
    id: 6,
    question: "Can I connect my bank account or credit card to Betabase Wallet?",
    answer:
      "Yes, Betabase Wallet allows you to link your bank account or credit card for easy purchasing and transferring of cryptocurrencies. Enjoy a simple, secure way to fund your wallet and manage your assets.",
  },
];

const FAQ = () => {
  const [activeTab, setActiveTab] = useState(null);

  const toggleTab = (tabIndex) => {
    setActiveTab((prev) => (prev === tabIndex ? null : tabIndex));
  };

  return (
    <LandingSection>
      <LandingContainer>
        <FAQHeader>
          <FAQSubtitle className="animate-on-scroll">FAQ</FAQSubtitle>
          <FAQTitle className="animate-on-scroll">Frequently asked questions</FAQTitle>
          <FAQDescription className="animate-on-scroll">
            Check Out Our FAQ for All the Information You Need to Get Started.
          </FAQDescription>
        </FAQHeader>
        <FAQToggleWrapper>
          <FAQToggle>
            {faqData.map((item) => (
              <FAQToggleItem key={item.id}>
                <FAQTabTitle
                  onClick={() => toggleTab(item.id)}
                  className={activeTab === item.id ? 'active' : ''}
                  role="button"
                  tabIndex={0}
                >
                  <FAQQuestionText>{item.question}</FAQQuestionText>
                  <FAQToggleIcon className={activeTab === item.id ? 'active' : ''}>
                    <i className="fas fa-chevron-down" />
                  </FAQToggleIcon>
                </FAQTabTitle>
                <FAQTabContent className={activeTab === item.id ? 'active' : ''}>
                  {item.answer}
                </FAQTabContent>
              </FAQToggleItem>
            ))}
          </FAQToggle>
        </FAQToggleWrapper>
      </LandingContainer>
    </LandingSection>
  );
};

export default FAQ;

// region STYLES

const FAQHeader = styled.div`
  text-align: center;
  margin-bottom: 48px;
`;

const FAQSubtitle = styled.p`
  color: #DDDDDD;
  font-size: 14px;
  font-weight: 500;
  margin-bottom: 16px;
  text-transform: uppercase;
  letter-spacing: 1px;
`;

const FAQTitle = styled.h2`
  color: #ffffff;
  font-size: 36px;
  font-weight: 700;
  line-height: 44px;
  margin-bottom: 16px;
  
  @media screen and (min-width: 576px) {
    font-size: 48px;
    line-height: 56px;
  }
`;

const FAQDescription = styled.p`
  color: #DDDDDD;
  font-size: 16px;
  line-height: 24px;
  max-width: 600px;
  margin: 0 auto;
`;

const FAQToggleWrapper = styled.div`
  margin-top: 48px;
`;

const FAQToggle = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0;
`;

const FAQToggleItem = styled.div`
  border-bottom: 1px solid rgba(221, 221, 221, 0.1);
  
  &:first-of-type {
    border-top: 1px solid rgba(221, 221, 221, 0.1);
  }
`;

const FAQTabTitle = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 0;
  cursor: pointer;
  transition: all 0.3s ease;
  gap: 16px;
  
  @media screen and (max-width: 767px) {
    padding: 15px 0;
  }
`;

const FAQQuestionText = styled.span`
  flex: 1;
  color: #ffffff;
  font-weight: 600;
  font-size: 18px;
  line-height: 27px;
  text-align: left;
  transition: color 0.3s ease;
  
  ${FAQTabTitle}:hover & {
    color: #53C8B7;
  }
  
  ${FAQTabTitle}.active & {
    color: #53C8B7;
  }
  
  @media screen and (max-width: 767px) {
    font-size: 16px;
    line-height: 24px;
  }
`;

const FAQToggleIcon = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  flex-shrink: 0;
  transition: transform 0.3s ease;
  
  i {
    font-size: 14px;
    color: #DDDDDD;
    transition: color 0.3s ease;
  }
  
  &.active {
    transform: rotate(180deg);
    
    i {
      color: #53C8B7;
    }
  }
  
  ${FAQTabTitle}:hover & i {
    color: #53C8B7;
  }
`;

const FAQTabContent = styled.div`
  max-height: 0;
  overflow: hidden;
  transition: max-height 0.3s ease, padding 0.3s ease;
  padding: 0 0;
  color: #DDDDDD;
  font-size: 16px;
  line-height: 24px;
  
  &.active {
    max-height: 500px;
    padding: 0 0 20px 0;
  }
  
  @media screen and (max-width: 767px) {
    font-size: 14px;
    line-height: 20px;
    
    &.active {
      padding: 0 0 15px 0;
    }
  }
`;

// endregion


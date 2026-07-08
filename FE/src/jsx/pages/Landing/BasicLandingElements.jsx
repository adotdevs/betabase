import { Container } from 'react-bootstrap';
import styled from 'styled-components';

// Color constants matching the Landing template
export const colorWhite = '#ffffff';
export const landingLightTextColor = '#DDDDDD';
export const landingDarkTextColor = '#C7CCCF';
export const landingGreenColor = '#53C8B7';
export const landingBackground = '#16161C';
export const landingAccentColor = '#244153';
export const landingGradientBtn = 'linear-gradient(139.48deg, #FEA63E 6.99%, #F03131 53.88%, #ED05AC 99.96%)';

export const LandingContainer = styled(Container)`
  transition: 0.3s;
  display: flex;
  align-items: center;
  flex-direction: column;
  padding-left: 16px;
  box-sizing: border-box;
  padding-right: 16px;

  @media (min-width: 576px) {
    max-width: 540px !important;
    padding-left: 20px;
    padding-right: 20px;
  }

  @media (min-width: 768px) {
    max-width: 720px !important;
    padding-left: 24px;
    padding-right: 24px;
  }

  @media (min-width: 992px) {
    max-width: 960px !important;
    padding-left: 32px;
    padding-right: 32px;
  }

  @media (min-width: 1200px) {
    max-width: 1140px !important;
    padding-left: 40px;
    padding-right: 40px;
  }
`;

export const LandingButton = styled.a`
  padding: 10px 20px;
  display: flex;
  justify-content: center;
  align-items: center;
  background-color: transparent;
  color: ${colorWhite};
  font-size: 14px;
  font-weight: 700;
  line-height: 1;
  border: solid 1px ${colorWhite};
  border-radius: 100px;
  height: 40px;
  transition: 0.3s;
  white-space: nowrap;
  text-decoration: none;
  min-width: 120px;

  @media screen and (min-width: 576px) {
    padding: 12px 24px;
    font-size: 16px;
    height: 44px;
    min-width: 140px;
  }

  &:hover {
    color: ${colorWhite};
    border-radius: 10px;
    cursor: pointer;
  }
`;

export const LandingButtonGradient = styled(LandingButton)`
  background: ${landingGradientBtn};
  color: ${colorWhite};
  border: none;
`;

export const LandingSection = styled.section`
  margin-bottom: 96px;
  position: relative;
 
  @media screen and (min-width: 576px) {
    margin-bottom: 176px;
  }
 
  @media screen and (min-width: 992px) {
    margin-bottom: 150px;
  }
`;


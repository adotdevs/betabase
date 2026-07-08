import React, { useEffect, useState } from 'react';
import styled from 'styled-components';
import { Link } from 'react-router-dom';
import LogoNew from '../../../../../assets/newlogo/logo.png';

const Menu = () => {
  const [active, setActive] = useState(false);

  const changeBackground = () => {
    if (window.scrollY >= 1) {
      setActive(true);
    } else {
      setActive(false);
    }
  };

  useEffect(() => {
    window.addEventListener('scroll', changeBackground);

    return () => window.removeEventListener('scroll', changeBackground);
  }, []);

  return (
    <LandingMenuWrap active={active}>
      <LandingMenuContainer>
        <LandingMenuLogoWrap as={Link} to="/">
          <img src={LogoNew} alt="Betabase Logo"  />
        </LandingMenuLogoWrap>
        <LandingMenuNav>
          <LandingNavButton as={Link} to="/auth/signup">
            Sign Up
          </LandingNavButton>
          <LandingHireUsButton as={Link} to="/auth/login">
            Sign In
          </LandingHireUsButton>
        </LandingMenuNav>
      </LandingMenuContainer>
    </LandingMenuWrap>
  );
};

export default Menu;

// region STYLES

const LandingMenuWrap = styled.div`
  position: fixed;
  width: 100%;
  z-index: 10;
  transition: 0.3s;
  background: ${props => (props.active ? 'rgba(255, 255, 255, 0.11)' : 'transparent')};
  backdrop-filter: ${props => (props.active ? 'blur(5px)' : 'none')};
`;

const LandingMenuContainer = styled.div`
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  max-width: 1200px;
  margin: 0 auto;
  box-sizing: border-box;
  
  @media screen and (min-width: 768px) {
    padding: 20px 32px;
  }
`;

const LandingMenuLogoWrap = styled(Link)`
  display: flex;
  align-items: center;
  
  
img {
height: 90px;}
  @media screen and (max-width: 576px) {
    img {
      height: 60px;
    }
  }
`;

const LandingMenuNav = styled.nav`
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  align-items: center;
  gap: 12px;
  
  @media screen and (min-width: 576px) {
    gap: 16px;
  }
`;

const LandingNavButton = styled(Link)`
  padding: 10px 20px;
  display: flex;
  justify-content: center;
  align-items: center;
  background: linear-gradient(139.48deg, #FEA63E 6.99%, #F03131 53.88%, #ED05AC 99.96%);
  color: #ffffff;
  font-size: 13px;
  font-weight: 700;
  line-height: 1;
  border: none;
  border-radius: 100px;
  height: 38px;
  transition: 0.3s;
  white-space: nowrap;
  text-decoration: none;
  min-width: 100px;
  font-family: 'Poppins', sans-serif;
  
  @media screen and (min-width: 576px) {
    padding: 12px 24px;
    font-size: 14px;
    height: 42px;
    min-width: 120px;
  }
`;

const LandingHireUsButton = styled(Link)`
  padding: 10px 20px;
  display: none;
  justify-content: center;
  align-items: center;
  background-color: transparent;
  color: #ffffff;
  font-size: 13px;
  font-weight: 700;
  line-height: 1;
  border: solid 1px #ffffff;
  border-radius: 100px;
  height: 38px;
  transition: 0.3s;
  white-space: nowrap;
  text-decoration: none;
  min-width: 100px;
  font-family: 'Poppins', sans-serif;
  
  @media screen and (min-width: 576px) {
    display: flex;
    padding: 12px 24px;
    font-size: 14px;
    height: 42px;
    min-width: 120px;
  }
`;

// endregion


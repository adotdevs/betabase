import styled from 'styled-components';
import noiseBg from '../../../../assets/noise_bg.png';

// Landing page color constants
const landingBackground = '#16161C';
const landingLightTextColor = '#DDDDDD';
const colorWhite = '#ffffff';

export const LandingHomeWrapper = styled.div`
  font-family: 'Poppins', sans-serif;
  width: 100%;
  background: ${landingBackground};
  background-image: url(${noiseBg});
  position: relative;
  z-index: 0;
  overflow-x: hidden;
  min-height: 100vh;

  h1 {
    color: ${colorWhite};
    font-weight: 700;
    font-size: 36px;
    line-height: 40px;
  };
  
  h2 {
    color: ${colorWhite};
    font-weight: 700;
    font-size: 36px;
    line-height: 44px;
  };

  h3 {
    font-weight: 600;
    font-size: 18px;
    line-height: 27px;
    color: ${landingLightTextColor};
  };

  h4 {
    color: ${colorWhite};
  }

  h5 {
    color: ${colorWhite};
  }

  p {
    color: ${landingLightTextColor};
  };

  a {
    color: ${landingLightTextColor};
    
    &:hover {
      color: ${colorWhite};
      opacity: 0.8;
    }
  }

  .animate-on-scroll {
    opacity: 0;

    &.scrolled {
      opacity: 1;

      .line {
        overflow: hidden;
        white-space: nowrap;

        &:last-child {
          animation-delay: 0.1s;
        }
      }

      .word {
        opacity: 0;
        animation: slide-in 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94);
        animation-fill-mode: forwards;
      }
    }
  }

  @keyframes slide-in {
    from {
      transform: translateY(40px);
      opacity: 0;
    }

    to {
      transform: translateY(0);
      opacity: 1;
    }
  }
  
  @media screen and (min-width: 576px) {
    
    h1 {
      font-size: 60px;
      line-height: 70px;
    }
  }

  /* Elementor widget styling */
  .elementor-widget-text-editor,
  .elementor-widget-heading,
  .textwidget {
    color: ${landingLightTextColor};
  }

  .elementor-heading-title {
    color: ${colorWhite};
  }

  .elementor-widget-text-editor div,
  .elementor-widget-container {
    color: ${landingLightTextColor};
  }

  .elementor-widget-heading h1,
  .elementor-widget-heading h2,
  .elementor-widget-heading h3,
  .elementor-widget-heading h4 {
    color: ${colorWhite};
  }

  /* Button gradient styles */
  .elementor-button.elementor-animation-float {
    background: linear-gradient(139.48deg, #FEA63E 6.99%, #F03131 53.88%, #ED05AC 99.96%);
    border: none;
    color: ${colorWhite};
    transition: 0.3s;

    &:hover {
      background: linear-gradient(139.48deg, #FB9E48 6.99%, #D84B43 53.88%, #971F49 99.96%);
      opacity: 0.9;
    }
  }

  /* Background overlays */
  .elementor-background-overlay {
    background: transparent;
  }

  .elementor-section[data-settings*="gradient"] .elementor-background-overlay,
  .elementor-section[data-settings*='"background_background":"gradient"'] .elementor-background-overlay {
    background: linear-gradient(228deg, rgba(127, 244, 222, 0.95), rgba(56, 199, 225, 1));
    opacity: 0.1;
  }

  .elementor-section[data-settings*='"background_background":"classic"'] {
    background: transparent;
  }

  /* Navigation */
  .primary-menu,
  .navbar {
    background: transparent !important;
  }

  /* Footer */
  footer,
  #site-footer {
    background: transparent;
  }

  .footer-bg {
    background: transparent;
  }

  .footer-copyright,
  .widget-title {
    color: ${landingLightTextColor};
  }

  /* Toggle/FAQ */
  .elementor-toggle-title {
    color: ${landingLightTextColor};
  }

  .elementor-tab-content {
    color: ${landingLightTextColor};
  }

  .elementor-tab-title {
    color: ${landingLightTextColor};
    border-bottom-color: rgba(221, 221, 221, 0.2);
  }

  /* Image box */
  .elementor-image-box-title {
    color: ${colorWhite};
  }

  .elementor-image-box-description {
    color: ${landingLightTextColor};
  }

  /* Ensure all sections maintain landing colors */
  .elementor-section,
  .elementor-column,
  .elementor-widget-wrap {
    color: inherit;
  }
`;

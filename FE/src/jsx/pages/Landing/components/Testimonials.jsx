import React from 'react';
import styled from 'styled-components';
import { LandingContainer, LandingSection } from '../BasicLandingElements';

const reviewsData = [
  {
    id: 1,
    name: "Rafael Koenig",
    review: "I had an issue verifying my wallet, and the support team solved it right away. Betabase's service is unmatched.",
    rating: 5,
  },
  {
    id: 2,
    name: "Sophie Navarro",
    review: "Fast, transparent, and effortless. Swapping crypto on Betabase feels smoother than any other platform I've used.",
    rating: 5,
  },
  {
    id: 3,
    name: "Daniel Hayes",
    review: "I was hesitant to move my assets to a new wallet, but Betabase exceeded expectations. Reliable, secure, and simple to use.",
    rating: 5,
  },
  {
    id: 4,
    name: "Priya Malhotra",
    review: "It's refreshing to see a wallet that actually puts users first. Betabase's design and speed make crypto fun again.",
    rating: 5,
  },
  {
    id: 5,
    name: "Jorge Mendes",
    review: "Transferred funds between exchanges in seconds. No hidden fees, no stress — Betabase does exactly what it promises.",
    rating: 5,
  },
  {
    id: 6,
    name: "Ella Carrington",
    review: "I love how intuitive everything feels. Managing different coins is easy, and I always feel in control with Betabase.",
    rating: 5,
  },
  {
    id: 7,
    name: "Mia Laurent",
    review: "Betabase gave me complete confidence in managing my assets. Everything is clear, secure, and incredibly efficient. Couldn't ask for a better wallet experience.",
    rating: 5,
  },
  {
    id: 8,
    name: "Liam Chen",
    review: "From deposits to daily transactions, Betabase delivers consistent reliability. Fast performance, solid security, and a platform I actually enjoy using.",
    rating: 5,
  },
];

const getInitials = (name) => {
  const parts = name.split(" ");
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
};

const getAvatarColor = (index) => {
  const colors = [
    "#3B82F6", // blue
    "#8B5CF6", // purple
    "#10B981", // green
    "#F59E0B", // yellow
    "#EF4444", // red
    "#EC4899", // pink
  ];
  return colors[index % colors.length];
};

const Testimonials = () => (
  <LandingSection>
    <LandingContainer>
      <TestimonialHeaderWrap>
        <h2 className="animate-on-scroll">Customer Reviews</h2>
      </TestimonialHeaderWrap>
      <TestimonialsWrap>
        {reviewsData.map((review) => (
          <TestimonialCard key={review.id}>
            <TestimonialCardHeader>
              <AvatarCircle color={getAvatarColor(review.id - 1)}>
                {getInitials(review.name)}
              </AvatarCircle>
              <TestimonialCardInfo>
                <TestimonialCardName>{review.name}</TestimonialCardName>
                <TestimonialCardStars>
                  {[...Array(5)].map((_, i) => (
                    <StarIcon
                      key={i}
                      className="fas fa-star"
                      active={i < review.rating}
                    />
                  ))}
                </TestimonialCardStars>
              </TestimonialCardInfo>
            </TestimonialCardHeader>
            <TestimonialCardReview>
              {review.review}
            </TestimonialCardReview>
          </TestimonialCard>
        ))}
      </TestimonialsWrap>
    </LandingContainer>
  </LandingSection>
);

export default Testimonials;

// region STYLES

const TestimonialHeaderWrap = styled.div`
  margin-bottom: 50px;
  text-align: center;
  
  h2 {
    color: #ffffff;
    font-size: 36px;
    font-weight: 700;
    margin: 0;
  }
  
  @media screen and (min-width: 576px) {
    margin-bottom: 60px;
  }
`;

const TestimonialsWrap = styled.div`
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 24px;
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
  
  @media screen and (max-width: 1024px) {
    grid-template-columns: repeat(2, 1fr);
  }
  
  @media screen and (max-width: 600px) {
    grid-template-columns: 1fr;
  }
`;

const TestimonialCard = styled.div`
//   background-color: #1a1a3a;
  border-radius: 16px;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  transition: transform 0.3s ease, box-shadow 0.3s ease;
  
  &:hover {
    transform: translateY(-4px);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
  }
`;

const TestimonialCardHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
`;

const AvatarCircle = styled.div`
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background-color: ${props => props.color};
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  font-size: 18px;
  font-weight: 600;
  flex-shrink: 0;
`;

const TestimonialCardInfo = styled.div`
  flex: 1;
`;

const TestimonialCardName = styled.h3`
  color: #ffffff;
  font-size: 16px;
  font-weight: 600;
  margin: 0 0 4px 0;
`;

const TestimonialCardStars = styled.div`
  display: flex;
  gap: 4px;
`;

const StarIcon = styled.i`
  font-size: 14px;
  color: ${props => props.active ? "#FFD700" : "#4a5568"};
`;

const TestimonialCardReview = styled.p`
  color: #e2e8f0;
  font-size: 14px;
  line-height: 1.6;
  margin: 0;
`;

// endregion


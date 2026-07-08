// Optional: Install split-type for advanced text animations
// npm install split-type
let SplitType;
try {
  SplitType = require('split-type');
} catch (e) {
  // split-type not installed, animations will work without text splitting
  console.log('split-type not installed, using basic animations');
}

export const splitText = () => {
  if (SplitType) {
    const scrollElements = document.querySelectorAll('.animate-on-scroll');
    scrollElements.forEach(el => {
      try {
        new SplitType(el, {
          split: 'words, lines',
        });
      } catch (e) {
        // Element might already be split or not suitable
      }
    });
  }
  // If split-type is not available, animations will still work via CSS
};

const elementInView = (el, dividend = 1) => {
  const elementTop = el.getBoundingClientRect().top;

  return (
    elementTop
    <= (window.innerHeight || document.documentElement.clientHeight) / dividend
  );
};

const displayScrollElement = (element) => {
  element.classList.add('scrolled');
};

export default () => {
  const scrollElements = document.querySelectorAll('.animate-on-scroll');
  scrollElements.forEach((el) => {
    if (elementInView(el, 1.25)) {
      displayScrollElement(el);
    }
  });
};


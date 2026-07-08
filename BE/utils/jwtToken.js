// create cookie with token in a function, taking arguments from controller
const jwtToken = (user, statusCode, res, req) => {
  const token = user.generateToken();

  const origin = req.headers.origin || req.headers.referer || '';
  const host = req.hostname || '';

  // Treat localhost/127.0.0.1 as development for cookie behavior,
  // even if NODE_ENV is set to "production" in the env file.
  const isLocalhost =
    host === 'localhost' ||
    host === '127.0.0.1' ||
    (origin && (origin.includes('localhost') || origin.includes('127.0.0.1')));

  const isProd = process.env.NODE_ENV === 'production' && !isLocalhost;

  // Only use Secure cookies when we're not on localhost
  const secure =
    !isLocalhost && (isProd || process.env.COOKIE_SECURE === 'true');
  const sameSite = secure ? 'None' : 'Lax';

  // Determine cookie domain based on request origin (production only)
  let cookieDomain = undefined;

  if (isProd) {
    if (origin.includes('betabase.pro')) {
      cookieDomain = '.betabase.pro';
    } else if (process.env.COOKIE_DOMAIN) {
      cookieDomain = process.env.COOKIE_DOMAIN; 
    }
  }

  // Clear any existing cookies with different domains first
  res.clearCookie('jwttoken', { path: '/' });
  res.clearCookie('jwttoken', { path: '/', domain: '.betabase.pro' }); 

  const options = {
    expires: new Date(
      Date.now() + process.env.TOKEN_EXPIRE * 24 * 60 * 60 * 1000
    ),
    httpOnly: true,
    sameSite,
    secure,
    path: '/',
    domain: cookieDomain,
  };

  console.log('🍪 Cookie options:', { domain: cookieDomain, sameSite, secure });

  res.status(statusCode).cookie('jwttoken', token, options).json({
    success: true,
    token,
    user,
    link: false,
  });
};

module.exports = jwtToken;

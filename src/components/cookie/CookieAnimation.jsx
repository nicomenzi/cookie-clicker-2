// src/components/cookie/CookieAnimation.jsx
import React from 'react';

const CookieAnimation = ({ cookies }) => {
  return (
    <>
      {cookies.map(cookie => (
        <div 
          key={cookie.id}
          className="absolute text-3xl animate-bounce opacity-70"
          style={{
            left: cookie.x - 16,
            top: cookie.y - 16,
            animation: 'float 1s forwards'
          }}
        >
          🍪
        </div>
      ))}
    </>
  );
};

export default CookieAnimation;
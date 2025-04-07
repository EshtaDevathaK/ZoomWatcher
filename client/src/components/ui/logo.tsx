import React from 'react';

interface LogoProps {
  className?: string;
}

export function Logo({ className = "" }: LogoProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="50" cy="50" r="45" fill="#3B82F6" />
      <circle cx="50" cy="50" r="35" fill="#1E40AF" />
      <circle cx="50" cy="50" r="25" fill="#172554" />
      <rect x="35" y="35" width="30" height="30" rx="5" fill="white" />
      <circle cx="50" cy="50" r="8" fill="#3B82F6" />
      <circle cx="33" cy="33" r="5" fill="#10B981" />
      <circle cx="67" cy="33" r="5" fill="#10B981" />
      <circle cx="33" cy="67" r="5" fill="#10B981" />
      <circle cx="67" cy="67" r="5" fill="#10B981" />
    </svg>
  );
}

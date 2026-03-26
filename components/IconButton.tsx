
import React from 'react';

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  iconClassName: string;
  label?: string; // For accessibility
  size?: 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
}

const IconButton: React.FC<IconButtonProps> = ({ iconClassName, label, size = 'md', variant = 'primary', className, ...props }) => {
  const sizeClasses = {
    sm: 'p-1.5 text-sm',
    md: 'p-2 text-base',
    lg: 'p-3 text-lg',
    xl: 'p-4 text-xl'
  };

  const variantClasses = {
    primary: 'bg-blue-600 hover:bg-blue-700 text-white focus:ring-blue-500',
    secondary: 'bg-gray-600 hover:bg-gray-700 text-white focus:ring-gray-500',
    danger: 'bg-red-600 hover:bg-red-700 text-white focus:ring-red-500',
    ghost: 'bg-transparent hover:bg-gray-700 text-gray-300 focus:ring-gray-500',
  };

  return (
    <button
      type="button"
      aria-label={label}
      className={`rounded-full inline-flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 transition-colors duration-150 ${sizeClasses[size]} ${variantClasses[variant]} ${className || ''}`}
      {...props}
    >
      <i className={iconClassName}></i>
      {label && <span className="sr-only">{label}</span>}
    </button>
  );
};

export default IconButton;

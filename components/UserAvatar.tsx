import React, { useState } from 'react';

interface UserAvatarProps {
    src: string | null | undefined;
    alt?: string;
    size?: 'sm' | 'md' | 'lg';
    className?: string;
}

const sizeClasses = {
    sm: 'w-7 h-7 sm:w-8 sm:h-8',
    md: 'w-10 h-10',
    lg: 'w-12 h-12',
};

const iconSizes = {
    sm: 'w-4 h-4 sm:w-5 sm:h-5',
    md: 'w-6 h-6',
    lg: 'w-8 h-8',
};

export const UserAvatar: React.FC<UserAvatarProps> = ({ 
    src, 
    alt = 'User', 
    size = 'md',
    className = '' 
}) => {
    const [imageError, setImageError] = useState(false);
    const [imageLoaded, setImageLoaded] = useState(false);

    // If no src or image error, show SVG icon
    if (!src || imageError) {
        return (
            <div className={`${sizeClasses[size]} rounded-full border border-gray-600 flex items-center justify-center bg-gray-700 ${className}`}>
                <svg className={`${iconSizes[size]} text-gray-400`} fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd"/>
                </svg>
            </div>
        );
    }

    return (
        <img 
            src={src} 
            alt={alt} 
            className={`${sizeClasses[size]} rounded-full border border-gray-600 ${className}`}
            onError={() => setImageError(true)}
            onLoad={() => setImageLoaded(true)}
            style={{ display: imageLoaded ? 'block' : 'none' }}
        />
    );
};


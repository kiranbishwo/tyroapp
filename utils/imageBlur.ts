/**
 * Apply Gaussian blur to an image data URL
 * @param dataUrl - Base64 image data URL
 * @param blurRadius - Blur radius in pixels (default: 10)
 * @returns Blurred image as data URL
 */
export const applyBlurToImage = (dataUrl: string, blurRadius: number = 10): Promise<string> => {
    return new Promise((resolve, reject) => {
        try {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                
                if (!ctx) {
                    reject(new Error('Could not get canvas context'));
                    return;
                }
                
                canvas.width = img.width;
                canvas.height = img.height;
                
                // Apply blur using CSS filter (simpler approach)
                // For more advanced blur, we could use multiple passes or WebGL
                ctx.filter = `blur(${blurRadius}px)`;
                ctx.drawImage(img, 0, 0);
                
                // Convert back to data URL
                const blurredDataUrl = canvas.toDataURL('image/png');
                resolve(blurredDataUrl);
            };
            
            img.onerror = () => {
                reject(new Error('Failed to load image for blur'));
            };
            
            img.src = dataUrl;
        } catch (error) {
            reject(error);
        }
    });
};

/**
 * Apply multiple blur passes for stronger blur effect
 * @param dataUrl - Base64 image data URL
 * @param intensity - Blur intensity: 'light' (5px), 'medium' (15px), 'heavy' (30px)
 * @returns Blurred image as data URL
 */
export const applyBlurWithIntensity = async (dataUrl: string, intensity: 'light' | 'medium' | 'heavy' = 'medium'): Promise<string> => {
    const blurMap = {
        light: 5,
        medium: 15,
        heavy: 30
    };
    
    const blurRadius = blurMap[intensity];
    let blurred = dataUrl;
    
    // Apply multiple passes for stronger blur
    const passes = intensity === 'heavy' ? 2 : 1;
    for (let i = 0; i < passes; i++) {
        blurred = await applyBlurToImage(blurred, blurRadius);
    }
    
    return blurred;
};

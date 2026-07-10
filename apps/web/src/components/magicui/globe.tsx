'use client';

import { useEffect, useRef } from 'react';
import createGlobe from 'cobe';

export default function Globe({ className = '' }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let phi = 0;
    let width = 0;

    const onResize = () => {
      if (canvasRef.current) {
        width = canvasRef.current.offsetWidth;
      }
    };
    window.addEventListener('resize', onResize);
    onResize();

    let globe: any;

    if (canvasRef.current) {
      globe = createGlobe(canvasRef.current, {
        devicePixelRatio: 2,
        width: width * 2,
        height: width * 2,
        phi: 0,
        theta: 0.3,
        dark: 0, // Light theme globe matching the white page background
        diffuse: 1.2,
        mapSamples: 16000,
        mapBrightness: 6,
        baseColor: [0.35, 0.35, 0.4], // Grey dots for visible landmass on light background
        markerColor: [0.93, 0.15, 0.47], // Pink markers matching Influnet branding
        glowColor: [1, 1, 1], // Pure white glow to blend with background
        markers: [
          // Latitudes & Longitudes of global creator hubs
          { location: [37.7595, -122.4367], size: 0.06 }, // San Francisco
          { location: [40.7128, -74.006], size: 0.06 },   // New York
          { location: [51.5074, -0.1278], size: 0.06 },   // London
          { location: [35.6762, 139.6503], size: 0.06 },  // Tokyo
          { location: [-33.8688, 151.2093], size: 0.06 }, // Sydney
          { location: [19.076, 72.8777], size: 0.08 },    // Mumbai
          { location: [12.9716, 77.5946], size: 0.08 },   // Bengaluru
          { location: [28.6139, 77.209], size: 0.08 },    // New Delhi
        ],
        onRender: (state: any) => {
          phi += 0.005;
          state.phi = phi;
          state.width = width * 2;
          state.height = width * 2;
        },
      } as any);
    }

    return () => {
      globe?.destroy();
      window.removeEventListener('resize', onResize);
    };
  }, []);

  return (
    <div className={`relative flex items-center justify-center overflow-visible aspect-square w-full max-w-[450px] mx-auto ${className}`}>
      <canvas
        ref={canvasRef}
        className="w-full h-full opacity-100"
        style={{
          width: '100%',
          height: '100%',
          contain: 'layout paint size',
        }}
      />
    </div>
  );
}

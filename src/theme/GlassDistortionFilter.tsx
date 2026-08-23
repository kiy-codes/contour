/** Hidden SVG filter def referenced by the "glass" theme's --glass-blur
 * token (backdrop-filter: url(#glass-distortion) blur(...)) — feTurbulence
 * generates organic noise, feDisplacementMap uses it to warp the backdrop
 * pixels at the edges, which is what actually reads as refraction rather
 * than a flat blur. Purely decorative, zero layout footprint. */
export default function GlassDistortionFilter() {
  return (
    <svg aria-hidden="true" style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }}>
      <filter id="glass-distortion" x="-20%" y="-20%" width="140%" height="140%">
        <feTurbulence type="fractalNoise" baseFrequency="0.009 0.012" numOctaves="2" seed="7" result="noise" />
        <feGaussianBlur in="noise" stdDeviation="2.5" result="softNoise" />
        <feDisplacementMap in="SourceGraphic" in2="softNoise" scale="16" xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </svg>
  );
}

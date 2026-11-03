import React from 'react'

/**
 * KDIGI CMS full wordmark. Two static SVGs (brand blue + white) swap with the
 * Payload theme via CSS (`.kdigi-logo--dark` is shown only under
 * `[data-theme="dark"]`, see custom.css).
 */
export const Logo: React.FC = () => (
  <span className="kdigi-logo-wrap">
    {/* eslint-disable-next-line @next/next/no-img-element -- static admin identity, no image optimizer dependency */}
    <img className="kdigi-logo kdigi-logo--light" src="/brand/kdigi-logo.svg" width={296} height={78} alt="KDIGI CMS" />
    {/* eslint-disable-next-line @next/next/no-img-element -- static admin identity, no image optimizer dependency */}
    <img className="kdigi-logo kdigi-logo--dark" src="/brand/kdigi-logo-white.svg" width={296} height={78} alt="" aria-hidden="true" />
  </span>
)

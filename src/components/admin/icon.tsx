import React from 'react'

/** KDIGI mark (square). Used in the compact sidebar, header and login panel. */
export const Icon: React.FC = () => (
  // eslint-disable-next-line @next/next/no-img-element -- small static identity with reserved dimensions
  <img className="kdigi-icon" src="/brand/kdigi-mark.svg" width={74} height={74} alt="KDIGI CMS" />
)

import type { BrandKit } from '../lib/brandKit';

/**
 * Ontario Tech University.
 * Colours: primary palette (Future Blue, Simcoe Blue, Tech Tangerine) used at full
 * strength with plenty of white, as the brand standards ask. Tech Tangerine is kept
 * for accents. Font: Ubuntu, the university's primary typeface (on Google Fonts).
 */
export const ontarioTech: BrandKit = {
  id: 'ontario-tech',
  name: 'Ontario Tech University',
  palette: {
    name: 'Ontario Tech University',
    primary: '#003c71', // Future Blue, PMS 541 C
    secondary: '#0077ca', // Simcoe Blue, PMS 3005 C
    accent: '#e75d2a', // Tech Tangerine, PMS 1645 C
    background: '#ffffff',
    surface: '#eef1f4', // a near-white panel colour, so section cards stay mostly white
    text: '#1d1d1d',
  },
  headingFont: 'Ubuntu',
  bodyFont: 'Ubuntu',
  logos: [],
  source: 'https://brand.ontariotechu.ca/guidelines/brand-standards/colours-design-graphics-and-fonts/colours.php',
};

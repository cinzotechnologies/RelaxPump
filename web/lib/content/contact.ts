// Contact info (docs/website-brief.md §2.9). Seed values; D1 `content` overrides them from W5.
export type Contact = {
  company: string;
  phone: string; // display form
  phoneTel: string; // E.164 for tel:
  email: string;
  address: string;
  website: string; // without scheme
  playUrl: string;
  appStoreUrl: string;
};

export const DEFAULT_CONTACT: Contact = {
  company: 'Chhinlung Zofa Technologies Private Limited',
  phone: '+91 98632 62589',
  phoneTel: '+919863262589',
  email: 'cinzotechnologies@gmail.com',
  address: 'Chala Road, Luangmual',
  website: 'cinzotechnologies.com',
  playUrl: 'https://play.google.com/store/apps/details?id=com.cinzo.relaxpump',
  appStoreUrl: '/#download',
};
